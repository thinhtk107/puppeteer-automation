/**
 * Helper to extract red-colored text from a page or image area.
 * Two strategies:
 *  - DOM text scan: finds visible text nodes whose computed color is red-ish and returns concatenated text.
 *  - Canvas color filter: draws an image/canvas to a temporary canvas, filters pixels by red-dominant color,
 *    and produces a binary image (useful for OCR via Tesseract).
 */

async function extractRedTextFromDOM(page, selector, nearCoords = null) {
  // Find text in elements under selector that have colored computed color (RED, BLUE, GREEN)
  // If nearCoords provided, only return text near those coordinates (within 300px radius)
  return await page.evaluate((sel, coords) => {
    const el = document.querySelector(sel || 'body');
    if (!el) return '';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    let node; let out = [];
    
    while (node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent) continue;
      
      // If coords provided, check distance
      if (coords) {
        const rect = parent.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = Math.sqrt(
          Math.pow(centerX - coords.x, 2) + 
          Math.pow(centerY - coords.y, 2)
        );
        
        // Skip text that's too far from captcha field (>300px)
        if (distance > 300) continue;
      }
      
      const style = window.getComputedStyle(parent);
      if (!style) continue;
      const color = style.color || '';
      
      // parse rgb(...) or rgba(...) formats
      const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!m) continue;
      
      const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
      
      // ===== FLEXIBLE COLOR DETECTION WITH MULTIPLE THRESHOLDS =====
      // BLACK detection (đen - all channels low) - STRICT
      const isBlackVeryStrict = (r < 80 && g < 80 && b < 80);
      const isBlackStrict = (r < 100 && g < 100 && b < 100);
      const isBlackRelaxed = (r < 130 && g < 130 && b < 130 && Math.max(r, g, b) < 150);
      const isBlack = isBlackVeryStrict || isBlackStrict || isBlackRelaxed;
      
      // RED detection (đỏ) - MULTIPLE THRESHOLDS for robustness
      const isRedStrong = (r > 120 && r > g + 40 && r > b + 40);
      const isRedMedium = (r > 100 && r > g + 35 && r > b + 35);
      const isRedRelaxed = (r > 80 && r > g + 30 && r > b + 30);
      const isRed = isRedStrong || isRedMedium || isRedRelaxed;
      
      // BLUE detection (xanh) - MULTIPLE THRESHOLDS for robustness
      const isBlueStrong = (b > 120 && b > r + 40 && b > g + 40);
      const isBlueMedium = (b > 100 && b > r + 35 && b > g + 35);
      const isBlueRelaxed = (b > 80 && b > r + 30 && b > g + 30);
      const isBlue = isBlueStrong || isBlueMedium || isBlueRelaxed;
      
      // ===== COMBINE ALL THREE COLORS: BLACK, RED, BLUE =====
      if (isBlack || isRed || isBlue) {
        const txt = node.nodeValue.trim();
        if (txt) {
          // Filter out common instruction texts
          const lowerTxt = txt.toLowerCase();
          if (lowerTxt.includes('nhập') || 
              lowerTxt.includes('màu') || 
              lowerTxt.includes('đỏ') ||
              lowerTxt.includes('xanh') ||
              lowerTxt.includes('lam') ||
              lowerTxt.includes('lục') ||
              lowerTxt.includes('đen') ||
              lowerTxt.includes('hãy') ||
              lowerTxt.includes('các') ||
              lowerTxt.includes('ký tự') ||
              txt.length > 20) {
            // This is likely instruction text, skip it
            continue;
          }
          out.push(txt);
        }
      }
    }
    return out.join('');  // Join without space for captcha codes
  }, selector, nearCoords);
}

async function extractRedMaskImage(page, srcSelector, outPath) {
  // Draw the element to canvas and filter colored pixels (BLACK, RED, BLUE) into a binary image saved as PNG.
  // This runs in page context and returns a dataURL. Caller can decode and save if needed.
  const dataUrl = await page.evaluate(async (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    // create canvas sized to element
    const rect = el.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rect.width));
    canvas.height = Math.max(1, Math.round(rect.height));
    const ctx = canvas.getContext('2d');
    // draw the element by using html2canvas-style approach: use drawWindow is not available; try to clone
    // fallback: try to draw the element if it's an <img> or <canvas>
    if (el.tagName.toLowerCase() === 'img') {
      await new Promise((res) => { if (el.complete) res(); else el.onload = res; });
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
    } else if (el.tagName.toLowerCase() === 'canvas') {
      ctx.drawImage(el, 0, 0);
    } else {
      // fallback: render element's bounding box by drawing the whole page snapshot via svg foreignObject
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${canvas.width}' height='${canvas.height}'><foreignObject width='100%' height='100%'>${new XMLSerializer().serializeToString(el.cloneNode(true))}</foreignObject></svg>`;
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await new Promise(res => { img.onload = res; img.onerror = res; });
      ctx.drawImage(img, 0, 0);
    }
    const im = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2];
      
      // ===== FLEXIBLE COLOR DETECTION WITH MULTIPLE THRESHOLDS (Canvas version) =====
      // BLACK detection (đen - all channels low) - STRICT
      const isBlackVeryStrict = (r < 80 && g < 80 && b < 80);
      const isBlackStrict = (r < 100 && g < 100 && b < 100);
      const isBlackRelaxed = (r < 130 && g < 130 && b < 130 && Math.max(r, g, b) < 150);
      const isBlack = isBlackVeryStrict || isBlackStrict || isBlackRelaxed;
      
      // RED detection (đỏ) - MULTIPLE THRESHOLDS
      const isRedStrong = (r > 120 && r > g + 40 && r > b + 40);
      const isRedMedium = (r > 100 && r > g + 35 && r > b + 35);
      const isRedRelaxed = (r > 80 && r > g + 30 && r > b + 30);
      const isRed = isRedStrong || isRedMedium || isRedRelaxed;
      
      // BLUE detection (xanh) - MULTIPLE THRESHOLDS
      const isBlueStrong = (b > 120 && b > r + 40 && b > g + 40);
      const isBlueMedium = (b > 100 && b > r + 35 && b > g + 35);
      const isBlueRelaxed = (b > 80 && b > r + 30 && b > g + 30);
      const isBlue = isBlueStrong || isBlueMedium || isBlueRelaxed;
      
      // ===== COMBINE ALL THREE COLORS: BLACK, RED, BLUE =====
      if (isBlack || isRed || isBlue) {
        d[i] = 255; d[i+1] = 255; d[i+2] = 255; d[i+3] = 255;
      } else {
        d[i] = 0; d[i+1] = 0; d[i+2] = 0; d[i+3] = 255;
      }
    }
    ctx.putImageData(im, 0, 0);
    return canvas.toDataURL('image/png');
  }, srcSelector);
  if (!dataUrl) return null;
  // If outPath provided, save via Node fs
  if (outPath) {
    const base64 = dataUrl.split(',')[1];
    const fs = require('fs');
    fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
  }
  return dataUrl;
}

module.exports = { extractRedTextFromDOM, extractRedMaskImage };

// Crop an existing screenshot (page.png) around a detected template rectangle and create a color-mask image with Jimp (BLACK, RED, BLUE).
async function createRedMaskFromScreenshot(screenshotPath, cropRect, outPath) {
  const Jimp = require('jimp');
  const img = await Jimp.read(screenshotPath);
  const { x, y, width, height } = cropRect;
  const clone = img.clone().crop(x, y, Math.max(1, width), Math.max(1, height));
  clone.scan(0, 0, clone.bitmap.width, clone.bitmap.height, function(px, py, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    
    // ===== BLACK detection (đen - all channels low) =====
    const isBlackStrong = (r < 100) && (g < 100) && (b < 100);
    const isBlackMedium = (r < 130) && (g < 130) && (b < 130) && Math.max(r, g, b) < 150;
    const isBlackRelaxed = (r < 160) && (g < 160) && (b < 160) && Math.max(r, g, b) < 180;
    const isBlack = isBlackStrong || isBlackMedium || isBlackRelaxed;
    
    // ===== RED detection (đỏ) - RELAXED for faded red ===== 
    const isRedStrong = (r > 100) && (r > g + 40) && (r > b + 40);
    const isRedMedium = (r > 80) && (r > g + 30) && (r > b + 30);  // ← REDUCED from +50 to +30
    const isRedRelaxed = (r > 60) && (r > g + 20) && (r > b + 20);  // ← NEW: catch very faded red
    const isRed = isRedStrong || isRedMedium || isRedRelaxed;
    
    // ===== BLUE detection (xanh) - RELAXED for faded blue =====
    const isBlueStrong = (b > 100) && (b > r + 40) && (b > g + 40);
    const isBlueMedium = (b > 80) && (b > r + 30) && (b > g + 30);  // ← REDUCED from +50 to +30
    const isBlueRelaxed = (b > 60) && (b > r + 20) && (b > g + 20);  // ← NEW: catch very faded blue
    const isBlue = isBlueStrong || isBlueMedium || isBlueRelaxed;
    
    // ===== COMBINE ALL THREE COLORS: BLACK, RED, BLUE =====
    if (isBlack || isRed || isBlue) {
      this.bitmap.data[idx + 0] = 255;
      this.bitmap.data[idx + 1] = 255;
      this.bitmap.data[idx + 2] = 255;
      this.bitmap.data[idx + 3] = 255;
    } else {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 0;
      this.bitmap.data[idx + 2] = 0;
      this.bitmap.data[idx + 3] = 255;
    }
  });
  await clone.writeAsync(outPath);
  return outPath;
}

module.exports = { extractRedTextFromDOM, extractRedMaskImage, createRedMaskFromScreenshot };

/**
 * Try to run `ocr-captcha-v3` on a screenshot of the element matched by selector.
 * Returns recognized text or empty string. This function is defensive: if the
 * package is not installed or its API differs, it will return null so callers
 * can fallback.
 */
async function ocrCaptchaV3FromElement(page, selector, outPath) {
  try {
    // take element bounding box screenshot
    const rect = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top)), width: Math.round(r.width), height: Math.round(r.height) };
    }, selector);
    if (!rect) return null;
    // ensure outPath exists
    const path = require('path');
    const fs = require('fs');
    const savePath = outPath || path.join(process.cwd(), 'uploads', `captcha_area_${Date.now()}.png`);
    const clip = { x: rect.x, y: rect.y, width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    try {
      await page.screenshot({ path: savePath, clip });
    } catch (e) {
      // some pages may require fullPage false; try without clip as fallback
      await page.screenshot({ path: savePath, fullPage: false });
    }

    // create a red-mask image from the screenshot so OCR sees only red pixels
    const maskPath = outPath || savePath.replace(/\.png$/i, '_redmask.png');
    try {
      const { createRedMaskFromScreenshot } = require('./captcha_helper');
      await createRedMaskFromScreenshot(savePath, { x: 0, y: 0, width: clip.width, height: clip.height }, maskPath);
    } catch (e) {
      // if mask creation fails, continue with original screenshot
      // (we'll still try OCR but results may include non-red chars)
    }

    // try requiring ocr-captcha-v3
    let lib;
    try { lib = require('ocr-captcha-v3'); } catch (e) { lib = null; }
    if (!lib) return null;

    // common possible API shapes: try passing the maskPath first
    const targetImage = maskPath || savePath;
    if (typeof lib === 'function') {
      const res = await lib(targetImage);
      return (res && typeof res === 'string') ? res.trim() : (res && res.text ? String(res.text).trim() : null);
    }
    if (lib && typeof lib.read === 'function') {
      const res = await lib.read(targetImage);
      return (res && typeof res === 'string') ? res.trim() : (res && res.text ? String(res.text).trim() : null);
    }
    if (lib && typeof lib.process === 'function') {
      const res = await lib.process(targetImage);
      return (res && typeof res === 'string') ? res.trim() : (res && res.text ? String(res.text).trim() : null);
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Locate and extract captcha image area more intelligently
 * This function tries multiple strategies to find the actual captcha image
 * Captcha area nằm giữa input field và refresh button
 * @param {Page} page - Puppeteer page object
 * @param {Object} captchaFieldCoords - Coordinates of captcha input field {x, y}
 * @param {string} outputDir - Directory to save processed images
 * @param {Object} logger - Logger object
 * @returns {Promise<Object>} Object containing {imagePath, bounds}
 */
async function locateCaptchaImage(page, captchaFieldCoords, outputDir, logger) {
  const path = require('path');
  const Jimp = require('jimp');
  const fs = require('fs');
  const { matchTemplate } = require('./template_matcher');
  
  try {
    logger && logger.log && logger.log('Locating captcha image near field coordinates:', captchaFieldCoords);
    
    // Strategy 0: PRIMARY - Locate captcha area giữa input field và refresh button
    try {
      const inputTplPath = path.join(__dirname, '..', 'resources', 'captcha_field_input_popup.png');
      const refreshTplPath = path.join(__dirname, '..', 'resources', 'refresh.png');
      
      if (fs.existsSync(inputTplPath) && fs.existsSync(refreshTplPath)) {
        const fullScreenshotPath = path.join(outputDir, `captcha_full_${Date.now()}.png`);
        await page.screenshot({ path: fullScreenshotPath, fullPage: false });
        
        // Tìm vị trí input field template
        const inputCoords = await matchTemplate(fullScreenshotPath, inputTplPath);
        // Tìm vị trí refresh button template
        const refreshCoords = await matchTemplate(fullScreenshotPath, refreshTplPath);
        
        if (inputCoords && refreshCoords) {
          // Lấy kích thước templates
          const inputTpl = await Jimp.read(inputTplPath);
          const refreshTpl = await Jimp.read(refreshTplPath);
          
          const inputW = inputTpl.bitmap.width;
          const inputH = inputTpl.bitmap.height;
          const refreshW = refreshTpl.bitmap.width;
          const refreshH = refreshTpl.bitmap.height;
          
          // Tính toán tọa độ chính xác (trung tâm -> góc trên trái)
          const inputLeft = Math.round(inputCoords.x - inputW / 2);
          const inputTop = Math.round(inputCoords.y - inputH / 2);
          const inputRight = inputLeft + inputW;
          
          const refreshLeft = Math.round(refreshCoords.x - refreshW / 2);
          const refreshTop = Math.round(refreshCoords.y - refreshH / 2);
          
          // Khu vực captcha nằm giữa input field và refresh button
          const gap = 5; // margin nhỏ
          const captchaX = Math.max(0, inputRight + gap);
          const captchaY = Math.max(0, inputTop); // cùng hàng với input
          const captchaWidth = Math.max(40, refreshLeft - captchaX - gap);
          const captchaHeight = Math.max(inputH, refreshH);
          
          if (captchaWidth > 40) {
            const bounds = {
              x: captchaX,
              y: captchaY,
              width: captchaWidth,
              height: captchaHeight
            };
            
            // Crop từ screenshot đã lấy
            const fullImg = await Jimp.read(fullScreenshotPath);
            const cropped = fullImg.clone().crop(
              bounds.x,
              bounds.y,
              Math.min(bounds.width, fullImg.bitmap.width - bounds.x),
              Math.min(bounds.height, fullImg.bitmap.height - bounds.y)
            );
            
            const croppedPath = path.join(outputDir, `captcha_located_${Date.now()}_between_fields.png`);
            await cropped.writeAsync(croppedPath);
            
            logger && logger.log && logger.log('✓ Captcha located between input field and refresh button');
            logger && logger.log && logger.log('  Input field bounds:', { x: inputLeft, y: inputTop, w: inputW, h: inputH });
            logger && logger.log && logger.log('  Refresh button bounds:', { x: refreshLeft, y: refreshTop, w: refreshW, h: refreshH });
            logger && logger.log && logger.log('  Captcha bounds:', bounds);
            
            return {
              imagePath: croppedPath,
              bounds,
              method: 'between-fields'
            };
          }
        } else {
          logger && logger.warn && logger.warn('Template matching failed - input found:', !!inputCoords, 'refresh found:', !!refreshCoords);
        }
      } else {
        logger && logger.log && logger.log('Templates not found - input:', fs.existsSync(inputTplPath), 'refresh:', fs.existsSync(refreshTplPath));
      }
    } catch (e) {
      logger && logger.warn && logger.warn('Between-fields strategy failed: ' + e.message);
    }
    
    // Strategy 1: Try to find captcha image/canvas elements in DOM near the field
    const captchaElement = await page.evaluate((fieldX, fieldY) => {
      // Look for common captcha selectors
      const selectors = [
        'img[src*="captcha"]',
        'img[alt*="captcha"]',
        'canvas[id*="captcha"]',
        'canvas[class*="captcha"]',
        '#captcha img',
        '.captcha img',
        'img[id*="verify"]',
        'canvas'
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          // Check if element is near the field coordinates (within 200px)
          const distance = Math.sqrt(
            Math.pow(rect.left + rect.width/2 - fieldX, 2) + 
            Math.pow(rect.top + rect.height/2 - fieldY, 2)
          );
          
          if (distance < 200 && rect.width > 50 && rect.height > 20) {
            return {
              found: true,
              selector: selector,
              bounds: {
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              }
            };
          }
        }
      }
      return { found: false };
    }, captchaFieldCoords.x, captchaFieldCoords.y);
    
    if (captchaElement.found) {
      logger && logger.log && logger.log('Found captcha element in DOM:', captchaElement);
      
      // Take screenshot of the specific element
      const fullScreenshotPath = path.join(outputDir, `captcha_full_${Date.now()}.png`);
      await page.screenshot({ path: fullScreenshotPath, fullPage: false });
      
      // Crop to the captcha element bounds
      const img = await Jimp.read(fullScreenshotPath);
      const cropped = img.clone().crop(
        Math.max(0, captchaElement.bounds.x),
        Math.max(0, captchaElement.bounds.y),
        Math.min(captchaElement.bounds.width, img.bitmap.width - captchaElement.bounds.x),
        Math.min(captchaElement.bounds.height, img.bitmap.height - captchaElement.bounds.y)
      );
      
      const croppedPath = path.join(outputDir, `captcha_located_${Date.now()}.png`);
      await cropped.writeAsync(croppedPath);
      
      logger && logger.log && logger.log('Captcha image cropped and saved:', croppedPath);
      
      return {
        imagePath: croppedPath,
        bounds: captchaElement.bounds,
        method: 'dom-element'
      };
    }
    
    // Strategy 2: Use position heuristics as fallback
    logger && logger.log && logger.log('DOM element not found, trying to locate by position heuristics...');
    
    // Captcha image is usually ABOVE the input field
    // Common layout: [Captcha Image] -> [Text: "Hãy nhập..."] -> [Input Field]
    const estimatedBounds = {
      x: Math.max(0, Math.round(captchaFieldCoords.x - 90)),   // Center horizontally around field
      y: Math.max(0, Math.round(captchaFieldCoords.y - 100)),  // Look above the field
      width: 180,
      height: 50
    };
    
    logger && logger.log && logger.log('Using estimated captcha bounds:', estimatedBounds);
    
    const fullScreenshotPath = path.join(outputDir, `captcha_full_${Date.now()}.png`);
    await page.screenshot({ path: fullScreenshotPath, fullPage: false });
    
    const img = await Jimp.read(fullScreenshotPath);
    const cropped = img.clone().crop(
      estimatedBounds.x,
      estimatedBounds.y,
      Math.min(estimatedBounds.width, img.bitmap.width - estimatedBounds.x),
      Math.min(estimatedBounds.height, img.bitmap.height - estimatedBounds.y)
    );
    
    const croppedPath = path.join(outputDir, `captcha_located_${Date.now()}.png`);
    await cropped.writeAsync(croppedPath);
    
    logger && logger.log && logger.log('Captcha image cropped by position heuristic:', croppedPath);
    
    return {
      imagePath: croppedPath,
      bounds: estimatedBounds,
      method: 'position-heuristic'
    };
    
  } catch (err) {
    logger && logger.error && logger.error('Error locating captcha image:', err.message);
    throw err;
  }
}

/**
 * Extract captcha image from page and create enhanced red-only mask for OCR
 * Now uses intelligent captcha location detection
 * @param {Page} page - Puppeteer page object
 * @param {Object} captchaCoords - Coordinates from template matching {x, y}
 * @param {string} outputDir - Directory to save processed images
 * @param {Object} logger - Logger object
 * @returns {Promise<string>} Path to the processed red-mask image
 */
async function extractCaptchaRedMask(page, captchaCoords, outputDir, logger) {
  const path = require('path');
  const Jimp = require('jimp');
  
  try {
    logger && logger.log && logger.log('=== Starting captcha extraction ===');
    
    // Step 1: Intelligently locate the captcha image
    const captchaLocation = await locateCaptchaImage(page, captchaCoords, outputDir, logger);
    
    logger && logger.log && logger.log('Captcha located using method:', captchaLocation.method);
    logger && logger.log && logger.log('Captcha bounds:', captchaLocation.bounds);
    
    // Step 2: Load the cropped captcha image
    const img = await Jimp.read(captchaLocation.imagePath);
    
    logger && logger.log && logger.log('Processing captcha image:', {
      width: img.bitmap.width,
      height: img.bitmap.height
    });
    
    // Step 3: Create color mask with enhanced filtering (BLACK, RED, BLUE)
    // Analyze the image to find the best colored pixel threshold
    let blackPixelCount = 0;
    let redPixelCount = 0;
    let bluePixelCount = 0;
    let totalPixels = img.bitmap.width * img.bitmap.height;
    
    // First pass: count colored pixels to validate our approach
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(px, py, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      
      // ===== BLACK detection (đen - all channels low) =====
      if ((r < 100 && g < 100 && b < 100) || (r < 130 && g < 130 && b < 130 && Math.max(r, g, b) < 150)) {
        blackPixelCount++;
      }
      
      // ===== RED detection (đỏ) =====
      if (r > 100 && r > g + 30 && r > b + 30) {
        redPixelCount++;
      }
      
      // ===== BLUE detection (xanh) =====
      if (b > 100 && b > r + 30 && b > g + 30) {
        bluePixelCount++;
      }
    });
    
    const blackPercentage = (blackPixelCount / totalPixels * 100).toFixed(2);
    const redPercentage = (redPixelCount / totalPixels * 100).toFixed(2);
    const bluePercentage = (bluePixelCount / totalPixels * 100).toFixed(2);
    
    logger && logger.log && logger.log(`Color pixel analysis:`);
    logger && logger.log && logger.log(`  Black (đen): ${blackPixelCount}/${totalPixels} (${blackPercentage}%)`);
    logger && logger.log && logger.log(`  Red (đỏ): ${redPixelCount}/${totalPixels} (${redPercentage}%)`);
    logger && logger.log && logger.log(`  Blue (xanh): ${bluePixelCount}/${totalPixels} (${bluePercentage}%)`);
    
    // Second pass: Create the color mask (combine all 3 colors: BLACK, RED, BLUE)
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(px, py, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      
      // ===== BLACK detection (đen - all channels low) =====
      const isBlackStrong = (r < 100 && g < 100 && b < 100);
      const isBlackMedium = (r < 130 && g < 130 && b < 130 && Math.max(r, g, b) < 150);
      const isBlack = isBlackStrong || isBlackMedium;
      
      // ===== RED detection (đỏ) =====
      const isRed = (r > 100) && (r > g + 30) && (r > b + 30);
      
      // ===== BLUE detection (xanh) =====
      const isBlue = (b > 100) && (b > r + 30) && (b > g + 30);
      
      // ===== COMBINE ALL THREE COLORS: BLACK, RED, BLUE =====
      if (isBlack || isRed || isBlue) {
        // Keep as white for OCR (better contrast)
        this.bitmap.data[idx + 0] = 255;
        this.bitmap.data[idx + 1] = 255;
        this.bitmap.data[idx + 2] = 255;
        this.bitmap.data[idx + 3] = 255;
      } else {
        // Make black (remove non-colored pixels)
        this.bitmap.data[idx + 0] = 0;
        this.bitmap.data[idx + 1] = 0;
        this.bitmap.data[idx + 2] = 0;
        this.bitmap.data[idx + 3] = 255;
      }
    });
    
    // Step 4: Image enhancements for better OCR
    logger && logger.log && logger.log('Applying image enhancements...');
    
    img.contrast(0.4);      // Increase contrast more aggressively
    img.normalize();        // Normalize levels
    
    // Scale up for better OCR (3x instead of 2x)
    const scaleFactor = 3;
    img.scale(scaleFactor, Jimp.RESIZE_BICUBIC);
    
    logger && logger.log && logger.log(`Image scaled ${scaleFactor}x to ${img.bitmap.width}x${img.bitmap.height}`);
    
    // Step 5: Save the final red-mask image
    const maskPath = path.join(outputDir, `captcha_red_mask_${Date.now()}.png`);
    await img.writeAsync(maskPath);
    
    logger && logger.log && logger.log('Red-mask captcha created:', maskPath);
    logger && logger.log && logger.log('=== Captcha extraction complete ===');
    
    return maskPath;
    
  } catch (err) {
    logger && logger.error && logger.error('Error creating captcha red mask:', err.message);
    throw err;
  }
}

module.exports = { 
  extractRedTextFromDOM, 
  extractRedMaskImage, 
  createRedMaskFromScreenshot, 
  ocrCaptchaV3FromElement,
  locateCaptchaImage,
  extractCaptchaRedMask 
};


