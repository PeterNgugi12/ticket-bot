// backend/src/models/ScannerTeamMemberModel.js
const BaseModel = require('./BaseModel');
const crypto = require('crypto');

class ScannerTeamMemberModel extends BaseModel {
  constructor() {
    super('scanner_team_members');
  }

  async createTeamMember(memberData) {
    const {
      organizerId,
      eventId,
      name,
      email,
      phone,
      password,
      role = 'scanner',
    } = memberData;

    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Hash password
      const passwordUtil = require('../utils/password');
      const passwordHash = await passwordUtil.hash(password);
      
      // Generate UUID for the scanner (same ID for both tables)
      const scannerId = crypto.randomBytes(16).toString('hex');
      const apiKey = crypto.randomBytes(32).toString('hex');
      const qrSecret = crypto.randomBytes(32).toString('hex');
      
      // 1. First, create user record (to satisfy foreign key constraint)
      await client.query(
        `INSERT INTO users (id, email, name, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE 
         SET email = EXCLUDED.email, 
             name = EXCLUDED.name, 
             updated_at = NOW()`,
        [scannerId, email, name, role]
      );
      
      // 2. Then create scanner team member
      const result = await client.query(
        `INSERT INTO scanner_team_members (
          id, organizer_id, event_id, name, email, phone, 
          password_hash, role, status, qr_secret, api_key, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10, true, NOW(), NOW())
        RETURNING id, name, email, phone, role, status, event_id, created_at`,
        [
          scannerId, organizerId, eventId, name, email, phone,
          passwordHash, role, qrSecret, apiKey
        ]
      );
      
      await client.query('COMMIT');
      
      return result.rows[0];
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating team member:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getTeamMembersByOrganizer(organizerId, eventId = null) {
    let query = `
      SELECT stm.*, e.title as event_title, 
             COUNT(sl.id) as scans_count,
             MAX(sl.scanned_at) as last_scan
      FROM scanner_team_members stm
      JOIN events e ON e.id = stm.event_id
      LEFT JOIN scan_logs sl ON sl.scanner_id = stm.id
      WHERE stm.organizer_id = $1 AND stm.is_active = true
    `;
    const values = [organizerId];
    
    if (eventId) {
      query += ` AND stm.event_id = $2`;
      values.push(eventId);
    }
    
    query += ` GROUP BY stm.id, e.title ORDER BY stm.created_at DESC`;
    
    const result = await this.db.query(query, values);
    return result.rows;
  }

  async getTeamMemberById(id, organizerId) {
    const result = await this.db.query(
      `SELECT stm.*, e.title as event_title
       FROM scanner_team_members stm
       JOIN events e ON e.id = stm.event_id
       WHERE stm.id = $1 AND stm.organizer_id = $2 AND stm.is_active = true`,
      [id, organizerId]
    );
    return result.rows[0];
  }

  async getTeamMemberByApiKey(apiKey) {
    const result = await this.db.query(
      `SELECT stm.*, e.title as event_title, e.id as event_id
       FROM scanner_team_members stm
       JOIN events e ON e.id = stm.event_id
       WHERE stm.api_key = $1 AND stm.status = 'active' AND stm.is_active = true`,
      [apiKey]
    );
    
    // Also ensure user exists in users table (for backward compatibility)
    if (result.rows[0] && result.rows[0].id) {
      const userCheck = await this.db.query(
        'SELECT id FROM users WHERE id = $1',
        [result.rows[0].id]
      );
      
      if (userCheck.rows.length === 0) {
        // Create missing user record
        const scanner = result.rows[0];
        await this.db.query(
          `INSERT INTO users (id, email, name, role, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [scanner.id, scanner.email, scanner.name, 'scanner']
        );
      }
    }
    
    return result.rows[0];
  }

  async updateStatus(id, organizerId, status) {
    const result = await this.db.query(
      `UPDATE scanner_team_members 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND organizer_id = $3
       RETURNING id, name, status`,
      [status, id, organizerId]
    );
    return result.rows[0];
  }

  async deleteTeamMember(id, organizerId) {
    const result = await this.db.query(
      `UPDATE scanner_team_members 
       SET is_active = false, deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organizer_id = $2
       RETURNING id`,
      [id, organizerId]
    );
    return result.rows[0];
  }

  async recordScan(scannerId, ticketId, result, metadata = {}) {
    const scanResult = await this.db.query(
      `INSERT INTO scan_logs (
        scanner_id, ticket_id, result, metadata, scanned_at
      ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      RETURNING *`,
      [scannerId, ticketId, result, JSON.stringify(metadata)]
    );
    
    // Update scanner's scan count
    await this.db.query(
      `UPDATE scanner_team_members 
       SET scans_count = scans_count + 1,
           last_active = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [scannerId]
    );
    
    return scanResult.rows[0];
  }

  async getScanStats(scannerId, period = 'today') {
    let dateFilter = '';
    if (period === 'today') {
      dateFilter = "AND scanned_at >= CURRENT_DATE";
    } else if (period === 'week') {
      dateFilter = "AND scanned_at >= CURRENT_DATE - INTERVAL '7 days'";
    } else if (period === 'month') {
      dateFilter = "AND scanned_at >= CURRENT_DATE - INTERVAL '30 days'";
    }
    
    const result = await this.db.query(
      `SELECT 
        COUNT(*) as total_scans,
        COUNT(CASE WHEN result = 'success' THEN 1 END) as successful,
        COUNT(CASE WHEN result = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN result = 'already_used' THEN 1 END) as already_used,
        COUNT(CASE WHEN result = 'invalid' THEN 1 END) as invalid
       FROM scan_logs
       WHERE scanner_id = $1 ${dateFilter}`,
      [scannerId]
    );
    
    return result.rows[0];
  }
}

module.exports = new ScannerTeamMemberModel();