const EventModel = require('../models/EventModel');
const WithdrawalModel = require('../models/WithdrawalModel');

class AnalyticsService {
  async getRevenueAnalytics(days = 30) {
    const result = await EventModel.db.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as transaction_count,
        SUM(amount) as daily_revenue,
        AVG(amount) as avg_transaction_value
      FROM payments
      WHERE status = 'completed'
        AND created_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    
    return result.rows;
  }

  async getTicketSalesAnalytics(eventId = null, days = 30) {
    let query = `
      SELECT 
        DATE(t.created_at) as date,
        COUNT(t.id) as tickets_sold,
        SUM(t.quantity) as total_attendees,
        SUM(t.purchase_price) as revenue
      FROM tickets t
      WHERE t.status = 'valid'
        AND t.created_at > NOW() - INTERVAL '${days} days'
    `;
    const values = [];

    if (eventId) {
      query += ` AND t.event_id = $1`;
      values.push(eventId);
    }

    query += ` GROUP BY DATE(t.created_at) ORDER BY date ASC`;

    const result = await EventModel.db.query(query, values);
    return result.rows;
  }

  async getUserGrowthAnalytics(days = 30) {
    const result = await EventModel.db.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as new_users,
        COUNT(CASE WHEN role = 'organizer' THEN 1 END) as new_organizers
      FROM users
      WHERE created_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    
    return result.rows;
  }

  async getEventPerformanceAnalytics(limit = 10) {
    const result = await EventModel.db.query(`
      SELECT 
        e.id,
        e.title,
        e.event_date,
        e.total_tickets,
        e.tickets_sold,
        ROUND((e.tickets_sold::DECIMAL / e.total_tickets) * 100, 2) as sell_through_rate,
        COALESCE(SUM(p.amount), 0) as revenue,
        COUNT(DISTINCT ts.id) as scans_count
      FROM events e
      LEFT JOIN tickets t ON t.event_id = e.id
      LEFT JOIN payments p ON p.event_id = e.id AND p.status = 'completed'
      LEFT JOIN ticket_scans ts ON ts.event_id = e.id
      WHERE e.status = 'published'
      GROUP BY e.id
      ORDER BY sell_through_rate DESC
      LIMIT $1
    `, [limit]);
    
    return result.rows;
  }

  async getOrganizerPerformanceAnalytics(limit = 10) {
    const result = await EventModel.db.query(`
      SELECT 
        u.id,
        u.full_name,
        u.email,
        COUNT(DISTINCT e.id) as total_events,
        SUM(e.tickets_sold) as total_tickets_sold,
        SUM(p.amount) as total_revenue,
        AVG(e.tickets_sold::DECIMAL / e.total_tickets) * 100 as avg_sell_through
      FROM users u
      JOIN events e ON e.organizer_id = u.id
      LEFT JOIN payments p ON p.event_id = e.id AND p.status = 'completed'
      WHERE u.role = 'organizer'
      GROUP BY u.id
      ORDER BY total_revenue DESC
      LIMIT $1
    `, [limit]);
    
    return result.rows;
  }

  async getPaymentMethodAnalytics() {
    const result = await EventModel.db.query(`
      SELECT 
        payment_method,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount,
        AVG(amount) as avg_amount,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
      FROM payments
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY payment_method
    `);
    
    return result.rows;
  }

  async getResaleMarketplaceAnalytics() {
    const result = await EventModel.db.query(`
      SELECT 
        COUNT(*) as total_listings,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_listings,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_listings,
        AVG(asking_price) as avg_listing_price,
        AVG(seller_earning) as avg_seller_earning,
        SUM(platform_fee) as total_platform_fees
      FROM resale_listings
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    
    return result.rows[0];
  }

  async getCheckinAnalytics(eventId) {
    const result = await EventModel.db.query(`
      SELECT 
        DATE_TRUNC('hour', checkin_time) as hour,
        COUNT(*) as checkins,
        COUNT(DISTINCT gate_number) as gates_used
      FROM checkins
      WHERE event_id = $1
      GROUP BY DATE_TRUNC('hour', checkin_time)
      ORDER BY hour ASC
    `, [eventId]);
    
    return result.rows;
  }

  async getRealTimeStats() {
    const [
      activeUsers,
      recentSales,
      pendingWithdrawals,
      activeScans,
    ] = await Promise.all([
      this.getActiveUsers(),
      this.getRecentSales(10),
      WithdrawalModel.getPendingWithdrawals(5),
      this.getActiveScans(),
    ]);

    return {
      activeUsers,
      recentSales,
      pendingWithdrawals: pendingWithdrawals.length,
      pendingWithdrawalsAmount: pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0),
      activeScans,
      timestamp: new Date(),
    };
  }

  async getActiveUsers() {
    const result = await EventModel.db.query(`
      SELECT COUNT(DISTINCT user_id) as active_users
      FROM sessions
      WHERE last_activity > NOW() - INTERVAL '5 minutes'
    `);
    return result.rows[0].active_users;
  }

  async getRecentSales(limit = 10) {
    const result = await EventModel.db.query(`
      SELECT 
        p.id,
        p.amount,
        p.created_at,
        u.full_name,
        e.title as event_title
      FROM payments p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN events e ON e.id = p.event_id
      WHERE p.status = 'completed'
      ORDER BY p.created_at DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  async getActiveScans() {
    const result = await EventModel.db.query(`
      SELECT COUNT(DISTINCT scanner_id) as active_scanners
      FROM ticket_scans
      WHERE created_at > NOW() - INTERVAL '10 minutes'
    `);
    return result.rows[0].active_scanners;
  }
}

module.exports = new AnalyticsService();