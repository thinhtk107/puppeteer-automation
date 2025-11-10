/**
 * PaddleOCR Helper for Captcha Recognition
 * 
 * Reads captcha from masked images using PaddleOCR
 * Provides high accuracy (90%+) for OCR tasks
 * 
 * Setup: pip install paddleocr paddlepaddle
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Read captcha text from image using PaddleOCR
 * @param {string} imagePath - Path to masked captcha image
 * @param {Object} logger - Logger object
 * @returns {Promise<string>} Recognized captcha text
 */
async function readCaptchaWithPaddleOCR(imagePath, logger) {
  logger && logger.log && logger.log(`→ Reading captcha with PaddleOCR...`);
  logger && logger.log && logger.log(`  Image path: ${imagePath}`);
  
  return new Promise((resolve, reject) => {
    try {
      // Check if file exists
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      // Create Python script to run PaddleOCR
      const pythonScript = `
import sys
import json
from paddleocr import PaddleOCR

try:
    # Initialize PaddleOCR (English only for speed)
    ocr = PaddleOCR(use_angle_cls=True, lang='en', use_gpu=False)
    
    # Read image and perform OCR
    image_path = r'${imagePath.replace(/\\/g, '\\\\')}'
    result = ocr.ocr(image_path, cls=True)
    
    # Extract text
    text = ''
    if result:
        for line in result:
            if line:
                for word_info in line:
                    if word_info and len(word_info) > 1:
                        text += word_info[1][0]
    
    # Clean: keep only alphanumeric characters
    cleaned = ''.join(c for c in text if c.isalnum())
    
    print(json.dumps({'success': True, 'text': cleaned}))
    
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))
    sys.exit(1)
`;

      logger && logger.log && logger.log(`  Processing with PaddleOCR...`);

      // Create temporary Python file
      const tempPyFile = path.join(os.tmpdir(), `paddle_ocr_${Date.now()}.py`);
      fs.writeFileSync(tempPyFile, pythonScript);

      // Run Python script with timeout
      execFile('python', [tempPyFile], { timeout: 120000 }, (err, stdout, stderr) => {
        // Clean up temp file
        try { fs.unlinkSync(tempPyFile); } catch(e) {}

        if (err) {
          logger && logger.error && logger.error(`❌ PaddleOCR Error: ${err.message}`);
          
          if (err.message.includes('not recognized')) {
            logger && logger.error && logger.error(`\n⚠️  Python not found in PATH!`);
            logger && logger.error && logger.error(`   1. Install Python: https://www.python.org/downloads/`);
            logger && logger.error && logger.error(`   2. CHECK "Add Python to PATH" during installation`);
            logger && logger.error && logger.error(`   3. Restart this application`);
          } else if (stderr && stderr.includes('No module named paddleocr')) {
            logger && logger.error && logger.error(`\n⚠️  PaddleOCR not installed!`);
            logger && logger.error && logger.error(`   Run: pip install paddleocr paddlepaddle`);
          } else if (stderr) {
            logger && logger.error && logger.error(`   stderr: ${stderr}`);
          }
          
          reject(err);
          return;
        }

        try {
          const result = JSON.parse(stdout);
          
          if (result.success) {
            const captchaText = result.text;
            
            if (captchaText.length === 0) {
              logger && logger.warn && logger.warn(`⚠️ PaddleOCR returned empty result`);
            } else {
              logger && logger.log && logger.log(`✅ PaddleOCR Result: "${captchaText}" (${captchaText.length} chars)`);
            }
            
            resolve(captchaText);
          } else {
            logger && logger.error && logger.error(`❌ PaddleOCR failed: ${result.error}`);
            reject(new Error(result.error));
          }
        } catch (parseError) {
          logger && logger.error && logger.error(`❌ Failed to parse PaddleOCR output: ${parseError.message}`);
          logger && logger.error && logger.error(`   Raw output: ${stdout}`);
          reject(parseError);
        }
      });

    } catch (error) {
      logger && logger.error && logger.error(`❌ PaddleOCR Error: ${error.message}`);
      reject(error);
    }
  });
}

/**
 * Batch read multiple captcha images
 * @param {Array<string>} imagePaths - Array of image paths
 * @param {Object} logger - Logger object
 * @returns {Promise<Array<string>>} Array of recognized texts
 */
async function readCaptchasBatchWithPaddleOCR(imagePaths, logger) {
  logger && logger.log && logger.log(`→ Batch reading ${imagePaths.length} captcha images with PaddleOCR...`);

  const results = await Promise.all(
    imagePaths.map(imagePath =>
      readCaptchaWithPaddleOCR(imagePath, logger)
        .catch(err => {
          logger && logger.warn && logger.warn(`  Failed to read ${path.basename(imagePath)}: ${err.message}`);
          return '';
        })
    )
  );

  logger && logger.log && logger.log(`✅ Batch reading complete: ${results.filter(r => r).length}/${imagePaths.length} successful`);
  return results;
}

/**
 * Verify PaddleOCR is installed
 * @param {Object} logger - Logger object
 * @returns {Promise<boolean>} True if ready
 */
async function verifyPaddleOCRSetup(logger) {
  logger && logger.log && logger.log(`→ Verifying PaddleOCR setup...`);

  return new Promise((resolve) => {
    const testScript = `
try:
    from paddleocr import PaddleOCR
    print('OK')
except Exception as e:
    print('ERROR')
`;

    const tempFile = path.join(os.tmpdir(), `paddle_test_${Date.now()}.py`);
    fs.writeFileSync(tempFile, testScript);

    execFile('python', [tempFile], { timeout: 10000 }, (err, stdout) => {
      try { fs.unlinkSync(tempFile); } catch(e) {}

      if (err || !stdout.includes('OK')) {
        logger && logger.error && logger.error(`❌ PaddleOCR not ready`);
        logger && logger.error && logger.error(`   Install with: pip install paddleocr paddlepaddle`);
        resolve(false);
      } else {
        logger && logger.log && logger.log(`✅ PaddleOCR is ready!`);
        resolve(true);
      }
    });
  });
}

module.exports = {
  readCaptchaWithPaddleOCR,
  readCaptchasBatchWithPaddleOCR,
  verifyPaddleOCRSetup
};
