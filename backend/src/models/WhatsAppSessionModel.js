const BaseModel = require('./BaseModel');

class WhatsAppSessionModel extends BaseModel {
  constructor() {
    super('whatsapp_sessions');
  }

  async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS whatsapp_sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        phone_number VARCHAR(20) UNIQUE NOT NULL,
        session_data JSONB NOT NULL,
        user_id UUID REFERENCES users(id),
        state VARCHAR(50) DEFAULT 'active',
        menu_state JSONB,
        last_message_at TIMESTAMP,
        messages_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.db.query(query);
  }

  async saveSession(phoneNumber, sessionData, userId = null) {
    const result = await this.db.query(
      `INSERT INTO whatsapp_sessions (phone_number, session_data, user_id, last_message_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (phone_number) 
       DO UPDATE SET 
         session_data = EXCLUDED.session_data,
         user_id = COALESCE(EXCLUDED.user_id, whatsapp_sessions.user_id),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [phoneNumber, sessionData, userId]
    );
    return result.rows[0];
  }

  async getSession(phoneNumber) {
    const result = await this.db.query(
      'SELECT * FROM whatsapp_sessions WHERE phone_number = $1',
      [phoneNumber]
    );
    return result.rows[0];
  }

  async updateMenuState(phoneNumber, menuState) {
    const result = await this.db.query(
      `UPDATE whatsapp_sessions 
       SET menu_state = $1, updated_at = CURRENT_TIMESTAMP
       WHERE phone_number = $2
       RETURNING *`,
      [menuState, phoneNumber]
    );
    return result.rows[0];
  }

  async updateLastMessage(phoneNumber) {
    await this.db.query(
      `UPDATE whatsapp_sessions 
       SET last_message_at = CURRENT_TIMESTAMP,
           messages_count = messages_count + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE phone_number = $1`,
      [phoneNumber]
    );
  }

  async getActiveSessions(limit = 100) {
    const result = await this.db.query(
      `SELECT * FROM whatsapp_sessions 
       WHERE state = 'active' 
       AND last_message_at > NOW() - INTERVAL '1 hour'
       ORDER BY last_message_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async deactivateSession(phoneNumber) {
    const result = await this.db.query(
      `UPDATE whatsapp_sessions 
       SET state = 'inactive', updated_at = CURRENT_TIMESTAMP
       WHERE phone_number = $1
       RETURNING *`,
      [phoneNumber]
    );
    return result.rows[0];
  }
}

module.exports = new WhatsAppSessionModel();