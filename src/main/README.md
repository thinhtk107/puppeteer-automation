# Source Code Structure

## 📁 Cấu trúc thư mục

```
src/main/
├── flows/              # Luồng chính (Main Flows)
│   ├── login_flow.js      # Xử lý đăng nhập
│   └── join_game_flow.js  # Xử lý vào game
│
├── helpers/            # Các helper utilities
│   ├── click_helper.js       # Click absolute coordinates
│   ├── type_helper.js        # Type text vào fields
│   ├── visibility_helper.js  # Check visibility
│   ├── screenshot_helper.js  # Screenshot utilities
│   ├── matcher_helper.js     # Template matching
│   └── cleanup_helper.js     # File cleanup utilities
│
├── captcha/            # Xử lý CAPTCHA
│   ├── captcha_helper.js                # CAPTCHA detection helpers
│   ├── captcha_processor_java_like.js   # Main CAPTCHA processor
│   ├── captcha_processor_enhanced.js    # Enhanced processor
│   ├── advanced_image_preprocessing.js  # Image preprocessing
│   ├── ocr_helper.js                    # OCR utilities
│   └── template_matcher.js              # Template matching for CAPTCHA
│
├── websocket/          # WebSocket integration
│   ├── websocket_hook.js        # WebSocket hook & auto-send logic
│   └── github_models_helper.js  # GitHub Models API helper
│
├── config/             # Configuration
│   └── config.js               # App configuration
│
└── automation.js       # Main automation entry point
```

## 🔗 Import paths

### Từ automation.js (root level):
```javascript
const { performFullLoginViaImages } = require('./flows/login_flow');
const { setupWebSocketHook } = require('./websocket/websocket_hook');
const { cleanupAllTempFiles } = require('./helpers/cleanup_helper');
```

### Từ flows/ (login_flow.js, join_game_flow.js):
```javascript
const { waitForTemplate } = require('../helpers/matcher_helper');
const { typeIntoImageField } = require('../helpers/type_helper');
const { solveCaptchaOnPopup } = require('../captcha/captcha_processor_java_like');
const cfg = require('../config/config');
```

### Từ helpers/ (matcher_helper.js, type_helper.js, etc):
```javascript
const { matchTemplate } = require('../captcha/template_matcher');
const { clickAbsolute } = require('./click_helper');
const cfg = require('../config/config');
```

### Từ captcha/ (captcha_processor_java_like.js):
```javascript
const { readCaptchaWithGitHubModels } = require('../websocket/github_models_helper');
const { matchTemplate } = require('./template_matcher');
const { locateCaptchaImage } = require('./captcha_helper');
```

## 🚀 Chạy project

```bash
# Từ root của puppeteer-automation
npm start

# Server sẽ chạy tại:
# http://localhost:3000
```

## 📝 Notes

- Tất cả paths đã được cập nhật để phản ánh cấu trúc thư mục mới
- Code vẫn chạy bình thường, chỉ có tổ chức file thay đổi
- Import paths sử dụng relative paths (`../` để đi lên level, `./` cho cùng folder)
