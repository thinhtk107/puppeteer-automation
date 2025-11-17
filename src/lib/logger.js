const fs = require('fs');
const path = require('path');

// Simple file logger used both in local and packaged runs.
// Writes to PROJECT_ROOT/logs/app.log (creates directory if missing).
const projectRoot = process.env.PROJECT_ROOT || path.join(__dirname, '..', '..');
const logsDir = path.join(projectRoot, 'logs');
const logFile = path.join(logsDir, 'app.log');

function ensureLogsDir() {
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  } catch (e) {
    // fallback to current dir if cannot create
  }
}

function write(level, msg) {
  try {
    ensureLogsDir();
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${msg}\n`;
    fs.appendFileSync(logFile, line, { encoding: 'utf8' });
  } catch (e) {
    // If file logging fails, keep silent to avoid crashing the app
  }
}

module.exports = {
  info: (msg) => { write('info', msg); },
  warn: (msg) => { write('warn', msg); },
  error: (msg) => { write('error', msg); }
};
