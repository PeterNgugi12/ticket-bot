const BaseModel = require('./BaseModel');

class EscrowModel extends BaseModel {
  constructor() {
    super('escrow');
  }

  async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS escrow (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        listing_id UUID NOT NULL REFERENCES resale_listings(id),
        buyer_id UUID NOT NULL REFERENCES users(id),
        seller_id UUID NOT NULL REFERENCES users(id),
        amount DECIMAL(12,2) NOT NULL,
        platform_fee DECIMAL(12,2) NOT NULL,
        seller_amount DECIMAL(12,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        payment_id UUID REFERENCES payments(id),
        released_at TIMESTAMP,
        release_date TIMESTAMP NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.db.query(query);
  }

  async createEscrow(escrowData) {
    const {
      listingId,
      buyerId,
      sellerId,
      amount,
      platformFee,
      sellerAmount,
      releaseDate,
      metadata = {},
    } = escrowData;

    const result = await this.db.query(
      `INSERT INTO escrow (
        listing_id, buyer_id, seller_id, amount, platform_fee,
        seller_amount, release_date, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [listingId, buyerId, sellerId, amount, platformFee, sellerAmount, releaseDate, metadata]
    );
    
    return result.rows[0];
  }

  async updateEscrowStatus(escrowId, status, updateData = {}) {
    const updates = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [status];
    let paramIndex = 2;

    if (status === 'released') {
      updates.push(`released_at = CURRENT_TIMESTAMP`);
    }

    if (updateData.paymentId) {
      updates.push(`payment_id = $${paramIndex}`);
      values.push(updateData.paymentId);
      paramIndex++;
    }

    values.push(escrowId);
    const query = `
      UPDATE escrow 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getPendingReleaseEscrow(limit = 100) {
    const result = await this.db.query(
      `SELECT e.*, 
        rl.ticket_id, rl.seller_id as listing_seller_id,
        t.ticket_number, t.event_id,
        u.full_name as buyer_name, u.phone_number as buyer_phone
       FROM escrow e
       JOIN resale_listings rl ON rl.id = e.listing_id
       JOIN tickets t ON t.id = rl.ticket_id
       JOIN users u ON u.id = e.buyer_id
       WHERE e.status = 'pending' AND e.release_date <= NOW()
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async getEscrowByListing(listingId) {
    const result = await this.db.query(
      'SELECT * FROM escrow WHERE listing_id = $1 ORDER BY created_at DESC',
      [listingId]
    );
    return result.rows[0];
  }
}

module.exports = new EscrowModel();