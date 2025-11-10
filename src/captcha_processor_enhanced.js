/**
 * Enhanced Captcha Processing Pipeline
 * Uses best practices from all libraries combined
 * With validation and fallback strategies
 */

const path = require('path');
const fs = require('fs');

/**
 * Validate extracted text
 * @param {string} text - Extracted text
 * @returns {Object} Validation result
 */
function validateCaptchaText(text) {
  const result = {
    text: text.trim(),
    isValid: true,
    warnings: []
  };
  
  // Check length
  if (text.length < 3) {
    result.warnings.push('Text too short (< 3 chars)');
    result.confidence = 'low';
  } else if (text.length > 20) {
    result.warnings.push('Text too long (> 20 chars)');
    result.confidence = 'low';
  } else {
    result.confidence = 'high';
  }
  
  // Check for special characters (usually errors)
  if (/[!@#$%^&*()_+=\[\]{};:'",.<>?/\\|~`]/.test(text)) {
    result.warnings.push('Contains special characters (OCR error?)');
    result.isValid = false;
  }
  
  // Check for excessive spaces (usually errors)
  if (/\s{2,}/.test(text)) {
    result.warnings.push('Contains multiple spaces');
    result.isValid = false;
  }
  
  return result;
}

/**
 * Alphabet recognition filter
 * Extracts only alphabetic characters
 * @param {string} text - Input text
 * @returns {Object} Filtered result
 */
function filterAlphabet(text) {
  const letters = text.match(/[a-zA-Z]/g) || [];
  const numbers = text.match(/[0-9]/g) || [];
  
  return {
    text: text,
    alphabets: letters.join(''),
    numbers: numbers.join(''),
    alphanumeric: (letters.join('') + numbers.join('')),
    letterCount: letters.length,
    numberCount: numbers.length,
    composition: {
      hasLetters: letters.length > 0,
      hasNumbers: numbers.length > 0,
      onlyLetters: numbers.length === 0 && letters.length > 0,
      onlyNumbers: letters.length === 0 && numbers.length > 0
    }
  };
}

/**
 * Advanced alphabet recognition using character patterns
 * Helps identify characters that might be confused
 * @param {string} text - Input text
 * @returns {Object} Character analysis
 */
function analyzeCharacterPatterns(text) {
  const confusables = {
    '0': ['O'],
    'O': ['0'],
    '1': ['l', 'I'],
    'l': ['1', 'I'],
    'I': ['1', 'l'],
    'Z': ['2'],
    '2': ['Z'],
    '5': ['S'],
    'S': ['5'],
    '8': ['B'],
    'B': ['8'],
    'B': ['8', '0'],
  };
  
  const analysis = {
    text: text,
    characters: text.split(''),
    confusableWarnings: []
  };
  
  for (const char of text) {
    if (confusables[char]) {
      analysis.confusableWarnings.push({
        character: char,
        couldBe: confusables[char],
        position: text.indexOf(char)
      });
    }
  }
  
  return analysis;
}

/**
 * Clean OCR output with intelligent filters
 * @param {string} text - Raw OCR text
 * @returns {string} Cleaned text
 */
function cleanOCROutput(text) {
  if (!text) return '';
  
  // Remove leading/trailing whitespace
  text = text.trim();
  
  // Remove multiple spaces
  text = text.replace(/\s+/g, ' ');
  
  // Common OCR corrections
  text = text.replace(/\s+/g, ''); // Remove all spaces for captcha
  
  return text;
}

/**
 * Process captcha with all extraction methods
 * @param {Page} page - Puppeteer page
 * @param {string} imagePath - Path to captcha image
 * @param {string} outputDir - Output directory
 * @param {Object} logger - Logger
 * @returns {Promise<Object>} Complete captcha analysis
 */
async function processComplexCaptchaWithOCR(page, imagePath, outputDir, logger) {
  try {
    logger && logger.log && logger.log('=== ENHANCED CAPTCHA PROCESSING ===');
    
    // Step 1: Extract using best OCR libraries
    let bestOCRResult = null;
    try {
      const { runBestOCR } = require('./ocr_best_helper');
      bestOCRResult = await runBestOCR(imagePath, logger);
      logger && logger.log && logger.log('✓ Best OCR result obtained');
    } catch (e) {
      logger && logger.warn && logger.warn('⚠ Best OCR failed:', e.message);
    }
    
    // Step 2: Try traditional Tesseract as fallback
    let tesseractResult = null;
    try {
      const { runTesseract } = require('./ocr_helper');
      const text = await runTesseract(imagePath, 'eng', 30000);
      tesseractResult = {
        text: text,
        library: 'Tesseract-Fallback'
      };
      logger && logger.log && logger.log('✓ Tesseract fallback result obtained');
    } catch (e) {
      logger && logger.warn && logger.warn('⚠ Tesseract failed:', e.message);
    }
    
    // Step 3: Prepare best result
    const selectedResult = bestOCRResult && bestOCRResult.success 
      ? bestOCRResult.best_result 
      : tesseractResult;
    
    if (!selectedResult) {
      throw new Error('All OCR methods failed');
    }
    
    const extractedText = selectedResult.text || '';
    
    // Step 4: Validate text
    const validation = validateCaptchaText(extractedText);
    logger && logger.log && logger.log('Text validation:', validation);
    
    // Step 5: Filter alphabet/numbers
    const alphaFilter = filterAlphabet(extractedText);
    logger && logger.log && logger.log('Alphabet analysis:', {
      alphabets: alphaFilter.alphabets,
      numbers: alphaFilter.numbers,
      composition: alphaFilter.composition
    });
    
    // Step 6: Analyze character patterns
    const charAnalysis = analyzeCharacterPatterns(extractedText);
    if (charAnalysis.confusableWarnings.length > 0) {
      logger && logger.log && logger.log('⚠ Confusable characters detected:', charAnalysis.confusableWarnings);
    }
    
    // Step 7: Clean output
    const cleanedText = cleanOCROutput(extractedText);
    
    const finalResult = {
      success: true,
      original_text: extractedText,
      cleaned_text: cleanedText,
      validation: validation,
      alphabet_filter: alphaFilter,
      character_analysis: charAnalysis,
      ocr_methods: {
        best: bestOCRResult,
        fallback: tesseractResult ? { library: tesseractResult.library, text: tesseractResult.text } : null
      },
      image_path: imagePath,
      timestamp: new Date().toISOString()
    };
    
    logger && logger.log && logger.log('=== Processing Complete ===');
    logger && logger.log && logger.log(`Final text: "${cleanedText}"`);
    
    return finalResult;
    
  } catch (err) {
    logger && logger.error && logger.error('Error in enhanced captcha processing:', err.message);
    throw err;
  }
}

module.exports = {
  validateCaptchaText,
  filterAlphabet,
  analyzeCharacterPatterns,
  cleanOCROutput,
  processComplexCaptchaWithOCR
};
