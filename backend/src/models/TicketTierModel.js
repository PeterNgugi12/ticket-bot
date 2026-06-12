const BaseModel = require('./BaseModel');

class TicketTierModel extends BaseModel {
  constructor() {
    super('ticket_tiers');
  }

  async createTier(tierData) {
    const {
      eventId,
      name,
      price,
      quantity,
      benefits = [],
      maxPerPerson = 5,
    } = tierData;

    const result = await this.db.query(
      `INSERT INTO ticket_tiers (
        event_id, name, price, quantity, remaining_count, 
        benefits, max_per_person
      ) VALUES ($1, $2, $3, $4, $4, $5, $6)
      RETURNING *`,
      [eventId, name, price, quantity, benefits, maxPerPerson]
    );
    
    return result.rows[0];
  }

  async getEventTiers(eventId) {
    const result = await this.db.query(
      'SELECT * FROM ticket_tiers WHERE event_id = $1 AND is_active = true ORDER BY price ASC',
      [eventId]
    );
    return result.rows;
  }

  async updateTier(tierId, tierData) {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = ['name', 'price', 'quantity', 'benefits', 'max_per_person', 'is_active'];

    for (const field of allowedFields) {
      if (tierData[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        values.push(tierData[field]);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return await this.findById(tierId);
    }

    values.push(tierId);
    const query = `
      UPDATE ticket_tiers 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async updateSoldCount(tierId) {
    await this.db.query(
      `UPDATE ticket_tiers 
       SET sold_count = (
         SELECT COALESCE(SUM(quantity), 0) 
         FROM tickets 
         WHERE tier_id = $1 AND status = 'valid'
       ),
       remaining_count = quantity - sold_count
       WHERE id = $1`,
      [tierId]
    );
  }

  async checkAvailability(tierId, requestedQuantity) {
    const result = await this.db.query(
      'SELECT remaining_count FROM ticket_tiers WHERE id = $1 AND is_active = true',
      [tierId]
    );
    
    if (result.rows.length === 0) {
      return { available: false, reason: 'Tier not found' };
    }
    
    const remaining = result.rows[0].remaining_count;
    if (remaining < requestedQuantity) {
      return { available: false, reason: 'Insufficient tickets', remaining };
    }
    
    return { available: true, remaining };
  }
}

module.exports = new TicketTierModel();