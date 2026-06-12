const Redis = require('ioredis');
const config = require('./index');

class RedisConfig {
  constructor() {
    this.connections = new Map();
  }

  getConnection(name = 'default', options = {}) {
    if (this.connections.has(name)) {
      return this.connections.get(name);
    }

    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB, 10) || 0,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`🔄 Redis reconnecting in ${delay}ms... (attempt ${times})`);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      connectTimeout: 10000,
      disconnectTimeout: 2000,
      commandTimeout: 5000,
      keepAlive: 30000,
      family: 4,
      ...options,
    };

    // Use Redis URL if provided
    if (process.env.REDIS_URL) {
      const redis = new Redis(process.env.REDIS_URL, redisConfig);
      this.connections.set(name, redis);
      return redis;
    }

    const redis = new Redis(redisConfig);
    
    // Event handlers
    redis.on('connect', () => {
      console.log(`✅ Redis connection established [${name}]`);
    });

    redis.on('ready', () => {
      console.log(`🎯 Redis is ready [${name}]`);
    });

    redis.on('error', (err) => {
      console.error(`❌ Redis error [${name}]:`, err);
    });

    redis.on('close', () => {
      console.warn(`⚠️ Redis connection closed [${name}]`);
    });

    redis.on('reconnecting', () => {
      console.log(`🔄 Redis reconnecting [${name}]`);
    });

    this.connections.set(name, redis);
    return redis;
  }

  async closeAll() {
    const closePromises = [];
    for (const [name, connection] of this.connections) {
      console.log(`🔌 Closing Redis connection: ${name}`);
      closePromises.push(connection.quit());
    }
    await Promise.all(closePromises);
    console.log('✅ All Redis connections closed');
  }

  async healthCheck() {
    try {
      const defaultClient = this.getConnection('health');
      const ping = await defaultClient.ping();
      const info = await defaultClient.info();
      
      // Parse memory info
      const memoryMatch = info.match(/used_memory_human:(\d+\.?\d* \w+)/);
      const connectedClientsMatch = info.match(/connected_clients:(\d+)/);
      
      return {
        healthy: ping === 'PONG',
        version: info.match(/redis_version:(\d+\.\d+\.\d+)/)?.[1],
        uptime: parseInt(info.match(/uptime_in_seconds:(\d+)/)?.[1] || 0),
        usedMemory: memoryMatch ? memoryMatch[1] : 'unknown',
        connectedClients: connectedClientsMatch ? parseInt(connectedClientsMatch[1]) : 0,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// Singleton instance
const redisConfig = new RedisConfig();
module.exports = redisConfig;