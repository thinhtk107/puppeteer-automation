module.exports = {
  // Short pause for UI transitions
  SHORT_WAIT_MS: 500,  // Tăng từ 100 → 500
  // Medium pause for rendering after clicks
  MEDIUM_WAIT_MS: 1000,  // Tăng từ 300 → 1000
  // Longer pause for slower UI operations
  LONG_WAIT_MS: 2000,  // Tăng từ 1000 → 2000
  // Interval between template matching retries
  TEMPLATE_INTERVAL_MS: 1000,  // Tăng từ 500 → 1000
  // Default template match timeout
  DEFAULT_TEMPLATE_TIMEOUT_MS: 60000,  // Tăng từ 3000 → 15000 (15s)
  // How long to wait for canvas stabilization checks
  CANVAS_STABILIZE_MS: 5000,  // Tăng từ 2000 → 3000
  // Mouse move steps when moving cursor
  CLICK_STEPS: 8,  // Tăng từ 4 → 8 (smoother)
  // Popup open breathing time
  LOGIN_POPUP_WAIT_MS: 2000,  // Tăng từ 800 → 2000
  // Final click wait
  FINAL_CLICK_WAIT_MS: 3000,  // Tăng từ 2000 → 3000
  // Page navigation timeout
  NAVIGATION_TIMEOUT_MS: 30000,  // 60s
  // OCR processing timeout
  OCR_TIMEOUT_MS: 30000,  // 30s
  // Max retries for template matching
  MAX_TEMPLATE_RETRIES: 5,
  // Max retries for OCR
  MAX_OCR_RETRIES: 3
};

