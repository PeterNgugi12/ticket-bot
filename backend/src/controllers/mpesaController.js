const mpesaService = require('../services/mpesaService');
const mpesaCallbackHandler = require('../services/mpesaCallbackHandler');
const PaymentModel = require('../models/PaymentModel');
const TransactionLogModel = require('../models/TransactionLogModel');
const ticketService = require('../services/ticketService');
const walletService = require('../services/walletService');
const mpesaUtils = require('../utils/mpesaUtils');

class MpesaController {
  // EXISTING METHOD - Create payment record
  async createPayment(req, res, next) {
    try {
      const { userId, eventId, amount, paymentMethod, metadata } = req.body;
      
      // Create payment record
      const payment = await PaymentModel.createPayment({
        userId: userId || req.userId,
        eventId,
        amount,
        paymentMethod: paymentMethod || 'mpesa',
        status: 'pending',
        metadata,
      });
      
      res.status(201).json({
        success: true,
        message: 'Payment record created',
        paymentId: payment.id,
        data: { payment },
      });
    } catch (error) {
      console.error('Create payment error:', error);
      next(error);
    }
  }

  // 🆕 NEW METHOD - WhatsApp Payment Initiation (NO AUTH REQUIRED)
  async initiateWhatsAppPayment(req, res, next) {
    try {
      console.log('📱 WhatsApp Payment Initiation:', {
        body: req.body,
        timestamp: new Date().toISOString()
      });

      const {
        phoneNumber,
        amount,
        accountReference,
        transactionDesc,
        metadata,
      } = req.body;

      // Validate phone number
      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Phone number is required',
        });
      }

      let formattedPhone = phoneNumber.toString().replace(/\D/g, '');
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '254' + formattedPhone.substring(1);
      }
      if (!formattedPhone.startsWith('254')) {
        formattedPhone = '254' + formattedPhone;
      }

      if (!mpesaUtils.validateMpesaNumber(formattedPhone)) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid phone number format. Use 2547XXXXXXXX or 07XXXXXXXX',
        });
      }

      // Validate amount
      if (amount < 1 || amount > 150000) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Amount must be between KES 1 and KES 150,000',
        });
      }

      // Generate unique references
      const uniqueRef = accountReference || `WA-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
      const paymentId = `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

      // Create a temporary user if needed (for ticket association)
      let userId = metadata?.userId;
      if (!userId && metadata?.attendeeEmail) {
        // Try to find or create user by email
        const UserModel = require('../models/UserModel');
        let user = await UserModel.findByEmail(metadata.attendeeEmail);
        if (!user) {
          // Create temporary user
          user = await UserModel.createUser({
            phoneNumber: formattedPhone,
            email: metadata.attendeeEmail,
            fullName: metadata.attendeeName || 'WhatsApp User',
            role: 'user',
          });
        }
        userId = user.id;
      }

      // Create payment record in database
      const payment = await PaymentModel.createPayment({
        userId: userId || null,
        eventId: metadata?.eventId || null,
        amount: amount,
        paymentMethod: 'mpesa',
        status: 'pending',
        mpesa_ref: uniqueRef,
        metadata: {
          ...metadata,
          source: 'whatsapp',
          phoneNumber: formattedPhone,
          whatsappNumber: req.body.whatsappNumber || null
        },
      });

      // Initiate M-Pesa STK Push
      const result = await mpesaService.stkPush(
        formattedPhone,
        amount,
        uniqueRef,
        transactionDesc || 'Ticket Purchase via WhatsApp',
        { 
          paymentId: payment.id, 
          userId: userId,
          source: 'whatsapp'
        }
      );

      if (result.success) {
        // Update payment with checkout request ID
        await PaymentModel.updatePaymentStatus(payment.id, 'pending', {
          checkout_request_id: result.checkoutRequestID,
          merchant_request_id: result.merchantRequestID,
        });

        res.status(200).json({
          success: true,
          message: 'STK Push sent successfully',
          data: {
            checkoutRequestID: result.checkoutRequestID,
            merchantRequestID: result.merchantRequestID,
            paymentId: payment.id,
            responseCode: result.ResponseCode,
            responseDescription: result.responseDescription,
            customerMessage: result.customerMessage,
          },
        });
      } else {
        await PaymentModel.updatePaymentStatus(payment.id, 'failed', {
          error_message: result.errorMessage || 'STK Push failed',
        });

        res.status(400).json({
          success: false,
          message: 'Failed to send STK Push',
          error: result.errorMessage,
        });
      }
    } catch (error) {
      console.error('WhatsApp payment initiation error:', error);
      next(error);
    }
  }

  // EXISTING METHOD - Initiate Payment (requires auth)
  async initiatePayment(req, res, next) {
    try {
      const {
        phoneNumber,
        amount,
        accountReference,
        transactionDesc,
        paymentId,
      } = req.body;

      // Validate phone number
      if (!mpesaUtils.validateMpesaNumber(phoneNumber)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid phone number format. Use 2547XXXXXXXX or 07XXXXXXXX',
        });
      }

      // Validate amount
      if (amount < 1 || amount > 150000) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Amount must be between KES 1 and KES 150,000',
        });
      }

      const result = await mpesaService.stkPush(
        phoneNumber,
        amount,
        accountReference,
        transactionDesc,
        { paymentId, userId: req.userId }
      );

      res.status(200).json({
        success: result.success,
        message: result.success ? 'STK Push sent successfully' : 'Failed to send STK Push',
        data: {
          checkoutRequestID: result.checkoutRequestID,
          responseDescription: result.responseDescription,
          customerMessage: result.customerMessage,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // EXISTING METHOD - Handle Callback
  async handleCallback(req, res, next) {
    try {
      // Log incoming callback
      console.log('M-Pesa Callback received:', {
        timestamp: new Date().toISOString(),
        ip: req.ip,
        headers: req.headers,
        body: req.body,
      });
      
      // Process callback
      const result = await mpesaCallbackHandler.handleCallback(
        req.body,
        req.headers
      );
      
      // Always respond with success to M-Pesa
      res.status(200).json(result);
      
    } catch (error) {
      console.error('Callback error:', error);
      res.status(200).json({
        ResultCode: '0',
        ResultDesc: 'Success',
      });
    }
  }

  // EXISTING METHOD - Handle Timeout
  async handleTimeout(req, res, next) {
    try {
      console.log('M-Pesa Timeout received:', req.body);
      
      // Update payment as failed due to timeout
      const { CheckoutRequestID } = req.body;
      const payment = await PaymentModel.getPaymentByCheckoutRequestId(CheckoutRequestID);
      
      if (payment) {
        await PaymentModel.updatePaymentStatus(payment.id, 'failed', {
          mpesa_result_desc: 'Transaction timeout - user did not complete payment',
        });
      }
      
      res.status(200).json({
        ResultCode: '0',
        ResultDesc: 'Success',
      });
    } catch (error) {
      console.error('Timeout handling error:', error);
      res.status(200).json({
        ResultCode: '0',
        ResultDesc: 'Success',
      });
    }
  }

  // EXISTING METHOD - Query Transaction (requires auth)
  async queryTransaction(req, res, next) {
    try {
      const { checkoutRequestID } = req.params;
      
      const result = await mpesaService.queryTransactionStatus(checkoutRequestID);
      
      res.status(200).json({
        success: result.success,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // 🆕 ADD PUBLIC QUERY ENDPOINT FOR WHATSAPP
  async queryWhatsAppTransaction(req, res, next) {
    try {
      const { checkoutRequestID } = req.params;
      
      const result = await mpesaService.queryTransactionStatus(checkoutRequestID);
      
      res.status(200).json({
        success: result.success,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // EXISTING METHOD - Get Payment Status (requires auth)
  async getPaymentStatus(req, res, next) {
    try {
      const { paymentId } = req.params;
      
      const payment = await PaymentModel.findById(paymentId);
      
      if (!payment) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Payment not found',
        });
      }
      
      // Check ownership
      if (payment.user_id !== req.userId && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only view your own payments',
        });
      }
      
      res.status(200).json({
        success: true,
        data: { payment },
      });
    } catch (error) {
      next(error);
    }
  }

  async getTransactionLog(req, res, next) {
    try {
      const { transactionId } = req.params;
      
      const transaction = await TransactionLogModel.getByTransactionId(transactionId);
      
      if (!transaction) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Transaction not found',
        });
      }
      
      res.status(200).json({
        success: true,
        data: { transaction },
      });
    } catch (error) {
      next(error);
    }
  }

  async getTransactionStats(req, res, next) {
    try {
      const stats = await TransactionLogModel.db.query(`
        SELECT 
          COUNT(*) as total_transactions,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          AVG(CASE WHEN status = 'completed' THEN amount END) as avg_amount,
          SUM(CASE WHEN status = 'completed' THEN amount END) as total_volume
        FROM transaction_logs
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);
      
      res.status(200).json({
        success: true,
        data: stats.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }

  async replayTransaction(req, res, next) {
    // Admin only - replay failed transaction
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admins can replay transactions',
      });
    }
    
    try {
      const { transactionId } = req.params;
      
      const transaction = await TransactionLogModel.getByTransactionId(transactionId);
      
      if (!transaction) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Transaction not found',
        });
      }
      
      // Re-process the callback
      const result = await mpesaCallbackHandler.handleCallback(
        transaction.callback_payload
      );
      
      res.status(200).json({
        success: true,
        message: 'Transaction replayed',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async simulatePayment(req, res, next) {
    // Development only - simulate successful payment
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Simulation only available in development',
      });
    }
    
    try {
      const { checkoutRequestID, success } = req.body;
      
      const result = await mpesaService.simulateCallback(checkoutRequestID, success);
      
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

}

module.exports = new MpesaController();