# Module Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                      automation.js                          │
│                    (Main Entry Point)                       │
└────────────┬────────────────────┬──────────────────────────┘
             │                    │
             ▼                    ▼
    ┌────────────────┐   ┌──────────────────┐
    │  flows/        │   │  websocket/      │
    │  - login       │   │  - hook          │
    │  - join_game   │   │  - github_models │
    └────┬───────────┘   └──────────────────┘
         │
         ├──────────────┬──────────────┬─────────────────┐
         │              │              │                 │
         ▼              ▼              ▼                 ▼
┌────────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  helpers/      │ │  captcha/    │ │  config/     │ │  websocket/  │
│  - click       │ │  - processor │ │  - config.js │ │  - hook      │
│  - type        │ │  - helper    │ └──────────────┘ └──────────────┘
│  - matcher     │ │  - ocr       │
│  - screenshot  │ │  - templates │
│  - cleanup     │ └──────────────┘
└────────────────┘
```

## Flow Execution

```
1. Server starts (server.js)
   └─> Loads automation.js

2. API call /api/v1/login
   └─> automation.js
       ├─> flows/login_flow.js
       │   ├─> helpers/matcher_helper.js (find login button)
       │   ├─> helpers/click_helper.js (click button)
       │   ├─> helpers/type_helper.js (type username/password)
       │   └─> captcha/captcha_processor_java_like.js
       │       ├─> captcha/ocr_helper.js (read CAPTCHA)
       │       └─> websocket/github_models_helper.js (optional)
       │
       ├─> websocket/websocket_hook.js
       │   └─> Inject WebSocket hooks, auto-send logic
       │
       ├─> flows/join_game_flow.js
       │   ├─> helpers/matcher_helper.js (find game)
       │   └─> helpers/click_helper.js (click game)
       │
       └─> helpers/cleanup_helper.js
           └─> Clean temporary files
```

## File Relationships

### Core Dependencies
- **automation.js** depends on:
  - `flows/login_flow.js`
  - `websocket/websocket_hook.js`
  - `helpers/cleanup_helper.js`

### Flow Dependencies
- **flows/login_flow.js** depends on:
  - `helpers/matcher_helper.js`
  - `helpers/type_helper.js`
  - `captcha/captcha_processor_java_like.js`
  - `config/config.js`

- **flows/join_game_flow.js** depends on:
  - `helpers/matcher_helper.js`
  - `helpers/click_helper.js`
  - `config/config.js`

### Helper Dependencies
- **helpers/matcher_helper.js** depends on:
  - `captcha/template_matcher.js`
  - `helpers/screenshot_helper.js`
  - `helpers/click_helper.js`
  - `config/config.js`

- **helpers/type_helper.js** depends on:
  - `helpers/matcher_helper.js`
  - `helpers/click_helper.js`
  - `helpers/screenshot_helper.js`
  - `config/config.js`

### CAPTCHA Dependencies
- **captcha/captcha_processor_java_like.js** depends on:
  - `captcha/advanced_image_preprocessing.js`
  - `captcha/template_matcher.js`
  - `captcha/captcha_helper.js`
  - `websocket/github_models_helper.js`

## Benefits of New Structure

✅ **Separation of Concerns**: Mỗi module có trách nhiệm rõ ràng
✅ **Easy to Navigate**: Dễ tìm file theo chức năng
✅ **Maintainable**: Dễ bảo trì và mở rộng
✅ **Scalable**: Dễ thêm module mới
✅ **Clean Dependencies**: Import paths rõ ràng
