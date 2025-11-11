# Puppeteer Automation Server

Dự án Node.js để tự động hóa trình duyệt với Puppeteer, hỗ trợ:
- 🎯 Định vị element bằng hình ảnh (Template Matching với OpenCV)
- 🤖 OCR nhận dạng CAPTCHA (Tesseract.js)
- 🔄 WebSocket real-time communication
- 🖼️ Xử lý ảnh nâng cao (Sharp, Jimp)
- 🧠 Hỗ trợ ML models (ONNX Runtime)

## 📋 Yêu cầu hệ thống

- **Node.js** 18+ (khuyên dùng LTS)
- **Python** 3.8+
- **pip** (để cài đặt các package Python)
- **Windows PowerShell** 5.1+ hoặc PowerShell 7+

## 🚀 Cài đặt

### Bước 1: Clone hoặc tải source code về

```powershell
git clone https://github.com/thinhtk107/puppeteer-automation.git
cd puppeteer-automation
```

### Bước 2: Cài đặt Node.js dependencies

```powershell
npm install
```

Các thư viện chính sẽ được cài đặt:
- `puppeteer` - Browser automation
- `express` - Web server
- `multer` - File upload handler
- `sharp` - Image processing
- `tesseract.js` - OCR engine
- `ws` - WebSocket support
- `axios` - HTTP client
- `onnxruntime-node` - ML model runtime

### Bước 3: Cài đặt Python dependencies

```powershell
pip install opencv-python numpy
```

Hoặc sử dụng file requirements (nếu có):

```powershell
pip install -r requirements.txt
```

### Bước 4: Cấu hình môi trường (Optional)

Tạo file `.env` trong thư mục gốc:

```env
PORT=3000
NODE_ENV=development
```

## 🔨 Build Source

Dự án này chạy trực tiếp với Node.js, không cần build. Tuy nhiên:

### Development mode
```powershell
npm run dev
```

### Production mode
```powershell
npm install --production
npm start
```

## ▶️ Chạy ứng dụng

### Khởi động server

```powershell
node server.js
```

Hoặc sử dụng npm script:

```powershell
npm start
```

Server sẽ lắng nghe trên **port 3000** (mặc định).

### Kiểm tra server

Mở trình duyệt và truy cập:
```
http://localhost:3000
```

Hoặc dùng PowerShell:
```powershell
curl http://localhost:3000
```

## 📖 Sử dụng

### 1. API Endpoint cơ bản

**POST** `/run` - Chạy automation workflow

**Body:** multipart/form-data
- `payload`: JSON object chứa URL và actions
- `templates`: File ảnh template (multiple files)

### 2. Ví dụ với PowerShell

```powershell
# Chuẩn bị dữ liệu
$payload = @{
    url = "https://example.com"
    actions = @(
        @{
            type = "clickImage"
            template = "login_button.png"
        }
    )
} | ConvertTo-Json

# Gửi request
$form = @{
    payload = $payload
    templates = Get-Item "C:\templates\login_button.png"
}

Invoke-RestMethod -Uri "http://localhost:3000/run" `
    -Method Post `
    -Form $form
```

### 3. Ví dụ với curl (Git Bash/Linux)

```bash
curl -X POST http://localhost:3000/run \
  -F "payload={\"url\":\"https://example.com\",\"actions\":[{\"type\":\"clickImage\",\"template\":\"btn.png\"}]}" \
  -F "templates=@/path/to/btn.png"
```

### 4. Actions được hỗ trợ

```javascript
// Click vào element bằng template image
{
  "type": "clickImage",
  "template": "button.png",
  "threshold": 0.8  // Optional: độ chính xác (0-1)
}

// Nhập text
{
  "type": "type",
  "selector": "#username",
  "text": "myusername"
}

// Click thông thường
{
  "type": "click",
  "selector": ".submit-btn"
}

// Chờ element xuất hiện
{
  "type": "wait",
  "selector": ".loading",
  "timeout": 5000
}

// Screenshot
{
  "type": "screenshot",
  "path": "result.png"
}
```

## 🏗️ Cấu trúc thư mục

```
puppeteer-automation/
├── server.js                    # Express server chính
├── package.json                 # Node.js configuration
├── README.md                    # Documentation
├── .env                         # Environment variables (tự tạo)
│
├── public/                      # Frontend assets
│   ├── index.html              # Web interface
│   ├── client.js               # Client-side logic
│   └── styles.css              # Styling
│
├── src/
│   ├── main/
│   │   ├── automation.js       # Core automation logic
│   │   ├── ARCHITECTURE.md     # Kiến trúc hệ thống
│   │   │
│   │   ├── captcha/            # CAPTCHA processing modules
│   │   │   ├── captcha_helper.js
│   │   │   ├── captcha_processor_java_like.js
│   │   │   ├── ocr_helper.js
│   │   │   ├── template_matcher.js
│   │   │   └── advanced_image_preprocessing.js
│   │   │
│   │   ├── config/             # Configuration
│   │   │   └── config.js
│   │   │
│   │   ├── flows/              # Automation workflows
│   │   │   ├── login_flow.js
│   │   │   └── join_game_flow.js
│   │   │
│   │   ├── helpers/            # Utility helpers
│   │   │   ├── click_helper.js
│   │   │   ├── type_helper.js
│   │   │   ├── screenshot_helper.js
│   │   │   ├── visibility_helper.js
│   │   │   ├── matcher_helper.js
│   │   │   └── cleanup_helper.js
│   │   │
│   │   ├── uploads/            # Uploaded CAPTCHA images
│   │   └── websocket/          # WebSocket handlers
│   │
│   └── resources/              # Template images
│       ├── button_login.png
│       ├── captcha_field_login_popup.png
│       ├── game_phung.png
│       ├── red_capcha.png
│       ├── blue_capcha.png
│       └── ...
│
├── tools/
│   └── image_match.py          # Python OpenCV template matching
│
└── uploads/                    # Temporary upload folder
```

## ⚙️ Cách hoạt động

1. **Client gửi request** với URL target và danh sách actions
2. **Server nhận template images** và lưu tạm
3. **Puppeteer khởi động browser** và navigate đến URL
4. **Chụp screenshot** trang web hiện tại
5. **Python OpenCV** thực hiện template matching trên screenshot
6. **Trả về tọa độ (x, y)** của element cần tương tác
7. **Puppeteer thực hiện action** tại vị trí đã xác định
8. **OCR xử lý CAPTCHA** nếu cần (Tesseract.js)
9. **WebSocket push updates** real-time cho client

## 🔍 Tính năng nâng cao

### Template Matching với multiple scales
```javascript
// Tự động thử nhiều kích thước
const scales = [0.8, 0.9, 1.0, 1.1, 1.2];
```

### CAPTCHA Processing
- Pre-processing ảnh (grayscale, threshold, denoise)
- Color masking (red, blue, black)
- OCR với Tesseract.js
- Template matching cho CAPTCHA phức tạp

### WebSocket Support
```javascript
// Real-time progress updates
ws.send(JSON.stringify({
  type: 'progress',
  message: 'Đang xử lý CAPTCHA...',
  percentage: 45
}));
```

## 🐛 Khắc phục sự cố

### Lỗi: Cannot find module 'opencv-python'
```powershell
pip install --upgrade pip
pip install opencv-python --no-cache-dir
```

### Lỗi: Port 3000 đã được sử dụng
```powershell
# Kiểm tra process đang dùng port
netstat -ano | findstr :3000

# Kill process (thay <PID> bằng Process ID)
taskkill /PID <PID> /F

# Hoặc đổi port trong .env
PORT=3001
```

### Lỗi: Puppeteer timeout
```javascript
// Tăng timeout trong config
{
  timeout: 60000,  // 60 seconds
  headless: false  // Show browser để debug
}
```

### Lỗi: Sharp installation failed
```powershell
npm install --platform=win32 --arch=x64 sharp
```

### Lỗi: ONNX Runtime không tải được
```powershell
# Cài lại với native build
npm rebuild onnxruntime-node --build-from-source
```

## 📝 Lưu ý quan trọng

- ⚠️ **Template matching nhạy cảm với kích thước**: Template phải match chính xác với element trên page
- 🎨 **Màu sắc và độ phân giải**: Đảm bảo template có cùng scale và color với target
- ⏱️ **Timeout hợp lý**: Set timeout đủ lớn cho các trang load chậm
- 🔒 **Security**: Không expose server ra public internet
- 💾 **Cleanup**: Các file upload tạm sẽ được tự động xóa sau mỗi session

## 🤝 Contributing

Đóng góp ý tưởng hoặc báo lỗi tại: [GitHub Issues](https://github.com/thinhtk107/puppeteer-automation/issues)

## 📄 License

MIT License - Xem file LICENSE để biết thêm chi tiết.

---

**Made with ❤️ by thinhtk107**
