const { queueManager, QUEUES } = require('../queue/queueManager');
const resaleService = require('../services/resaleService');
const EscrowModel = require('../models/EscrowModel');

class ResaleWorker {
  constructor() {
    this.setupWorkers();
    this.setupCronJobs();
  }

  setupWorkers() {
    const queue = queueManager.getQueue(QUEUES.NOTIFICATION);
    
    if (!queue) {
      console.error('Notification queue not found');
      return;
    }
    
    queue.process('release_escrow', async (job) => {
      const { escrowId, sellerId, amount } = job.data;
      
      console.log(`Releasing escrow ${escrowId} to seller ${sellerId}`);
      
      const result = await resaleService.releaseEscrow(escrowId);
      
      return result;
    });
    
    queue.process('listing_created', async (job) => {
      const { listingId, sellerId, ticketId } = job.data;
      console.log(`Listing created: ${listingId} for ticket ${ticketId}`);
      return { success: true };
    });
    
    queue.process('listing_expired', async (job) => {
      const { listingId, sellerId, ticketId } = job.data;
      console.log(`Listing expired: ${listingId}`);
      return { success: true };
    });
    
    queue.process('ticket_purchased_resale', async (job) => {
      const { listingId, buyerId, sellerId, ticketId, amount } = job.data;
      console.log(`Ticket ${ticketId} purchased via resale for KES ${amount}`);
      return { success: true };
    });
    
    console.log('Resale worker initialized');
  }

  setupCronJobs() {
    const CronJob = require('cron').CronJob;
    
    // Run every hour to expire listings
    const expireJob = new CronJob('0 * * * *', async () => {
      console.log('Running listing expiry job...');
      const expired = await resaleService.expireExpiredListings();
      console.log(`Expired ${expired.length} listings`);
    });
    
    expireJob.start();
    
    // Run every 15 minutes to check for escrow releases
    const escrowJob = new CronJob('*/15 * * * *', async () => {
      console.log('Checking for escrow releases...');
      const pendingEscrow = await EscrowModel.getPendingReleaseEscrow();
      
      for (const escrow of pendingEscrow) {
        await queueManager.addJob(QUEUES.NOTIFICATION, 'release_escrow', {
          escrowId: escrow.id,
          sellerId: escrow.seller_id,
          amount: escrow.seller_amount,
        });
      }
      
      if (pendingEscrow.length > 0) {
        console.log(`Queued ${pendingEscrow.length} escrow releases`);
      }
    });
    
    escrowJob.start();
    
    console.log('Cron jobs initialized');
  }
}

// Start worker
if (require.main === module) {
  new ResaleWorker();
  console.log('Resale worker running...');
}

module.exports = ResaleWorker;