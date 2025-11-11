const { waitForTemplate, clickImage } = require('../helpers/matcher_helper');
const { typeIntoImageField } = require('../helpers/type_helper');

async function performFullLoginViaImages(page, templatesMap, templatesDir, loginRequest, logger) {
  const results = [];
  let stepNumber = 0;
  
  const logStep = (message) => {
    stepNumber++;
    logger && logger.log && logger.log(`Step ${stepNumber}: ${message}`);
  };
  
  logger && logger.log && logger.log(`🔐 Bắt đầu đăng nhập: ${loginRequest.username}`);
  logger && logger.log && logger.log('========================================');
  
  // Overall timeout protection
  const cfg = require('../config/config');
  const overallTimeout = 120000; // 2 minutes total
  const startTime = Date.now();
  
  const checkTimeout = () => {
    if (Date.now() - startTime > overallTimeout) {
      throw new Error(`Timeout: Quá thời gian đăng nhập (${overallTimeout}ms)`);
    }
  };
  
  try {
  const cfg = require('../config/config');
  
  await page.waitForTimeout(1500);
  
  checkTimeout();
  
  logStep('Tìm nút đăng nhập...');
  const btnCoords = await waitForTemplate(page, templatesMap, templatesDir, 'button_login.png', cfg.DEFAULT_TEMPLATE_TIMEOUT_MS, cfg.TEMPLATE_INTERVAL_MS, logger);
    if (!btnCoords) throw new Error('Không tìm thấy nút đăng nhập');
    
    logStep('Click nút đăng nhập');
    const { clickAbsolute } = require('../helpers/click_helper');
    await clickAbsolute(page, btnCoords.x, btnCoords.y, logger);
    
    await page.waitForTimeout(1000);
    
  logStep('Chờ popup đăng nhập hiển thị');
  const popupUcoords = await waitForTemplate(page, templatesMap, templatesDir, 'username_field.png', cfg.DEFAULT_TEMPLATE_TIMEOUT_MS, cfg.TEMPLATE_INTERVAL_MS, logger);
    if (!popupUcoords) throw new Error('Popup đăng nhập không hiển thị');
    results.push({ step: 'openLoginPopup', status: 'ok', coords: btnCoords });

    // username
    const ucoords = popupUcoords;
    logStep('Nhập tên đăng nhập');
  await typeIntoImageField(page, templatesMap, templatesDir, 'username_field.png', loginRequest.username || '', logger);
  await page.waitForTimeout(cfg.SHORT_WAIT_MS);
    results.push({ step: 'typeUsername', status: 'ok', coords: ucoords });

    // password
  const pcoords = await waitForTemplate(page, templatesMap, templatesDir, 'password_field.png', cfg.DEFAULT_TEMPLATE_TIMEOUT_MS, cfg.TEMPLATE_INTERVAL_MS, logger);
    if (!pcoords) throw new Error('Không tìm thấy ô mật khẩu');
    logStep('Nhập mật khẩu');
    await typeIntoImageField(page, templatesMap, templatesDir, 'password_field.png', loginRequest.password || '', logger);
  await page.waitForTimeout(cfg.SHORT_WAIT_MS);
    results.push({ step: 'typePassword', status: 'ok', coords: pcoords });

    checkTimeout();
    
    // captcha - Không retry, chỉ thử 1 lần
    logStep('Bắt đầu xử lý CAPTCHA');
    
    const ccoords = await waitForTemplate(page, templatesMap, templatesDir, 'captcha_field_login_popup.png', cfg.DEFAULT_TEMPLATE_TIMEOUT_MS, cfg.TEMPLATE_INTERVAL_MS, logger);
    
    if (!ccoords) {
      results.push({ step: 'typeCaptcha', status: 'skipped', error: 'captcha field not found' });
      logger && logger.log && logger.log('⚠️ Bỏ qua CAPTCHA (không bắt buộc)');
    } else {
      // Đọc CAPTCHA
      let captchaText = '';
      try {
        const { solveCaptchaOnPopup } = require('../captcha/captcha_processor_java_like');
        captchaText = await solveCaptchaOnPopup(page, ccoords, templatesDir, logger);
        logger && logger.log && logger.log(`   ✓ Đã đọc CAPTCHA: "${captchaText}"`);
      } catch (e) {
        logger && logger.error && logger.error('   ✗ Không thể đọc CAPTCHA:', e.message);
        captchaText = '';
      }
      
      if (captchaText && captchaText.length > 0) {
        // Nhập CAPTCHA
        logStep('Nhập CAPTCHA vào ô');
        await typeIntoImageField(page, templatesMap, templatesDir, 'captcha_field_login_popup.png', captchaText, logger);
        await page.waitForTimeout(cfg.SHORT_WAIT_MS);
        
        results.push({ 
          step: 'typeCaptcha', 
          status: 'ok', 
          coords: ccoords, 
          captcha: captchaText
        });
      } else {
        results.push({ 
          step: 'typeCaptcha', 
          status: 'failed', 
          error: 'Không đọc được CAPTCHA', 
          coords: ccoords
        });
        logger && logger.warn && logger.warn('   ✗ CAPTCHA trống');
      }
      
      // Click nút đăng nhập
      const finalCoords = await waitForTemplate(page, templatesMap, templatesDir, 'final_login_button.png', cfg.DEFAULT_TEMPLATE_TIMEOUT_MS, cfg.TEMPLATE_INTERVAL_MS, logger);
      if (!finalCoords) throw new Error('Không tìm thấy nút đăng nhập cuối cùng');
      
      logStep('Nhấn nút xác nhận đăng nhập');
      await clickAbsolute(page, finalCoords.x, finalCoords.y, logger);
      await page.waitForTimeout(cfg.FINAL_CLICK_WAIT_MS);
    }
    
    logger && logger.log && logger.log('========================================');
    logStep('✅ Đăng nhập hoàn tất');

    results.push({ step: 'done', status: 'ok' });
    logger && logger.log && logger.log('FLOW DONE -> performFullLoginViaImages');
    
  } catch (err) {
    logger && logger.error && logger.error('performFullLoginViaImages error', err && err.message ? err.message : err);
    results.push({ step: 'error', error: err && err.message ? err.message : String(err) });
  }
  return results;
}

module.exports = { performFullLoginViaImages };
