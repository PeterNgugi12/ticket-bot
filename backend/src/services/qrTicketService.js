const QRGenerator = require('../utils/qrGenerator');
const TicketModel = require('../models/TicketModel');
const EventModel = require('../models/EventModel');
const cloudinaryService = require('./cloudinaryService');
const cacheManager = require('../cache/cacheManager');
const { CACHE_KEYS, CACHE_TTL } = require('../cache/cacheKeys');

class QRTicketService {
  async generateTicketQRs(ticketId, options = {}) {
    // Get ticket details
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) {
      throw new Error('Ticket not found');
    }
    
    const event = await EventModel.findById(ticket.event_id);
    const tier = await TicketTierModel.findById(ticket.tier_id);
    
    // Generate QR code
    const qrResult = await QRGenerator.generateTicketQR({
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      eventId: event.id,
      eventTitle: event.title,
      userId: ticket.user_id,
      attendeeName: ticket.attendee_name,
      tierName: tier.name,
      eventDate: event.event_date,
      venueName: event.venue_name,
    }, options);
    
    // Upload QR to Cloudinary for persistent storage
    let cloudinaryUrl = null;
    let cloudinaryPublicId = null;
    
    if (!options.skipCloudinaryUpload) {
      const uploadResult = await cloudinaryService.uploadImage(qrResult.qrBuffer, {
        folder: `tix-culture/tickets/${event.id}`,
        public_id: `qr_${ticket.ticket_number}`,
        transformation: [
          { width: 500, height: 500, crop: 'limit' },
          { quality: 'auto' },
        ],
      });
      cloudinaryUrl = uploadResult.secure_url;
      cloudinaryPublicId = uploadResult.public_id;
    }
    
    // Update ticket with QR data
    await TicketModel.db.query(
      `UPDATE tickets 
       SET qr_code_image_url = $1, 
           qr_code_hash = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [cloudinaryUrl || qrResult.qrDataURL, ticket.qr_code_hash, ticket.id]
    );
    
    // Cache QR data for quick access
    await cacheManager.set(
      CACHE_KEYS.TICKET_QR(ticket.ticket_number),
      {
        qrData: qrResult.qrData,
        qrDataURL: qrResult.qrDataURL,
        cloudinaryUrl,
        expiry: event.event_date,
      },
      CACHE_TTL.WEEK
    );
    
    return {
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
      },
      qr: {
        dataURL: qrResult.qrDataURL,
        svg: qrResult.qrSVG,
        cloudinaryUrl,
        buffer: qrResult.qrBuffer.toString('base64'),
      },
    };
  }

  async generateBatchTicketsQRs(eventId, options = {}) {
    const tickets = await TicketModel.getEventTickets(eventId);
    
    if (tickets.length === 0) {
      throw new Error('No tickets found for this event');
    }
    
    const results = [];
    
    for (const ticket of tickets) {
      try {
        const result = await this.generateTicketQRs(ticket.id, options);
        results.push(result);
      } catch (error) {
        console.error(`Failed to generate QR for ticket ${ticket.id}:`, error);
        results.push({ ticketId: ticket.id, error: error.message });
      }
    }
    
    return {
      total: tickets.length,
      successful: results.filter(r => !r.error).length,
      failed: results.filter(r => r.error).length,
      results,
    };
  }

  async getTicketQR(ticketNumber, format = 'dataURL') {
    // Try cache first
    const cacheKey = CACHE_KEYS.TICKET_QR(ticketNumber);
    let qrData = await cacheManager.get(cacheKey);
    
    if (qrData) {
      if (format === 'dataURL') return qrData.qrDataURL;
      if (format === 'svg') return qrData.svg;
      if (format === 'cloudinary') return qrData.cloudinaryUrl;
      return qrData;
    }
    
    // Generate fresh QR
    const ticket = await TicketModel.getTicketByNumber(ticketNumber);
    if (!ticket) {
      throw new Error('Ticket not found');
    }
    
    const result = await this.generateTicketQRs(ticket.id);
    
    if (format === 'dataURL') return result.qr.dataURL;
    if (format === 'svg') return result.qr.svg;
    if (format === 'cloudinary') return result.qr.cloudinaryUrl;
    
    return result;
  }

  async generatePrintableTicket(ticketNumber) {
    const ticket = await TicketModel.getTicketByNumber(ticketNumber);
    if (!ticket) {
      throw new Error('Ticket not found');
    }
    
    // Get QR code
    const qrResult = await this.getTicketQR(ticketNumber, 'full');
    const qrBuffer = Buffer.from(qrResult.qr.buffer, 'base64');
    
    // Generate printable PDF
    const pdfBuffer = await QRGenerator.generatePrintableTicket({
      ticketNumber: ticket.ticket_number,
      eventTitle: ticket.event_title,
      attendeeName: ticket.attendee_name,
      tierName: ticket.tier_name,
      eventDate: ticket.event_date,
      venueName: ticket.venue_name,
    }, qrBuffer);
    
    return pdfBuffer;
  }

  async generateWalletPass(ticketNumber) {
    const ticket = await TicketModel.getTicketByNumber(ticketNumber);
    if (!ticket) {
      throw new Error('Ticket not found');
    }
    
    const qrResult = await this.getTicketQR(ticketNumber, 'full');
    const qrBuffer = Buffer.from(qrResult.qr.buffer, 'base64');
    
    const walletPass = await QRGenerator.generateWalletPass({
      ticketNumber: ticket.ticket_number,
      eventTitle: ticket.event_title,
      attendeeName: ticket.attendee_name,
      tierName: ticket.tier_name,
      eventDate: ticket.event_date,
      venueName: ticket.venue_name,
    }, qrBuffer);
    
    return walletPass;
  }

  async validateTicketQR(qrDataString) {
    const verification = QRGenerator.verifyQRData(qrDataString);
    
    if (!verification.valid) {
      return { valid: false, reason: verification.reason };
    }
    
    const { data } = verification;
    
    // Verify ticket exists in database
    const ticket = await TicketModel.getTicketByNumber(data.tn);
    
    if (!ticket) {
      return { valid: false, reason: 'Ticket not found in system' };
    }
    
    if (ticket.status !== 'valid') {
      return { valid: false, reason: `Ticket is ${ticket.status}` };
    }
    
    // Verify event match
    if (ticket.event_id !== data.eid) {
      return { valid: false, reason: 'Ticket is for a different event' };
    }
    
    return {
      valid: true,
      ticket,
      qrData: data,
    };
  }

  async regenerateQR(ticketId) {
    // Invalidate old cache
    const ticket = await TicketModel.findById(ticketId);
    if (ticket) {
      await cacheManager.del(CACHE_KEYS.TICKET_QR(ticket.ticket_number));
    }
    
    // Generate new QR
    return await this.generateTicketQRs(ticketId, { skipCloudinaryUpload: false });
  }

  async getTicketStatsWithQR(eventId) {
    const stats = await TicketModel.getTicketStats(eventId);
    const tickets = await TicketModel.getEventTickets(eventId, 'valid');
    
    const qrGenerated = tickets.filter(t => t.qr_code_image_url).length;
    
    return {
      ...stats,
      qrGenerated,
      qrPending: tickets.length - qrGenerated,
    };
  }
}

module.exports = new QRTicketService();