// Load environment variables from .env file
require('dotenv').config();

// When packaged with pkg, some libraries (like axios) use dynamic requires that
// pkg can't statically detect. Force-include axios's node entry so it is
// embedded in the snapshot and available at runtime.
if (typeof process.pkg !== 'undefined') {
  try {
    require('axios/dist/node/axios.cjs');
  } catch (e) {
    // ignore - if axios not installed or path differs, normal require('axios') will work
  }
}

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const { runAutomation } = require('./src/main/automation');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Determine a writable project root when running inside a pkg snapshot.
// When packaged, __dirname points to a read-only snapshot (C:\snapshot\...), so
// create files next to the executable (process.execPath).
const isPackaged = typeof process.pkg !== 'undefined';
const projectRoot = isPackaged ? path.dirname(process.execPath) : __dirname;
// expose for other modules that might read process.env.PROJECT_ROOT
process.env.PROJECT_ROOT = projectRoot;

// multer destination must be writable; use projectRoot/uploads
const upload = multer({ dest: path.join(projectRoot, 'uploads') });

// Store connected WebSocket clients
const clients = new Set();

// Middlewares
app.use(cors()); // allow cross-origin calls (useful for testing)
app.use(express.json({ limit: '5mb' })); // parse application/json
app.use(express.urlencoded({ extended: true, limit: '5mb' })); // parse form bodies

// Serve static files from public directory (use projectRoot when packaged)
app.use(express.static(path.join(projectRoot, 'public')));

const logger = require('./src/lib/logger');

// simple request logger for debugging (console + file)
app.use((req, res, next) => {
  const line = `${new Date().toISOString()} ${req.method} ${req.path}`;
  console.log(line);
  try { logger.info(line); } catch (e) {}
  next();
});

// simple health
app.get('/health', (req, res) => res.json({ ok: true }));

// Accept POST requests from Java `LoginApi` (JSON body with login fields)
app.post('/api/v1/login', async (req, res) => {
  try {
    // support both raw JSON body and urlencoded JSON string in `payload`
    const loginRequest = req.body || {};
    console.log('Received /api/v1/login payload:', loginRequest);
    console.log('📊 baseBetAmount from request:', loginRequest.baseBetAmount, 'type:', typeof loginRequest.baseBetAmount);
    console.log('📊 betAmounts from request:', loginRequest.betAmounts);
    console.log('📊 initialBalance from request:', loginRequest.initialBalance, 'type:', typeof loginRequest.initialBalance);
    console.log('👻 headlessMode from request:', loginRequest.headlessMode, 'type:', typeof loginRequest.headlessMode);
    console.log('📊 showStatsOnScreen from request:', loginRequest.showStatsOnScreen, 'type:', typeof loginRequest.showStatsOnScreen);

    // Parse betAmounts array nếu có, nếu không sử dụng mặc định
    const betAmounts = Array.isArray(loginRequest.betAmounts) && loginRequest.betAmounts.length === 5
      ? loginRequest.betAmounts.map(amt => parseInt(amt) || 500)
      : [10000, 13000, 25000, 53000, 50000];

    const payload = {
      url: loginRequest.url || 'https://v.hit.club/',
      loginRequest: loginRequest,
      actions: loginRequest.actions || [],
      joinGameXoc: loginRequest.joinGameXoc !== undefined ? loginRequest.joinGameXoc : true, // Default to true
      enableWebSocketHook: loginRequest.enableWebSocketHook !== undefined ? loginRequest.enableWebSocketHook : true, // Default to true
      showStatsOnScreen: loginRequest.showStatsOnScreen !== undefined ? loginRequest.showStatsOnScreen : true, // Default to true
      headlessMode: loginRequest.headlessMode !== undefined ? loginRequest.headlessMode : true, // Default to true
      betAmounts: betAmounts, // Mảng 5 mức tiền cược
      baseBetAmount: parseInt(loginRequest.baseBetAmount) || betAmounts[0], // Convert to number and default to first bet amount
      initialBalance: parseInt(loginRequest.initialBalance) || 0, // Convert to number and default 0
      proxyHost: loginRequest.proxyHost,
      proxyPort: loginRequest.proxyPort,
      proxyUser: loginRequest.proxyUser,
      proxyPassword: loginRequest.proxyPass,
      sessionId: loginRequest.sessionId || `session-${Date.now()}` // Use client sessionId or generate new one
    };
    
    console.log('📦 Final payload betAmounts:', payload.betAmounts);
    console.log('📦 Final payload baseBetAmount:', payload.baseBetAmount, 'type:', typeof payload.baseBetAmount);
    console.log('📦 Final payload initialBalance:', payload.initialBalance, 'type:', typeof payload.initialBalance);
    console.log('📦 Final payload sessionId:', payload.sessionId);

    // fire-and-forget: run automation asynchronously. Avoid printing full result to console.
    runAutomation(payload, [])
      .then(result => {
        // small summary only
        try {
          const summary = {
            flows: result.results ? result.results.map(r => r.flow || (r.action && r.action.type) || 'action') : [],
            stepsLogged: Array.isArray(result.logs) ? result.logs.length : 0
          };
          console.log('Automation finished for /api/v1/login - summary:', summary);
        } catch (e) {
          console.log('Automation finished for /api/v1/login');
        }
      })
      .catch(err => console.error('Automation error for /api/v1/login:', err));

    return res.json({ ok: true, received: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ===== WEBSOCKET HANDLER =====
wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');
  clients.add(ws);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'log',
    level: 'info',
    message: 'Connected to Puppeteer Automation Server'
  }));
  
  // Handle incoming messages from client
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle pause betting command
      if (message.type === 'pause-betting') {
        const sessionId = message.sessionId;
        console.log(`⏸️ Received PAUSE BETTING command from client for session: ${sessionId}`);
        
        if (sessionId) {
          // Initialize session pause flags if not exists
          if (!global.sessionPauseFlags) {
            global.sessionPauseFlags = {};
          }
          global.sessionPauseFlags[sessionId] = true;
          
          // Broadcast CHỈ đến session này
          const sessionManager = require('./src/main/session_manager');
          sessionManager.broadcastToSession(sessionId, {
            type: 'log',
            level: 'warning',
            message: '⏸️ Đã tạm dừng đặt cược. Bấm "Tiếp tục" để đặt cược lại.'
          });
          
          console.log(`✓ Set pause flag for session: ${sessionId}`);
        } else {
          console.warn(`⚠️ Received PAUSE command without sessionId - ignoring`);
        }
      }
      
      // Handle resume betting command
      if (message.type === 'resume-betting') {
        const sessionId = message.sessionId;
        console.log(`▶️ Received RESUME BETTING command from client for session: ${sessionId}`);
        
        if (sessionId) {
          // Remove pause flag
          if (global.sessionPauseFlags) {
            delete global.sessionPauseFlags[sessionId];
          }
          
          // Broadcast CHỈ đến session này
          const sessionManager = require('./src/main/session_manager');
          sessionManager.broadcastToSession(sessionId, {
            type: 'log',
            level: 'success',
            message: '▶️ Đã tiếp tục đặt cược.'
          });
          
          console.log(`✓ Removed pause flag for session: ${sessionId}`);
        } else {
          console.warn(`⚠️ Received RESUME command without sessionId - ignoring`);
        }
      }
      
      // Handle stop automation command (legacy - for full stop)
      if (message.type === 'stop-automation') {
        const sessionId = message.sessionId;
        console.log(`⛔ Received STOP command from client for session: ${sessionId}`);
        
        // CHỈ xử lý khi có sessionId - không hỗ trợ stop global nữa
        if (sessionId) {
          // Initialize session stop flags if not exists
          if (!global.sessionStopFlags) {
            global.sessionStopFlags = {};
          }
          global.sessionStopFlags[sessionId] = true;
          
          // Broadcast CHỈ đến session này (message sẽ có sessionId)
          const sessionManager = require('./src/main/session_manager');
          sessionManager.broadcastToSession(sessionId, {
            type: 'log',
            level: 'warning',
            message: '🛑 Đã nhận lệnh DỪNG cho session này. Automation sẽ dừng sau khi hoàn thành tác vụ hiện tại.'
          });
          
          console.log(`✓ Set stop flag for session: ${sessionId}`);
        } else {
          // Log warning - không stop nếu không có sessionId
          console.warn(`⚠️ Received STOP command without sessionId - ignoring`);
        }
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err.message);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    clients.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// ===== BROADCAST FUNCTION =====
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error('Error sending to client:', error);
      }
    }
  });
}

// Export broadcast function for use in automation
global.broadcastToClients = broadcast;

// ===== HOME PAGE =====
app.get('/', (req, res) => {
  res.sendFile(path.join(projectRoot, 'public', 'index.html'));
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const startup = [
    '\n========================================',
    `🚀 Server running on http://localhost:${PORT}`,
    `📊 Monitor UI: http://localhost:${PORT}`,
    `📡 WebSocket: ws://localhost:${PORT}`,
    `🔌 API: http://localhost:${PORT}/api/v1/login`,
    '========================================\n'
  ].join('\n');
  console.log(startup);
  try { logger.info(startup); } catch (e) {}
});
