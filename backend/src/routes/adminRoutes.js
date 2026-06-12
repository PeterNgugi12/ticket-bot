const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const analyticsController = require('../controllers/analyticsController');
const reportController = require('../controllers/reportController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');

// All admin routes require authentication and admin role
router.use(authMiddleware);
router.use(requireRole('admin', 'super_admin'));

// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/dashboard/realtime', analyticsController.getRealTimeStats);

// User management
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserDetails);
router.put('/users/:userId/role', adminController.updateUserRole);
router.put('/users/:userId/status', adminController.toggleUserStatus);

// Organizer management
router.get('/organizers', adminController.getAllOrganizers);
router.get('/organizers/:organizerId', adminController.getOrganizerDetails);
router.post('/organizers', adminController.createOrganizer);

// Withdrawal management
router.get('/withdrawals/pending', adminController.getPendingWithdrawals);
router.post('/withdrawals/:withdrawalId/approve', adminController.approveWithdrawal);
router.post('/withdrawals/:withdrawalId/reject', adminController.rejectWithdrawal);

// Analytics
router.get('/analytics/revenue', analyticsController.getRevenueAnalytics);
router.get('/analytics/ticket-sales', analyticsController.getTicketSalesAnalytics);
router.get('/analytics/user-growth', analyticsController.getUserGrowthAnalytics);
router.get('/analytics/event-performance', analyticsController.getEventPerformance);
router.get('/analytics/organizer-performance', analyticsController.getOrganizerPerformance);
router.get('/analytics/payment-methods', analyticsController.getPaymentMethodAnalytics);
router.get('/analytics/resale', analyticsController.getResaleAnalytics);
router.get('/analytics/checkins/:eventId', analyticsController.getCheckinAnalytics);

// Reports
router.get('/reports/sales', reportController.generateSalesReport);
router.get('/reports/events', reportController.generateEventsReport);
router.get('/reports/users', reportController.generateUsersReport);
router.get('/reports/withdrawals', reportController.generateWithdrawalsReport);

// System
router.get('/logs', adminController.getSystemLogs);
router.get('/settings', adminController.getPlatformSettings);
router.put('/settings', adminController.updatePlatformSettings);

module.exports = router;