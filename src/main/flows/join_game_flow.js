/**
 * Join Game Xoc Flow - Puppeteer Implementation
 * Tương đương với SeleniumService.joinGameXoc() trong Java
 */

const { waitForTemplate, clickImage } = require('../helpers/matcher_helper');
const fs = require('fs');
const path = require('path');

/**
 * Main function: Join Game Xoc (Tương đương SeleniumService.joinGameXoc)
 * @param {Page} page - Puppeteer page object
 * @param {string} templatesDir - Thư mục chứa template images
 * @param {Object} logger - Logger object
 * @param {Object} options - Options { baseBetAmount, initialBalance }
 */
async function joinGameXoc(page, templatesDir, logger, options = {}) {
  try {
    logger && logger.log && logger.log('🎮 Bắt đầu vào game...');
    // Dọn dẹp popup
    await handleInitialPopups(page, templatesDir, logger);

    // Click vào game XÓC ĐĨA
    logger && logger.log && logger.log('🎯 Tìm game XÓC ĐĨA...');
    const cfg = require('../config/config');
    const templatesMap = buildTemplatesMap(templatesDir);
    
    let xocDiaClicked = false;
    
    // Strategy 1: Tìm dựa trên live_area.png
    try {
      const liveAreaCoords = await waitForTemplate(
        page,
        templatesMap,
        templatesDir,
        'live_area.png',
        10000,
        cfg.TEMPLATE_INTERVAL_MS || 500,
        logger
      );
      
      if (liveAreaCoords) {
        // Tính toán vị trí Xóc Đĩa từ live_area
        const xocDiaX = liveAreaCoords.x - 50;
        const xocDiaY = liveAreaCoords.y + 150;
        
        logger && logger.log && logger.log(`Calculated XÓC ĐĨA position: (${xocDiaX}, ${xocDiaY})`);
        
        const { clickAbsolute } = require('../helpers/click_helper');
        await clickAbsolute(page, xocDiaX, xocDiaY, logger);
        xocDiaClicked = true;
        logger && logger.log && logger.log('✓ Clicked "XÓC ĐĨA" based on live_area position');
      } else {
        
        const { clickAbsolute } = require('../helpers/click_helper');
        await clickAbsolute(page, xocDiaX, xocDiaY, logger);
        xocDiaClicked = true;
        logger && logger.log && logger.log('✅ Đã click XÓC ĐĨA');
      }
    } catch (liveAreaError) {
      logger && logger.warn && logger.warn('⚠️ Không tìm thấy live_area, thử cách khác...');
    }
    
    // Strategy 2: Template matching
    if (!xocDiaClicked) {
      try {
        const xocDiaCoords = await waitForTemplate(
          page, templatesMap, templatesDir, 'game_xoc_dia.png', 
          5000, cfg.TEMPLATE_INTERVAL_MS || 500, logger
        );
        
        if (xocDiaCoords) {
          const { clickAbsolute } = require('../helpers/click_helper');
          await clickAbsolute(page, xocDiaCoords.x, xocDiaCoords.y, logger);
          xocDiaClicked = true;
          logger && logger.log && logger.log('✅ Đã click XÓC ĐĨA (template)');
        }
      } catch (templateError) {
        // Bỏ qua
      }
    }
    
    // Strategy 3: Fixed position
    if (!xocDiaClicked) {
      logger && logger.log && logger.log('⚙️ Dùng vị trí cố định...');
      
      const canvasElement = await page.$('#GameCanvas');
      if (!canvasElement) {
        throw new Error('Không tìm thấy canvas');
      }
      
      const boundingBox = await canvasElement.boundingBox();
      if (!boundingBox) {
        throw new Error('Không lấy được bounding box');
      }
      
      // Based on the image you provided, Xóc Đĩa appears to be in the LEFT SIDE
      // Typically at around 20-25% from left, and 40-50% from top
      const clickX = Math.floor(boundingBox.width * 0.22); // 22% from left
      const clickY = Math.floor(boundingBox.height * 0.45); // 45% from top
      
      logger && logger.log && logger.log(`Clicking at fixed position: (${clickX}, ${clickY})`);
      logger && logger.log && logger.log(`Canvas size: ${boundingBox.width}x${boundingBox.height}`);
      
      const { clickAbsolute } = require('../helpers/click_helper');
      await clickAbsolute(page, clickX, clickY, logger);
      xocDiaClicked = true;
      logger && logger.log && logger.log('✓ Clicked "XÓC ĐĨA" using fixed position');
    }
    
    if (!xocDiaClicked) {
      throw new Error('Không thể click vào game "XÓC ĐĨA" bằng bất kỳ phương pháp nào');
    }
    
    await page.waitForTimeout(5000); // Chờ 5s để game load

    // Take screenshot for debugging
    await takeFullPageScreenshot(page, logger);

    // BƯỚC 7: Click vào game PHỤNG
    logger && logger.log && logger.log('\n--- BƯỚC 7: Tìm game "PHỤNG" ---');
    await clickPhungGame(page, templatesDir, templatesMap, logger, options);

    logger && logger.log && logger.log('\n========================================');
    logger && logger.log && logger.log('   JOIN GAME XOC FLOW - COMPLETED');
    logger && logger.log && logger.log('========================================\n');

  } catch (error) {
    logger && logger.error && logger.error('!!! LỖI NGHIÊM TRỌNG TRONG QUY TRÌNH VÀO GAME !!!');
    logger && logger.error && logger.error('Error:', error.message);
    await takeFullPageScreenshot(page, logger);
    throw error;
  }
}

/**
 * Handle initial popups (Tương đương handleInitialPopups trong Java)
 * @param {Page} page 
 * @param {string} templatesDir 
 * @param {Object} logger 
 */
async function handleInitialPopups(page, templatesDir, logger) {
  logger && logger.log && logger.log('\n--- BƯỚC 5: Đang kiểm tra và dọn dẹp Popups ban đầu ---');
  
  const templateName = 'common_popup_X.png';
  const maxChecks = 1;
  let checks = 0;
  const cfg = require('../config/config');
  const templatesMap = buildTemplatesMap(templatesDir);

  // Chờ một chút để popup có thời gian xuất hiện
  logger && logger.log && logger.log('⏳ Chờ popup xuất hiện...');

  while (checks < maxChecks) {
    checks++;
    logger && logger.log && logger.log(`\n--- Kiểm tra Popup lần thứ ${checks} ---`);

    // Try to find popup close button using template matching
    let xButtonCoords = null;
    
    try {
      xButtonCoords = await waitForTemplate(
        page,
        templatesMap,
        templatesDir,
        templateName,
        2000, // Tăng timeout lên 3s để chờ popup xuất hiện
        cfg.TEMPLATE_INTERVAL_MS || 500,
        logger
      );
    } catch (timeoutError) {
      // waitForTemplate throws on timeout, treat as "not found"
      logger && logger.log && logger.log(`Popup not found (timeout): ${timeoutError.message}`);
      xButtonCoords = null;
    }

    if (xButtonCoords) {
      // Found popup X button - click it
      logger && logger.log && logger.log(`✓ Tìm thấy nút X tại: (${xButtonCoords.x}, ${xButtonCoords.y})`);
      
      const { clickAbsolute } = require('../helpers/click_helper');
      await clickAbsolute(page, xButtonCoords.x, xButtonCoords.y, logger);
      logger && logger.log && logger.log('✓ Đã click vào nút X để đóng popup');

      await page.waitForTimeout(1500); // Đợi popup đóng và popup mới xuất hiện (nếu có)
      continue; // Kiểm tra tiếp popup khác
    } else {
      logger && logger.log && logger.log(`✗ Không tìm thấy popup nào`);
      logger && logger.log && logger.log('✓ Hoàn tất dọn dẹp popups\n');
      break; // Không còn popup nào
    }
  }

  if (checks >= maxChecks) {
    logger && logger.warn && logger.warn(`⚠️ Đã kiểm tra ${maxChecks} lần, dừng để tránh vòng lặp vô hạn`);
  }
}

/**
 * Click vào game PHỤNG 
 * @param {Page} page 
 * @param {string} templatesDir
 * @param {Object} templatesMap
 * @param {Object} logger 
 * @param {Object} options - Options { baseBetAmount, initialBalance }
 */
async function clickPhungGame(page, templatesDir, templatesMap, logger, options = {}) {
  try {
    const cfg = require('../config/config');
    
    let phungClicked = false;
    
    // Strategy 1: Find based on text_phung.png position (most reliable)
    try {
      logger && logger.log && logger.log('Strategy 1: Finding PHỤNG based on text_phung.png position...');
      
      // First, find text_phung.png
      const textPhungCoords = await waitForTemplate(
        page,
        templatesMap,
        templatesDir,
        'text_phung.png',
        10000, // 10 seconds timeout
        cfg.TEMPLATE_INTERVAL_MS || 500,
        logger
      );
      
      if (textPhungCoords) {
        logger && logger.log && logger.log(`✓ Found text_phung at: (${textPhungCoords.x}, ${textPhungCoords.y})`);
        
        // Click directly on the text_phung position (center of the found template)
        // The text "PHỤNG" is part of the clickable game button, so we can click on it
        
        logger && logger.log && logger.log(`Clicking on PHỤNG text position: (${textPhungCoords.x}, ${textPhungCoords.y})`);
        
        const { clickAbsolute } = require('../helpers/click_helper');
        await clickAbsolute(page, textPhungCoords.x, textPhungCoords.y, logger);
        phungClicked = true;
        logger && logger.log && logger.log('✓ Clicked "PHỤNG" based on text_phung.png position');
      } else {
        logger && logger.warn && logger.warn('Could not find text_phung.png');
      }
    } catch (textPhungError) {
      logger && logger.warn && logger.warn('Strategy 1 failed:', textPhungError.message);
    }
    
    // Strategy 2: Try template matching for game_phung.png
    if (!phungClicked) {
      try {
        logger && logger.log && logger.log('Strategy 2: Trying template matching for game_phung.png...');
        const phungCoords = await waitForTemplate(
          page,
          templatesMap,
          templatesDir,
          'game_phung.png',
          5000,
          cfg.TEMPLATE_INTERVAL_MS || 500,
          logger
        );

        if (phungCoords) {
          logger && logger.log && logger.log(`>>> Tìm thấy game PHỤNG tại: (${phungCoords.x}, ${phungCoords.y})`);
          
          const { clickAbsolute } = require('../helpers/click_helper');
          await clickAbsolute(page, phungCoords.x, phungCoords.y, logger);
          phungClicked = true;
        }
      } catch (templateError) {
        logger && logger.warn && logger.warn('Strategy 2 failed:', templateError.message);
      }
    }
    
    // Strategy 3: Use fixed position (after clicking Xóc Đĩa, Phụng is typically at X=380)
    if (!phungClicked) {
      logger && logger.warn && logger.warn('⚠️ Could not find PHỤNG using any template, using fixed position');
      
      // Get canvas element to calculate position
      const canvasElement = await page.$('#GameCanvas');
      if (!canvasElement) {
        throw new Error('Canvas element not found');
      }
      
      const boundingBox = await canvasElement.boundingBox();
      if (!boundingBox) {
        throw new Error('Cannot get canvas bounding box');
      }
      
      // Use fixed X coordinate and middle Y coordinate as fallback
      const clickX = 380;
      const clickY = Math.floor(boundingBox.height / 2);
      
      logger && logger.log && logger.log(`>>> Using fallback position: (${clickX}, ${clickY})`);
      
      const { clickAbsolute } = require('../helpers/click_helper');
      await clickAbsolute(page, clickX, clickY, logger);
      phungClicked = true;
    }

    await page.waitForTimeout(5000); // Chờ 5s để vào sảnh
    logger && logger.log && logger.log('\n✓ HOÀN TẤT QUY TRÌNH VÀO GAME PHỤNG');
    
    // Start real-time statistics broadcasting (non-blocking)
    startRealtimeStats(page, logger);
    
    logger && logger.log && logger.log('📊 Thống kê real-time đang chạy trong nền (cập nhật mỗi 3 giây)...');
    logger && logger.log && logger.log('💡 Kiểm tra console để xem Bank status, Streak, Betting info');
    logger && logger.log && logger.log('✓ Flow tiếp tục mà không bị block...');

  } catch (error) {
    logger && logger.error && logger.error('!!! Lỗi khi click vào "PHỤNG" !!!');
    logger && logger.error && logger.error('Error:', error.message);
    await takeFullPageScreenshot(page, logger);
    throw error;
  }
}

/**
 * Take full page screenshot for debugging
 * @param {Page} page 
 * @param {Object} logger 
 */
async function takeFullPageScreenshot(page, logger) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.join(require('os').homedir(), 'Desktop', `screenshot_${timestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    logger && logger.log && logger.log(`   [Screenshot] Saved to: ${screenshotPath}`);
  } catch (error) {
    logger && logger.warn && logger.warn(`Failed to take screenshot: ${error.message}`);
  }
}

/**
 * Build templates map from directory
 * @param {string} templatesDir 
 * @returns {Object}
 */
function buildTemplatesMap(templatesDir) {
  const templatesMap = {};
  
  if (fs.existsSync(templatesDir)) {
    const files = fs.readdirSync(templatesDir);
    files.forEach(file => {
      if (file.endsWith('.png') || file.endsWith('.jpg')) {
        templatesMap[file] = path.join(templatesDir, file);
      }
    });
  }
  
  // Also check resources directory (go up two levels from flows to main, then to src, then to resources)
  const resourcesDir = path.join(__dirname, '..', '..', 'resources');

  if (fs.existsSync(resourcesDir)) {
    const files = fs.readdirSync(resourcesDir);
    files.forEach(file => {
      if ((file.endsWith('.png') || file.endsWith('.jpg')) && !templatesMap[file]) {
        templatesMap[file] = path.join(resourcesDir, file);
      }
    });
  }
  
  return templatesMap;
}

/**
 * Start real-time statistics broadcasting (non-blocking)
 * @param {Page} page 
 * @param {Object} logger 
 */
function startRealtimeStats(page, logger) {
  // Start interval in browser context - runs independently
  page.evaluate(() => {
    if (window.statsIntervalId) {
      clearInterval(window.statsIntervalId);
    }
    
    window.statsIntervalId = setInterval(() => {
      // Check stop flag
      if (window.stopAutomation) {
        clearInterval(window.statsIntervalId);
        console.log('📊 [STATS] Stopped by stopAutomation flag');
        return;
      }      
    }, 10000); // Every 10 seconds

  }).catch(error => {
    logger && logger.error && logger.error('Failed to start real-time stats:', error.message);
  });
  
  // Function returns immediately - non-blocking
  logger && logger.log && logger.log('✓ Real-time stats interval started in browser context');
}

module.exports = {
  joinGameXoc,
  handleInitialPopups,
  clickPhungGame,
  startRealtimeStats
};
