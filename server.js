// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { runAutomation } = require('./src/main/automation');

const app = express();
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

// Middlewares
app.use(cors()); // allow cross-origin calls (useful for testing)
app.use(express.json({ limit: '5mb' })); // parse application/json
app.use(express.urlencoded({ extended: true, limit: '5mb' })); // parse form bodies

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


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
