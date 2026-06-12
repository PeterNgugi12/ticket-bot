const BaseModel = require('./BaseModel');
const Decimal = require('decimal.js');

class WalletModel extends BaseModel {
  constructor() {
    super('wallets');
  }

  async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS wallets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        balance DECIMAL(12,2) DEFAULT 0.00,
        total_deposited DECIMAL(12,2) DEFAULT 0.00,
        total_withdrawn DECIMAL(12,2) DEFAULT 0.00,
        total_cashback DECIMAL(12,2) DEFAULT 0.00,
        total_spent DECIMAL(12,2) DEFAULT 0.00,
        pending_withdrawals DECIMAL(12,2) DEFAULT 0.00,
        is_locked BOOLEAN DEFAULT FALSE,
        locked_at TIMESTAMP,
        lock_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.db.query(query);
  }

  async createWallet(userId) {
    const result = await this.db.query(
      `INSERT INTO wallets (user_id) VALUES ($1) RETURNING *`,
      [userId]
    );
    return result.rows[0];
  }

  async getWallet(userId) {
    let result = await this.db.query(
      'SELECT * FROM wallets WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return await this.createWallet(userId);
    }
    
    return result.rows[0];
  }

  async getBalance(userId) {
    const wallet = await this.getWallet(userId);
    return new Decimal(wallet.balance);
  }

  async credit(userId, amount, metadata = {}) {
    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      const wallet = await this.getWallet(userId);
      const newBalance = new Decimal(wallet.balance).plus(amount);
      
      const result = await client.query(
        `UPDATE wallets 
         SET balance = $1, 
             total_deposited = total_deposited + $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $3
         RETURNING *`,
        [newBalance.toNumber(), amount, userId]
      );
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async debit(userId, amount, metadata = {}) {
    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      const wallet = await this.getWallet(userId);
      const currentBalance = new Decimal(wallet.balance);
      
      if (currentBalance.lessThan(amount)) {
        throw new Error('Insufficient balance');
      }
      
      const newBalance = currentBalance.minus(amount);
      
      const result = await client.query(
        `UPDATE wallets 
         SET balance = $1, 
             total_withdrawn = total_withdrawn + $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $3
         RETURNING *`,
        [newBalance.toNumber(), amount, userId]
      );
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async addCashback(userId, amount, metadata = {}) {
    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      const wallet = await this.getWallet(userId);
      const newBalance = new Decimal(wallet.balance).plus(amount);
      
      const result = await client.query(
        `UPDATE wallets 
         SET balance = $1, 
             total_cashback = total_cashback + $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $3
         RETURNING *`,
        [newBalance.toNumber(), amount, userId]
      );
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async lockWallet(userId, reason) {
    const result = await this.db.query(
      `UPDATE wallets 
       SET is_locked = TRUE, 
           locked_at = CURRENT_TIMESTAMP, 
           lock_reason = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2
       RETURNING *`,
      [reason, userId]
    );
    return result.rows[0];
  }

  async unlockWallet(userId) {
    const result = await this.db.query(
      `UPDATE wallets 
       SET is_locked = FALSE, 
           locked_at = NULL, 
           lock_reason = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1
       RETURNING *`,
      [userId]
    );
    return result.rows[0];
  }

  async getWalletStats() {
    const result = await this.db.query(`
      SELECT 
        COUNT(*) as total_wallets,
        SUM(balance) as total_balance,
        AVG(balance) as avg_balance,
        SUM(total_deposited) as total_deposited,
        SUM(total_withdrawn) as total_withdrawn,
        SUM(total_cashback) as total_cashback,
        COUNT(CASE WHEN is_locked = TRUE THEN 1 END) as locked_wallets
      FROM wallets
    `);
    return result.rows[0];
  }
}

module.exports = new WalletModel();