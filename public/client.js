// WebSocket connection to server
let ws = null;
let isConnected = false;
let isPaused = false;
let autoScroll = true;
let showTimestamp = true;
let isAutomationRunning = false;

// Betting statistics
// Per-session stats and logs
let sessions = {};
let activeSessionId = null;
let runtimeUpdateInterval = null; // Interval để update runtime

function getActiveStats() {
    if (activeSessionId && sessions[activeSessionId]) {
        return sessions[activeSessionId].bettingStats;
    }
    return null;
}

function getActiveLogs() {
    if (activeSessionId && sessions[activeSessionId]) {
        return sessions[activeSessionId].logs;
    }
    return null;
}

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
    setupFormHandlers();
    updateServerStatus(true);
});

// Setup form handlers
function setupFormHandlers() {
    const loginForm = document.getElementById('loginForm');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginSubmit);
    }
    
    if (stopBtn) {
        stopBtn.addEventListener('click', handleStopAutomation);
    }
}

// Handle login form submission
async function handleLoginSubmit(e) {
    e.preventDefault();
    
    if (isAutomationRunning) {
        showFormMessage('Automation đang chạy, vui lòng đợi...', 'info');
        return;
    }
    
    // Get form data
    const betAmounts = [
        parseInt(document.getElementById('betAmount1').value) || 1000,
        parseInt(document.getElementById('betAmount2').value) || 5000,
        parseInt(document.getElementById('betAmount3').value) || 10000,
        parseInt(document.getElementById('betAmount4').value) || 10000,
        parseInt(document.getElementById('betAmount5').value) || 10000
    ];
    
    const formData = {
        url: document.getElementById('url').value,
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
        joinGameXoc: document.getElementById('joinGameXoc').checked,
        enableWebSocketHook: document.getElementById('enableWebSocketHook').checked,
        showStatsOnScreen: document.getElementById('showStatsOnScreen').checked,
        headlessMode: document.getElementById('headlessMode').checked,
        betAmounts: betAmounts,
        baseBetAmount: betAmounts[0], // Để tương thích với code cũ
        proxyHost: document.getElementById('proxyHost').value,
        proxyPort: document.getElementById('proxyPort').value,
        proxyUser: document.getElementById('proxyUser').value,
        proxyPass: document.getElementById('proxyPass').value
    };
    
    // Validate
    if (!formData.url || !formData.username || !formData.password) {
        showFormMessage('Vui lòng điền đầy đủ thông tin URL, Username và Password', 'error');
        return;
    }
    
    // Create new session
    const sessionId = 'session-' + Date.now();
    activeSessionId = sessionId;
    sessions[sessionId] = {
        isRunning: true,
        isPaused: false,
        sessionId: sessionId,
        startTime: Date.now(), // Thời gian bắt đầu session
        bettingStats: {
            initialBalance: 0,
            currentBalance: 0,
            betAmounts: formData.betAmounts, // Mảng 5 giá trị tiền cược
            currentBetLevel: 0, // Index hiện tại (0-4)
            baseBetAmount: formData.baseBetAmount,
            currentBetAmount: formData.baseBetAmount,
            winCount: 0,
            lossCount: 0,
            totalProfit: 0,
            totalBets: 0,
            highestBet: formData.baseBetAmount,
            totalWinAmount: 0,
            totalLossAmount: 0,
            currentWinStreak: 0,
            currentLossStreak: 0,
            maxWinStreak: 0,
            maxLossStreak: 0,
            L2Bank: 0,
            L3Bank: 0,
            L4Bank: 0,
            L5Bank: 0,
            L6Bank: 0,
            history: []
        },
        logs: []
    };
    updateBettingStatsDisplay();
    updateSessionControlButtons();
    
    // Show betting stats panel
    document.getElementById('bettingStatsSection').style.display = 'block';
    
    // Start runtime interval
    startRuntimeInterval();
    
    // Update UI
    isAutomationRunning = true;
    updateAutomationStatus('running');
    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    showFormMessage('Đang khởi động automation...', 'info');
    
    // Clear old logs
    clearAllLogs();
    
    // Send request with sessionId
    try {
        addSystemLog('🚀 Bắt đầu gửi request đến server...', 'info');
        addSystemLog(`📌 Session ID: ${sessionId}`, 'info');
        
        // Include sessionId in the request
        const requestData = {
            ...formData,
            sessionId: sessionId
        };
        
        const response = await fetch('/api/v1/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        if (result.ok) {
            showFormMessage('✓ Request đã được gửi thành công! Đang chờ automation hoàn thành...', 'success');
            addSystemLog('✓ Server đã nhận request và bắt đầu xử lý', 'success');
        } else {
            throw new Error(result.error || 'Unknown error');
        }
    } catch (error) {
        showFormMessage(`✗ Lỗi: ${error.message}`, 'error');
        addSystemLog(`✗ Lỗi khi gửi request: ${error.message}`, 'error');
        resetAutomationUI();
    }
}

// Handle stop automation
function handleStopAutomation() {
    if (!isAutomationRunning) return;
    
    // Send stop command with sessionId
    if (ws && ws.readyState === WebSocket.OPEN && activeSessionId) {
        ws.send(JSON.stringify({
            type: 'stop-automation',
            sessionId: activeSessionId
        }));
        addSystemLog(`⏹️ Đã gửi lệnh dừng cho session: ${activeSessionId}`, 'warning');
    } else {
        addSystemLog('⏹️ Đang dừng automation...', 'warning');
    }
    
    showFormMessage('Automation đã bị dừng bởi người dùng', 'info');
    
    // Mark session as stopped
    if (activeSessionId && sessions[activeSessionId]) {
        sessions[activeSessionId].isRunning = false;
    }
    
    resetAutomationUI();
}

// Reset automation UI
function resetAutomationUI() {
    isAutomationRunning = false;
    updateAutomationStatus('idle');
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    
    // Stop runtime interval nếu đang chạy
    stopRuntimeInterval();
}

// Show form message
function showFormMessage(message, type) {
    const messageEl = document.getElementById('formMessage');
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.className = `form-message ${type}`;
        messageEl.style.display = 'block';
        
        // Auto hide after 10 seconds for success messages
        if (type === 'success') {
            setTimeout(() => {
                messageEl.style.display = 'none';
            }, 10000);
        }
    }
}

// Toggle proxy section
function toggleProxySection() {
    const section = document.getElementById('proxySection');
    const icon = document.getElementById('proxyToggleIcon');
    
    if (section.style.display === 'none') {
        section.style.display = 'block';
        icon.textContent = '▼';
    } else {
        section.style.display = 'none';
        icon.textContent = '▶';
    }
}

// Update automation status
function updateAutomationStatus(status) {
    const statusEl = document.getElementById('automationStatus');
    if (statusEl) {
        statusEl.className = `status-badge status-${status}`;
        statusEl.textContent = status === 'running' ? 'Running' : 'Idle';
    }
}

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
            
            // FILTER BY SESSION ID - Only process messages for the active session
            // If message has sessionId:
            //   - And we have activeSessionId: only process if they match
            //   - And we DON'T have activeSessionId: ignore (this is message for another session)
            if (data.sessionId) {
                if (!activeSessionId || data.sessionId !== activeSessionId) {
                    console.log(`Ignoring message from different session: ${data.sessionId} (active: ${activeSessionId || 'none'})`);
                    return;
                }
            }
            
            handleMessage(data);
            
            // Check if automation completed
            if (data.type === 'automation-complete') {
                resetAutomationUI();
                showFormMessage('✓ Automation đã hoàn thành!', 'success');
                addSystemLog('✓ Automation completed successfully', 'success');
            }
            
            // Handle betting events from cheat logic
            if (data.type === 'betting-event') {
                handleBettingEvent(data);
            }
            
            // Handle betting statistics update (real-time)
            if (data.type === 'betting-stats') {
                handleBettingStatistics(data);
            }
            
            // Handle real-time statistics from browser logs
            if (data.type === 'real-time-stats') {
                handleRealTimeStats(data);
            }
            
            // Handle browser logs
            if (data.type === 'browser-log') {
                handleBrowserLog(data);
            }
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
            // Mark session as stopped
            if (activeSessionId && sessions[activeSessionId]) {
                sessions[activeSessionId].isRunning = false;
                updateSessionControlButtons();
            }
            // Stop runtime interval
            stopRuntimeInterval();
            break;
            
        case 'automation-error':
            updateAutomationStatus('error');
            addSystemLog(`Automation error: ${data.message}`, 'error');
            stats.errorCount++;
            // Mark session as stopped
            if (activeSessionId && sessions[activeSessionId]) {
                sessions[activeSessionId].isRunning = false;
                updateSessionControlButtons();
            }
            // Stop runtime interval
            stopRuntimeInterval();
            break;
            
        case 'log':
            addSystemLog(data.message, data.level || 'info');
            if (data.level === 'error') {
                stats.errorCount++;
            }
            // Check if it's a pause message
            if (data.message && data.message.includes('⏸️') && data.message.includes('tạm dừng')) {
                if (activeSessionId && sessions[activeSessionId]) {
                    sessions[activeSessionId].isPaused = true;
                    updateSessionControlButtons();
                }
            }
            // Check if it's a resume message
            if (data.message && data.message.includes('▶️') && data.message.includes('tiếp tục')) {
                if (activeSessionId && sessions[activeSessionId]) {
                    sessions[activeSessionId].isPaused = false;
                    updateSessionControlButtons();
                }
            }
            // Check if it's a stop message for this session
            if (data.message && data.message.includes('🛑') && data.message.includes('DỪNG')) {
                if (activeSessionId && sessions[activeSessionId]) {
                    sessions[activeSessionId].isRunning = false;
                    updateSessionControlButtons();
                }
            }
            break;
            
        default:
            // Bỏ qua unknown message types (không log nữa)
            break;
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
    // Store log in active session
    if (activeSessionId && sessions[activeSessionId]) {
        sessions[activeSessionId].logs.push({ message, level, timestamp: new Date() });
    }
    // Render only active session logs
    const container = document.getElementById('systemLogs');
    const logCount = document.getElementById('systemLogCount');
    if (container) {
        container.innerHTML = '';
        const logs = getActiveLogs() || [];
        logs.forEach(log => {
            const entry = document.createElement('div');
            entry.className = `log-entry ${log.level}`;
            const ts = showTimestamp ? `<span class="log-timestamp">${formatTime(log.timestamp)}</span>` : '';
            const typeLabel = log.level.toUpperCase();
            entry.innerHTML = `
                ${ts}
                <span class="log-type ${log.level}">${typeLabel}</span>
                <span class="log-message">${escapeHtml(log.message)}</span>
            `;
            container.appendChild(entry);
        });
        logCount.textContent = `${logs.length} logs`;
        if (autoScroll) {
            container.scrollTop = container.scrollHeight;
        }
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
    const clearBtn = document.getElementById('clearLogsBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllLogs);
    }
    
    // Pause logs
    document.getElementById('pauseLogsBtn').addEventListener('click', (e) => {
        isPaused = !isPaused;
        e.target.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
        e.target.className = isPaused ? 'btn btn-info' : 'btn btn-warning';
        addSystemLog(isPaused ? 'Logs paused' : 'Logs resumed', 'info');
    });
    
    // Export logs
    document.getElementById('exportLogsBtn').addEventListener('click', () => {
        try {
            const logs = {
                timestamp: new Date().toISOString(),
                activeSessionId: activeSessionId,
                sessions: {},
                systemLogs: Array.from(document.getElementById('systemLogs').children).map(el => el.textContent),
                statistics: stats
            };
            
            // Export all sessions data
            for (const sessionId in sessions) {
                const session = sessions[sessionId];
                logs.sessions[sessionId] = {
                    logs: session.logs || [],
                    bettingStats: session.bettingStats || {},
                    startTime: session.startTime,
                    runtime: session.runtime
                };
            }
            
            // Add active session betting stats if available
            const activeBettingStats = getActiveStats();
            if (activeBettingStats) {
                logs.activeBettingStats = activeBettingStats;
            }
            
            const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `puppeteer-logs-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            addSystemLog('✅ Logs exported successfully', 'success');
        } catch (error) {
            console.error('Export error:', error);
            addSystemLog(`❌ Export failed: ${error.message}`, 'error');
        }
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

// Clear all logs
function clearAllLogs() {
    const stepLogs = document.getElementById('stepLogs');
    const wsLogs = document.getElementById('wsLogs');
    const systemLogs = document.getElementById('systemLogs');
    const stepCount = document.getElementById('stepCount');
    const wsMessageCount = document.getElementById('wsMessageCount');
    const systemLogCount = document.getElementById('systemLogCount');
    
    if (stepLogs) stepLogs.innerHTML = '';
    if (wsLogs) wsLogs.innerHTML = '';
    if (systemLogs) systemLogs.innerHTML = '';
    
    if (stepCount) stepCount.textContent = '0 steps';
    if (wsMessageCount) wsMessageCount.textContent = '0 messages';
    if (systemLogCount) systemLogCount.textContent = '0 logs';
    
    stats = {
        totalMessages: 0,
        wsSent: 0,
        wsReceived: 0,
        stepsCompleted: 0,
        errorCount: 0
    };
    updateStats();
    
    addSystemLog('Logs cleared', 'info');
}

// === BETTING STATISTICS FUNCTIONS ===

// Handle betting event from cheat logic
function handleBettingEvent(data) {
    const { event, eid, amount, result, balance } = data;
    
    const bettingStats = getActiveStats();
    if (!bettingStats) return;
    switch(event) {
        case 'bet-placed':
            bettingStats.totalBets++;
            bettingStats.currentBetAmount = amount;
            addSystemLog(`🎲 Đặt cược EID ${eid} với số tiền: ${amount.toLocaleString('vi-VN')}`, 'info');
            break;
        case 'bet-win':
            bettingStats.winCount++;
            bettingStats.currentBetAmount = bettingStats.baseBetAmount;
            const winProfit = amount;
            bettingStats.currentBalance += winProfit;
            addSystemLog(`✅ THẮNG! EID ${eid} | Tiền cược: ${amount.toLocaleString('vi-VN')} | Lãi: +${winProfit.toLocaleString('vi-VN')}`, 'success');
            break;
        case 'bet-loss':
            bettingStats.lossCount++;
            bettingStats.currentBetAmount = amount * 2;
            const lossAmount = -amount;
            bettingStats.currentBalance += lossAmount;
            addSystemLog(`❌ THUA! EID ${eid} | Tiền cược: ${amount.toLocaleString('vi-VN')} | Lỗ: ${lossAmount.toLocaleString('vi-VN')}`, 'error');
            break;
        case 'balance-update':
            if (balance !== undefined) {
                bettingStats.currentBalance = balance;
            }
            break;
    }
    updateBettingStatsDisplay();
}

// Update betting stats display
function updateBettingStatsDisplay() {
    const bettingStats = getActiveStats();
    if (!bettingStats) return;
    console.log('🔄 Updating betting stats display...', bettingStats);
    const currentBalanceEl = document.getElementById('currentBalance');
    const currentBetEl = document.getElementById('currentBetDisplay');
    const winCountEl = document.getElementById('winCount');
    const lossCountEl = document.getElementById('lossCount');
    const totalProfitEl = document.getElementById('totalProfit');
    const totalBetsEl = document.getElementById('totalBets');
    if (currentBalanceEl) {
        currentBalanceEl.textContent = bettingStats.currentBalance.toLocaleString('vi-VN');
        if (bettingStats.currentBalance > bettingStats.initialBalance) {
            currentBalanceEl.style.color = 'var(--success-color)';
        } else if (bettingStats.currentBalance < bettingStats.initialBalance) {
            currentBalanceEl.style.color = 'var(--danger-color)';
        } else {
            currentBalanceEl.style.color = 'var(--text-primary)';
        }
    }
    if (currentBetEl) {
        currentBetEl.textContent = bettingStats.currentBetAmount.toLocaleString('vi-VN');
    }
    if (winCountEl) {
        winCountEl.textContent = bettingStats.winCount;
    }
    if (lossCountEl) {
        lossCountEl.textContent = bettingStats.lossCount;
    }
    if (totalProfitEl) {
        // Tính lợi nhuận = Tổng tiền thắng - Tổng tiền thua
        const profit = (bettingStats.totalWinAmount || 0) - (bettingStats.totalLossAmount || 0);
        totalProfitEl.textContent = (profit >= 0 ? '+' : '') + profit.toLocaleString('vi-VN');
        totalProfitEl.className = 'stat-value ' + (profit >= 0 ? 'positive' : 'negative');
    }
    if (totalBetsEl) {
        totalBetsEl.textContent = bettingStats.totalBets;
    }
    
    // Update next bet amount
    const nextBetEl = document.getElementById('nextBetAmount');
    if (nextBetEl && bettingStats.betAmounts && bettingStats.currentBetLevel !== undefined) {
        const nextLevel = bettingStats.currentBetLevel;
        if (nextLevel >= 0 && nextLevel < bettingStats.betAmounts.length) {
            const nextBetAmount = bettingStats.betAmounts[nextLevel];
            nextBetEl.textContent = nextBetAmount.toLocaleString('vi-VN') + 'đ';
            nextBetEl.className = 'stat-value';
            
            // Highlight if higher than base bet
            if (nextBetAmount > bettingStats.baseBetAmount) {
                nextBetEl.classList.add('bet-doubled');
            } else {
                nextBetEl.classList.remove('bet-doubled');
            }
        }
    }
    
    // Update bet level info
    const betLevelInfoEl = document.getElementById('betLevelInfo');
    if (betLevelInfoEl && bettingStats.currentBetLevel !== undefined && bettingStats.betAmounts) {
        const currentLevel = bettingStats.currentBetLevel + 1; // Display as 1-5 instead of 0-4
        const maxLevel = bettingStats.betAmounts.length;
        betLevelInfoEl.textContent = `Mức ${currentLevel}/${maxLevel}`;
    }
    
    // Update runtime
    updateRuntimeDisplay();
}

// Update runtime display
function updateRuntimeDisplay() {
    if (!activeSessionId || !sessions[activeSessionId]) return;
    
    const session = sessions[activeSessionId];
    const runtimeEl = document.getElementById('runtime');
    
    if (runtimeEl && session.startTime) {
        const elapsedMs = Date.now() - session.startTime;
        const totalSeconds = Math.floor(elapsedMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        runtimeEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

// Start runtime interval
function startRuntimeInterval() {
    // Clear existing interval nếu có
    if (runtimeUpdateInterval) {
        clearInterval(runtimeUpdateInterval);
    }
    
    // Update runtime mỗi giây
    runtimeUpdateInterval = setInterval(() => {
        updateRuntimeDisplay();
    }, 1000);
}

// Stop runtime interval
function stopRuntimeInterval() {
    if (runtimeUpdateInterval) {
        clearInterval(runtimeUpdateInterval);
        runtimeUpdateInterval = null;
    }
}

// Reset betting stats
function resetBettingStats() {
    if (!confirm('Bạn có chắc muốn reset tất cả thống kê cược?')) {
        return;
    }
    
    const bettingStats = getActiveStats();
    if (!bettingStats) return;
    const base = bettingStats.baseBetAmount;
    const initial = bettingStats.initialBalance;
    Object.assign(bettingStats, {
        initialBalance: initial,
        currentBalance: initial,
        baseBetAmount: base,
        currentBetAmount: base,
        winCount: 0,
        lossCount: 0,
        totalProfit: 0,
        totalBets: 0,
        history: []
    });
    updateBettingStatsDisplay();
    addSystemLog('✓ Đã reset thống kê cược', 'success');
}

// Handle stop betting button
function handleStopBetting() {
    if (!confirm('Bạn có chắc muốn DỪNG chương trình? Automation sẽ không đặt cược nữa.')) {
        return;
    }
    
    // Send stop command via WebSocket WITH SESSION ID
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'stop-automation',
            sessionId: activeSessionId, // Gửi sessionId để chỉ dừng session này
            timestamp: Date.now()
        }));
    }
    
    addSystemLog('🛑 ĐÃ GỬI LỆNH DỪNG CHƯƠNG TRÌNH CHO SESSION NÀY', 'warning');
    addSystemLog('⚠️ Chương trình sẽ dừng sau khi hoàn thành cược hiện tại (nếu có)', 'warning');
}

// Stop session (per-session control) - TẠM DỪNG ĐẶT CƯỢC
function stopSession() {
    if (!activeSessionId || !sessions[activeSessionId]) {
        addSystemLog('❌ Không có session nào đang hoạt động', 'error');
        return;
    }
    
    const session = sessions[activeSessionId];
    if (session.isPaused) {
        addSystemLog('⚠️ Session này đã tạm dừng rồi', 'warning');
        return;
    }
    
    // Send PAUSE command via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'pause-betting',
            sessionId: activeSessionId,
            timestamp: Date.now()
        }));
        
        addSystemLog(`⏸️ Đã tạm dừng đặt cược cho session: ${activeSessionId}`, 'warning');
        session.isPaused = true;
        
        // Update UI
        updateSessionControlButtons();
    } else {
        addSystemLog('❌ WebSocket chưa kết nối', 'error');
    }
}

// Resume session (per-session control) - TIẾP TỤC ĐẶT CƯỢC
function resumeSession() {
    if (!activeSessionId || !sessions[activeSessionId]) {
        addSystemLog('❌ Không có session nào để tiếp tục', 'error');
        return;
    }
    
    const session = sessions[activeSessionId];
    if (!session.isPaused) {
        addSystemLog('⚠️ Session này đang chạy rồi', 'warning');
        return;
    }
    
    // Send RESUME command via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'resume-betting',
            sessionId: activeSessionId,
            timestamp: Date.now()
        }));
        
        addSystemLog(`▶️ Đã tiếp tục đặt cược cho session: ${activeSessionId}`, 'success');
        session.isPaused = false;
        
        // Update UI
        updateSessionControlButtons();
    } else {
        addSystemLog('❌ WebSocket chưa kết nối', 'error');
    }
}

// Update session control buttons
function updateSessionControlButtons() {
    const stopBtn = document.getElementById('stopSessionBtn');
    const resumeBtn = document.getElementById('resumeSessionBtn');
    const sessionIdEl = document.getElementById('sessionIdDisplay');
    
    if (!activeSessionId || !sessions[activeSessionId]) {
        if (stopBtn) stopBtn.style.display = 'none';
        if (resumeBtn) resumeBtn.style.display = 'none';
        if (sessionIdEl) sessionIdEl.textContent = '';
        return;
    }
    
    const session = sessions[activeSessionId];
    const shortId = activeSessionId.substring(activeSessionId.length - 8);
    
    if (sessionIdEl) {
        sessionIdEl.textContent = `(${shortId})`;
    }
    
    // Hiển thị button dựa trên trạng thái isPaused
    if (session.isPaused) {
        // Đang tạm dừng -> hiển thị nút Tiếp tục
        if (stopBtn) {
            stopBtn.style.display = 'none';
        }
        if (resumeBtn) {
            resumeBtn.style.display = 'inline-block';
            resumeBtn.disabled = false;
        }
    } else {
        // Đang chạy -> hiển thị nút Tạm dừng
        if (stopBtn) {
            stopBtn.style.display = 'inline-block';
            stopBtn.disabled = false;
        }
        if (resumeBtn) {
            resumeBtn.style.display = 'none';
        }
    }
}

// Handle reset stats button
function handleResetStats() {
    resetBettingStats();
}

// Handle betting statistics update (real-time from page)
function handleBettingStatistics(data) {
    console.log('📊 Received betting statistics:', data);
    
    const bettingStats = getActiveStats();
    if (!bettingStats) return;
    if (data.currentBalance !== undefined) {
        bettingStats.currentBalance = data.currentBalance;
    }
    if (data.initialBalance !== undefined) {
        bettingStats.initialBalance = data.initialBalance;
    }
    if (data.baseBetAmount !== undefined) {
        bettingStats.baseBetAmount = data.baseBetAmount;
    }
    if (data.currentBetAmount !== undefined) {
        bettingStats.currentBetAmount = data.currentBetAmount;
    }
    if (data.totalBets !== undefined) {
        bettingStats.totalBets = data.totalBets;
    }
    if (data.winCount !== undefined) {
        bettingStats.winCount = data.winCount;
    }
    if (data.lossCount !== undefined) {
        bettingStats.lossCount = data.lossCount;
    }
    if (data.profitLoss !== undefined) {
        bettingStats.totalProfit = data.profitLoss;
    } else if (data.profit !== undefined) {
        bettingStats.totalProfit = data.profit;
    }
    if (data.highestBet !== undefined) {
        bettingStats.highestBet = data.highestBet;
    }
    if (data.totalWinAmount !== undefined) {
        bettingStats.totalWinAmount = data.totalWinAmount;
    }
    if (data.totalLossAmount !== undefined) {
        bettingStats.totalLossAmount = data.totalLossAmount;
    }
    if (data.currentWinStreak !== undefined) {
        bettingStats.currentWinStreak = data.currentWinStreak;
    }
    if (data.currentLossStreak !== undefined) {
        bettingStats.currentLossStreak = data.currentLossStreak;
    }
    if (data.maxWinStreak !== undefined) {
        bettingStats.maxWinStreak = data.maxWinStreak;
    }
    if (data.maxLossStreak !== undefined) {
        bettingStats.maxLossStreak = data.maxLossStreak;
    }
    
    // Update last bet information for history tracking
    if (data.lastBet !== undefined) {
        bettingStats.lastBet = data.lastBet;
    }
    if (data.lastOutcome !== undefined) {
        bettingStats.lastOutcome = data.lastOutcome;
    }
    if (data.lastResult !== undefined) {
        bettingStats.lastResult = data.lastResult;
    }
    if (data.currentBetLevel !== undefined) {
        bettingStats.currentBetLevel = data.currentBetLevel;
    }
    if (data.maxBetLevel !== undefined) {
        bettingStats.maxBetLevel = data.maxBetLevel;
    }
    
    console.log('📊 Updated bettingStats:', bettingStats);
    updateBettingStatsDisplay();
    updateAdvancedStats(data);
    updateBankStatus(data);
}

// Update advanced statistics display
function updateAdvancedStats(data) {
    const bettingStats = getActiveStats();
    if (!bettingStats) return;
    
    // Win rate
    const winRateEl = document.getElementById('winRate');
    if (winRateEl) {
        if (bettingStats.totalBets > 0) {
            const winRate = ((bettingStats.winCount / bettingStats.totalBets) * 100).toFixed(1);
            winRateEl.textContent = `${winRate}%`;
        } else if (data.winRate !== undefined) {
            winRateEl.textContent = `${data.winRate}%`;
        }
    }
    
    // Highest bet
    const highestBetEl = document.getElementById('highestBet');
    if (highestBetEl) {
        const highestBetValue = data.highestBet !== undefined ? data.highestBet : (bettingStats.highestBet || 0);
        highestBetEl.textContent = highestBetValue.toLocaleString('vi-VN');
    }
    
    // Runtime - được update bởi local timer, không cần update từ server
    // updateRuntimeDisplay() được gọi tự động mỗi giây
    
    // Total win/loss amounts - Ưu tiên từ bettingStats
    const totalWinAmountEl = document.getElementById('totalWinAmount');
    if (totalWinAmountEl) {
        const winAmount = data.totalWinAmount !== undefined ? data.totalWinAmount : (bettingStats.totalWinAmount || 0);
        totalWinAmountEl.textContent = `+${winAmount.toLocaleString('vi-VN')}đ`;
    }
    
    const totalLossAmountEl = document.getElementById('totalLossAmount');
    if (totalLossAmountEl) {
        const lossAmount = data.totalLossAmount !== undefined ? data.totalLossAmount : (bettingStats.totalLossAmount || 0);
        totalLossAmountEl.textContent = `-${lossAmount.toLocaleString('vi-VN')}đ`;
    }
    
    // Consecutive wins/losses - Ưu tiên từ bettingStats
    const currentWinStreakEl = document.getElementById('currentWinStreak');
    if (currentWinStreakEl) {
        const winStreak = data.currentConsecutiveWins !== undefined ? data.currentConsecutiveWins : (bettingStats.currentWinStreak || 0);
        currentWinStreakEl.textContent = winStreak;
    }
    
    const currentLossStreakEl = document.getElementById('currentLossStreak');
    if (currentLossStreakEl) {
        const lossStreak = data.currentConsecutiveLosses !== undefined ? data.currentConsecutiveLosses : (bettingStats.currentLossStreak || 0);
        currentLossStreakEl.textContent = lossStreak;
    }
    
    const maxWinStreakEl = document.getElementById('maxWinStreak');
    if (maxWinStreakEl) {
        const maxWin = data.maxConsecutiveWins !== undefined ? data.maxConsecutiveWins : (bettingStats.maxWinStreak || 0);
        maxWinStreakEl.textContent = maxWin;
    }
    
    const maxLossStreakEl = document.getElementById('maxLossStreak');
    if (maxLossStreakEl) {
        const maxLoss = data.maxConsecutiveLosses !== undefined ? data.maxConsecutiveLosses : (bettingStats.maxLossStreak || 0);
        maxLossStreakEl.textContent = maxLoss;
    }
}

// Update bank status display
function updateBankStatus(data) {
    // Bank counts
    const bankL2El = document.getElementById('bankL2');
    if (bankL2El && data.bankL2 !== undefined) {
        bankL2El.textContent = data.bankL2;
    }
    
    const bankL3El = document.getElementById('bankL3');
    if (bankL3El && data.bankL3 !== undefined) {
        bankL3El.textContent = data.bankL3;
    }
    
    const bankL4El = document.getElementById('bankL4');
    if (bankL4El && data.bankL4 !== undefined) {
        bankL4El.textContent = data.bankL4;
    }
    
    const bankL5El = document.getElementById('bankL5');
    if (bankL5El && data.bankL5 !== undefined) {
        bankL5El.textContent = data.bankL5;
    }
    
    // Current streak
    const currentStreakEl = document.getElementById('currentStreak');
    if (currentStreakEl && data.currentStreakType !== undefined && data.currentStreakCount !== undefined) {
        if (data.currentStreakType) {
            currentStreakEl.textContent = `EID ${data.currentStreakType} x${data.currentStreakCount}`;
        } else {
            currentStreakEl.textContent = '-';
        }
    }
    
    // Betting status
    const bettingStatusEl = document.getElementById('bettingStatus');
    if (bettingStatusEl && data.isWaitingForResult !== undefined) {
        bettingStatusEl.textContent = data.isWaitingForResult ? '⏳ Đang chờ kết quả' : '✅ Sẵn sàng';
        bettingStatusEl.className = data.isWaitingForResult ? 'bank-value warning' : 'bank-value success';
    }
}

// Handle real-time statistics from browser logs
function handleRealTimeStats(data) {
    if (!data.stats) return;
    
    const stats = data.stats;
    
    // Update Bank Status (L2-L6)
    if (stats.bankStatus) {
        const bankL2El = document.getElementById('bankL2');
        const bankL3El = document.getElementById('bankL3');
        const bankL4El = document.getElementById('bankL4');
        const bankL5El = document.getElementById('bankL5');
        const bankL6El = document.getElementById('bankL6');
        
        if (bankL2El) bankL2El.textContent = stats.bankStatus.L2;
        if (bankL3El) bankL3El.textContent = stats.bankStatus.L3;
        if (bankL4El) bankL4El.textContent = stats.bankStatus.L4;
        if (bankL5El) bankL5El.textContent = stats.bankStatus.L5;
        if (bankL6El) bankL6El.textContent = stats.bankStatus.L6;
        
        // Add visual indicator for active banks
        highlightActiveBank(stats.bankStatus);
    }
    
    // Update Current Streak
    if (stats.currentStreak) {
        const currentStreakEl = document.getElementById('currentStreak');
        if (currentStreakEl) {
            const streakText = `EID ${stats.currentStreak.type} x${stats.currentStreak.length}`;
            currentStreakEl.textContent = streakText;
            currentStreakEl.className = 'stat-value streak-active';
            
            // Add animation
            currentStreakEl.classList.add('pulse-animation');
            setTimeout(() => currentStreakEl.classList.remove('pulse-animation'), 1000);
        }
    }
    
    // Update Last Bet Info
    if (stats.lastBet) {
        const lastBetEl = document.getElementById('lastBetAmount');
        const lastBetEidEl = document.getElementById('lastBetEid');
        
        if (lastBetEl) lastBetEl.textContent = stats.lastBet.amount.toLocaleString('vi-VN') + 'đ';
        if (lastBetEidEl) lastBetEidEl.textContent = 'EID ' + stats.lastBet.eid;
    }
    
    // Update Next Bet Amount and Bet Level
    const nextBetEl = document.getElementById('nextBetAmount');
    const betLevelInfoEl = document.getElementById('betLevelInfo');
    const bettingStats = getActiveStats();
    
    if (nextBetEl && bettingStats) {
        let nextBetAmount = 0;
        
        // Nếu server gửi nextBetAmount, dùng nó
        if (stats.nextBetAmount !== undefined) {
            nextBetAmount = stats.nextBetAmount;
        }
        // Nếu không, tính dựa trên currentBetLevel và betAmounts
        else if (bettingStats.betAmounts && bettingStats.currentBetLevel !== undefined) {
            // currentBetLevel là index (0-4), lấy số tiền từ mảng
            const nextLevel = bettingStats.currentBetLevel;
            if (nextLevel >= 0 && nextLevel < bettingStats.betAmounts.length) {
                nextBetAmount = bettingStats.betAmounts[nextLevel];
            }
        }
        // Fallback cuối cùng
        else if (stats.currentBetAmount !== undefined) {
            nextBetAmount = stats.currentBetAmount;
        } else if (bettingStats.currentBetAmount !== undefined) {
            nextBetAmount = bettingStats.currentBetAmount;
        }
        
        // Hiển thị số tiền
        if (nextBetAmount > 0) {
            nextBetEl.textContent = nextBetAmount.toLocaleString('vi-VN') + 'đ';
            nextBetEl.className = 'stat-value';
            
            // Highlight if doubled (Martingale)
            if (nextBetAmount > bettingStats.baseBetAmount) {
                nextBetEl.classList.add('bet-doubled');
            }
        }
    }
    
    // Update bet level info
    if (betLevelInfoEl && bettingStats) {
        const currentLevel = stats.currentBetLevel !== undefined ? stats.currentBetLevel : bettingStats.currentBetLevel;
        const maxLevel = stats.maxBetLevel !== undefined ? stats.maxBetLevel : (bettingStats.betAmounts ? bettingStats.betAmounts.length : 5);
        
        if (currentLevel !== undefined) {
            betLevelInfoEl.textContent = `Mức ${currentLevel + 1}/${maxLevel}`;
        }
    }
    
    // Update Round Counter
    if (stats.roundCounter !== undefined) {
        const roundCounterEl = document.getElementById('roundCounter');
        if (roundCounterEl) {
            roundCounterEl.textContent = `${stats.roundCounter}/4`;
            
            // Highlight when close to 4
            if (stats.roundCounter >= 3) {
                roundCounterEl.classList.add('round-warning');
            } else {
                roundCounterEl.classList.remove('round-warning');
            }
        }
    }
    
    // Update Win/Loss Indicator
    if (stats.lastOutcome) {
        const outcomeEl = document.getElementById('lastOutcome');
        if (outcomeEl) {
            if (stats.lastOutcome === 'win') {
                outcomeEl.textContent = '✅ THẮNG';
                outcomeEl.className = 'outcome-badge win';
            } else if (stats.lastOutcome === 'loss') {
                outcomeEl.textContent = '❌ THUA';
                outcomeEl.className = 'outcome-badge loss';
            }
            
            // Flash animation
            outcomeEl.classList.add('flash-animation');
            setTimeout(() => outcomeEl.classList.remove('flash-animation'), 1500);
        }
        
        // NOTE: Bet history is now added via parseBetResultFromLog() in handleBrowserLog()
        // This prevents duplicate entries. The log parsing method is more reliable and has complete data.
        // DO NOT add bet history here anymore to avoid duplicates!
    }
    
    // Update Last Result
    if (stats.lastResult !== undefined) {
        const lastResultEl = document.getElementById('lastResult');
        if (lastResultEl) {
            lastResultEl.textContent = stats.lastResult ? `EID ${stats.lastResult}` : 'Khác';
            lastResultEl.className = 'result-badge';
            
            // Add color coding
            if (stats.lastResult === 2) {
                lastResultEl.classList.add('result-2');
            } else if (stats.lastResult === 5) {
                lastResultEl.classList.add('result-5');
            }
        }
    }
    
    // Update Current Balance
    if (stats.currentBalance !== undefined) {
        const bettingStats = getActiveStats();
        if (!bettingStats) return;
        
        // Set initialBalance lần đầu tiên nhận được balance từ socket
        if (bettingStats.initialBalance === 0 && stats.currentBalance > 0) {
            bettingStats.initialBalance = stats.currentBalance;
            console.log('✅ Initial balance set from socket:', stats.currentBalance);
        }
        
        // Update current balance
        bettingStats.currentBalance = stats.currentBalance;
        
        const currentBalanceEl = document.getElementById('currentBalance');
        if (currentBalanceEl) {
            currentBalanceEl.textContent = stats.currentBalance.toLocaleString('vi-VN') + 'đ';
            
            // Color coding based on profit/loss
            if (bettingStats.initialBalance > 0) {
                if (stats.currentBalance > bettingStats.initialBalance) {
                    currentBalanceEl.style.color = 'var(--success-color)';
                } else if (stats.currentBalance < bettingStats.initialBalance) {
                    currentBalanceEl.style.color = 'var(--danger-color)';
                } else {
                    currentBalanceEl.style.color = 'var(--text-primary)';
                }
            }
            
            // Add flash animation
            currentBalanceEl.classList.add('flash-animation');
            setTimeout(() => currentBalanceEl.classList.remove('flash-animation'), 500);
        }
    }
    
    // Update Betting Statistics (Total, Wins, Losses)
    if (stats.totalBetsPlaced !== undefined) {
        const totalBetsEl = document.getElementById('totalBets');
        if (totalBetsEl) {
            totalBetsEl.textContent = stats.totalBetsPlaced;
        }
    }
    
    if (stats.totalWins !== undefined) {
        const totalWinsEl = document.getElementById('winCount');
        if (totalWinsEl) {
            totalWinsEl.textContent = stats.totalWins;
        }
    }
    
    if (stats.totalLosses !== undefined) {
        const totalLossesEl = document.getElementById('lossCount');
        if (totalLossesEl) {
            totalLossesEl.textContent = stats.totalLosses;
        }
    }
    
    // Calculate and update win rate
    if (stats.totalBetsPlaced !== undefined && stats.totalWins !== undefined) {
        const winRateEl = document.getElementById('winRate');
        if (winRateEl && stats.totalBetsPlaced > 0) {
            const winRate = ((stats.totalWins / stats.totalBetsPlaced) * 100).toFixed(1);
            winRateEl.textContent = winRate + '%';
        }
    }
    
    // Update Advanced Statistics
    if (stats.totalWinAmount !== undefined) {
        const totalWinAmountEl = document.getElementById('totalWinAmount');
        if (totalWinAmountEl) {
            totalWinAmountEl.textContent = stats.totalWinAmount.toLocaleString('vi-VN') + 'đ';
        }
    }
    
    if (stats.totalLossAmount !== undefined) {
        const totalLossAmountEl = document.getElementById('totalLossAmount');
        if (totalLossAmountEl) {
            totalLossAmountEl.textContent = stats.totalLossAmount.toLocaleString('vi-VN') + 'đ';
        }
    }
    
    if (stats.currentWinStreak !== undefined) {
        const currentWinStreakEl = document.getElementById('currentWinStreak');
        if (currentWinStreakEl) {
            currentWinStreakEl.textContent = stats.currentWinStreak;
            // Highlight if streak > 0
            if (stats.currentWinStreak > 0) {
                currentWinStreakEl.classList.add('streak-active');
            } else {
                currentWinStreakEl.classList.remove('streak-active');
            }
        }
    }
    
    if (stats.currentLossStreak !== undefined) {
        const currentLossStreakEl = document.getElementById('currentLossStreak');
        if (currentLossStreakEl) {
            currentLossStreakEl.textContent = stats.currentLossStreak;
            // Highlight if streak > 0
            if (stats.currentLossStreak > 0) {
                currentLossStreakEl.classList.add('loss-streak-active');
            } else {
                currentLossStreakEl.classList.remove('loss-streak-active');
            }
        }
    }
    
    // Update max streaks (we need to track these separately on client side)
    if (stats.currentWinStreak !== undefined) {
        const maxWinStreakEl = document.getElementById('maxWinStreak');
        if (maxWinStreakEl) {
            const currentMax = parseInt(maxWinStreakEl.textContent) || 0;
            if (stats.currentWinStreak > currentMax) {
                maxWinStreakEl.textContent = stats.currentWinStreak;
            }
        }
    }
    
    if (stats.currentLossStreak !== undefined) {
        const maxLossStreakEl = document.getElementById('maxLossStreak');
        if (maxLossStreakEl) {
            const currentMax = parseInt(maxLossStreakEl.textContent) || 0;
            if (stats.currentLossStreak > currentMax) {
                maxLossStreakEl.textContent = stats.currentLossStreak;
            }
        }
    }
    
    // Update Highest Bet
    if (stats.highestBet !== undefined || stats.nextBetAmount !== undefined) {
        const highestBetEl = document.getElementById('highestBet');
        if (highestBetEl) {
            const highestValue = stats.highestBet || stats.nextBetAmount || 0;
            const currentHighest = parseInt(highestBetEl.textContent.replace(/[^\d]/g, '')) || 0;
            if (highestValue > currentHighest) {
                highestBetEl.textContent = highestValue.toLocaleString('vi-VN') + 'đ';
            }
        }
    }
    
    // Update Profit (Tổng Lãi/Lỗ = Số dư hiện tại - Số dư ban đầu)
    const totalProfitEl = document.getElementById('totalProfit');
    if (totalProfitEl) {
        let profit = 0;
        const bettingStats = getActiveStats();
        
        // Ưu tiên tính từ balance (nếu có initialBalance)
        if (bettingStats && bettingStats.initialBalance > 0 && bettingStats.currentBalance !== undefined) {
            profit = bettingStats.currentBalance - bettingStats.initialBalance;
        } 
        // Fallback: Tính từ totalWin - totalLoss
        else if (stats.totalWinAmount !== undefined && stats.totalLossAmount !== undefined) {
            profit = stats.totalWinAmount - stats.totalLossAmount;
        }
        
        totalProfitEl.textContent = (profit >= 0 ? '+' : '') + profit.toLocaleString('vi-VN') + 'đ';
        
        // Color code based on profit/loss
        totalProfitEl.className = 'stat-value';
        if (profit > 0) {
            totalProfitEl.classList.add('success');
        } else if (profit < 0) {
            totalProfitEl.classList.add('error');
        }
    }
    
    // Add to statistics history (optional)
    addStatsToHistory(stats);
}

// Highlight active banks
function highlightActiveBank(bankStatus) {
    const banks = ['bankL2', 'bankL3', 'bankL4', 'bankL5', 'bankL6'];
    const values = [bankStatus.L2, bankStatus.L3, bankStatus.L4, bankStatus.L5, bankStatus.L6];
    
    banks.forEach((bankId, index) => {
        const el = document.getElementById(bankId);
        if (el) {
            el.className = 'bank-value';
            
            if (values[index] > 0) {
                el.classList.add('bank-active');
                
                // Add intensity based on count
                if (values[index] >= 3) {
                    el.classList.add('bank-critical');
                } else if (values[index] >= 2) {
                    el.classList.add('bank-warning');
                }
            }
        }
    });
}

// Add stats to history for tracking
function addStatsToHistory(stats) {
    // Implement history tracking if needed
    // Can be used for charts or analysis
}

// Handle browser console logs
function handleBrowserLog(data) {
    // Add browser logs to system logs with special formatting
    const logType = data.logType || 'log';
    let level = 'info';
    
    if (logType === 'error') {
        level = 'error';
    } else if (logType === 'warning') {
        level = 'warning';
    }
    
    addSystemLog(`[Browser] ${data.message}`, level);
    
    // Parse bet result from browser logs to add to history
    parseBetResultFromLog(data.message);
}

// Parse bet result from browser log and add to history
function parseBetResultFromLog(logMessage) {
    if (!logMessage) return;
    
    const bettingStats = getActiveStats();
    if (!bettingStats) return;
    
    // Debug: Log all messages that contain bet-related keywords
    if (logMessage.includes('THẮNG') || logMessage.includes('THUA')) {
        console.log('🔍 [DEBUG] Checking bet log:', logMessage);
    }
    
    // Pattern 1: THẮNG (Martingale or FixedBet)
    // Example: "SOCKET (Martingale): THẮNG! Đặt cược EID 2 thành công. Cược: 1,000đ | Lãi vòng này: +980đ"
    // Example: "SOCKET (FixedBet): THẮNG! Cược 500đ (EID 2) thành công. Lãi vòng này: +490đ"
    const winPattern1 = /SOCKET \((Martingale|FixedBet)\): THẮNG! Đặt cược EID (\d+) thành công\. Cược: ([\d,]+)đ \| Lãi vòng này: \+([\d,]+)đ/;
    const winPattern2 = /SOCKET \((Martingale|FixedBet)\): THẮNG! Cược ([\d,]+)đ \(EID (\d+)\) thành công\. Lãi vòng này: \+([\d,]+)đ/;
    
    // Pattern 2: THUA (Martingale or FixedBet)
    // Example: "SOCKET (Martingale): THUA! Đặt cược EID 2 thất bại. Cược: 1,000đ | Lỗ vòng này: -1,000đ"
    // Example: "SOCKET (FixedBet): THUA! Cược 500đ (EID 2) thất bại. Lỗ vòng này: -500đ"
    // Example (Martingale): "SOCKET (Martingale): THUA! Cược 2 nhưng kết quả là 5. Cược: 10,000đ | Lỗ vòng này: -10,000đ | Lợi nhuận: -15,000đ"
    const lossPattern1 = /SOCKET \((Martingale|FixedBet)\): THUA! Đặt cược EID (\d+) thất bại\. Cược: ([\d,]+)đ \| Lỗ vòng này: -([\d,]+)đ/;
    const lossPattern2 = /SOCKET \((Martingale|FixedBet)\): THUA! Cược ([\d,]+)đ \(EID (\d+)\) thất bại\. Lỗ vòng này: -([\d,]+)đ/;
    // Pattern 3: THUA (Martingale with result info) - thêm pattern mới này
    const lossPattern3 = /SOCKET \((Martingale|FixedBet)\): THUA! Cược (\d+) nhưng kết quả là (?:\d+|Khác)\. Cược: ([\d,]+)đ \| Lỗ vòng này: -([\d,]+)đ/;
    
    let match;
    let betData = null;
    
    // Check WIN patterns
    if ((match = logMessage.match(winPattern1))) {
        // Pattern 1: "Đặt cược EID 2 thành công. Cược: 1,000đ"
        betData = {
            betAmount: parseInt(match[3].replace(/,/g, '')),
            eid: parseInt(match[2]),
            result: 'win',
            profit: parseInt(match[4].replace(/,/g, ''))
        };
        console.log('✅ Matched winPattern1 (Martingale/FixedBet WIN):', betData);
    } else if ((match = logMessage.match(winPattern2))) {
        // Pattern 2: "Cược 500đ (EID 2) thành công"
        betData = {
            betAmount: parseInt(match[2].replace(/,/g, '')),
            eid: parseInt(match[3]),
            result: 'win',
            profit: parseInt(match[4].replace(/,/g, ''))
        };
        console.log('✅ Matched winPattern2 (Martingale/FixedBet WIN alt format):', betData);
    }
    // Check LOSS patterns
    else if ((match = logMessage.match(lossPattern1))) {
        // Pattern 1: "Đặt cược EID 2 thất bại. Cược: 1,000đ"
        betData = {
            betAmount: parseInt(match[3].replace(/,/g, '')),
            eid: parseInt(match[2]),
            result: 'loss',
            profit: -parseInt(match[4].replace(/,/g, ''))
        };
        console.log('✅ Matched lossPattern1 (Martingale/FixedBet LOSS):', betData);
    } else if ((match = logMessage.match(lossPattern2))) {
        // Pattern 2: "Cược 500đ (EID 2) thất bại"
        betData = {
            betAmount: parseInt(match[2].replace(/,/g, '')),
            eid: parseInt(match[3]),
            result: 'loss',
            profit: -parseInt(match[4].replace(/,/g, ''))
        };
        console.log('✅ Matched lossPattern2 (Martingale/FixedBet LOSS alt format):', betData);
    } else if ((match = logMessage.match(lossPattern3))) {
        // Pattern 3: "THUA! Cược 2 nhưng kết quả là 5. Cược: 10,000đ | Lỗ vòng này: -10,000đ"
        betData = {
            betAmount: parseInt(match[3].replace(/,/g, '')),
            eid: parseInt(match[2]),
            result: 'loss',
            profit: -parseInt(match[4].replace(/,/g, ''))
        };
        console.log('✅ Matched lossPattern3 (Martingale LOSS with result info):', betData);
    } else {
        // No pattern matched - log for debugging
        if (logMessage.includes('Martingale') && (logMessage.includes('THẮNG') || logMessage.includes('THUA'))) {
            console.warn('⚠️ Martingale bet log did NOT match any pattern:', logMessage);
        }
    }
    
    // If we successfully parsed a bet result, add to history
    if (betData) {
        console.log('📜 Parsed bet from log:', betData);
        
        // Create unique hash for this bet to prevent duplicate processing
        // Use timestamp to make hash more unique and reduce false positives
        const recentHash = `${betData.betAmount}-${betData.eid}-${betData.result}-${betData.profit}`;
        const now = Date.now();
        
        // Check if we've already processed this exact bet very recently (within 200ms)
        // This prevents duplicate log entries that occur within milliseconds
        if (processedLogCache.has(recentHash)) {
            const lastProcessedTime = processedLogCache.get(recentHash);
            if (now - lastProcessedTime < 200) {
                console.log('⚠️ Already processed this bet log recently (< 200ms), skipping:', recentHash);
                return;
            }
        }
        
        // Add to cache with timestamp
        processedLogCache.set(recentHash, now);
        
        // Auto-remove after 300ms to allow new bets with same values
        // Reduced from 500ms to 300ms for faster refresh
        setTimeout(() => {
            processedLogCache.delete(recentHash);
        }, 300);
        
        // Get current bet level (estimate based on bet amount)
        // Use bettingStats.betAmounts if available, otherwise use default
        const betAmounts = bettingStats.betAmounts || [1000, 5000, 10000, 10000, 10000];
        let currentBetLevel = betAmounts.indexOf(betData.betAmount) + 1;
        if (currentBetLevel === 0) currentBetLevel = 1; // Default if not found
        
        addBetToHistory({
            betAmount: betData.betAmount,
            eid: betData.eid,
            result: betData.result,
            profit: betData.profit,
            bankStatus: {
                L2: bettingStats.L2Bank || 0,
                L3: bettingStats.L3Bank || 0,
                L4: bettingStats.L4Bank || 0,
                L5: bettingStats.L5Bank || 0,
                L6: bettingStats.L6Bank || 0
            },
            currentBetLevel: currentBetLevel,
            maxBetLevel: 5,
            totalWinAmount: bettingStats.totalWinAmount || 0,
            totalLossAmount: bettingStats.totalLossAmount || 0
        });
    }
    
    // Parse bank status updates from logs
    // Example: "SOCKET (Bank): +1 Bộ 2. Tổng: 3"
    const bankUpdatePattern = /SOCKET \(Bank\): [+\-]?\d+ Bộ (\d+)\. Tổng: (\d+)/;
    const bankMatch = logMessage.match(bankUpdatePattern);
    if (bankMatch) {
        const bankLevel = parseInt(bankMatch[1]);
        const bankCount = parseInt(bankMatch[2]);
        
        // Update bettingStats bank count
        if (bankLevel === 2) bettingStats.L2Bank = bankCount;
        else if (bankLevel === 3) bettingStats.L3Bank = bankCount;
        else if (bankLevel === 4) bettingStats.L4Bank = bankCount;
        else if (bankLevel === 5) bettingStats.L5Bank = bankCount;
        else if (bankLevel === 6) bettingStats.L6Bank = bankCount;
        
        console.log(`📊 Updated Bank L${bankLevel}: ${bankCount}`);
    }
}

// ==================== BET HISTORY MANAGEMENT ====================

const betHistory = [];
const MAX_HISTORY_ITEMS = 20;
const processedLogCache = new Map(); // Track processed logs with timestamps to prevent duplicates

/**
 * Add bet result to history
 * @param {Object} betData - Bet result data
 */
function addBetToHistory(betData) {
    // Skip if bet amount is 0 or invalid
    if (!betData.betAmount || betData.betAmount === 0) {
        console.log('⚠️ Invalid bet amount (0đ), skipping:', betData);
        return;
    }
    
    // Check if the LAST item in history is EXACTLY the same within 1 second
    // This catches ONLY true duplicates from immediate double-calls
    if (betHistory.length > 0) {
        const lastItem = betHistory[0]; // First item (most recent)
        const timeDiff = Date.now() - lastItem.timestamp.getTime();
        
        // Only consider it a duplicate if ALL values match AND it happened within 1 second
        if (timeDiff < 1000 &&
            lastItem.betAmount === betData.betAmount &&
            lastItem.eid === betData.eid &&
            lastItem.result === betData.result &&
            lastItem.profit === betData.profit) {
            console.log('⚠️ Exact duplicate within 1s detected, skipping:', betData);
            return; // Skip duplicate
        }
    }
    
    const historyItem = {
        timestamp: new Date(),
        betAmount: betData.betAmount || 0,
        eid: betData.eid || '-',
        result: betData.result || 'unknown', // 'win' or 'loss'
        profit: betData.profit || 0,
        bankStatus: betData.bankStatus || {
            L2: 0, L3: 0, L4: 0, L5: 0, L6: 0
        },
        currentBetLevel: betData.currentBetLevel || 1,
        maxBetLevel: betData.maxBetLevel || 5,
        totalWinAmount: betData.totalWinAmount || 0,
        totalLossAmount: betData.totalLossAmount || 0
    };
    
    console.log('✅ Adding bet to history:', historyItem);
    
    // Add to beginning of array
    betHistory.unshift(historyItem);
    
    // Keep only last MAX_HISTORY_ITEMS
    if (betHistory.length > MAX_HISTORY_ITEMS) {
        betHistory.pop();
    }
    
    // Update UI
    renderBetHistory();
}

/**
 * Render bet history to UI
 */
function renderBetHistory() {
    const container = document.getElementById('betHistoryList');
    const emptyMessage = document.getElementById('betHistoryEmpty');
    const countSpan = document.getElementById('historyCount');
    
    if (!container) return;
    
    // Update count
    if (countSpan) {
        countSpan.textContent = betHistory.length;
    }
    
    // Show/hide empty message
    if (betHistory.length === 0) {
        if (emptyMessage) emptyMessage.style.display = 'flex';
        container.innerHTML = '';
        return;
    }
    
    if (emptyMessage) emptyMessage.style.display = 'none';
    
    // Render history items
    container.innerHTML = betHistory.map((item, index) => {
        const isWin = item.result === 'win';
        const profitClass = item.profit >= 0 ? 'profit' : 'loss';
        const profitSign = item.profit >= 0 ? '+' : '';
        
        return `
            <div class="bet-history-item ${item.result}">
                <div class="bet-history-header">
                    <span class="bet-history-time">
                        🕒 ${formatTime(item.timestamp)}
                    </span>
                    <span class="bet-history-result ${item.result}">
                        ${isWin ? '✅ THẮNG' : '❌ THUA'}
                    </span>
                </div>
                
                <div class="bet-history-details">
                    <div class="bet-detail-item">
                        <span class="bet-detail-label">💰 Số tiền cược:</span>
                        <span class="bet-detail-value">${item.betAmount.toLocaleString('vi-VN')}đ</span>
                    </div>
                    <div class="bet-detail-item">
                        <span class="bet-detail-label">🎯 EID:</span>
                        <span class="bet-detail-value">${item.eid}</span>
                    </div>
                    <div class="bet-detail-item">
                        <span class="bet-detail-label">📊 Lợi nhuận:</span>
                        <span class="bet-detail-value ${profitClass}">
                            ${profitSign}${item.profit.toLocaleString('vi-VN')}đ
                        </span>
                    </div>
                    <div class="bet-detail-item">
                        <span class="bet-detail-label">📈 Mức cược:</span>
                        <span class="bet-detail-value">Mức ${item.currentBetLevel}/${item.maxBetLevel}</span>
                    </div>
                </div>
                
                <div class="bet-history-bank">
                    <span class="bank-badge">Bộ 2: ${item.bankStatus.L2}</span>
                    <span class="bank-badge">Bộ 3: ${item.bankStatus.L3}</span>
                    <span class="bank-badge">Bộ 4: ${item.bankStatus.L4}</span>
                    <span class="bank-badge">Bộ 5: ${item.bankStatus.L5}</span>
                    <span class="bank-badge">Bộ 6: ${item.bankStatus.L6}</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Format time for history display
 * @param {Date} date - Date object
 * @returns {string} - Formatted time string
 */
function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

/**
 * Clear bet history
 */
function clearBetHistory() {
    betHistory.length = 0;
    renderBetHistory();
}

// Event listener for clear history button
document.addEventListener('DOMContentLoaded', function() {
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', function() {
            if (confirm('Bạn có chắc muốn xóa lịch sử đặt cược?')) {
                clearBetHistory();
            }
        });
    }
});


