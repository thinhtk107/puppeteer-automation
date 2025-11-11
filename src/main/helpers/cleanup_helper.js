/**
 * Cleanup Helper - Xóa các file tạm sau khi automation hoàn tất
 */

const fs = require('fs');
const path = require('path');

/**
 * Xóa tất cả file trong thư mục (giữ lại thư mục và .gitkeep)
 * @param {string} dirPath - Đường dẫn thư mục cần xóa file
 * @param {Object} logger - Logger object
 * @returns {number} - Số file đã xóa
 */
function cleanupDirectory(dirPath, logger) {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }
  
  let deletedCount = 0;
  
  try {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      // Bỏ qua .gitkeep
      if (file === '.gitkeep') {
        continue;
      }
      
      const filePath = path.join(dirPath, file);
      
      try {
        const stat = fs.statSync(filePath);
        
        // Chỉ xóa file, không xóa thư mục
        if (stat.isFile()) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (err) {
        // Bỏ qua lỗi khi xóa từng file
        logger && logger.warn && logger.warn(`Cannot delete ${file}: ${err.message}`);
      }
    }
  } catch (err) {
    logger && logger.error && logger.error(`Error cleaning directory ${dirPath}: ${err.message}`);
  }
  
  return deletedCount;
}

/**
 * Xóa file cụ thể
 * @param {string} filePath - Đường dẫn file cần xóa
 * @param {Object} logger - Logger object (optional)
 */
function deleteFile(filePath, logger) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger && logger.log && logger.log(`✓ Deleted: ${path.basename(filePath)}`);
      return true;
    }
  } catch (err) {
    logger && logger.warn && logger.warn(`Cannot delete ${filePath}: ${err.message}`);
  }
  return false;
}

/**
 * Xóa file theo pattern (ví dụ: captcha_*.png)
 * @param {string} dirPath - Đường dẫn thư mục
 * @param {RegExp} pattern - Regex pattern để match file name
 * @param {Object} logger - Logger object
 * @returns {number} - Số file đã xóa
 */
function deleteFilesByPattern(dirPath, pattern, logger) {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }
  
  let deletedCount = 0;
  
  try {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      if (pattern.test(file)) {
        const filePath = path.join(dirPath, file);
        
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        } catch (err) {
          // Bỏ qua lỗi
        }
      }
    }
  } catch (err) {
    logger && logger.error && logger.error(`Error deleting files by pattern: ${err.message}`);
  }
  
  return deletedCount;
}

/**
 * Xóa toàn bộ file uploads và CAPTCHA screenshots
 * @param {string} projectRoot - Đường dẫn gốc của project
 * @param {Object} logger - Logger object
 */
function cleanupAllTempFiles(projectRoot, logger) {
  const stats = {
    uploads: 0,
    captchaScreenshots: 0,
    srcUploads: 0
  };
  
  // 1. Xóa file trong puppeteer-automation/uploads/
  const uploadsDir = path.join(projectRoot, 'uploads');
  stats.uploads = cleanupDirectory(uploadsDir, logger);
  
  // 2. Xóa CAPTCHA screenshots trong src/uploads/
  const srcUploadsDir = path.join(projectRoot, 'src', 'uploads');
  stats.srcUploads = cleanupDirectory(srcUploadsDir, logger);
  
  // 3. Xóa các file captcha_full_*.png
  stats.captchaScreenshots = deleteFilesByPattern(
    srcUploadsDir,
    /^captcha_full_\d+\.png$/,
    logger
  );
  
  // 4. Xóa các file instruction_text_*.png
  stats.captchaScreenshots += deleteFilesByPattern(
    srcUploadsDir,
    /^instruction_text_\d+\.png$/,
    logger
  );
  
  // 5. Xóa các file captcha_area_*.png
  stats.captchaScreenshots += deleteFilesByPattern(
    srcUploadsDir,
    /^captcha_area_\d+\.png$/,
    logger
  );
  
  return stats;
}

/**
 * Xóa file cũ hơn X phút
 * @param {string} dirPath - Đường dẫn thư mục
 * @param {number} ageMinutes - Số phút (file cũ hơn sẽ bị xóa)
 * @param {Object} logger - Logger object
 * @returns {number} - Số file đã xóa
 */
function deleteOldFiles(dirPath, ageMinutes, logger) {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }
  
  let deletedCount = 0;
  const now = Date.now();
  const ageMs = ageMinutes * 60 * 1000;
  
  try {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      if (file === '.gitkeep') continue;
      
      const filePath = path.join(dirPath, file);
      
      try {
        const stat = fs.statSync(filePath);
        
        if (stat.isFile()) {
          const fileAge = now - stat.mtimeMs;
          
          if (fileAge > ageMs) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        }
      } catch (err) {
        // Bỏ qua lỗi
      }
    }
  } catch (err) {
    logger && logger.error && logger.error(`Error deleting old files: ${err.message}`);
  }
  
  return deletedCount;
}

module.exports = {
  cleanupDirectory,
  deleteFile,
  deleteFilesByPattern,
  cleanupAllTempFiles,
  deleteOldFiles
};
