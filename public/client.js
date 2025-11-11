// WebSocket connection to server
let ws = null;
let isConnected = false;
let isPaused = false;
let autoScroll = true;
let showTimestamp = true;

// Statistics
let stats = {
    totalMessages: 0,
    wsSent: 0,
    wsReceived: 0,
    stepsCompleted: 0,
    errorCount: 0
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeWebSocket();
    setupEventListeners();
    updateServerStatus(true);
});

// Initialize WebSocket connection
function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        isConnected = true;
        updateServerStatus(true);
        addSystemLog('Connected to server', 'success');
    };
    
    ws.onclose = () => {
        isConnected = false;
        updateServerStatus(false);
        addSystemLog('Disconnected from server. Reconnecting...', 'warning');
        setTimeout(initializeWebSocket, 3000); // Reconnect after 3s
    };
    
    ws.onerror = (error) => {
        addSystemLog(`WebSocket error: ${error.message || 'Unknown error'}`, 'error');
        stats.errorCount++;
        updateStats();
    };
    
    ws.onmessage = (event) => {
        if (isPaused) return;
        
        try {
            const data = JSON.parse(event.data);
            handleMessage(data);
        } catch (e) {
            addSystemLog(`Failed to parse message: ${e.message}`, 'error');
        }
    };
}

// Handle incoming messages
function handleMessage(data) {
    stats.totalMessages++;
    
    switch (data.type) {
        case 'step':
            addStepLog(data);
            if (data.status === 'completed' || data.status === 'ok') {
                stats.stepsCompleted++;
            }
            break;
            
        case 'websocket-sent':
            addWebSocketLog(data, 'sent');
            stats.wsSent++;
            updateWebSocketStatus('connected');
            break;
            
        case 'websocket-received':
            addWebSocketLog(data, 'received');
            stats.wsReceived++;
            updateWebSocketStatus('connected');
            break;
            
        case 'websocket-created':
            addSystemLog(`WebSocket created: ${data.url}`, 'info');
            updateWebSocketStatus('connected');
            break;
            
        case 'automation-start':
            updateAutomationStatus('running');
            addSystemLog('Automation started', 'info');
            break;
            
        case 'automation-complete':
            updateAutomationStatus('completed');
            addSystemLog('Automation completed successfully', 'success');
            break;
            
        case 'automation-error':
            updateAutomationStatus('error');
            addSystemLog(`Automation error: ${data.message}`, 'error');
            stats.errorCount++;
            break;
            
        case 'log':
            addSystemLog(data.message, data.level || 'info');
            if (data.level === 'error') {
                stats.errorCount++;
            }
            break;
            
        default:
            addSystemLog(`Unknown message type: ${data.type}`, 'warning');
    }
    
    updateStats();
}

// Add step log entry
function addStepLog(data) {
    const container = document.getElementById('stepLogs');
    const stepCount = document.getElementById('stepCount');
    
    const entry = document.createElement('div');
    entry.className = `step-entry ${data.status === 'ok' || data.status === 'completed' ? 'completed' : data.status === 'failed' ? 'failed' : ''}`;
    
    const timestamp = showTimestamp ? `<span class="log-timestamp">${formatTime(new Date())}</span>` : '';
    
    entry.innerHTML = `
        ${timestamp}
        <span class="step-number">${data.stepNumber || container.children.length + 1}</span>
        <div class="step-name">${escapeHtml(data.step || data.message)}</div>
        <div class="step-status">Status: ${data.status || 'running'}</div>
    `;
    
    container.appendChild(entry);
    stepCount.textContent = `${container.children.length} steps`;
    
    if (autoScroll) {
        container.scrollTop = container.scrollHeight;
    }
}

// Add WebSocket log entry
function addWebSocketLog(data, direction) {
    const container = document.getElementById('wsLogs');
    const messageCount = document.getElementById('wsMessageCount');
    
    const entry = document.createElement('div');
    entry.className = `log-entry websocket-${direction}`;
    
    const timestamp = showTimestamp ? `<span class="log-timestamp">${formatTime(new Date())}</span>` : '';
    const typeLabel = direction === 'sent' ? '⬆️ SENT' : '⬇️ RECEIVED';
    const typeClass = direction === 'sent' ? 'sent' : 'received';
    
    let messageContent = '';
    if (data.message) {
        try {
            const parsed = typeof data.message === 'string' ? JSON.parse(data.message) : data.message;
            messageContent = formatJSON(parsed);
        } catch (e) {
            messageContent = `<span class="log-message">${escapeHtml(String(data.message))}</span>`;
        }
    }
    
    entry.innerHTML = `
        ${timestamp}
        <span class="log-type ${typeClass}">${typeLabel}</span>
        ${messageContent}
    `;
    
    container.appendChild(entry);
    messageCount.textContent = `${container.children.length} messages`;
    
    if (autoScroll) {
        container.scrollTop = container.scrollHeight;
    }
}

// Add system log entry
function addSystemLog(message, level = 'info') {
    const container = document.getElementById('systemLogs');
    const logCount = document.getElementById('systemLogCount');
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    
    const timestamp = showTimestamp ? `<span class="log-timestamp">${formatTime(new Date())}</span>` : '';
    const typeLabel = level.toUpperCase();
    
    entry.innerHTML = `
        ${timestamp}
        <span class="log-type ${level}">${typeLabel}</span>
        <span class="log-message">${escapeHtml(message)}</span>
    `;
    
    container.appendChild(entry);
    logCount.textContent = `${container.children.length} logs`;
    
    if (autoScroll) {
        container.scrollTop = container.scrollHeight;
    }
}

// Format JSON for display
function formatJSON(obj) {
    try {
        const jsonString = JSON.stringify(obj, null, 2);
        const highlighted = jsonString
            .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
            .replace(/: "([^"]*)"/g, ': <span class="json-string">"$1"</span>')
            .replace(/: (\d+)/g, ': <span class="json-number">$1</span>')
            .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
            .replace(/: null/g, ': <span class="json-null">null</span>');
        
        return `<div class="json-container"><pre>${highlighted}</pre></div>`;
    } catch (e) {
        return `<span class="log-message">${escapeHtml(String(obj))}</span>`;
    }
}

// Update status indicators
function updateServerStatus(connected) {
    const badge = document.getElementById('serverStatus');
    if (connected) {
        badge.textContent = 'Connected';
        badge.className = 'status-badge status-connected';
    } else {
        badge.textContent = 'Disconnected';
        badge.className = 'status-badge status-disconnected';
    }
}

function updateWebSocketStatus(status) {
    const badge = document.getElementById('wsStatus');
    switch (status) {
        case 'connected':
            badge.textContent = 'Connected';
            badge.className = 'status-badge status-connected';
            break;
        case 'disconnected':
            badge.textContent = 'Disconnected';
            badge.className = 'status-badge status-disconnected';
            break;
    }
}

function updateAutomationStatus(status) {
    const badge = document.getElementById('automationStatus');
    switch (status) {
        case 'running':
            badge.textContent = 'Running';
            badge.className = 'status-badge status-running';
            break;
        case 'completed':
            badge.textContent = 'Completed';
            badge.className = 'status-badge status-connected';
            break;
        case 'error':
            badge.textContent = 'Error';
            badge.className = 'status-badge status-disconnected';
            break;
        default:
            badge.textContent = 'Idle';
            badge.className = 'status-badge status-idle';
    }
}

// Update statistics
function updateStats() {
    document.getElementById('totalMessages').textContent = stats.totalMessages;
    document.getElementById('wsSent').textContent = stats.wsSent;
    document.getElementById('wsReceived').textContent = stats.wsReceived;
    document.getElementById('stepsCompleted').textContent = stats.stepsCompleted;
    document.getElementById('errorCount').textContent = stats.errorCount;
}

// Event listeners for controls
function setupEventListeners() {
    // Clear logs
    document.getElementById('clearLogsBtn').addEventListener('click', () => {
        document.getElementById('stepLogs').innerHTML = '';
        document.getElementById('wsLogs').innerHTML = '';
        document.getElementById('systemLogs').innerHTML = '';
        
        document.getElementById('stepCount').textContent = '0 steps';
        document.getElementById('wsMessageCount').textContent = '0 messages';
        document.getElementById('systemLogCount').textContent = '0 logs';
        
        stats = {
            totalMessages: 0,
            wsSent: 0,
            wsReceived: 0,
            stepsCompleted: 0,
            errorCount: 0
        };
        updateStats();
        
        addSystemLog('Logs cleared', 'info');
    });
    
    // Pause logs
    document.getElementById('pauseLogsBtn').addEventListener('click', (e) => {
        isPaused = !isPaused;
        e.target.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
        e.target.className = isPaused ? 'btn btn-info' : 'btn btn-warning';
        addSystemLog(isPaused ? 'Logs paused' : 'Logs resumed', 'info');
    });
    
    // Export logs
    document.getElementById('exportLogsBtn').addEventListener('click', () => {
        const logs = {
            timestamp: new Date().toISOString(),
            steps: Array.from(document.getElementById('stepLogs').children).map(el => el.textContent),
            websocket: Array.from(document.getElementById('wsLogs').children).map(el => el.textContent),
            system: Array.from(document.getElementById('systemLogs').children).map(el => el.textContent),
            statistics: stats
        };
        
        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `puppeteer-logs-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        addSystemLog('Logs exported successfully', 'success');
    });
    
    // Auto-scroll checkbox
    document.getElementById('autoScrollCheckbox').addEventListener('change', (e) => {
        autoScroll = e.target.checked;
        addSystemLog(`Auto-scroll ${autoScroll ? 'enabled' : 'disabled'}`, 'info');
    });
    
    // Show timestamp checkbox
    document.getElementById('showTimestampCheckbox').addEventListener('change', (e) => {
        showTimestamp = e.target.checked;
        addSystemLog(`Timestamp display ${showTimestamp ? 'enabled' : 'disabled'}`, 'info');
    });
}

// Utility functions
function formatTime(date) {
    return date.toLocaleTimeString('vi-VN', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        fractionalSecondDigits: 3
    });
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}
