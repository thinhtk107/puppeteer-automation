const { execFile } = require('child_process');
const fs = require('fs');

/**
 * Enhanced OCR for masked captcha images (black text on white background)
 * Optimized for the processed images from color extraction
 * @param {string} imagePath - Path to masked image
 * @param {Object} logger - Logger object
 * @returns {Promise<string>} Recognized captcha text
 */
async function runTesseractOnMaskedImage(imagePath, logger) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(imagePath)) {
      logger && logger.warn && logger.warn('Masked image not found:', imagePath);
      return resolve('');
    }

    logger && logger.log && logger.log('→ Running enhanced OCR on masked image...');

    // Optimized PSM modes for masked images (black text on white)
    const psmModes = [
      '8',   // Single word - BEST for short captcha codes
      '7',   // Single text line
      '6',   // Single block of text
      '13',  // Raw line (no layout analysis)
      '10'   // Single character (for very short codes)
    ];

    const results = [];
    let completedCount = 0;

    const checkComplete = () => {
      completedCount++;
      if (completedCount === psmModes.length) {
        // Enhanced result selection for masked images
        const validResults = results
          .map((text, idx) => ({
            text: text.trim(),
            length: text.length,
            psm: psmModes[idx],
            // Score based on alphanumeric characters (captcha codes)
            score: (text.match(/[a-zA-Z0-9]/g) || []).length
          }))
          .filter(r => r.length > 0 && r.score > 0)
          .sort((a, b) => {
            // Prefer results with more alphanumeric chars
            if (a.score !== b.score) return b.score - a.score;
            // Then prefer longer results
            return b.length - a.length;
          });

        logger && logger.log && logger.log(`OCR Results: ${validResults.length} valid from ${psmModes.length} attempts`);

        if (validResults.length > 0) {
          const best = validResults[0];
          logger && logger.log && logger.log(`✓ Best result: "${best.text}" (PSM ${best.psm}, score: ${best.score})`);
          resolve(best.text);
        } else {
          logger && logger.warn && logger.warn('✗ No valid OCR results from masked image');
          resolve('');
        }
      }
    };

    psmModes.forEach((psm, idx) => {
      const outBase = imagePath + `.masked.psm${psm}`;

      // Enhanced arguments for masked images (black text on white)
      const args = [
        imagePath,
        outBase,
        '-l', 'eng',
        '--oem', '1',                    // Tesseract OCR Engine
        '--psm', psm,                    // Page Segmentation Mode
        '-c', 'tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
        '-c', 'classify_bln_numeric_mode=1',
        '-c', 'textord_min_linesize=2.5',  // Better for small text
        '-c', 'load_system_dawg=0',
        '-c', 'load_freq_dawg=0',
        '-c', 'tessedit_pageseg_mode=6',   // Force uniform block
        '-c', 'tessedit_ocr_engine_mode=1'  // Neural nets LSTM
      ];

      execFile('tesseract', args, {
        timeout: 15000,  // 15 seconds per PSM mode
        killSignal: 'SIGTERM'
      }, (err) => {
        try {
          if (!err) {
            const txtFile = outBase + '.txt';
            if (fs.existsSync(txtFile)) {
              const txt = fs.readFileSync(txtFile, 'utf8');
              results[idx] = txt;
              // Clean up temp file
              try { fs.unlinkSync(txtFile); } catch(e) {}
            } else {
              results[idx] = '';
            }
          } else {
            results[idx] = '';
          }
        } catch (e) {
          results[idx] = '';
        }

        checkComplete();
      });
    });

    // Global timeout (longer for masked images)
    const timeoutHandler = setTimeout(() => {
      reject(new Error(`Masked OCR timeout after 90 seconds`));
    }, 90000);
  });
}
function runTesseract(imagePath, lang = 'eng', timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(imagePath)) return resolve('');
    
    // Try multiple PSM modes for better captcha recognition
    const psmModes = [
      '8',  // Treat as single word - BEST for captcha codes
      '7',  // Treat as single line
      '6',  // Assume a single uniform block of text
      '11', // Sparse text - for scattered characters
    ];
    
    const results = [];
    let completedCount = 0;
    
    const checkComplete = () => {
      completedCount++;
      if (completedCount === psmModes.length) {
        // Pick best result (longest, usually most complete)
        const best = results
          .map((text, idx) => ({ text: text.trim(), length: text.length, psm: psmModes[idx] }))
          .filter(r => r.length > 0)
          .sort((a, b) => b.length - a.length)[0];
        
        if (best) {
          resolve(best.text);
        } else {
          resolve('');
        }
      }
    };
    
    psmModes.forEach((psm, idx) => {
      const outBase = imagePath + `.ocr.psm${psm}`;
      // Enhanced Tesseract arguments with better config
      const args = [
        imagePath, 
        outBase, 
        '-l', lang,
        '--oem', '1',           // Tesseract OCR Engine
        '--psm', psm,           // Page Segmentation Mode
        '-c', 'tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
        '-c', 'classify_bln_numeric_mode=1',
        '-c', 'load_system_dawg=0',
        '-c', 'load_freq_dawg=0'
      ];
      
      execFile('tesseract', args, { 
        timeout: timeoutMs / psmModes.length,
        killSignal: 'SIGTERM'
      }, (err) => {
        try {
          if (!err) {
            const txtFile = outBase + '.txt';
            if (fs.existsSync(txtFile)) {
              const txt = fs.readFileSync(txtFile, 'utf8');
              results[idx] = txt;
              try { fs.unlinkSync(txtFile); } catch(e) {}
            } else {
              results[idx] = '';
            }
          } else {
            results[idx] = '';
          }
        } catch (e) {
          results[idx] = '';
        }
        
        checkComplete();
      });
    });
    
    // Global timeout handler
    const timeoutHandler = setTimeout(() => {
      reject(new Error(`Tesseract timeout after ${timeoutMs}ms`));
    }, timeoutMs + 2000);
    
    // Don't leak timeouts
    Promise.resolve().then(() => {
      // Will resolve or reject within timeout
    });
  });
}

/**
 * Try multiple OCR libraries with voting (best approach)
 * @param {string} imagePath - Path to captcha image
 * @param {Object} logger - Logger object
 * @returns {Promise<Object>} Best OCR result
 */
async function runBestOCRVoting(imagePath, logger) {
  try {
    const { runBestOCR } = require('./ocr_best_helper');
    return await runBestOCR(imagePath, logger);
  } catch (err) {
    logger && logger.warn && logger.warn('Best OCR voting failed, falling back to Tesseract');
    
    // Fallback to Tesseract
    try {
      const text = await runTesseract(imagePath, 'eng', 30000);
      return {
        success: true,
        best_result: {
          text: text,
          library: 'Tesseract-Fallback',
          confidence: 0.60
        }
      };
    } catch (e) {
      logger && logger.error && logger.error('All OCR methods failed');
      throw err;
    }
  }
}

module.exports = { runTesseract, runBestOCRVoting, runTesseractOnMaskedImage };

