const mpesaUtils = require('../utils/mpesaUtils');
const TransactionLogModel = require('../models/TransactionLogModel');
const PaymentModel = require('../models/PaymentModel');
const ticketService = require('../services/ticketService');
const walletService = require('../services/walletService');
const cacheManager = require('../cache/cacheManager');
const { queueManager, QUEUES } = require('../queue/queueManager');

class MpesaCallbackHandler {
  constructor() {
    this.processingLocks = new Map();
  }

  async handleCallback(callbackData, headers = {}) {
    const startTime = Date.now();
    
    try {
      // Parse and validate callback
      const parsedCallback = mpesaUtils.parseCallbackData(callbackData);
      if (!parsedCallback) {
        return this.createErrorResponse('Invalid callback format');
      }
      
      const { checkoutRequestID, resultCode, mpesaReceiptNumber } = parsedCallback;
      
      // Acquire lock to prevent duplicate processing
      const lockKey = `callback_lock_${checkoutRequestID}`;
      const hasLock = await this.acquireLock(lockKey, 30000); // 30 second lock
      
      if (!hasLock) {
        console.log(`Callback already processing for ${checkoutRequestID}`);
        return this.createSuccessResponse();
      }
      
      try {
        // Check for duplicate callback
        const existingLog = await TransactionLogModel.getByCheckoutRequestId(checkoutRequestID);
        
        if (existingLog && mpesaUtils.isDuplicateCallback(existingLog, parsedCallback)) {
          console.log(`Duplicate callback received for ${checkoutRequestID}`);
          return this.createSuccessResponse();
        }
        
        // Create or update transaction log
        let transactionLog;
        
        if (!existingLog) {
          transactionLog = await TransactionLogModel.createLog({
            transaction_id: mpesaUtils.generateTransactionID(),
            checkout_request_id: checkoutRequestID,
            merchant_request_id: parsedCallback.merchantRequestID,
            transaction_type: 'stk_push',
            amount: parsedCallback.amount,
            phone_number: parsedCallback.phoneNumber,
            callback_payload: callbackData,
            metadata: { headers },
          });
        } else {
          transactionLog = existingLog;
        }
        
        // Update log with callback data
        await TransactionLogModel.updateLog(transactionLog.transaction_id, {
          result_code: resultCode,
          result_desc: parsedCallback.resultDesc,
          mpesa_receipt_number: mpesaReceiptNumber,
          transaction_date: parsedCallback.transactionDate ? 
            new Date(parseInt(parsedCallback.transactionDate)) : null,
          callback_received_at: new Date(),
          status: 'processing',
        });
        
        // Process based on result code
        let result;
        
        if (mpesaUtils.isSuccessfulTransaction(resultCode)) {
          result = await this.processSuccessfulTransaction(transactionLog, parsedCallback);
        } else {
          result = await this.processFailedTransaction(transactionLog, parsedCallback);
        }
        
        // Update final status
        await TransactionLogModel.updateLog(transactionLog.transaction_id, {
          status: result.success ? 'completed' : 'failed',
          processed_at: new Date(),
          error_message: result.error || null,
        });
        
        const processingTime = Date.now() - startTime;
        console.log(`Callback processed in ${processingTime}ms:`, {
          checkoutRequestID,
          resultCode,
          success: result.success,
        });
        
        return this.createSuccessResponse();
        
      } finally {
        // Release lock
        await this.releaseLock(lockKey);
      }
      
    } catch (error) {
      console.error('Callback handling error:', error);
      return this.createSuccessResponse(); // Always return success to M-Pesa
    }
  }

  async processSuccessfulTransaction(transactionLog, callback) {
    try {
      const { checkoutRequestID, mpesaReceiptNumber, amount, phoneNumber } = callback;
      
      // Find associated payment
      const payment = await PaymentModel.getPaymentByCheckoutRequestId(checkoutRequestID);
      
      if (!payment) {
        console.error(`No payment found for checkout request: ${checkoutRequestID}`);
        return { success: false, error: 'Payment not found' };
      }
      
      // Update payment as completed
      await PaymentModel.updatePaymentStatus(payment.id, 'completed', {
        mpesa_transaction_id: mpesaReceiptNumber,
        mpesa_result_code: callback.resultCode,
        mpesa_result_desc: callback.resultDesc,
        completed_at: new Date(),
      });
      
      // Process ticket fulfillment
      const metadata = payment.metadata;
      
      if (metadata && metadata.eventId && metadata.tierId) {
        // Create tickets
        const purchaseResult = await ticketService.purchaseTickets({
          userId: payment.user_id,
          eventId: metadata.eventId,
          tierId: metadata.tierId,
          quantity: metadata.quantity,
          attendeeName: metadata.attendeeName,
          attendeeEmail: metadata.attendeeEmail,
          attendeePhone: metadata.attendeePhone,
          paymentMethod: 'mpesa',
          paymentId: payment.id,
        });
        
        // Calculate and add cashback (2% of ticket price)
        const cashbackAmount = payment.amount * 0.02;
        if (cashbackAmount > 0) {
          await walletService.addCashback(payment.user_id, cashbackAmount, {
            type: 'cashback',
            referenceId: payment.id,
            description: `Cashback for ${metadata.eventTitle || 'ticket purchase'}`,
          });
        }
        
        // Queue email notification
        await queueManager.addJob(QUEUES.EMAIL, 'send_tickets', {
          userId: payment.user_id,
          eventId: metadata.eventId,
          tickets: purchaseResult.tickets,
          attendeeEmail: metadata.attendeeEmail,
          attendeeName: metadata.attendeeName,
          eventTitle: metadata.eventTitle,
          eventDate: metadata.eventDate,
          venueName: metadata.venueName,
          totalAmount: payment.amount,
        });
        
        // Queue SMS notification
        await queueManager.addJob(QUEUES.NOTIFICATION, 'send_sms', {
          phoneNumber,
          message: `Payment of KES ${amount} successful. Your tickets have been sent to ${metadata.attendeeEmail}`,
        });
        
        // Store in cache for quick access
        await cacheManager.set(
          `payment:${payment.id}:tickets`,
          purchaseResult.tickets,
          86400 // 24 hours
        );
        
        return { 
          success: true, 
          tickets: purchaseResult.tickets,
          cashbackAmount,
        };
      }
      
      return { success: true };
      
    } catch (error) {
      console.error('Failed to process successful transaction:', error);
      
      // Queue for retry
      await queueManager.addJob(QUEUES.MPESA_CALLBACK, 'retry_fulfillment', {
        transactionLogId: transactionLog.id,
        checkoutRequestID: callback.checkoutRequestID,
        attempt: 1,
      }, { delay: 60000 }); // Retry after 1 minute
      
      return { success: false, error: error.message };
    }
  }

  async processFailedTransaction(transactionLog, callback) {
    try {
      const { checkoutRequestID, resultCode, resultDesc } = callback;
      
      // Find associated payment
      const payment = await PaymentModel.getPaymentByCheckoutRequestId(checkoutRequestID);
      
      if (payment) {
        // Update payment as failed
        await PaymentModel.updatePaymentStatus(payment.id, 'failed', {
          mpesa_result_code: resultCode,
          mpesa_result_desc: resultDesc,
        });
        
        // Notify user of failure
        await queueManager.addJob(QUEUES.NOTIFICATION, 'payment_failed', {
          userId: payment.user_id,
          paymentId: payment.id,
          reason: resultDesc,
          amount: payment.amount,
        });
        
        // Release any held tickets (if applicable)
        const metadata = payment.metadata;
        if (metadata && metadata.heldTicketIds) {
          await this.releaseHeldTickets(metadata.heldTicketIds);
        }
      }
      
      return { success: true };
      
    } catch (error) {
      console.error('Failed to process failed transaction:', error);
      return { success: false, error: error.message };
    }
  }

  async releaseHeldTickets(ticketIds) {
    // Implementation to release temporarily held tickets
    const db = require('../db/pool');
    
    for (const ticketId of ticketIds) {
      await db.query(
        `UPDATE tickets SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND status = 'pending'`,
        [ticketId]
      );
    }
  }

  async acquireLock(key, ttl) {
    try {
      const result = await cacheManager.setnx(key, 'locked', ttl / 1000);
      if (result) {
        this.processingLocks.set(key, setTimeout(() => {
          this.processingLocks.delete(key);
        }, ttl));
      }
      return result;
    } catch (error) {
      console.error('Failed to acquire lock:', error);
      return false;
    }
  }

  async releaseLock(key) {
    const timeout = this.processingLocks.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.processingLocks.delete(key);
    }
    await cacheManager.del(key);
  }

  createSuccessResponse() {
    return {
      ResultCode: '0',
      ResultDesc: 'Success',
    };
  }

  createErrorResponse(message) {
    return {
      ResultCode: '1',
      ResultDesc: message,
    };
  }
}

module.exports = new MpesaCallbackHandler();