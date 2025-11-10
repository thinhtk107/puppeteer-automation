/**
 * CAPTCHA PROCESSOR - MATCH JAVA LOGIC
 * 
 * Flow:
 * 1. Find instruction anchor
 * 2. OCR instruction to detect target color (đỏ/xanh/đen)
 * 3. Find captcha image
 * 4. Extract colored pixels using HSV (like Java extractColoredCharacters)
 * 5. OCR result
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');

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
 * Extract colored pixels from image using HSV ranges
 * Match Java: extractColoredCharacters()
 */
async function extractColoredPixelsHSV(imageBuffer, colorName, logger) {
  logger && logger.log && logger.log(`→ Extracting ${colorName} colored pixels...`);
  
  try {
    // Convert image to HSV and apply color mask
    let maskPath = imageBuffer.path || path.join(require('os').tmpdir(), `mask_${Date.now()}.png`);
    
    // Use OpenCV through Python wrapper if available, else use node-opencv
    const Jimp = require('jimp');
    const img = await Jimp.read(imageBuffer);
    
    // Create mask based on color
    // HSV ranges (like Java):
    // Red: H 0-10 or 170-180, S 120-255, V 70-255
    // Green: H 35-85, S 100-255, V 100-255  
    // Black: H 0-180, S 0-255, V 0-50
    
    let maskBuffer;
    
    if (colorName === 'red') {
      // Red color detection (HSV)
      maskBuffer = await extractColorRange(img, {
        hRanges: [[0, 10], [170, 180]],
        sMin: 120,
        vMin: 70
      }, logger);
    } else if (colorName === 'green') {
      // Green color detection
      maskBuffer = await extractColorRange(img, {
        hRanges: [[35, 85]],
        sMin: 100,
        vMin: 100
      }, logger);
    } else if (colorName === 'black') {
      // Black color detection
      maskBuffer = await extractColorRange(img, {
        hRanges: [[0, 180]],
        sMax: 255,
        vMax: 50
      }, logger);
    } else {
      maskBuffer = imageBuffer; // Default
    }
    
    const outputPath = path.join(require('os').tmpdir(), `captcha_mask_${colorName}_${Date.now()}.png`);
    await sharp(maskBuffer).toFile(outputPath);
    
    logger && logger.log && logger.log(`  ✓ Created color mask: ${path.basename(outputPath)}`);
    return outputPath;
    
  } catch (err) {
    logger && logger.error && logger.error('Error extracting colored pixels:', err.message);
    throw err;
  }
}

/**
 * Helper: Extract color range from image (HSV-based)
 */
async function extractColorRange(jimpImage, colorRange, logger) {
  return new Promise((resolve) => {
    const img = jimpImage.clone();
    
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      
      // Convert RGB to HSV
      const { h, s, v } = rgbToHsv(r, g, b);
      
      let isInRange = false;
      
      // Check hue ranges
      if (colorRange.hRanges) {
        for (const [hMin, hMax] of colorRange.hRanges) {
          if (h >= hMin && h <= hMax) {
            isInRange = true;
            break;
          }
        }
      } else {
        isInRange = true;
      }
      
      // Check saturation
      if (isInRange && colorRange.sMin !== undefined) {
        isInRange = isInRange && (s * 255 >= colorRange.sMin);
      }
      if (isInRange && colorRange.sMax !== undefined) {
        isInRange = isInRange && (s * 255 <= colorRange.sMax);
      }
      
      // Check value
      if (isInRange && colorRange.vMin !== undefined) {
        isInRange = isInRange && (v * 255 >= colorRange.vMin);
      }
      if (isInRange && colorRange.vMax !== undefined) {
        isInRange = isInRange && (v * 255 <= colorRange.vMax);
      }
      
      if (isInRange) {
        // Keep as white
        this.bitmap.data[idx + 0] = 255;
        this.bitmap.data[idx + 1] = 255;
        this.bitmap.data[idx + 2] = 255;
        this.bitmap.data[idx + 3] = 255;
      } else {
        // Make black
        this.bitmap.data[idx + 0] = 0;
        this.bitmap.data[idx + 1] = 0;
        this.bitmap.data[idx + 2] = 0;
        this.bitmap.data[idx + 3] = 255;
      }
    });
    
    resolve(img.bitmap);
  });
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
 * Main function: Extract captcha matching Java logic
 */
async function extractCaptchaLikeJava(page, captchaCoords, outputDir, logger) {
  logger && logger.log && logger.log('=== JAVA-LIKE CAPTCHA EXTRACTION ===');
  
  try {
    const { locateCaptchaImage } = require('./captcha_helper');
    const { runTesseract } = require('./ocr_helper');
    
    // Step 1: Locate captcha and instruction
    logger && logger.log && logger.log('Step 1: Locating captcha components...');
    const captchaLocation = await locateCaptchaImage(page, captchaCoords, outputDir, logger);
    
    if (!captchaLocation) {
      throw new Error('Failed to locate captcha image');
    }
    
    // Step 2: Detect target color from instruction
    logger && logger.log && logger.log('Step 2: Detecting target color from instruction...');
    
    // For now, assume instruction detection (would need to OCR instruction area)
    // In real Java code, it reads captcha_instruction_anchor.png
    const targetColor = 'red'; // TODO: Detect from instruction OCR
    logger && logger.log && logger.log(`  Target color: ${targetColor}`);
    
    // Step 3: Load and process captcha image
    logger && logger.log && logger.log('Step 3: Processing captcha image...');
    const captchaImageBuffer = fs.readFileSync(captchaLocation.imagePath);
    
    // Step 4: Extract colored pixels
    logger && logger.log && logger.log('Step 4: Extracting colored pixels (HSV-based)...');
    const maskedImagePath = await extractColoredPixelsHSV(captchaImageBuffer, targetColor, logger);
    
    // Step 5: OCR on masked image
    logger && logger.log && logger.log('Step 5: Running OCR...');
    const rawOcrResult = await runTesseract(maskedImagePath, 'eng', 60000);
    
    const captchaText = (rawOcrResult || '')
      .replace(/\s+/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .trim();
    
    logger && logger.log && logger.log(`✓ Final OCR result: "${captchaText}"`);
    logger && logger.log && logger.log('=== EXTRACTION COMPLETE ===');
    
    return captchaText;
    
  } catch (err) {
    logger && logger.error && logger.error('Java-like extraction failed:', err.message);
    throw err;
  }
}

module.exports = {
  detectTargetColorFromInstruction,
  extractColoredPixelsHSV,
  rgbToHsv,
  extractCaptchaLikeJava
};

/**
 * ADVANCED COLOR DETECTION với custom thresholds
 * Phát hiện 3 màu: BLACK, RED, BLUE
 * Với multiple sensitivity levels
 */
function detectColor(r, g, b, sensitivity = 'medium') {
  // Sensitivity levels:
  // 'strict' - chỉ nhận diện màu rõ ràng (ít false positive)
  // 'medium' - cân bằng giữa strict và relaxed
  // 'relaxed' - nhận diện hầu hết các kích thích màu (nhiều false positive)
  
  let blackThresholds, redThresholds, blueThresholds;
  
  if (sensitivity === 'strict') {
    blackThresholds = { max: 100, maxMax: 120 };
    redThresholds = { min: 100, minDiff: 40 };
    blueThresholds = { min: 100, minDiff: 40 };
  } else if (sensitivity === 'relaxed') {
    blackThresholds = { max: 160, maxMax: 180 };
    redThresholds = { min: 60, minDiff: 20 };   // ← RELAXED: catch faded red
    blueThresholds = { min: 60, minDiff: 20 };  // ← RELAXED: catch faded blue
  } else {
    // medium (default) - BALANCED
    blackThresholds = { max: 130, maxMax: 150 };
    redThresholds = { min: 80, minDiff: 30 };    // ← MEDIUM: balanced (from +35 to +30)
    blueThresholds = { min: 80, minDiff: 30 };   // ← MEDIUM: balanced (from +35 to +30)
  }
  
  // BLACK (đen) - tất cả channels thấp
  const isBlack = (r <= blackThresholds.max && 
                   g <= blackThresholds.max && 
                   b <= blackThresholds.max &&
                   Math.max(r, g, b) <= blackThresholds.maxMax);
  
  // RED (đỏ) - R cao hơn G, B
  const isRed = (r >= redThresholds.min && 
                 r >= g + redThresholds.minDiff && 
                 r >= b + redThresholds.minDiff);
  
  // BLUE (xanh) - B cao hơn R, G
  const isBlue = (b >= blueThresholds.min && 
                  b >= r + blueThresholds.minDiff && 
                  b >= g + blueThresholds.minDiff);
  
  return { isBlack, isRed, isBlue };
}

/**
 * Extract colored pixels với flexible sensitivity
 * @param {Buffer} imageBuffer - Raw image buffer
 * @param {Object} options - Config options
 * @returns {Promise<Buffer>} Processed image buffer
 */
async function extractColoredPixelsAdvanced(imageBuffer, options = {}) {
  const {
    sensitivity = 'medium',
    invert = false,
    quality = 'high',
    scaleFactor = 4,
    enhance = true
  } = options;
  
  const { data, info } = await sharp(imageBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const processedData = Buffer.alloc(data.length);
  
  // Process each pixel
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    const { isBlack, isRed, isBlue } = detectColor(r, g, b, sensitivity);
    const isColored = isBlack || isRed || isBlue;
    
    // Invert: if invert=false, colored→black, else→white
    const finalColor = invert ? !isColored : isColored;
    const pixelValue = finalColor ? 0 : 255;
    
    processedData[i] = pixelValue;
    processedData[i + 1] = pixelValue;
    processedData[i + 2] = pixelValue;
    processedData[i + 3] = 255; // Full opacity
  }
  
  // Create image from processed data
  let image = sharp(processedData, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4
    }
  });
  
  // Enhancement pipeline
  if (enhance) {
    image = image
      .normalize()  // Normalize levels
      .linear(1.5, -(128 * 1.5) + 128)  // Increase contrast 50%
      .sharpen({ sigma: 2.0 })  // Sharpen edges
      .median(2);  // Denoise
  }
  
  // Scale for better OCR
  image = image.resize(
    Math.round(info.width * scaleFactor),
    Math.round(info.height * scaleFactor),
    { kernel: 'lanczos3' }
  );
  
  return image.toBuffer();
}

/**
 * Process captcha image với multiple methods
 * Tạo 3-4 versions khác nhau để voting
 * @param {Page} page - Puppeteer page
 * @param {Object} captchaFieldCoords - Tọa độ field
 * @param {string} outputDir - Output directory
 * @param {Object} logger - Logger
 * @returns {Promise<Array>} Mảng đường dẫn ảnh đã xử lý
 */
async function processMultipleVersions(page, captchaFieldCoords, outputDir, logger) {
  const results = [];
  
  try {
    logger && logger.log && logger.log('=== PROCESSING MULTIPLE VERSIONS ===');
    
    // Step 1: Locate captcha image
    const { locateCaptchaImage } = require('./captcha_helper');
    const captchaLocation = await locateCaptchaImage(page, captchaFieldCoords, outputDir, logger);
    
    const originalImageBuffer = fs.readFileSync(captchaLocation.imagePath);
    
    // Version 1: MEDIUM sensitivity, standard scale
    logger && logger.log && logger.log('→ Version 1: Medium sensitivity (balanced)');
    const v1Buffer = await extractColoredPixelsAdvanced(originalImageBuffer, {
      sensitivity: 'medium',
      scaleFactor: 3,
      enhance: true
    });
    const v1Path = path.join(outputDir, `captcha_v1_medium_${Date.now()}.png`);
    await sharp(v1Buffer).toFile(v1Path);
    results.push(v1Path);
    logger && logger.log && logger.log('  ✓ Created:', path.basename(v1Path));
    
    // Version 2: RELAXED sensitivity, higher scale (catches more text)
    logger && logger.log && logger.log('→ Version 2: Relaxed sensitivity (inclusive)');
    const v2Buffer = await extractColoredPixelsAdvanced(originalImageBuffer, {
      sensitivity: 'relaxed',
      scaleFactor: 4,
      enhance: true
    });
    const v2Path = path.join(outputDir, `captcha_v2_relaxed_${Date.now()}.png`);
    await sharp(v2Buffer).toFile(v2Path);
    results.push(v2Path);
    logger && logger.log && logger.log('  ✓ Created:', path.basename(v2Path));
    
    // Version 3: STRICT sensitivity, standard scale (high confidence)
    logger && logger.log && logger.log('→ Version 3: Strict sensitivity (confident)');
    const v3Buffer = await extractColoredPixelsAdvanced(originalImageBuffer, {
      sensitivity: 'strict',
      scaleFactor: 3,
      enhance: true
    });
    const v3Path = path.join(outputDir, `captcha_v3_strict_${Date.now()}.png`);
    await sharp(v3Buffer).toFile(v3Path);
    results.push(v3Path);
    logger && logger.log && logger.log('  ✓ Created:', path.basename(v3Path));
    
    // Version 4: Inverted + relaxed (alternative approach)
    logger && logger.log && logger.log('→ Version 4: Inverted relaxed (alternative)');
    const v4Buffer = await extractColoredPixelsAdvanced(originalImageBuffer, {
      sensitivity: 'relaxed',
      invert: true,
      scaleFactor: 4,
      enhance: true
    });
    const v4Path = path.join(outputDir, `captcha_v4_inverted_${Date.now()}.png`);
    await sharp(v4Buffer).toFile(v4Path);
    results.push(v4Path);
    logger && logger.log && logger.log('  ✓ Created:', path.basename(v4Path));
    
    // Version 5: SUPER RELAXED (catch ultra-faded text) - 5x scale
    logger && logger.log && logger.log('→ Version 5: Super relaxed (ultra-faded catch)');
    const v5Buffer = await extractColoredPixelsAdvanced(originalImageBuffer, {
      sensitivity: 'relaxed',
      scaleFactor: 5,  // ← Larger scale to magnify tiny text
      enhance: true,
      quality: 'high'
    });
    const v5Path = path.join(outputDir, `captcha_v5_superrelaxed_${Date.now()}.png`);
    await sharp(v5Buffer).toFile(v5Path);
    results.push(v5Path);
    logger && logger.log && logger.log('  ✓ Created:', path.basename(v5Path));
    
    logger && logger.log && logger.log('=== PROCESSED 5 VERSIONS ===');
    
    return results;
    
  } catch (err) {
    logger && logger.error && logger.error('Multi-version processing failed:', err.message);
    throw err;
  }
}

/**
 * Advanced OCR with voting
 * Runs Tesseract on multiple versions, picks best
 * @param {Array<string>} imagePaths - Paths to images
 * @param {Object} logger - Logger
 * @returns {Promise<Object>} Best result with confidence
 */
async function ocrWithAdvancedVoting(imagePaths, logger) {
  const { runTesseract } = require('./ocr_helper');
  const results = [];
  
  logger && logger.log && logger.log('=== RUNNING OCR WITH VOTING ===');
  
  for (let idx = 0; idx < imagePaths.length; idx++) {
    const imagePath = imagePaths[idx];
    const versionName = ['Medium', 'Relaxed', 'Strict', 'Inverted', 'Super relaxed'][idx] || `Version${idx + 1}`;
    
    try {
      logger && logger.log && logger.log(`→ OCR on ${versionName} version...`);
      
      const text = await runTesseract(imagePath, 'eng', 60000);
      const cleaned = text
        .replace(/\s+/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .trim();
      
      logger && logger.log && logger.log(`  Result: "${cleaned}" (${cleaned.length} chars)`);
      
      if (cleaned.length > 0) {
        results.push({
          version: versionName,
          text: cleaned,
          length: cleaned.length,
          confidence: 0.9 // Base confidence
        });
      }
      
    } catch (err) {
      logger && logger.warn && logger.warn(`  Failed: ${err.message}`);
    }
  }
  
  if (results.length === 0) {
    logger && logger.error && logger.error('✗ All OCR attempts failed!');
    return null;
  }
  
  // Voting logic:
  // 1. If same text appears multiple times, use it
  // 2. Otherwise, prefer longer text (usually more complete)
  // 3. Apply version weights
  
  const textCounts = {};
  const versionWeights = {
    'Medium': 0.7,
    'Relaxed': 0.5,
    'Super relaxed': 0.55,  // ← V5: Slightly lower than V2 (more prone to noise)
    'Strict': 0.6,
    'Inverted': 0.4
  };
  
  results.forEach(r => {
    if (!textCounts[r.text]) {
      textCounts[r.text] = [];
    }
    textCounts[r.text].push(r);
  });
  
  // Find best text
  let bestResult = null;
  let bestScore = -1;
  
  Object.entries(textCounts).forEach(([text, occurrences]) => {
    let score = 0;
    
    // Bonus for multiple occurrences (votes)
    score += occurrences.length * 30;
    
    // Bonus for text length (usually more complete)
    score += text.length * 2;
    
    // Version weight bonus
    occurrences.forEach(occ => {
      const weight = versionWeights[occ.version] || 0.5;
      score += weight * 20;
    });
    
    if (score > bestScore) {
      bestScore = score;
      bestResult = {
        text: text,
        versions: occurrences,
        votes: occurrences.length,
        score: score,
        confidence: Math.min(1.0, 0.6 + (occurrences.length * 0.2))
      };
    }
  });
  
  logger && logger.log && logger.log(`✓ Selected: "${bestResult.text}"`);
  logger && logger.log && logger.log(`  Votes: ${bestResult.votes}/${results.length}`);
  logger && logger.log && logger.log(`  Confidence: ${(bestResult.confidence * 100).toFixed(0)}%`);
  logger && logger.log && logger.log('=== VOTING COMPLETE ===');
  
  return bestResult;
}

/**
 * MAIN FUNCTION: Complete captcha processing pipeline
 * @param {Page} page - Puppeteer page
 * @param {Object} captchaFieldCoords - Captcha field coordinates
 * @param {string} outputDir - Output directory
 * @param {Object} logger - Logger object
 * @returns {Promise<string>} Extracted captcha text
 */
async function extractCaptchaBest(page, captchaFieldCoords, outputDir, logger) {
  try {
    logger && logger.log && logger.log('');
    logger && logger.log && logger.log('╔════════════════════════════════════════════════════════════╗');
    logger && logger.log && logger.log('║        ULTIMATE CAPTCHA PROCESSOR - BEST METHOD              ║');
    logger && logger.log && logger.log('╚════════════════════════════════════════════════════════════╝');
    
    // Step 1: Process multiple versions
    const imagePaths = await processMultipleVersions(page, captchaFieldCoords, outputDir, logger);
    
    // Step 2: Run OCR with voting
    const bestResult = await ocrWithAdvancedVoting(imagePaths, logger);
    
    if (!bestResult || !bestResult.text) {
      logger && logger.error && logger.error('FAILED: Could not extract captcha text');
      return '';
    }
    
    logger && logger.log && logger.log('');
    logger && logger.log && logger.log('╔════════════════════════════════════════════════════════════╗');
    logger && logger.log && logger.log('║                    FINAL RESULT                             ║');
    logger && logger.log && logger.log(`║  Text: ${bestResult.text.padEnd(50)}║`);
    logger && logger.log && logger.log(`║  Length: ${String(bestResult.text.length).padEnd(48)}║`);
    logger && logger.log && logger.log(`║  Confidence: ${`${(bestResult.confidence * 100).toFixed(0)}%`.padEnd(46)}║`);
    logger && logger.log && logger.log('╚════════════════════════════════════════════════════════════╝');
    logger && logger.log && logger.log('');
    
    return bestResult.text;
    
  } catch (err) {
    logger && logger.error && logger.error('CAPTCHA PROCESSING ERROR:', err.message);
    logger && logger.error && logger.error('Stack:', err.stack);
    return '';
  }
}

module.exports = {
  detectColor,
  extractColoredPixelsAdvanced,
  processMultipleVersions,
  ocrWithAdvancedVoting,
  extractCaptchaBest
};
