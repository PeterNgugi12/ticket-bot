// services/mpesaService.js - FIXED with proper transaction status handling
const axios = require('axios');
const mpesaConfig = require('../config/mpesa');
const mpesaUtils = require('../utils/mpesaUtils');
const PaymentModel = require('../models/PaymentModel');
const cacheManager = require('../cache/cacheManager');
const { queueManager, QUEUES } = require('../queue/queueManager');

class MpesaService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const auth = Buffer.from(
        `${mpesaConfig.consumerKey}:${mpesaConfig.consumerSecret}`
      ).toString('base64');

      const response = await axios.get(mpesaConfig.getAuthUrl(), {
        headers: {
          Authorization: `Basic ${auth}`,
        },
        timeout: mpesaConfig.timeout,
      });

      if (response.data && response.data.access_token) {
        this.accessToken = response.data.access_token;
        this.tokenExpiry = Date.now() + 3500 * 1000;
        return this.accessToken;
      }
      
      throw new Error('Failed to get access token');
    } catch (error) {
      console.error('M-Pesa auth error:', error.response?.data || error.message);
      throw new Error('M-Pesa authentication failed');
    }
  }

  async stkPush(phoneNumber, amount, accountReference, transactionDesc, metadata = {}) {
    try {
      console.log('📤 Starting STK Push process...');
      
      const formattedPhone = this.validateAndFormatPhone(phoneNumber);
      if (!formattedPhone) {
        throw new Error('Invalid phone number format. Must be 254XXXXXXXXX');
      }
      
      const validAmount = Math.round(Number(amount));
      if (isNaN(validAmount) || validAmount < 1 || validAmount > 150000) {
        throw new Error('Amount must be between 1 and 150,000 KES');
      }
      
      console.log(`📱 Phone: ${formattedPhone}, Amount: ${validAmount}`);
      
      const token = await this.getAccessToken();
      console.log('✅ Access token obtained');
      
      const timestamp = mpesaConfig.getTimestamp();
      const password = Buffer.from(
        `${mpesaConfig.shortCode}${mpesaConfig.passkey}${timestamp}`
      ).toString('base64');
      
      console.log(`🔑 Shortcode: ${mpesaConfig.shortCode}`);
      console.log(`⏰ Timestamp: ${timestamp}`);
      
      const transactionType = mpesaConfig.shortCode.length === 6 
        ? 'CustomerBuyGoodsOnline'
        : 'CustomerPayBillOnline';
      
      console.log(`📝 Transaction Type: ${transactionType}`);
      
      const requestBody = {
        BusinessShortCode: mpesaConfig.shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: transactionType,
        Amount: validAmount,
        PartyA: formattedPhone,
        PartyB: mpesaConfig.shortCode,
        PhoneNumber: formattedPhone,
        CallBackURL: mpesaConfig.callbacks.stkPush,
        AccountReference: (accountReference || `TIX${Date.now()}`).substring(0, 12),
        TransactionDesc: (transactionDesc || 'Ticket Purchase').substring(0, 36),
      };
      
      console.log('📦 STK Push Request:', {
        ...requestBody,
        Password: '***HIDDEN***'
      });
      
      const response = await axios.post(mpesaConfig.getStkPushUrl(), requestBody, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
      
      console.log('📥 STK Push Response:', response.data);
      
      if (response.data && response.data.ResponseCode === '0') {
        const checkoutRequestID = response.data.CheckoutRequestID;
        
        // Store in cache
        await cacheManager.set(
          `mpesa:request:${checkoutRequestID}`,
          {
            phoneNumber: formattedPhone,
            amount: validAmount,
            accountReference,
            transactionDesc,
            metadata,
            createdAt: Date.now(),
            checkoutRequestID,
            status: 'pending',
          },
          3600
        );
        
        // Update payment record
        if (metadata.paymentId) {
          await PaymentModel.updatePaymentStatus(metadata.paymentId, 'pending', {
            checkout_request_id: checkoutRequestID,
            mpesa_request_timestamp: timestamp,
          });
        }
        
        // Start polling for transaction status after delay
        this.startTransactionPolling(checkoutRequestID, metadata.paymentId);
        
        return {
          success: true,
          checkoutRequestID: checkoutRequestID,
          merchantRequestID: response.data.MerchantRequestID,
          responseCode: response.data.ResponseCode,
          responseDescription: response.data.ResponseDescription,
          customerMessage: response.data.CustomerMessage,
        };
      } else {
        const errorMessages = {
          '1037': 'Transaction cancelled by user',
          '1032': 'Insufficient funds',
          '1033': 'Transaction amount exceeds limit',
          '1001': 'Invalid shortcode or passkey',
          '1002': 'Invalid credentials',
        };
        
        const errorMsg = errorMessages[response.data.ResponseCode] || 
                        response.data.ResponseDescription || 
                        'Transaction failed';
        
        console.error('STK Push business error:', {
          code: response.data.ResponseCode,
          desc: response.data.ResponseDescription
        });
        
        return {
          success: false,
          responseCode: response.data.ResponseCode,
          responseDescription: errorMsg,
          errorMessage: errorMsg
        };
      }
    } catch (error) {
      console.error('STK Push technical error:', error.message);
      throw new Error(`STK Push failed: ${error.message}`);
    }
  }

  async startTransactionPolling(checkoutRequestID, paymentId, attempt = 1) {
    const maxAttempts = 10;
    const delays = [5000, 5000, 10000, 10000, 15000, 20000, 25000, 30000, 35000, 40000];
    
    const delay = delays[attempt - 1] || 30000;
    
    console.log(`⏳ Polling transaction ${checkoutRequestID} (Attempt ${attempt}/${maxAttempts})`);
    
    setTimeout(async () => {
      try {
        const status = await this.checkTransactionStatus(checkoutRequestID);
        
        if (status.success === true && status.resultCode === '0') {
          console.log(`✅ Transaction ${checkoutRequestID} completed successfully`);
          
          // Update cache
          await cacheManager.set(
            `mpesa:request:${checkoutRequestID}`,
            { status: 'completed', result: status },
            3600
          );
          
          // Queue ticket fulfillment
          await queueManager.addJob(QUEUES.NOTIFICATION, 'payment_success', {
            paymentId: paymentId,
            transactionData: status,
          });
          
        } else if (status.resultCode === '1037') {
          console.log(`❌ Transaction ${checkoutRequestID} cancelled by user`);
          await PaymentModel.updatePaymentStatus(paymentId, 'failed', {
            mpesa_result_code: status.resultCode,
            mpesa_result_desc: status.resultDesc,
          });
          
        } else if (status.resultCode === '1032') {
          console.log(`❌ Transaction ${checkoutRequestID} insufficient funds`);
          await PaymentModel.updatePaymentStatus(paymentId, 'failed', {
            mpesa_result_code: status.resultCode,
            mpesa_result_desc: status.resultDesc,
          });
          
        } else if (status.resultCode === '500.001.1001') {
          console.log(`⏳ Transaction ${checkoutRequestID} still processing, waiting...`);
          if (attempt < maxAttempts) {
            this.startTransactionPolling(checkoutRequestID, paymentId, attempt + 1);
          } else {
            console.log(`⏰ Transaction ${checkoutRequestID} still pending after ${maxAttempts} attempts`);
            await PaymentModel.updatePaymentStatus(paymentId, 'pending', {
              mpesa_result_desc: 'Transaction still processing, please check M-Pesa statement',
            });
          }
          
        } else if (status.success === false && attempt < maxAttempts) {
          console.log(`⏳ Transaction ${checkoutRequestID} status unknown, retrying...`);
          this.startTransactionPolling(checkoutRequestID, paymentId, attempt + 1);
          
        } else {
          console.log(`❌ Transaction ${checkoutRequestID} failed after ${maxAttempts} attempts`);
          await PaymentModel.updatePaymentStatus(paymentId, 'failed', {
            mpesa_result_code: status.resultCode || 'TIMEOUT',
            mpesa_result_desc: status.resultDesc || 'Transaction timeout',
          });
        }
      } catch (error) {
        console.error(`Error polling transaction ${checkoutRequestID}:`, error);
        if (attempt < maxAttempts) {
          this.startTransactionPolling(checkoutRequestID, paymentId, attempt + 1);
        }
      }
    }, delay);
  }

  async checkTransactionStatus(checkoutRequestID) {
    try {
      console.log(`📊 Querying transaction status for: ${checkoutRequestID}`);
      
      const token = await this.getAccessToken();
      const timestamp = mpesaConfig.getTimestamp();
      const password = Buffer.from(
        `${mpesaConfig.shortCode}${mpesaConfig.passkey}${timestamp}`
      ).toString('base64');

      const requestBody = {
        BusinessShortCode: mpesaConfig.shortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestID,
      };

      const response = await axios.post(mpesaConfig.getStkQueryUrl(), requestBody, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: mpesaConfig.timeout,
      });

      console.log(`📊 Status query response for ${checkoutRequestID}:`, {
        ResultCode: response.data.ResultCode,
        ResultDesc: response.data.ResultDesc
      });

      const isSuccess = response.data.ResultCode === '0';
      const isProcessing = response.data.ResultCode === '500.001.1001' || 
                          response.data.ResultCode === '500.001.1002';

      return {
        success: isSuccess,
        isProcessing: isProcessing,
        resultCode: response.data.ResultCode,
        resultDesc: response.data.ResultDesc,
        data: response.data,
      };
    } catch (error) {
      console.error('Transaction status query error:', error.response?.data || error.message);
      return {
        success: false,
        resultCode: 'ERROR',
        resultDesc: error.response?.data?.errorMessage || error.message,
        isProcessing: false,
      };
    }
  }

  async queryTransactionStatus(checkoutRequestID) {
    return await this.checkTransactionStatus(checkoutRequestID);
  }

  async processSTKCallback(callbackData) {
    const { Body } = callbackData;
    
    if (!Body || !Body.stkCallback) {
      console.error('Invalid callback structure:', callbackData);
      return { success: false, error: 'Invalid callback structure' };
    }

    const { stkCallback } = Body;
    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = stkCallback;

    const requestData = await cacheManager.get(`mpesa:request:${CheckoutRequestID}`);
    
    if (!requestData) {
      console.error(`No request found for CheckoutRequestID: ${CheckoutRequestID}`);
      return { success: false, error: 'Request not found' };
    }

    const isSuccessful = ResultCode === '0';
    const transactionData = {
      merchantRequestID: MerchantRequestID,
      checkoutRequestID: CheckoutRequestID,
      resultCode: ResultCode,
      resultDesc: ResultDesc,
      callbackReceivedAt: new Date().toISOString(),
    };

    if (CallbackMetadata && CallbackMetadata.Item) {
      for (const item of CallbackMetadata.Item) {
        switch (item.Name) {
          case 'Amount':
            transactionData.amount = item.Value;
            break;
          case 'MpesaReceiptNumber':
            transactionData.mpesaReceiptNumber = item.Value;
            break;
          case 'TransactionDate':
            transactionData.transactionDate = item.Value;
            break;
          case 'PhoneNumber':
            transactionData.phoneNumber = item.Value;
            break;
        }
      }
    }

    if (isSuccessful && requestData.metadata.paymentId) {
      await PaymentModel.updatePaymentStatus(requestData.metadata.paymentId, 'completed', {
        mpesa_transaction_id: transactionData.mpesaReceiptNumber,
        checkout_request_id: CheckoutRequestID,
        mpesa_result_code: ResultCode,
        mpesa_result_desc: ResultDesc,
        callback_received_at: transactionData.callbackReceivedAt,
        metadata: transactionData,
      });

      await queueManager.addJob(QUEUES.NOTIFICATION, 'payment_success', {
        paymentId: requestData.metadata.paymentId,
        transactionData,
        userMetadata: requestData.metadata,
      });

      await cacheManager.del(`mpesa:request:${CheckoutRequestID}`);

      return {
        success: true,
        transactionData,
        paymentId: requestData.metadata.paymentId,
      };
    } else {
      if (requestData.metadata.paymentId) {
        await PaymentModel.updatePaymentStatus(requestData.metadata.paymentId, 'failed', {
          checkout_request_id: CheckoutRequestID,
          mpesa_result_code: ResultCode,
          mpesa_result_desc: ResultDesc,
          callback_received_at: transactionData.callbackReceivedAt,
        });
      }

      return {
        success: false,
        error: ResultDesc,
        resultCode: ResultCode,
        paymentId: requestData.metadata.paymentId,
      };
    }
  }

  validateAndFormatPhone(phoneNumber) {
    let cleaned = phoneNumber.toString().replace(/\D/g, '');
    
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('+254')) {
      cleaned = cleaned.substring(1);
    } else if (cleaned.length === 9) {
      cleaned = '254' + cleaned;
    } else if (cleaned.length === 10 && !cleaned.startsWith('254')) {
      cleaned = '254' + cleaned;
    }
    
    const phoneRegex = /^254[17]\d{8}$/;
    if (!phoneRegex.test(cleaned)) {
      console.error('Invalid phone number format:', { original: phoneNumber, formatted: cleaned });
      return null;
    }
    
    return cleaned;
  }

  async simulateCallback(checkoutRequestID, success = true) {
    const mockCallback = {
      Body: {
        stkCallback: {
          MerchantRequestID: `MERCH_${Date.now()}`,
          CheckoutRequestID: checkoutRequestID,
          ResultCode: success ? '0' : '1037',
          ResultDesc: success ? 'The service request is processed successfully.' : 'Transaction failed',
          CallbackMetadata: success ? {
            Item: [
              { Name: 'Amount', Value: 1000 },
              { Name: 'MpesaReceiptNumber', Value: `TEST${Date.now()}` },
              { Name: 'TransactionDate', Value: Date.now() },
              { Name: 'PhoneNumber', Value: '254712345678' },
            ],
          } : null,
        },
      },
    };

    return await this.processSTKCallback(mockCallback);
  }
}

module.exports = new MpesaService();