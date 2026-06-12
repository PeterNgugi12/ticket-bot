const walletService = require('../services/walletService');
const cashbackService = require('../services/cashbackService');

class WalletController {
  async getWallet(req, res, next) {
    try {
      const wallet = await walletService.getWallet(req.userId);
      
      res.status(200).json({
        success: true,
        data: { wallet },
      });
    } catch (error) {
      next(error);
    }
  }

  async getBalance(req, res, next) {
    try {
      const balance = await walletService.getBalance(req.userId);
      
      res.status(200).json({
        success: true,
        data: { balance: balance.toNumber() },
      });
    } catch (error) {
      next(error);
    }
  }

  async getTransactions(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const type = req.query.type;
      
      const transactions = await walletService.getTransactions(req.userId, limit, offset, type);
      const summary = await walletService.getTransactionSummary(req.userId);
      
      res.status(200).json({
        success: true,
        data: { transactions, summary, count: transactions.length },
        pagination: { limit, offset },
      });
    } catch (error) {
      next(error);
    }
  }

  async requestWithdrawal(req, res, next) {
    try {
      const { amount, phoneNumber } = req.body;
      
      const withdrawal = await walletService.requestWithdrawal(
        req.userId,
        amount,
        phoneNumber,
        { ip: req.ip, userAgent: req.headers['user-agent'] }
      );
      
      res.status(201).json({
        success: true,
        message: 'Withdrawal request submitted successfully',
        data: { withdrawal },
      });
    } catch (error) {
      next(error);
    }
  }

  async getWithdrawals(req, res, next) {
    try {
      const status = req.query.status;
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      
      const withdrawals = await walletService.getWithdrawals(req.userId, status, limit, offset);
      
      res.status(200).json({
        success: true,
        data: { withdrawals, count: withdrawals.length },
        pagination: { limit, offset },
      });
    } catch (error) {
      next(error);
    }
  }

  async getCashbackStats(req, res, next) {
    try {
      const stats = await cashbackService.getCashbackStats(req.userId);
      
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin endpoints
  async lockWallet(req, res, next) {
    try {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only admins can lock wallets',
        });
      }
      
      const { userId } = req.params;
      const { reason } = req.body;
      
      const wallet = await walletService.lockWallet(userId, reason);
      
      res.status(200).json({
        success: true,
        message: 'Wallet locked successfully',
        data: { wallet },
      });
    } catch (error) {
      next(error);
    }
  }

  async unlockWallet(req, res, next) {
    try {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only admins can unlock wallets',
        });
      }
      
      const { userId } = req.params;
      
      const wallet = await walletService.unlockWallet(userId);
      
      res.status(200).json({
        success: true,
        message: 'Wallet unlocked successfully',
        data: { wallet },
      });
    } catch (error) {
      next(error);
    }
  }

  async getStats(req, res, next) {
    try {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only admins can view wallet stats',
        });
      }
      
      const stats = await walletService.getStats();
      
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  async manualCredit(req, res, next) {
    try {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only admins can manually credit wallets',
        });
      }
      
      const { userId } = req.params;
      const { amount, reason } = req.body;
      
      const result = await walletService.credit(
        userId,
        amount,
        'admin_credit',
        null,
        reason || 'Manual admin credit',
        { adminId: req.userId }
      );
      
      res.status(200).json({
        success: true,
        message: 'Wallet credited successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WalletController();