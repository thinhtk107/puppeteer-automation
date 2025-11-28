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

// pkg/static-build: some builds of axios use dynamic internal requires that pkg
// cannot detect. Force-include the node entry so pkg embeds it into the snapshot.
let axios;
try {
  if (typeof process.pkg !== 'undefined') {
    // This literal path ensures pkg includes this file when packaging.
    axios = require('axios/dist/node/axios.cjs');
  } else {
    axios = require('axios');
  }
} catch (e) {
  // Fallback to normal require if the exact dist path isn't present in node_modules
  try { axios = require('axios'); } catch (err) { throw err }
}
const fs = require('fs');
const crypto = require('crypto');
const { createWorker } = require('tesseract.js');

// GitHub API Keys - Multiple keys with automatic fallback on rate limit
const GITHUB_TOKENS = [
  process.env.GITHUB_TOKEN,                              // Key 1 (primary)
  process.env.GITHUB_TOKEN_BK                            // Key 2 (fallback)
].filter(Boolean); // Remove empty/undefined keys

let currentTokenIndex = 0; // Track which key is currently being used

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
 * Call GitHub Models API with automatic key rotation on rate limit
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

  // Try all available API keys
  for (let attempt = 0; attempt < GITHUB_TOKENS.length; attempt++) {
    const currentToken = GITHUB_TOKENS[currentTokenIndex];
    const keyNumber = currentTokenIndex + 1;
    
    try {
      logger && logger.log && logger.log(`   → Using API Key ${keyNumber}/${GITHUB_TOKENS.length}...`);
      
      const response = await axios.post(
        API_ENDPOINT,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${currentToken}`,
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
      logger && logger.log && logger.log(`   ✓ Success with API Key ${keyNumber}`);

      return text;
      
    } catch (error) {
      const isRateLimit = error.response?.status === 429 || 
                          error.message?.toLowerCase().includes('rate limit');
      
      if (isRateLimit) {
        logger && logger.warn && logger.warn(`   ⚠️ API Key ${keyNumber} rate limit reached`);
        
        // Switch to next key
        currentTokenIndex = (currentTokenIndex + 1) % GITHUB_TOKENS.length;
        
        if (attempt < GITHUB_TOKENS.length - 1) {
          logger && logger.log && logger.log(`   → Switching to API Key ${currentTokenIndex + 1}...`);
          continue; // Try next key
        } else {
          logger && logger.error && logger.error(`   ❌ All API keys exhausted`);
          throw new Error('All GitHub API keys have reached rate limit');
        }
      } else {
        // Other errors (network, timeout, etc.)
        logger && logger.error && logger.error(`   ❌ API Error: ${error.message}`);
        throw error;
      }
    }
  }
  
  throw new Error('Failed to call GitHub Models API with all available keys');
}

/**
 * Main OCR function - 2-Tier GitHub Models with Auto-Fallback
 * Tier 1: GPT-4o (multi-key) → Tier 2: GPT-4o-mini (if all keys rate limited)
 */
async function readCaptchaWithGitHubModels(imagePath, targetColor, logger) {
  try {
    // Validate
    if (!fs.existsSync(imagePath)) {
      logger && logger.error && logger.error(`❌ Image not found: ${imagePath}`);
      return '';
    }

    if (GITHUB_TOKENS.length === 0) {
      logger && logger.error && logger.error('❌ No GITHUB_TOKEN configured!');
      return '';
    }

    logger && logger.log && logger.log('🎯 OCR Pipeline: GitHub Models 2-Tier + Multi-Key');
    logger && logger.log && logger.log(`   Image: ${path.basename(imagePath)}`);
    logger && logger.log && logger.log(`   Target color: ${targetColor || 'unknown'}`);
    logger && logger.log && logger.log(`   📋 Tier 1: GPT-4o (${GITHUB_TOKENS.length} keys) → Tier 2: GPT-4o-mini\n`);

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

    // ===== TIER 1: GPT-4o (Multi-Key with Auto-Rotation) =====
    logger && logger.log && logger.log('   ╔════ TIER 1: GPT-4o (Primary, Multi-Key) ════╗');
    logger && logger.log && logger.log(`   📦 ${MODEL_CONFIGS['gpt-4o'].description}`);
    logger && logger.log && logger.log(`   🔑 Available keys: ${GITHUB_TOKENS.length}`);
    
    try {
      captchaText = await callGitHubModelsAPI('gpt-4o', base64Image, targetColor, logger);
      
      if (captchaText && captchaText.length > 0) {
        logger && logger.log && logger.log(`   ✅ GPT-4o SUCCESS: "${captchaText}"`);
        logger && logger.log && logger.log('   ╚═══════════════════════════════════════════╝\n');
        
        ocrCache.set(cacheKey, captchaText);
        return captchaText;
      }
      
      logger && logger.warn && logger.warn('   ⚠️ GPT-4o returned empty');
      
    } catch (gpt4oError) {
      const isAllKeysRateLimit = gpt4oError.message?.includes('All GitHub API keys have reached rate limit');
      
      if (isAllKeysRateLimit) {
        logger && logger.warn && logger.warn('   ⚠️ GPT-4o: ALL keys rate limited');
        logger && logger.log && logger.log('   → Auto-fallback to GPT-4o-mini...');
      } else {
        logger && logger.error && logger.error(`   ✗ GPT-4o error: ${gpt4oError.message}`);
        if (gpt4oError.response) {
          logger && logger.error && logger.error(`   Status: ${gpt4oError.response.status}`);
        }
      }
    }
    
    logger && logger.log && logger.log('   ╚═══════════════════════════════════════════╝\n');

    // ===== TIER 2: GPT-4o-mini (Final Fallback) =====
    logger && logger.log && logger.log('   ╔════ TIER 2: GPT-4o-mini (Fallback) ════╗');
    logger && logger.log && logger.log(`   📦 ${MODEL_CONFIGS['gpt-4o-mini'].description}`);
    logger && logger.log && logger.log('   💡 Using as final fallback (higher rate limit)');
    
    try {
      // Reset token index for GPT-4o-mini to try all keys again
      const savedIndex = currentTokenIndex;
      currentTokenIndex = 0;
      
      captchaText = await callGitHubModelsAPI('gpt-4o-mini', base64Image, targetColor, logger);
      
      // Restore index for next GPT-4o call
      currentTokenIndex = savedIndex;
      
      if (captchaText && captchaText.length > 0) {
        logger && logger.log && logger.log(`   ✅ GPT-4o-mini SUCCESS: "${captchaText}"`);
        logger && logger.log && logger.log('   ╚════════════════════════════════════════╝\n');
        
        ocrCache.set(cacheKey, captchaText);
        return captchaText;
      }
      
      logger && logger.warn && logger.warn('   ⚠️ GPT-4o-mini returned empty');
      
    } catch (miniError) {
      const isRateLimit = miniError.message?.includes('rate limit');
      
      if (isRateLimit) {
        logger && logger.error && logger.error('   ✗ GPT-4o-mini: ALL keys rate limited');
      } else {
        logger && logger.error && logger.error(`   ✗ GPT-4o-mini error: ${miniError.message}`);
      }
    }
    
    logger && logger.log && logger.log('   ╚════════════════════════════════════════╝\n');

    // ===== ALL FAILED =====
    logger && logger.error && logger.error('   ❌ ALL TIERS FAILED (GPT-4o + GPT-4o-mini)');
    return '';

  } catch (error) {
    logger && logger.error && logger.error(`   ✗ Pipeline error: ${error.message}`);
    return '';
  }
}

/**
 * Initialize Tesseract worker (lazy load)
 */
// async function initTesseractWorker(logger) {
//   if (tesseractWorker) {
//     return tesseractWorker;
//   }
  
//   try {
//     logger && logger.log && logger.log('   📝 Initializing Tesseract worker...');
    
//     // When running packaged via pkg the snapshot is read-only and tesseract core
//     // assets must be loaded from files outside the snapshot. We copy tesseract.js-core
//     // files into dist/tesseract during the build and expose PROJECT_ROOT at runtime.
//     const tesseractOptions = {
//       logger: m => {
//         // Suppress Tesseract internal logs
//       }
//     };

//     if (typeof process.pkg !== 'undefined' && process.env.PROJECT_ROOT) {
//       // corePath should point to the core JS (or wasm wrapper) file, and langPath
//       // to the folder that contains the traineddata files when needed.
//       const projectRoot = process.env.PROJECT_ROOT;
//       const corePath = path.join(projectRoot, 'tesseract', 'tesseract-core.js');
//       const coreWasm = path.join(projectRoot, 'tesseract', 'tesseract-core.wasm');
//       // Pass corePath and langPath via options resolved by tesseract.js
//       tesseractOptions.corePath = fs.existsSync(corePath) ? corePath : undefined;
//       tesseractOptions.langPath = path.join(projectRoot, 'tesseract');
//       tesseractOptions.dataPath = path.join(projectRoot, 'tesseract');
//       // If the .wasm file exists next to core, hint it via corePath for some builds
//       if (fs.existsSync(coreWasm) && !tesseractOptions.corePath) {
//         tesseractOptions.corePath = coreWasm;
//       }
//     }

//     const worker = await createWorker('eng', 1, tesseractOptions);
    
//     tesseractWorker = worker;
//     logger && logger.log && logger.log('   ✓ Tesseract worker ready');
//     return tesseractWorker;
//   } catch (err) {
//     logger && logger.error && logger.error(`   ✗ Tesseract init error: ${err.message}`);
//     return null;
//   }
// }

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
    
    // Clean text - remove spaces and special chars (preserve Vietnamese, English, and numbers)
    captchaText = captchaText
      .replace(/\s+/g, '')
      .replace(/[^a-zA-Z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/g, '');
    
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
 * Initialize Tesseract worker (lazy load)
 */
async function initTesseractWorker(logger) {
  if (tesseractWorker) {
    return tesseractWorker;
  }

  try {
    logger && logger.log && logger.log('   📝 Initializing Tesseract worker...');

    const tesseractOptions = {
      logger: m => {
        // Suppress Tesseract internal logs for cleaner output
      }
    };

    // When packaged, assets are relative to the executable path
    if (process.pkg) {
      const basePath = path.dirname(process.execPath);
      
      tesseractOptions.workerPath = path.join(basePath, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
      tesseractOptions.langPath = basePath; // Assumes eng.traineddata and vie.traineddata are at the root of the executable
      tesseractOptions.corePath = path.join(basePath, 'node_modules', 'tesseract.js-core', 'tesseract-core.wasm.js');

      // Verify paths for debugging
      logger && logger.log && logger.log(`   - Executable Dir: ${basePath}`);
      logger && logger.log && logger.log(`   - Worker Path: ${tesseractOptions.workerPath}`);
      logger && logger.log && logger.log(`   - Language Path: ${tesseractOptions.langPath}`);
      logger && logger.log && logger.log(`   - Core Path: ${tesseractOptions.corePath}`);
    }

    const worker = await createWorker('eng+vie', 1, tesseractOptions);
    
    tesseractWorker = worker;
    logger && logger.log && logger.log('   ✓ Tesseract worker ready');
    return tesseractWorker;
  } catch (err) {
    logger && logger.error && logger.error(`   ✗ Tesseract init error: ${err.message}`);
    // Add more detailed error logging
    if (err.stack) {
      logger && logger.error && logger.error(err.stack);
    }
    return null;
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
