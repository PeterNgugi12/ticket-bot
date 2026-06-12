const walletService = require('./walletService');
const UserModel = require('../models/UserModel');

class CashbackService {
  constructor() {
    this.cashbackRate = parseFloat(process.env.CASHBACK_RATE) || 0.02;
    this.referralCashback = parseFloat(process.env.REFERRAL_CASHBACK) || 200;
    this.referralRate = parseFloat(process.env.REFERRAL_CASHBACK_RATE) || 0.01;
  }

  async calculateCashback(amount) {
    return amount * this.cashbackRate;
  }

  async addPurchaseCashback(userId, amount, purchaseData) {
    const cashbackAmount = await this.calculateCashback(amount);
    
    if (cashbackAmount < 1) {
      return null;
    }
    
    return await walletService.addCashback(userId, cashbackAmount, {
      referenceId: purchaseData.paymentId,
      description: `Cashback for ${purchaseData.eventTitle} purchase`,
      eventId: purchaseData.eventId,
      tierId: purchaseData.tierId,
    });
  }

  async addReferralCashback(referrerId, referredUserId, purchaseAmount) {
    const cashbackAmount = this.referralCashback;
    const percentageCashback = purchaseAmount * this.referralRate;
    const totalCashback = cashbackAmount + percentageCashback;
    
    return await walletService.addCashback(referrerId, totalCashback, {
      referenceId: referredUserId,
      description: `Referral cashback for bringing a new user`,
      referredUserId,
      purchaseAmount,
    });
  }

  async getCashbackStats(userId) {
    const wallet = await walletService.getWallet(userId);
    const transactions = await walletService.getTransactions(userId, 100, 0, 'cashback');
    
    const totalCashback = wallet.total_cashback;
    const recentCashback = transactions.slice(0, 10);
    
    return {
      totalCashback,
      recentCashback,
      cashbackRate: this.cashbackRate * 100,
    };
  }
}

module.exports = new CashbackService();