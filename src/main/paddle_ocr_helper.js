/**
 * PaddleOCR Helper - Local OCR Engine
 * Free, unlimited, runs locally on CPU/GPU
 * Supports: Vietnamese, English, Chinese, etc.
 * 
 * Flow: PaddleOCR (primary) → GitHub Models (fallback) → Tesseract (last resort)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

let paddleOCRInstance = null;

// Attempt to discover PaddleOCR model assets
// Search order:
// 1. Environment variable PADDLE_ASSETS_DIR
// 2. Local 'paddle-assets/' directory (project root)
// 3. Local 'assets/' directory (project root)
// 4. node_modules/paddleocr/assets (if someday bundled)
function findPaddleAssets(logger) {
  const candidates = [];
  const projectRoot = path.join(__dirname, '..', '..');
  const envDir = process.env.PADDLE_ASSETS_DIR;
  if (envDir) candidates.push(envDir);
  candidates.push(path.join(projectRoot, 'paddle-assets'));
  candidates.push(path.join(projectRoot, 'assets'));
  candidates.push(path.join(projectRoot, 'node_modules', 'paddleocr', 'assets'));

  logger && logger.log && logger.log('   🔍 Searching PaddleOCR assets...');
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) continue;
      const det = path.join(dir, 'PP-OCRv5_mobile_det_infer.onnx');
      const rec = path.join(dir, 'PP-OCRv5_mobile_rec_infer.onnx');
      const dict = path.join(dir, 'ppocrv5_dict.txt');
      if (fs.existsSync(det) && fs.existsSync(rec)) {
        logger && logger.log && logger.log(`   ✓ Found models in: ${dir}`);
        return { det, rec, dict: fs.existsSync(dict) ? dict : null };
      } else {
        logger && logger.log && logger.log(`   ⊘ Missing model files in: ${dir}`);
      }
    } catch (e) {
      logger && logger.warn && logger.warn(`   ⚠ Error accessing ${dir}: ${e.message}`);
    }
  }
  logger && logger.warn && logger.warn('   ✗ PaddleOCR assets not found. Please download models.' );
  return null;
}

/**
 * Initialize PaddleOCR (lazy load, run only once)
 * @param {object} logger - Logger instance
 * @returns {Promise<object>} - PaddleOCR instance
 */
async function initPaddleOCR(logger) {
  if (paddleOCRInstance) {
    logger && logger.log && logger.log('   ℹ  PaddleOCR already initialized, reusing instance');
    return paddleOCRInstance;
  }
  
  try {
    logger && logger.log && logger.log('   🚀 Initializing PaddleOCR (first time - will download models ~150MB)...');
    
    // Import required modules for PaddleOCR
    // PaddleOCR is an ES module (UMD format), so we need to use dynamic import()
    const paddleocr = await import('paddleocr');
    
    // Try to destructure PaddleOcrService from the module
    // Note: paddleocr@1.0.6 has a known issue where exports are empty
    // This is a package build problem, not our code issue
    const { PaddleOcrService } = paddleocr;
    
    if (!PaddleOcrService) {
      logger && logger.warn && logger.warn('   ⚠ PaddleOCR module imported but PaddleOcrService not found');
      logger && logger.warn && logger.warn('   This is a known issue with paddleocr@1.0.6 package');
      logger && logger.warn && logger.warn('   Workaround: Use Tesseract + GitHub Models instead');
      logger && logger.warn && logger.warn('   To fix: Wait for paddleocr@1.0.7+ or use alternative OCR');
      throw new Error('PaddleOcrService not found in paddleocr module (package build issue)');
    }
    
    // Also need ONNX Runtime for model inference
    const ort = await import('onnxruntime-node');
    
    logger && logger.log && logger.log('   ℹ  Loading ONNX models and creating PaddleOCR instance...');
    
    // Discover model files dynamically
    const assets = findPaddleAssets(logger);
    if (!assets) {
      throw new Error('PaddleOCR model assets not found. Set PADDLE_ASSETS_DIR or place models in ./paddle-assets');
    }
    
    logger && logger.log && logger.log('   Loading detection model...');
    const detectionBuffer = fs.readFileSync(assets.det);
    
    logger && logger.log && logger.log('   Loading recognition model...');
    const recognitionBuffer = fs.readFileSync(assets.rec);
    
    let charactersDictionary = null;
    if (assets.dict) {
      logger && logger.log && logger.log('   Loading character dictionary...');
      const dictContent = fs.readFileSync(assets.dict, 'utf8');
      charactersDictionary = dictContent.split('\n').filter(line => line.trim());
    }
    
    // Create PaddleOCR service instance
    paddleOCRInstance = await PaddleOcrService.createInstance({
      ort: ort.default,
      detection: {
        modelBuffer: detectionBuffer,
      },
      recognition: {
        modelBuffer: recognitionBuffer,
        charactersDictionary: charactersDictionary
      }
    });
    
    logger && logger.log && logger.log('   ✓ PaddleOCR instance created successfully');
    return paddleOCRInstance;
    
  } catch (err) {
    logger && logger.error && logger.error(`   ✗ PaddleOCR initialization failed: ${err.message}`);
    if (err.code === 'ENOENT') {
      logger && logger.error && logger.error('   Tip: Make sure paddleocr package is fully installed');
    }
    return null;
  }
}

/**
 * Read CAPTCHA using PaddleOCR (primary local OCR)
 * @param {string} imagePath - Path to CAPTCHA image
 * @param {string} targetColor - Target color (for context)
 * @param {object} logger - Logger instance
 * @returns {Promise<string>} - Extracted CAPTCHA text
 */
async function readCaptchaWithPaddleOCR(imagePath, targetColor, logger) {
  try {
    logger && logger.log && logger.log(`   🎨 Primary OCR: Using PaddleOCR (${targetColor})...`);
    
    // Initialize PaddleOCR if needed
    const ocr = await initPaddleOCR(logger);
    if (!ocr) {
      logger && logger.error && logger.error('   ✗ PaddleOCR not available, falling back to GitHub Models');
      return null;
    }
    
    // Check if image exists
    if (!fs.existsSync(imagePath)) {
      logger && logger.error && logger.error(`   ✗ Image not found: ${imagePath}`);
      return null;
    }
    
    logger && logger.log && logger.log(`   📖 Recognizing text with PaddleOCR...`);
    logger && logger.log && logger.log(`      Image: ${path.basename(imagePath)}`);
    
    // Load image and convert to RGB(A) format that PaddleOCR expects
    const img = await Jimp.read(imagePath);
    const width = img.bitmap.width;
    const height = img.bitmap.height;
    
    // Convert image data to Uint8Array in RGB format
    const data = new Uint8Array(width * height * 4); // RGBA
    const bitmap = img.bitmap;
    
    for (let i = 0; i < bitmap.data.length; i++) {
      data[i] = bitmap.data[i];
    }
    
    // Create input object for PaddleOCR
    const input = {
      data: data,
      width: width,
      height: height
    };
    
    logger && logger.log && logger.log(`   Image size: ${width}x${height}`);
    
    // Run PaddleOCR recognition
    const result = await ocr.recognize(input);
    
    // Parse results - PaddleOCR returns: { text: string, lines: [{ text: string }] }
    let captchaText = '';
    
    if (result && result.text) {
      captchaText = result.text;
      logger && logger.log && logger.log(`   ℹ  PaddleOCR result:`);
      logger && logger.log && logger.log(`      Raw text: "${captchaText}"`);
      
      if (result.lines && Array.isArray(result.lines)) {
        logger && logger.log && logger.log(`      Lines detected: ${result.lines.length}`);
      }
    }
    
    logger && logger.log && logger.log(`   Raw PaddleOCR result: "${captchaText}"`);
    
    // Clean text: remove whitespace and special characters
    captchaText = captchaText
      .replace(/\s+/g, '')           // Remove all whitespace
      .replace(/[^a-zA-Z0-9]/g, ''); // Remove non-alphanumeric
    
    logger && logger.log && logger.log(`   After cleaning: "${captchaText}"`);
    
    // Fix common character confusions
    captchaText = captchaText
      .replace(/0/g, 'O')  // 0 → O
      .replace(/1/g, 'I')  // 1 → I
      .replace(/5/g, 'S')  // 5 → S
      .replace(/8/g, 'B')  // 8 → B
      .replace(/l/g, 'I')  // l → I (lowercase L to I)
      .replace(/O(?=[0-9])/g, '0'); // O followed by digit → 0
    
    logger && logger.log && logger.log(`   After disambiguation: "${captchaText}"`);
    
    if (captchaText && captchaText.length > 0) {
      logger && logger.log && logger.log(`   ✅ PaddleOCR SUCCESS: "${captchaText}"`);
      return captchaText;
    } else {
      logger && logger.warn && logger.warn('   ⚠ PaddleOCR returned empty result, will try GitHub Models fallback');
      return null;
    }
    
  } catch (err) {
    logger && logger.error && logger.error(`   ✗ PaddleOCR error: ${err.message}`);
    logger && logger.log && logger.log('   → Will fallback to GitHub Models');
    return null;
  }
}

/**
 * Close PaddleOCR (cleanup resources)
 */
async function closePaddleOCR(logger) {
  try {
    if (paddleOCRInstance) {
      logger && logger.log && logger.log('   Closing PaddleOCR instance...');
      paddleOCRInstance = null;
      logger && logger.log && logger.log('   ✓ PaddleOCR closed');
    }
  } catch (err) {
    logger && logger.error && logger.error(`   Error closing PaddleOCR: ${err.message}`);
  }
}

/**
 * Get PaddleOCR status
 * @returns {object} - Status information
 */
function getPaddleOCRStatus() {
  return {
    initialized: paddleOCRInstance !== null,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  readCaptchaWithPaddleOCR,
  initPaddleOCR,
  closePaddleOCR,
  getPaddleOCRStatus,
  findPaddleAssets
};
