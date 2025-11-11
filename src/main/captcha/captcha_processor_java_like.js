/**
 * CAPTCHA PROCESSOR - JAVA-LIKE LOGIC
 * Match Java SeleniumService.java exactly:
 * 1. Find instruction anchor ("captcha_instruction_anchor.png")
 * 2. Crop instruction area (350x50 from anchor)
 * 3. OCR instruction to detect target color (đỏ/xanh/đen)
 * 4. Find captcha image ("captcha_image_login_popup.png")
 * 5. Extract colored pixels using HSV (like Java extractColoredCharacters)
 * 6. OCR result with GitHub Models
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');
const {
  enhanceForDifficultFonts,
  thickenText,
  denoise
} = require('./advanced_image_preprocessing');

/**
 * Detect target color by checking which color template exists on screen
 * Try to find: red_captcha, green_captcha, black_captcha templates
 */
// async function detectColorByTemplateMatching(page, resourcesDir, logger) {
//   logger && logger.log && logger.log('→ Detecting target color by template matching...');
  
//   try {
//     const { matchTemplate } = require('./matcher_helper');
    
//     // Take screenshot for template matching
//     const uploadsDir = path.join(__dirname, '..', 'uploads');
//     if (!fs.existsSync(uploadsDir)) {
//       fs.mkdirSync(uploadsDir, { recursive: true });
//     }
//     const screenshotPath = path.join(uploadsDir, `color_detect_${Date.now()}.png`);
//     await page.screenshot({ path: screenshotPath, fullPage: false });
    
//     logger && logger.log && logger.log('  Checking color templates on screen...');
    
//     // Try to match each color template
//     const colorTemplates = [
//       { name: 'red_captcha.png', color: 'red' },
//       { name: 'blue_captcha.png', color: 'blue' },
//       { name: 'black_captcha.png', color: 'black' }
//     ];
    
//     for (const template of colorTemplates) {
//       const templatePath = path.join(resourcesDir, template.name);
      
//       if (!fs.existsSync(templatePath)) {
//         logger && logger.log && logger.log(`  ⊘ Template not found: ${template.name}`);
//         continue;
//       }
      
//       try {
//         const match = await matchTemplate(screenshotPath, templatePath);
        
//         if (match && match.x !== undefined && match.y !== undefined) {
//           logger && logger.log && logger.log(`  ✓ Found ${template.color} template at (${match.x}, ${match.y})`);
//           fs.unlinkSync(screenshotPath);
//           return template.color;
//         }
//       } catch (matchError) {
//         logger && logger.log && logger.log(`  ⊘ ${template.name} not matched`);
//       }
//     }
    
//     logger && logger.warn && logger.warn('  ⚠ No color template found on screen');
//     fs.unlinkSync(screenshotPath);
//     return 'unknown';
    
//   } catch (err) {
//     logger && logger.error && logger.error('  Error in template matching:', err.message);
//     return 'unknown';
//   }
// }
async function detectColorByTemplateMatching(page, resourcesDir, logger) {
  logger && logger.log && logger.log('→ STEP: Detecting target color via template matching');
  
  try {
    const { matchTemplate } = require('./template_matcher');
    
    // Validate resources directory
    let actualResourcesDir = resourcesDir;
    if (!actualResourcesDir || !fs.existsSync(actualResourcesDir)) {
      actualResourcesDir = path.join(__dirname, '..', '..', 'resources');
      logger && logger.log && logger.log(`  ℹ  Using default resources directory: ${actualResourcesDir}`);
    }
    
    // Step 1: Take screenshot of current page
    logger && logger.log && logger.log('  Step 1: Capturing page screenshot for template matching...');
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const screenshotPath = path.join(uploadsDir, `target_color_${Date.now()}.png`);
    
    // Actually take the screenshot
    await page.screenshot({ path: screenshotPath, fullPage: false });
    logger && logger.log && logger.log(`  ✓ Screenshot captured and saved: ${path.basename(screenshotPath)}`);
    
    // Step 2-4: Try to match each color template
    logger && logger.log && logger.log('  Step 2: Checking for color templates on screen...');
    
    const colorTemplates = [
      { name: 'blue_captcha.png', color: 'blue' },
      { name: 'black_captcha.png', color: 'black' },
      { name: 'red_captcha.png', color: 'red' },
    ];
    
    for (const template of colorTemplates) {
      const templatePath = path.join(actualResourcesDir, template.name);
      
      // Check if template file exists on disk
      if (!fs.existsSync(templatePath)) {
        logger && logger.log && logger.log(`    ⊘ Template file not found on disk: ${template.name}`);
        continue;
      }
      
      logger && logger.log && logger.log(`    → Trying to match: ${template.name}`);
      
      try {
        // Try template matching on the actual page/screenshot
        const match = await matchTemplate(screenshotPath, templatePath);
        
        // Check if template exists on the webpage
        if (match && match.x !== undefined && match.y !== undefined) {
          logger && logger.log && logger.log(`    ✓ FOUND! ${template.color.toUpperCase()} template exists on webpage at (${match.x}, ${match.y})`);
          try {
            fs.unlinkSync(screenshotPath);
          } catch (e) {}
          return template.color;
        } else {
          logger && logger.log && logger.log(`    ⊘ ${template.name} template NOT found on webpage (file exists but not visible)`);
        }
      } catch (matchError) {
        logger && logger.log && logger.log(`    ⊘ ${template.name} matching failed: ${matchError.message}`);
      }
    }
    
    // Step 5: Default to black if no templates found
    logger && logger.warn && logger.warn('  ⚠ No color template matched on screen, defaulting to: BLACK');
    try {
      fs.unlinkSync(screenshotPath);
    } catch (e) {}
    return 'black';
    
  } catch (err) {
    logger && logger.error && logger.error('  ✗ Error in template matching:', err.message);
    return 'black';
  }
}

/**
 * Detect target color by capturing text area right of instruction anchor
 * New logic:
 * 1. Find "captcha_instruction_anchor.png" on page
 * 2. Capture area to the RIGHT of anchor (contains color text)
 * 3. OCR the text to detect color keywords:
 *    - "đen" or "black" → black
 *    - "đỏ" or "red" → red  
 *    - "xanh" or "blue" → blue
 * 
 * @param {object} page - Puppeteer page instance
 * @param {string} resourcesDir - Path to resources directory containing anchor template
 * @param {object} logger - Logger instance
 * @returns {Promise<string>} - Detected color ('red', 'blue', 'black')
 */
async function detectTargetColorFromInstruction(page, resourcesDir, logger) {
  try {
    logger && logger.log && logger.log('→ STEP: Detecting target color from instruction text');
    
    // Step 1: Find instruction anchor on page
    logger && logger.log && logger.log('  Step 1: Locating instruction anchor template...');
    
    const { matchTemplate } = require('./template_matcher');
    const { readCaptchaWithGitHubModels } = require('../websocket/github_models_helper');
    
    // Validate resources directory
    let actualResourcesDir = resourcesDir;
    if (!actualResourcesDir || !fs.existsSync(actualResourcesDir)) {
      actualResourcesDir = path.join(__dirname, '..', '..', 'resources');
      logger && logger.log && logger.log(`  ℹ  Using default resources directory: ${actualResourcesDir}`);
    }
    
    // Take full page screenshot
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const fullScreenshotPath = path.join(uploadsDir, `instruction_detect_${Date.now()}.png`);
    await page.screenshot({ path: fullScreenshotPath, fullPage: false });
    logger && logger.log && logger.log(`  ✓ Screenshot captured: ${path.basename(fullScreenshotPath)}`);
    
    // Find anchor template
    const anchorTemplatePath = path.join(actualResourcesDir, 'captcha_instruction_anchor.png');
    
    if (!fs.existsSync(anchorTemplatePath)) {
      logger && logger.error && logger.error(`  ✗ Anchor template not found: ${anchorTemplatePath}`);
      return 'red'; // Default fallback
    }
    
    const anchorMatch = await matchTemplate(fullScreenshotPath, anchorTemplatePath);
    
    if (!anchorMatch || anchorMatch.x === undefined || anchorMatch.y === undefined) {
      logger && logger.warn && logger.warn('  ⚠ Instruction anchor not found on page, using default: red');
      fs.existsSync(fullScreenshotPath) && fs.unlinkSync(fullScreenshotPath);
      return 'red';
    }
    
    logger && logger.log && logger.log(`  ✓ Anchor found at position: (${anchorMatch.x}, ${anchorMatch.y})`);
    
    // Step 2: Capture color keyword text (ngay bên phải anchor)
    logger && logger.log && logger.log('  Step 2: Capturing color keyword area (right of anchor)...');
    
    // Load anchor template to get reference position
    const anchorImage = await Jimp.read(anchorTemplatePath);
    const anchorWidth = anchorImage.bitmap.width;
    const anchorHeight = anchorImage.bitmap.height;
    
    // UPDATED COORDINATES: Target the color keyword "đen" (black box in screenshot)
    // Based on screenshot instruction_text_1762702162257.png:
    // - Text "ac ky tu mau đen" appears after anchor
    // - Color keyword "đen" is in a small box after "mau"
    // - X: anchorX + anchorWidth + 185 (offset to "đen" position)
    // - Y: anchorY - 2 (slight upward to align with text baseline)
    // - Width: 80px (just enough for one word: đen/đỏ/xanh)
    // - Height: 30px (text box height)
    
    const textAreaX = anchorMatch.x + anchorWidth / 2;  // Offset to reach "đen" box
    const textAreaY = anchorMatch.y - anchorHeight / 2; // Baseline alignment
    const textAreaWidth = 100; // Narrow crop for single color word
    const textAreaHeight = 50; // Text height
    
    logger && logger.log && logger.log(`  Crop region: X=${textAreaX}, Y=${textAreaY}, W=${textAreaWidth}, H=${textAreaHeight}`);
    
    // Crop instruction text area from screenshot
    const instructionTextPath = path.join(uploadsDir, `instruction_text_${Date.now()}.png`);
    
    const fullScreenshotImage = await Jimp.read(fullScreenshotPath);
    const croppedTextArea = fullScreenshotImage.clone().crop(
      textAreaX,
      textAreaY,
      textAreaWidth,
      textAreaHeight
    );
    
    await croppedTextArea.writeAsync(instructionTextPath);
    logger && logger.log && logger.log(`  ✓ Color keyword area cropped: ${path.basename(instructionTextPath)}`);
    logger && logger.log && logger.log(`  📁 Saved for debugging: ${instructionTextPath}`);
    
    // Clean up full screenshot (but keep cropped text for debugging)
    fs.existsSync(fullScreenshotPath) && fs.unlinkSync(fullScreenshotPath);
    
    // Step 3: OCR on instruction text using Tesseract (save GitHub Models rate limit)
    logger && logger.log && logger.log('  Step 3: Running OCR on instruction text (Tesseract)...');
    
    const { readCaptchaWithTesseract } = require('../websocket/github_models_helper');
    let instructionText = await readCaptchaWithTesseract(instructionTextPath, logger);
    instructionText = (instructionText || '').toLowerCase().trim();
    
    logger && logger.log && logger.log(`  OCR result: "${instructionText}"`);
    
    // Step 4: Detect color from keywords
    logger && logger.log && logger.log('  Step 4: Mapping text to color...');
    
    const colorKeywords = {
      'black': ['đen', 'black', 'den'],
      'red': ['đỏ', 'red', 'do'],
      'blue': ['xanh', 'blue']
    };
    
    for (const [color, keywords] of Object.entries(colorKeywords)) {
      for (const keyword of keywords) {
        if (instructionText.includes(keyword)) {
          logger && logger.log && logger.log(`  ✓ Detected color: ${color.toUpperCase()} (matched keyword: "${keyword}")`);
          
          // DON'T delete temp file - keep for debugging
          // fs.existsSync(instructionTextPath) && fs.unlinkSync(instructionTextPath);
          logger && logger.log && logger.log(`  📁 Instruction text saved: ${instructionTextPath}`);
          
          return color;
        }
      }
    }
    
    // Fallback if no keyword matched
    logger && logger.warn && logger.warn('  ⚠ No color keyword matched, defaulting to: red');
    // DON'T delete - keep for debugging
    // fs.existsSync(instructionTextPath) && fs.unlinkSync(instructionTextPath);
    logger && logger.log && logger.log(`  📁 Instruction text saved: ${instructionTextPath}`);
    return 'red';
    
  } catch (err) {
    logger && logger.error && logger.error(`  ✗ Error detecting color from instruction: ${err.message}`);
    return 'red'; // Default to red on error
  }
}

/**
 * RGB to HSV conversion
 */
function rgbToHsv(r, g, b) {
  r = r / 255;
  g = g / 255;
  b = b / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  
  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h = h * 60;
    if (h < 0) h += 360;
  }
  
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  
  // Return HSV in ranges: H(0-180 for OpenCV), S(0-1), V(0-1)
  return {
    h: Math.floor(h / 2), // OpenCV uses 0-180 for hue
    s: s,
    v: v
  };
}

/**
 * Apply dilation to make text thicker and clearer
 * Helps OCR recognize characters better by filling small gaps
 * @param {Jimp} img - Jimp image object
 * @param {number} iterations - Number of dilation passes
 */
function dilateImage(img, iterations = 1) {
  for (let iter = 0; iter < iterations; iter++) {
    const tempData = Buffer.alloc(img.bitmap.data.length);
    img.bitmap.data.copy(tempData);
    
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      
      // If current pixel is BLACK (text), check 8 neighbors
      if (r === 0 && g === 0 && b === 0) {
        // Make all 8 neighbors black too (dilation)
        const neighbors = [
          [x-1, y-1], [x, y-1], [x+1, y-1],
          [x-1, y],           [x+1, y],
          [x-1, y+1], [x, y+1], [x+1, y+1]
        ];
        
        neighbors.forEach(([nx, ny]) => {
          if (nx >= 0 && nx < this.bitmap.width && ny >= 0 && ny < this.bitmap.height) {
            const nidx = (ny * this.bitmap.width + nx) * 4;
            tempData[nidx + 0] = 0;
            tempData[nidx + 1] = 0;
            tempData[nidx + 2] = 0;
            tempData[nidx + 3] = 255;
          }
        });
      }
    });
    
    tempData.copy(img.bitmap.data);
  }
}

/**
 * Extract colored pixels from MULTIPLE colors simultaneously
 * For complex captchas with text in different colors
 * 
 * @param {Buffer} imageBuffer - Input image buffer
 * @param {Array<string>} colorNames - Array of color names to extract ['red', 'green', 'black']
 * @param {Object} logger - Logger object
 * @returns {Promise<string>} Path to masked image
 */
async function extractMultipleColoredPixelsHSV(imageBuffer, colorNames, logger) {
  logger && logger.log && logger.log(`  Extracting colored pixels (HSV-based) for colors: ${colorNames.join(', ')}`);
  
  try {
    const img = await Jimp.read(imageBuffer);
    logger && logger.log && logger.log(`  Original image size: ${img.bitmap.width}x${img.bitmap.height}`);
    
    // Color counts for statistics
    let colorCounts = {};
    colorNames.forEach(c => colorCounts[c] = 0);
    
    // PASS 1: Count colored pixels using HSV
    logger && logger.log && logger.log('  PASS 1: Counting colored pixels...');
    
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      const a = this.bitmap.data[idx + 3];
      
      // Skip transparent pixels
      if (a < 128) return;
      
      // Convert to HSV
      const { h, s, v } = rgbToHsv(r, g, b);
      
      // Check each color
      for (const colorName of colorNames) {
        let isInRange = false;
        
        if (colorName === 'red') {
          const isRedHue = (h >= 0 && h <= 10) || (h >= 170 && h <= 180);
          const isSatOk = (s * 255) >= 80;
          const isValOk = (v * 255) >= 50;
          isInRange = isRedHue && isSatOk && isValOk;
        } else if (colorName === 'green') {
          const isGreenHue = h >= 35 && h <= 85;
          const isSatOk = (s * 255) >= 100;
          const isValOk = (v * 255) >= 100;
          isInRange = isGreenHue && isSatOk && isValOk;
        } else if (colorName === 'blue') {
          const isBlueHue = h >= 100 && h <= 140;
          const isSatOk = (s * 255) >= 60;
          const isValOk = (v * 255) >= 50;
          isInRange = isBlueHue && isSatOk && isValOk;
        } else if (colorName === 'black') {
          const isValOk = (v * 255) <= 50;
          isInRange = isValOk;
        } else if (colorName === 'cyan') {
          const isCyanHue = h >= 85 && h <= 105;
          const isSatOk = (s * 255) >= 50;
          const isValOk = (v * 255) >= 50;
          isInRange = isCyanHue && isSatOk && isValOk;
        } else if (colorName === 'yellow') {
          const isYellowHue = h >= 20 && h <= 40;
          const isSatOk = (s * 255) >= 80;
          const isValOk = (v * 255) >= 80;
          isInRange = isYellowHue && isSatOk && isValOk;
        }
        
        if (isInRange) {
          colorCounts[colorName]++;
          break; // Pixel chỉ thuộc 1 màu
        }
      }
    });
    
    // Log color distribution
    logger && logger.log && logger.log('  ✓ Color distribution:');
    colorNames.forEach(color => {
      const count = colorCounts[color] || 0;
      const percentage = ((count / (img.bitmap.width * img.bitmap.height)) * 100).toFixed(2);
      logger && logger.log && logger.log(`    ${color}: ${count} pixels (${percentage}%)`);
    });
    
    // PASS 2: Extract colored pixels (create binary mask)
    logger && logger.log && logger.log('  PASS 2: Creating binary mask...');
    
    let blackPixels = 0;
    let whitePixels = 0;
    
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      const a = this.bitmap.data[idx + 3];
      
      // Handle transparent pixels as white background
      if (a < 128) {
        this.bitmap.data[idx + 0] = 255;
        this.bitmap.data[idx + 1] = 255;
        this.bitmap.data[idx + 2] = 255;
        this.bitmap.data[idx + 3] = 255;
        whitePixels++;
        return;
      }
      
      // Convert to HSV
      const { h, s, v } = rgbToHsv(r, g, b);
      
      // Check if pixel matches ANY of the target colors
      let isTargetColor = false;
      
      for (const colorName of colorNames) {
        let isInRange = false;
        
        if (colorName === 'red') {
          const isRedHue = (h >= 0 && h <= 10) || (h >= 170 && h <= 180);
          const isSatOk = (s * 255) >= 80;
          const isValOk = (v * 255) >= 50;
          isInRange = isRedHue && isSatOk && isValOk;
        } else if (colorName === 'green') {
          const isGreenHue = h >= 35 && h <= 85;
          const isSatOk = (s * 255) >= 100;
          const isValOk = (v * 255) >= 100;
          isInRange = isGreenHue && isSatOk && isValOk;
        } else if (colorName === 'blue') {
          const isBlueHue = h >= 100 && h <= 140;
          const isSatOk = (s * 255) >= 60;
          const isValOk = (v * 255) >= 50;
          isInRange = isBlueHue && isSatOk && isValOk;
        } else if (colorName === 'black') {
          const isValOk = (v * 255) <= 50;
          isInRange = isValOk;
        } else if (colorName === 'cyan') {
          const isCyanHue = h >= 85 && h <= 105;
          const isSatOk = (s * 255) >= 50;
          const isValOk = (v * 255) >= 50;
          isInRange = isCyanHue && isSatOk && isValOk;
        } else if (colorName === 'yellow') {
          const isYellowHue = h >= 20 && h <= 40;
          const isSatOk = (s * 255) >= 80;
          const isValOk = (v * 255) >= 80;
          isInRange = isYellowHue && isSatOk && isValOk;
        }
        
        if (isInRange) {
          isTargetColor = true;
          break;
        }
      }
      
      // Apply masking
      if (isTargetColor) {
        // Target color → BLACK (text)
        this.bitmap.data[idx + 0] = 0;
        this.bitmap.data[idx + 1] = 0;
        this.bitmap.data[idx + 2] = 0;
        this.bitmap.data[idx + 3] = 255;
        blackPixels++;
      } else {
        // Non-target → WHITE (background)
        this.bitmap.data[idx + 0] = 255;
        this.bitmap.data[idx + 1] = 255;
        this.bitmap.data[idx + 2] = 255;
        this.bitmap.data[idx + 3] = 255;
        whitePixels++;
      }
    });
    
    logger && logger.log && logger.log(`  ✓ Masking complete:`);
    logger && logger.log && logger.log(`    Black pixels (text): ${blackPixels}`);
    logger && logger.log && logger.log(`    White pixels (bg):   ${whitePixels}`);
    
    const blackPercentage = ((blackPixels / (img.bitmap.width * img.bitmap.height)) * 100).toFixed(2);
    const whitePercentage = ((whitePixels / (img.bitmap.width * img.bitmap.height)) * 100).toFixed(2);
    logger && logger.log && logger.log(`    Distribution: Black ${blackPercentage}% | White ${whitePercentage}%`);
    
    // Check if result needs inversion
    if (blackPixels > img.bitmap.width * img.bitmap.height * 0.95) {
      logger && logger.log && logger.log('  ⚠ Too much black (>95%), inverting...');
      img.invert();
    } else if (whitePixels > img.bitmap.width * img.bitmap.height * 0.95) {
      logger && logger.log && logger.log('  ⚠ Too much white (>95%), inverting...');
      img.invert();
    }
    
    // ===== BALANCED PREPROCESSING (Fix "q" → "0l0l..." issue) =====
    logger && logger.log && logger.log('  Applying balanced preprocessing...');
    
    // 1. Moderate contrast (not too aggressive to preserve character shape)
    img.contrast(0.6); // Reduced from 0.9 to 0.6
    logger && logger.log && logger.log('    ✓ Step 1: Moderate contrast (0.6)');
    
    // 2. Light denoise BEFORE scale (preserve character integrity)
    img.threshold({ max: 220, autoGreyscale: false }); // Lighter threshold (220 instead of 200)
    logger && logger.log && logger.log('    ✓ Step 2: Light denoise (threshold 220)');
    
    // 3. Scale 3x for better OCR (reduced from 4x to preserve detail)
    const scaleFactor = 3;
    img.scale(scaleFactor, Jimp.RESIZE_BICUBIC); // Use bicubic for smoother scaling
    logger && logger.log && logger.log(`    ✓ Step 3: Scaled ${scaleFactor}x (${img.bitmap.width}x${img.bitmap.height})`);
    
    // 4. SKIP heavy preprocessing that breaks characters
    logger && logger.log && logger.log('    ✓ Step 4: Skipped heavy preprocessing');
    
    // 5. Single light thickening pass
    thickenText(img, 1, logger);
    logger && logger.log && logger.log('    ✓ Step 5: Light text thickening (1 iteration)');
    
    // 6. Light contrast boost
    img.contrast(0.3);
    logger && logger.log && logger.log('    ✓ Step 6: Light contrast boost (0.3)');
    
    // 7. Final cleanup with lighter threshold
    img.threshold({ max: 220, autoGreyscale: false });
    logger && logger.log && logger.log('    ✓ Step 7: Final cleanup (threshold 220)');
    
    // Save result
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const timestamp = Date.now();
    const colorsStr = colorNames.join('_');
    const outputPath = path.join(uploadsDir, `captcha_masked_${colorsStr}_${timestamp}.png`);
    
    await img.writeAsync(outputPath);
    logger && logger.log && logger.log(`  ✓ Isolated image saved: ${path.basename(outputPath)}`);
    logger && logger.log && logger.log(`    Final size: ${img.bitmap.width}x${img.bitmap.height}`);
    
    return outputPath;
    
  } catch (err) {
    logger && logger.error && logger.error('Error extracting colored pixels:', err.message);
    throw err;
  }
}
async function extractColoredPixelsHSV(imageBuffer, colorName, logger) {
  logger && logger.log && logger.log(`→ Extracting ${colorName} colored pixels (HSV-based)...`);
  
  try {
    const Jimp = require('jimp');
    const img = await Jimp.read(imageBuffer);
    
    logger && logger.log && logger.log(`  Image size: ${img.bitmap.width}x${img.bitmap.height}`);
    
    let coloredPixelCount = 0;
    let totalPixels = img.bitmap.width * img.bitmap.height;
    
    // First pass: count colored pixels
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      
      const { h, s, v } = rgbToHsv(r, g, b);
      
      let isInRange = false;
      
      if (colorName === 'red') {
        // Red: H(0-10 or 170-180), S(120-255), V(70-255)
        // RELAXED: Lower S threshold to catch faded red
        const isRedHue = (h >= 0 && h <= 10) || (h >= 170 && h <= 180);
        const isSatOk = (s * 255) >= 80;  // ← RELAXED from 120 to 80
        const isValOk = (v * 255) >= 50;   // ← RELAXED from 70 to 50
        isInRange = isRedHue && isSatOk && isValOk;
      } else if (colorName === 'blue') {
        // Green: H(35-85), S(100-255), V(100-255)
        const isGreenHue = h >= 35 && h <= 85;
        const isSatOk = (s * 255) >= 100;
        const isValOk = (v * 255) >= 100;
        isInRange = isGreenHue && isSatOk && isValOk;
      } else if (colorName === 'black') {
        // Black: H(0-180), S(0-255), V(0-50)
        const isValOk = (v * 255) <= 50;
        isInRange = isValOk;
      }
      
      if (isInRange) {
        coloredPixelCount++;
      }
    });
    
    const coloredPercentage = ((coloredPixelCount / totalPixels) * 100).toFixed(2);
    logger && logger.log && logger.log(`  Found ${coloredPixelCount}/${totalPixels} (${coloredPercentage}%) ${colorName} pixels`);
    
    // Second pass: create mask - ONLY keep colored pixels, rest becomes white
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      
      const { h, s, v } = rgbToHsv(r, g, b);
      
      let isInRange = false;
      
      if (colorName === 'red') {
        const isRedHue = (h >= 0 && h <= 10) || (h >= 170 && h <= 180);
        const isSatOk = (s * 255) >= 80;   // ← RELAXED
        const isValOk = (v * 255) >= 50;   // ← RELAXED
        isInRange = isRedHue && isSatOk && isValOk;
      } else if (colorName === 'blue') {
        const isGreenHue = h >= 35 && h <= 85;
        const isSatOk = (s * 255) >= 100;
        const isValOk = (v * 255) >= 100;
        isInRange = isGreenHue && isSatOk && isValOk;
      } else if (colorName === 'black') {
        const isValOk = (v * 255) <= 50;
        isInRange = isValOk;
      }
      
      if (isInRange) {
        // ✅ COLORED PIXEL: Keep as BLACK (for better contrast with white background)
        // This makes colored text stand out on white background
        this.bitmap.data[idx + 0] = 0;
        this.bitmap.data[idx + 1] = 0;
        this.bitmap.data[idx + 2] = 0;
        this.bitmap.data[idx + 3] = 255;
      } else {
        // ❌ NON-COLORED PIXEL: Make WHITE (erase)
        // Remove all non-target colors completely
        this.bitmap.data[idx + 0] = 255;
        this.bitmap.data[idx + 1] = 255;
        this.bitmap.data[idx + 2] = 255;
        this.bitmap.data[idx + 3] = 255;
      }
    });
    
    // ===== ENHANCEMENTS FOR BETTER OCR =====
    // Apply contrast enhancement
    img.contrast(0.5);  // Increase contrast
    
    // Optional: Apply slight sharpening for clearer edges
    // This helps OCR recognize characters better
    
    // Save to uploads directory instead of temp for debugging
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const outputPath = path.join(uploadsDir, `captcha_masked_${colorName}_${Date.now()}.png`);
    await img.writeAsync(outputPath);
    
    logger && logger.log && logger.log(`  ✓ Created masked image: ${path.basename(outputPath)}`);
    logger && logger.log && logger.log(`  ✓ Format: BLACK text on WHITE background`);
    return outputPath;
    
  } catch (err) {
    logger && logger.error && logger.error('Error extracting colored pixels:', err.message);
    throw err;
  }
}

/**
 * Main function: Solve CAPTCHA on popup (Original Logic - using captcha_helper)
 * Steps:
 * 1. Locate captcha image from page screenshot (using captcha_helper)
 * 2. Detect target color from instruction text
 * 3. Extract colored characters
 * 4. Perform OCR with GitHub Models
 */
async function solveCaptchaOnPopup(page, captchaCoords, outputDir, logger) {
  logger && logger.log && logger.log('=== SOLVE CAPTCHA ON POPUP (Java-like Logic) ===');
  
  try {
    const { locateCaptchaImage } = require('./captcha_helper');
    const { readCaptchaWithGitHubModels } = require('../websocket/github_models_helper');
    
    // Step 1: Locate captcha image from page screenshot
    logger && logger.log && logger.log('Step 1: Capturing captcha image from page...');
    const captchaLocation = await locateCaptchaImage(page, captchaCoords, outputDir, logger);
    
    if (!captchaLocation || !captchaLocation.imagePath) {
      logger && logger.error && logger.error('❌ Failed to capture captcha image from page');
      return '';
    }
    
    logger && logger.log && logger.log(`  ✓ Captcha image captured: ${path.basename(captchaLocation.imagePath)}`);
    
    // Step 2: Load captcha image
    logger && logger.log && logger.log('Step 2: Loading captcha image buffer...');
    const captchaImageBuffer = fs.readFileSync(captchaLocation.imagePath);
    
    // Step 3: Detect target color by reading instruction text
    logger && logger.log && logger.log('Step 3: Detecting target color from instruction text...');
    const resourcesDir = path.join(__dirname, '..', '..', 'resources');
    
    // Use new logic: capture text right of anchor and OCR it
    let targetColor = await detectTargetColorFromInstruction(page, resourcesDir, logger);
    
    logger && logger.log && logger.log(`  ✓ Target color detected: ${targetColor}`);
    
    // Step 4: Extract colored characters
    logger && logger.log && logger.log('Step 4: Extracting colored characters...');
    const maskedImagePath = await extractColoredPixelsHSV(captchaImageBuffer, targetColor, logger);
    
    // Step 5: Perform OCR with GitHub Models
    logger && logger.log && logger.log('Step 5: Running OCR with GitHub Models...');
    let captchaText = '';
    
    try {
      logger && logger.log && logger.log('→ Attempting GitHub Models GPT-4V...');
      captchaText = await readCaptchaWithGitHubModels(maskedImagePath, targetColor, logger);
      
      if (captchaText && captchaText.length > 0) {
        logger && logger.log && logger.log(`✅ GitHub Models succeeded: "${captchaText}"`);
      } else {
        throw new Error('GitHub Models returned empty result');
      }
    } catch (githubModelsError) {
      logger && logger.error && logger.error(`❌ GitHub Models failed: ${githubModelsError.message}`);
      captchaText = '';
    }
    
    // Clean result
    captchaText = (captchaText || '')
      .replace(/\s+/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .trim();
    
    logger && logger.log && logger.log(`✓ Final OCR result: "${captchaText}" (${captchaText.length} chars)`);
    logger && logger.log && logger.log('=== CAPTCHA SOLVING COMPLETE ===\n');
    
    return captchaText;
    
  } catch (err) {
    logger && logger.error && logger.error('Captcha solving failed:', err.message);
    return '';
  }
}

module.exports = {
  detectTargetColorFromInstruction,
  detectColorByTemplateMatching,
  extractColoredPixelsHSV,
  extractMultipleColoredPixelsHSV,
  rgbToHsv,
  solveCaptchaOnPopup
};
