const { waitForTemplate, clickImage } = require('./matcher_helper');
const { typeIntoImageField } = require('./type_helper');

async function performFullLoginViaImages(page, templatesMap, templatesDir, loginRequest, logger) {
  const results = [];
  logger && logger.log && logger.log('performFullLoginViaImages - starting for', loginRequest.username);
  
  // Overall timeout protection
  const cfg = require('./config');
  const overallTimeout = 120000; // 2 minutes total
  const startTime = Date.now();
  
  const checkTimeout = () => {
    if (Date.now() - startTime > overallTimeout) {
      throw new Error(`Login flow timeout after ${overallTimeout}ms`);
    }
  };
  
  try {
  const cfg = require('./config');
  
  // Đợi một chút để đảm bảo trang đã render hoàn toàn
  logger && logger.log && logger.log('Waiting for page to stabilize before looking for login button...');
  await page.waitForTimeout(1500);
  
  checkTimeout(); // Check timeout before major operations
  
  logger && logger.log && logger.log('Looking for login button...');
  const btnCoords = await waitForTemplate(page, templatesMap, templatesDir, 'button_login.png', cfg.DEFAULT_TEMPLATE_TIMEOUT_MS, cfg.TEMPLATE_INTERVAL_MS, logger);
    if (!btnCoords) throw new Error('Login button not found');
    
    logger && logger.log && logger.log('Login button found, clicking...');
    const { clickAbsolute } = require('./click_helper');
    await clickAbsolute(page, btnCoords.x, btnCoords.y, logger);
    
    // Đợi sau khi click để popup có thời gian hiện lên
    logger && logger.log && logger.log('Waiting for login popup to appear...');
    await page.waitForTimeout(1000);
    
  const popupUcoords = await waitForTemplate(page, templatesMap, templatesDir, 'username_field.png', cfg.DEFAULT_TEMPLATE_TIMEOUT_MS, cfg.TEMPLATE_INTERVAL_MS, logger);
    if (!popupUcoords) throw new Error('Login popup did not appear after clicking login button');
    results.push({ step: 'openLoginPopup', status: 'ok', coords: btnCoords });

    // username
    const ucoords = popupUcoords;
    logger && logger.log && logger.log('STEP START -> typeUsername', { coords: ucoords });
  await typeIntoImageField(page, templatesMap, templatesDir, 'username_field.png', loginRequest.username || '', logger);
  await page.waitForTimeout(cfg.SHORT_WAIT_MS);
    results.push({ step: 'typeUsername', status: 'ok', coords: ucoords });
    logger && logger.log && logger.log('STEP DONE  -> typeUsername', { coords: ucoords });

    // password
  const pcoords = await waitForTemplate(page, templatesMap, templatesDir, 'password_field.png', cfg.DEFAULT_TEMPLATE_TIMEOUT_MS, cfg.TEMPLATE_INTERVAL_MS, logger);
    if (!pcoords) throw new Error('Password field not found');
    logger && logger.log && logger.log('STEP START -> typePassword', { coords: pcoords });
    await typeIntoImageField(page, templatesMap, templatesDir, 'password_field.png', loginRequest.password || '', logger);
  await page.waitForTimeout(cfg.SHORT_WAIT_MS);
    results.push({ step: 'typePassword', status: 'ok', coords: pcoords });
    logger && logger.log && logger.log('STEP DONE  -> typePassword', { coords: pcoords });

    checkTimeout(); // Check timeout before captcha processing
    
    // captcha - Tự động nhận diện vị trí captcha và lấy ký tự từ 3 màu
    // Với retry logic: thử tối đa 2 lần, nếu sai sẽ click refresh và thử lại
    logger && logger.log && logger.log('========================================');
    logger && logger.log && logger.log('STEP: CAPTCHA PROCESSING (Max 2 Attempts)');
    logger && logger.log && logger.log('========================================');
    
    let captchaSuccess = false;
    const maxCaptchaAttempts = 3;
    
    for (let captchaAttempt = 1; captchaAttempt <= maxCaptchaAttempts && !captchaSuccess; captchaAttempt++) {
      logger && logger.log && logger.log(`\n--- CAPTCHA ATTEMPT ${captchaAttempt}/${maxCaptchaAttempts} ---`);
      
      logger && logger.log && logger.log('Looking for captcha field...');
      const ccoords = await waitForTemplate(page, templatesMap, templatesDir, 'captcha_field_login_popup.png', cfg.DEFAULT_TEMPLATE_TIMEOUT_MS, cfg.TEMPLATE_INTERVAL_MS, logger);
      
      if (!ccoords) {
        results.push({ step: 'typeCaptcha', status: 'skipped', error: 'captcha field not found' });
        logger && logger.log && logger.log('✗ STEP SKIP -> typeCaptcha (field not found)');
        break;
      }
      
      logger && logger.log && logger.log('✓ Captcha field found at coordinates:', ccoords);
      logger && logger.log && logger.log('STEP START -> typeCaptcha');
      
      // Nếu captchaText được cung cấp từ caller thì dùng nó (chỉ lần đầu)
      let captchaText = (captchaAttempt === 1) ? loginRequest.captchaText : null;
      
      if (!captchaText) {
        try {
          logger && logger.log && logger.log('No pre-provided captcha, starting extraction...');
          
          // Extract CAPTCHA using solveCaptchaOnPopup from captcha_processor_java_like
          try {
            const { solveCaptchaOnPopup } = require('./captcha_processor_java_like');
            
            logger && logger.log && logger.log('→ Extracting CAPTCHA using solveCaptchaOnPopup (Java-like)...');
            captchaText = await solveCaptchaOnPopup(page, ccoords, templatesDir, logger);
            
          } catch (method1Error) {
            logger && logger.warn && logger.warn('→ Extraction failed:', method1Error.message);
            captchaText = '';
          }
          
          logger && logger.log && logger.log('✓ Final OCR result:', JSON.stringify(captchaText));
          
        } catch (e) {
          logger && logger.error && logger.error('✗ All captcha extraction methods failed:', e.message);
          logger && logger.error && logger.error('Stack:', e.stack);
          captchaText = '';
        }
      } else {
        logger && logger.log && logger.log('✓ Using pre-provided captcha text:', captchaText);
      }
      
      // Log final result
      logger && logger.log && logger.log('========================================');
      logger && logger.log && logger.log('CAPTCHA EXTRACTION RESULT:');
      logger && logger.log && logger.log('Value:', JSON.stringify(captchaText || '(empty)'));
      logger && logger.log && logger.log('Length:', (captchaText || '').length);
      logger && logger.log && logger.log('========================================');
      
      // Type captcha into field if we have a value
      if (captchaText && captchaText.length > 0) {
        logger && logger.log && logger.log('→ Typing captcha into field...');
        await typeIntoImageField(page, templatesMap, templatesDir, 'captcha_field_login_popup.png', captchaText, logger);
        await page.waitForTimeout(cfg.SHORT_WAIT_MS);
        
        logger && logger.log && logger.log('✓ STEP DONE -> typeCaptcha');
        
        // Final click to submit login
        const finalCoords = await waitForTemplate(page, templatesMap, templatesDir, 'final_login_button.png', cfg.DEFAULT_TEMPLATE_TIMEOUT_MS, cfg.TEMPLATE_INTERVAL_MS, logger);
        if (!finalCoords) throw new Error('Final login button not found');
        
        logger && logger.log && logger.log('STEP START -> clickFinalLogin', { coords: finalCoords });
        await clickAbsolute(page, finalCoords.x, finalCoords.y, logger);
        await page.waitForTimeout(cfg.FINAL_CLICK_WAIT_MS);
        logger && logger.log && logger.log('STEP DONE  -> clickFinalLogin', { coords: finalCoords });
        
        // Đợi để xem có lỗi CAPTCHA không (nếu popup vẫn hiện thì CAPTCHA sai)
        await page.waitForTimeout(2000);
        
        // Kiểm tra xem popup có còn không - nếu vẫn có thì CAPTCHA sai
        const popupStillVisible = await waitForTemplate(page, templatesMap, templatesDir, 'login_popup_title.png', 2000, cfg.TEMPLATE_INTERVAL_MS, logger);
        
        if (popupStillVisible) {
          // CAPTCHA sai, cần retry
          logger && logger.warn && logger.warn(`⚠ CAPTCHA attempt ${captchaAttempt} failed - popup still visible`);
          results.push({ 
            step: 'typeCaptcha', 
            status: 'failed', 
            error: 'CAPTCHA incorrect - login popup still visible', 
            coords: ccoords,
            attempt: captchaAttempt
          });
          
          // Nếu còn lần thử, thực hiện retry
          if (captchaAttempt < maxCaptchaAttempts) {
            logger && logger.log && logger.log(`\n→ CAPTCHA RETRY LOGIC (Attempt ${captchaAttempt}/${maxCaptchaAttempts}):`);
            
            // Step 1: Clear CAPTCHA field
            logger && logger.log && logger.log(`  Step 1: Clearing CAPTCHA field...`);
            const { clickAbsolute } = require('./click_helper');
            await clickAbsolute(page, ccoords.x, ccoords.y, logger);
            await page.waitForTimeout(300);
            
            // Select all text and delete
            await page.keyboard.press('Control+A');
            await page.keyboard.press('Delete');
            await page.waitForTimeout(300);
            logger && logger.log && logger.log(`  ✓ CAPTCHA field cleared`);
            
            // Step 2: Click refresh button to get new CAPTCHA
            logger && logger.log && logger.log(`  Step 2: Clicking refresh button to get new CAPTCHA...`);
            const refreshBtn = await waitForTemplate(page, templatesMap, templatesDir, 'button_refresh.png', 3000, cfg.TEMPLATE_INTERVAL_MS, logger);
            if (refreshBtn) {
              await clickAbsolute(page, refreshBtn.x, refreshBtn.y, logger);
              await page.waitForTimeout(1500); // Đợi CAPTCHA load mới
              logger && logger.log && logger.log('  ✓ Refresh button clicked, new CAPTCHA loaded');
            } else {
              logger && logger.warn && logger.warn('  ⚠ Could not find refresh button, will retry anyway');
            }
            
            // Step 3: Re-extract CAPTCHA text
            logger && logger.log && logger.log(`  Step 3: Re-extracting CAPTCHA text...`);
            try {
              const { solveCaptchaOnPopup } = require('./captcha_processor');
              const newCaptchaText = await solveCaptchaOnPopup(page, ccoords, templatesDir, logger);
              if (newCaptchaText && newCaptchaText.length > 0) {
                captchaText = newCaptchaText;
                logger && logger.log && logger.log(`  ✓ Re-extracted CAPTCHA: ${captchaText}`);
              } else {
                logger && logger.warn && logger.warn(`  ⚠ Re-extraction returned empty result`);
                captchaText = '';
              }
            } catch (reExtractError) {
              logger && logger.error && logger.error(`  ✗ Re-extraction failed: ${reExtractError.message}`);
              captchaText = '';
            }
            
            logger && logger.log && logger.log(`  Step 4: Retrying login with new CAPTCHA...`);
            // Loop sẽ continue với captchaText mới
          } else {
            logger && logger.log && logger.log(`⚠ Reached maximum CAPTCHA attempts (${maxCaptchaAttempts})`);
          }
        } else {
          // CAPTCHA đúng, login thành công
          logger && logger.log && logger.log(`✓ CAPTCHA attempt ${captchaAttempt} successful - popup closed`);
          results.push({ 
            step: 'typeCaptcha', 
            status: 'ok', 
            coords: ccoords, 
            captcha: captchaText,
            length: captchaText.length,
            attempt: captchaAttempt
          });
          captchaSuccess = true;
        }
      } else {
        results.push({ 
          step: 'typeCaptcha', 
          status: 'failed', 
          error: 'Could not extract captcha text', 
          coords: ccoords,
          attempt: captchaAttempt
        });
        logger && logger.warn && logger.warn(`✗ STEP FAILED -> typeCaptcha attempt ${captchaAttempt}: empty result`);
      }
    }
    
    if (!captchaSuccess) {
      logger && logger.warn && logger.warn('✗ CAPTCHA failed after all attempts');
      throw new Error('CAPTCHA validation failed after maximum attempts');
    }
    
    logger && logger.log && logger.log('========================================');

    results.push({ step: 'done', status: 'ok' });
    logger && logger.log && logger.log('FLOW DONE -> performFullLoginViaImages');
  } catch (err) {
    logger && logger.error && logger.error('performFullLoginViaImages error', err && err.message ? err.message : err);
    results.push({ step: 'error', error: err && err.message ? err.message : String(err) });
  }
  return results;
}

module.exports = { performFullLoginViaImages };
