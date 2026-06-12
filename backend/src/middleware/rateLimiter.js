const cacheManager = require('../cache/cacheManager');
const { CACHE_KEYS, CACHE_TTL } = require('../cache/cacheKeys');

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute default
    this.maxRequests = options.maxRequests || 1000;
    this.keyPrefix = options.keyPrefix || 'rate_limit';
  }

  async isRateLimited(identifier, endpoint = 'default') {
    const key = `${this.keyPrefix}:${identifier}:${endpoint}`;
    const current = await cacheManager.increment(key, 1);
    
    if (current === 1) {
      // First request, set expiration
      await cacheManager.expire(key, Math.ceil(this.windowMs / 1000));
    }
    
    return current > this.maxRequests;
  }

  async getRemainingRequests(identifier, endpoint = 'default') {
    const key = `${this.keyPrefix}:${identifier}:${endpoint}`;
    const current = await cacheManager.get(key);
    const count = current ? parseInt(current) : 0;
    
    return Math.max(0, this.maxRequests - count);
  }

  async getResetTime(identifier, endpoint = 'default') {
    const key = `${this.keyPrefix}:${identifier}:${endpoint}`;
    const ttl = await cacheManager.getTTL(key);
    
    if (ttl <= 0) return Date.now();
    return Date.now() + (ttl * 1000);
  }
}

// Middleware factory
const rateLimitMiddleware = (options = {}) => {
  const limiter = new RateLimiter(options);
  
  return async (req, res, next) => {
    // Get client identifier (IP or user ID if authenticated)
    const identifier = req.user?.id || req.ip;
    const endpoint = req.baseUrl + req.route?.path || req.path;
    
    const isLimited = await limiter.isRateLimited(identifier, endpoint);
    const remaining = await limiter.getRemainingRequests(identifier, endpoint);
    const resetTime = await limiter.getResetTime(identifier, endpoint);
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limiter.maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());
    
    if (isLimited) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Max ${limiter.maxRequests} requests per ${limiter.windowMs / 1000} seconds.`,
        retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
      });
    }
    
    next();
  };
};

module.exports = { RateLimiter, rateLimitMiddleware };