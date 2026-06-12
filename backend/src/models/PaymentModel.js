const BaseModel = require('./BaseModel');

class PaymentModel extends BaseModel {
  constructor() {
    super('payments');
  }

  async createPayment(paymentData) {
    const {
      userId,
      eventId,
      ticketId,
      amount,
      paymentMethod = 'mpesa',
      metadata = {},
    } = paymentData;

    const result = await this.db.query(
      `INSERT INTO payments (
        user_id, event_id, ticket_id, amount, payment_method, 
        status, metadata
      ) VALUES ($1, $2, $3, $4, $5, 'pending', $6)
      RETURNING *`,
      [userId, eventId, ticketId, amount, paymentMethod, metadata]
    );
    
    return result.rows[0];
  }

  async updatePaymentStatus(paymentId, status, mpesaData = {}) {
    const updates = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [status];
    let paramIndex = 2;

    if (status === 'completed') {
      updates.push(`completed_at = CURRENT_TIMESTAMP`);
    }

    if (mpesaData.mpesa_transaction_id) {
      updates.push(`mpesa_transaction_id = $${paramIndex}`);
      values.push(mpesaData.mpesa_transaction_id);
      paramIndex++;
    }

    if (mpesaData.checkout_request_id) {
      updates.push(`checkout_request_id = $${paramIndex}`);
      values.push(mpesaData.checkout_request_id);
      paramIndex++;
    }

    if (mpesaData.mpesa_result_code !== undefined) {
      updates.push(`mpesa_result_code = $${paramIndex}`);
      values.push(mpesaData.mpesa_result_code);
      paramIndex++;
    }

    if (mpesaData.mpesa_result_desc) {
      updates.push(`mpesa_result_desc = $${paramIndex}`);
      values.push(mpesaData.mpesa_result_desc);
      paramIndex++;
    }

    if (mpesaData.callback_received_at) {
      updates.push(`callback_received_at = $${paramIndex}`);
      values.push(mpesaData.callback_received_at);
      paramIndex++;
    }

    values.push(paymentId);
    const query = `
      UPDATE payments 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getPaymentByTransactionId(transactionId) {
    const result = await this.db.query(
      'SELECT * FROM payments WHERE mpesa_transaction_id = $1',
      [transactionId]
    );
    return result.rows[0];
  }

  async getPaymentByCheckoutRequestId(checkoutRequestId) {
    const result = await this.db.query(
      'SELECT * FROM payments WHERE checkout_request_id = $1',
      [checkoutRequestId]
    );
    return result.rows[0];
  }

  async getUserPayments(userId, limit = 50, offset = 0) {
    const result = await this.db.query(
      `SELECT p.*, e.title as event_title
       FROM payments p
       LEFT JOIN events e ON e.id = p.event_id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  async getEventPayments(eventId, status = null) {
    let query = `
      SELECT p.*, u.full_name as user_name, u.email as user_email
      FROM payments p
      JOIN users u ON u.id = p.user_id
      WHERE p.event_id = $1
    `;
    const values = [eventId];
    
    if (status) {
      query += ` AND p.status = $2`;
      values.push(status);
    }
    
    query += ` ORDER BY p.created_at DESC`;
    
    const result = await this.db.query(query, values);
    return result.rows;
  }

  async getPaymentStats(eventId = null) {
    let query = `
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_payments,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
        AVG(CASE WHEN status = 'completed' THEN amount ELSE NULL END) as average_ticket_price
      FROM payments
    `;
    const values = [];
    
    if (eventId) {
      query += ` WHERE event_id = $1`;
      values.push(eventId);
    }
    
    const result = await this.db.query(query, values);
    return result.rows[0];
  }
}

module.exports = new PaymentModel();