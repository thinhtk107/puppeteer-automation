# ⚠️ PaddleOCR Package Issue (paddleocr@1.0.6)

## Vấn đề

Package `paddleocr@1.0.6` có bug nghiêm trọng:
- Package đã cài đặt thành công
- Nhưng khi import, module **không export gì cả**
- Lỗi: `PaddleOcrService not found in paddleocr module`

## Chi tiết kỹ thuật

### Package structure
```
node_modules/paddleocr/
├── package.json         → "type": "module" (khai báo ES module)
├── dist/
│   ├── index.js        → UMD format với exports rỗng ❌
│   ├── index.d.ts      → TypeScript definitions (đúng) ✅
│   └── processor/      → Chứa source code thực
```

### Kiểm tra exports
```javascript
// ES Module import
import('paddleocr').then(m => console.log(Object.keys(m)))
// Output: [] (empty!) ❌

// CommonJS require
const p = require('paddleocr')
// Error: ERR_REQUIRE_ESM ❌
```

### Root cause
File `dist/index.js` có vấn đề build:
- Nó là UMD format
- Nhưng không export gì
- TypeScript definitions (`index.d.ts`) chỉ đến `./processor/paddle-ocr` không tồn tại

## Workaround

**Giải pháp tạm thời**: Không dùng PaddleOCR, sử dụng 2-tier OCR:

### 1. Cập nhật `.env.ocr`
```bash
# Bỏ 'paddle' khỏi tier order
OCR_TIER_ORDER=tesseract,github
```

### 2. Pipeline hiện tại
```
Tier 1: Tesseract.js
   ↓ (on failure)
Tier 2: GitHub Models (gpt-4o-mini)
```

**Accuracy**: 
- Tesseract: 70-80% (local, unlimited)
- GitHub Models: 85-90% (cloud, 50 req/day)

## Giải pháp lâu dài

### Option 1: Chờ package được fix
Theo dõi repo: https://github.com/X3ZvaWQ/paddleocr.js/issues

Khi có version mới (v1.0.7+), reinstall:
```bash
npm uninstall paddleocr
npm install paddleocr@latest
```

### Option 2: Dùng package khác
**Thay thế khả thi**:
- `tesseract.js` ✅ (đang dùng)
- `@google-cloud/vision` (Google Vision API)
- `node-paddle-ocr` (wrapper khác)
- Gọi trực tiếp Python PaddleOCR qua `child_process`

### Option 3: Build from source
```bash
git clone https://github.com/X3ZvaWQ/paddleocr.js.git
cd paddleocr.js
npm install
npm run build
# Link locally
npm link
cd /path/to/your/project
npm link paddleocr
```

## Tác động

**Hiện tại**: ✅ Không ảnh hưởng nghiêm trọng
- OCR vẫn hoạt động tốt với Tesseract + GitHub Models
- Accuracy đủ cho CAPTCHA (70-90%)
- Không giới hạn request với Tesseract

**Tương lai**: ⚠️ Nên fix để có thêm tier
- PaddleOCR có accuracy cao hơn Tesseract (80-90%)
- Chạy local, không giới hạn như GitHub Models
- Hỗ trợ nhiều ngôn ngữ tốt hơn

## Status

- [x] Xác định vấn đề: Package build error
- [x] Implement workaround: Disable PaddleOCR tier
- [x] Update documentation: .env.ocr + code comments
- [ ] Chờ package fix hoặc tìm alternative
- [ ] Test lại khi có update

---

**Last updated**: 2025-11-09
**Issue tracker**: https://github.com/X3ZvaWQ/paddleocr.js/issues
