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
async function detectColorByTemplateMatching(page, resourcesDir, logger) {
  logger && logger.log && logger.log('→ Detecting target color by template matching...');
  
  try {
    const { matchTemplate } = require('./matcher_helper');
    
    // Take screenshot for template matching
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const screenshotPath = path.join(uploadsDir, `color_detect_${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    
    logger && logger.log && logger.log('  Checking color templates on screen...');
    
    // Try to match each color template
    const colorTemplates = [
      { name: 'red_captcha.png', color: 'red' },
      { name: 'blue_captcha.png', color: 'blue' },
      { name: 'black_captcha.png', color: 'black' }
    ];
    
    for (const template of colorTemplates) {
      const templatePath = path.join(resourcesDir, template.name);
      
      if (!fs.existsSync(templatePath)) {
        logger && logger.log && logger.log(`  ⊘ Template not found: ${template.name}`);
        continue;
      }
      
      try {
        const match = await matchTemplate(screenshotPath, templatePath);
        
        if (match && match.x !== undefined && match.y !== undefined) {
          logger && logger.log && logger.log(`  ✓ Found ${template.color} template at (${match.x}, ${match.y})`);
          fs.unlinkSync(screenshotPath);
          return template.color;
        }
      } catch (matchError) {
        logger && logger.log && logger.log(`  ⊘ ${template.name} not matched`);
      }
    }
    
    logger && logger.warn && logger.warn('  ⚠ No color template found on screen');
    fs.unlinkSync(screenshotPath);
    return 'unknown';
    
  } catch (err) {
    logger && logger.error && logger.error('  Error in template matching:', err.message);
    return 'unknown';
  }
}

/**
 * Detect target color from instruction image using OCR
 * Match Java: detectColorFromInstruction()
 */
async function detectTargetColorFromInstruction(instructionImagePath, logger) {
  const { runTesseract } = require('./ocr_helper');
  
  try {
    logger && logger.log && logger.log('→ Detecting target color from instruction...');
    
    // OCR on instruction image with Vietnamese language
    const instructionText = await runTesseract(instructionImagePath, 'vie', 30000);
    const lowerText = (instructionText || '').toLowerCase();
    
    logger && logger.log && logger.log('  Instruction OCR result:', JSON.stringify(lowerText));
    
    // Map Vietnamese color names to English
    const colorMap = {
      'đỏ': 'red',
      'xanh': 'green', 
      'đen': 'black'
    };
    
    for (const [vietnameseName, englishName] of Object.entries(colorMap)) {
      if (lowerText.includes(vietnameseName)) {
        logger && logger.log && logger.log(`  ✓ Detected target color: ${englishName} (from "${vietnameseName}")`);
        return englishName;
      }
    }
    
    logger && logger.warn && logger.warn('  ⚠ Could not detect color, defaulting to RED');
    return 'red';
    
  } catch (err) {
    logger && logger.error && logger.error('  Error detecting color:', err.message);
    return 'red'; // Default to red
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
  logger && logger.log && logger.log(`→ Extracting multiple colors: ${colorNames.join(', ')} (HSV-based)...`);
  
  try {
    const Jimp = require('jimp');
    const img = await Jimp.read(imageBuffer);
    
    logger && logger.log && logger.log(`  Image size: ${img.bitmap.width}x${img.bitmap.height}`);
    
    let totalColoredPixels = 0;
    let totalPixels = img.bitmap.width * img.bitmap.height;
    let colorCounts = {};
    
    // Initialize color counts
    colorNames.forEach(color => colorCounts[color] = 0);
    
    // First pass: count pixels for each color
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      
      const { h, s, v } = rgbToHsv(r, g, b);
      
      // Check each specified color
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
        } else if (colorName === 'black') {
          const isValOk = (v * 255) <= 50;
          isInRange = isValOk;
        }
        
        if (isInRange) {
          colorCounts[colorName]++;
          totalColoredPixels++;
          break; // Count each pixel only once, even if it matches multiple colors
        }
      }
    });
    
    // Log color distribution
    colorNames.forEach(color => {
      const percentage = ((colorCounts[color] / totalPixels) * 100).toFixed(2);
      logger && logger.log && logger.log(`  ${color}: ${colorCounts[color]}/${totalPixels} (${percentage}%) pixels`);
    });
    
    const totalPercentage = ((totalColoredPixels / totalPixels) * 100).toFixed(2);
    logger && logger.log && logger.log(`  Total colored pixels: ${totalColoredPixels}/${totalPixels} (${totalPercentage}%)`);
    
    // Second pass: create mask - keep ALL specified colors as BLACK, others as WHITE
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      
      const { h, s, v } = rgbToHsv(r, g, b);
      
      let isInAnyRange = false;
      
      // Check if pixel matches ANY of the specified colors
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
        } else if (colorName === 'black') {
          const isValOk = (v * 255) <= 50;
          isInRange = isValOk;
        }
        
        if (isInRange) {
          isInAnyRange = true;
          break;
        }
      }
      
      if (isInAnyRange) {
        // ✅ ANY COLORED PIXEL: Keep as BLACK (text)
        this.bitmap.data[idx + 0] = 0;
        this.bitmap.data[idx + 1] = 0;
        this.bitmap.data[idx + 2] = 0;
        this.bitmap.data[idx + 3] = 255;
      } else {
        // ❌ NON-COLORED PIXEL: Make WHITE (erase background)
        this.bitmap.data[idx + 0] = 255;
        this.bitmap.data[idx + 1] = 255;
        this.bitmap.data[idx + 2] = 255;
        this.bitmap.data[idx + 3] = 255;
      }
    });
    
    // Apply aggressive contrast enhancement for better OCR
    // Jimp.contrast ranges from -1 (all black) to 1 (all white)
    // 0.5 is subtle, 0.8+ is aggressive
    img.contrast(0.9);  // Aggressive contrast enhancement
    
    // Additional brightness adjustment to ensure crisp black/white
    img.brightness(0.1);
    
    // Apply dilation to make text thicker and clearer for OCR
    logger && logger.log && logger.log(`  Applying text dilation for clarity...`);
    dilateImage(img, 1);  // Single dilation pass
    
    // Apply advanced preprocessing for difficult fonts
    logger && logger.log && logger.log(`  Applying advanced preprocessing...`);
    await enhanceForDifficultFonts(img, logger);
    
    // Thicken text lines for thin/light fonts
    logger && logger.log && logger.log(`  Thickening text for unusual fonts...`);
    thickenText(img, 2);  // Thicken more aggressively
    
    // Denoise to remove small artifacts
    logger && logger.log && logger.log(`  Denoising image...`);
    denoise(img, 1);
    
    // Save to uploads directory instead of temp for debugging
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const outputPath = path.join(uploadsDir, `captcha_masked_multi_${colorNames.join('_')}_${Date.now()}.png`);
    await img.writeAsync(outputPath);
    
    logger && logger.log && logger.log(`  ✓ Created multi-color masked image: ${path.basename(outputPath)}`);
    logger && logger.log && logger.log(`  ✓ Format: BLACK text (${colorNames.join(', ')}) on WHITE background`);
    return outputPath;
    
  } catch (err) {
    logger && logger.error && logger.error('Error extracting multiple colored pixels:', err.message);
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
      } else if (colorName === 'green') {
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
      } else if (colorName === 'green') {
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
 * Main function: Extract complex captcha with MULTIPLE colors
 * For captchas where text appears in different colors
 * Uses PaddleOCR for high accuracy
 */
async function extractCaptchaMultiColor(page, captchaCoords, outputDir, logger) {
  logger && logger.log && logger.log('=== MULTI-COLOR CAPTCHA EXTRACTION (GitHub Models Only) ===');
  
  try {
    const { locateCaptchaImage } = require('./captcha_helper');
    const { readCaptchaWithGitHubModels } = require('./github_models_helper');
    
    // Step 1: Locate captcha components
    logger && logger.log && logger.log('Step 1: Locating captcha components...');
    const captchaLocation = await locateCaptchaImage(page, captchaCoords, outputDir, logger);
    
    if (!captchaLocation) {
      throw new Error('Failed to locate captcha image');
    }
    
    // Step 2: Load captcha image
    logger && logger.log && logger.log('Step 2: Loading captcha image...');
    const captchaImageBuffer = fs.readFileSync(captchaLocation.imagePath);
    
    // Step 3: Extract ALL 3 colors simultaneously for complex captchas
    logger && logger.log && logger.log('Step 3: Extracting text from all 3 colors (red, green, black)...');
    const targetColors = ['red', 'green', 'black'];
    const maskedImagePath = await extractMultipleColoredPixelsHSV(captchaImageBuffer, targetColors, logger);
    
    // Step 4: OCR on multi-color masked image using GitHub Models
    logger && logger.log && logger.log('Step 4: Running OCR with GitHub Models...');
    let captchaText = '';
    
    try {
      logger && logger.log && logger.log('→ Attempting GitHub Models GPT-4V...');
      captchaText = await readCaptchaWithGitHubModels(maskedImagePath, logger);
      
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
    
    logger && logger.log && logger.log(`✓ Multi-color OCR result: "${captchaText}" (${captchaText.length} chars)`);
    logger && logger.log && logger.log('=== MULTI-COLOR EXTRACTION COMPLETE ===');
    
    return captchaText;
    
  } catch (err) {
    logger && logger.error && logger.error('Multi-color extraction failed:', err.message);
    throw err;
  }
}

/**
 * Main function: Solve CAPTCHA on popup (match Java solveCaptchaOnPopup)
 * Steps:
 * 1. Find instruction anchor point
 * 2. Crop instruction area (350x50 from anchor)
 * 3. Detect target color from instruction
 * 4. Find captcha image location
 * 5. Extract colored characters
 * 6. Perform OCR with GitHub Models
 */
async function solveCaptchaOnPopup(page, captchaCoords, outputDir, logger) {
  logger && logger.log && logger.log('=== SOLVE CAPTCHA ON POPUP (Java-like Logic) ===');
  
  try {
    const { locateCaptchaImage } = require('./captcha_helper');
    const { readCaptchaWithGitHubModels } = require('./github_models_helper');
    
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
    
    // Step 3: Detect target color using template matching on screen
    logger && logger.log && logger.log('Step 3: Detecting target color via template matching...');
    const resourcesDir = path.join(__dirname, 'resources');
    
    // Use template matching to find color template on screen
    let targetColor = await detectColorByTemplateMatching(page, resourcesDir, logger);
    
    // Fallback to black if detection fails
    if (targetColor === 'unknown') {
      logger && logger.warn && logger.warn('  ⚠ Template matching failed, using default: black');
      targetColor = 'black';
    }
    
    logger && logger.log && logger.log(`  ✓ Target color: ${targetColor}`);
    
    // Step 4: Extract colored characters
    logger && logger.log && logger.log('Step 4: Extracting colored characters...');
    const maskedImagePath = await extractColoredPixelsHSV(captchaImageBuffer, targetColor, logger);
    
    // Step 5: Perform OCR with GitHub Models
    logger && logger.log && logger.log('Step 5: Running OCR with GitHub Models...');
    let captchaText = '';
    
    try {
      logger && logger.log && logger.log('→ Attempting GitHub Models GPT-4V...');
      captchaText = await readCaptchaWithGitHubModels(maskedImagePath, logger);
      
      if (captchaText && captchaText.length > 0) {
        logger && logger.log && logger.log(`✅ OCR succeeded: "${captchaText}"`);
      } else {
        throw new Error('GitHub Models returned empty result');
      }
    } catch (ocrError) {
      logger && logger.error && logger.error(`❌ OCR failed: ${ocrError.message}`);
      captchaText = '';
    }
    
    // Clean result
    captchaText = (captchaText || '')
      .replace(/\s+/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .trim();
    
    logger && logger.log && logger.log(`✓ Final CAPTCHA result: "${captchaText}" (${captchaText.length} chars)`);
    logger && logger.log && logger.log('=== CAPTCHA SOLVING COMPLETE ===');
    
    return captchaText;
    
  } catch (err) {
    logger && logger.error && logger.error('CAPTCHA solving failed:', err.message);
    throw err;
  }
}

module.exports = {
  detectTargetColorFromInstruction,
  detectColorByTemplateMatching,
  extractColoredPixelsHSV,
  extractMultipleColoredPixelsHSV,
  rgbToHsv,
  extractCaptchaJavaStyle,
  extractCaptchaMultiColor,
  solveCaptchaOnPopup
};
