/**
 * Session Manager - Quản lý multiple user sessions
 * Mỗi user có thể có nhiều sessions độc lập
 */

const { v4: uuidv4 } = require('uuid');

class SessionManager {
  constructor() {
    this.sessions = new Map(); // Map<sessionId, SessionData>
    this.userSessions = new Map(); // Map<userId, Set<sessionId>>
    
    // Start cleanup interval
    this.startCleanupInterval();
  }
  
  /**
   * Tạo session mới cho user
   */
  createSession(userId, config = {}) {
    const sessionId = uuidv4();
    
    const session = {
      sessionId: sessionId,
      userId: userId,
      browser: null,
      page: null,
      goLoginInstance: null,
      config: {
        url: config.url || '',
        username: config.username || '',
        password: config.password || '',
        baseBet: config.baseBet || 500,
        headless: config.headless !== false, // Default true (chạy ngầm)
        useGoLogin: config.useGoLogin || false,
        goLoginToken: config.goLoginToken || '',
        goLoginProfileId: config.goLoginProfileId || '',
        goLoginWsEndpoint: config.goLoginWsEndpoint || '',
        ...config
      },
      stats: {
        bankStatus: { L2: 0, L3: 0, L4: 0, L5: 0, L6: 0 },
        currentBalance: 1000,
        totalBets: 0,
        totalWins: 0,
        totalLosses: 0,
        totalWinAmount: 0,
        totalLossAmount: 0,
        currentWinStreak: 0,
        currentLossStreak: 0,
        maxWinStreak: 0,
        maxLossStreak: 0
      },
      status: 'idle', // idle, running, paused, stopped, error
      error: null,
      createdAt: new Date(),
      lastActivity: new Date()
    };
    
    this.sessions.set(sessionId, session);
    
    // Track user sessions
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId).add(sessionId);
    
    console.log(`✓ Created session ${sessionId} for user ${userId}`);
    
    return sessionId;
  }
  
  /**
   * Lấy session theo ID
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }
  
  /**
   * Lấy tất cả sessions của user
   */
  getUserSessions(userId) {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) return [];
    
    return Array.from(sessionIds)
      .map(id => this.sessions.get(id))
      .filter(session => session !== undefined);
  }
  
  /**
   * Update session data
   */
  updateSession(sessionId, updates) {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
      session.lastActivity = new Date();
      return true;
    }
    return false;
  }
  
  /**
   * Update session stats
   */
  updateSessionStats(sessionId, statsUpdates) {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session.stats, statsUpdates);
      session.lastActivity = new Date();
      return true;
    }
    return false;
  }
  
  /**
   * Xóa session
   */
  async deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      // Cleanup browser resources
      try {
        if (session.page) {
          await session.page.close().catch(e => console.error('Error closing page:', e.message));
        }
        
        if (session.goLoginInstance) {
          await session.goLoginInstance.stop().catch(e => console.error('Error stopping GoLogin:', e.message));
        } else if (session.browser) {
          await session.browser.close().catch(e => console.error('Error closing browser:', e.message));
        }
      } catch (error) {
        console.error(`Error cleaning up session ${sessionId}:`, error.message);
      }
      
      // Remove from tracking
      this.sessions.delete(sessionId);
      
      if (this.userSessions.has(session.userId)) {
        this.userSessions.get(session.userId).delete(sessionId);
      }
      
      console.log(`✓ Deleted session ${sessionId}`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Broadcast message to specific session
   */
  broadcastToSession(sessionId, message) {
    if (global.broadcastToClients) {
      global.broadcastToClients({
        ...message,
        sessionId: sessionId,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Get active sessions count
   */
  getActiveSessionsCount() {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'running').length;
  }
  
  /**
   * Get total sessions count
   */
  getTotalSessionsCount() {
    return this.sessions.size;
  }
  
  /**
   * Get user session count
   */
  getUserSessionCount(userId) {
    const sessionIds = this.userSessions.get(userId);
    return sessionIds ? sessionIds.size : 0;
  }
  
  /**
   * Check if user can create more sessions
   */
  canCreateSession(userId, maxSessionsPerUser = 20) {
    return this.getUserSessionCount(userId) < maxSessionsPerUser;
  }
  
  /**
   * Cleanup inactive sessions (older than timeout)
   */
  async cleanupInactiveSessions(timeoutMinutes = 720) {
    const now = new Date();
    const sessionsToDelete = [];
    
    for (const [sessionId, session] of this.sessions) {
      const inactiveTime = (now - session.lastActivity) / 1000 / 60; // minutes
      
      // Cleanup if: inactive for too long AND not running
      if (inactiveTime > timeoutMinutes && session.status !== 'running') {
        sessionsToDelete.push(sessionId);
      }
      
      // Cleanup if: error state for too long
      if (session.status === 'error' && inactiveTime > 10) {
        sessionsToDelete.push(sessionId);
      }
    }
    
    for (const sessionId of sessionsToDelete) {
      await this.deleteSession(sessionId);
    }
    
    if (sessionsToDelete.length > 0) {
      console.log(`🧹 Cleaned up ${sessionsToDelete.length} inactive sessions`);
    }
    
    return sessionsToDelete.length;
  }
  
  /**
   * Start automatic cleanup interval
   */
  startCleanupInterval() {
    // Cleanup every 5 minutes
    setInterval(async () => {
      await this.cleanupInactiveSessions(720);
    }, 5 * 60 * 1000);
    
    console.log('✓ Session cleanup interval started (every 5 minutes)');
  }
  
  /**
   * Get session statistics
   */
  getStatistics() {
    const stats = {
      totalSessions: this.sessions.size,
      totalUsers: this.userSessions.size,
      activeSessions: 0,
      idleSessions: 0,
      errorSessions: 0,
      goLoginSessions: 0,
      headlessSessions: 0
    };
    
    for (const session of this.sessions.values()) {
      if (session.status === 'running') stats.activeSessions++;
      if (session.status === 'idle') stats.idleSessions++;
      if (session.status === 'error') stats.errorSessions++;
      if (session.config.useGoLogin) stats.goLoginSessions++;
      if (session.config.headless) stats.headlessSessions++;
    }
    
    return stats;
  }
}

// Singleton instance
const sessionManager = new SessionManager();

module.exports = sessionManager;
