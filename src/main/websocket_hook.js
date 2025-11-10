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
      console.log(\`%cĐang "hook" vào WebSocket. Chỉ theo dõi URL: \${targetUrl}\`, 'color: blue; font-weight: bold;');
      
      // Biến toàn cục để lưu ID phòng tốt nhất
      window.myBestRid = null; 
      
      // 2. Hook vào hàm 'send' (Giữ nguyên)
      if (!window.OriginalWebSocketSend) {
        window.OriginalWebSocketSend = WebSocket.prototype.send;
      }
      WebSocket.prototype.send = function(data) {
        if (this.url === targetUrl) {
          console.log('%cSOCKET (Target): Đang gửi ⬆️', 'color: orange; font-weight: bold;', data);
          window.myLastUsedSocket = this; // Lưu lại socket
          console.log('%cSOCKET: Đã bắt được và lưu vào "window.myLastUsedSocket"', 'color: #9c27b0; font-weight: bold;');
        }
        window.OriginalWebSocketSend.apply(this, arguments);
      };
      
      // 3. Hook vào hàm 'onmessage' (ĐÃ SỬA ĐỔI)
      Object.defineProperty(WebSocket.prototype, 'onmessage', {
        set: function(originalCallback) {
          // Tạo một hàm callback mới để bọc hàm gốc
          const newCallback = function(event) {
            // Logic gốc: Log tin nhắn đến và lưu socket
            if (this.url === targetUrl) {
              console.log('%cSOCKET (Target): Đã nhận ⬇️', 'color: green; font-weight: bold;', event.data);
              window.myLastUsedSocket = this; // Cũng lưu lại socket
              
              const receivedData = event.data;
              let parsedData;
              let command;
              
              // Cố gắng parse JSON để lấy 'cmd' một cách an toàn
              try {
                parsedData = JSON.parse(receivedData);
                // 'cmd' thường nằm ở phần tử thứ 2 (index 1)
                if (Array.isArray(parsedData) && parsedData[1] && parsedData[1].cmd) {
                  command = parsedData[1].cmd;
                }
              } catch (e) {
                // Không phải JSON hoặc định dạng không mong muốn, bỏ qua
              }
              
              // --- LOGIC 1: TÌM VÀ LƯU PHÒNG TỐT NHẤT (TỪ cmd: 300) ---
              if (command === 300) {
                let roomList = null;
                
                // Kiểm tra 2 định dạng message 'cmd: 300' mà chúng ta đã thấy
                if (parsedData[1].rs) { 
                  // Dạng 2: [5, {"rs": [...], "cmd": 300}]
                  roomList = parsedData[1].rs;
                } else if (Array.isArray(parsedData[0])) { 
                  // Dạng 1: [ [...], {"cmd": 300}]
                  roomList = parsedData[0];
                }
                
                if (roomList && roomList.length > 0) {
                  // Tìm phòng có uC (user count) lớn nhất
                  const bestRoom = roomList.reduce((maxRoom, currentRoom) => {
                    return (currentRoom.uC > maxRoom.uC) ? currentRoom : maxRoom;
                  }, roomList[0]); // Bắt đầu với phòng đầu tiên
                  
                  if (bestRoom && bestRoom.rid) {
                    window.myBestRid = bestRoom.rid;
                    console.log(\`%cSOCKET (Auto-Find): Đã cập nhật phòng tốt nhất. RID: \${window.myBestRid} (với \${bestRoom.uC} người)\`, 'color: #00bcd4; font-weight: bold;');
                  }
                }
              }
              
              // --- LOGIC 2: KÍCH HOẠT GỬI TIN (TỪ cmd: 907) ---
              // Vẫn dùng string check cho an toàn, phòng trường hợp 'cmd' không parse được
              if (receivedData.startsWith('[5,') && receivedData.includes('"cmd":907')) {
                console.log('%cSOCKET (Auto-Trigger): Phát hiện "cmd":907. Đang chờ 15 giây...', 'color: red; font-style: italic;');
                
                // Đợi 15 giây (15000 mili giây)
                setTimeout(() => {
                  // **QUAN TRỌNG:** Lấy rid đã lưu.
                  // Nếu chưa tìm thấy (myBestRid là null), thì dùng giá trị cũ 6476537 làm dự phòng.
                  const ridToSend = window.myBestRid || 6476537;
                  
                  console.log(\`%cSOCKET (Auto-Trigger): Chuẩn bị gửi message với RID: \${ridToSend}\`, 'color: red;');
                  
                  const messageArray = [5, "Simms", ridToSend, {"cmd": 900, "eid": 2, "v": 500}];
                  const messageString = JSON.stringify(messageArray);
                  
                  // Kiểm tra xem socket còn tồn tại và đang mở không
                  if (window.myLastUsedSocket && window.myLastUsedSocket.readyState === WebSocket.OPEN) {
                    console.log('%cSOCKET (Auto-Send): Đang gửi ⬆️', 'color: red; font-weight: bold;', messageString);
                    window.myLastUsedSocket.send(messageString);
                  } else {
                    console.error('SOCKET (Auto-Send): Không thể gửi tin nhắn. Socket đã bị đóng hoặc không tồn tại.');
                  }
                }, 15000); // 15000ms = 15 giây
              }
              // --- KẾT THÚC LOGIC MỚI ---
            }
            
            // Gọi hàm callback gốc (nếu có) để ứng dụng web không bị hỏng
            if (originalCallback) {
              originalCallback.apply(this, arguments);
            }
          };
          // Gán hàm callback mới
          this.addEventListener('message', newCallback, false);
        }
      });
      
      console.log('%c✅ WebSocket Hook đã được cài đặt thành công!', 'color: green; font-weight: bold; font-size: 14px;');
    `;

    // Inject the hook script before any page loads
    await page.evaluateOnNewDocument(hookScript);
    
    logger && logger.log && logger.log('✓ WebSocket hook script injected successfully');
    logger && logger.log && logger.log('✓ Hook will activate when WebSocket is created');
    
    // Setup additional listener for WebSocket messages
    const sendScript = `
      // Setup listener for messages from server
      if (window.myLastUsedSocket) {
        window.myLastUsedSocket.onmessage = (event) => {
          console.log('📬 Nhận được tin nhắn từ server: ', event.data);
        };
        console.log('--- ✅ HOÀN TẤT HOOK ---');
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
    });
    
    // Listen for WebSocket frames (messages)
    client.on('Network.webSocketFrameSent', (params) => {
      logger && logger.log && logger.log(`⬆️ WebSocket SENT: ${params.response.payloadData}`);
    });
    
    client.on('Network.webSocketFrameReceived', (params) => {
      logger && logger.log && logger.log(`⬇️ WebSocket RECEIVED: ${params.response.payloadData}`);
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
        console.log('%cManual Send: Đang gửi ⬆️', 'color: purple; font-weight: bold;', msg);
        window.myLastUsedSocket.send(msg);
        return { success: true, message: 'Message sent successfully' };
      } else {
        return { success: false, message: 'Socket not available or not open' };
      }
    }, messageString);
    
    if (result.success) {
      logger && logger.log && logger.log(`✓ Message sent: ${messageString}`);
    } else {
      logger && logger.warn && logger.warn(`⚠️ Could not send message: ${result.message}`);
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
