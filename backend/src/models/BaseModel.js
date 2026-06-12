const dbPool = require('../db/pool');

class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
    this.db = dbPool;
  }
  
  async findById(id) {
    const result = await this.db.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1 AND is_active = true`,
      [id]
    );
    return result.rows[0];
  }
  
  async findAll(conditions = {}, limit = 100, offset = 0) {
    let query = `SELECT * FROM ${this.tableName} WHERE is_active = true`;
    const values = [];
    let paramIndex = 1;
    
    // Build WHERE clause
    Object.entries(conditions).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query += ` AND ${key} = $${paramIndex}`;
        values.push(value);
        paramIndex++;
      }
    });
    
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);
    
    const result = await this.db.query(query, values);
    return result.rows;
  }
  
  async create(data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    
    const query = `
      INSERT INTO ${this.tableName} (${keys.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;
    
    const result = await this.db.query(query, values);
    return result.rows[0];
  }
  
  async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
    
    const query = `
      UPDATE ${this.tableName}
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await this.db.query(query, [id, ...values]);
    return result.rows[0];
  }
  
  async delete(id) {
    const query = `
      UPDATE ${this.tableName}
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id
    `;
    const result = await this.db.query(query, [id]);
    return result.rows[0];
  }
  
  async count(conditions = {}) {
    let query = `SELECT COUNT(*) FROM ${this.tableName} WHERE is_active = true`;
    const values = [];
    let paramIndex = 1;
    
    Object.entries(conditions).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query += ` AND ${key} = $${paramIndex}`;
        values.push(value);
        paramIndex++;
      }
    });
    
    const result = await this.db.query(query, values);
    return parseInt(result.rows[0].count);
  }
  
  async exists(id) {
    const result = await this.db.query(
      `SELECT 1 FROM ${this.tableName} WHERE id = $1 AND is_active = true LIMIT 1`,
      [id]
    );
    return result.rows.length > 0;
  }
}

module.exports = BaseModel;