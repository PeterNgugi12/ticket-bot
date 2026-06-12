const Decimal = require('decimal.js');
const WalletModel = require('../models/WalletModel');
const TransactionModel = require('../models/TransactionModel');
const WithdrawalModel = require('../models/WithdrawalModel');
const cacheManager = require('../cache/cacheManager');
const { CACHE_KEYS, CACHE_TTL } = require('../cache/cacheKeys');
const { queueManager, QUEUES } = require('../queue/queueManager');

class WalletService {
  async getWallet(userId) {
    // Try cache first
    const cacheKey = CACHE_KEYS.USER_WALLET(userId);
    let wallet = await cacheManager.get(cacheKey);
    
    if (!wallet) {
      wallet = await WalletModel.getWallet(userId);
      await cacheManager.set(cacheKey, wallet, CACHE_TTL.MEDIUM);
    }
    
    return wallet;
  }

  async getBalance(userId) {
    const wallet = await this.getWallet(userId);
    return new Decimal(wallet.balance);
  }

  async credit(userId, amount, type, referenceId, description, metadata = {}) {
    const client = await WalletModel.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      const wallet = await WalletModel.getWallet(userId);
      
      if (wallet.is_locked) {
        throw new Error(`Wallet is locked: ${wallet.lock_reason}`);
      }
      
      const balanceBefore = new Decimal(wallet.balance);
      const amountDecimal = new Decimal(amount);
      const balanceAfter = balanceBefore.plus(amountDecimal);
      
      // Update wallet
      let updatedWallet;
      if (type === 'cashback') {
        updatedWallet = await WalletModel.addCashback(userId, amountDecimal.toNumber());
      } else {
        updatedWallet = await WalletModel.credit(userId, amountDecimal.toNumber());
      }
      
      // Create transaction record
      const transaction = await TransactionModel.createTransaction({
        userId,
        amount: amountDecimal.toNumber(),
        type,
        referenceId,
        description,
        balanceBefore: balanceBefore.toNumber(),
        balanceAfter: balanceAfter.toNumber(),
        metadata,
      });
      
      await client.query('COMMIT');
      
      // Invalidate cache
      await cacheManager.del(CACHE_KEYS.USER_WALLET(userId));
      
      return { wallet: updatedWallet, transaction };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async debit(userId, amount, type, referenceId, description, metadata = {}) {
    const client = await WalletModel.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      const wallet = await WalletModel.getWallet(userId);
      
      if (wallet.is_locked) {
        throw new Error(`Wallet is locked: ${wallet.lock_reason}`);
      }
      
      const balanceBefore = new Decimal(wallet.balance);
      const amountDecimal = new Decimal(amount);
      
      if (balanceBefore.lessThan(amountDecimal)) {
        throw new Error('Insufficient balance');
      }
      
      const balanceAfter = balanceBefore.minus(amountDecimal);
      
      // Update wallet
      const updatedWallet = await WalletModel.debit(userId, amountDecimal.toNumber());
      
      // Create transaction record
      const transaction = await TransactionModel.createTransaction({
        userId,
        amount: -amountDecimal.toNumber(),
        type,
        referenceId,
        description,
        balanceBefore: balanceBefore.toNumber(),
        balanceAfter: balanceAfter.toNumber(),
        metadata,
      });
      
      await client.query('COMMIT');
      
      // Invalidate cache
      await cacheManager.del(CACHE_KEYS.USER_WALLET(userId));
      
      return { wallet: updatedWallet, transaction };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async addCashback(userId, amount, metadata = {}) {
    const minCashback = 1;
    const amountDecimal = new Decimal(amount);
    
    if (amountDecimal.lessThan(minCashback)) {
      return null;
    }
    
    return await this.credit(
      userId,
      amountDecimal.toNumber(),
      'cashback',
      metadata.referenceId,
      metadata.description || `Cashback earned`,
      metadata
    );
  }

  async getTransactions(userId, limit = 50, offset = 0, type = null) {
    return await TransactionModel.getUserTransactions(userId, limit, offset, type);
  }

  async getTransactionSummary(userId, days = 30) {
    return await TransactionModel.getTransactionSummary(userId, days);
  }

  async requestWithdrawal(userId, amount, phoneNumber, metadata = {}) {
    const minAmount = parseFloat(process.env.WITHDRAWAL_MIN_AMOUNT) || 100;
    const maxAmount = parseFloat(process.env.WITHDRAWAL_MAX_AMOUNT) || 50000;
    const dailyLimit = parseFloat(process.env.WITHDRAWAL_DAILY_LIMIT) || 100000;
    
    // Validate amount
    if (amount < minAmount) {
      throw new Error(`Minimum withdrawal amount is KES ${minAmount}`);
    }
    
    if (amount > maxAmount) {
      throw new Error(`Maximum withdrawal amount is KES ${maxAmount}`);
    }
    
    // Check daily limit
    const todayWithdrawals = await WithdrawalModel.getUserWithdrawals(userId, 'completed');
    const todayTotal = todayWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    
    if (todayTotal + amount > dailyLimit) {
      throw new Error(`Daily withdrawal limit is KES ${dailyLimit}`);
    }
    
    // Check balance
    const balance = await this.getBalance(userId);
    if (balance.lessThan(amount)) {
      throw new Error('Insufficient balance');
    }
    
    // Create withdrawal request
    const withdrawal = await WithdrawalModel.createWithdrawal({
      userId,
      amount,
      phoneNumber,
      metadata,
    });
    
    // Queue for processing
    await queueManager.addJob(QUEUES.NOTIFICATION, 'process_withdrawal', {
      withdrawalId: withdrawal.id,
      userId,
      amount,
      phoneNumber,
    });
    
    return withdrawal;
  }

  async processWithdrawal(withdrawalId) {
    const withdrawal = await WithdrawalModel.findById(withdrawalId);
    
    if (!withdrawal) {
      throw new Error('Withdrawal not found');
    }
    
    if (withdrawal.status !== 'pending') {
      throw new Error(`Withdrawal already ${withdrawal.status}`);
    }
    
    try {
      // Update status to processing
      await WithdrawalModel.updateWithdrawalStatus(withdrawalId, 'processing');
      
      // Debit from wallet
      await this.debit(
        withdrawal.user_id,
        withdrawal.amount,
        'withdrawal',
        withdrawal.id,
        `Withdrawal to ${withdrawal.phone_number}`,
        { withdrawalId }
      );
      
      // Initiate M-Pesa payout
      const mpesaService = require('./mpesaService');
      const payoutResult = await mpesaService.initiatePayout(
        withdrawal.phone_number,
        withdrawal.amount,
        `TIX_WD_${withdrawal.id}`
      );
      
      if (payoutResult.success) {
        await WithdrawalModel.updateWithdrawalStatus(withdrawalId, 'completed', {
          transactionId: payoutResult.transactionId,
        });
        
        return { success: true, withdrawal };
      } else {
        // Refund the amount back to wallet
        await this.credit(
          withdrawal.user_id,
          withdrawal.amount,
          'refund',
          withdrawal.id,
          `Withdrawal failed - refund`,
          { withdrawalId, reason: payoutResult.error }
        );
        
        await WithdrawalModel.updateWithdrawalStatus(withdrawalId, 'failed', {
          rejectionReason: payoutResult.error,
        });
        
        throw new Error(payoutResult.error);
      }
    } catch (error) {
      await WithdrawalModel.updateWithdrawalStatus(withdrawalId, 'failed', {
        rejectionReason: error.message,
      });
      throw error;
    }
  }

  async getWithdrawals(userId, status = null, limit = 50, offset = 0) {
    return await WithdrawalModel.getUserWithdrawals(userId, status, limit, offset);
  }

  async lockWallet(userId, reason) {
    const wallet = await WalletModel.lockWallet(userId, reason);
    await cacheManager.del(CACHE_KEYS.USER_WALLET(userId));
    return wallet;
  }

  async unlockWallet(userId) {
    const wallet = await WalletModel.unlockWallet(userId);
    await cacheManager.del(CACHE_KEYS.USER_WALLET(userId));
    return wallet;
  }

  async getStats() {
    const walletStats = await WalletModel.getWalletStats();
    const withdrawalStats = await WithdrawalModel.getWithdrawalStats();
    
    return {
      wallets: walletStats,
      withdrawals: withdrawalStats,
    };
  }
}

module.exports = new WalletService();