const { queueManager, QUEUES } = require('../queue/queueManager');
const TransactionLogModel = require('../models/TransactionLogModel');
const mpesaService = require('../services/mpesaService');
const mpesaCallbackHandler = require('../services/mpesaCallbackHandler');

class TransactionWorker {
  constructor() {
    this.setupWorkers();
    this.startRecoveryJob();
  }

  setupWorkers() {
    const queue = queueManager.getQueue(QUEUES.MPESA_CALLBACK);
    
    if (!queue) {
      console.error('M-Pesa queue not found');
      return;
    }
    
    // Process transaction status checks
    queue.process('check_transaction_status', async (job) => {
      const { checkoutRequestID, paymentId, retryCount } = job.data;
      
      console.log(`Checking transaction status for ${checkoutRequestID}, attempt ${retryCount + 1}`);
      
      const result = await mpesaService.queryTransactionStatus(checkoutRequestID);
      
      if (result.success) {
        // Transaction completed, process callback
        const callbackData = {
          Body: {
            stkCallback: {
              CheckoutRequestID: checkoutRequestID,
              ResultCode: result.resultCode,
              ResultDesc: result.resultDesc,
              CallbackMetadata: {
                Item: [
                  { Name: 'Amount', Value: result.data.Amount },
                  { Name: 'MpesaReceiptNumber', Value: result.data.MpesaReceiptNumber },
                  { Name: 'TransactionDate', Value: result.data.TransactionDate },
                  { Name: 'PhoneNumber', Value: result.data.PhoneNumber },
                ],
              },
            },
          },
        };
        
        await mpesaCallbackHandler.handleCallback(callbackData);
        
        return { status: 'completed', result };
        
      } else if (retryCount < 8) {
        // Retry with exponential backoff
        const delay = Math.min(Math.pow(2, retryCount) * 15000, 300000);
        
        await queueManager.addJob(
          QUEUES.MPESA_CALLBACK,
          'check_transaction_status',
          {
            checkoutRequestID,
            paymentId,
            retryCount: retryCount + 1,
          },
          { delay }
        );
        
        return { status: 'pending', retryCount: retryCount + 1 };
        
      } else {
        // Max retries reached, mark as failed
        console.error(`Transaction ${checkoutRequestID} failed after ${retryCount + 1} attempts`);
        
        if (paymentId) {
          await PaymentModel.updatePaymentStatus(paymentId, 'failed', {
            mpesa_result_desc: 'Transaction status check timeout after maximum retries',
          });
        }
        
        return { status: 'failed', error: 'Max retries reached' };
      }
    });
    
    // Process retry fulfillment
    queue.process('retry_fulfillment', async (job) => {
      const { transactionLogId, checkoutRequestID, attempt } = job.data;
      
      console.log(`Retrying fulfillment for ${checkoutRequestID}, attempt ${attempt}`);
      
      const transactionLog = await TransactionLogModel.findById(transactionLogId);
      
      if (!transactionLog || transactionLog.status === 'completed') {
        return { status: 'already_processed' };
      }
      
      // Re-process the callback
      const callbackData = transactionLog.callback_payload;
      const result = await mpesaCallbackHandler.handleCallback(callbackData);
      
      if (!result.success && attempt < 3) {
        // Retry again
        await queueManager.addJob(
          QUEUES.MPESA_CALLBACK,
          'retry_fulfillment',
          {
            transactionLogId,
            checkoutRequestID,
            attempt: attempt + 1,
          },
          { delay: 60000 * attempt } // Increasing delay
        );
      }
      
      return { status: result.success ? 'completed' : 'failed', attempt };
    });
  }

  startRecoveryJob() {
    // Run every 5 minutes to recover pending transactions
    setInterval(async () => {
      try {
        await this.recoverPendingTransactions();
      } catch (error) {
        console.error('Transaction recovery failed:', error);
      }
    }, 300000); // 5 minutes
  }

  async recoverPendingTransactions() {
    console.log('Running transaction recovery...');
    
    const pendingTransactions = await TransactionLogModel.getPendingTransactions(50);
    const failedTransactions = await TransactionLogModel.getFailedTransactions(50);
    
    const allTransactions = [...pendingTransactions, ...failedTransactions];
    
    for (const transaction of allTransactions) {
      if (transaction.checkout_request_id) {
        await queueManager.addJob(
          QUEUES.MPESA_CALLBACK,
          'check_transaction_status',
          {
            checkoutRequestID: transaction.checkout_request_id,
            paymentId: transaction.metadata?.paymentId,
            retryCount: transaction.retry_count || 0,
          },
          { delay: 1000 }
        );
      }
    }
    
    console.log(`Recovered ${allTransactions.length} transactions`);
  }
}

// Start worker
if (require.main === module) {
  new TransactionWorker();
  console.log('Transaction worker running...');
}

module.exports = TransactionWorker;