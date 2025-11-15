// WebSocket connection to server
let ws = null;
let isConnected = false;
let isPaused = false;
let autoScroll = true;
let showTimestamp = true;
let isAutomationRunning = false;

// Betting statistics
let bettingStats = {
    initialBalance: 0,
    currentBalance: 0,
    baseBetAmount: 500,
    currentBetAmount: 500,
    winCount: 0,
    lossCount: 0,
    totalProfit: 0,
    totalBets: 0,
    history: []
};

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
    const formData = {
        url: document.getElementById('url').value,
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
        joinGameXoc: document.getElementById('joinGameXoc').checked,
        enableWebSocketHook: document.getElementById('enableWebSocketHook').checked,
        baseBetAmount: parseInt(document.getElementById('baseBetAmount').value) || 500,
        initialBalance: parseInt(document.getElementById('initialBalance').value) || 0,
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
    
    // Initialize betting stats
    bettingStats.baseBetAmount = formData.baseBetAmount;
    bettingStats.currentBetAmount = formData.baseBetAmount;
    bettingStats.initialBalance = formData.initialBalance;
    bettingStats.currentBalance = formData.initialBalance;
    bettingStats.winCount = 0;
    bettingStats.lossCount = 0;
    bettingStats.totalProfit = 0;
    bettingStats.totalBets = 0;
    bettingStats.history = [];
    updateBettingStatsDisplay();
    
    // Show betting stats panel
    document.getElementById('bettingStatsSection').style.display = 'block';
    
    // Update UI
    isAutomationRunning = true;
    updateAutomationStatus('running');
    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    showFormMessage('Đang khởi động automation...', 'info');
    
    // Clear old logs
    clearAllLogs();
    
    // Send request
    try {
        addSystemLog('🚀 Bắt đầu gửi request đến server...', 'info');
        
        const response = await fetch('/api/v1/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
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
    
    addSystemLog('⏹️ Đang dừng automation...', 'warning');
    showFormMessage('Automation đã bị dừng bởi người dùng', 'info');
    resetAutomationUI();
}

// Reset automation UI
function resetAutomationUI() {
    isAutomationRunning = false;
    updateAutomationStatus('idle');
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
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
    
    // Stop betting button
    const stopBettingBtn = document.getElementById('stopBettingBtn');
    if (stopBettingBtn) {
        stopBettingBtn.addEventListener('click', handleStopBetting);
    }
    
    // Reset stats button
    const resetStatsBtn = document.getElementById('resetStatsBtn');
    if (resetStatsBtn) {
        resetStatsBtn.addEventListener('click', handleResetStats);
    }
    
    // Export logs
    document.getElementById('exportLogsBtn').addEventListener('click', () => {
        const logs = {
            timestamp: new Date().toISOString(),
            steps: Array.from(document.getElementById('stepLogs').children).map(el => el.textContent),
            websocket: Array.from(document.getElementById('wsLogs').children).map(el => el.textContent),
            system: Array.from(document.getElementById('systemLogs').children).map(el => el.textContent),
            statistics: stats,
            bettingStats: bettingStats
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
    
    switch(event) {
        case 'bet-placed':
            bettingStats.totalBets++;
            bettingStats.currentBetAmount = amount;
            addSystemLog(`🎲 Đặt cược EID ${eid} với số tiền: ${amount.toLocaleString()}`, 'info');
            break;
            
        case 'bet-win':
            bettingStats.winCount++;
            bettingStats.currentBetAmount = bettingStats.baseBetAmount; // Reset to base
            const winProfit = amount; // Profit from win
            bettingStats.totalProfit += winProfit;
            bettingStats.currentBalance += winProfit;
            
            addBettingHistory('win', eid, amount, winProfit);
            addSystemLog(`✅ THẮNG! EID ${eid} | Tiền cược: ${amount.toLocaleString()} | Lãi: +${winProfit.toLocaleString()}`, 'success');
            break;
            
        case 'bet-loss':
            bettingStats.lossCount++;
            bettingStats.currentBetAmount = amount * 2; // Double for next bet (Martingale)
            const lossAmount = -amount;
            bettingStats.totalProfit += lossAmount;
            bettingStats.currentBalance += lossAmount;
            
            addBettingHistory('loss', eid, amount, lossAmount);
            addSystemLog(`❌ THUA! EID ${eid} | Tiền cược: ${amount.toLocaleString()} | Lỗ: ${lossAmount.toLocaleString()}`, 'error');
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
    console.log('🔄 Updating betting stats display...', bettingStats);
    
    const currentBalanceEl = document.getElementById('currentBalance');
    const currentBetEl = document.getElementById('currentBetDisplay');
    const winCountEl = document.getElementById('winCount');
    const lossCountEl = document.getElementById('lossCount');
    const totalProfitEl = document.getElementById('totalProfit');
    const totalBetsEl = document.getElementById('totalBets');
    
    console.log('🔍 Elements found:', {
        currentBalanceEl: !!currentBalanceEl,
        currentBetEl: !!currentBetEl,
        winCountEl: !!winCountEl,
        lossCountEl: !!lossCountEl,
        totalProfitEl: !!totalProfitEl,
        totalBetsEl: !!totalBetsEl
    });
    
    if (currentBalanceEl) {
        currentBalanceEl.textContent = bettingStats.currentBalance.toLocaleString();
        console.log('✅ Updated currentBalance:', currentBalanceEl.textContent);
        // Add color based on profit/loss
        if (bettingStats.currentBalance > bettingStats.initialBalance) {
            currentBalanceEl.style.color = 'var(--success-color)';
        } else if (bettingStats.currentBalance < bettingStats.initialBalance) {
            currentBalanceEl.style.color = 'var(--danger-color)';
        } else {
            currentBalanceEl.style.color = 'var(--text-primary)';
        }
    } else {
        console.error('❌ Element currentBalance not found!');
    }
    
    if (currentBetEl) {
        currentBetEl.textContent = bettingStats.currentBetAmount.toLocaleString();
        console.log('✅ Updated currentBet:', currentBetEl.textContent);
    }
    
    if (winCountEl) {
        winCountEl.textContent = bettingStats.winCount;
        console.log('✅ Updated winCount:', winCountEl.textContent);
    }
    
    if (lossCountEl) {
        lossCountEl.textContent = bettingStats.lossCount;
        console.log('✅ Updated lossCount:', lossCountEl.textContent);
    }
    
    if (totalProfitEl) {
        const profit = bettingStats.totalProfit;
        totalProfitEl.textContent = (profit >= 0 ? '+' : '') + profit.toLocaleString();
        totalProfitEl.className = 'stat-value ' + (profit >= 0 ? 'positive' : 'negative');
        console.log('✅ Updated totalProfit:', totalProfitEl.textContent);
    }
    
    if (totalBetsEl) {
        totalBetsEl.textContent = bettingStats.totalBets;
        console.log('✅ Updated totalBets:', totalBetsEl.textContent);
    }
}

// Add betting history item
function addBettingHistory(result, eid, amount, profit) {
    const historyList = document.getElementById('bettingHistory');
    if (!historyList) return;
    
    // Remove empty message if exists
    const emptyMsg = historyList.querySelector('.history-empty');
    if (emptyMsg) {
        emptyMsg.remove();
    }
    
    // Create history item
    const item = document.createElement('div');
    item.className = `history-item ${result}`;
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN');
    
    item.innerHTML = `
        <div class="history-info">
            <div class="history-time">${timeStr}</div>
            <div class="history-bet">
                Cược EID <strong>${eid}</strong> | Số tiền: <strong>${amount.toLocaleString()}</strong>
            </div>
        </div>
        <div class="history-result ${result}">
            ${result === 'win' ? '✅ +' : '❌ '}${Math.abs(profit).toLocaleString()}
        </div>
    `;
    
    // Add to top of list
    historyList.insertBefore(item, historyList.firstChild);
    
    // Keep only last 50 items
    while (historyList.children.length > 50) {
        historyList.removeChild(historyList.lastChild);
    }
    
    // Save to history array
    bettingStats.history.unshift({
        time: now,
        result,
        eid,
        amount,
        profit
    });
    
    // Keep only last 100 in array
    if (bettingStats.history.length > 100) {
        bettingStats.history = bettingStats.history.slice(0, 100);
    }
}

// Reset betting stats
function resetBettingStats() {
    if (!confirm('Bạn có chắc muốn reset tất cả thống kê cược?')) {
        return;
    }
    
    bettingStats = {
        initialBalance: bettingStats.initialBalance,
        currentBalance: bettingStats.initialBalance,
        baseBetAmount: bettingStats.baseBetAmount,
        currentBetAmount: bettingStats.baseBetAmount,
        winCount: 0,
        lossCount: 0,
        totalProfit: 0,
        totalBets: 0,
        history: []
    };
    
    updateBettingStatsDisplay();
    
    // Clear history display
    const historyList = document.getElementById('bettingHistory');
    historyList.innerHTML = '<div class="history-empty">Chưa có cược nào</div>';
    
    addSystemLog('✓ Đã reset thống kê cược', 'success');
}

// Handle stop betting button
function handleStopBetting() {
    if (!confirm('Bạn có chắc muốn DỪNG chương trình? Automation sẽ không đặt cược nữa.')) {
        return;
    }
    
    // Send stop command via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'stop-automation',
            timestamp: Date.now()
        }));
    }
    
    addSystemLog('🛑 ĐÃ GỬI LỆNH DỪNG CHƯƠNG TRÌNH', 'warning');
    addSystemLog('⚠️ Chương trình sẽ dừng sau khi hoàn thành cược hiện tại (nếu có)', 'warning');
}

// Handle reset stats button
function handleResetStats() {
    resetBettingStats();
}

// Handle betting statistics update (real-time from page)
function handleBettingStatistics(data) {
    console.log('📊 Received betting statistics:', data);
    
    // Update all statistics from injected code
    if (data.currentBalance !== undefined) {
        bettingStats.currentBalance = data.currentBalance;
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
    if (data.profit !== undefined) {
        bettingStats.totalProfit = data.profit;
    }
    
    console.log('📊 Updated bettingStats:', bettingStats);
    
    // Update display
    updateBettingStatsDisplay();
    
    // Update advanced stats
    updateAdvancedStats(data);
    
    // Update bank status
    updateBankStatus(data);
}

// Update advanced statistics display
function updateAdvancedStats(data) {
    // Win rate
    const winRateEl = document.getElementById('winRate');
    if (winRateEl && data.winRate !== undefined) {
        winRateEl.textContent = `${data.winRate}%`;
    }
    
    // Highest bet
    const highestBetEl = document.getElementById('highestBet');
    if (highestBetEl && data.highestBetAmount !== undefined) {
        highestBetEl.textContent = data.highestBetAmount.toLocaleString();
    }
    
    // Runtime
    const runtimeEl = document.getElementById('runtime');
    if (runtimeEl && data.runtime !== undefined) {
        const hours = Math.floor(data.runtime / 3600);
        const minutes = Math.floor((data.runtime % 3600) / 60);
        const seconds = data.runtime % 60;
        runtimeEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    
    // Total win/loss amounts
    const totalWinAmountEl = document.getElementById('totalWinAmount');
    if (totalWinAmountEl && data.totalWinAmount !== undefined) {
        totalWinAmountEl.textContent = `+${data.totalWinAmount.toLocaleString()}`;
    }
    
    const totalLossAmountEl = document.getElementById('totalLossAmount');
    if (totalLossAmountEl && data.totalLossAmount !== undefined) {
        totalLossAmountEl.textContent = `-${data.totalLossAmount.toLocaleString()}`;
    }
    
    // Consecutive wins/losses
    const currentWinStreakEl = document.getElementById('currentWinStreak');
    if (currentWinStreakEl && data.currentConsecutiveWins !== undefined) {
        currentWinStreakEl.textContent = data.currentConsecutiveWins;
    }
    
    const currentLossStreakEl = document.getElementById('currentLossStreak');
    if (currentLossStreakEl && data.currentConsecutiveLosses !== undefined) {
        currentLossStreakEl.textContent = data.currentConsecutiveLosses;
    }
    
    const maxWinStreakEl = document.getElementById('maxWinStreak');
    if (maxWinStreakEl && data.maxConsecutiveWins !== undefined) {
        maxWinStreakEl.textContent = data.maxConsecutiveWins;
    }
    
    const maxLossStreakEl = document.getElementById('maxLossStreak');
    if (maxLossStreakEl && data.maxConsecutiveLosses !== undefined) {
        maxLossStreakEl.textContent = data.maxConsecutiveLosses;
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
        
        if (lastBetEl) lastBetEl.textContent = stats.lastBet.amount.toLocaleString() + 'đ';
        if (lastBetEidEl) lastBetEidEl.textContent = 'EID ' + stats.lastBet.eid;
    }
    
    // Update Next Bet Amount
    if (stats.nextBetAmount) {
        const nextBetEl = document.getElementById('nextBetAmount');
        if (nextBetEl) {
            nextBetEl.textContent = stats.nextBetAmount.toLocaleString() + 'đ';
            nextBetEl.className = 'stat-value';
            
            // Highlight if doubled (Martingale)
            if (stats.nextBetAmount > bettingStats.baseBetAmount) {
                nextBetEl.classList.add('bet-doubled');
            }
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
}


