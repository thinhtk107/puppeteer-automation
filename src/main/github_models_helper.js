/**
 * OCR Pipeline Helper - GitHub Models Only (2-Tier)
 * 
 * Tier 1: GPT-4o (primary, best accuracy, ~15 req/min)
 * Tier 2: GPT-4o-mini (fallback on rate limit, faster, higher limit)
 * 
 * Tesseract REMOVED - using only GitHub Models for consistent high accuracy
 * PaddleOCR REMOVED - package build issues (paddleocr@1.0.6)
 */

// Load .env.ocr
const path = require('path');
const envOcrPath = path.join(__dirname, '..', '..', '.env.ocr');
if (require('fs').existsSync(envOcrPath)) {
  require('dotenv').config({ path: envOcrPath });
}

const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');
const { createWorker } = require('tesseract.js');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const API_ENDPOINT = 'https://models.inference.ai.azure.com/chat/completions';

// Tesseract worker instance
let tesseractWorker = null;

// Model configurations
const MODEL_CONFIGS = {
  'gpt-4o': {
    name: 'gpt-4o',
    maxTokens: 100,
    temperature: 0.2,
    description: 'GPT-4o - Best accuracy, ~15 req/min',
    tier: 1
  },
  'gpt-4o-mini': {
    name: 'gpt-4o-mini',
    maxTokens: 100,
    temperature: 0.2,
    description: 'GPT-4o-mini - Fallback, higher rate limit',
    tier: 2
  }
};

// Cache for OCR results
const ocrCache = new Map();

/**
 * Get cache key
 */
function getCacheKey(imagePath) {
  return crypto.createHash('md5').update(imagePath).digest('hex');
}

/**
 * Preprocess image for OCR (disabled - returns original)
 */
async function preprocessImageForOCR(imagePath, logger) {
  // Preprocessing disabled - returns original image
  // Aggressive preprocessing was causing character fragmentation
  return imagePath;
}

/**
 * Call GitHub Models API
 */
async function callGitHubModelsAPI(modelName, base64Image, targetColor, logger) {
  const modelConfig = MODEL_CONFIGS[modelName];
  
  logger && logger.log && logger.log(`   → Calling ${modelName} API...`);

  // Build prompt
  let colorInstruction = '';
  if (targetColor) {
    colorInstruction = `\n- The text is in ${targetColor} color (already extracted)`;
  }

  const requestBody = {
    model: modelConfig.name,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Extract ONLY the alphanumeric text from this CAPTCHA image. Rules:
- Return ONLY the characters (letters and numbers)
- Preserve exact case (uppercase/lowercase)
- NO spaces, NO punctuation, NO explanations${colorInstruction}
- If unclear, make your best guess

CAPTCHA text:`
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${base64Image}`
            }
          }
        ]
      }
    ],
    max_tokens: modelConfig.maxTokens,
    temperature: modelConfig.temperature
  };

  const response = await axios.post(
    API_ENDPOINT,
    requestBody,
    {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  );

  if (!response.data?.choices?.[0]?.message?.content) {
    logger && logger.warn && logger.warn(`   ⚠️ ${modelName} returned empty`);
    return '';
  }

  let text = response.data.choices[0].message.content.trim();
  logger && logger.log && logger.log(`   → Raw: "${text}"`);

  // Clean text
  text = text.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
  logger && logger.log && logger.log(`   → Cleaned: "${text}"`);

  return text;
}

/**
 * Main OCR function - 2-Tier GitHub Models
 * Tier 1: GPT-4o → Tier 2: GPT-4o-mini (on rate limit)
 */
async function readCaptchaWithGitHubModels(imagePath, targetColor, logger) {
  try {
    // Validate
    if (!fs.existsSync(imagePath)) {
      logger && logger.error && logger.error(`❌ Image not found: ${imagePath}`);
      return '';
    }

    if (!GITHUB_TOKEN) {
      logger && logger.error && logger.error('❌ GITHUB_TOKEN not configured!');
      return '';
    }

    logger && logger.log && logger.log('🎯 OCR Pipeline: GitHub Models 2-Tier');
    logger && logger.log && logger.log(`   Image: ${path.basename(imagePath)}`);
    logger && logger.log && logger.log(`   Target color: ${targetColor || 'unknown'}`);
    logger && logger.log && logger.log(`   📋 Tier 1: GPT-4o → Tier 2: GPT-4o-mini\n`);

    // Check cache
    const cacheKey = getCacheKey(imagePath);
    if (ocrCache.has(cacheKey)) {
      const cached = ocrCache.get(cacheKey);
      logger && logger.log && logger.log(`   ✓ Cache HIT: "${cached}"\n`);
      return cached;
    }

    // Preprocess (actually returns original)
    const preprocessedPath = await preprocessImageForOCR(imagePath, logger);
    
    const imageBuffer = fs.readFileSync(preprocessedPath);
    const base64Image = imageBuffer.toString('base64');
    const imageSize = (imageBuffer.length / 1024).toFixed(2);
    logger && logger.log && logger.log(`   ℹ️ Image size: ${imageSize} KB\n`);

    let captchaText = '';

    // ===== TIER 1: GPT-4o =====
    logger && logger.log && logger.log('   ╔════ TIER 1: GPT-4o (Primary) ════╗');
    logger && logger.log && logger.log(`   📦 ${MODEL_CONFIGS['gpt-4o'].description}`);
    
    try {
      captchaText = await callGitHubModelsAPI('gpt-4o', base64Image, targetColor, logger);
      
      if (captchaText && captchaText.length > 0) {
        logger && logger.log && logger.log(`   ✅ GPT-4o SUCCESS: "${captchaText}"`);
        logger && logger.log && logger.log('   ╚═══════════════════════════════════╝\n');
        
        ocrCache.set(cacheKey, captchaText);
        return captchaText;
      }
      
      logger && logger.warn && logger.warn('   ⚠️ GPT-4o returned empty');
      
    } catch (gpt4oError) {
      const isRateLimit = gpt4oError.response?.status === 429 || 
                          gpt4oError.response?.data?.error?.code?.includes('RateLimit');
      
      if (isRateLimit) {
        logger && logger.warn && logger.warn('   ⚠️ GPT-4o: Rate limit reached');
        logger && logger.log && logger.log('   → Falling back to Tier 2...');
      } else {
        logger && logger.error && logger.error(`   ✗ GPT-4o error: ${gpt4oError.message}`);
        if (gpt4oError.response) {
          logger && logger.error && logger.error(`   Status: ${gpt4oError.response.status}`);
        }
      }
    }
    
    logger && logger.log && logger.log('   ╚═══════════════════════════════════╝\n');

    // ===== TIER 2: GPT-4o-mini =====
    logger && logger.log && logger.log('   ╔════ TIER 2: GPT-4o-mini (Fallback) ════╗');
    logger && logger.log && logger.log(`   📦 ${MODEL_CONFIGS['gpt-4o-mini'].description}`);
    
    try {
      captchaText = await callGitHubModelsAPI('gpt-4o-mini', base64Image, targetColor, logger);
      
      if (captchaText && captchaText.length > 0) {
        logger && logger.log && logger.log(`   ✅ GPT-4o-mini SUCCESS: "${captchaText}"`);
        logger && logger.log && logger.log('   ╚════════════════════════════════════════╝\n');
        
        ocrCache.set(cacheKey, captchaText);
        return captchaText;
      }
      
      logger && logger.warn && logger.warn('   ⚠️ GPT-4o-mini returned empty');
      
    } catch (miniError) {
      const isRateLimit = miniError.response?.status === 429 || 
                          miniError.response?.data?.error?.code?.includes('RateLimit');
      
      if (isRateLimit) {
        logger && logger.error && logger.error('   ✗ GPT-4o-mini: Rate limit reached');
      } else {
        logger && logger.error && logger.error(`   ✗ GPT-4o-mini error: ${miniError.message}`);
      }
    }
    
    logger && logger.log && logger.log('   ╚════════════════════════════════════════╝\n');

    // ===== ALL FAILED =====
    logger && logger.error && logger.error('   ❌ ALL TIERS FAILED');
    return '';

  } catch (error) {
    logger && logger.error && logger.error(`   ✗ Pipeline error: ${error.message}`);
    return '';
  }
}

/**
 * Initialize Tesseract worker (lazy load)
 */
async function initTesseractWorker(logger) {
  if (tesseractWorker) {
    return tesseractWorker;
  }
  
  try {
    logger && logger.log && logger.log('   📝 Initializing Tesseract worker...');
    
    const worker = await createWorker('eng', 1, {
      logger: m => {
        // Suppress Tesseract internal logs
      }
    });
    
    tesseractWorker = worker;
    logger && logger.log && logger.log('   ✓ Tesseract worker ready');
    return tesseractWorker;
  } catch (err) {
    logger && logger.error && logger.error(`   ✗ Tesseract init error: ${err.message}`);
    return null;
  }
}

/**
 * Tesseract OCR function (local, unlimited)
 * Completely independent from GitHub Models
 */
async function readCaptchaWithTesseract(imagePath, logger) {
  try {
    logger && logger.log && logger.log('📖 Tesseract OCR (Local)');
    
    // Validate image
    if (!fs.existsSync(imagePath)) {
      logger && logger.error && logger.error(`   ✗ Image not found: ${imagePath}`);
      return '';
    }
    
    logger && logger.log && logger.log(`   Image: ${path.basename(imagePath)}`);
    
    // Initialize worker
    const worker = await initTesseractWorker(logger);
    if (!worker) {
      logger && logger.error && logger.error('   ✗ Could not initialize Tesseract');
      return '';
    }
    
    // Recognize text
    logger && logger.log && logger.log('   → Recognizing text...');
    const result = await worker.recognize(imagePath);
    
    let captchaText = (result.data.text || '').trim();
    logger && logger.log && logger.log(`   → Raw: "${captchaText}"`);
    
    // Clean text - remove spaces and special chars (preserve case and numbers)
    captchaText = captchaText
      .replace(/\s+/g, '')
      .replace(/[^a-zA-Z0-9]/g, '');
    
    logger && logger.log && logger.log(`   → Cleaned: "${captchaText}"`);
    
    if (captchaText && captchaText.length > 0) {
      logger && logger.log && logger.log(`   ✅ Tesseract SUCCESS: "${captchaText}" (${captchaText.length} chars)\n`);
      return captchaText;
    }
    
    logger && logger.warn && logger.warn('   ⚠️ Tesseract returned empty text\n');
    return '';
    
  } catch (err) {
    logger && logger.error && logger.error(`   ✗ Tesseract OCR failed: ${err.message}\n`);
    return '';
  }
}

/**
 * Terminate Tesseract worker
 */
async function closeTesseractWorker() {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
    return true;
  }
  return false;
}

/**
 * Legacy function for compatibility (Tesseract removed)
 */
async function readCaptchaWithTesseract_OLD(imagePath, logger) {
  logger && logger.warn && logger.warn('⚠️ Tesseract removed - redirecting to GitHub Models');
  return readCaptchaWithGitHubModels(imagePath, null, logger);
}

/**
 * Clear cache
 */
function clearOCRCache() {
  const size = ocrCache.size;
  ocrCache.clear();
  return size;
}

module.exports = {
  readCaptchaWithGitHubModels,
  readCaptchaWithTesseract,
  closeTesseractWorker,
  clearOCRCache,
  preprocessImageForOCR
};
