const { queueManager, QUEUES } = require('../queue/queueManager');
const mpesaService = require('../services/mpesaService');
const PaymentModel = require('../models/PaymentModel');

class MpesaWorker {
  constructor() {
    this.setupWorkers();
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
        // Transaction completed
        console.log(`Transaction ${checkoutRequestID} completed successfully`);
        
        // Update payment
        if (paymentId) {
          await PaymentModel.updatePaymentStatus(paymentId, 'completed', {
            mpesa_transaction_id: result.data.MpesaReceiptNumber,
            mpesa_result_code: result.resultCode,
            mpesa_result_desc: result.resultDesc,
          });
        }
        
        return { status: 'completed', result };
      } else if (retryCount < 5) {
        // Retry after delay
        const delay = Math.pow(2, retryCount) * 10000; // Exponential backoff
        console.log(`Transaction ${checkoutRequestID} still pending, retrying in ${delay}ms`);
        
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
            mpesa_result_desc: 'Transaction status check timeout',
          });
        }
        
        return { status: 'failed', error: 'Max retries reached' };
      }
    });
    
    console.log('M-Pesa worker initialized');
  }
}

// Start worker
if (require.main === module) {
  new MpesaWorker();
  console.log('M-Pesa worker running...');
}

module.exports = MpesaWorker;