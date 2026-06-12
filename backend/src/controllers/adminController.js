const adminService = require('../services/adminService');
const analyticsService = require('../services/analyticsService');
const reportService = require('../services/reportService');

class AdminController {
  async getDashboardStats(req, res, next) {
    try {
      const stats = await adminService.getDashboardStats();
      
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllUsers(req, res, next) {
    try {
      const { role, isActive, search } = req.query;
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      
      const users = await adminService.getAllUsers({ role, isActive, search }, limit, offset);
      
      res.status(200).json({
        success: true,
        data: { users, count: users.length },
        pagination: { limit, offset },
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserDetails(req, res, next) {
    try {
      const { userId } = req.params;
      
      const user = await adminService.getUserDetails(userId);
      
      if (!user) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
      }
      
      res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateUserRole(req, res, next) {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      
      const user = await adminService.updateUserRole(userId, role, req.userId);
      
      res.status(200).json({
        success: true,
        message: 'User role updated successfully',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  async toggleUserStatus(req, res, next) {
    try {
      const { userId } = req.params;
      const { isActive } = req.body;
      
      const user = await adminService.toggleUserStatus(userId, isActive, req.userId);
      
      res.status(200).json({
        success: true,
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  async getPendingWithdrawals(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 100;
      
      const withdrawals = await adminService.getPendingWithdrawals(limit);
      
      res.status(200).json({
        success: true,
        data: { withdrawals, count: withdrawals.length },
      });
    } catch (error) {
      next(error);
    }
  }

  async approveWithdrawal(req, res, next) {
    try {
      const { withdrawalId } = req.params;
      
      const result = await adminService.approveWithdrawal(withdrawalId, req.userId);
      
      res.status(200).json({
        success: true,
        message: 'Withdrawal approved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async rejectWithdrawal(req, res, next) {
    try {
      const { withdrawalId } = req.params;
      const { reason } = req.body;
      
      const withdrawal = await adminService.rejectWithdrawal(withdrawalId, reason, req.userId);
      
      res.status(200).json({
        success: true,
        message: 'Withdrawal rejected successfully',
        data: { withdrawal },
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllOrganizers(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      
      const organizers = await adminService.getAllOrganizers(limit, offset);
      
      res.status(200).json({
        success: true,
        data: { organizers, count: organizers.length },
        pagination: { limit, offset },
      });
    } catch (error) {
      next(error);
    }
  }

  async getOrganizerDetails(req, res, next) {
    try {
      const { organizerId } = req.params;
      
      const organizer = await adminService.getOrganizerDetails(organizerId);
      
      res.status(200).json({
        success: true,
        data: { organizer },
      });
    } catch (error) {
      next(error);
    }
  }

  async createOrganizer(req, res, next) {
    try {
      const { phoneNumber, email, fullName, password, commissionRate } = req.body;
      
      const organizer = await adminService.createOrganizerAccount({
        phoneNumber,
        email,
        fullName,
        password,
        commissionRate,
      }, req.userId);
      
      res.status(201).json({
        success: true,
        message: 'Organizer account created successfully',
        data: { organizer },
      });
    } catch (error) {
      next(error);
    }
  }

  async getSystemLogs(req, res, next) {
    try {
      const { userId, action, startDate, endDate } = req.query;
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      
      const logs = await adminService.getSystemLogs({ userId, action, startDate, endDate }, limit, offset);
      
      res.status(200).json({
        success: true,
        data: { logs, count: logs.length },
        pagination: { limit, offset },
      });
    } catch (error) {
      next(error);
    }
  }

  async getPlatformSettings(req, res, next) {
    try {
      const settings = await adminService.getPlatformSettings();
      
      res.status(200).json({
        success: true,
        data: { settings },
      });
    } catch (error) {
      next(error);
    }
  }

  async updatePlatformSettings(req, res, next) {
    try {
      const settings = req.body;
      
      const updated = await adminService.updatePlatformSettings(settings, req.userId);
      
      res.status(200).json({
        success: true,
        message: 'Platform settings updated successfully',
        data: { settings: updated },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminController();