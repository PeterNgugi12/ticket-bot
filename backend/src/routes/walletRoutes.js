const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');

// All wallet routes require authentication
router.use(authMiddleware);

// User routes
router.get('/', walletController.getWallet);
router.get('/balance', walletController.getBalance);
router.get('/transactions', walletController.getTransactions);
router.get('/cashback', walletController.getCashbackStats);

// Withdrawal routes
router.post('/withdraw', walletController.requestWithdrawal);
router.get('/withdrawals', walletController.getWithdrawals);

// Admin routes
router.post('/lock/:userId', requireRole('admin', 'super_admin'), walletController.lockWallet);
router.post('/unlock/:userId', requireRole('admin', 'super_admin'), walletController.unlockWallet);
router.post('/credit/:userId', requireRole('admin', 'super_admin'), walletController.manualCredit);
router.get('/admin/stats', requireRole('admin', 'super_admin'), walletController.getStats);

module.exports = router;