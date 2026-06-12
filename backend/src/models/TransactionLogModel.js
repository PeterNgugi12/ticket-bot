const BaseModel = require('./BaseModel');

class TransactionLogModel extends BaseModel {
  constructor() {
    super('transaction_logs');
  }

  async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS transaction_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        transaction_id VARCHAR(100) UNIQUE NOT NULL,
        checkout_request_id VARCHAR(100),
        merchant_request_id VARCHAR(100),
        transaction_type VARCHAR(50),
        amount DECIMAL(10,2),
        phone_number VARCHAR(20),
        result_code INTEGER,
        result_desc TEXT,
        mpesa_receipt_number VARCHAR(50),
        transaction_date TIMESTAMP,
        status VARCHAR(50) DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        callback_payload JSONB,
        callback_received_at TIMESTAMP,
        processed_at TIMESTAMP,
        error_message TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_transaction_id (transaction_id),
        INDEX idx_checkout_request (checkout_request_id),
        INDEX idx_status (status),
        INDEX idx_created (created_at)
      )
    `;
    await this.db.query(query);
  }

  async createLog(logData) {
    const result = await this.db.query(
      `INSERT INTO transaction_logs (
        transaction_id, checkout_request_id, merchant_request_id,
        transaction_type, amount, phone_number, callback_payload,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        logData.transaction_id,
        logData.checkout_request_id,
        logData.merchant_request_id,
        logData.transaction_type || 'stk_push',
        logData.amount,
        logData.phone_number,
        logData.callback_payload,
        logData.metadata,
      ]
    );
    return result.rows[0];
  }

  async updateLog(transactionId, updateData) {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = [
      'result_code', 'result_desc', 'mpesa_receipt_number',
      'transaction_date', 'status', 'retry_count', 'processed_at',
      'error_message', 'callback_received_at'
    ];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        values.push(updateData[field]);
        paramIndex++;
      }
    }

    if (updates.length === 0) return null;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(transactionId);

    const query = `
      UPDATE transaction_logs 
      SET ${updates.join(', ')}
      WHERE transaction_id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getByCheckoutRequestId(checkoutRequestId) {
    const result = await this.db.query(
      'SELECT * FROM transaction_logs WHERE checkout_request_id = $1 ORDER BY created_at DESC LIMIT 1',
      [checkoutRequestId]
    );
    return result.rows[0];
  }

  async getByTransactionId(transactionId) {
    const result = await this.db.query(
      'SELECT * FROM transaction_logs WHERE transaction_id = $1',
      [transactionId]
    );
    return result.rows[0];
  }

  async getPendingTransactions(limit = 100) {
    const result = await this.db.query(
      `SELECT * FROM transaction_logs 
       WHERE status IN ('pending', 'processing') 
       AND created_at > NOW() - INTERVAL '1 hour'
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async getFailedTransactions(limit = 100) {
    const result = await this.db.query(
      `SELECT * FROM transaction_logs 
       WHERE status = 'failed' 
       AND retry_count < 5
       AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}

module.exports = new TransactionLogModel();