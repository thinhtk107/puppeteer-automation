const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { performFullLoginViaImages } = require('./flows/login_flow');
const { setupWebSocketHook, listenForWebSocketCreation } = require('./websocket/websocket_hook');
const { cleanupAllTempFiles } = require('./helpers/cleanup_helper');

/**
 * Main entrypoint kept similar: payload { url, actions, loginRequest, proxyHost, proxyPort }
 */
async function runAutomation(payload, uploadedFiles) {
  const devVisible = process.env.DEV_VISIBLE === 'true' || process.env.HEADLESS === 'false';
  
  // ===== PROXY SETUP =====
  // Build proxy address if provided
  let proxyAddress = null;
  if (payload.proxyHost && payload.proxyPort) {
    proxyAddress = `${payload.proxyHost}:${payload.proxyPort}`;
    console.log(`[PROXY] Using proxy: ${proxyAddress}`);
  } else if (process.env.PROXY_HOST && process.env.PROXY_PORT) {
    proxyAddress = `${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
    console.log(`[PROXY] Using proxy from env: ${proxyAddress}`);
  }
  
  // Build launch options with proxy support
  const launchOptions = {
    headless: devVisible ? false : true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      devVisible ? '--start-maximized' : '--no-startup-window'
    ],
    dumpio: devVisible ? true : false
  };
  
  // Add proxy argument if specified
  if (proxyAddress) {
    launchOptions.args.push(`--proxy-server=${proxyAddress}`);
  }
  
  const browser = await puppeteer.launch(launchOptions);
  
  const page = await browser.newPage();
  // use a normal windowed viewport for predictable matching and debugging
  // avoid relying on window.screen which can force a fullscreen feeling; pick a sensible default
  await page.setViewport({ width: 1280, height: 800 });
  
  // Helper function to broadcast messages to WebSocket clients
  const broadcast = (data) => {
    if (global.broadcastToClients) {
      global.broadcastToClients(data);
    }
  };
  
  // Broadcast automation start
  broadcast({ type: 'automation-start', timestamp: new Date().toISOString() });
  
  // lightweight logger for this run with WebSocket broadcasting
  const logger = {
    steps: [],
    log: (...args) => { 
      const message = args.join(' ');
      console.log(...args); 
      logger.steps.push({ level: 'info', text: message });
      broadcast({ type: 'log', level: 'info', message, timestamp: new Date().toISOString() });
    },
    warn: (...args) => { 
      const message = args.join(' ');
      console.warn(...args); 
      logger.steps.push({ level: 'warn', text: message });
      broadcast({ type: 'log', level: 'warn', message, timestamp: new Date().toISOString() });
    },
    error: (...args) => { 
      const message = args.join(' ');
      console.error(...args); 
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
          
          // Broadcast to WebSocket clients
          if (global.broadcastToClients) {
            global.broadcastToClients({
              type: 'betting-event',
              ...betEvent
            });
          }
          
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
          
          logger.log(`📊 Parsed betting stats: Balance=${statsData.currentBalance}, Bets=${statsData.totalBets}, Wins=${statsData.winCount}`);
          
          // Broadcast to WebSocket clients
          if (global.broadcastToClients) {
            global.broadcastToClients({
              type: 'betting-stats',
              ...statsData
            });
            logger.log('✅ Broadcasted betting stats to clients');
          } else {
            logger.warn('⚠️ global.broadcastToClients not available');
          }
          
          return; // Don't log the raw stats message
        } catch (parseErr) {
          logger.error('Failed to parse betting statistics:', parseErr.message);
        }
      }
      
      // Bỏ qua log từ WebSocket hook
      if (text.includes('SOCKET') || text.includes('WebSocket') || text.includes('hook')) {
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
      
      // Inject WebSocket hook script before page loads with baseBet from payload
      const baseBet = payload.baseBetAmount || 500; // Lấy từ form hoặc default 500
      await setupWebSocketHook(page, logger, { baseBet });
      
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
      const wsState = await getWebSocketState(page, logger);
      
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
  const templatesDir = path.join(__dirname, '..', 'uploads');
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
    await page.waitForTimeout(3000);
    
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
    logger.log('🚀 BẮT ĐẦU LOGIN FLOW');
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
        await page.waitForTimeout(5000); // Wait 5 seconds for game to stabilize
        
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
            const wsStateAfterLogin = await getWebSocketState(page, null);
            
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
  if (!keepBrowser) {
    await browser.close();
    logger.log('Browser closed');
  } else {
    logger.log('Browser kept open for inspection.');
  }
  
  // Broadcast automation complete
  if (global.broadcastToClients) {
    global.broadcastToClients({ 
      type: 'automation-complete', 
      timestamp: new Date().toISOString() 
    });
  }
  
  return { results, logs: logger.steps };
}

module.exports = { runAutomation };
