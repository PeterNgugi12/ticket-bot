const crypto = require('crypto');
const cacheManager = require('../cache/cacheManager');
const { CACHE_KEYS, CACHE_TTL } = require('../cache/cacheKeys');

class SessionService {
  constructor() {
    this.sessionTTL = CACHE_TTL.SESSION;
  }

  generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  async createSession(userId, metadata = {}) {
    const sessionToken = this.generateSessionToken();
    const sessionKey = CACHE_KEYS.USER_SESSION(sessionToken);
    
    const sessionData = {
      userId,
      token: sessionToken,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      ...metadata,
    };
    
    await cacheManager.set(sessionKey, sessionData, this.sessionTTL);
    
    // Store session mapping for user
    const userSessionsKey = `${CACHE_KEYS.USER(userId)}:sessions`;
    await cacheManager.sadd(userSessionsKey, sessionToken);
    await cacheManager.expire(userSessionsKey, this.sessionTTL);
    
    return sessionToken;
  }

  async getSession(sessionToken) {
    const sessionKey = CACHE_KEYS.USER_SESSION(sessionToken);
    const session = await cacheManager.get(sessionKey);
    
    if (session) {
      // Update last activity
      session.lastActivity = new Date().toISOString();
      await cacheManager.set(sessionKey, session, this.sessionTTL);
    }
    
    return session;
  }

  async destroySession(sessionToken) {
    const session = await this.getSession(sessionToken);
    if (session) {
      const sessionKey = CACHE_KEYS.USER_SESSION(sessionToken);
      await cacheManager.del(sessionKey);
      
      // Remove from user sessions set
      const userSessionsKey = `${CACHE_KEYS.USER(session.userId)}:sessions`;
      await cacheManager.srem(userSessionsKey, sessionToken);
    }
    return true;
  }

  async destroyAllUserSessions(userId) {
    const userSessionsKey = `${CACHE_KEYS.USER(userId)}:sessions`;
    const sessions = await cacheManager.smembers(userSessionsKey);
    
    for (const sessionToken of sessions) {
      const sessionKey = CACHE_KEYS.USER_SESSION(sessionToken);
      await cacheManager.del(sessionKey);
    }
    
    await cacheManager.del(userSessionsKey);
    return sessions.length;
  }

  async validateSession(sessionToken) {
    const session = await this.getSession(sessionToken);
    if (!session) return null;
    
    // Check if session expired
    const lastActivity = new Date(session.lastActivity);
    const now = new Date();
    const inactiveTime = (now - lastActivity) / 1000; // seconds
    
    if (inactiveTime > this.sessionTTL) {
      await this.destroySession(sessionToken);
      return null;
    }
    
    return session;
  }

  async refreshSession(sessionToken) {
    const session = await this.getSession(sessionToken);
    if (!session) return null;
    
    const sessionKey = CACHE_KEYS.USER_SESSION(sessionToken);
    await cacheManager.expire(sessionKey, this.sessionTTL);
    
    return session;
  }

  async getUserSessions(userId) {
    const userSessionsKey = `${CACHE_KEYS.USER(userId)}:sessions`;
    const sessionTokens = await cacheManager.smembers(userSessionsKey);
    
    const sessions = [];
    for (const token of sessionTokens) {
      const session = await this.getSession(token);
      if (session) {
        sessions.push(session);
      }
    }
    
    return sessions;
  }
}

// Singleton instance
const sessionService = new SessionService();
module.exports = sessionService;