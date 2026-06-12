const BaseModel = require('./BaseModel');
const cryptoUtil = require('../utils/crypto');
const { nanoid } = require('nanoid');

class TicketModel extends BaseModel {
  constructor() {
    super('tickets');
  }

 async createTicket(ticketData) {
  const {
    eventId,
    tierId,
    userId,
    attendeeName,
    attendeeEmail,
    attendeePhone,
    quantity = 1,
    purchasePrice,
    qrCode,  // Add this
    qrSecret, // Add this
    ticketNumber, // Add this
  } = ticketData;

  const finalTicketNumber = ticketNumber || cryptoUtil.generateTicketNumber();
  const secureHash = cryptoUtil.generateTicketHash(finalTicketNumber, eventId, userId);
  const qrCodeHash = cryptoUtil.generateSecureHash({ ticketNumber: finalTicketNumber, eventId, userId });

  const result = await this.db.query(
    `INSERT INTO tickets (
      ticket_number, event_id, tier_id, user_id, attendee_name,
      attendee_email, attendee_phone, quantity, purchase_price,
      qr_code_hash, secure_hash, qr_code, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'valid')
    RETURNING *`,
    [
      finalTicketNumber, eventId, tierId, userId, attendeeName,
      attendeeEmail, attendeePhone, quantity, purchasePrice,
      qrCodeHash, secureHash, qrCode || null
    ]
  );
  
  return result.rows[0];
}
  async createBulkTickets(ticketsData) {
    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      const createdTickets = [];
      
      for (const ticketData of ticketsData) {
        const ticket = await this.createTicket(ticketData);
        createdTickets.push(ticket);
      }
      
      await client.query('COMMIT');
      return createdTickets;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getTicketByNumber(ticketNumber) {
    const result = await this.db.query(
      `SELECT t.*, 
        e.title as event_title, e.event_date, e.venue_name, e.latitude, e.longitude,
        e.google_maps_link, tt.name as tier_name, tt.price as tier_price,
        u.full_name as user_name
       FROM tickets t
       JOIN events e ON e.id = t.event_id
       JOIN ticket_tiers tt ON tt.id = t.tier_id
       JOIN users u ON u.id = t.user_id
       WHERE t.ticket_number = $1 AND t.is_active = true`,
      [ticketNumber]
    );
    return result.rows[0];
  }

  async getTicketByQRHash(qrCodeHash) {
    const result = await this.db.query(
      `SELECT t.*, 
        e.title as event_title, e.event_date, e.venue_name,
        tt.name as tier_name
       FROM tickets t
       JOIN events e ON e.id = t.event_id
       JOIN ticket_tiers tt ON tt.id = t.tier_id
       WHERE t.qr_code_hash = $1`,
      [qrCodeHash]
    );
    return result.rows[0];
  }

 async getUserTickets(userId, status = null) {
  let query = `
    SELECT t.*, 
      e.title as event_title, e.event_date, e.venue_name, e.latitude, e.longitude,
      e.google_maps_link, tt.name as tier_name, tt.price as tier_price
    FROM tickets t
    JOIN events e ON e.id = t.event_id
    JOIN ticket_tiers tt ON tt.id = t.tier_id
    WHERE t.user_id = $1
  `;
  const values = [userId];
  
  if (status) {
    query += ` AND t.status = $2`;
    values.push(status);
  }
  
  query += ` ORDER BY e.event_date ASC`;
  
  const result = await this.db.query(query, values);
  return result.rows;
}

  async getEventTickets(eventId, status = null) {
    let query = `
      SELECT t.*, u.full_name as user_name, u.email as user_email,
        tt.name as tier_name
      FROM tickets t
      JOIN users u ON u.id = t.user_id
      JOIN ticket_tiers tt ON tt.id = t.tier_id
      WHERE t.event_id = $1 AND t.is_active = true
    `;
    const values = [eventId];
    
    if (status) {
      query += ` AND t.status = $2`;
      values.push(status);
    }
    
    query += ` ORDER BY t.created_at DESC`;
    
    const result = await this.db.query(query, values);
    return result.rows;
  }

  async updateTicketStatus(ticketId, status, metadata = {}) {
    const updates = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [status];
    let paramIndex = 2;

    if (status === 'used' && metadata.checkedInBy) {
      updates.push(`checked_in_at = CURRENT_TIMESTAMP`);
      updates.push(`checked_in_by = $${paramIndex}`);
      values.push(metadata.checkedInBy);
      paramIndex++;
    }

    if (status === 'resold' && metadata.newOwnerId) {
      updates.push(`current_owner_id = $${paramIndex}`);
      updates.push(`transfer_count = transfer_count + 1`);
      values.push(metadata.newOwnerId);
      paramIndex++;
    }

    values.push(ticketId);
    const query = `
      UPDATE tickets 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async markTicketAsUsed(ticketId, scannerId) {
    const ticket = await this.findById(ticketId);
    if (!ticket) {
      throw new Error('Ticket not found');
    }
    
    if (ticket.status !== 'valid') {
      throw new Error(`Ticket is already ${ticket.status}`);
    }
    
    return await this.updateTicketStatus(ticketId, 'used', { checkedInBy: scannerId });
  }

  async markTicketAsResold(ticketId, newOwnerId, resalePrice) {
    return await this.updateTicketStatus(ticketId, 'resold', { 
      newOwnerId,
      resalePrice,
    });
  }

  async checkTicketValidity(ticketId, eventId = null) {
    const ticket = await this.findById(ticketId);
    
    if (!ticket) {
      return { valid: false, reason: 'Ticket not found' };
    }
    
    if (ticket.status !== 'valid') {
      return { valid: false, reason: `Ticket is ${ticket.status}` };
    }
    
    if (eventId && ticket.event_id !== eventId) {
      return { valid: false, reason: 'Ticket is for a different event' };
    }
    
    // Check if event date has passed
    const event = await this.db.query(
      'SELECT event_date FROM events WHERE id = $1',
      [ticket.event_id]
    );
    
    if (event.rows[0] && new Date(event.rows[0].event_date) < new Date()) {
      return { valid: false, reason: 'Event has already passed' };
    }
    
    return { valid: true, ticket };
  }

  async getTicketStats(eventId) {
    const result = await this.db.query(
      `SELECT 
        COUNT(*) as total_tickets,
        COUNT(CASE WHEN status = 'valid' THEN 1 END) as valid_tickets,
        COUNT(CASE WHEN status = 'used' THEN 1 END) as used_tickets,
        COUNT(CASE WHEN status = 'resold' THEN 1 END) as resold_tickets,
        SUM(quantity) as total_attendees,
        AVG(purchase_price) as average_price
       FROM tickets
       WHERE event_id = $1 AND is_active = true`,
      [eventId]
    );
    return result.rows[0];
  }

  async transferTicket(ticketId, newOwnerId, transferorId) {
    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Check current status
      const ticket = await this.findById(ticketId);
      if (!ticket || ticket.status !== 'valid') {
        throw new Error('Ticket cannot be transferred');
      }
      
      // Update ticket ownership
      const result = await client.query(
        `UPDATE tickets 
         SET current_owner_id = $1, 
             transfer_count = transfer_count + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND user_id = $3
         RETURNING *`,
        [newOwnerId, ticketId, transferorId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Transfer failed - ticket not found or not owned by you');
      }
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new TicketModel();