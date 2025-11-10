# Join Game Xoc Flow - Documentation

## Tổng quan

Module `join_game_flow.js` cung cấp chức năng tự động tham gia vào game Xóc Đĩa (Phụng), tương đương với logic trong `SeleniumService.joinGameXoc()` của Java version.

## Chức năng chính

### 1. `joinGameXoc(page, templatesDir, logger)`

Hàm chính thực hiện toàn bộ quy trình tham gia game:

**Các bước thực hiện:**
1. **Dọn dẹp popups ban đầu** - Tự động đóng các popup hiển thị sau khi đăng nhập
2. **Click vào game "XÓC ĐĨA"** - Tìm và click vào icon game Xóc Đĩa
3. **Click vào game "PHỤNG"** - Sử dụng thuật toán tìm thanh Cyan dài nhất để xác định vị trí game Phụng

**Tham số:**
- `page` (Puppeteer.Page) - Đối tượng page của Puppeteer
- `templatesDir` (string) - Đường dẫn đến thư mục chứa template images
- `logger` (Object) - Logger object với các method: log, warn, error

**Ví dụ sử dụng:**
```javascript
const { joinGameXoc } = require('./join_game_flow');

// Sau khi đăng nhập thành công
await joinGameXoc(page, templatesDir, logger);
```

### 2. `handleInitialPopups(page, templatesDir, logger)`

Xử lý và đóng các popup xuất hiện sau khi đăng nhập.

**Logic:**
- Tìm kiếm nút X (đóng popup) trong vùng góc trên bên phải màn hình
- Tự động click để đóng popup
- Lặp lại tối đa 10 lần cho đến khi không còn popup nào
- Sử dụng template matching với threshold 0.6

**Template cần thiết:**
- `common_popup_X.png` - Hình ảnh nút X để đóng popup

### 3. `clickPhungUsingLongestBar(page, logger)`

Tìm và click vào game Phụng bằng thuật toán phát hiện màu Cyan.

**Thuật toán:**
1. **Chụp ảnh canvas** hiện tại
2. **Chuyển đổi sang HSV** color space
3. **Tạo mask** cho màu Xanh Cyan (H: 80-100, S: 100-255, V: 100-255)
4. **Tìm contours** và xác định thanh dài nhất (longest bar)
5. **Tính toán vị trí click:**
   - Y: Tâm của thanh dài nhất
   - X: Cố định tại 380 (dựa trên kinh nghiệm)
6. **Thực hiện click**

**Debug files được tạo:**
- `~/Desktop/debug_cyan_mask.png` - Ảnh mask màu Cyan
- `~/Desktop/debug_longest_bar_found.png` - Ảnh đánh dấu thanh dài nhất

## Tích hợp với automation.js

### Cách sử dụng trong payload

```javascript
const payload = {
  url: 'https://i.hit.club/',
  loginRequest: {
    username: 'your_username',
    password: 'your_password',
    captchaText: null // Sẽ tự động giải
  },
  joinGameXoc: true, // ← BẬT CHỨC NĂNG JOIN GAME
  proxyHost: '123.456.789.0',
  proxyPort: 8080,
  proxyUser: 'proxy_username',
  proxyPassword: 'proxy_password',
  keepBrowser: true
};

const { runAutomation } = require('./automation');
const result = await runAutomation(payload, uploadedFiles);
```

### Flow tự động

Khi `joinGameXoc: true` được thiết lập trong payload:

```
1. Khởi tạo browser với proxy
2. Xác minh IP của proxy
3. Truy cập website
4. Thực hiện đăng nhập (login flow)
5. ✅ Tự động thực hiện join game xoc flow
   - Dọn popup
   - Click vào Xóc Đĩa
   - Click vào Phụng
6. Trả về kết quả
```

## Template Images cần thiết

Các file template sau cần có trong thư mục `resources` hoặc `uploads`:

1. **button_login.png** - Nút đăng nhập
2. **username_field.png** - Trường username
3. **password_field.png** - Trường password
4. **captcha_field_login_popup.png** - Trường CAPTCHA
5. **captcha_instruction_anchor.png** - Neo hướng dẫn CAPTCHA
6. **final_login_button.png** - Nút đăng nhập cuối cùng
7. **common_popup_X.png** - Nút X đóng popup
8. **game_xoc_dia.png** - Icon game Xóc Đĩa
9. **game_phung.png** (optional) - Icon game Phụng (nếu không dùng longest bar logic)

## Cấu hình

### Config.js settings

```javascript
module.exports = {
  DEFAULT_TEMPLATE_TIMEOUT_MS: 30000, // Timeout cho template matching
  TEMPLATE_INTERVAL_MS: 500,          // Interval giữa các lần kiểm tra
  SHORT_WAIT_MS: 500,                 // Thời gian chờ ngắn
  // ... các config khác
};
```

### Environment Variables (.env hoặc .env.ocr)

```bash
# Proxy settings
PROXY_HOST=123.456.789.0
PROXY_PORT=8080
PROXY_USER=username
PROXY_PASSWORD=password

# Browser settings
HEADLESS=false
DEV_VISIBLE=true
KEEP_BROWSER=true
```

## Dependencies

Các package Node.js cần thiết:

```json
{
  "puppeteer": "^19.0.0",
  "opencv4nodejs": "^5.6.0",
  "tesseract.js": "^4.0.0",
  "axios": "^1.0.0",
  "dotenv": "^16.0.0"
}
```

**Lưu ý:** `opencv4nodejs` yêu cầu OpenCV được cài đặt trên hệ thống.

## Error Handling

### Common Errors

1. **"Canvas element not found"**
   - Nguyên nhân: Không tìm thấy element `#GameCanvas`
   - Giải pháp: Đợi thêm thời gian để page load hoàn toàn

2. **"Không tìm thấy game 'XÓC ĐĨA'"**
   - Nguyên nhân: Template không match hoặc game chưa hiển thị
   - Giải pháp: Kiểm tra file `game_xoc_dia.png` và threshold

3. **"Không tìm thấy thanh màu Xanh Cyan nào"**
   - Nguyên nhân: Màu sắc thay đổi hoặc không có game Phụng
   - Giải pháp: Kiểm tra file `debug_cyan_mask.png` và điều chỉnh HSV range

### Debug Tips

1. **Kiểm tra screenshots:**
   - Các file debug được lưu tại `~/Desktop/`
   - `debug_cyan_mask.png` - Kiểm tra mask màu Cyan
   - `debug_longest_bar_found.png` - Kiểm tra thanh được chọn
   - `screenshot_*.png` - Trạng thái màn hình tại các bước

2. **Xem logs:**
   ```javascript
   const logger = {
     steps: [],
     log: (...args) => { 
       console.log(...args); 
       logger.steps.push({ level: 'info', text: args.join(' ') }); 
     },
     warn: (...args) => { 
       console.warn(...args); 
       logger.steps.push({ level: 'warn', text: args.join(' ') }); 
     },
     error: (...args) => { 
       console.error(...args); 
       logger.steps.push({ level: 'error', text: args.join(' ') }); 
     }
   };
   
   // Sau khi chạy xong
   console.log('All logs:', logger.steps);
   ```

3. **Điều chỉnh thời gian chờ:**
   - Tăng `waitForTimeout` nếu game load chậm
   - Điều chỉnh `DEFAULT_TEMPLATE_TIMEOUT_MS` cho template matching

## So sánh với Java version

| Feature | Java (SeleniumService) | Node.js (join_game_flow) |
|---------|------------------------|--------------------------|
| Popup handling | ✅ ROI-based search | ✅ ROI-based search |
| Color detection | ✅ OpenCV inRange | ✅ opencv4nodejs inRange |
| Longest bar logic | ✅ findContours | ✅ findContours |
| Template matching | ✅ matchTemplate | ✅ matchTemplate |
| Debug screenshots | ✅ Desktop/*.png | ✅ Desktop/*.png |
| Proxy support | ✅ ChromeOptions | ✅ launch args |
| IP verification | ✅ api.ipify.org | ✅ api.ipify.org |

## Testing

### Unit Test Example

```javascript
const { joinGameXoc } = require('./join_game_flow');

describe('Join Game Xoc Flow', () => {
  it('should successfully join game xoc', async () => {
    const page = await browser.newPage();
    await page.goto('https://i.hit.club/');
    
    // Login first
    await performFullLoginViaImages(page, templatesMap, templatesDir, loginRequest, logger);
    
    // Join game
    await joinGameXoc(page, templatesDir, logger);
    
    // Verify result
    expect(logger.steps).toContain('JOIN GAME XOC FLOW - COMPLETED');
  });
});
```

### Manual Test

```bash
# Run with dev mode
DEV_VISIBLE=true KEEP_BROWSER=true node test_join_game.js
```

## Performance

- **Average execution time:** 15-25 seconds
  - Popup cleanup: 2-5 seconds
  - Click Xóc Đĩa: 5-7 seconds
  - Click Phụng: 5-8 seconds
  - Waits: 7-10 seconds

- **Memory usage:** ~200-300 MB (including OpenCV)

## Troubleshooting

### Issue: OpenCV not installed

```bash
# Install OpenCV on Ubuntu/Debian
sudo apt-get install libopencv-dev

# Install OpenCV on macOS
brew install opencv

# Install OpenCV on Windows
# Download from https://opencv.org/releases/
# Set OPENCV_DIR environment variable
```

### Issue: Template matching fails

1. Update template images với ảnh mới nhất
2. Giảm threshold (hiện tại: 0.6)
3. Kiểm tra resolution của template vs canvas

### Issue: Longest bar detection fails

1. Kiểm tra `debug_cyan_mask.png` để xem mask có đúng không
2. Điều chỉnh HSV range:
   ```javascript
   const lowerCyan = new cv.Vec3(75, 80, 80);  // Giảm threshold
   const upperCyan = new cv.Vec3(105, 255, 255); // Tăng range
   ```
3. Kiểm tra có thanh Cyan nào trên màn hình không

## Changelog

### v1.0.0 (2025-11-10)
- Initial release
- Implemented joinGameXoc flow
- Added popup cleanup logic
- Added longest bar detection for Phụng game
- Added comprehensive error handling and debugging

## License

MIT License - Same as main project
