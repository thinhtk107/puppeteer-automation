/**
 * WebSocket Hook Logic - Puppeteer Implementation
 * Tương đương với logic WebSocket hook trong Java Selenium
 */

/**
 * Setup WebSocket hook to intercept and auto-send messages
 * @param {Page} page - Puppeteer page object
 * @param {Object} logger - Logger object
 * @param {Object} options - Options object containing baseBet
 */
async function setupWebSocketHook(page, logger, options = {}) {
  try {
    // Lấy baseBet từ options, default = 500
    const baseBet = options.baseBet || 500;
    
    logger && logger.log && logger.log('\n========================================');
    logger && logger.log && logger.log('   WEBSOCKET HOOK SETUP - START');
    logger && logger.log && logger.log(`   Base Bet Amount: ${baseBet}`);
    logger && logger.log && logger.log('========================================\n');

    // Define the hook script (same logic as Java version)
        const hookScript = `
    // 1. CHỈ ĐỊNH URL MỤC TIÊU CỦA BẠN TẠI ĐÂY
    const targetUrl = "wss://carkgwaiz.hytsocesk.com/websocket";
    console.log('Đang "hook" vào WebSocket. Chỉ theo dõi URL chứa: ' + targetUrl);
                   
// Biến toàn cục để lưu ID phòng tốt nhất
window.myBestRid = null;
                    
// --- BIẾN MỚI ĐỂ THEO DÕI LOGIC "CHUỖI" (STREAK) ---
// Biến theo dõi chuỗi hiện tại
window.myCurrentStreakType = null; // (sẽ là 2 hoặc 5)
window.myCurrentStreakCount = 0;   // (sẽ là 1, 2, 3...)
                    
// Biến "ngân hàng" (bank) để đếm các chuỗi đã hoàn thành
window.mySetCount_L2 = 0; // Đếm số "Bộ 2" (ví dụ: chuỗi 2-2)
window.mySetCount_L3 = 0; // Đếm số "Bộ 3" (ví dụ: chuỗi 2-2-2)
window.mySetCount_L4 = 0; // Đếm số "Bộ 4"
window.mySetCount_L5 = 0; // Đếm số "Bộ 5"
window.mySetCount_L6 = 0; // Đếm số "Bộ 6"
                    
// --- BIẾN MỚI ĐỂ THEO DÕI LOGIC CƯỢC (MARTINGALE) ---
window.myBaseBetAmount = ${baseBet}; // Số tiền cược CƠ BẢN (từ form)
window.myCurrentBetAmount = window.myBaseBetAmount; // Số tiền cược HIỆN TẠI (sẽ nhân 2 nếu thua)
window.myLastBetEid = null; // (2 hoặc 5) - EID đã đặt cược ở vòng trước
window.isWaitingForResult = false; // Cờ (flag) - true nếu đang chờ kết quả cược GẤP THẾP
window.myLastBankedStreakType = null; // (2 hoặc 5) - Loại chuỗi vừa được bank

// --- BIẾN MỚI ĐỂ THEO DÕI LOGIC CƯỢC 4 VÁN ---
window.myRoundCounter = 0; // Đếm số ván đã qua
window.isWaitingForFixedBet = false; // Cờ (flag) - true nếu đang chờ kết quả cược baseBet

// --- BIẾN THEO DÕI SỐ TIỀN HIỆN TẠI ---
window.myCurrentBalance = 1000; // Số tiền hiện tại (sẽ cập nhật từ socket)
window.myTotalBetsPlaced = 0; // Tổng số lần cược đã đặt
window.myTotalWins = 0; // Tổng số lần thắng
window.myTotalLosses = 0; // Tổng số lần thua

// --- BIẾN THỐNG KÊ NÂNG CAO ---
window.myTotalWinAmount = 0; // Tổng tiền thắng
window.myTotalLossAmount = 0; // Tổng tiền thua
window.myCurrentWinStreak = 0; // Thắng liên tiếp hiện tại
window.myCurrentLossStreak = 0; // Thua liên tiếp hiện tại
window.myMaxWinStreak = 0; // Thắng liên tiếp tối đa
window.myMaxLossStreak = 0; // Thua liên tiếp tối đa
window.myHighestBet = window.myBaseBetAmount; // Cược cao nhất
window.myBettingHistory = []; // Lịch sử cược
                    
console.log('SOCKET (Logic): Khởi tạo. Cược cơ bản: ' + window.myBaseBetAmount);
// ---------------------------------------------------
                    
// 2. Hook vào hàm 'send' (Giữ nguyên)
if (!window.OriginalWebSocketSend) {
    window.OriginalWebSocketSend = WebSocket.prototype.send;
}
WebSocket.prototype.send = function(data) { 
    if (this.url === targetUrl) {
        window.myLastUsedSocket = this;
    }
    window.OriginalWebSocketSend.apply(this, arguments);
};
                   
// 3. Hook vào hàm 'onmessage' (LOGIC CHÍNH)
Object.defineProperty(WebSocket.prototype, 'onmessage', {
    set: function(originalCallback) {
        const newCallback = function(event) {
            if (this.url === targetUrl) {
                window.myLastUsedSocket = this;
                   
                const receivedData = event.data;
                let parsedData;
                let command;
                let currentWinningEid = null; // Sẽ là 2, 5, hoặc null
                   
                try {
                    parsedData = JSON.parse(receivedData);
                    if (Array.isArray(parsedData) && parsedData[1]) {
                        command = parsedData[1].cmd; // Lấy command
                       
                        // Track số tiền hiện tại từ các response
                        // Thường thì balance nằm trong parsedData[1].m hoặc parsedData[1].b
                        if (parsedData[1].m !== undefined) {
                            window.myCurrentBalance = parsedData[1].m;
                            console.log('SOCKET (Balance Update): Số tiền hiện tại: ' + window.myCurrentBalance.toLocaleString() + 'đ');
                        } else if (parsedData[1].b !== undefined) {
                            window.myCurrentBalance = parsedData[1].b;
                            console.log('SOCKET (Balance Update): Số tiền hiện tại: ' + window.myCurrentBalance.toLocaleString() + 'đ');
                        }
                       
                        // Lấy EID thắng (nếu là cmd 907)
                        if (command === 907) {
                            const events = parsedData[1].ew;
                            if (events && Array.isArray(events)) {
                                for (const evt of events) {
                                    if ((evt.eid === 2 || evt.eid === 5) && evt.wns && evt.wns.length > 0) {
                                        currentWinningEid = evt.eid; // Lưu lại là 2 hoặc 5
                                        break;
                                    }
                                }
                            }
                            console.log('SOCKET (Event): Kết quả vòng này là EID: ' + (currentWinningEid || 'Khác'));
                        }
                    }
                } catch (e) {}
                   
                // --- LOGIC 1: TÌM PHÒNG TỐT NHẤT (cmd: 300) ---
                if (command === 300) {
                    let roomList = null;
                    if (parsedData[1].rs) { roomList = parsedData[1].rs; }
                    else if (Array.isArray(parsedData[0])) { roomList = parsedData[0]; }
                   
                    if (roomList && roomList.length > 0) {
                        const bestRoom = roomList.reduce((maxRoom, currentRoom) => {
                            return (currentRoom.uC > maxRoom.uC) ? currentRoom : maxRoom;
                        }, roomList[0]);
                   
                        if (bestRoom && bestRoom.rid) {
                            window.myBestRid = bestRoom.rid;
                            console.log('SOCKET (Auto-Find): Đã cập nhật phòng tốt nhất. RID: ' + window.myBestRid);
                        }
                    }
                }
                   
                // --- LOGIC 2: XỬ LÝ KẾT QUẢ VÒNG (cmd: 907) ---
                if (command === 907) {
                   
                    // --- BƯỚC 2A: KIỂM TRA THẮNG/THUA (NẾU ĐANG CHỜ KẾT QUẢ) ---
                    if (window.isWaitingForResult) {
                        window.isWaitingForResult = false; // Đã nhận kết quả
                       
                        if (currentWinningEid === window.myLastBetEid) {
                            // THẮNG! (GẤP THẾP)
                            const winAmount = window.myCurrentBetAmount;
                            console.log('SOCKET (Martingale): THẮNG! Đặt cược EID ' + window.myLastBetEid + ' thành công. Số tiền thắng: ' + winAmount.toLocaleString() + 'đ');
                            
                            // Update statistics
                            window.myTotalWins++;
                            window.myTotalWinAmount += winAmount;
                            window.myCurrentWinStreak++;
                            window.myCurrentLossStreak = 0;
                            if (window.myCurrentWinStreak > window.myMaxWinStreak) {
                                window.myMaxWinStreak = window.myCurrentWinStreak;
                            }
                            
                            // Add to history
                            window.myBettingHistory.unshift({
                                time: new Date().toLocaleTimeString(),
                                eid: window.myLastBetEid,
                                amount: winAmount,
                                result: 'win',
                                balance: window.myCurrentBalance
                            });
                            if (window.myBettingHistory.length > 20) window.myBettingHistory.pop();
                            
                            window.myCurrentBetAmount = window.myBaseBetAmount; // Reset tiền cược
                        } else {
                            // THUA! (GẤP THẾP)
                            const lossAmount = window.myCurrentBetAmount;
                            console.log('SOCKET (Martingale): THUA! Cược ' + window.myLastBetEid + ' nhưng kết quả là ' + (currentWinningEid || 'Khác') + '. Số tiền thua: ' + lossAmount.toLocaleString() + 'đ');
                            
                            // Update statistics
                            window.myTotalLosses++;
                            window.myTotalLossAmount += lossAmount;
                            window.myCurrentLossStreak++;
                            window.myCurrentWinStreak = 0;
                            if (window.myCurrentLossStreak > window.myMaxLossStreak) {
                                window.myMaxLossStreak = window.myCurrentLossStreak;
                            }
                            
                            // Add to history
                            window.myBettingHistory.unshift({
                                time: new Date().toLocaleTimeString(),
                                eid: window.myLastBetEid,
                                amount: lossAmount,
                                result: 'loss',
                                balance: window.myCurrentBalance
                            });
                            if (window.myBettingHistory.length > 20) window.myBettingHistory.pop();
                            
                            window.myCurrentBetAmount *= 2; // Gấp đôi tiền cược cho LẦN SAU
                            
                            // Track highest bet
                            if (window.myCurrentBetAmount > window.myHighestBet) {
                                window.myHighestBet = window.myCurrentBetAmount;
                            }
                        }
                        console.log('SOCKET (Martingale): Số tiền cược cho lần tới là: ' + window.myCurrentBetAmount.toLocaleString() + 'đ');
                        console.log('SOCKET (Stats): Tổng cược: ' + window.myTotalBetsPlaced + ' | Thắng: ' + window.myTotalWins + ' | Thua: ' + window.myTotalLosses);
                        console.log('SOCKET (Advanced Stats): Thắng liên tiếp: ' + window.myCurrentWinStreak + ' | Thua liên tiếp: ' + window.myCurrentLossStreak + ' | Tổng thắng: ' + window.myTotalWinAmount.toLocaleString() + 'đ | Tổng thua: ' + window.myTotalLossAmount.toLocaleString() + 'đ');
                        window.myLastBetEid = null;
                    
                    } else if (window.isWaitingForFixedBet) {
                        window.isWaitingForFixedBet = false; // Đã nhận kết quả
                        if (currentWinningEid === window.myLastBetEid) {
                            const winAmount = window.myBaseBetAmount;
                            console.log('SOCKET (FixedBet): THẮNG! Cược ' + window.myBaseBetAmount.toLocaleString() + 'đ (EID ' + window.myLastBetEid + ') thành công.');
                            
                            // Update statistics
                            window.myTotalWins++;
                            window.myTotalWinAmount += winAmount;
                            window.myCurrentWinStreak++;
                            window.myCurrentLossStreak = 0;
                            if (window.myCurrentWinStreak > window.myMaxWinStreak) {
                                window.myMaxWinStreak = window.myCurrentWinStreak;
                            }
                            
                            // Add to history
                            window.myBettingHistory.unshift({
                                time: new Date().toLocaleTimeString(),
                                eid: window.myLastBetEid,
                                amount: winAmount,
                                result: 'win',
                                balance: window.myCurrentBalance
                            });
                            if (window.myBettingHistory.length > 20) window.myBettingHistory.pop();
                        } else {
                            const lossAmount = window.myBaseBetAmount;
                            console.log('SOCKET (FixedBet): THUA! Cược ' + window.myBaseBetAmount.toLocaleString() + 'đ (EID ' + window.myLastBetEid + ') thất bại.');
                            
                            // Update statistics
                            window.myTotalLosses++;
                            window.myTotalLossAmount += lossAmount;
                            window.myCurrentLossStreak++;
                            window.myCurrentWinStreak = 0;
                            if (window.myCurrentLossStreak > window.myMaxLossStreak) {
                                window.myMaxLossStreak = window.myCurrentLossStreak;
                            }
                            
                            // Add to history
                            window.myBettingHistory.unshift({
                                time: new Date().toLocaleTimeString(),
                                eid: window.myLastBetEid,
                                amount: lossAmount,
                                result: 'loss',
                                balance: window.myCurrentBalance
                            });
                            if (window.myBettingHistory.length > 20) window.myBettingHistory.pop();
                        }
                        console.log('SOCKET (Stats): Tổng cược: ' + window.myTotalBetsPlaced + ' | Thắng: ' + window.myTotalWins + ' | Thua: ' + window.myTotalLosses);
                        console.log('SOCKET (Advanced Stats): Thắng liên tiếp: ' + window.myCurrentWinStreak + ' | Thua liên tiếp: ' + window.myCurrentLossStreak + ' | Tổng thắng: ' + window.myTotalWinAmount.toLocaleString() + 'đ | Tổng thua: ' + window.myTotalLossAmount.toLocaleString() + 'đ');
                        window.myLastBetEid = null;
                    }
                    
                    // --- BƯỚC 2B: XỬ LÝ LOGIC "THĂNG CẤP TỨC THÌ" (ĐÃ SỬA LỖI ÂM) ---
                    if (currentWinningEid) { // Vòng này ra 2 hoặc 5
                        if (window.myCurrentStreakType === currentWinningEid) {
                            // CHUỖI TIẾP TỤC!
                            window.myCurrentStreakCount++;
                            console.log('SOCKET (Streak): Chuỗi ' + currentWinningEid + ' tiếp tục! Độ dài mới: ' + window.myCurrentStreakCount);
                    
                            // *** LOGIC THĂNG CẤP (ĐÃ SỬA) ***
                            if (window.myCurrentStreakCount === 2) {
                                window.mySetCount_L2++;
                                console.log('SOCKET (Bank): +1 Bộ 2. Tổng: ' + window.mySetCount_L2);
                            } else if (window.myCurrentStreakCount === 3) {
                                if (window.mySetCount_L2 > 0) { window.mySetCount_L2--; }
                                window.mySetCount_L3++;
                                console.log('SOCKET (Bank): Thăng cấp lên L3. Tổng Bộ 3: ' + window.mySetCount_L3);
                            } else if (window.myCurrentStreakCount === 4) {
                                if (window.mySetCount_L3 > 0) { window.mySetCount_L3--; }
                                window.mySetCount_L4++;
                                console.log('SOCKET (Bank): Thăng cấp lên L4. Tổng Bộ 4: ' + window.mySetCount_L4);
                            } else if (window.myCurrentStreakCount === 5) {
                                if (window.mySetCount_L4 > 0) { window.mySetCount_L4--; }
                                window.mySetCount_L5++;
                                console.log('SOCKET (Bank): Thăng cấp lên L5. Tổng Bộ 5: ' + window.mySetCount_L5);
                            } else if (window.myCurrentStreakCount === 6) {
                                if (window.mySetCount_L5 > 0) { window.mySetCount_L5--; }
                                window.mySetCount_L6++;
                                console.log('SOCKET (Bank): Thăng cấp lên L6. Tổng Bộ 6: ' + window.mySetCount_L6);
                            }
                            // Ghi lại loại chuỗi để cược ngược
                            window.myLastBankedStreakType = window.myCurrentStreakType;
                    
                        } else {
                            // BẮT ĐẦU CHUỖI MỚI (hoặc ngắt chuỗi cũ)
                            console.log('SOCKET (Streak): Chuỗi bị ngắt, bắt đầu chuỗi mới! EID: ' + currentWinningEid);
                            window.myCurrentStreakType = currentWinningEid;
                            window.myCurrentStreakCount = 1; // Bắt đầu đếm từ 1
                        }
                    } else {
                        // Vòng này không ra 2 hoặc 5 -> CHUỖI BỊ NGẮT
                        if (window.myCurrentStreakType !== null) {
                            console.log('SOCKET (Streak): Vòng này không phải 2/5. Chuỗi ' + window.myCurrentStreakType + ' bị ngắt.');
                            window.myCurrentStreakType = null;
                            window.myCurrentStreakCount = 0;
                        }
                    }
                   
                    // In ra trạng thái "ngân hàng"
                    console.log('SOCKET (Bank Status): Bộ 2: ' + window.mySetCount_L2 + ' | Bộ 3: ' + window.mySetCount_L3 + ' | Bộ 4: ' + window.mySetCount_L4 + ' | Bộ 5: ' + window.mySetCount_L5 + ' | Bộ 6: ' + window.mySetCount_L6);
                    
                    // ĐẾM VÁN ĐỂ CƯỢC ĐỊNH KỲ
                    window.myRoundCounter++;
                    
                    // --- BƯỚC 2C: KIỂM TRA ĐIỀU KIỆN CƯỢC (NẾU KHÔNG ĐANG CHỜ KẾT QUẢ) ---
                    if (!window.isWaitingForResult && !window.isWaitingForFixedBet) {
                        let betPlaced = false;
                        let betReason = "";
                        let betTriggerLevel = 0; // Để biết reset bộ nào
                    
                        // Kiểm tra từ cao xuống thấp (LOGIC CƯỢC STREAK)
                        if (window.mySetCount_L6 >= 1) {
                            betPlaced = true;
                            betReason = "ĐẠT 1 BỘ 6!";
                            betTriggerLevel = 6;
                        } else if (window.mySetCount_L5 >= 2) {
                            betPlaced = true;
                            betReason = "ĐẠT 2 BỘ 5!";
                            betTriggerLevel = 5;
                        } else if (window.mySetCount_L4 >= 2) {
                            betPlaced = true;
                            betReason = "ĐẠT 2 BỘ 4!";
                            betTriggerLevel = 4;
                        } else if (window.mySetCount_L3 >= 3) {
                            betPlaced = true;
                            betReason = "ĐẠT 3 BỘ 3!";
                            betTriggerLevel = 3;
                        } else if (window.mySetCount_L2 >= 3) {
                            betPlaced = true;
                            betReason = "ĐẠT 3 BỘ 2!";
                            betTriggerLevel = 2;
                        }
                       
                        // 4. Thực thi lệnh cược nếu đủ điều kiện
                        if (betPlaced) {
                            // --- LOGIC CƯỢC GẤP THẾP (STREAK) - (ƯU TIÊN SỐ 1) ---
                            
                            // Reset bộ đếm tương ứng NGAY LẬP TỨC
                            if (betTriggerLevel === 2) window.mySetCount_L2 = 0;
                            else if (betTriggerLevel === 3) window.mySetCount_L3 = 0;
                            else if (betTriggerLevel === 4) window.mySetCount_L4 = 0;
                            else if (betTriggerLevel === 5) window.mySetCount_L5 = 0;
                            else if (betTriggerLevel === 6) window.mySetCount_L6 = 0;
                            console.log('SOCKET (Bank): Đã reset Bộ ' + betTriggerLevel + ' về 0.');
                            
                            // <-- THAY ĐỔI QUAN TRỌNG: Reset bộ đếm 4 ván vì cược này được ưu tiên
                            window.myRoundCounter = 0; 
                            console.log('SOCKET (FixedBet): Cược Streak được ưu tiên, reset bộ đếm 4 ván.');
                            
                            // Xác định EID cược ngược
                            let eidToBet = 2; // Mặc định cược 2
                            if (window.myLastBankedStreakType === 2) {
                                eidToBet = 5; // Chuỗi thăng cấp cuối là 2 -> cược 5
                            } else if (window.myLastBankedStreakType === 5) {
                                eidToBet = 2; // Chuỗi thăng cấp cuối là 5 -> cược 2
                            }
                            window.myLastBankedStreakType = null; // Xóa loại chuỗi đã bank
                    
                            // Lấy số tiền cược hiện tại (đã xử lý Martingale)
                            const amountToBet = window.myCurrentBetAmount;
                    
                            console.log('SOCKET (Auto-Trigger): ' + betReason + ' Kích hoạt cược!');
                            console.log('SOCKET (Auto-Trigger): Cược EID: ' + eidToBet + ' | Số tiền: ' + amountToBet.toLocaleString() + 'đ (Gấp thếp)');
                    
                            // Đặt cờ chờ kết quả GẤP THẾP
                            window.isWaitingForResult = true;
                            window.myLastBetEid = eidToBet; // Lưu lại EID đã cược
                            window.myTotalBetsPlaced++; // Tăng số lượng cược
                           
                            // Đợi 15 giây
                            setTimeout(() => {
                                const ridToSend = window.myBestRid || 6476537;
                                const messageArray = [5, "Simms", ridToSend, {"cmd": 900, "eid": eidToBet, "v": amountToBet}];
                                const messageString = JSON.stringify(messageArray);
                           
                                if (window.myLastUsedSocket && window.myLastUsedSocket.readyState === WebSocket.OPEN) {
                                    console.log('SOCKET (Auto-Send-Martingale): Đang gửi ⬆️', messageString);
                                    window.myLastUsedSocket.send(messageString);
                                } else {
                                    console.error('SOCKET (Auto-Send-Martingale): Không thể gửi tin nhắn. Socket đã bị đóng.');
                                    window.isWaitingForResult = false; // Hủy cược nếu socket đóng
                                    window.myLastBetEid = null;
                                }
                            }, 15000); // 15000ms = 15 giây
                        
                        } else if (window.myRoundCounter >= 4) {
                            // --- LOGIC CƯỢC 4 VÁN (ƯU TIÊN SỐ 2) ---
                            // Chỉ chạy nếu cược streak KHÔNG xảy ra
                            console.log('SOCKET (Auto-Trigger): ĐỦ 4 VÁN (không cược streak)! Kích hoạt cược ' + window.myBaseBetAmount.toLocaleString() + 'đ.');
                            
                            window.myRoundCounter = 0; // Reset bộ đếm ván
                            const amountToBet = window.myBaseBetAmount; // Lấy từ biến global (từ form)
                            const eidToBet = 2; // Cược mặc định EID 2 (bạn có thể đổi thành 5 nếu muốn)
                            
                            console.log('SOCKET (Auto-Trigger): Cược EID: ' + eidToBet + ' | Số tiền: ' + amountToBet.toLocaleString() + 'đ (Cố định)');
                            
                            // Đặt cờ chờ kết quả CỐ ĐỊNH (không ảnh hưởng Martingale)
                            window.isWaitingForFixedBet = true; // <-- Cờ riêng
                            window.myLastBetEid = eidToBet; // Lưu lại EID đã cược
                            window.myTotalBetsPlaced++; // Tăng số lượng cược
                            
                            // Gửi cược
                            setTimeout(() => {
                                const ridToSend = window.myBestRid || 6476537;
                                const messageArray = [5, "Simms", ridToSend, {"cmd": 900, "eid": eidToBet, "v": amountToBet}];
                                const messageString = JSON.stringify(messageArray);
                            
                                if (window.myLastUsedSocket && window.myLastUsedSocket.readyState === WebSocket.OPEN) {
                                    console.log('SOCKET (Auto-Send-Fixed): Đang gửi ⬆️', messageString);
                                    window.myLastUsedSocket.send(messageString);
                                } else {
                                    console.error('SOCKET (Auto-Send-Fixed): Không thể gửi tin nhắn. Socket đã bị đóng.');
                                    window.isWaitingForFixedBet = false; // Hủy cược nếu socket đóng
                                    window.myLastBetEid = null;
                                }
                            }, 15000); // 15000ms = 15 giây
                        
                        } else {
                            // Không cược streak, cũng chưa đủ 4 ván
                            console.log('SOCKET (Auto-Trigger): Chưa đủ điều kiện cược (Streak: Thất bại, Ván: ' + window.myRoundCounter + '/4).');
                        }
                           
                    } else {
                        console.log('SOCKET (Auto-Trigger): Đang chờ kết quả cược trước, tạm dừng check cược mới.');
                    }
                }
            }
                   
            if (originalCallback) {
                originalCallback.apply(this, arguments);
            }
        };
        this.addEventListener('message', newCallback, false);
    }
});
  `;
    
    // Setup console listener to forward browser logs to Node.js
    page.on('console', async (msg) => {
      const text = msg.text();
      
      // Chỉ forward logs từ SOCKET (hookScript)
      if (text.includes('SOCKET')) {
        const type = msg.type();
        
        // Format log với màu sắc
        if (type === 'error') {
          logger && logger.error && logger.error(`🔴 [Browser] ${text}`);
        } else if (type === 'warning') {
          logger && logger.warn && logger.warn(`🟡 [Browser] ${text}`);
        } else {
          logger && logger.log && logger.log(`🔵 [Browser] ${text}`);
        }
        
        // Parse và extract statistics từ logs
        const stats = parseLogForStats(text);
        
        // Broadcast to web UI if available
        if (global.broadcastToClients) {
          // Broadcast log message
          global.broadcastToClients({
            type: 'browser-log',
            logType: type,
            message: text,
            timestamp: new Date().toISOString()
          });
          
          // Broadcast parsed statistics if available
          if (stats) {
            global.broadcastToClients({
              type: 'real-time-stats',
              stats: stats,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    });
    
    // Helper function to parse logs and extract statistics
    function parseLogForStats(logText) {
      const stats = {};
      
      // Parse Bank Status: "SOCKET (Bank Status): Bộ 2: 1 | Bộ 3: 0 | Bộ 4: 0 | Bộ 5: 0 | Bộ 6: 0"
      const bankMatch = logText.match(/Bank Status.*Bộ 2: (\d+).*Bộ 3: (\d+).*Bộ 4: (\d+).*Bộ 5: (\d+).*Bộ 6: (\d+)/);
      if (bankMatch) {
        stats.bankStatus = {
          L2: parseInt(bankMatch[1]),
          L3: parseInt(bankMatch[2]),
          L4: parseInt(bankMatch[3]),
          L5: parseInt(bankMatch[4]),
          L6: parseInt(bankMatch[5])
        };
      }
      
      // Parse Streak: "SOCKET (Streak): Chuỗi 2 tiếp tục! Độ dài mới: 3"
      const streakMatch = logText.match(/Chuỗi (\d+) tiếp tục.*Độ dài mới: (\d+)/);
      if (streakMatch) {
        stats.currentStreak = {
          type: parseInt(streakMatch[1]),
          length: parseInt(streakMatch[2])
        };
      }
      
      // Parse New Streak: "SOCKET (Streak): Chuỗi bị ngắt, bắt đầu chuỗi mới! EID: 2"
      const newStreakMatch = logText.match(/bắt đầu chuỗi mới.*EID: (\d+)/);
      if (newStreakMatch) {
        stats.currentStreak = {
          type: parseInt(newStreakMatch[1]),
          length: 1
        };
      }
      
      // Parse Betting Info: "SOCKET (Auto-Trigger): Cược EID: 2 | Số tiền: 1000 (Gấp thếp)"
      const betMatch = logText.match(/Cược EID: (\d+).*Số tiền: (\d+)/);
      if (betMatch) {
        stats.lastBet = {
          eid: parseInt(betMatch[1]),
          amount: parseInt(betMatch[2])
        };
      }
      
      // Parse Round Result: "SOCKET (Event): Kết quả vòng này là EID: 2"
      const resultMatch = logText.match(/Kết quả vòng này là EID: (\d+|Khác)/);
      if (resultMatch) {
        const eid = resultMatch[1];
        stats.lastResult = eid === 'Khác' ? null : parseInt(eid);
      }
      
      // Parse Win/Loss: "SOCKET (Martingale): THẮNG!" or "SOCKET (Martingale): THUA!"
      if (logText.includes('THẮNG')) {
        stats.lastOutcome = 'win';
      } else if (logText.includes('THUA')) {
        stats.lastOutcome = 'loss';
      }
      
      // Parse Current Bet Amount: "SOCKET (Martingale): Số tiền cược cho lần tới là: 2000"
      const nextBetMatch = logText.match(/Số tiền cược cho lần tới là: (\d+)/);
      if (nextBetMatch) {
        stats.nextBetAmount = parseInt(nextBetMatch[1]);
      }
      
      // Parse Round Counter: "SOCKET (Auto-Trigger): Chưa đủ điều kiện cược (Streak: Thất bại, Ván: 2/4)"
      const roundMatch = logText.match(/Ván: (\d+)\/4/);
      if (roundMatch) {
        stats.roundCounter = parseInt(roundMatch[1]);
      }
      
      // Parse Balance: "SOCKET (Balance Update): Số tiền hiện tại: 1000đ"
      const balanceMatch = logText.match(/Số tiền hiện tại: ([\d,]+)đ/);
      if (balanceMatch) {
        const balanceStr = balanceMatch[1].replace(/,/g, '');
        stats.currentBalance = parseInt(balanceStr);
      }
      
      // Parse Stats: "SOCKET (Stats): Tổng cược: 5 | Thắng: 3 | Thua: 2"
      const statsMatch = logText.match(/Tổng cược: (\d+).*Thắng: (\d+).*Thua: (\d+)/);
      if (statsMatch) {
        stats.totalBetsPlaced = parseInt(statsMatch[1]);
        stats.totalWins = parseInt(statsMatch[2]);
        stats.totalLosses = parseInt(statsMatch[3]);
      }
      
      // Parse Advanced Stats: "SOCKET (Advanced Stats): Thắng liên tiếp: 2 | Thua liên tiếp: 0 | Tổng thắng: 1500đ | Tổng thua: 500đ"
      const advancedMatch = logText.match(/Thắng liên tiếp: (\d+).*Thua liên tiếp: (\d+).*Tổng thắng: ([\d,]+)đ.*Tổng thua: ([\d,]+)đ/);
      if (advancedMatch) {
        stats.currentWinStreak = parseInt(advancedMatch[1]);
        stats.currentLossStreak = parseInt(advancedMatch[2]);
        stats.totalWinAmount = parseInt(advancedMatch[3].replace(/,/g, ''));
        stats.totalLossAmount = parseInt(advancedMatch[4].replace(/,/g, ''));
      }
      
      // Parse Win/Loss amounts from individual messages
      const winAmountMatch = logText.match(/Số tiền thắng: ([\d,]+)đ/);
      if (winAmountMatch) {
        stats.lastWinAmount = parseInt(winAmountMatch[1].replace(/,/g, ''));
      }
      
      const lossAmountMatch = logText.match(/Số tiền thua: ([\d,]+)đ/);
      if (lossAmountMatch) {
        stats.lastLossAmount = parseInt(lossAmountMatch[1].replace(/,/g, ''));
      }
      
      // Return stats only if we parsed something
      return Object.keys(stats).length > 0 ? stats : null;
    }
    
    // Inject the hook script before any page loads
    await page.evaluateOnNewDocument(hookScript);
    
    // Expose broadcast function to browser context
    await page.exposeFunction('broadcastWebSocketMessage', (direction, message) => {
      if (global.broadcastToClients) {
        global.broadcastToClients({
          type: direction === 'sent' ? 'websocket-sent' : 'websocket-received',
          message: message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    logger && logger.log && logger.log('✓ WebSocket hook script injected successfully');
    logger && logger.log && logger.log('✓ Browser console logs will be forwarded to Node.js');
    logger && logger.log && logger.log('✓ Hook will activate when WebSocket is created');
    
    // Setup additional listener for WebSocket messages
    const sendScript = `
      // Setup listener for messages from server
      if (window.myLastUsedSocket) {
        window.myLastUsedSocket.onmessage = (event) => {
          // console.log('📬 Nhận được tin nhắn từ server: ', event.data);
        };
        // console.log('--- ✅ HOÀN TẤT HOOK ---');
      }
    `;
    
    // Wait a bit for the page to load and WebSocket to be created
    await page.waitForTimeout(5000);
    
    // Execute the send script
    await page.evaluate(sendScript);
    
    logger && logger.log && logger.log('✓ Send script executed');
    
    logger && logger.log && logger.log('\n========================================');
    logger && logger.log && logger.log('   WEBSOCKET HOOK SETUP - COMPLETED');
    logger && logger.log && logger.log('========================================\n');
    
    return true;
    
  } catch (error) {
    logger && logger.error && logger.error('!!! LỖI KHI SETUP WEBSOCKET HOOK !!!');
    logger && logger.error && logger.error('Error:', error.message);
    throw error;
  }
}

/**
 * Listen for WebSocket creation events using CDP (Chrome DevTools Protocol)
 * @param {Page} page - Puppeteer page object
 * @param {Object} logger - Logger object
 */
async function listenForWebSocketCreation(page, logger) {
  try {
    // Get CDP session
    const client = await page.target().createCDPSession();
    
    // Enable network events
    await client.send('Network.enable');
    
    logger && logger.log && logger.log('✓ Network monitoring enabled via CDP');
    
    // Listen for WebSocket creation
    client.on('Network.webSocketCreated', (params) => {
logger && logger.log && logger.log(`⚡ WEBSOCKET CREATED: ${params.url}`);
logger && logger.log && logger.log(`   Request ID: ${params.requestId}`);
      
      // Broadcast to monitoring UI
      if (global.broadcastToClients) {
        global.broadcastToClients({
          type: 'websocket-created',
          url: params.url,
          requestId: params.requestId,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Listen for WebSocket frames (messages)
    client.on('Network.webSocketFrameSent', (params) => {
      // logger && logger.log && logger.log('⬆️ WebSocket SENT: ${params.response.payloadData}');
      // Bỏ qua log để tránh spam
    });
    
    client.on('Network.webSocketFrameReceived', (params) => {
      // logger && logger.log && logger.log('⬇️ WebSocket RECEIVED: ${params.response.payloadData}');
      // Bỏ qua log để tránh spam
    });
    
    logger && logger.log && logger.log('✓ WebSocket event listeners registered');
    
    return client;
    
  } catch (error) {
    logger && logger.error && logger.error('Error setting up WebSocket listeners:', error.message);
    return null;
  }
}

/**
 * Manually send a message through the hooked WebSocket
 * @param {Page} page - Puppeteer page object
 * @param {string|Object} message - Message to send (string or object)
 * @param {Object} logger - Logger object
 */
async function sendWebSocketMessage(page, message, logger) {
  try {
    const messageString = typeof message === 'string' ? message : JSON.stringify(message);
    
    const result = await page.evaluate((msg) => {
      if (window.myLastUsedSocket && window.myLastUsedSocket.readyState === WebSocket.OPEN) {
        // console.log('%cManual Send: Đang gửi ⬆️', 'color: purple; font-weight: bold;', msg);
        window.myLastUsedSocket.send(msg);
        return { success: true, message: 'Message sent successfully' };
      } else {
        return { success: false, message: 'Socket not available or not open' };
      }
    }, messageString);
    
    if (result.success) {
      logger && logger.log && logger.log('✓ Message sent: ${messageString}');
    } else {
      logger && logger.warn && logger.warn('⚠️ Could not send message: ${result.message}');
    }
    
    return result;
    
  } catch (error) {
    logger && logger.error && logger.error('Error sending WebSocket message:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Get current WebSocket state
 * @param {Page} page - Puppeteer page object
 * @param {Object} logger - Logger object
 */
async function getWebSocketState(page, logger) {
  try {
    const state = await page.evaluate(() => {
      if (window.myLastUsedSocket) {
        return {
          exists: true,
          readyState: window.myLastUsedSocket.readyState,
          readyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][window.myLastUsedSocket.readyState],
          url: window.myLastUsedSocket.url,
          bestRid: window.myBestRid
        };
      } else {
        return {
          exists: false,
          message: 'WebSocket not yet created'
        };
      }
    });
    
    logger && logger.log && logger.log('WebSocket State:', JSON.stringify(state, null, 2));
    
    return state;
    
  } catch (error) {
    logger && logger.error && logger.error('Error getting WebSocket state:', error.message);
    return null;
  }
}

module.exports = {
  setupWebSocketHook,
  listenForWebSocketCreation,
  sendWebSocketMessage,
  getWebSocketState
};