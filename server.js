// Load environment variables from .env file
require('dotenv').config();

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
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

// Store connected WebSocket clients
const clients = new Set();

// Middlewares
app.use(cors()); // allow cross-origin calls (useful for testing)
app.use(express.json({ limit: '5mb' })); // parse application/json
app.use(express.urlencoded({ extended: true, limit: '5mb' })); // parse form bodies

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// simple request logger for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
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

    const payload = {
      url: loginRequest.url || 'https://v.hit.club/',
      loginRequest: loginRequest,
      actions: loginRequest.actions || [],
      joinGameXoc: loginRequest.joinGameXoc !== undefined ? loginRequest.joinGameXoc : true, // Default to true
      enableWebSocketHook: loginRequest.enableWebSocketHook !== undefined ? loginRequest.enableWebSocketHook : true, // Default to true
      proxyHost: loginRequest.proxyHost,
      proxyPort: loginRequest.proxyPort,
      proxyUser: loginRequest.proxyUser,
      proxyPassword: loginRequest.proxyPass
    };

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
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Monitor UI: http://localhost:${PORT}`);
  console.log(`📡 WebSocket: ws://localhost:${PORT}`);
  console.log(`🔌 API: http://localhost:${PORT}/api/v1/login`);
  console.log(`========================================\n`);
});
