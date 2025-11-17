# Cập nhật: Hệ thống cược theo 5 mức tiền tùy chỉnh

## Tổng quan
Đã cập nhật hệ thống từ **Martingale tự động gấp đôi** sang **5 mức tiền cược tùy chỉnh** cho phép người dùng tự nhập.

## Các thay đổi chính

### 1. Giao diện người dùng (Frontend)

#### `public/index.html`
- ✅ Thay thế dropdown `baseBetAmount` bằng **5 ô input** cho 5 mức tiền cược
- ✅ Thêm trường hiển thị mức cược hiện tại (`betLevelInfo`) trong phần thống kê realtime
- ✅ Layout dạng grid 5 cột, responsive trên mobile

**Giá trị mặc định:**
- Lần 1: 10,000đ
- Lần 2: 13,000đ
- Lần 3: 25,000đ
- Lần 4: 53,000đ
- Lần 5: 50,000đ

#### `public/styles.css`
- ✅ Thêm CSS cho `.bet-amounts-grid` (5 columns)
- ✅ Styling cho `.bet-amount-item` input fields
- ✅ Responsive breakpoints (3 cols @ 1200px, 2 cols @ 768px, 1 col @ 480px)

#### `public/client.js`
- ✅ Đọc 5 giá trị từ `betAmount1` đến `betAmount5`
- ✅ Gửi mảng `betAmounts` trong request thay vì `baseBetAmount` đơn lẻ
- ✅ Lưu `betAmounts` và `currentBetLevel` vào session stats
- ✅ Cập nhật hiển thị mức cược hiện tại (Mức X/5)

### 2. Backend API

#### `server.js`
- ✅ Parse mảng `betAmounts` từ request body
- ✅ Validation: Nếu không có hoặc không đúng 5 phần tử → dùng default
- ✅ Truyền `betAmounts` vào payload automation
- ✅ Log betAmounts để debug

### 3. Logic cược (Betting Logic)

#### `src/main/websocket/websocket_hook.js`
**Thay đổi quan trọng:**

**Trước đây (Martingale):**
```javascript
// Khi THUA: Gấp đôi
nextBetAmount = currentBetAmount * 2;

// Khi THẮNG: Reset về base
nextBetAmount = baseBetAmount;
```

**Bây giờ (Custom Bet Levels):**
```javascript
// Khởi tạo
session.myBetAmounts = [10000, 13000, 25000, 53000, 50000];
session.myCurrentBetLevel = 0; // Index: 0-4
session.myCurrentBetAmount = session.myBetAmounts[0];

// Khi THUA: Tăng lên mức tiếp theo (max level 4)
session.myCurrentBetLevel = Math.min(
  session.myCurrentBetLevel + 1, 
  session.myBetAmounts.length - 1
);
session.myCurrentBetAmount = session.myBetAmounts[session.myCurrentBetLevel];

// Khi THẮNG: Reset về mức 0
session.myCurrentBetLevel = 0;
session.myCurrentBetAmount = session.myBetAmounts[0];
```

- ✅ Thêm biến `myBetAmounts` (mảng 5 giá trị)
- ✅ Thêm biến `myCurrentBetLevel` (index 0-4)
- ✅ Logic THẮNG: Reset về level 0
- ✅ Logic THUA: Tăng level (max = 4)
- ✅ Broadcast thêm `currentBetLevel` và `maxBetLevel` cho client

#### `src/main/automation.js`
- ✅ Đọc `betAmounts` từ payload
- ✅ Truyền `betAmounts` vào `setupWebSocketHook()`
- ✅ Lưu vào session config

## Cách sử dụng

### 1. Khởi động server
```bash
node server.js
```

### 2. Truy cập giao diện
Mở `http://localhost:3000` trên trình duyệt

### 3. Cấu hình số tiền cược
- Nhập URL, username, password như bình thường
- **Điều chỉnh 5 ô số tiền cược** theo chiến lược của bạn
- Ví dụ: 10k → 13k → 25k → 53k → 50k

### 4. Chạy automation
- Nhấn "Bắt đầu Automation"
- Hệ thống sẽ bắt đầu từ **Mức 1** (số tiền lần 1)
- Nếu **THUA**: tăng lên mức 2, 3, 4, 5
- Nếu **THẮNG**: reset về mức 1

## Lợi ích

### So với Martingale gấp đôi:
- ❌ **Trước:** 10k → 20k → 40k → 80k → 160k (tăng quá nhanh!)
- ✅ **Bây giờ:** 10k → 13k → 25k → 53k → 50k (kiểm soát tốt hơn)

### Ưu điểm:
1. **Linh hoạt**: Tùy chỉnh từng mức cược
2. **An toàn hơn**: Không tăng quá nhanh như gấp đôi
3. **Chiến lược**: Có thể giảm ở mức cuối (50k thay vì 160k)
4. **Rõ ràng**: Biết chính xác đang ở mức nào (hiển thị "Mức 3/5")

## Testing

### Test case 1: Chuỗi thua
- Kỳ vọng: 10k → 13k → 25k → 53k → 50k → 50k (giữ nguyên mức 5)

### Test case 2: Thắng giữa chừng
- Kỳ vọng: 10k (thua) → 13k (thua) → 25k (THẮNG) → reset về 10k

### Test case 3: Giá trị mặc định
- Nếu không nhập gì hoặc sai format → dùng [10k, 13k, 25k, 53k, 50k]

## Các file đã thay đổi

```
✏️  public/index.html          - Thêm 5 input fields + bet level display
✏️  public/styles.css          - CSS cho bet-amounts-grid
✏️  public/client.js           - Đọc betAmounts, hiển thị bet level
✏️  server.js                  - Parse & validate betAmounts
✏️  src/main/automation.js     - Truyền betAmounts vào hook
✏️  src/main/websocket/websocket_hook.js - Logic cược mới (level-based)
```

## Notes quan trọng

⚠️ **Lưu ý:**
- Mảng `betAmounts` **PHẢI có đúng 5 phần tử**
- Mỗi giá trị >= 500đ (minimum)
- Step = 500đ (tăng theo bội của 500)
- Khi đạt mức 5 và tiếp tục thua → giữ nguyên mức 5

## Tương thích ngược

✅ Code cũ vẫn hoạt động vì:
- `baseBetAmount` vẫn được set = `betAmounts[0]`
- Nếu không có `betAmounts` → dùng default array
- Session cũ không bị ảnh hưởng

---

**Ngày cập nhật:** 17/11/2025  
**Version:** 2.0 - Custom Bet Levels
