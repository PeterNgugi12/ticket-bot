const { queueManager, QUEUES } = require('../queue/queueManager');
const walletService = require('../services/walletService');

class WithdrawalWorker {
  constructor() {
    this.setupWorkers();
  }

  setupWorkers() {
    const queue = queueManager.getQueue(QUEUES.NOTIFICATION);
    
    if (!queue) {
      console.error('Notification queue not found');
      return;
    }
    
    queue.process('process_withdrawal', async (job) => {
      const { withdrawalId, userId, amount, phoneNumber } = job.data;
      
      console.log(`Processing withdrawal ${withdrawalId} for user ${userId}`);
      
      const result = await walletService.processWithdrawal(withdrawalId);
      
      return result;
    });
    
    console.log('Withdrawal worker initialized');
  }
}

// Start worker
if (require.main === module) {
  new WithdrawalWorker();
  console.log('Withdrawal worker running...');
}

module.exports = WithdrawalWorker;