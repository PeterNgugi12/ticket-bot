const BaseModel = require('./BaseModel');

class ResaleListingModel extends BaseModel {
  constructor() {
    super('resale_listings');
  }

  async createListing(listingData) {
    const {
      ticketId,
      sellerId,
      askingPrice,
      expiresAt,
      metadata = {},
    } = listingData;

    const result = await this.db.query(
      `INSERT INTO resale_listings (
        ticket_id, seller_id, asking_price, expires_at, metadata
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [ticketId, sellerId, askingPrice, expiresAt, metadata]
    );
    
    return result.rows[0];
  }

  async getActiveListings(eventId = null, limit = 50, offset = 0) {
    let query = `
      SELECT rl.*, 
        t.ticket_number, t.tier_id, t.attendee_name,
        tt.name as tier_name, tt.price as original_price,
        e.title as event_title, e.event_date, e.venue_name,
        u.full_name as seller_name
      FROM resale_listings rl
      JOIN tickets t ON t.id = rl.ticket_id
      JOIN ticket_tiers tt ON tt.id = t.tier_id
      JOIN events e ON e.id = t.event_id
      JOIN users u ON u.id = rl.seller_id
      WHERE rl.status = 'active' 
        AND rl.expires_at > NOW()
        AND t.status = 'valid'
    `;
    const values = [];
    let paramIndex = 1;

    if (eventId) {
      query += ` AND e.id = $${paramIndex}`;
      values.push(eventId);
      paramIndex++;
    }

    query += ` ORDER BY rl.asking_price ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const result = await this.db.query(query, values);
    return result.rows;
  }

  async getListingByTicket(ticketId) {
    const result = await this.db.query(
      `SELECT rl.*, 
        t.ticket_number, t.tier_id,
        tt.name as tier_name, tt.price as original_price,
        e.title as event_title, e.event_date, e.is_sold_out
       FROM resale_listings rl
       JOIN tickets t ON t.id = rl.ticket_id
       JOIN ticket_tiers tt ON tt.id = t.tier_id
       JOIN events e ON e.id = t.event_id
       WHERE rl.ticket_id = $1 AND rl.status = 'active' AND rl.expires_at > NOW()`,
      [ticketId]
    );
    return result.rows[0];
  }

  async getSellerListings(sellerId, status = null, limit = 50, offset = 0) {
    let query = `
      SELECT rl.*, 
        t.ticket_number, t.tier_id,
        tt.name as tier_name, tt.price as original_price,
        e.title as event_title, e.event_date
      FROM resale_listings rl
      JOIN tickets t ON t.id = rl.ticket_id
      JOIN ticket_tiers tt ON tt.id = t.tier_id
      JOIN events e ON e.id = t.event_id
      WHERE rl.seller_id = $1
    `;
    const values = [sellerId];
    let paramIndex = 2;

    if (status) {
      query += ` AND rl.status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    query += ` ORDER BY rl.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const result = await this.db.query(query, values);
    return result.rows;
  }

  async updateListingStatus(listingId, status, updateData = {}) {
    const updates = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [status];
    let paramIndex = 2;

    if (status === 'sold') {
      updates.push(`sold_at = CURRENT_TIMESTAMP`);
    }

    if (updateData.buyerId) {
      updates.push(`buyer_id = $${paramIndex}`);
      values.push(updateData.buyerId);
      paramIndex++;
    }

    if (updateData.platformFee !== undefined) {
      updates.push(`platform_fee = $${paramIndex}`);
      values.push(updateData.platformFee);
      paramIndex++;
    }

    if (updateData.sellerEarning !== undefined) {
      updates.push(`seller_earning = $${paramIndex}`);
      values.push(updateData.sellerEarning);
      paramIndex++;
    }

    values.push(listingId);
    const query = `
      UPDATE resale_listings 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async expireListings() {
    const result = await this.db.query(
      `UPDATE resale_listings 
       SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'active' AND expires_at < NOW()
       RETURNING *`
    );
    return result.rows;
  }

  async getMarketplaceStats(eventId = null) {
    let query = `
      SELECT 
        COUNT(*) as total_listings,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_listings,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_listings,
        AVG(asking_price) as avg_asking_price,
        SUM(CASE WHEN status = 'sold' THEN platform_fee ELSE 0 END) as total_fees_collected,
        SUM(CASE WHEN status = 'sold' THEN seller_earning ELSE 0 END) as total_seller_earnings
      FROM resale_listings rl
      JOIN tickets t ON t.id = rl.ticket_id
    `;
    const values = [];

    if (eventId) {
      query += ` WHERE t.event_id = $1`;
      values.push(eventId);
    }

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async checkResaleAllowed(ticketId) {
    const result = await this.db.query(
      `SELECT e.id, e.is_sold_out, e.status, e.event_date,
        t.status as ticket_status
       FROM tickets t
       JOIN events e ON e.id = t.event_id
       WHERE t.id = $1`,
      [ticketId]
    );
    
    const data = result.rows[0];
    
    if (!data) {
      return { allowed: false, reason: 'Ticket not found' };
    }
    
    if (data.ticket_status !== 'valid') {
      return { allowed: false, reason: `Ticket is ${data.ticket_status}` };
    }
    
    if (data.status !== 'published') {
      return { allowed: false, reason: 'Event is not active' };
    }
    
    if (new Date(data.event_date) < new Date()) {
      return { allowed: false, reason: 'Event has already passed' };
    }
    
    // CRITICAL RULE: Cannot resell if event is sold out
    if (data.is_sold_out) {
      return { 
        allowed: false, 
        reason: 'Cannot resell ticket - Event is sold out. Only original tickets can be resold when tickets are still available from organizer.' 
      };
    }
    
    return { allowed: true };
  }
}

module.exports = new ResaleListingModel();