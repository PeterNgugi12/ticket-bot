const BaseModel = require('./BaseModel');

class WithdrawalModel extends BaseModel {
  constructor() {
    super('withdrawals');
  }

  async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS withdrawals (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id),
        amount DECIMAL(12,2) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        transaction_id VARCHAR(100),
        mpesa_result_code INTEGER,
        mpesa_result_desc TEXT,
        processed_at TIMESTAMP,
        completed_at TIMESTAMP,
        rejection_reason TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.db.query(query);
  }

  async createWithdrawal(withdrawalData) {
    const {
      userId,
      amount,
      phoneNumber,
      metadata = {},
    } = withdrawalData;

    const result = await this.db.query(
      `INSERT INTO withdrawals (user_id, amount, phone_number, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, amount, phoneNumber, metadata]
    );
    
    return result.rows[0];
  }

  async updateWithdrawalStatus(withdrawalId, status, updateData = {}) {
    const updates = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [status];
    let paramIndex = 2;

    if (status === 'processing') {
      updates.push(`processed_at = CURRENT_TIMESTAMP`);
    }

    if (status === 'completed') {
      updates.push(`completed_at = CURRENT_TIMESTAMP`);
    }

    if (updateData.transactionId) {
      updates.push(`transaction_id = $${paramIndex}`);
      values.push(updateData.transactionId);
      paramIndex++;
    }

    if (updateData.mpesaResultCode !== undefined) {
      updates.push(`mpesa_result_code = $${paramIndex}`);
      values.push(updateData.mpesaResultCode);
      paramIndex++;
    }

    if (updateData.mpesaResultDesc) {
      updates.push(`mpesa_result_desc = $${paramIndex}`);
      values.push(updateData.mpesaResultDesc);
      paramIndex++;
    }

    if (updateData.rejectionReason) {
      updates.push(`rejection_reason = $${paramIndex}`);
      values.push(updateData.rejectionReason);
      paramIndex++;
    }

    values.push(withdrawalId);
    const query = `
      UPDATE withdrawals 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getUserWithdrawals(userId, status = null, limit = 50, offset = 0) {
    let query = `
      SELECT * FROM withdrawals 
      WHERE user_id = $1
    `;
    const values = [userId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const result = await this.db.query(query, values);
    return result.rows;
  }

  async getPendingWithdrawals(limit = 100) {
    const result = await this.db.query(
      `SELECT w.*, u.full_name, u.email, u.phone_number
       FROM withdrawals w
       JOIN users u ON u.id = w.user_id
       WHERE w.status = 'pending'
       ORDER BY w.created_at ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async getWithdrawalStats(userId = null) {
    let query = `
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as completed_amount,
        SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END) as failed_amount,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
      FROM withdrawals
    `;
    const values = [];

    if (userId) {
      query += ` WHERE user_id = $1`;
      values.push(userId);
    }

    const result = await this.db.query(query, values);
    return result.rows[0];
  }
}

module.exports = new WithdrawalModel();