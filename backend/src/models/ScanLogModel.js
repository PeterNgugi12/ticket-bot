const BaseModel = require('./BaseModel');

class ScanLogModel extends BaseModel {
  constructor() {
    super('ticket_scans');
  }

  async createScanLog(scanData) {
    const {
      ticketId,
      scannerId,
      eventId,
      scanStatus,
      qrData,
      ipAddress,
      userAgent,
      locationData = {},
    } = scanData;

    const result = await this.db.query(
      `INSERT INTO ticket_scans (
        ticket_id, scanner_id, event_id, scan_status,
        qr_data, ip_address, user_agent, location_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [ticketId, scannerId, eventId, scanStatus, qrData, ipAddress, userAgent, locationData]
    );
    
    return result.rows[0];
  }

  async getScansByTicket(ticketId, limit = 50) {
    const result = await this.db.query(
      `SELECT ts.*, u.full_name as scanner_name, u.role as scanner_role
       FROM ticket_scans ts
       JOIN users u ON u.id = ts.scanner_id
       WHERE ts.ticket_id = $1
       ORDER BY ts.created_at DESC
       LIMIT $2`,
      [ticketId, limit]
    );
    return result.rows;
  }

  async getScansByEvent(eventId, date = null, limit = 100, offset = 0) {
    let query = `
      SELECT ts.*, 
        t.ticket_number, t.attendee_name, t.tier_id,
        tt.name as tier_name,
        u.full_name as scanner_name,
        u2.full_name as attendee_name_full
      FROM ticket_scans ts
      JOIN tickets t ON t.id = ts.ticket_id
      JOIN ticket_tiers tt ON tt.id = t.tier_id
      JOIN users u ON u.id = ts.scanner_id
      LEFT JOIN users u2 ON u2.id = t.user_id
      WHERE ts.event_id = $1
    `;
    const values = [eventId];
    let paramIndex = 2;

    if (date) {
      query += ` AND DATE(ts.created_at) = $${paramIndex}`;
      values.push(date);
      paramIndex++;
    }

    query += ` ORDER BY ts.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const result = await this.db.query(query, values);
    return result.rows;
  }

  async getScanStats(eventId, date = null) {
    let query = `
      SELECT 
        COUNT(*) as total_scans,
        COUNT(CASE WHEN scan_status = 'valid' THEN 1 END) as valid_scans,
        COUNT(CASE WHEN scan_status = 'invalid' THEN 1 END) as invalid_scans,
        COUNT(CASE WHEN scan_status = 'already_used' THEN 1 END) as already_used_scans,
        COUNT(CASE WHEN scan_status = 'wrong_event' THEN 1 END) as wrong_event_scans,
        COUNT(DISTINCT scanner_id) as unique_scanners,
        COUNT(DISTINCT ticket_id) as unique_tickets
      FROM ticket_scans
      WHERE event_id = $1
    `;
    const values = [eventId];

    if (date) {
      query += ` AND DATE(created_at) = $2`;
      values.push(date);
    }

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getRecentScans(limit = 50) {
    const result = await this.db.query(
      `SELECT ts.*, 
        e.title as event_title,
        t.ticket_number,
        u.full_name as scanner_name
       FROM ticket_scans ts
       JOIN events e ON e.id = ts.event_id
       JOIN tickets t ON t.id = ts.ticket_id
       JOIN users u ON u.id = ts.scanner_id
       ORDER BY ts.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}

module.exports = new ScanLogModel();