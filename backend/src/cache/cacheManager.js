const redisConfig = require('../config/redis');
const { CACHE_TTL } = require('./cacheKeys');

class CacheManager {
  constructor() {
    this.redis = redisConfig.getConnection('cache');
    this.defaultTTL = CACHE_TTL.STANDARD;
  }

  async get(key) {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    try {
      const serialized = typeof value === 'object' ? JSON.stringify(value) : value;
      
      if (ttl) {
        await this.redis.setex(key, ttl, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  async setnx(key, value, ttl = this.defaultTTL) {
    try {
      const serialized = typeof value === 'object' ? JSON.stringify(value) : value;
      const result = await this.redis.setnx(key, serialized);
      
      if (result === 1 && ttl) {
        await this.redis.expire(key, ttl);
      }
      
      return result === 1;
    } catch (error) {
      console.error('Cache setnx error:', error);
      return false;
    }
  }

  async del(key) {
    try {
      const result = await this.redis.del(key);
      return result > 0;
    } catch (error) {
      console.error('Cache del error:', error);
      return false;
    }
  }

  async delPattern(pattern) {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return keys.length;
    } catch (error) {
      console.error('Cache delPattern error:', error);
      return 0;
    }
  }

  async exists(key) {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  // ADD THIS METHOD - increment for rate limiting
  async increment(key, amount = 1) {
    try {
      const result = await this.redis.incrby(key, amount);
      return result;
    } catch (error) {
      console.error('Cache increment error:', error);
      return 0;
    }
  }

  // ADD THIS METHOD - expire for rate limiting
  async expire(key, seconds) {
    try {
      const result = await this.redis.expire(key, seconds);
      return result;
    } catch (error) {
      console.error('Cache expire error:', error);
      return 0;
    }
  }

  async getOrSet(key, fetchFunction, ttl = this.defaultTTL) {
    try {
      const cached = await this.get(key);
      if (cached !== null) {
        return cached;
      }
      
      const fresh = await fetchFunction();
      if (fresh !== null && fresh !== undefined) {
        await this.set(key, fresh, ttl);
      }
      return fresh;
    } catch (error) {
      console.error('Cache getOrSet error:', error);
      return await fetchFunction();
    }
  }

  async mget(keys) {
    try {
      const values = await this.redis.mget(keys);
      return values.map(value => {
        if (!value) return null;
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      });
    } catch (error) {
      console.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  async mset(keyValuePairs, ttl = this.defaultTTL) {
    try {
      const pipeline = this.redis.pipeline();
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const serialized = typeof value === 'object' ? JSON.stringify(value) : value;
        if (ttl) {
          pipeline.setex(key, ttl, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      }
      
      await pipeline.exec();
      return true;
    } catch (error) {
      console.error('Cache mset error:', error);
      return false;
    }
  }

  async sadd(key, ...members) {
    return await this.redis.sadd(key, ...members);
  }

  async srem(key, ...members) {
    return await this.redis.srem(key, ...members);
  }

  async smembers(key) {
    return await this.redis.smembers(key);
  }

  async sismember(key, member) {
    return await this.redis.sismember(key, member);
  }

  async zadd(key, score, member) {
    return await this.redis.zadd(key, score, member);
  }

  async zrange(key, start, stop, withScores = false) {
    if (withScores) {
      return await this.redis.zrange(key, start, stop, 'WITHSCORES');
    }
    return await this.redis.zrange(key, start, stop);
  }

  async hset(key, field, value) {
    const serialized = typeof value === 'object' ? JSON.stringify(value) : value;
    return await this.redis.hset(key, field, serialized);
  }

  async hget(key, field) {
    const value = await this.redis.hget(key, field);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  async hgetall(key) {
    const result = await this.redis.hgetall(key);
    if (!result) return {};
    
    const parsed = {};
    for (const [field, value] of Object.entries(result)) {
      try {
        parsed[field] = JSON.parse(value);
      } catch {
        parsed[field] = value;
      }
    }
    return parsed;
  }

  async flushAll() {
    return await this.redis.flushall();
  }

  async getTTL(key) {
    return await this.redis.ttl(key);
  }
}

// Singleton instance
const cacheManager = new CacheManager();
module.exports = cacheManager;