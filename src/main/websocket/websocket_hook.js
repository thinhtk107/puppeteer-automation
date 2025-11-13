/**
 * WebSocket Hook Logic - Puppeteer Implementation
 * Tương đương với logic WebSocket hook trong Java Selenium
 */

/**
 * Setup WebSocket hook to intercept and auto-send messages
 * @param {Page} page - Puppeteer page object
 * @param {Object} logger - Logger object
 */
async function setupWebSocketHook(page, logger) {
  try {
    logger && logger.log && logger.log('\n========================================');
    logger && logger.log && logger.log('   WEBSOCKET HOOK SETUP - START');
    logger && logger.log && logger.log('========================================\n');

    // Define the hook script (same logic as Java version)
    const hookScript = `
    // 1. CHỈ ĐỊNH URL MỤC TIÊU CỦA BẠN TẠI ĐÂY
const targetUrl = "wss://carkgwaiz.hytsocesk.com/websocket"; // <-- THAY THẾ BẰNG URL CỦA BẠN
console.log('%cĐang "hook" vào WebSocket. Chỉ theo dõi URL: ${targetUrl}', 'color: blue; font-weight: bold;');
                   
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
window.myBaseBetAmount = 500; // Số tiền cược CƠ BẢN
window.myCurrentBetAmount = window.myBaseBetAmount; // Số tiền cược HIỆN TẠI (sẽ nhân 2 nếu thua)
window.myLastBetEid = null; // (2 hoặc 5) - EID đã đặt cược ở vòng trước
window.isWaitingForResult = false; // Cờ (flag) - true nếu đang chờ kết quả cược GẤP THẾP
window.myLastBankedStreakType = null; // (2 hoặc 5) - Loại chuỗi vừa được bank

// --- BIẾN MỚI ĐỂ THEO DÕI LOGIC CƯỢC 4 VÁN ---
window.myRoundCounter = 0; // Đếm số ván đã qua
window.isWaitingForFixedBet = false; // Cờ (flag) - true nếu đang chờ kết quả cược 500Đ
                    
console.log('%cSOCKET (Logic): Khởi tạo. Cược cơ bản: ${window.myBaseBetAmount}', 'color: #ff9800;');
// ---------------------------------------------------
                    
// 2. Hook vào hàm 'send' (Giữ nguyên)
if (!window.OriginalWebSocketSend) {
    window.OriginalWebSocketSend = WebSocket.prototype.send;
}
WebSocket.prototype.send = function(data) {
    if (this.url === targetUrl) {
        console.log('%cSOCKET (Target): Đang gửi ⬆️', 'color: orange; font-weight: bold;', data);
        window.myLastUsedSocket = this;
        console.log('%cSOCKET: Đã bắt được và lưu vào "window.myLastUsedSocket"', 'color: #9c27b0; font-weight: bold;');
    }
    window.OriginalWebSocketSend.apply(this, arguments);
};
                   
// 3. Hook vào hàm 'onmessage' (LOGIC CHÍNH)
Object.defineProperty(WebSocket.prototype, 'onmessage', {
    set: function(originalCallback) {
        const newCallback = function(event) {
            if (this.url === targetUrl) {
                console.log('%cSOCKET (Target): Đã nhận ⬇️', 'color: green; font-weight: bold;', event.data);
                window.myLastUsedSocket = this;
                   
                const receivedData = event.data;
                let parsedData;
                let command;
                let currentWinningEid = null; // Sẽ là 2, 5, hoặc null
                   
                try {
                    parsedData = JSON.parse(receivedData);
                    if (Array.isArray(parsedData) && parsedData[1]) {
                        command = parsedData[1].cmd; // Lấy command
                       
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
                            console.log('%cSOCKET (Event): Kết quả vòng này là EID: ${currentWinningEid || 'Khác'}', 'color: #03a9f4;');
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
                            console.log('%cSOCKET (Auto-Find): Đã cập nhật phòng tốt nhất. RID: ${window.myBestRid}', 'color: #00bcd4;');
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
                            console.log('%cSOCKET (Martingale): THẮNG! Đặt cược EID ${window.myLastBetEid} thành công.', 'color: #4caf50; font-weight: bold;');
                            window.myCurrentBetAmount = window.myBaseBetAmount; // Reset tiền cược
                        } else {
                            // THUA! (GẤP THẾP)
                            console.log('%cSOCKET (Martingale): THUA! Cược ${window.myLastBetEid} nhưng kết quả là ${currentWinningEid || 'Khác'}.', 'color: #f44336; font-weight: bold;');
                            window.myCurrentBetAmount *= 2; // Gấp đôi tiền cược cho LẦN SAU
                        }
                        console.log('%cSOCKET (Martingale): Số tiền cược cho lần tới là: ${window.myCurrentBetAmount}', 'color: #f44336;');
                        window.myLastBetEid = null;
                    
                    } else if (window.isWaitingForFixedBet) {
                        window.isWaitingForFixedBet = false; // Đã nhận kết quả
                        if (currentWinningEid === window.myLastBetEid) {
                            console.log('%cSOCKET (FixedBet): THẮNG! Cược 500đ (EID ${window.myLastBetEid}) thành công.', 'color: #8bc34a; font-weight: bold;');
                        } else {
                            console.log('%cSOCKET (FixedBet): THUA! Cược 500đ (EID ${window.myLastBetEid}) thất bại.', 'color: #ff9800; font-weight: bold;');
                        }
                        window.myLastBetEid = null;
                    }
                    
                    // --- BƯỚC 2B: XỬ LÝ LOGIC "THĂNG CẤP TỨC THÌ" (ĐÃ SỬA LỖI ÂM) ---
                    if (currentWinningEid) { // Vòng này ra 2 hoặc 5
                        if (window.myCurrentStreakType === currentWinningEid) {
                            // CHUỖI TIẾP TỤC!
                            window.myCurrentStreakCount++;
                            console.log('%cSOCKET (Streak): Chuỗi ${currentWinningEid} tiếp tục! Độ dài mới: ${window.myCurrentStreakCount}', 'color: #4caf50; font-weight: bold;');
                    
                            // *** LOGIC THĂNG CẤP (ĐÃ SỬA) ***
                            if (window.myCurrentStreakCount === 2) {
                                window.mySetCount_L2++;
                                console.log('%cSOCKET (Bank): +1 Bộ 2. Tổng: ${window.mySetCount_L2}', 'color: #9c27b0;');
                            } else if (window.myCurrentStreakCount === 3) {
                                if (window.mySetCount_L2 > 0) { window.mySetCount_L2--; }
                                window.mySetCount_L3++;
                                console.log('%cSOCKET (Bank): Thăng cấp lên L3. Tổng Bộ 3: ${window.mySetCount_L3}', 'color: #9c27b0;');
                            } else if (window.myCurrentStreakCount === 4) {
                                if (window.mySetCount_L3 > 0) { window.mySetCount_L3--; }
                                window.mySetCount_L4++;
                                console.log('%cSOCKET (Bank): Thăng cấp lên L4. Tổng Bộ 4: ${window.mySetCount_L4}', 'color: #9c27b0;');
                            } else if (window.myCurrentStreakCount === 5) {
                                if (window.mySetCount_L4 > 0) { window.mySetCount_L4--; }
                                window.mySetCount_L5++;
                                console.log('%cSOCKET (Bank): Thăng cấp lên L5. Tổng Bộ 5: ${window.mySetCount_L5}', 'color: #9c27b0;');
                            } else if (window.myCurrentStreakCount === 6) {
                                if (window.mySetCount_L5 > 0) { window.mySetCount_L5--; }
                                window.mySetCount_L6++;
                                console.log('%cSOCKET (Bank): Thăng cấp lên L6. Tổng Bộ 6: ${window.mySetCount_L6}', 'color: #9c27b0;');
                            }
                            // Ghi lại loại chuỗi để cược ngược
                            window.myLastBankedStreakType = window.myCurrentStreakType;
                    
                        } else {
                            // BẮT ĐẦU CHUỖI MỚI (hoặc ngắt chuỗi cũ)
                            console.log('%cSOCKET (Streak): Chuỗi bị ngắt, bắt đầu chuỗi mới! EID: ${currentWinningEid}', 'color: #ff9800;');
                            window.myCurrentStreakType = currentWinningEid;
                            window.myCurrentStreakCount = 1; // Bắt đầu đếm từ 1
                        }
                    } else {
                        // Vòng này không ra 2 hoặc 5 -> CHUỖI BỊ NGẮT
                        if (window.myCurrentStreakType !== null) {
                            console.log('%cSOCKET (Streak): Vòng này không phải 2/5. Chuỗi ${window.myCurrentStreakType} bị ngắt.', 'color: #f44336;');
                            window.myCurrentStreakType = null;
                            window.myCurrentStreakCount = 0;
                        }
                    }
                   
                    // In ra trạng thái "ngân hàng"
                    console.log('%cSOCKET (Bank Status): Bộ 2: ${window.mySetCount_L2} | Bộ 3: ${window.mySetCount_L3} | Bộ 4: ${window.mySetCount_L4} | Bộ 5: ${window.mySetCount_L5} | Bộ 6: ${window.mySetCount_L6}', 'color: #00bcd4; font-weight: bold;');
                    
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
                            console.log('%cSOCKET (Bank): Đã reset Bộ ${betTriggerLevel} về 0.', 'color: #f44336;');
                            
                            // <-- THAY ĐỔI QUAN TRỌNG: Reset bộ đếm 4 ván vì cược này được ưu tiên
                            window.myRoundCounter = 0; 
                            console.log('%cSOCKET (FixedBet): Cược Streak được ưu tiên, reset bộ đếm 4 ván.', 'color: #e91e63;');
                            
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
                    
                            console.log('%cSOCKET (Auto-Trigger): ${betReason} Kích hoạt cược!', 'color: red; font-style: italic; font-weight: bold;');
                            console.log('%cSOCKET (Auto-Trigger): Cược EID: ${eidToBet} | Số tiền: ${amountToBet} (Gấp thếp)', 'color: red;');
                    
                            // Đặt cờ chờ kết quả GẤP THẾP
                            window.isWaitingForResult = true;
                            window.myLastBetEid = eidToBet; // Lưu lại EID đã cược
                           
                            // Đợi 15 giây
                            setTimeout(() => {
                                const ridToSend = window.myBestRid || 6476537;
                                const messageArray = [5, "Simms", ridToSend, {"cmd": 900, "eid": eidToBet, "v": amountToBet}];
                                const messageString = JSON.stringify(messageArray);
                           
                                if (window.myLastUsedSocket && window.myLastUsedSocket.readyState === WebSocket.OPEN) {
                                    console.log('%cSOCKET (Auto-Send-Martingale): Đang gửi ⬆️', 'color: red; font-weight: bold;', messageString);
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
                            console.log('%cSOCKET (Auto-Trigger): ĐỦ 4 VÁN (không cược streak)! Kích hoạt cược 500đ.', 'color: #e91e63; font-style: italic; font-weight: bold;');
                            
                            window.myRoundCounter = 0; // Reset bộ đếm ván
                            const amountToBet = 500; // Cố định 500
                            const eidToBet = 2; // Cược mặc định EID 2 (bạn có thể đổi thành 5 nếu muốn)
                            
                            console.log('%cSOCKET (Auto-Trigger): Cược EID: ${eidToBet} | Số tiền: ${amountToBet} (Cố định)', 'color: #e91e63;');
                            
                            // Đặt cờ chờ kết quả CỐ ĐỊNH (không ảnh hưởng Martingale)
                            window.isWaitingForFixedBet = true; // <-- Cờ riêng
                            window.myLastBetEid = eidToBet; // Lưu lại EID đã cược
                            
                            // Gửi cược
                            setTimeout(() => {
                                const ridToSend = window.myBestRid || 6476537;
                                const messageArray = [5, "Simms", ridToSend, {"cmd": 900, "eid": eidToBet, "v": amountToBet}];
                                const messageString = JSON.stringify(messageArray);
                            
                                if (window.myLastUsedSocket && window.myLastUsedSocket.readyState === WebSocket.OPEN) {
                                    console.log('%cSOCKET (Auto-Send-Fixed): Đang gửi ⬆️', 'color: #e91e63; font-weight: bold;', messageString);
                                    window.myLastUsedSocket.send(messageString);
                                } else {
                                    console.error('SOCKET (Auto-Send-Fixed): Không thể gửi tin nhắn. Socket đã bị đóng.');
                                    window.isWaitingForFixedBet = false; // Hủy cược nếu socket đóng
                                    window.myLastBetEid = null;
                                }
                            }, 15000); // 15000ms = 15 giây
                        
                        } else {
                            // Không cược streak, cũng chưa đủ 4 ván
                            console.log('%cSOCKET (Auto-Trigger): Chưa đủ điều kiện cược (Streak: Thất bại, Ván: ${window.myRoundCounter}/4).', 'color: grey;');
                        }
                           
                    } else {
                        console.log('%cSOCKET (Auto-Trigger): Đang chờ kết quả cược trước, tạm dừng check cược mới.', 'color: grey;');
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
      logger && logger.log && logger.log('⚡ WEBSOCKET CREATED: ${params.url}');
      logger && logger.log && logger.log('   Request ID: ${params.requestId}');
      
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
