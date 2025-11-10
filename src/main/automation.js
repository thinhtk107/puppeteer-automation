const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { performFullLoginViaImages } = require('./login_flow');
const { setupWebSocketHook, listenForWebSocketCreation, getWebSocketState } = require('./websocket_hook');

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
  
  // lightweight logger for this run
  const logger = {
    steps: [],
    log: (...args) => { console.log(...args); logger.steps.push({ level: 'info', text: args.join(' ') }); },
    warn: (...args) => { console.warn(...args); logger.steps.push({ level: 'warn', text: args.join(' ') }); },
    error: (...args) => { console.error(...args); logger.steps.push({ level: 'error', text: args.join(' ') }); }
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
      logger.log('[PROXY] Verifying proxy connection and IP address...');
      await page.goto('https://api.ipify.org', { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Get IP from page body
      const proxyIP = await page.evaluate(() => {
        return document.body.textContent.trim();
      });
      
      logger.log(`[PROXY] ✓ Current browser IP: ${proxyIP}`);
      logger.log(`[PROXY] ✓ Proxy connection verified successfully`);
      
      // Store proxy IP for later reference
      page._proxyIP = proxyIP;
      
    } catch (err) {
      logger.error(`[PROXY] ✗ Failed to verify proxy IP: ${err.message}`);
      logger.warn('[PROXY] Continuing anyway, but proxy may not be working correctly');
    }
  }

  // Forward browser console messages and errors to Node console for debugging
  page.on('console', msg => {
    try {
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
      logger.log('\n========================================');
      logger.log('   WEBSOCKET HOOK - INITIALIZING');
      logger.log('========================================\n');
      
      // Setup CDP listener for WebSocket creation events
      await listenForWebSocketCreation(page, logger);
      
      // Inject WebSocket hook script before page loads
      await setupWebSocketHook(page, logger);
      
      logger.log('✓ WebSocket hook is ready and will activate on page load\n');
    } catch (wsError) {
      logger.error('Failed to setup WebSocket hook:', wsError.message);
      logger.warn('Continuing without WebSocket hook...');
    }
  }
  
  // Navigate to URL (WebSocket hook will activate here)
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  
  // Đợi thêm để đảm bảo tất cả resources đã load xong
  logger.log('Page loaded, waiting for page to be fully ready...');
  await page.waitForTimeout(2000);
  
  // Đợi document ready
  await page.evaluate(() => {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', resolve);
      }
    });
  });
  
  logger.log('Page is fully ready, proceeding with automation...');
  
  // ===== CHECK WEBSOCKET STATE AFTER PAGE LOAD =====
  if (payload.enableWebSocketHook !== false) {
    try {
      logger.log('\n========================================');
      logger.log('   WEBSOCKET STATUS CHECK');
      logger.log('========================================\n');
      
      // Wait a bit more for WebSocket to be created
      await page.waitForTimeout(5000);
      
      // Get current WebSocket state
      const wsState = await getWebSocketState(page, logger);
      
      if (wsState && wsState.exists) {
        logger.log(`✓ WebSocket hooked successfully!`);
        logger.log(`  State: ${wsState.readyStateText}`);
        logger.log(`  URL: ${wsState.url}`);
        if (wsState.bestRid) {
          logger.log(`  Best Room ID: ${wsState.bestRid}`);
        }
      } else {
        logger.warn('⚠️ WebSocket not yet created. Hook will activate when WebSocket connects.');
      }
      
      logger.log('');
    } catch (wsCheckError) {
      logger.warn('Could not check WebSocket state:', wsCheckError.message);
    }
  }
  
  // ===== LOG PROXY STATUS =====
  if (proxyAddress) {
    logger.log(`✓ [PROXY] Connected via: ${proxyAddress}`);
    if (payload.proxyUser || process.env.PROXY_USER) {
      logger.log(`✓ [PROXY AUTH] Authenticated as user`);
    }
    if (page._proxyIP) {
      logger.log(`✓ [PROXY IP] Verified IP address: ${page._proxyIP}`);
    }
  } else {
    logger.log('ℹ [PROXY] No proxy configured');
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
    logger.log('runAutomation -> executing login flow');
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
          const { waitForTemplate } = require('./matcher_helper');
          const cfg = require('./config');
          
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
          const { waitForCanvasAndStabilize } = require('./screenshot_helper');
          await waitForCanvasAndStabilize(page, 3000);
          logger.log('✓ Canvas stabilized');
        } catch (canvasError) {
          logger.warn('Canvas stabilization check failed:', canvasError.message);
          // Continue anyway
        }
        
        // Now execute join game flow
        logger.log('Starting join game flow...');
        try {
          const { joinGameXoc } = require('./join_game_flow');
          logger.log('✓ join_game_flow module loaded successfully');
          
          await joinGameXoc(page, templatesDir, logger);
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

  logger.log('runAutomation -> finished, keepBrowser=', keepBrowser);
  if (!keepBrowser) {
    await browser.close();
    logger.log('Browser closed');
  } else {
    logger.log('Browser kept open for inspection.');
  }
  return { results, logs: logger.steps };
}

module.exports = { runAutomation };
