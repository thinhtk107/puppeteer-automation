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
import warnings
from paddleocr import PaddleOCR
from PIL import Image, ImageOps, ImageFilter

# Suppress deprecation warnings
warnings.filterwarnings('ignore', category=DeprecationWarning)

try:
    # Initialize PaddleOCR with rotation detection
    # use_angle_cls=True: Detect and correct rotated text (0°, 90°, 180°, 270°)
    try:
        # Try with angle detection (newer versions)
        ocr = PaddleOCR(lang='en', use_angle_cls=True)
    except:
        # Fallback for older versions
        ocr = PaddleOCR(lang='en')
    
    # Read image and perform OCR with preprocessing
    image_path = r'${imagePath.replace(/\\/g, '\\\\')}'

    # Preprocess: open, convert to grayscale, normalize size, binarize, denoise
    try:
        im = Image.open(image_path)
        im = im.convert('L')  # grayscale

        # Normalize height for consistent recognition (keeps aspect ratio)
        target_h = 64
        w, h = im.size
        if h != target_h and h > 0:
            scale = target_h / float(h)
            new_w = max(1, int(w * scale))
            im = im.resize((new_w, target_h), Image.BILINEAR)

        # Increase contrast and binarize
        im = ImageOps.autocontrast(im)
        im = im.point(lambda p: 255 if p > 180 else 0)

        # Light denoise
        im = im.filter(ImageFilter.MedianFilter(size=3))

        # Save to a temporary path for PaddleOCR
        import os, tempfile
        tmpdir = tempfile.gettempdir()
        pre_path = os.path.join(tmpdir, f"paddle_pre_{int(__import__('time').time()*1000)}.png")
        im.save(pre_path)
        ocr_input = pre_path
    except Exception:
        # Fallback: use original path if preprocessing fails
        ocr_input = image_path

    result = ocr.ocr(ocr_input)
    
    # Extract text with robust parsing (supports multiple PaddleOCR formats)
    text = ''
    confidence_scores = []

    def _parse_word_info(wi):
        try:
            if not wi:
                return '', 0.0
            # Typical format: [box, (text, score)]
            if isinstance(wi, (list, tuple)) and len(wi) >= 2:
                data = wi[1]
                if isinstance(data, (list, tuple)):
                    dt = str(data[0]) if len(data) >= 1 else ''
                    sc = float(data[1]) if len(data) >= 2 and isinstance(data[1], (int, float)) else 1.0
                    return dt, sc
                elif isinstance(data, str):
                    return data, 1.0
                elif isinstance(data, dict):
                    dt = str(data.get('text', ''))
                    sc = float(data.get('score', data.get('confidence', 1.0)))
                    return dt, sc
            return '', 0.0
        except Exception:
            return '', 0.0

    def _iter_words(res):
        if not res:
            return
        # res may be nested: [[wi, wi, ...]] or flat [wi, wi]
        for item in res:
            if isinstance(item, (list, tuple)):
                # If item itself looks like a word_info (starts with box coords)
                if len(item) > 0 and isinstance(item[0], (list, tuple)) and len(item[0]) == 2 and isinstance(item[0][0], (int, float)):
                    dt, sc = _parse_word_info(item)
                    if dt:
                        yield dt, sc
                else:
                    for wi in item:
                        dt, sc = _parse_word_info(wi)
                        if dt:
                            yield dt, sc

    for dt, sc in _iter_words(result):
        if dt:
            sc = sc if sc is not None else 1.0
            if sc > 0.3:  # confidence threshold
                text += dt
                confidence_scores.append(sc)

    # If primary OCR produced no text, attempt simple vertical segmentation fallback
    if len(text.strip()) == 0:
        try:
            seg_im = Image.open(ocr_input).convert('L')
            pixels = seg_im.load()
            w, h = seg_im.size
            column_has_ink = [False]*w
            for x in range(w):
                for y in range(h):
                    if pixels[x, y] < 50:  # dark pixel
                        column_has_ink[x] = True
                        break
            # Identify segments by transitions
            segments = []
            in_seg = False
            start = 0
            for x in range(w):
                if column_has_ink[x] and not in_seg:
                    in_seg = True
                    start = x
                elif not column_has_ink[x] and in_seg:
                    in_seg = False
                    end = x
                    if end - start > 2:  # minimal width
                        segments.append((start, end))
            if in_seg:
                segments.append((start, w))

            # Limit segments to reasonable count (avoid noise)
            if 0 < len(segments) <= 8:
                fallback_text = ''
                for (sx, ex) in segments:
                    char_crop = seg_im.crop((sx, 0, ex, h))
                    # Slight pad
                    pad = 2
                    pad_im = Image.new('L', (char_crop.size[0] + pad*2, h + pad*2), 255)
                    pad_im.paste(char_crop, (pad, pad))
                    # Save temp
                    import tempfile, os
                    tmp_char = os.path.join(tempfile.gettempdir(), f"paddle_char_{sx}_{ex}_{int(__import__('time').time()*1000)}.png")
                    pad_im.save(tmp_char)
                    char_res = ocr.ocr(tmp_char)
                    # Parse first char result
                    try:
                        if char_res:
                            word_block = char_res[0]
                            if word_block:
                                wi = word_block[0]
                                if wi and len(wi) >= 2:
                                    data = wi[1]
                                    if isinstance(data, (list, tuple)) and len(data) >= 1:
                                        detected = str(data[0])
                                        if detected:
                                            fallback_text += detected[0]  # take first char
                    except Exception:
                        pass
                if len(fallback_text.strip()) > 0:
                    text = fallback_text
        except Exception:
            pass
    
    # Clean: keep only alphanumeric characters
    cleaned = ''.join(c for c in text if c.isalnum())
    
    # Calculate average confidence
    avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0
    
    print(json.dumps({'success': True, 'text': cleaned, 'confidence': round(avg_confidence, 3)}))
    
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))
    sys.exit(1)
`;

      logger && logger.log && logger.log(`  Processing with PaddleOCR...`);

      // Create temporary Python file
      const tempPyFile = path.join(os.tmpdir(), `paddle_ocr_${Date.now()}.py`);
      fs.writeFileSync(tempPyFile, pythonScript);

      // Run Python script with timeout
      execFile('python', [tempPyFile], { timeout: 120000, encoding: 'utf8' }, (err, stdout, stderr) => {
        // Clean up temp file
        try { fs.unlinkSync(tempPyFile); } catch(e) {}

        // Check for actual errors (not just warnings)
        const hasActualError = err && err.code !== 0;
        const lowerStderr = (stderr || '').toLowerCase();
        const hasErrorInStderr = !!(lowerStderr && (
          lowerStderr.includes('error') ||
          lowerStderr.includes('exception') ||
          lowerStderr.includes('traceback')
        ) && !lowerStderr.includes('deprecationwarning'));

        if (hasActualError && hasErrorInStderr) {
          logger && logger.error && logger.error(`❌ PaddleOCR Error: ${err.message}`);
          
          if (err.message.includes('not recognized')) {
            logger && logger.error && logger.error(`\n⚠️  Python not found in PATH!`);
            logger && logger.error && logger.error(`   1. Install Python: https://www.python.org/downloads/`);
            logger && logger.error && logger.error(`   2. CHECK "Add Python to PATH" during installation`);
            logger && logger.error && logger.error(`   3. Restart this application`);
          } else if (stderr && stderr.includes('No module named paddleocr')) {
            logger && logger.error && logger.error(`\n⚠️  PaddleOCR not installed!`);
            logger && logger.error && logger.error(`   Run: pip install paddleocr paddlepaddle`);
          } else if (stderr && stderr.includes('Unknown argument')) {
            logger && logger.error && logger.error(`\n⚠️  PaddleOCR parameter compatibility issue!`);
            logger && logger.error && logger.error(`   This version of PaddleOCR doesn't support the parameter.`);
            logger && logger.error && logger.error(`   Try upgrading: pip install --upgrade paddleocr paddlepaddle`);
          } else if (stderr) {
            if (lowerStderr.includes('string index out of range')) {
              logger && logger.error && logger.error(`   Known PaddleOCR issue: string index out of range -> retry or fallback`);
            } else {
              logger && logger.error && logger.error(`   stderr: ${stderr}`);
            }
          }
          
          reject(err);
          return;
        }

        try {
          const result = JSON.parse(stdout);
          
          if (result.success) {
            const captchaText = result.text;
            const confidence = result.confidence || 0;
            
            if (captchaText.length === 0) {
              logger && logger.warn && logger.warn(`⚠️ PaddleOCR returned empty result`);
            } else {
              logger && logger.log && logger.log(`✅ PaddleOCR Result: "${captchaText}" (${captchaText.length} chars, confidence: ${(confidence * 100).toFixed(1)}%)`);
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
