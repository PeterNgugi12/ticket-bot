const moment = require('moment');

const mpesaConfig = {
  // Environment
  env: process.env.MPESA_ENV || 'production', // sandbox or production
  
  // API Endpoints
  endpoints: {
    sandbox: {
      auth: 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      stkPush: 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      stkQuery: 'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
      accountBalance: 'https://sandbox.safaricom.co.ke/mpesa/accountbalance/v1/query',
      transactionStatus: 'https://sandbox.safaricom.co.ke/mpesa/transactionstatus/v1/query',
      reversal: 'https://sandbox.safaricom.co.ke/mpesa/reversal/v1/request',
    },
    production: {
      auth: 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      stkPush: 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      stkQuery: 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query',
      accountBalance: 'https://api.safaricom.co.ke/mpesa/accountbalance/v1/query',
      transactionStatus: 'https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query',
      reversal: 'https://api.safaricom.co.ke/mpesa/reversal/v1/request',
    },
  },
  
  // Credentials
  consumerKey: process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET,
  passkey: process.env.MPESA_PASSKEY,
  shortCode: process.env.MPESA_SHORTCODE,
  initiatorName: process.env.MPESA_INITIATOR_NAME,
  initiatorPassword: process.env.MPESA_INITIATOR_PASSWORD,
  
  // Business details
  businessShortCode: process.env.MPESA_SHORTCODE,
  partyA: process.env.MPESA_SHORTCODE, // Organization's paybill/till number
  accountReference: 'TIX_CULTURE',
  transactionType: 'CustomerPayBillOnline', // or 'CustomerBuyGoodsOnline'
  
  // Callback URLs
  callbacks: {
    stkPush: process.env.MPESA_CALLBACK_URL || 'https://your-domain.com/api/v1/mpesa/callback',
    transactionStatus: process.env.MPESA_TRANSACTION_STATUS_URL,
    accountBalance: process.env.MPESA_ACCOUNT_BALANCE_URL,
  },
  
  // Timeouts & Retries
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 2000, // 2 seconds
  
  // Queue settings
  queueName: 'mpesa_transactions',
  maxConcurrentJobs: 10,
  
  // Helper functions
  getAuthUrl() {
    return this.endpoints[this.env].auth;
  },
  
  getStkPushUrl() {
    return this.endpoints[this.env].stkPush;
  },
  
  getStkQueryUrl() {
    return this.endpoints[this.env].stkQuery;
  },
  
  getTimestamp() {
    return moment().format('YYYYMMDDHHmmss');
  },
  
  generatePassword() {
    const timestamp = this.getTimestamp();
    const password = Buffer.from(
      `${this.shortCode}${this.passkey}${timestamp}`
    ).toString('base64');
    return { password, timestamp };
  },
};

module.exports = mpesaConfig;