module.exports = {
  // Short pause for UI transitions
  SHORT_WAIT_MS: 800,  // Tăng từ 500 → 800
  // Medium pause for rendering after clicks
  MEDIUM_WAIT_MS: 1500,  // Tăng từ 1000 → 1500
  // Longer pause for slower UI operations
  LONG_WAIT_MS: 3000,  // Tăng từ 2000 → 3000
  // Interval between template matching retries
  TEMPLATE_INTERVAL_MS: 1000,  // Giữ nguyên 1000ms
  // Default template match timeout - TĂNG ĐỂ CHỜ LOGIN
  DEFAULT_TEMPLATE_TIMEOUT_MS: 90000,  // Tăng từ 60000 → 90000 (90 giây)
  // How long to wait for canvas stabilization checks
  CANVAS_STABILIZE_MS: 6000,  // Tăng từ 5000 → 6000
  // Mouse move steps when moving cursor
  CLICK_STEPS: 8,  // Giữ nguyên
  // Popup open breathing time
  LOGIN_POPUP_WAIT_MS: 3000,  // Tăng từ 2000 → 3000
  // Final click wait
  FINAL_CLICK_WAIT_MS: 4000,  // Tăng từ 3000 → 4000
  // Page navigation timeout
  NAVIGATION_TIMEOUT_MS: 60000,  // Tăng từ 30000 → 60000 (60 giây)
  // OCR processing timeout
  OCR_TIMEOUT_MS: 30000,  // Giữ nguyên 30s
  // Max retries for template matching
  MAX_TEMPLATE_RETRIES: 5,
  // Max retries for OCR
  MAX_OCR_RETRIES: 3
};

