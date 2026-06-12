const UserModel = require('../models/UserModel');
const EventModel = require('../models/EventModel');
const PaymentModel = require('../models/PaymentModel');
const WithdrawalModel = require('../models/WithdrawalModel');
const walletService = require('./walletService');
const TicketModel = require('../models/TicketModel');
const { queueManager, QUEUES } = require('../queue/queueManager');

class AdminService {
  async getDashboardStats() {
    const [
      userStats,
      eventStats,
      paymentStats,
      withdrawalStats,
      scanStats,
    ] = await Promise.all([
      UserModel.getUserStats(),
      this.getEventStats(),
      PaymentModel.getPaymentStats(),
      WithdrawalModel.getWithdrawalStats(),
      this.getScanStats(),
    ]);

    return {
      users: userStats,
      events: eventStats,
      payments: paymentStats,
      withdrawals: withdrawalStats,
      scans: scanStats,
      platform: {
        totalRevenue: paymentStats.total_revenue || 0,
        platformFees: await this.getTotalPlatformFees(),
        activeOrganizers: userStats.organizers || 0,
      },
    };
  }

  async getEventStats() {
    const result = await EventModel.db.query(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(CASE WHEN status = 'published' THEN 1 END) as active_events,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_events,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_events,
        COUNT(CASE WHEN event_date > NOW() THEN 1 END) as upcoming_events,
        COUNT(CASE WHEN event_date < NOW() THEN 1 END) as past_events,
        SUM(total_tickets) as total_capacity,
        SUM(tickets_sold) as total_tickets_sold
      FROM events
    `);
    return result.rows[0];
  }

  async getScanStats() {
    const result = await EventModel.db.query(`
      SELECT 
        COUNT(*) as total_scans,
        COUNT(DISTINCT event_id) as events_with_scans,
        COUNT(DISTINCT scanner_id) as active_scanners
      FROM ticket_scans
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    return result.rows[0];
  }

  async getTotalPlatformFees() {
    const result = await EventModel.db.query(`
      SELECT COALESCE(SUM(platform_fee), 0) as total_fees
      FROM resale_listings
      WHERE status = 'sold'
    `);
    return result.rows[0].total_fees;
  }

  async getAllUsers(filters = {}, limit = 100, offset = 0) {
    let query = `
      SELECT id, phone_number, email, full_name, role, is_verified, 
             is_active, wallet_balance, created_at, last_active_at
      FROM users
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    if (filters.role) {
      query += ` AND role = $${paramIndex}`;
      values.push(filters.role);
      paramIndex++;
    }

    if (filters.isActive !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      values.push(filters.isActive);
      paramIndex++;
    }

    if (filters.search) {
      query += ` AND (phone_number ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR full_name ILIKE $${paramIndex})`;
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const result = await EventModel.db.query(query, values);
    return result.rows;
  }

  async getUserDetails(userId) {
    const user = await UserModel.findById(userId);
    if (!user) return null;

    const [transactions, tickets, payments, withdrawals] = await Promise.all([
      walletService.getTransactions(userId, 50),
      TicketModel.getUserTickets(userId),
      PaymentModel.getUserPayments(userId, 50),
      WithdrawalModel.getUserWithdrawals(userId),
    ]);

    return {
      ...user,
      stats: {
        totalSpent: user.total_spent,
        walletBalance: user.wallet_balance,
        ticketsPurchased: tickets.length,
        transactionsCount: transactions.length,
        withdrawalsCount: withdrawals.length,
      },
      recentTransactions: transactions.slice(0, 10),
      recentTickets: tickets.slice(0, 10),
      recentPayments: payments.slice(0, 10),
    };
  }

  async updateUserRole(userId, newRole, adminId) {
    const validRoles = ['user', 'organizer', 'admin', 'super_admin'];
    if (!validRoles.includes(newRole)) {
      throw new Error('Invalid role');
    }

    const user = await UserModel.updateRole(userId, newRole);
    
    // Log action
    await this.logAdminAction(adminId, 'UPDATE_USER_ROLE', {
      userId,
      newRole,
      timestamp: new Date(),
    });

    return user;
  }

  async toggleUserStatus(userId, isActive, adminId) {
    let user;
    if (isActive) {
      user = await UserModel.reactivateUser(userId);
    } else {
      user = await UserModel.deactivateUser(userId);
    }

    await this.logAdminAction(adminId, 'TOGGLE_USER_STATUS', {
      userId,
      isActive,
      timestamp: new Date(),
    });

    return user;
  }

  async getPendingWithdrawals(limit = 100) {
    return await WithdrawalModel.getPendingWithdrawals(limit);
  }

  async approveWithdrawal(withdrawalId, adminId) {
    const withdrawal = await WithdrawalModel.findById(withdrawalId);
    
    if (!withdrawal) {
      throw new Error('Withdrawal not found');
    }
    
    if (withdrawal.status !== 'pending') {
      throw new Error(`Withdrawal is already ${withdrawal.status}`);
    }

    // Process withdrawal
    const result = await walletService.processWithdrawal(withdrawalId);
    
    await this.logAdminAction(adminId, 'APPROVE_WITHDRAWAL', {
      withdrawalId,
      userId: withdrawal.user_id,
      amount: withdrawal.amount,
      timestamp: new Date(),
    });

    return result;
  }

  async rejectWithdrawal(withdrawalId, reason, adminId) {
    const withdrawal = await WithdrawalModel.updateWithdrawalStatus(withdrawalId, 'failed', {
      rejectionReason: reason,
    });

    // Refund the amount back to user's wallet
    await walletService.credit(
      withdrawal.user_id,
      withdrawal.amount,
      'refund',
      withdrawal.id,
      `Withdrawal rejected: ${reason}`,
      { adminId, reason }
    );

    await this.logAdminAction(adminId, 'REJECT_WITHDRAWAL', {
      withdrawalId,
      userId: withdrawal.user_id,
      amount: withdrawal.amount,
      reason,
      timestamp: new Date(),
    });

    return withdrawal;
  }

  async getAllOrganizers(limit = 100, offset = 0) {
    const result = await EventModel.db.query(`
      SELECT u.*, 
        COUNT(DISTINCT e.id) as total_events,
        COALESCE(SUM(t.quantity), 0) as total_tickets_sold,
        COALESCE(SUM(p.amount), 0) as total_revenue
      FROM users u
      LEFT JOIN events e ON e.organizer_id = u.id
      LEFT JOIN tickets t ON t.event_id = e.id
      LEFT JOIN payments p ON p.event_id = e.id AND p.status = 'completed'
      WHERE u.role = 'organizer'
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    return result.rows;
  }

  async getOrganizerDetails(organizerId) {
    const organizer = await UserModel.findById(organizerId);
    if (!organizer || organizer.role !== 'organizer') {
      throw new Error('Organizer not found');
    }

    const events = await EventModel.getOrganizerEvents(organizerId);
    const stats = await EventModel.getOrganizerStats(organizerId);
    const withdrawals = await WithdrawalModel.getUserWithdrawals(organizerId);

    return {
      ...organizer,
      stats,
      events: events.slice(0, 20),
      recentWithdrawals: withdrawals.slice(0, 10),
    };
  }

  async createOrganizerAccount(userData, adminId) {
    const { phoneNumber, email, fullName, password, commissionRate = 10 } = userData;

    // Check if user exists
    const existingUser = await UserModel.findByPhoneOrEmail(phoneNumber);
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Hash password
    const passwordUtil = require('../utils/password');
    const passwordHash = await passwordUtil.hash(password);

    // Create user
    const user = await UserModel.createUser({
      phoneNumber,
      email,
      fullName,
      passwordHash,
      role: 'organizer',
    });

    // Create organizer settings
    await EventModel.db.query(`
      INSERT INTO organizer_settings (organizer_id, commission_rate)
      VALUES ($1, $2)
    `, [user.id, commissionRate]);

    await this.logAdminAction(adminId, 'CREATE_ORGANIZER', {
      organizerId: user.id,
      email,
      fullName,
      timestamp: new Date(),
    });

    // Send welcome email
    await queueManager.addJob(QUEUES.EMAIL, 'send_welcome_organizer', {
      userId: user.id,
      email,
      fullName,
      password,
    });

    return user;
  }

  async getSystemLogs(filters = {}, limit = 100, offset = 0) {
    let query = `
      SELECT * FROM audit_logs
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    if (filters.userId) {
      query += ` AND user_id = $${paramIndex}`;
      values.push(filters.userId);
      paramIndex++;
    }

    if (filters.action) {
      query += ` AND action = $${paramIndex}`;
      values.push(filters.action);
      paramIndex++;
    }

    if (filters.startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      values.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      values.push(filters.endDate);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const result = await EventModel.db.query(query, values);
    return result.rows;
  }

  async logAdminAction(adminId, action, metadata) {
    await EventModel.db.query(`
      INSERT INTO audit_logs (user_id, action, metadata, created_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    `, [adminId, action, metadata]);
  }

  async getPlatformSettings() {
    const result = await EventModel.db.query(`
      SELECT * FROM platform_settings LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      // Return default settings
      return {
        commission_rate: 10,
        cashback_rate: 2,
        min_withdrawal: 100,
        max_withdrawal: 50000,
        resale_fee_percentage: 5,
        maintenance_mode: false,
      };
    }
    
    return result.rows[0];
  }

  async updatePlatformSettings(settings, adminId) {
    const result = await EventModel.db.query(`
      INSERT INTO platform_settings (commission_rate, cashback_rate, min_withdrawal, 
        max_withdrawal, resale_fee_percentage, maintenance_mode, updated_by, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        commission_rate = EXCLUDED.commission_rate,
        cashback_rate = EXCLUDED.cashback_rate,
        min_withdrawal = EXCLUDED.min_withdrawal,
        max_withdrawal = EXCLUDED.max_withdrawal,
        resale_fee_percentage = EXCLUDED.resale_fee_percentage,
        maintenance_mode = EXCLUDED.maintenance_mode,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      settings.commission_rate,
      settings.cashback_rate,
      settings.min_withdrawal,
      settings.max_withdrawal,
      settings.resale_fee_percentage,
      settings.maintenance_mode,
      adminId,
    ]);

    await this.logAdminAction(adminId, 'UPDATE_PLATFORM_SETTINGS', settings);

    return result.rows[0];
  }
}

module.exports = new AdminService();