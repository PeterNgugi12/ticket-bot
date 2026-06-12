const { queueManager, QUEUES } = require('../queue/queueManager');
const qrTicketService = require('../services/qrTicketService');
const TicketModel = require('../models/TicketModel');

class QRWorker {
  constructor() {
    this.setupWorkers();
  }

  setupWorkers() {
    const queue = queueManager.getQueue(QUEUES.QR_GENERATION);
    
    if (!queue) {
      console.error('QR queue not found');
      return;
    }
    
    // Process single QR generation
    queue.process('generate_ticket_qr', async (job) => {
      const { ticketId, options } = job.data;
      
      console.log(`Generating QR for ticket ${ticketId}`);
      
      try {
        const result = await qrTicketService.generateTicketQRs(ticketId, options);
        
        return {
          success: true,
          ticketId,
          qrUrl: result.qr.cloudinaryUrl,
        };
      } catch (error) {
        console.error(`Failed to generate QR for ticket ${ticketId}:`, error);
        throw error;
      }
    });
    
    // Process batch QR generation
    queue.process('generate_batch_qrs', async (job) => {
      const { eventId, options } = job.data;
      
      console.log(`Generating batch QRs for event ${eventId}`);
      
      const result = await qrTicketService.generateBatchTicketsQRs(eventId, options);
      
      return result;
    });
    
    // Process QR regeneration
    queue.process('regenerate_qr', async (job) => {
      const { ticketId, reason } = job.data;
      
      console.log(`Regenerating QR for ticket ${ticketId}, reason: ${reason}`);
      
      const result = await qrTicketService.regenerateQR(ticketId);
      
      return result;
    });
    
    console.log('QR worker initialized');
  }
}

// Start worker
if (require.main === module) {
  new QRWorker();
  console.log('QR worker running...');
}

module.exports = QRWorker;