const puppeteer = require('puppeteer');
const puppeteerCore = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// ===== GOLOGIN DISABLED =====
// GoLogin is ES Module - use dynamic import
// let GoLogin = null;
// ===== END GOLOGIN DISABLED =====

const { performFullLoginViaImages } = require('./flows/login_flow');
const { setupWebSocketHook, listenForWebSocketCreation } = require('./websocket/websocket_hook');
const { cleanupAllTempFiles } = require('./helpers/cleanup_helper');
const sessionManager = require('./session_manager');

// ===== GOLOGIN DISABLED =====
/**
 * Load GoLogin dynamically (ESM     // Final wait for any remaining animations/transitions
    logger.log('⏳ Chờ animations/transitions hoàn tất...');
    await page.waitForTimeout(1500);
    
    logger.log('═══════════════════════════════════════════════════════');
    logger.log('🔍 KIỂM TRA PAGE LOAD VÀ BUTTON LOGIN');
    logger.log('═══════════════════════════════════════════════════════');
    
    // ĐỢI PAGE LOAD HOÀN TOÀN TRƯỚC
    logger.log('⏳ Đợi page load hoàn toàn (networkidle, domcontentloaded)...');
    try {
      await page.waitForNetworkIdle({ timeout: 30000, idleTime: 2000 });
      logger.log('✅ Network idle - page đã load xong');
    } catch (e) {
      logger.warn('⚠️ Network không idle sau 30s, tiếp tục...');
    }
    
    // Đợi thêm để đảm bảo UI render xong
    await page.waitForTimeout(3000);
    logger.log('✅ Đã đợi thêm 3s để UI render');
    
    // Kiểm tra xem có đang trong loading state không
    const isLoading = await page.evaluate(() => {
      // Check loading text
      const loadingText = document.body.innerText;
      if (loadingText.includes('ĐANG TẢI') || loadingText.includes('LOADING')) {
        return true;
      }
      
      // Check loading spinner/overlay
      const loadingElements = document.querySelectorAll('[class*="loading"], [class*="spinner"]');
      for (const el of loadingElements) {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          return true;
        }
      }
      
      return false;
    });
    
    if (isLoading) {
      logger.log('⏳ Page vẫn đang loading, chờ thêm...');
      await page.waitForTimeout(5000);
    }
    
    // Chờ đến khi button login xuất hiện trước khi bắt đầu login flow
    const { waitForTemplate } = require('./helpers/matcher_helper');
    const cfg = require('./config/config');
    
    logger.log('⏳ Đang chờ button login (button_login.png) xuất hiện...');
/*
async function loadGoLogin() {
  if (!GoLogin) {
    const goLoginModule = await import('gologin');
    GoLogin = goLoginModule.default;
  }
  return GoLogin;
}
*/
// ===== END GOLOGIN DISABLED =====

/**
 * Tạo browser instance dựa trên config (GoLogin hoặc Puppeteer thường)
 */
async function createBrowserInstance(config, logger) {
  // ===== GOLOGIN DISABLED - Comment out để tắt GoLogin =====
  /*
  // Nếu sử dụng GoLogin
  if (config.useGoLogin && config.goLoginToken && config.goLoginProfileId) {
    logger.log('🚀 Khởi động GoLogin browser...');
    
    try {
      // Load GoLogin module dynamically
      const GoLoginClass = await loadGoLogin();
      
      const GL = new GoLoginClass({
        token: config.goLoginToken,
        profile_id: config.goLoginProfileId,
      });
      
      const { status, wsUrl } = await GL.start();
      
      if (status !== 'success' || !wsUrl) {
        throw new Error('GoLogin start failed or no wsUrl');
      }
      
      logger.log(`✓ GoLogin started, connecting to: ${wsUrl}`);
      
      const browser = await puppeteerCore.connect({
        browserWSEndpoint: wsUrl,
        ignoreHTTPSErrors: true,
      });
      
      logger.log('✓ Browser connected via GoLogin');
      
      return { browser, goLoginInstance: GL, proxyAddress: null };
    } catch (goLoginError) {
      logger.error('✗ GoLogin error:', goLoginError.message);
      logger.warn('⚠️ Fallback to regular Puppeteer...');
    }
  }
  
  // Nếu có WebSocket endpoint (GoLogin đã chạy sẵn)
  if (config.goLoginWsEndpoint) {
    logger.log('🔗 Connecting to existing browser via WebSocket...');
    
    try {
      const browser = await puppeteerCore.connect({
        browserWSEndpoint: config.goLoginWsEndpoint,
        ignoreHTTPSErrors: true,
      });
      
      logger.log('✓ Connected to existing browser');
      return { browser, goLoginInstance: null, proxyAddress: null };
    } catch (wsError) {
      logger.error('✗ WebSocket connect error:', wsError.message);
      logger.warn('⚠️ Fallback to regular Puppeteer...');
    }
  }
  */
  // ===== END GOLOGIN DISABLED =====
  
  // Fallback: Puppeteer thường
  logger.log('🌐 Launching regular Puppeteer browser...');
  
  // Build proxy address if provided
  let proxyAddress = null;
  if (config.proxyHost && config.proxyPort) {
    proxyAddress = `${config.proxyHost}:${config.proxyPort}`;
    logger.log(`[PROXY] Using proxy: ${proxyAddress}`);
  } else if (process.env.PROXY_HOST && process.env.PROXY_PORT) {
    proxyAddress = `${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
    logger.log(`[PROXY] Using proxy from env: ${proxyAddress}`);
  }
  
  // Xác định headless mode (mặc định true nếu undefined)
  const isHeadless = config.headless === undefined ? true : config.headless;
  
  // Log để debug
  logger.log(`📋 Config headless value: ${config.headless} (type: ${typeof config.headless})`);
  logger.log(`📋 Resolved isHeadless: ${isHeadless} (type: ${typeof isHeadless})`);
  
  const launchOptions = {
    headless: isHeadless ? 'new' : false, // Puppeteer v21+ sử dụng 'new' hoặc false
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ],
    dumpio: !isHeadless,
    devtools: !isHeadless // Mở DevTools khi visible
  };
  
  // Chỉ thêm start-maximized khi visible
  if (!isHeadless) {
    launchOptions.args.push('--start-maximized');
  }
  
  logger.log(`🖥️ Browser mode: ${isHeadless ? 'HEADLESS (ngầm)' : 'VISIBLE (hiển thị)'}`);
  logger.log(`📋 Headless option: ${launchOptions.headless}`);
  logger.log(`📋 Launch args: ${launchOptions.args.join(', ')}`);
  
  // Add proxy argument if specified
  if (proxyAddress) {
    launchOptions.args.push(`--proxy-server=${proxyAddress}`);
  }
  
  // ===== TỰ ĐỘNG TÌM CHROME (ưu tiên bundled Chrome) =====
  const path = require('path');
  const fs = require('fs');
  
  // Try to find bundled Chrome (for standalone distribution)
  const bundledChromePath = path.join(__dirname, '..', '..', '..', 'chrome', 'chrome.exe');
  
  // Check environment variable first
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    logger.log(`🌐 Using Chrome from env variable: ${launchOptions.executablePath}`);
  } else if (fs.existsSync(bundledChromePath)) {
    // Use bundled Chrome if available (standalone mode)
    launchOptions.executablePath = bundledChromePath;
    logger.log(`🌐 Using bundled Chrome: ${launchOptions.executablePath}`);
  } else {
    // Let Puppeteer find Chrome automatically
    logger.log(`🌐 Using Puppeteer's default Chrome`);
  }
  
  const browser = await puppeteer.launch(launchOptions);
  logger.log('✓ Regular browser launched');
  
  return { browser, goLoginInstance: null, proxyAddress };
}

/**
 * Main entrypoint kept similar: payload { url, actions, loginRequest, proxyHost, proxyPort }
 */
async function runAutomation(payload, uploadedFiles) {
  // Log payload để debug
  console.log(`[DEBUG] payload.headlessMode: ${payload.headlessMode} (type: ${typeof payload.headlessMode})`);
  console.log(`[DEBUG] payload.sessionId: ${payload.sessionId}`);
  
  // SỬ DỤNG sessionId TỪ PAYLOAD (từ client) hoặc tạo mới nếu không có
  let sessionId = payload.sessionId;
  
  if (!sessionId) {
    // Nếu không có sessionId từ client, tạo mới
    sessionId = sessionManager.createSession(
      payload.userId || 'default-user',
      {
        url: payload.url,
        username: payload.loginRequest?.username,
        password: payload.loginRequest?.password,
        baseBet: payload.baseBetAmount || 500,
        useGoLogin: payload.useGoLogin || false,
        goLoginToken: payload.goLoginToken || '',
        goLoginProfileId: payload.goLoginProfileId || '',
        goLoginWsEndpoint: payload.goLoginWsEndpoint || '',
        proxyHost: payload.proxyHost,
        proxyPort: payload.proxyPort
      }
    );
    console.log(`[Session ${sessionId}] 📝 Created new session`);
  } else {
    // Nếu có sessionId từ client, kiểm tra xem session đã tồn tại chưa
    let session = sessionManager.getSession(sessionId);
    if (!session) {
      // Session chưa tồn tại, tạo mới với sessionId từ client
      sessionManager.sessions.set(sessionId, {
        sessionId: sessionId,
        userId: payload.userId || 'default-user',
        browser: null,
        page: null,
        goLoginInstance: null,
        config: {
          url: payload.url,
          username: payload.loginRequest?.username,
          password: payload.loginRequest?.password,
          baseBet: payload.baseBetAmount || 500,
          betAmounts: payload.betAmounts || [10000, 13000, 25000, 53000, 50000],
          headless: payload.headlessMode !== false,
          useGoLogin: payload.useGoLogin || false,
          goLoginToken: payload.goLoginToken || '',
          goLoginProfileId: payload.goLoginProfileId || '',
          goLoginWsEndpoint: payload.goLoginWsEndpoint || '',
          proxyHost: payload.proxyHost,
          proxyPort: payload.proxyPort
        },
        stats: {
          bankStatus: { L2: 0, L3: 0, L4: 0, L5: 0, L6: 0 },
          currentBalance: 1000,
          totalBets: 0,
          totalWins: 0,
          totalLosses: 0,
          totalWinAmount: 0,
          totalLossAmount: 0,
          currentWinStreak: 0,
          currentLossStreak: 0,
          maxWinStreak: 0,
          maxLossStreak: 0
        },
        status: 'idle',
        error: null,
        createdAt: new Date(),
        lastActivity: new Date()
      });
      console.log(`[Session ${sessionId}] 📝 Created new session with client sessionId`);
    } else {
      console.log(`[Session ${sessionId}] 📝 Using existing session`);
    }
  }
  
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }
  
  // Update session status
  sessionManager.updateSession(sessionId, { status: 'running' });
  
  let browser = null;
  let goLoginInstance = null;
  let page = null;
  let proxyAddress = null;
  
  try {
    const devVisible = process.env.DEV_VISIBLE === 'true' || process.env.HEADLESS === 'false';
    
    // Log để debug
    console.log(`[Session ${sessionId}] 🔍 DEBUG payload.headlessMode:`, payload.headlessMode, typeof payload.headlessMode);
    
    // Create browser instance (GoLogin or regular Puppeteer)
    // Pass headlessMode directly from payload, not from session config
    const browserConfig = {
      ...session.config,
      headless: payload.headlessMode === undefined ? true : payload.headlessMode // Lấy trực tiếp từ payload
    };
    
    console.log(`[Session ${sessionId}] 🔍 DEBUG browserConfig.headless:`, browserConfig.headless, typeof browserConfig.headless);
    
    const browserResult = await createBrowserInstance(browserConfig, {
      log: (...args) => console.log(`[Session ${sessionId}]`, ...args),
      warn: (...args) => console.warn(`[Session ${sessionId}]`, ...args),
      error: (...args) => console.error(`[Session ${sessionId}]`, ...args)
    });
    
    browser = browserResult.browser;
    goLoginInstance = browserResult.goLoginInstance;
    proxyAddress = browserResult.proxyAddress;
    
    // Save browser instance to session
    sessionManager.updateSession(sessionId, { 
      browser, 
      goLoginInstance 
    });
    
    page = await browser.newPage();
    
    // Save page to session
    sessionManager.updateSession(sessionId, { page });
  
  // use a normal windowed viewport for predictable matching and debugging
  // avoid relying on window.screen which can force a fullscreen feeling; pick a sensible default
  await page.setViewport({ width: 1280, height: 800 });
  
  // Helper function to broadcast messages to WebSocket clients FOR THIS SESSION
  const broadcast = (data) => {
    sessionManager.broadcastToSession(sessionId, data);
  };
  
  // Broadcast automation start
  broadcast({ type: 'automation-start', timestamp: new Date().toISOString() });
  
  // lightweight logger for this run with WebSocket broadcasting
  const logger = {
    steps: [],
    log: (...args) => { 
      const message = `[Session ${sessionId}] ${args.join(' ')}`;
      console.log(message); 
      logger.steps.push({ level: 'info', text: message });
      broadcast({ type: 'log', level: 'info', message, timestamp: new Date().toISOString() });
    },
    warn: (...args) => { 
      const message = `[Session ${sessionId}] ${args.join(' ')}`;
      console.warn(message); 
      logger.steps.push({ level: 'warn', text: message });
      broadcast({ type: 'log', level: 'warn', message, timestamp: new Date().toISOString() });
    },
    error: (...args) => { 
      const message = `[Session ${sessionId}] ${args.join(' ')}`;
      console.error(message); 
      logger.steps.push({ level: 'error', text: message });
      broadcast({ type: 'log', level: 'error', message, timestamp: new Date().toISOString() });
    }
  };

  // ===== PROXY AUTHENTICATION =====
  // If proxy requires authentication, set up request interceptor
  if (payload.proxyUser && payload.proxyPassword) {
    logger.log(`[PROXY] Setting up authentication for proxy user: ${payload.proxyUser}`);
    await page.authenticate({
      username: payload.proxyUser,
      password: payload.proxyPassword
    });
  } else if (process.env.PROXY_USER && process.env.PROXY_PASSWORD) {
    logger.log(`[PROXY] Setting up authentication from env variables`);
    await page.authenticate({
      username: process.env.PROXY_USER,
      password: process.env.PROXY_PASSWORD
    });
  }

  // ===== VERIFY PROXY IP =====
  if (proxyAddress) {
    try {
      logger.log('🌐 Kiểm tra kết nối proxy...');
      await page.goto('https://api.ipify.org', { waitUntil: 'networkidle2', timeout: 30000 });
      
      const proxyIP = await page.evaluate(() => {
        return document.body.textContent.trim();
      });
      
      logger.log(`✓ IP hiện tại: ${proxyIP}`);
      page._proxyIP = proxyIP;
      
    } catch (err) {
      logger.error(`✗ Lỗi kiểm tra proxy: ${err.message}`);
    }
  }

  // Forward browser console messages and errors to Node console for debugging
  page.on('console', msg => {
    try {
      const text = msg.text();
      
      // === HANDLE BETTING EVENTS ===
      if (text.startsWith('[BET_EVENT]')) {
        try {
          const jsonStr = text.substring('[BET_EVENT]'.length);
          const betEvent = JSON.parse(jsonStr);
          
          // Broadcast to WebSocket clients FOR THIS SESSION ONLY
          broadcast({
            type: 'betting-event',
            ...betEvent
          });
          
          logger.log(`📊 Betting Event: ${betEvent.event} | EID: ${betEvent.eid} | Amount: ${betEvent.amount}`);
          return; // Don't log the raw [BET_EVENT] message
        } catch (parseErr) {
          logger.error('Failed to parse betting event:', parseErr.message);
        }
      }
      
      // === HANDLE BETTING STATISTICS (REAL-TIME) ===
      if (text.startsWith('[BETTING_STATS]')) {
        try {
          const jsonStr = text.substring('[BETTING_STATS]'.length);
          const statsData = JSON.parse(jsonStr);               
          // Broadcast to WebSocket clients FOR THIS SESSION ONLY
          broadcast({
            type: 'betting-stats',
            sessionId: sessionId, // Thêm sessionId để client filter được
            ...statsData
          });
          logger.log('✅ Broadcasted betting stats to session clients');
          
          return; // Don't log the raw stats message
        } catch (parseErr) {
          logger.error('Failed to parse betting statistics:', parseErr.message);
        }
      }
      
      // Bỏ qua log từ WebSocket hook
      if (text.includes('SOCKET') || text.includes('WebSocket') || text.includes('hook')) {
        return;
      }
      
      // Bỏ qua log về pause/resume flag sync (tránh spam)
      if (text.includes('Pause flag') || text.includes('Stop flag synced')) {
        return;
      }
      
      // Bỏ qua log không cần thiết từ game
      if (text.includes('safeRoundNumber') || 
          text.includes('convertUSD') || 
          text.includes('Create unpacker') ||
          text.includes('Cocos Creator') ||
          text.includes('LoadScene')) {
        return;
      }
      
      // Bỏ qua warning rỗng
      if (msg.type() === 'warning' && !text.trim()) {
        return;
      }
      
      const args = msg.args().map(a => a.toString());
      logger.log(`PAGE LOG [${msg.type()}]:`, ...args);
    } catch (e) {
      logger.log('PAGE LOG [unknown]:', msg.text());
    }
  });
  page.on('pageerror', err => logger.error('PAGE ERROR:', err && err.message ? err.message : err));
  page.on('requestfailed', r => logger.warn('PAGE REQUEST FAILED:', r.url(), r.failure && r.failure().errorText));

  const url = payload.url || 'about:blank';
  logger.log('Navigating to:', url);
  
  // ===== SETUP WEBSOCKET HOOK (BEFORE NAVIGATION) =====
  if (payload.enableWebSocketHook !== false) {
    try {
      logger.log('🔌 Khởi tạo WebSocket hook...');
      
      // Setup CDP listener for WebSocket creation events
      await listenForWebSocketCreation(page, logger);
      
      // Inject WebSocket hook script before page loads with baseBet, sessionId, showStatsOnScreen and betAmounts
      const baseBet = payload.baseBetAmount || 500; // Lấy từ form hoặc default 500
      const betAmounts = payload.betAmounts || [10000, 13000, 25000, 53000, 50000]; // Mảng 5 mức cược
      const showStatsOnScreen = payload.showStatsOnScreen !== false; // Default true
      await setupWebSocketHook(page, logger, { baseBet, betAmounts, sessionId, showStatsOnScreen });
      
      logger.log('✓ WebSocket hook đã sẵn sàng\n');
    } catch (wsError) {
      logger.error('✗ Lỗi setup WebSocket hook:', wsError.message);
    }
  }
  
  // Navigate to URL
  logger.log('🌐 Đang tải trang web...');
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  
  // ===== WAIT FOR PAGE FULLY LOADED =====
  logger.log('⏳ Đợi trang web load hoàn toàn...');
  
  // 1. Wait for document ready state
  await page.evaluate(() => {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', resolve);
      }
    });
  });
  logger.log('  ✓ Document ready state: complete');
  
  // 2. Wait for lazy-loaded content
  await page.waitForTimeout(2000);
  
  // 3. Wait for canvas/game elements to be present (if applicable)
  try {
    await page.waitForFunction(
      () => {
        // Check if canvas exists (for game pages)
        const canvas = document.querySelector('canvas');
        if (canvas) {
          return canvas.width > 0 && canvas.height > 0;
        }
        // For non-canvas pages, just check body is ready
        return document.body && document.body.children.length > 0;
      },
      { timeout: 10000 }
    );
    logger.log('  ✓ Canvas/DOM elements đã sẵn sàng');
  } catch (canvasErr) {
    logger.warn('  ⚠️ Không tìm thấy canvas hoặc timeout, tiếp tục...');
  }
  
  // 4. Wait for network to be completely idle
  try {
    await page.waitForNetworkIdle({ timeout: 10000, idleTime: 500 });
    logger.log('  ✓ Network đã idle');
  } catch (netErr) {
    logger.warn('  ⚠️ Network không idle sau 10s, tiếp tục...');
  }
  
  // 5. Additional wait for JavaScript execution and animations
  await page.waitForTimeout(1500);
  
  logger.log('✓ Trang web đã load hoàn toàn');
  
  // ===== WAIT FOR WEBSOCKET TO BE CREATED =====
  if (payload.enableWebSocketHook !== false) {
    try {
      logger.log('🔌 Đợi WebSocket được tạo...');
      
      // Get WebSocket state
      const { getWebSocketState } = require('./websocket/websocket_hook');
      const wsState = await getWebSocketState(page, logger, sessionId);
      
      if (wsState && wsState.exists) {
        logger.log(`✓ WebSocket: ${wsState.readyStateText} - ${wsState.url}`);
        if (wsState.bestRid) {
          logger.log(`✓ Best Room ID: ${wsState.bestRid}`);
        }
      } else if (wsState && wsState.timeout) {
        logger.warn('⚠️ Timeout: WebSocket chưa được tạo sau 30s');
        logger.warn('   Game có thể cần tương tác (click, login) để khởi tạo WebSocket');
        logger.warn('   Tiếp tục thực hiện các bước tiếp theo...');
      } else {
        logger.warn('⚠️ WebSocket chưa được tạo');
      }
    } catch (wsCheckError) {
      logger.warn('⚠️ Lỗi khi đợi WebSocket:', wsCheckError.message);
    }
  }
  
  // ===== LOG PROXY STATUS =====
  if (proxyAddress && page._proxyIP) {
    logger.log(`✓ Proxy: ${proxyAddress} (IP: ${page._proxyIP})`);
  } else if (proxyAddress) {
    logger.log(`✓ Proxy: ${proxyAddress}`);
  }

  // prepare uploaded templates map
  const projectRoot = process.env.PROJECT_ROOT || path.join(__dirname, '..');
  const templatesDir = path.join(projectRoot, 'uploads');
  if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });
  const templatesMap = {};
  (uploadedFiles || []).forEach(f => {
    const dst = path.join(templatesDir, f.originalname);
    try { fs.copyFileSync(f.path, dst); } catch(e) { /* ignore */ }
    templatesMap[f.originalname] = dst;
  });

  // register built-in resources folder
  const resourcesDir = path.join(__dirname, '..', 'resources');
  if (fs.existsSync(resourcesDir)) {
    try {
      for (const fn of fs.readdirSync(resourcesDir)) {
        if (!templatesMap[fn]) templatesMap[fn] = path.join(resourcesDir, fn);
      }
    } catch (e) {
      console.warn('Failed to read resourcesDir', resourcesDir, e.message);
    }
  }

  const results = [];
  logger.log('runAutomation -> start', { url });
  // keep browser open by default for inspection, only close when explicitly set to false
  const keepBrowser = !(payload.keepBrowser === false || process.env.KEEP_BROWSER === 'false');

  // If loginRequest provided, perform login flow
  if (payload.loginRequest) {
    logger.log('═══════════════════════════════════════════════════════');
    logger.log('🔐 CHUẨN BỊ THỰC HIỆN LOGIN FLOW');
    logger.log('═══════════════════════════════════════════════════════');
    
    // ===== FINAL VERIFICATION BEFORE LOGIN =====
    logger.log('⏳ Chờ thêm để đảm bảo trang hoàn toàn ổn định...');
    
    // Verify page is still responsive
    try {
      const readyState = await page.evaluate(() => document.readyState);
      logger.log(`✓ Document readyState: ${readyState}`);
      
      if (readyState !== 'complete') {
        logger.warn('⚠️ Document chưa hoàn toàn load, đợi thêm...');
        await page.waitForTimeout(2000);
      }
    } catch (evalErr) {
      logger.error('✗ Trang web không phản hồi:', evalErr.message);
      throw new Error('Page is not responsive before login');
    }
    
    // Check if any modal/popup is already visible
    try {
      const pageInfo = await page.evaluate(() => {
        const modals = document.querySelectorAll('[class*="modal"], [class*="popup"], [class*="dialog"]');
        const visibleModals = Array.from(modals).filter(m => {
          const style = window.getComputedStyle(m);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
        
        return {
          hasModal: visibleModals.length > 0,
          modalCount: visibleModals.length,
          bodyHeight: document.body.scrollHeight,
          bodyChildren: document.body.children.length
        };
      });
      
      logger.log(`ℹ️ Thông tin trang: ${pageInfo.bodyChildren} elements, height: ${pageInfo.bodyHeight}px`);
      
      if (pageInfo.hasModal) {
        logger.log(`ℹ️ Phát hiện ${pageInfo.modalCount} modal/popup đang mở`);
      } else {
        logger.log('✓ Không có modal/popup nào đang mở');
      }
    } catch (modalCheckErr) {
      logger.warn('⚠️ Không thể kiểm tra modal:', modalCheckErr.message);
    }
    
    // Final wait for any remaining animations/transitions
    logger.log('⏳ Chờ animations/transitions hoàn tất...');
    await page.waitForTimeout(1500);
    
    logger.log('═══════════════════════════════════════════════════════');
    logger.log('� KIỂM TRA BUTTON LOGIN TRƯỚC KHI BẮT ĐẦU');
    logger.log('═══════════════════════════════════════════════════════');
    
    // Chờ đến khi button login xuất hiện trước khi bắt đầu login flow
    const { waitForTemplate } = require('./helpers/matcher_helper');
    const cfg = require('./config/config');
    
    logger.log('⏳ Đang chờ button login (button_login.png) xuất hiện...');
    let buttonFound = false;
    const maxWaitTime = 120000; // 2 phút
    const startWaitTime = Date.now();
    
    while (!buttonFound && (Date.now() - startWaitTime < maxWaitTime)) {
      const btnCoords = await waitForTemplate(
        page,
        templatesMap,
        templatesDir,
        'button_login.png',
        15000, // Mỗi lần thử 10 giây
        cfg.TEMPLATE_INTERVAL_MS,
        logger
      );
      
      if (btnCoords) {
        // VALIDATION: Kiểm tra xem page đã thực sự sẵn sàng chưa
        logger.log(`   🔍 Tìm thấy button tại (${btnCoords.x}, ${btnCoords.y}), đang validate...`);
        
        // Check 1: Page không còn loading
        const stillLoading = await page.evaluate(() => {
          const text = document.body.innerText;
          return text.includes('ĐANG TẢI') || text.includes('LOADING') || text.includes('%');
        });
        
        if (stillLoading) {
          logger.log(`   ⚠️ Page vẫn đang loading, chờ thêm...`);
          await page.waitForTimeout(3000);
          continue; // Thử lại
        }
        
        // Check 2: Canvas đã load
        const canvasReady = await page.evaluate(() => {
          const canvas = document.querySelector('#GameCanvas');
          return canvas && canvas.width > 0 && canvas.height > 0;
        });
        
        if (!canvasReady) {
          logger.log(`   ⚠️ Canvas chưa sẵn sàng, chờ thêm...`);
          await page.waitForTimeout(2000);
          continue; // Thử lại
        }
        
        // Check 3: Đợi thêm một chút để chắc chắn UI đã stable
        await page.waitForTimeout(2000);
        
        buttonFound = true;
        logger.log('✅ Button login đã xuất hiện và page đã sẵn sàng! Bắt đầu login flow...');
      } else {
        const elapsed = Math.floor((Date.now() - startWaitTime) / 1000);
        logger.log(`   ⏳ Chưa thấy button login (đã chờ ${elapsed}s)... Thử lại...`);
        await page.waitForTimeout(2000);
      }
    }
    
    if (!buttonFound) {
      throw new Error(`Timeout: Không tìm thấy button login sau ${Math.floor(maxWaitTime / 1000)}s`);
    }
    
    logger.log('═══════════════════════════════════════════════════════');
    logger.log('�🚀 BẮT ĐẦU LOGIN FLOW');
    logger.log('═══════════════════════════════════════════════════════');
    
    const loginRes = await performFullLoginViaImages(page, templatesMap, templatesDir, payload.loginRequest, logger);
    results.push({ flow: 'login', result: loginRes });
    
    // Check if login was successful
    const loginSuccess = loginRes && loginRes.some(r => r.step === 'done' && r.status === 'ok');
    logger.log(`Login flow completed. Success: ${loginSuccess}`);
    
    // If joinGameXoc flag is set, execute join game flow after successful login
    if (payload.joinGameXoc) {
      logger.log(`runAutomation -> joinGameXoc flag is TRUE, preparing to join game...`);
      
      if (!loginSuccess) {
        logger.error('✗ Login did not complete successfully, skipping join game flow');
        results.push({ flow: 'joinGameXoc', status: 'skipped', error: 'Login failed' });
      } else {
        // Wait additional time for login to fully complete and game to load
        logger.log('✓ Login successful, waiting for game to fully load...');
      
        // Verify login popup is closed by checking if it's no longer visible
        try {
          logger.log('Verifying login popup is closed...');
          const { waitForTemplate } = require('./helpers/matcher_helper');
          const cfg = require('./config/config');
          
          const popupStillVisible = await new Promise((resolve) => {
            waitForTemplate(
              page,
              templatesMap,
              templatesDir,
              'taigame.png',
              3000, // Short timeout
              cfg.TEMPLATE_INTERVAL_MS || 500,
              logger
            )
              .then(() => resolve(true))  // Found = popup still visible
              .catch(() => resolve(false)); // Not found = popup closed (good!)
          });
          
          if (popupStillVisible) {
            logger.warn('⚠️ Login popup is still visible, waiting longer...');
            await page.waitForTimeout(3000);
          } else {
            logger.log('✓ Login popup confirmed closed');
          }
        } catch (verifyError) {
          logger.warn('Could not verify popup status:', verifyError.message);
        }
        
        // Wait for canvas to stabilize after login
        logger.log('Waiting for game canvas to stabilize...');
        try {
          const { waitForCanvasAndStabilize } = require('./helpers/screenshot_helper');
          await waitForCanvasAndStabilize(page, 3000);
          logger.log('✓ Canvas stabilized');
        } catch (canvasError) {
          logger.warn('Canvas stabilization check failed:', canvasError.message);
          // Continue anyway
        }
        
        // Check WebSocket after login (if not created during initial page load)
        if (payload.enableWebSocketHook !== false) {
          try {
            logger.log('🔌 Kiểm tra WebSocket sau login...');
            const { getWebSocketState } = require('./websocket/websocket_hook');
            const wsStateAfterLogin = await getWebSocketState(page, logger, sessionId);
            
            if (wsStateAfterLogin && wsStateAfterLogin.exists) {
              logger.log(`✓ WebSocket: ${wsStateAfterLogin.readyStateText} - ${wsStateAfterLogin.url}`);
              if (wsStateAfterLogin.bestRid) {
                logger.log(`✓ Best Room ID: ${wsStateAfterLogin.bestRid}`);
              }
            } else {
              logger.warn('⚠️ WebSocket vẫn chưa được tạo sau login');
              logger.warn('   Có thể cần thêm tương tác để trigger WebSocket');
            }
          } catch (wsError) {
            logger.warn('⚠️ Lỗi khi check WebSocket:', wsError.message);
          }
        }                
        // CHỜ PAGE LOAD XONG TRƯỚC KHI JOIN GAME
        logger.log('═══════════════════════════════════════════════════════');
        logger.log('🔍 KIỂM TRA PAGE LOAD TRƯỚC KHI VÀO GAME');
        logger.log('═══════════════════════════════════════════════════════');
        
        // Đợi page load hoàn toàn
        logger.log('⏳ Đợi page load hoàn toàn sau login...');
        try {
          await page.waitForNetworkIdle({ timeout: 10000, idleTime: 1000 }); // Giảm từ 30s → 10s, idleTime 2s → 1s
          logger.log('✅ Network idle - page đã load xong');
        } catch (e) {
          logger.warn('⚠️ Network không idle sau 10s, tiếp tục...');
        }
        
        // Đợi thêm để UI render
        await page.waitForTimeout(500); // Giảm từ 1000ms → 500ms
        logger.log('✅ Đã đợi thêm 0.5s để UI render');

        // CHỜ ĐẾN KHI GAME CANVAS SẴN SÀNG (thay vì chờ taigame.png biến mất)
        logger.log('⏳ Đang chờ game canvas sẵn sàng...');
        let gameReady = false;
        const maxWaitPopup = 10000; // Giảm từ 15s → 10s
        const startWaitPopup = Date.now();
        
        while (!gameReady && (Date.now() - startWaitPopup < maxWaitPopup)) {
          // Kiểm tra game canvas đã sẵn sàng
          const canvasOk = await page.evaluate(() => {
            const canvas = document.querySelector('#GameCanvas');
            if (!canvas) return false;
            
            // Kiểm tra canvas có kích thước hợp lệ
            if (canvas.width <= 0 || canvas.height <= 0) return false;
            
            // Kiểm tra không có popup login (kiểm tra bằng text thay vì ảnh)
            const bodyText = document.body.innerText || '';
            const hasLoginPopup = bodyText.includes('Tải Game') || 
                                 bodyText.includes('ĐANG TẢI GAME') ||
                                 bodyText.includes('Phiên bản');
            
            return !hasLoginPopup;
          });
          
          if (!canvasOk) {
            const elapsed = Math.floor((Date.now() - startWaitPopup) / 1000);
            logger.log(`   ⏳ Game chưa sẵn sàng (đã chờ ${elapsed}s)... Đợi thêm...`);
            await page.waitForTimeout(1000); // Giảm từ 2000ms → 1000ms
          } else {
            logger.log('✅ Game canvas đã sẵn sàng!');
            gameReady = true;
          }
        }
        
        if (!gameReady) {
          logger.warn(`⚠️ Game chưa sẵn sàng sau ${Math.floor(maxWaitPopup / 1000)}s, tiếp tục anyway...`);
        }
        
        // VALIDATION THÊM: Kiểm tra game đã sẵn sàng
        logger.log('🔍 Kiểm tra game đã sẵn sàng...');
        
        // Check 1: Canvas đã load
        const canvasReady = await page.evaluate(() => {
          const canvas = document.querySelector('#GameCanvas');
          return canvas && canvas.width > 0 && canvas.height > 0;
        });
        
        if (!canvasReady) {
          logger.log('⚠️ Canvas chưa sẵn sàng, đợi thêm...');
          await page.waitForTimeout(1000); // Giảm từ 2000ms → 1000ms
        } else {
          logger.log('✅ Canvas đã sẵn sàng');
        }
        
        // // Check 2: Không còn loading text
        // const stillLoading = await page.evaluate(() => {
        //   const text = document.body.innerText;
        //   return text.includes('ĐANG TẢI') || text.includes('LOADING') || text.includes('%');
        // });
        
        // if (stillLoading) {
        //   logger.log('⚠️ Page vẫn đang loading, đợi thêm...');
        //   await page.waitForTimeout(5000);
        // } else {
        //   logger.log('✅ Page không còn loading');
        // }
        
        // // Đợi thêm để chắc chắn UI stable
        // await page.waitForTimeout(2000);
        
        logger.log('═══════════════════════════════════════════════════════');
        logger.log('🎮 BẮT ĐẦU JOIN GAME FLOW');
        logger.log('═══════════════════════════════════════════════════════');
        
        // Now execute join game flow
        logger.log('Starting join game flow...');
        try {
          const { joinGameXoc } = require('./flows/join_game_flow');
          logger.log('✓ join_game_flow module loaded successfully');
          
          // Debug: Log payload values
          logger.log(`📊 Payload baseBetAmount: ${payload.baseBetAmount} (type: ${typeof payload.baseBetAmount})`);
          logger.log(`📊 Payload initialBalance: ${payload.initialBalance} (type: ${typeof payload.initialBalance})`);
          
          // Pass baseBetAmount and initialBalance to join game flow
          const options = {
            baseBetAmount: payload.baseBetAmount || 500,
            initialBalance: payload.initialBalance || 0
          };
          
          logger.log(`📦 Passing options to joinGameXoc:`, JSON.stringify(options));
          
          await joinGameXoc(page, templatesDir, logger, options);
          logger.log('✓ joinGameXoc completed successfully');
          results.push({ flow: 'joinGameXoc', status: 'success' });
          
          // ═══════════════════════════════════════════════════════
          // ⚡ SETUP ROOM EXIT DETECTION (SAU KHI VÀO GAME HOÀN THÀNH)
          // ═══════════════════════════════════════════════════════
          logger.log('🔧 Thiết lập tự động vào lại game khi bị thoát phòng...');
          
          // Add console listener for room exit detection AFTER joining game
          page.on('console', async (msg) => {
            try {
              const text = msg.text();
              
              // Detect room exit errors
              if (text.includes("Can't find letter definition") || text.includes("myriadpro.png")) {
                logger.warn('⚠️ Phát hiện lỗi thoát khỏi phòng! Đang vào lại game...');
                
                try {
                  await page.waitForTimeout(3000); // Đợi 3s cho ổn định

                  logger.log('🎮 Đang click vào game phụng để vào lại...');
                  const { clickPhungGame } = require('./flows/join_game_flow');
                  const projectRoot = process.env.PROJECT_ROOT || path.join(__dirname, '..');
                  const templatesDir = path.join(projectRoot, 'uploads');
                  
                  // Build templates map from resources
                  const resourcesDir = path.join(__dirname, '..', 'resources');
                  const templatesMap = {};
                  if (fs.existsSync(resourcesDir)) {
                    for (const fn of fs.readdirSync(resourcesDir)) {
                      templatesMap[fn] = path.join(resourcesDir, fn);
                    }
                  }
                  
                  // Just click Phung game to rejoin the room
                  await clickPhungGame(page, templatesDir, templatesMap, logger, {
                    baseBetAmount: payload.baseBetAmount || 500
                  });
                  
                  logger.log('✅ Đã click vào game phụng thành công!');
                } catch (rejoinErr) {
                  logger.error('❌ Lỗi khi vào lại game:', rejoinErr.message);
                }
              }
            } catch (e) {
              // Ignore errors in room exit detection
            }
          });
          
          logger.log('✅ Đã thiết lập auto-rejoin khi bị thoát phòng');
          
        } catch (err) {
          logger.error('✗ Join game xoc failed:', err.message);
          logger.error('Stack trace:', err.stack);
          results.push({ flow: 'joinGameXoc', status: 'failed', error: err.message });
        }
      }
    } else {
      logger.log(`runAutomation -> joinGameXoc flag is FALSE or undefined, skipping join game flow`);
      logger.log(`  payload.joinGameXoc value: ${JSON.stringify(payload.joinGameXoc)}`);
    }
  }

  // Process explicit actions (clickImage, clickSelector, typeImageField)
  const actions = payload.actions || [];
  for (const action of actions) {
    try {
      if (action.type === 'clickImage') {
        logger.log('Action clickImage', action.template);
        const coords = await clickImage(page, templatesMap, templatesDir, action.template, logger);
        results.push({ action, coords });
      } else if (action.type === 'typeImageField') {
        logger.log('Action typeImageField', action.template);
        const coords = await typeIntoImageField(page, templatesMap, templatesDir, action.template, action.text, logger);
        results.push({ action, coords });
      } else if (action.type === 'clickSelector') {
        logger.log('Action clickSelector', action.selector);
        await page.click(action.selector);
        results.push({ action, done: true });
      } else {
        results.push({ action, error: 'unknown action type' });
      }
    } catch (err) {
      results.push({ action, error: err.message });
    }
  }

  // ===== CLEANUP: Xóa các file upload sau khi sử dụng =====
  try {
    logger.log('🧹 Dọn dẹp file tạm...');
    
    const projectRoot = path.join(__dirname, '..', '..');
    const stats = cleanupAllTempFiles(projectRoot, logger);
    
    const totalDeleted = stats.uploads + stats.srcUploads + stats.captchaScreenshots;
    if (totalDeleted > 0) {
      logger.log(`✓ Đã xóa ${totalDeleted} file tạm`);
    } else {
      logger.log('✓ Không có file tạm cần xóa');
    }
  } catch (cleanupErr) {
    logger.warn('⚠️ Không thể dọn dẹp file tạm:', cleanupErr.message);
  }

  logger.log('runAutomation -> finished, keepBrowser=', keepBrowser);
  
  // Update session status
  sessionManager.updateSession(sessionId, { status: 'idle' });
  
  if (!keepBrowser) {
    // Clean up session completely
    await sessionManager.deleteSession(sessionId);
    logger.log('Browser closed and session deleted');
  } else {
    logger.log('Browser kept open for inspection.');
  }
  
  // Broadcast automation complete
  broadcast({ 
    type: 'automation-complete', 
    timestamp: new Date().toISOString() 
  });
  
  return { results, logs: logger.steps, sessionId };
  
  } catch (error) {
    // Update session with error status
    console.error(`[Session ${sessionId}] Fatal error:`, error);
    sessionManager.updateSession(sessionId, { 
      status: 'error',
      error: error.message 
    });
    
    // Try to clean up resources
    try {
      if (page) await page.close().catch(() => {});
      if (goLoginInstance) await goLoginInstance.stop().catch(() => {});
      else if (browser) await browser.close().catch(() => {});
    } catch (cleanupError) {
      console.error(`[Session ${sessionId}] Cleanup error:`, cleanupError.message);
    }
    
    throw error;
  }
}

module.exports = { runAutomation };
