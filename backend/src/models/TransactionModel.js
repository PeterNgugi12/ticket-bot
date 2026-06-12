const BaseModel = require('./BaseModel');

class TransactionModel extends BaseModel {
  constructor() {
    super('wallet_transactions');
  }

  async createTransaction(transactionData) {
    const {
      userId,
      amount,
      type,
      referenceId,
      description,
      balanceBefore,
      balanceAfter,
      metadata = {},
    } = transactionData;

    const result = await this.db.query(
      `INSERT INTO wallet_transactions (
        user_id, amount, type, reference_id, description,
        balance_before, balance_after, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [userId, amount, type, referenceId, description, balanceBefore, balanceAfter, metadata]
    );
    
    return result.rows[0];
  }

  async getUserTransactions(userId, limit = 50, offset = 0, type = null) {
    let query = `
      SELECT * FROM wallet_transactions 
      WHERE user_id = $1
    `;
    const values = [userId];
    let paramIndex = 2;

    if (type) {
      query += ` AND type = $${paramIndex}`;
      values.push(type);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const result = await this.db.query(query, values);
    return result.rows;
  }

  async getTransactionSummary(userId, days = 30) {
    const result = await this.db.query(
      `SELECT 
        type,
        COUNT(*) as count,
        SUM(amount) as total_amount
       FROM wallet_transactions
       WHERE user_id = $1 
         AND created_at > NOW() - INTERVAL '${days} days'
       GROUP BY type`,
      [userId]
    );
    return result.rows;
  }

  async getTransactionsByReference(referenceId) {
    const result = await this.db.query(
      'SELECT * FROM wallet_transactions WHERE reference_id = $1 ORDER BY created_at DESC',
      [referenceId]
    );
    return result.rows;
  }
}

module.exports = new TransactionModel();