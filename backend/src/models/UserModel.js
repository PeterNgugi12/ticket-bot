const BaseModel = require('./BaseModel');
const dbPool = require('../db/pool');

class UserModel extends BaseModel {
  constructor() {
    super('users');
  }

  async findByPhone(phoneNumber) {
    const result = await this.db.query(
      'SELECT * FROM users WHERE phone_number = $1 AND is_active = true',
      [phoneNumber]
    );
    return result.rows[0];
  }

  async findByEmail(email) {
    const result = await this.db.query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email]
    );
    return result.rows[0];
  }

  async findByPhoneOrEmail(identifier) {
    const result = await this.db.query(
      `SELECT * FROM users 
       WHERE (phone_number = $1 OR email = $1) 
       AND is_active = true`,
      [identifier]
    );
    return result.rows[0];
  }

  async createUser(userData) {
    const { phoneNumber, email, fullName, passwordHash, role = 'user' } = userData;
    
    const result = await this.db.query(
      `INSERT INTO users (phone_number, email, full_name, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, phone_number, email, full_name, role, created_at`,
      [phoneNumber, email, fullName, passwordHash, role]
    );
    
    return result.rows[0];
  }

  async updatePassword(userId, newPasswordHash) {
    const result = await this.db.query(
      `UPDATE users 
       SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id`,
      [newPasswordHash, userId]
    );
    
    return result.rows[0];
  }

  async updateLastActive(userId) {
    await this.db.query(
      'UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    );
  }

  async getOrganizers(limit = 100, offset = 0) {
    const result = await this.db.query(
      `SELECT id, full_name, email, phone_number, created_at, is_active
       FROM users 
       WHERE role IN ('organizer', 'admin')
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    return result.rows;
  }

  async updateRole(userId, newRole) {
    const validRoles = ['user', 'organizer', 'admin', 'super_admin'];
    if (!validRoles.includes(newRole)) {
      throw new Error('Invalid role');
    }
    
    const result = await this.db.query(
      `UPDATE users 
       SET role = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, role`,
      [newRole, userId]
    );
    
    return result.rows[0];
  }

  async getUserStats() {
    const result = await this.db.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN role = 'user' THEN 1 END) as regular_users,
        COUNT(CASE WHEN role = 'organizer' THEN 1 END) as organizers,
        COUNT(CASE WHEN role IN ('admin', 'super_admin') THEN 1 END) as admins,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
        COUNT(CASE WHEN last_active_at > NOW() - INTERVAL '7 days' THEN 1 END) as active_last_week
      FROM users
    `);
    
    return result.rows[0];
  }

  async deactivateUser(userId) {
    const result = await this.db.query(
      `UPDATE users 
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id`,
      [userId]
    );
    
    return result.rows[0];
  }

  async reactivateUser(userId) {
    const result = await this.db.query(
      `UPDATE users 
       SET is_active = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id`,
      [userId]
    );
    
    return result.rows[0];
  }
}

module.exports = new UserModel();