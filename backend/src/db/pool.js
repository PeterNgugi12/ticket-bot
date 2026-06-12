const { Pool } = require('pg');
const config = require('../config/database');

class DatabasePool {
  constructor() {
    if (!DatabasePool.instance) {
      console.log('🔄 Initializing PostgreSQL connection pool...');
      this.pool = new Pool(config);
      
      // Event listeners for pool monitoring
      this.pool.on('connect', () => {
        console.log('✅ New database connection established');
      });
      
      this.pool.on('acquire', () => {
        // console.log('🔒 Client acquired from pool');
      });
      
      this.pool.on('remove', () => {
        console.log('🔓 Client removed from pool');
      });
      
      this.pool.on('error', (err) => {
        console.error('❌ Unexpected database pool error:', err);
      });
      
      DatabasePool.instance = this;
    }
    
    return DatabasePool.instance;
  }
  
  async query(text, params) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      // Log slow queries (>100ms)
      if (duration > 100) {
        console.warn(`⚠️ Slow query (${duration}ms):`, { text, params });
      }
      
      return result;
    } catch (error) {
      console.error('❌ Database query error:', { error: error.message, text, params });
      throw error;
    }
  }
  
  async getClient() {
    return await this.pool.connect();
  }
  
  async transaction(callback) {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  async healthCheck() {
    try {
      const result = await this.query('SELECT NOW() as current_time, 1 as healthy');
      return {
        healthy: true,
        timestamp: result.rows[0].current_time,
        poolStats: {
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
      };
    }
  }
  
  async close() {
    await this.pool.end();
    console.log('🔌 Database pool closed');
  }
}

// Singleton instance
const dbPool = new DatabasePool();
module.exports = dbPool;