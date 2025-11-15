/**
 * WebSocket Hook Logic - Puppeteer Implementation
 * Tương đương với logic WebSocket hook trong Java Selenium
 */

/**
 * Setup WebSocket hook to intercept and auto-send messages
 * @param {Page} page - Puppeteer page object
 * @param {Object} logger - Logger object
 * @param {Object} options - Options object containing baseBet, sessionId, showStatsOnScreen
 */
async function setupWebSocketHook(page, logger, options = {}) {
  try {
    // Lấy baseBet, sessionId và showStatsOnScreen từ options
    const baseBet = options.baseBet || 500;
    const sessionId = options.sessionId || 'default-session';
    const showStatsOnScreen = options.showStatsOnScreen !== false; // Default true
    
    logger && logger.log && logger.log('\n========================================');
    logger && logger.log && logger.log('   WEBSOCKET HOOK SETUP - START');
    logger && logger.log && logger.log(`   Session ID: ${sessionId}`);
    logger && logger.log && logger.log(`   Base Bet Amount: ${baseBet}`);
    logger && logger.log && logger.log(`   Show Stats On Screen: ${showStatsOnScreen}`);
    logger && logger.log && logger.log('========================================\n');

    // Define the hook script (with session isolation)
        const hookScript = `
    // SESSION ISOLATION - Mỗi session có namespace riêng
    (function() {
      const SESSION_ID = '${sessionId}';
      const SHOW_STATS_ON_SCREEN = ${showStatsOnScreen};
      
      // Khởi tạo namespace cho session này nếu chưa có
      if (!window.__SESSIONS__) {
        window.__SESSIONS__ = {};
      }
      
      if (!window.__SESSIONS__[SESSION_ID]) {
        window.__SESSIONS__[SESSION_ID] = {};
      }
      
      const session = window.__SESSIONS__[SESSION_ID];
      
      // Helper function để log có điều kiện
      const logStats = function(...args) {
        if (SHOW_STATS_ON_SCREEN) {
          console.log(...args);
        }
      };
      
      // 1. CHỈ ĐỊNH URL MỤC TIÊU CỦA BẠN TẠI ĐÂY
      const targetUrl = "wss://carkgwaiz.hytsocesk.com/websocket";
      logStats('[Session ' + SESSION_ID + '] Đang "hook" vào WebSocket. Chỉ theo dõi URL chứa: ' + targetUrl);
                   
// Biến toàn cục để lưu ID phòng tốt nhất (ISOLATED BY SESSION)
session.myBestRid = null;
                    
// --- BIẾN MỚI ĐỂ THEO DÕI LOGIC "CHUỖI" (STREAK) ---
session.myCurrentStreakType = null;
session.myCurrentStreakCount = 0;
                    
// Biến "ngân hàng" (bank)
session.mySetCount_L2 = 0;
session.mySetCount_L3 = 0;
session.mySetCount_L4 = 0;
session.mySetCount_L5 = 0;
session.mySetCount_L6 = 0;
                    
// --- BIẾN CƯỢC (MARTINGALE) ---
session.myBaseBetAmount = ${baseBet};
session.myCurrentBetAmount = session.myBaseBetAmount;
session.myLastBetEid = null;
session.isWaitingForResult = false;
session.myLastBankedStreakType = null;

// --- BIẾN CƯỢC 4 VÁN ---
session.myRoundCounter = 0;
session.isWaitingForFixedBet = false;

// --- BIẾN THEO DÕI SỐ TIỀN ---
session.myCurrentBalance = 0;
session.myInitialBalance = 0; // Số dư ban đầu (lần đầu tiên > 0)
session.myPreviousBalance = 0; // Lưu số dư trước đó để tính thay đổi
session.myTotalBetsPlaced = 0;
session.myTotalWins = 0;
session.myTotalLosses = 0;

// --- THỐNG KÊ NÂNG CAO ---
session.myTotalWinAmount = 0;
session.myTotalLossAmount = 0;
session.myCurrentWinStreak = 0;
session.myCurrentLossStreak = 0;
session.myMaxWinStreak = 0;
session.myMaxLossStreak = 0;
session.myHighestBet = 0; // Bắt đầu từ 0, sẽ cập nhật khi có cược
                    
console.log('[Session ' + SESSION_ID + '] SOCKET (Logic): Khởi tạo. Cược cơ bản: ' + session.myBaseBetAmount);

// Broadcast initial stats
console.log('[BETTING_STATS]' + JSON.stringify({
    currentBalance: session.myCurrentBalance,
    totalBets: session.myTotalBetsPlaced,
    winCount: session.myTotalWins,
    lossCount: session.myTotalLosses,
    highestBet: session.myHighestBet,
    lastBet: null,
    lastOutcome: null
}));

// ---------------------------------------------------
                    
// 2. Hook vào hàm 'send'
if (!window.OriginalWebSocketSend) {
    window.OriginalWebSocketSend = WebSocket.prototype.send;
}
WebSocket.prototype.send = function(data) { 
    if (this.url === targetUrl) {
        session.myLastUsedSocket = this;
    }
    window.OriginalWebSocketSend.apply(this, arguments);
};
                   
// 3. Hook vào hàm 'onmessage' (LOGIC CHÍNH)
Object.defineProperty(WebSocket.prototype, 'onmessage', {
    set: function(originalCallback) {
        const newCallback = function(event) {
            if (this.url === targetUrl) {
                session.myLastUsedSocket = this;
                   
                const receivedData = event.data;
                let parsedData;
                let command;
                let currentWinningEid = null; // Sẽ là 2, 5, hoặc null
                   
                try {
                    parsedData = JSON.parse(receivedData);
                    if (Array.isArray(parsedData) && parsedData[1]) {
                        command = parsedData[1].cmd; // Lấy command
                       
                        // Track số dư hiện tại CHỈ từ parsedData[1].m
                        if (parsedData[1].m !== undefined && parsedData[1].m !== null) {
                            // Lưu số dư ban đầu (lần đầu tiên > 0)
                            if (session.myInitialBalance === 0 && parsedData[1].m > 0) {
                                // Số dư ban đầu = Số dư nhận được + Số tiền cược gần nhất (nếu có)
                                // Vì khi nhận số dư lần đầu, có thể đang có cược chờ kết quả (tiền đã trừ)
                                const betAmount = session.myCurrentBetAmount || 0;
                                session.myInitialBalance = parsedData[1].m ;
                                logStats('SOCKET (Balance Init): Số dư hiện tại: ' + parsedData[1].m.toLocaleString('vi-VN') + 'đ: ' + betAmount.toLocaleString('vi-VN') + 'đ = Số dư ban đầu: ' + session.myInitialBalance.toLocaleString('vi-VN') + 'đ');
                            }
                            
                            // Lưu số dư trước đó
                            if (session.myCurrentBalance !== 0) {
                                session.myPreviousBalance = session.myCurrentBalance;
                            }
                            
                            // Cập nhật số dư mới
                            session.myCurrentBalance = parsedData[1].m;

                            // Tính lãi/lỗ dựa vào số dư ban đầu
                            if (session.myInitialBalance > 0) {
                                const profitLoss = session.myCurrentBalance - session.myInitialBalance;
                                const profitLossText = profitLoss >= 0 ? '+' + profitLoss.toLocaleString('vi-VN') : profitLoss.toLocaleString('vi-VN');
                                logStats('SOCKET (Balance Update): Số dư hiện tại: ' + session.myCurrentBalance.toLocaleString('vi-VN') + 'đ | Lãi/Lỗ: ' + profitLossText + 'đ');
                            } else {
                                logStats('SOCKET (Balance Update): Số dư hiện tại: ' + session.myCurrentBalance.toLocaleString('vi-VN') + 'đ');
                            }
                            
                            // Broadcast balance update to client
                            console.log('[BETTING_STATS]' + JSON.stringify({
                                currentBalance: session.myCurrentBalance,
                                initialBalance: session.myInitialBalance,
                                profitLoss: session.myCurrentBalance - session.myInitialBalance,
                                totalBets: session.myTotalBetsPlaced,
                                winCount: session.myTotalWins,
                                lossCount: session.myTotalLosses,
                                highestBet: session.myHighestBet,
                                totalWinAmount: session.myTotalWinAmount,
                                totalLossAmount: session.myTotalLossAmount,
                                currentWinStreak: session.myCurrentWinStreak,
                                currentLossStreak: session.myCurrentLossStreak,
                                maxWinStreak: session.myMaxWinStreak,
                                maxLossStreak: session.myMaxLossStreak,
                                lastBet: null,
                                lastOutcome: null
                            }));
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
                            logStats('SOCKET (Event): Kết quả vòng này là EID: ' + (currentWinningEid || 'Khác'));
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
                            session.myBestRid = bestRoom.rid;
                            logStats('SOCKET (Auto-Find): Đã cập nhật phòng tốt nhất. RID: ' + session.myBestRid);
                        }
                    }
                }
                   
                // --- LOGIC 2: XỬ LÝ KẾT QUẢ VÒNG (cmd: 907) ---
                if (command === 907) {
                   
                    // --- BƯỚC 2A: KIỂM TRA THẮNG/THUA (NẾU ĐANG CHỜ KẾT QUẢ) ---
                    if (window.isWaitingForResult) {
                        window.isWaitingForResult = false; // Đã nhận kết quả
                       
                        if (currentWinningEid === session.myLastBetEid) {
                            // THẮNG! (GẤP THẾP)
                            // Lợi nhuận = Số dư hiện tại - Số dư ban đầu (tính từ lúc bắt đầu)
                            const profitLoss = session.myInitialBalance > 0 ? (session.myCurrentBalance - session.myInitialBalance) : 0;
                            const balanceChange = session.myCurrentBalance - session.myPreviousBalance;
                            const winAmount = balanceChange > 0 ? balanceChange : (session.myCurrentBetAmount * 0.95);
                            
                            logStats('SOCKET (Martingale): THẮNG! Đặt cược EID ' + session.myLastBetEid + ' thành công. Cược: ' + session.myCurrentBetAmount.toLocaleString('vi-VN') + 'đ | Lãi vòng này: +' + winAmount.toLocaleString('vi-VN') + 'đ | Tổng lãi/lỗ: ' + (profitLoss >= 0 ? '+' : '') + profitLoss.toLocaleString('vi-VN') + 'đ');
                            
                            // Update statistics
                            session.myTotalWins++;
                            session.myTotalWinAmount += winAmount;
                            session.myCurrentWinStreak++;
                            session.myCurrentLossStreak = 0;
                            if (session.myCurrentWinStreak > session.myMaxWinStreak) {
                                session.myMaxWinStreak = session.myCurrentWinStreak;
                            }
                            
                            // Broadcast betting stats update
                            console.log('[BETTING_STATS]' + JSON.stringify({
                                currentBalance: session.myCurrentBalance,
                                initialBalance: session.myInitialBalance,
                                profitLoss: profitLoss,
                                totalBets: session.myTotalBetsPlaced,
                                winCount: session.myTotalWins,
                                lossCount: session.myTotalLosses,
                                highestBet: session.myHighestBet,
                                totalWinAmount: session.myTotalWinAmount,
                                totalLossAmount: session.myTotalLossAmount,
                                currentWinStreak: session.myCurrentWinStreak,
                                currentLossStreak: session.myCurrentLossStreak,
                                maxWinStreak: session.myMaxWinStreak,
                                maxLossStreak: session.myMaxLossStreak,
                                lastBet: {
                                    eid: session.myLastBetEid,
                                    amount: session.myCurrentBetAmount,
                                    winAmount: winAmount
                                },
                                lastOutcome: 'win'
                            }));
                            
                            session.myCurrentBetAmount = session.myBaseBetAmount; // Reset tiền cược
                        } else {
                            // THUA! (GẤP THẾP)
                            // Lợi nhuận = Số dư hiện tại - Số dư ban đầu (tính từ lúc bắt đầu)
                            const profitLoss = session.myInitialBalance > 0 ? (session.myCurrentBalance - session.myInitialBalance) : 0;
                            const balanceChange = session.myPreviousBalance - session.myCurrentBalance;
                            const lossAmount = balanceChange > 0 ? balanceChange : session.myCurrentBetAmount;
                            
                            logStats('SOCKET (Martingale): THUA! Cược ' + session.myLastBetEid + ' nhưng kết quả là ' + (currentWinningEid || 'Khác') + '. Cược: ' + session.myCurrentBetAmount.toLocaleString('vi-VN') + 'đ | Lỗ vòng này: -' + lossAmount.toLocaleString('vi-VN') + 'đ | Tổng lãi/lỗ: ' + (profitLoss >= 0 ? '+' : '') + profitLoss.toLocaleString('vi-VN') + 'đ');
                            
                            // Update statistics
                            session.myTotalLosses++;
                            session.myTotalLossAmount += lossAmount;
                            session.myCurrentLossStreak++;
                            session.myCurrentWinStreak = 0;
                            if (session.myCurrentLossStreak > session.myMaxLossStreak) {
                                session.myMaxLossStreak = session.myCurrentLossStreak;
                            }
                            
                            // Broadcast betting stats update
                            console.log('[BETTING_STATS]' + JSON.stringify({
                                currentBalance: session.myCurrentBalance,
                                initialBalance: session.myInitialBalance,
                                profitLoss: profitLoss,
                                totalBets: session.myTotalBetsPlaced,
                                winCount: session.myTotalWins,
                                lossCount: session.myTotalLosses,
                                highestBet: session.myHighestBet,
                                totalWinAmount: session.myTotalWinAmount,
                                totalLossAmount: session.myTotalLossAmount,
                                currentWinStreak: session.myCurrentWinStreak,
                                currentLossStreak: session.myCurrentLossStreak,
                                maxWinStreak: session.myMaxWinStreak,
                                maxLossStreak: session.myMaxLossStreak,
                                lastBet: {
                                    eid: session.myLastBetEid,
                                    amount: session.myCurrentBetAmount,
                                    lossAmount: lossAmount
                                },
                                lastOutcome: 'loss'
                            }));
                            
                            session.myCurrentBetAmount *= 2; // Gấp đôi tiền cược cho LẦN SAU
                            
                            // Track highest bet
                            if (session.myCurrentBetAmount > session.myHighestBet) {
                                session.myHighestBet = session.myCurrentBetAmount;
                            }
                        }
                        logStats('SOCKET (Martingale): Số tiền cược cho lần tới là: ' + session.myCurrentBetAmount.toLocaleString('vi-VN') + 'đ');
                        logStats('SOCKET (Stats): Tổng cược: ' + session.myTotalBetsPlaced + ' | Thắng: ' + session.myTotalWins + ' | Thua: ' + session.myTotalLosses);
                        logStats('SOCKET (Advanced Stats): Thắng liên tiếp: ' + session.myCurrentWinStreak + ' | Thua liên tiếp: ' + session.myCurrentLossStreak + ' | Tổng thắng: ' + session.myTotalWinAmount.toLocaleString('vi-VN') + 'đ | Tổng thua: ' + session.myTotalLossAmount.toLocaleString('vi-VN') + 'đ');
                        session.myLastBetEid = null;
                    
                    } else if (window.isWaitingForFixedBet) {
                        window.isWaitingForFixedBet = false; // Đã nhận kết quả
                        if (currentWinningEid === session.myLastBetEid) {
                            // THẮNG! (FixedBet)
                            // Lợi nhuận = Số dư hiện tại - Số dư ban đầu (tính từ lúc bắt đầu)
                            const profitLoss = session.myInitialBalance > 0 ? (session.myCurrentBalance - session.myInitialBalance) : 0;
                            const balanceChange = session.myCurrentBalance - session.myPreviousBalance;
                            const winAmount = balanceChange > 0 ? balanceChange : (session.myBaseBetAmount * 0.95);
                            
                            logStats('SOCKET (FixedBet): THẮNG! Cược ' + session.myBaseBetAmount.toLocaleString('vi-VN') + 'đ (EID ' + session.myLastBetEid + ') thành công. Lãi vòng này: +' + winAmount.toLocaleString('vi-VN') + 'đ | Tổng lãi/lỗ: ' + (profitLoss >= 0 ? '+' : '') + profitLoss.toLocaleString('vi-VN') + 'đ');
                            
                            // Update statistics
                            session.myTotalWins++;
                            session.myTotalWinAmount += winAmount;
                            session.myCurrentWinStreak++;
                            session.myCurrentLossStreak = 0;
                            if (session.myCurrentWinStreak > session.myMaxWinStreak) {
                                session.myMaxWinStreak = session.myCurrentWinStreak;
                            }
                        } else {
                            // THUA! (FixedBet)
                            // Lợi nhuận = Số dư hiện tại - Số dư ban đầu (tính từ lúc bắt đầu)
                            const profitLoss = session.myInitialBalance > 0 ? (session.myCurrentBalance - session.myInitialBalance) : 0;
                            const balanceChange = session.myPreviousBalance - session.myCurrentBalance;
                            const lossAmount = balanceChange > 0 ? balanceChange : session.myBaseBetAmount;
                            
                            logStats('SOCKET (FixedBet): THUA! Cược ' + session.myBaseBetAmount.toLocaleString('vi-VN') + 'đ (EID ' + session.myLastBetEid + ') thất bại. Lỗ vòng này: -' + lossAmount.toLocaleString('vi-VN') + 'đ | Tổng lãi/lỗ: ' + (profitLoss >= 0 ? '+' : '') + profitLoss.toLocaleString('vi-VN') + 'đ');
                            
                            // Update statistics
                            session.myTotalLosses++;
                            session.myTotalLossAmount += lossAmount;
                            session.myCurrentLossStreak++;
                            session.myCurrentWinStreak = 0;
                            if (session.myCurrentLossStreak > session.myMaxLossStreak) {
                                session.myMaxLossStreak = session.myCurrentLossStreak;
                            }
                        }
                        logStats('SOCKET (Stats): Tổng cược: ' + session.myTotalBetsPlaced + ' | Thắng: ' + session.myTotalWins + ' | Thua: ' + session.myTotalLosses);
                        logStats('SOCKET (Advanced Stats): Thắng liên tiếp: ' + session.myCurrentWinStreak + ' | Thua liên tiếp: ' + session.myCurrentLossStreak + ' | Tổng thắng: ' + session.myTotalWinAmount.toLocaleString('vi-VN') + 'đ | Tổng thua: ' + session.myTotalLossAmount.toLocaleString('vi-VN') + 'đ');
                        session.myLastBetEid = null;
                    }
                    
                    // --- BƯỚC 2B: XỬ LÝ LOGIC "THĂNG CẤP TỨC THÌ" (ĐÃ SỬA LỖI ÂM) ---
                    if (currentWinningEid) { // Vòng này ra 2 hoặc 5
                        if (session.myCurrentStreakType === currentWinningEid) {
                            // CHUỖI TIẾP TỤC!
                            session.myCurrentStreakCount++;
                            logStats('SOCKET (Streak): Chuỗi ' + currentWinningEid + ' tiếp tục! Độ dài mới: ' + session.myCurrentStreakCount);
                    
                            // *** LOGIC THĂNG CẤP (ĐÃ SỬA) ***
                            if (session.myCurrentStreakCount === 2) {
                                session.mySetCount_L2++;
                                logStats('SOCKET (Bank): +1 Bộ 2. Tổng: ' + session.mySetCount_L2);
                            } else if (session.myCurrentStreakCount === 3) {
                                if (session.mySetCount_L2 > 0) { session.mySetCount_L2--; }
                                session.mySetCount_L3++;
                                logStats('SOCKET (Bank): Thăng cấp lên L3. Tổng Bộ 3: ' + session.mySetCount_L3);
                            } else if (session.myCurrentStreakCount === 4) {
                                if (session.mySetCount_L3 > 0) { session.mySetCount_L3--; }
                                session.mySetCount_L4++;
                                logStats('SOCKET (Bank): Thăng cấp lên L4. Tổng Bộ 4: ' + session.mySetCount_L4);
                            } else if (session.myCurrentStreakCount === 5) {
                                if (session.mySetCount_L4 > 0) { session.mySetCount_L4--; }
                                session.mySetCount_L5++;
                                logStats('SOCKET (Bank): Thăng cấp lên L5. Tổng Bộ 5: ' + session.mySetCount_L5);
                            } else if (session.myCurrentStreakCount === 6) {
                                if (session.mySetCount_L5 > 0) { session.mySetCount_L5--; }
                                session.mySetCount_L6++;
                                logStats('SOCKET (Bank): Thăng cấp lên L6. Tổng Bộ 6: ' + session.mySetCount_L6);
                            }
                            // Ghi lại loại chuỗi để cược ngược
                            session.myLastBankedStreakType = session.myCurrentStreakType;
                    
                        } else {
                            // BẮT ĐẦU CHUỖI MỚI (hoặc ngắt chuỗi cũ)
                            logStats('SOCKET (Streak): Chuỗi bị ngắt, bắt đầu chuỗi mới! EID: ' + currentWinningEid);
                            session.myCurrentStreakType = currentWinningEid;
                            session.myCurrentStreakCount = 1; // Bắt đầu đếm từ 1
                        }
                    } else {
                        // Vòng này không ra 2 hoặc 5 -> CHUỖI BỊ NGẮT
                        if (session.myCurrentStreakType !== null) {
                            logStats('SOCKET (Streak): Vòng này không phải 2/5. Chuỗi ' + session.myCurrentStreakType + ' bị ngắt.');
                            session.myCurrentStreakType = null;
                            session.myCurrentStreakCount = 0;
                        }
                    }
                   
                    // In ra trạng thái "ngân hàng"
                    logStats('SOCKET (Bank Status): Bộ 2: ' + session.mySetCount_L2 + ' | Bộ 3: ' + session.mySetCount_L3 + ' | Bộ 4: ' + session.mySetCount_L4 + ' | Bộ 5: ' + session.mySetCount_L5 + ' | Bộ 6: ' + session.mySetCount_L6);
                    
                    // ĐẾM VÁN ĐỂ CƯỢC ĐỊNH KỲ
                    session.myRoundCounter++;
                    
                    // --- BƯỚC 2C: KIỂM TRA ĐIỀU KIỆN CƯỢC (NẾU KHÔNG ĐANG CHỜ KẾT QUẢ) ---
                    if (!window.isWaitingForResult && !window.isWaitingForFixedBet) {
                        let betPlaced = false;
                        let betReason = "";
                        let betTriggerLevel = 0; // Để biết reset bộ nào
                    
                        // Kiểm tra từ cao xuống thấp (LOGIC CƯỢC STREAK)
                        if (session.mySetCount_L6 >= 1) {
                            betPlaced = true;
                            betReason = "ĐẠT 1 BỘ 6!";
                            betTriggerLevel = 6;
                        } else if (session.mySetCount_L5 >= 2) {
                            betPlaced = true;
                            betReason = "ĐẠT 2 BỘ 5!";
                            betTriggerLevel = 5;
                        } else if (session.mySetCount_L4 >= 2) {
                            betPlaced = true;
                            betReason = "ĐẠT 2 BỘ 4!";
                            betTriggerLevel = 4;
                        } else if (session.mySetCount_L3 >= 3) {
                            betPlaced = true;
                            betReason = "ĐẠT 3 BỘ 3!";
                            betTriggerLevel = 3;
                        } else if (session.mySetCount_L2 >= 3) {
                            betPlaced = true;
                            betReason = "ĐẠT 3 BỘ 2!";
                            betTriggerLevel = 2;
                        }
                       
                        // 4. Thực thi lệnh cược nếu đủ điều kiện
                        if (betPlaced) {
                            // --- LOGIC CƯỢC GẤP THẾP (STREAK) - (ƯU TIÊN SỐ 1) ---
                            
                            // Reset bộ đếm tương ứng NGAY LẬP TỨC
                            if (betTriggerLevel === 2) session.mySetCount_L2 = 0;
                            else if (betTriggerLevel === 3) session.mySetCount_L3 = 0;
                            else if (betTriggerLevel === 4) session.mySetCount_L4 = 0;
                            else if (betTriggerLevel === 5) session.mySetCount_L5 = 0;
                            else if (betTriggerLevel === 6) session.mySetCount_L6 = 0;
                            logStats('SOCKET (Bank): Đã reset Bộ ' + betTriggerLevel + ' về 0.');
                            
                            // <-- THAY ĐỔI QUAN TRỌNG: Reset bộ đếm 4 ván vì cược này được ưu tiên
                            session.myRoundCounter = 0; 
                            logStats('SOCKET (FixedBet): Cược Streak được ưu tiên, reset bộ đếm 4 ván.');
                            
                            // Xác định EID cược ngược
                            let eidToBet = 2; // Mặc định cược 2
                            if (session.myLastBankedStreakType === 2) {
                                eidToBet = 5; // Chuỗi thăng cấp cuối là 2 -> cược 5
                            } else if (session.myLastBankedStreakType === 5) {
                                eidToBet = 2; // Chuỗi thăng cấp cuối là 5 -> cược 2
                            }
                            session.myLastBankedStreakType = null; // Xóa loại chuỗi đã bank
                    
                            // Lấy số tiền cược hiện tại (đã xử lý Martingale)
                            const amountToBet = session.myCurrentBetAmount;
                            
                            // Track highest bet
                            if (amountToBet > session.myHighestBet) {
                                session.myHighestBet = amountToBet;
                                logStats('SOCKET (Stats): Cập nhật tiền cược cao nhất: ' + session.myHighestBet.toLocaleString('vi-VN') + 'đ');
                            }
                    
                            logStats('SOCKET (Auto-Trigger): ' + betReason + ' Kích hoạt cược!');
                            logStats('SOCKET (Auto-Trigger): Cược EID: ' + eidToBet + ' | Số tiền: ' + amountToBet.toLocaleString('vi-VN') + 'đ (Gấp thếp)');
                    
                            // Đặt cờ chờ kết quả GẤP THẾP
                            window.isWaitingForResult = true;
                            session.myLastBetEid = eidToBet; // Lưu lại EID đã cược
                            session.myTotalBetsPlaced++; // Tăng số lượng cược
                            
                            // Broadcast real-time stats before betting
                            console.log('[BETTING_STATS]' + JSON.stringify({
                                currentBalance: session.myCurrentBalance,
                                initialBalance: session.myInitialBalance,
                                profitLoss: session.myCurrentBalance - session.myInitialBalance,
                                totalBets: session.myTotalBetsPlaced,
                                winCount: session.myTotalWins,
                                lossCount: session.myTotalLosses,
                                highestBet: session.myHighestBet,
                                totalWinAmount: session.myTotalWinAmount,
                                totalLossAmount: session.myTotalLossAmount,
                                currentWinStreak: session.myCurrentWinStreak,
                                currentLossStreak: session.myCurrentLossStreak,
                                maxWinStreak: session.myMaxWinStreak,
                                maxLossStreak: session.myMaxLossStreak,
                                currentBet: amountToBet,
                                lastBet: null,
                                lastOutcome: null
                            }));
                           
                            // Đợi 15 giây
                            setTimeout(() => {
                                const ridToSend = session.myBestRid || 6476537;
                                const messageArray = [5, "Simms", ridToSend, {"cmd": 900, "eid": eidToBet, "v": amountToBet}];
                                const messageString = JSON.stringify(messageArray);
                           
                                if (session.myLastUsedSocket && session.myLastUsedSocket.readyState === WebSocket.OPEN) {
                                    logStats('SOCKET (Auto-Send-Martingale): Đang gửi ⬆️', messageString);
                                    session.myLastUsedSocket.send(messageString);
                                } else {
                                    console.error('SOCKET (Auto-Send-Martingale): Không thể gửi tin nhắn. Socket đã bị đóng.');
                                    window.isWaitingForResult = false; // Hủy cược nếu socket đóng
                                    session.myLastBetEid = null;
                                }
                            }, 15000); // 15000ms = 15 giây
                        
                        } else if (session.myRoundCounter >= 4) {
                            // --- LOGIC CƯỢC 4 VÁN (ƯU TIÊN SỐ 2) ---
                            // Chỉ chạy nếu cược streak KHÔNG xảy ra
                            
                            session.myRoundCounter = 0; // Reset bộ đếm ván
                            const amountToBet = 500; // Cược cố định 500đ
                            const eidToBet = 2; // Cược mặc định EID 2 (bạn có thể đổi thành 5 nếu muốn)
                            
                            // Track highest bet
                            if (amountToBet > session.myHighestBet) {
                                session.myHighestBet = amountToBet;
                                logStats('SOCKET (Stats): Cập nhật tiền cược cao nhất: ' + session.myHighestBet.toLocaleString('vi-VN') + 'đ');
                            }
                            
                            logStats('SOCKET (Auto-Trigger): ĐỦ 4 VÁN (không cược streak)! Kích hoạt cược số tiền: ' + amountToBet.toLocaleString('vi-VN') + 'đ (Cố định)');
 
                            logStats('SOCKET (Auto-Trigger): Cược EID: ' + eidToBet + ' | Số tiền: ' + amountToBet.toLocaleString('vi-VN') + 'đ (Cố định)');
                            
                            // Đặt cờ chờ kết quả CỐ ĐỊNH (không ảnh hưởng Martingale)
                            window.isWaitingForFixedBet = true; // <-- Cờ riêng
                            session.myLastBetEid = eidToBet; // Lưu lại EID đã cược
                            session.myTotalBetsPlaced++; // Tăng số lượng cược
                            
                            // Broadcast real-time stats before betting
                            console.log('[BETTING_STATS]' + JSON.stringify({
                                currentBalance: session.myCurrentBalance,
                                initialBalance: session.myInitialBalance,
                                profitLoss: session.myCurrentBalance - session.myInitialBalance,
                                totalBets: session.myTotalBetsPlaced,
                                winCount: session.myTotalWins,
                                lossCount: session.myTotalLosses,
                                highestBet: session.myHighestBet,
                                totalWinAmount: session.myTotalWinAmount,
                                totalLossAmount: session.myTotalLossAmount,
                                currentWinStreak: session.myCurrentWinStreak,
                                currentLossStreak: session.myCurrentLossStreak,
                                maxWinStreak: session.myMaxWinStreak,
                                maxLossStreak: session.myMaxLossStreak,
                                currentBet: amountToBet,
                                lastBet: null,
                                lastOutcome: null
                            }));
                            
                            // Gửi cược
                            setTimeout(() => {
                                const ridToSend = session.myBestRid || 6476537;
                                const messageArray = [5, "Simms", ridToSend, {"cmd": 900, "eid": eidToBet, "v": amountToBet}];
                                const messageString = JSON.stringify(messageArray);
                            
                                if (session.myLastUsedSocket && session.myLastUsedSocket.readyState === WebSocket.OPEN) {
                                    logStats('SOCKET (Auto-Send-Fixed): Đang gửi ⬆️', messageString);
                                    session.myLastUsedSocket.send(messageString);
                                } else {
                                    console.error('SOCKET (Auto-Send-Fixed): Không thể gửi tin nhắn. Socket đã bị đóng.');
                                    window.isWaitingForFixedBet = false; // Hủy cược nếu socket đóng
                                    session.myLastBetEid = null;
                                }
                            }, 15000); // 15000ms = 15 giây
                        
                        } else {
                            // Không cược streak, cũng chưa đủ 4 ván
                            logStats('SOCKET (Auto-Trigger): Chưa đủ điều kiện cược (Streak: Thất bại, Ván: ' + session.myRoundCounter + '/4).');
                        }
                           
                    } else {
                        logStats('SOCKET (Auto-Trigger): Đang chờ kết quả cược trước, tạm dừng check cược mới.');
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

})(); // Close IIFE for session isolation
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
      if (session.myLastUsedSocket) {
        session.myLastUsedSocket.onmessage = (event) => {
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
      if (session.myLastUsedSocket && session.myLastUsedSocket.readyState === WebSocket.OPEN) {
        // console.log('%cManual Send: Đang gửi ⬆️', 'color: purple; font-weight: bold;', msg);
        session.myLastUsedSocket.send(msg);
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
 * @param {String} sessionId - Session ID to access the correct namespace
 */
async function getWebSocketState(page, logger, sessionId = 'default-session') {
  try {
    const state = await page.evaluate((sid) => {
      // Access the session namespace
      if (!window.__SESSIONS__ || !window.__SESSIONS__[sid]) {
        return {
          exists: false,
          message: 'Session namespace not found'
        };
      }
      
      const session = window.__SESSIONS__[sid];
      
      if (session.myLastUsedSocket) {
        return {
          exists: true,
          readyState: session.myLastUsedSocket.readyState,
          readyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][session.myLastUsedSocket.readyState],
          url: session.myLastUsedSocket.url,
          bestRid: session.myBestRid
        };
      } else {
        return {
          exists: false,
          message: 'WebSocket not yet created'
        };
      }
    }, sessionId);
    
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