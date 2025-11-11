/**
 * Advanced Image Preprocessing Functions
 * Provides image enhancement functions for CAPTCHA processing
 */

const Jimp = require('jimp');

/**
 * Enhance image for difficult fonts (morphological operations)
 * @param {Jimp} img - Image to enhance
 * @param {Object} logger - Logger object
 */
async function enhanceForDifficultFonts(img, logger) {
  try {
    logger && logger.log && logger.log('  Applying morphological enhancements...');
    
    // Apply slight erosion to remove noise
    // Erosion: keep pixel if all neighbors are also foreground
    const tempData = Buffer.alloc(img.bitmap.data.length);
    img.bitmap.data.copy(tempData);
    
    img.scan(1, 1, img.bitmap.width - 2, img.bitmap.height - 2, function(x, y, idx) {
      const neighbors = [
        [x-1, y-1], [x, y-1], [x+1, y-1],
        [x-1, y],           [x+1, y],
        [x-1, y+1], [x, y+1], [x+1, y+1]
      ];
      
      let allBlack = true;
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < this.bitmap.width && ny >= 0 && ny < this.bitmap.height) {
          const nidx = (ny * this.bitmap.width + nx) * 4;
          const pixel = tempData[nidx];
          if (pixel > 128) {
            allBlack = false;
            break;
          }
        }
      }
      
      // Keep pixel black only if all neighbors are also black
      if (!allBlack && tempData[idx] < 128) {
        tempData[idx] = 255;
        tempData[idx + 1] = 255;
        tempData[idx + 2] = 255;
      }
    });
    
    tempData.copy(img.bitmap.data);
    logger && logger.log && logger.log('  ✓ Morphological enhancement applied');
    
  } catch (err) {
    logger && logger.warn && logger.warn('  Warning: morphological enhancement failed - ' + err.message);
  }
}

/**
 * Thicken text strokes
 * @param {Jimp} img - Image to thicken
 * @param {number} iterations - Number of dilation iterations
 */
function thickenText(img, iterations = 1) {
  for (let iter = 0; iter < iterations; iter++) {
    const tempData = Buffer.alloc(img.bitmap.data.length);
    img.bitmap.data.copy(tempData);
    
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
      const r = tempData[idx + 0];
      const g = tempData[idx + 1];
      const b = tempData[idx + 2];
      
      // If pixel is black, apply dilation to neighbors
      if (r < 128 && g < 128 && b < 128) {
        const neighbors = [
          [x-1, y-1], [x, y-1], [x+1, y-1],
          [x-1, y],           [x+1, y],
          [x-1, y+1], [x, y+1], [x+1, y+1]
        ];
        
        neighbors.forEach(([nx, ny]) => {
          if (nx >= 0 && nx < this.bitmap.width && ny >= 0 && ny < this.bitmap.height) {
            const nidx = (ny * this.bitmap.width + nx) * 4;
            this.bitmap.data[nidx + 0] = 0;
            this.bitmap.data[nidx + 1] = 0;
            this.bitmap.data[nidx + 2] = 0;
            this.bitmap.data[nidx + 3] = 255;
          }
        });
      }
    });
  }
}

/**
 * Remove noise from image (simple denoising)
 * @param {Jimp} img - Image to denoise
 * @param {number} threshold - Noise pixel count threshold
 */
function denoise(img, threshold = 1) {
  const tempData = Buffer.alloc(img.bitmap.data.length);
  img.bitmap.data.copy(tempData);
  
  img.scan(1, 1, img.bitmap.width - 2, img.bitmap.height - 2, function(x, y, idx) {
    const r = tempData[idx + 0];
    const g = tempData[idx + 1];
    const b = tempData[idx + 2];
    
    // Count black neighbors
    const neighbors = [
      [x-1, y-1], [x, y-1], [x+1, y-1],
      [x-1, y],           [x+1, y],
      [x-1, y+1], [x, y+1], [x+1, y+1]
    ];
    
    let blackNeighbors = 0;
    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < this.bitmap.width && ny >= 0 && ny < this.bitmap.height) {
        const nidx = (ny * this.bitmap.width + nx) * 4;
        const nr = tempData[nidx];
        if (nr < 128) blackNeighbors++;
      }
    }
    
    // If isolated black pixel (fewer than threshold neighbors are black), remove it
    if (r < 128 && g < 128 && b < 128 && blackNeighbors < threshold + 1) {
      this.bitmap.data[idx + 0] = 255;
      this.bitmap.data[idx + 1] = 255;
      this.bitmap.data[idx + 2] = 255;
    }
  });
}

module.exports = {
  enhanceForDifficultFonts,
  thickenText,
  denoise
};
