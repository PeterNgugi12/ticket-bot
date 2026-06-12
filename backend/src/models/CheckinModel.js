const BaseModel = require('./BaseModel');

class CheckinModel extends BaseModel {
  constructor() {
    super('checkins');
  }

  async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS checkins (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ticket_id UUID NOT NULL REFERENCES tickets(id),
        event_id UUID NOT NULL REFERENCES events(id),
        user_id UUID NOT NULL REFERENCES users(id),
        scanner_id UUID NOT NULL REFERENCES users(id),
        checkin_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        gate_number VARCHAR(50),
        verified_by VARCHAR(255),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.db.query(query);
  }

  async createCheckin(checkinData) {
    const {
      ticketId,
      eventId,
      userId,
      scannerId,
      gateNumber = null,
      verifiedBy = null,
      metadata = {},
    } = checkinData;

    const result = await this.db.query(
      `INSERT INTO checkins (
        ticket_id, event_id, user_id, scanner_id, gate_number, verified_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [ticketId, eventId, userId, scannerId, gateNumber, verifiedBy, metadata]
    );
    
    return result.rows[0];
  }

  async getCheckinsByEvent(eventId, limit = 100, offset = 0) {
    const result = await this.db.query(
      `SELECT c.*, 
        t.ticket_number, t.attendee_name, t.tier_id,
        tt.name as tier_name,
        u.full_name as attendee_name,
        s.full_name as scanner_name
       FROM checkins c
       JOIN tickets t ON t.id = c.ticket_id
       JOIN ticket_tiers tt ON tt.id = t.tier_id
       JOIN users u ON u.id = c.user_id
       JOIN users s ON s.id = c.scanner_id
       WHERE c.event_id = $1
       ORDER BY c.checkin_time DESC
       LIMIT $2 OFFSET $3`,
      [eventId, limit, offset]
    );
    return result.rows;
  }

  async getCheckinStats(eventId) {
    const result = await this.db.query(
      `SELECT 
        COUNT(*) as total_checkins,
        COUNT(DISTINCT ticket_id) as unique_tickets,
        COUNT(DISTINCT user_id) as unique_attendees,
        MIN(checkin_time) as first_checkin,
        MAX(checkin_time) as last_checkin,
        COUNT(DISTINCT gate_number) as active_gates
       FROM checkins
       WHERE event_id = $1`,
      [eventId]
    );
    return result.rows[0];
  }

  async getHourlyCheckins(eventId) {
    const result = await this.db.query(
      `SELECT 
        DATE_TRUNC('hour', checkin_time) as hour,
        COUNT(*) as checkin_count
       FROM checkins
       WHERE event_id = $1
       GROUP BY DATE_TRUNC('hour', checkin_time)
       ORDER BY hour ASC`,
      [eventId]
    );
    return result.rows;
  }
}

module.exports = new CheckinModel();