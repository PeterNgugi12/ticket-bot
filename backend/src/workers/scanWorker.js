const { queueManager, QUEUES } = require('../queue/queueManager');
const scanService = require('../services/scanService');

class ScanWorker {
  constructor() {
    this.setupWorkers();
  }

  setupWorkers() {
    const queue = queueManager.getQueue(QUEUES.TICKET_SCAN);
    
    if (!queue) {
      console.error('Ticket scan queue not found');
      return;
    }
    
    queue.process('process_scan', async (job) => {
      const { imageBuffer, scannerId, eventId, metadata } = job.data;
      
      console.log(`Processing scan from scanner ${scannerId}`);
      
      const result = await scanService.processScan(
        imageBuffer,
        scannerId,
        eventId,
        metadata
      );
      
      return result;
    });
    
    queue.process('bulk_verify', async (job) => {
      const { ticketNumbers, eventId, scannerId } = job.data;
      
      console.log(`Bulk verifying ${ticketNumbers.length} tickets`);
      
      const results = await scanService.verifyMultipleTickets(ticketNumbers, eventId, scannerId);
      
      return results;
    });
    
    console.log('Scan worker initialized');
  }
}

// Start worker
if (require.main === module) {
  new ScanWorker();
  console.log('Scan worker running...');
}

module.exports = ScanWorker;