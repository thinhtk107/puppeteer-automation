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
    // Lấy baseBet, betAmounts, sessionId và showStatsOnScreen từ options
    const baseBet = options.baseBet || 500;
    const betAmounts = options.betAmounts || [10000, 13000, 25000, 53000, 50000]; // Mảng 5 mức cược
    const sessionId = options.sessionId || 'default-session';
    const showStatsOnScreen = options.showStatsOnScreen !== false; // Default true
    
    // Lấy các giới hạn từ options (0 = không giới hạn)
    const targetProfit = options.targetProfit || 0; // Mục tiêu thắng (VND)
    const maxLoss = options.maxLoss || 0; // Mức thua tối đa (VND)
    
    logger && logger.log && logger.log('\n========================================');
    logger && logger.log && logger.log('   WEBSOCKET HOOK SETUP - START');
    logger && logger.log && logger.log(`   Session ID: ${sessionId}`);
    logger && logger.log && logger.log(`   Base Bet Amount: ${baseBet}`);
    logger && logger.log && logger.log(`   Bet Amounts: ${JSON.stringify(betAmounts)}`);
    logger && logger.log && logger.log(`   Show Stats On Screen: ${showStatsOnScreen}`);
    logger && logger.log && logger.log(`   Target Profit: ${targetProfit} VND (0 = unlimited)`);
    logger && logger.log && logger.log(`   Max Loss: ${maxLoss} VND (0 = unlimited)`);
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
      
      // Helper function để format thời gian runtime (milliseconds -> HH:MM:SS)
      const formatRuntime = function(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        const pad = (num) => String(num).padStart(2, '0');
        return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
      };
      
      // Helper function để tính runtime hiện tại
      const getCurrentRuntime = function() {
        if (!session.myStartTime) return 0;
        const endTime = session.myEndTime || Date.now();
        return endTime - session.myStartTime;
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
                    
      // --- BIẾN CƯỢC (CUSTOM BET LEVELS) ---
      session.myBetAmounts = ${JSON.stringify(betAmounts)}; // Mảng mức cược từ màn hình
      session.myCurrentBetLevel = 0; // Index hiện tại (0-4)
      session.myBaseBetAmount = ${baseBet};
      session.myCurrentBetAmount = session.myBetAmounts[0]; // Bắt đầu từ mức đầu tiên
      session.myLastBetEid = null;
      session.isWaitingForResult = false;
      session.myLastBankedStreakType = null;

      // --- BIẾN CƯỢC 4 VÁN ---
      session.myRoundCounter = 0;
      session.isWaitingForFixedBet = false;
      
      // --- BIẾN GIỚI HẠN (LIMITS) ---
      session.myTargetProfit = ${targetProfit}; // Mục tiêu lợi nhuận (0 = không giới hạn)
      session.myMaxLossLimit = ${maxLoss}; // Giới hạn thua tối đa (0 = không giới hạn)
      session.myAutoStopTriggered = false; // Cờ để ngăn cược sau khi đạt giới hạn
      
      // === HELPER FUNCTION: Chia nhỏ số tiền cược thành các mệnh giá có sẵn ===
      // Các mệnh giá có sẵn trong game (sắp xếp từ lớn đến nhỏ)
      const AVAILABLE_DENOMINATIONS = [100000000, 50000000, 10000000, 5000000, 1000000, 500000, 100000, 50000, 10000, 5000, 1000, 500];
      
      /**
       * Chia nhỏ số tiền cược thành các lần bấm với mệnh giá có sẵn
       * Ví dụ: 7000 -> [{amount: 5000, count: 1}, {amount: 1000, count: 2}]
       * @param {number} totalAmount - Tổng số tiền cần cược
       * @returns {Array} - Mảng các lần bấm [{amount: 5000, count: 1}, ...]
       */
      const breakdownBetAmount = function(totalAmount) {
        const breakdown = [];
        let remaining = totalAmount;
        
        for (const denom of AVAILABLE_DENOMINATIONS) {
          if (remaining >= denom) {
            const count = Math.floor(remaining / denom);
            breakdown.push({ amount: denom, count: count });
            remaining = remaining % denom;
          }
        }
        
        if (remaining > 0) {
          logStats('[Session ' + SESSION_ID + '] ⚠️ WARNING: Không thể chia hết số tiền ' + totalAmount.toLocaleString('vi-VN') + 'đ. Còn dư: ' + remaining + 'đ');
        }
        
        return breakdown;
      };
      
      /**
       * Gửi nhiều message đặt cược dựa trên breakdown
       * @param {WebSocket} socket - WebSocket để gửi
       * @param {number} eid - EID cược (2 hoặc 5)
       * @param {number} totalAmount - Tổng số tiền cần cược
       * @param {number} rid - Room ID
       * @param {string} betType - Loại cược ('Martingale' hoặc 'FixedBet')
       */
      const sendMultipleBets = function(socket, eid, totalAmount, rid, betType) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          console.error('[Session ' + SESSION_ID + '] SOCKET: WebSocket đã đóng, không thể gửi cược.');
          return;
        }
        
        const breakdown = breakdownBetAmount(totalAmount);
        
        logStats('[Session ' + SESSION_ID + '] SOCKET (Breakdown): Chia ' + totalAmount.toLocaleString('vi-VN') + 'đ thành ' + breakdown.length + ' lần bấm:');
        breakdown.forEach((item, index) => {
          logStats('[Session ' + SESSION_ID + ']   ' + (index + 1) + '. ' + item.amount.toLocaleString('vi-VN') + 'đ x ' + item.count + ' lần');
        });
        
        let delay = 0;
        breakdown.forEach((item) => {
          for (let i = 0; i < item.count; i++) {
            setTimeout(() => {
              const messageArray = [5, "Simms", rid, {"cmd": 900, "eid": eid, "v": item.amount}];
              const messageString = JSON.stringify(messageArray);
              
              logStats('[Session ' + SESSION_ID + '] SOCKET (Auto-Send-' + betType + '): Gửi ' + item.amount.toLocaleString('vi-VN') + 'đ ⬆️');
              socket.send(messageString);
            }, delay);
            
            delay += 200; // Delay 200ms giữa các lần bấm
          }
        });
      };

      // --- BIẾN THEO DÕI SỐ TIỀN ---
      session.myCurrentBalance = 0;
      session.myInitialBalance = 0; // Số dư ban đầu (lần đầu tiên > 0)
      session.myPreviousBalance = 0; // Lưu số dư trước đó để tính thay đổi
      session.myTotalBetsPlaced = 0;
      session.myTotalWins = 0;
      session.myTotalLosses = 0;

      // --- THỐNG KÊ NÂNG CAO ---
      session.myTotalBetAmount = 0; // Tổng số tiền đã cược (tất cả các lần)
      session.myTotalWinAmount = 0;
      session.myTotalLossAmount = 0;
      session.myCurrentWinStreak = 0;
      session.myCurrentLossStreak = 0;
      session.myMaxWinStreak = 0;
      session.myMaxLossStreak = 0;
      session.myHighestBet = 0; // Bắt đầu từ 0, sẽ cập nhật khi có cược

      // --- THỜI GIAN CHẠY ---
      session.myStartTime = Date.now(); // Lưu timestamp bắt đầu (milliseconds)
      session.myEndTime = null; // Timestamp kết thúc (khi dừng/disconnect)
                    
      console.log('[Session ' + SESSION_ID + '] SOCKET (Logic): Khởi tạo. Cược cơ bản: ' + session.myBaseBetAmount);
      console.log('[Session ' + SESSION_ID + '] SOCKET (Runtime): Bắt đầu đếm thời gian chạy...');

      // Broadcast initial stats
      console.log('[BETTING_STATS]' + JSON.stringify({
          currentBalance: session.myCurrentBalance,
          totalBets: session.myTotalBetsPlaced,
          totalBetAmount: session.myTotalBetAmount,
          winCount: session.myTotalWins,
          lossCount: session.myTotalLosses,
          highestBet: session.myHighestBet,
          runtime: getCurrentRuntime(),
          runtimeFormatted: formatRuntime(getCurrentRuntime()),
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
                                // Số dư ban đầu = Số dư nhận được + Số tiền cược cố định (500đ)
                                // Vì khi nhận số dư lần đầu, nếu đang có cược FixedBet đầu tiên, tiền đã trừ 500đ
                                const fixedBetAmount = 500; // Số tiền cược cố định
                                session.myInitialBalance = parsedData[1].m + fixedBetAmount;
                                logStats('SOCKET (Balance Init): Số dư từ server: ' + parsedData[1].m.toLocaleString('vi-VN') + 'đ + Cược cố định: ' + fixedBetAmount.toLocaleString('vi-VN') + 'đ = Số dư ban đầu: ' + session.myInitialBalance.toLocaleString('vi-VN') + 'đ');
                            }
                            
                            // Lưu số dư trước đó
                            if (session.myCurrentBalance !== 0) {
                                session.myPreviousBalance = session.myCurrentBalance;
                            }
                            
                            // Cập nhật số dư mới
                            session.myCurrentBalance = parsedData[1].m;

                            // Tính lãi/lỗ dựa trên tổng thắng - tổng thua
                            const profitLoss = session.myTotalWinAmount - session.myTotalLossAmount;
                            const profitLossText = profitLoss >= 0 ? '+' + profitLoss.toLocaleString('vi-VN') : profitLoss.toLocaleString('vi-VN');
                            logStats('SOCKET (Balance Update): Số dư hiện tại: ' + session.myCurrentBalance.toLocaleString('vi-VN') + 'đ | Lợi nhuận: ' + profitLossText + 'đ');
                            
                            // Broadcast balance update to client - CHỈ GỬI currentBalance
                            // KHÔNG gửi totalWinAmount/totalLossAmount ở đây vì chưa có kết quả cược
                            // Stats đầy đủ sẽ được gửi khi có kết quả thắng/thua
                            console.log('[BETTING_STATS]' + JSON.stringify({
                                currentBalance: session.myCurrentBalance,
                                initialBalance: session.myInitialBalance,
                                runtime: getCurrentRuntime(),
                                runtimeFormatted: formatRuntime(getCurrentRuntime())
                            }));
                        }
                       
                        // Lấy EID thắng (nếu là cmd 907)
                        if (command === 907) {
                            const events = parsedData[1].ew;
                            if (events && Array.isArray(events)) {
                                // Log toàn bộ events để debug
                                logStats('SOCKET (Debug): Events data: ' + JSON.stringify(events));
                                
                                for (const evt of events) {
                                    // Chỉ cần kiểm tra eid là 2 hoặc 5, KHÔNG cần kiểm tra wns
                                    // Vì chúng ta muốn theo dõi tất cả kết quả, không chỉ khi thắng
                                    if ((evt.eid === 2 || evt.eid === 5) && evt.wns && evt.wns.length > 0) {
                                        currentWinningEid = evt.eid; // Lưu lại là 2 hoặc 5
                                        logStats('SOCKET (Debug): Found winning eid: ' + evt.eid + ' | wns: ' + (evt.wns ? evt.wns.length : 'N/A'));
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
                       
                        logStats('SOCKET (Result): Kiểm tra kết quả - EID thắng: ' + currentWinningEid + ' | EID đã cược: ' + session.myLastBetEid);
                       
                        if (currentWinningEid === session.myLastBetEid) {
                            // THẮNG! (GẤP THẾP)
                            // Công thức: Tiền thắng = số tiền cược × 0.98 (tỷ lệ thắng 98%)
                            // Tổng nhận về = vốn + lãi = myCurrentBetAmount + (myCurrentBetAmount * 0.98)
                            const winAmount = session.myCurrentBetAmount * 0.98;
                            
                            logStats('SOCKET (Martingale): THẮNG! Đặt cược EID ' + session.myLastBetEid + ' thành công. Cược: ' + session.myCurrentBetAmount.toLocaleString('vi-VN') + 'đ | Lãi vòng này: +' + winAmount.toLocaleString('vi-VN') + 'đ');
                            
                            // Update statistics
                            session.myTotalWins++;
                            session.myTotalWinAmount += winAmount;
                            const profitLoss = session.myTotalWinAmount - session.myTotalLossAmount;
                            
                            logStats('SOCKET (Martingale): Lợi nhuận tích lũy: ' + (profitLoss >= 0 ? '+' : '') + profitLoss.toLocaleString('vi-VN') + 'đ');
                            session.myCurrentWinStreak++;
                            session.myCurrentLossStreak = 0;
                            if (session.myCurrentWinStreak > session.myMaxWinStreak) {
                                session.myMaxWinStreak = session.myCurrentWinStreak;
                            }
                            
                            // LƯU LẠI THÔNG TIN CƯỢC TRƯỚC KHI RESET (để gửi lên client)
                            const previousBetLevel = session.myCurrentBetLevel;
                            const previousBetAmount = session.myCurrentBetAmount;
                            
                            // Reset về mức cược đầu tiên khi THẮNG
                            session.myCurrentBetLevel = 0;
                            session.myCurrentBetAmount = session.myBetAmounts[0];
                            
                            logStats('SOCKET (Martingale): ✅ RESET! Từ mức ' + (previousBetLevel + 1) + ' (' + previousBetAmount.toLocaleString('vi-VN') + 'đ) → mức 1 (' + session.myCurrentBetAmount.toLocaleString('vi-VN') + 'đ)');
                            
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
                                currentBetLevel: session.myCurrentBetLevel + 1, // Gửi level SAU KHI RESET (0 + 1 = 1)
                                maxBetLevel: session.myBetAmounts.length,
                                nextBetAmount: session.myCurrentBetAmount, // Đã reset về mức 1
                                lastBet: {
                                    eid: session.myLastBetEid,
                                    amount: previousBetAmount,
                                    winAmount: winAmount
                                },
                                lastOutcome: 'win'
                            }));
                        } else {
                            // THUA! (GẤP THẾP)
                            // LƯU LẠI THÔNG TIN CƯỢC TRƯỚC KHI TĂNG (để gửi lên client)
                            const previousBetLevel = session.myCurrentBetLevel;
                            const previousBetAmount = session.myCurrentBetAmount;
                            
                            // Tính số tiền thua = LUÔN LUÔN là số tiền vừa cược (previousBetAmount)
                            // KHÔNG dùng balanceChange vì số dư từ server có thể chưa cập nhật kịp
                            const lossAmount = previousBetAmount;
                            const profitLoss = session.myTotalWinAmount - session.myTotalLossAmount;
                            
                            logStats('SOCKET (Martingale): THUA! Cược ' + session.myLastBetEid + ' nhưng kết quả là ' + (currentWinningEid || 'Khác') + '. Cược: ' + previousBetAmount.toLocaleString('vi-VN') + 'đ | Lỗ vòng này: -' + lossAmount.toLocaleString('vi-VN') + 'đ | Lợi nhuận: ' + (profitLoss >= 0 ? '+' : '') + profitLoss.toLocaleString('vi-VN') + 'đ');
                            
                            // Update statistics
                            session.myTotalLosses++;
                            session.myTotalLossAmount += lossAmount;
                            session.myCurrentLossStreak++;
                            session.myCurrentWinStreak = 0;
                            if (session.myCurrentLossStreak > session.myMaxLossStreak) {
                                session.myMaxLossStreak = session.myCurrentLossStreak;
                            }
                            
                            // Tăng lên mức cược tiếp theo khi THUA (thay vì nhân đôi)
                            session.myCurrentBetLevel = Math.min(session.myCurrentBetLevel + 1, session.myBetAmounts.length - 1);
                            session.myCurrentBetAmount = session.myBetAmounts[session.myCurrentBetLevel];
                            
                            logStats('SOCKET (Bet Level): Tăng lên mức cược ' + (session.myCurrentBetLevel + 1) + '/' + session.myBetAmounts.length + ' = ' + session.myCurrentBetAmount.toLocaleString('vi-VN') + 'đ');
                            
                            // Track highest bet
                            if (session.myCurrentBetAmount > session.myHighestBet) {
                                session.myHighestBet = session.myCurrentBetAmount;
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
                                currentBetLevel: previousBetLevel + 1,
                                maxBetLevel: session.myBetAmounts.length,
                                nextBetAmount: session.myCurrentBetAmount,
                                lastBet: {
                                    eid: session.myLastBetEid,
                                    amount: previousBetAmount,
                                    lossAmount: lossAmount
                                },
                                lastOutcome: 'loss'
                            }));
                        }
                        logStats('SOCKET (Martingale): Số tiền cược cho lần tới là: ' + session.myCurrentBetAmount.toLocaleString('vi-VN') + 'đ');
                        logStats('SOCKET (Stats): Tổng cược: ' + session.myTotalBetsPlaced + ' | Thắng: ' + session.myTotalWins + ' | Thua: ' + session.myTotalLosses);
                        logStats('SOCKET (Advanced Stats): Thắng liên tiếp: ' + session.myCurrentWinStreak + ' | Thua liên tiếp: ' + session.myCurrentLossStreak + ' | Tổng thắng: ' + session.myTotalWinAmount.toLocaleString('vi-VN') + 'đ | Tổng thua: ' + session.myTotalLossAmount.toLocaleString('vi-VN') + 'đ');
                        
                        // Broadcast advanced stats to client (SAU MARTINGALE)
                        console.log('[BETTING_STATS]' + JSON.stringify({
                            currentBalance: session.myCurrentBalance,
                            initialBalance: session.myInitialBalance,
                            baseBetAmount: session.myBaseBetAmount,
                            currentBetAmount: session.myCurrentBetAmount,
                            totalBets: session.myTotalBetsPlaced,
                            winCount: session.myTotalWins,
                            lossCount: session.myTotalLosses,
                            profitLoss: session.myTotalWinAmount - session.myTotalLossAmount,
                            highestBet: session.myHighestBet,
                            totalWinAmount: session.myTotalWinAmount,
                            totalLossAmount: session.myTotalLossAmount,
                            currentWinStreak: session.myCurrentWinStreak,
                            currentLossStreak: session.myCurrentLossStreak,
                            maxWinStreak: session.myMaxWinStreak,
                            maxLossStreak: session.myMaxLossStreak
                        }));
                        
                        session.myLastBetEid = null;
                    
                    } else if (window.isWaitingForFixedBet) {
                        window.isWaitingForFixedBet = false; // Đã nhận kết quả
                        if (currentWinningEid === session.myLastBetEid) {
                            // THẮNG! (FixedBet - TÍNH VÀO THỐNG KÊ)
                            const fixedBetAmount = 500; // Cược cố định 500đ
                            const winAmount = fixedBetAmount * 0.98;
                            
                            logStats('SOCKET (FixedBet): THẮNG! Cược ' + fixedBetAmount.toLocaleString('vi-VN') + 'đ (EID ' + session.myLastBetEid + ') thành công. Lãi: +' + winAmount.toLocaleString('vi-VN') + 'đ');
                            
                            // CẬP NHẬT THỐNG KÊ
                            session.myTotalWins++;
                            session.myTotalWinAmount += winAmount;
                            const profitLoss = session.myTotalWinAmount - session.myTotalLossAmount;
                            
                            logStats('SOCKET (FixedBet): Lợi nhuận tích lũy: ' + (profitLoss >= 0 ? '+' : '') + profitLoss.toLocaleString('vi-VN') + 'đ');
                            
                            // CẬP NHẬT STREAK
                            session.myCurrentWinStreak++;
                            session.myCurrentLossStreak = 0;
                            
                            // KHÔNG RESET SAU FixedBet WIN - Giữ nguyên Martingale level
                            // session.myCurrentBetLevel = 0;
                            // session.myCurrentBetAmount = session.myBetAmounts[0]; // Reset về 1000đ
                            
                            // Update max win streak
                            if (session.myCurrentWinStreak > session.myMaxWinStreak) {
                                session.myMaxWinStreak = session.myCurrentWinStreak;
                            }
                            
                            logStats('SOCKET (FixedBet WIN): ✅ Giữ nguyên Martingale level ' + (session.myCurrentBetLevel + 1) + ' (' + session.myCurrentBetAmount.toLocaleString('vi-VN') + 'đ)');
                            
                            // Broadcast full stats including FixedBet
                            console.log('[BETTING_STATS]' + JSON.stringify({
                                currentBalance: session.myCurrentBalance,
                                initialBalance: session.myInitialBalance,
                                profitLoss: profitLoss,
                                totalBets: session.myTotalBetsPlaced,
                                winCount: session.myTotalWins,
                                lossCount: session.myTotalLosses,
                                totalWinAmount: session.myTotalWinAmount,
                                totalLossAmount: session.myTotalLossAmount,
                                currentWinStreak: session.myCurrentWinStreak,
                                currentLossStreak: session.myCurrentLossStreak,
                                maxWinStreak: session.myMaxWinStreak,
                                maxLossStreak: session.myMaxLossStreak,
                                nextBetAmount: session.myCurrentBetAmount,
                                currentBetLevel: session.myCurrentBetLevel + 1,
                                maxBetLevel: session.myBetAmounts.length,
                                lastBet: {
                                    eid: session.myLastBetEid,
                                    amount: fixedBetAmount,
                                    winAmount: winAmount
                                },
                                lastOutcome: 'win'
                            }));
                        } else {
                            // THUA! (FixedBet - TÍNH VÀO THỐNG KÊ)
                            const fixedBetAmount = 500; // Cược cố định 500đ
                            const lossAmount = fixedBetAmount; // LUÔN LUÔN là số tiền vừa cược
                            
                            logStats('SOCKET (FixedBet): THUA! Cược ' + fixedBetAmount.toLocaleString('vi-VN') + 'đ (EID ' + session.myLastBetEid + ') thất bại. Lỗ: -' + lossAmount.toLocaleString('vi-VN') + 'đ');
                            
                            // CẬP NHẬT THỐNG KÊ
                            session.myTotalLosses++;
                            session.myTotalLossAmount += lossAmount;
                            const profitLoss = session.myTotalWinAmount - session.myTotalLossAmount;
                            
                            logStats('SOCKET (FixedBet): Lợi nhuận tích lũy: ' + (profitLoss >= 0 ? '+' : '') + profitLoss.toLocaleString('vi-VN') + 'đ');
                            
                            // CẬP NHẬT STREAK
                            session.myCurrentLossStreak++;
                            session.myCurrentWinStreak = 0;
                            
                            // KHÔNG RESET SAU FixedBet LOSS - Giữ nguyên Martingale level
                            // session.myCurrentBetLevel = 0;
                            // session.myCurrentBetAmount = session.myBetAmounts[0]; // Reset về 1000đ
                            
                            // Update max loss streak
                            if (session.myCurrentLossStreak > session.myMaxLossStreak) {
                                session.myMaxLossStreak = session.myCurrentLossStreak;
                            }
                            
                            logStats('SOCKET (FixedBet LOSS): ✅ Giữ nguyên Martingale level ' + (session.myCurrentBetLevel + 1) + ' (' + session.myCurrentBetAmount.toLocaleString('vi-VN') + 'đ)');
                            
                            // Broadcast full stats including FixedBet
                            console.log('[BETTING_STATS]' + JSON.stringify({
                                currentBalance: session.myCurrentBalance,
                                initialBalance: session.myInitialBalance,
                                profitLoss: profitLoss,
                                totalBets: session.myTotalBetsPlaced,
                                winCount: session.myTotalWins,
                                lossCount: session.myTotalLosses,
                                totalWinAmount: session.myTotalWinAmount,
                                totalLossAmount: session.myTotalLossAmount,
                                currentWinStreak: session.myCurrentWinStreak,
                                currentLossStreak: session.myCurrentLossStreak,
                                maxWinStreak: session.myMaxWinStreak,
                                maxLossStreak: session.myMaxLossStreak,
                                nextBetAmount: session.myCurrentBetAmount,
                                currentBetLevel: session.myCurrentBetLevel + 1,
                                maxBetLevel: session.myBetAmounts.length,
                                lastBet: {
                                    eid: session.myLastBetEid,
                                    amount: fixedBetAmount,
                                    lossAmount: lossAmount
                                },
                                lastOutcome: 'loss'
                            }));
                        }
                        // Log thống kê (chỉ log, không broadcast vì đã broadcast ở trên)
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
                            
                            // === KIỂM TRA GIỚI HẠN LỢI NHUẬN/THUA LỖ ===
                            if (!session.myAutoStopTriggered) {
                                const currentProfit = session.myTotalWinAmount - session.myTotalLossAmount;
                                
                                // Kiểm tra đạt mục tiêu lợi nhuận
                                if (session.myTargetProfit > 0 && currentProfit >= session.myTargetProfit) {
                                    session.myAutoStopTriggered = true;
                                    logStats('[Session ' + SESSION_ID + '] 🎯 ĐÃ ĐẠT MỤC TIÊU LỢI NHUẬN: ' + currentProfit.toLocaleString('vi-VN') + 'đ >= ' + session.myTargetProfit.toLocaleString('vi-VN') + 'đ');
                                    logStats('[Session ' + SESSION_ID + '] ⛔ DỪNG ĐẶT CƯỢC TỰ ĐỘNG!');
                                    console.log('[TARGET_PROFIT_REACHED]' + JSON.stringify({
                                        sessionId: SESSION_ID,
                                        currentProfit: currentProfit,
                                        targetProfit: session.myTargetProfit,
                                        message: 'Đã đạt mục tiêu lợi nhuận. Dừng đặt cược tự động.'
                                    }));
                                    return;
                                }
                                
                                // Kiểm tra vượt mức thua tối đa
                                if (session.myMaxLossLimit > 0 && currentProfit <= -session.myMaxLossLimit) {
                                    session.myAutoStopTriggered = true;
                                    logStats('[Session ' + SESSION_ID + '] 🛑 ĐÃ VƯỢT MỨC THUA TỐI ĐA: ' + currentProfit.toLocaleString('vi-VN') + 'đ <= -' + session.myMaxLossLimit.toLocaleString('vi-VN') + 'đ');
                                    logStats('[Session ' + SESSION_ID + '] ⛔ DỪNG ĐẶT CƯỢC TỰ ĐỘNG!');
                                    console.log('[MAX_LOSS_REACHED]' + JSON.stringify({
                                        sessionId: SESSION_ID,
                                        currentLoss: -currentProfit,
                                        maxLoss: session.myMaxLossLimit,
                                        message: 'Đã vượt mức thua tối đa. Dừng đặt cược tự động.'
                                    }));
                                    return;
                                }
                            } else {
                                // Đã dừng tự động trước đó, không đặt cược nữa
                                logStats('[Session ' + SESSION_ID + '] ⛔ ĐÃ DỪNG TỰ ĐỘNG (đạt giới hạn). Bỏ qua cược.');
                                return;
                            }
                            
                            // === CHECK PAUSE FLAG TRƯỚC KHI ĐẶT CƯỢC ===
                            // Kiểm tra nếu session này đã được tạm dừng
                            if (window.sessionPauseFlags && window.sessionPauseFlags[\`${sessionId}\`]) {
                                logStats('SOCKET (Pause): ⏸️ Đặt cược đang tạm dừng. Bấm "Tiếp tục" để đặt cược lại.');
                                console.log(\`[Session ${sessionId}] SOCKET: ⏸️ Betting paused. Skip betting.\`);
                                return; // Tạm dừng, không đặt cược
                            }
                            
                            // === CHECK STOP FLAG TRƯỚC KHI ĐẶT CƯỢC ===
                            // Kiểm tra nếu session này đã được yêu cầu dừng hoàn toàn
                            if (window.sessionStopFlags && window.sessionStopFlags[\`${sessionId}\`]) {
                                logStats('SOCKET (Stop): ⛔ Session đã được yêu cầu DỪNG. Không đặt cược nữa.');
                                console.log(\`[Session ${sessionId}] SOCKET: ⛔ Stopped by user request. Skip betting.\`);
                                return; // Dừng, không đặt cược
                            }
                            
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
                            session.myTotalBetAmount += amountToBet; // Cộng dồn tổng tiền đã cược
                            
                            // Broadcast real-time stats before betting
                            console.log('[BETTING_STATS]' + JSON.stringify({
                                currentBalance: session.myCurrentBalance,
                                initialBalance: session.myInitialBalance,
                                profitLoss: session.myTotalWinAmount - session.myTotalLossAmount,
                                totalBets: session.myTotalBetsPlaced,
                                totalBetAmount: session.myTotalBetAmount,
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
                           
                                if (session.myLastUsedSocket && session.myLastUsedSocket.readyState === WebSocket.OPEN) {
                                    // GỬI NHIỀU LẦN DỰA TRÊN BREAKDOWN
                                    sendMultipleBets(session.myLastUsedSocket, eidToBet, amountToBet, ridToSend, 'Martingale');
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
                            const amountToBet = 500; // CƯỢC CỐ ĐỊNH = 500đ (không tính vào thống kê)
                            const eidToBet = 2; // Cược mặc định EID 2 (bạn có thể đổi thành 5 nếu muốn)
                            
                            // === KIỂM TRA GIỚI HẠN LỢI NHUẬN/THUA LỖ ===
                            if (!session.myAutoStopTriggered) {
                                const currentProfit = session.myTotalWinAmount - session.myTotalLossAmount;
                                
                                // Kiểm tra đạt mục tiêu lợi nhuận
                                if (session.myTargetProfit > 0 && currentProfit >= session.myTargetProfit) {
                                    session.myAutoStopTriggered = true;
                                    logStats('[Session ' + SESSION_ID + '] 🎯 ĐÃ ĐẠT MỤC TIÊU LỢI NHUẬN: ' + currentProfit.toLocaleString('vi-VN') + 'đ >= ' + session.myTargetProfit.toLocaleString('vi-VN') + 'đ');
                                    logStats('[Session ' + SESSION_ID + '] ⛔ DỪNG ĐẶT CƯỢC TỰ ĐỘNG!');
                                    console.log('[TARGET_PROFIT_REACHED]' + JSON.stringify({
                                        sessionId: SESSION_ID,
                                        currentProfit: currentProfit,
                                        targetProfit: session.myTargetProfit,
                                        message: 'Đã đạt mục tiêu lợi nhuận. Dừng đặt cược tự động.'
                                    }));
                                    return;
                                }
                                
                                // Kiểm tra vượt mức thua tối đa
                                if (session.myMaxLossLimit > 0 && currentProfit <= -session.myMaxLossLimit) {
                                    session.myAutoStopTriggered = true;
                                    logStats('[Session ' + SESSION_ID + '] 🛑 ĐÃ VƯỢT MỨC THUA TỐI ĐA: ' + currentProfit.toLocaleString('vi-VN') + 'đ <= -' + session.myMaxLossLimit.toLocaleString('vi-VN') + 'đ');
                                    logStats('[Session ' + SESSION_ID + '] ⛔ DỪNG ĐẶT CƯỢC TỰ ĐỘNG!');
                                    console.log('[MAX_LOSS_REACHED]' + JSON.stringify({
                                        sessionId: SESSION_ID,
                                        currentLoss: -currentProfit,
                                        maxLoss: session.myMaxLossLimit,
                                        message: 'Đã vượt mức thua tối đa. Dừng đặt cược tự động.'
                                    }));
                                    return;
                                }
                            } else {
                                // Đã dừng tự động trước đó, không đặt cược nữa
                                logStats('[Session ' + SESSION_ID + '] ⛔ ĐÃ DỪNG TỰ ĐỘNG (đạt giới hạn). Bỏ qua cược.');
                                return;
                            }
                            
                            // === CHECK PAUSE FLAG TRƯỚC KHI ĐẶT CƯỢC ===
                            if (window.sessionPauseFlags && window.sessionPauseFlags[\`${sessionId}\`]) {
                                logStats('SOCKET (Pause): ⏸️ Đặt cược đang tạm dừng. Bấm "Tiếp tục" để đặt cược lại.');
                                console.log(\`[Session ${sessionId}] SOCKET: ⏸️ Betting paused. Skip betting.\`);
                                return;
                            }
                            
                            // === CHECK STOP FLAG TRƯỚC KHI ĐẶT CƯỢC ===
                            // Kiểm tra nếu session này đã được yêu cầu dừng
                            if (window.sessionStopFlags && window.sessionStopFlags[\`${sessionId}\`]) {
                                logStats('SOCKET (Stop): ⛔ Session đã được yêu cầu DỪNG. Không đặt cược nữa.');
                                console.log(\`[Session ${sessionId}] SOCKET: ⛔ Stopped by user request. Skip betting.\`);
                                return; // Dừng, không đặt cược
                            }
                            
                            // Track highest bet for FixedBet too
                            if (amountToBet > session.myHighestBet) {
                                session.myHighestBet = amountToBet;
                                logStats('SOCKET (Stats): Cập nhật tiền cược cao nhất: ' + session.myHighestBet.toLocaleString('vi-VN') + 'đ');
                            }
                            
                            logStats('SOCKET (Auto-Trigger): ĐỦ 4 VÁN (không cược streak)! Kích hoạt cược số tiền: ' + amountToBet.toLocaleString('vi-VN') + 'đ (Cố định)');
 
                            logStats('SOCKET (Auto-Trigger): Cược EID: ' + eidToBet + ' | Số tiền: ' + amountToBet.toLocaleString('vi-VN') + 'đ (Cố định)');
                            
                            // Đặt cờ chờ kết quả CỐ ĐỊNH
                            window.isWaitingForFixedBet = true; // <-- Cờ riêng
                            session.myLastBetEid = eidToBet; // Lưu lại EID đã cược
                            
                            // TĂNG THỐNG KÊ (FixedBet giờ tính vào thống kê)
                            session.myTotalBetsPlaced++;
                            session.myTotalBetAmount += amountToBet;
                            
                            // Broadcast stats before FixedBet
                            console.log('[BETTING_STATS]' + JSON.stringify({
                                currentBalance: session.myCurrentBalance,
                                initialBalance: session.myInitialBalance,
                                profitLoss: session.myTotalWinAmount - session.myTotalLossAmount,
                                totalBets: session.myTotalBetsPlaced,
                                totalBetAmount: session.myTotalBetAmount,
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
                            
                                if (session.myLastUsedSocket && session.myLastUsedSocket.readyState === WebSocket.OPEN) {
                                    // GỬI NHIỀU LẦN DỰA TRÊN BREAKDOWN
                                    sendMultipleBets(session.myLastUsedSocket, eidToBet, amountToBet, ridToSend, 'FixedBet');
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
      
      // *** FORWARD [BETTING_STATS] MESSAGES TO CLIENT ***
      if (text.startsWith('[BETTING_STATS]')) {
        try {
          const idx = text.indexOf('{');
          if (idx !== -1) {
            const jsonStr = text.substring(idx);
            const parsed = JSON.parse(jsonStr);
            const sessionManager = require('../session_manager');
            sessionManager.broadcastToSession(sessionId, {
              type: 'betting-stats',
              sessionId: sessionId,
              ...parsed,
              timestamp: new Date().toISOString()
            });
          }
        } catch (e) {
          logger && logger.warn && logger.warn(`🟡 [BETTING_STATS] parse error: ${e.message}`);
        }
        return; // Không xử lý tiếp như log thông thường
      }
      
      // Chỉ forward logs từ SOCKET (hookScript) cho SESSION CỤ THỂ
      if (text.includes('SOCKET') || text.includes(`[Session ${sessionId}]`)) {
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
        
        // Broadcast to web UI FOR THIS SESSION ONLY
        const sessionManager = require('../session_manager');
        sessionManager.broadcastToSession(sessionId, {
          type: 'browser-log',
          logType: type,
          message: text,
          timestamp: new Date().toISOString()
        });
        
        // Broadcast parsed statistics if available
        if (stats) {
          sessionManager.broadcastToSession(sessionId, {
            type: 'real-time-stats',
            stats: stats,
            timestamp: new Date().toISOString()
          });
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
      
      // Parse Betting Info: "SOCKET (Auto-Trigger): Cược EID: 2 | Số tiền: 1,000đ (Gấp thếp)"
      // Regex phải match số có dấu phẩy
      const betMatch = logText.match(/Cược EID: (\d+).*Số tiền: ([\d,]+)đ/);
      if (betMatch) {
        stats.lastBet = {
          eid: parseInt(betMatch[1]),
          amount: parseInt(betMatch[2].replace(/,/g, ''))
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
      
      // Parse Current Bet Amount: "SOCKET (Martingale): Số tiền cược cho lần tới là: 2,000đ"
      // Regex phải match số có dấu phẩy: 1,000 hoặc 2,000,000
      const nextBetMatch = logText.match(/Số tiền cược cho lần tới là: ([\d,]+)đ/);
      if (nextBetMatch) {
        // Remove commas before parsing: "1,000" -> "1000"
        stats.nextBetAmount = parseInt(nextBetMatch[1].replace(/,/g, ''));
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
    
    // Expose broadcast function to browser context (SESSION-SPECIFIC)
    await page.exposeFunction('broadcastWebSocketMessage', (direction, message) => {
      const sessionManager = require('../session_manager');
      sessionManager.broadcastToSession(sessionId, {
        type: direction === 'sent' ? 'websocket-sent' : 'websocket-received',
        message: message,
        timestamp: new Date().toISOString()
      });
    });
    
    // === SYNC STOP & PAUSE FLAGS FROM NODE.JS TO BROWSER ===
    // Track previous state để tránh spam logs
    let lastPauseState = undefined;
    
    // Periodically check and sync flags to browser context
    const syncFlags = setInterval(async () => {
      try {
        // Sync stop flag
        if (global.sessionStopFlags && global.sessionStopFlags[sessionId]) {
          await page.evaluate((sid) => {
            if (!window.sessionStopFlags) {
              window.sessionStopFlags = {};
            }
            // Chỉ log nếu chưa set
            if (!window.sessionStopFlags[sid]) {
              console.log(`[Session ${sid}] ⛔ Stop flag synced from server`);
              window.sessionStopFlags[sid] = true;
            }
          }, sessionId);
          
          clearInterval(syncFlags);
          logger && logger.log && logger.log(`✓ Stop flag synced to browser for session ${sessionId}`);
        }
        
        // Sync pause flag
        if (global.sessionPauseFlags) {
          const isPaused = global.sessionPauseFlags[sessionId] === true;
          
          // Chỉ sync nếu state thay đổi
          if (isPaused !== lastPauseState) {
            lastPauseState = isPaused;
            
            await page.evaluate((sid, paused) => {
              if (!window.sessionPauseFlags) {
                window.sessionPauseFlags = {};
              }
              const oldState = window.sessionPauseFlags[sid];
              window.sessionPauseFlags[sid] = paused;
              
              // Chỉ log khi state thay đổi
              if (oldState !== paused) {
                if (paused) {
                  console.log(`[Session ${sid}] ⏸️ Pause flag synced - betting paused`);
                } else {
                  console.log(`[Session ${sid}] ▶️ Pause flag cleared - betting resumed`);
                }
              }
            }, sessionId, isPaused);
          }
        }
      } catch (err) {
        // Ignore errors (page might be closed)
      }
    }, 500); // Check mỗi 500ms
    
    // Cleanup interval after 5 minutes (safety)
    setTimeout(() => clearInterval(syncFlags), 5 * 60 * 1000);
    
    logger && logger.log && logger.log('✓ WebSocket hook script injected successfully');
    logger && logger.log && logger.log('✓ Browser console logs will be forwarded to Node.js');
    logger && logger.log && logger.log('✓ Hook will activate when WebSocket is created');
    logger && logger.log && logger.log('✓ Stop & Pause flags sync enabled');
    
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
      
      // No broadcast needed here - this is for internal monitoring only
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