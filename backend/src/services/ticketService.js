const TicketModel = require('../models/TicketModel');
const EventModel = require('../models/EventModel');
const TicketTierModel = require('../models/TicketTierModel');
const PaymentModel = require('../models/PaymentModel');
const qrGenerator = require('../utils/qrGenerator');
const cryptoUtil = require('../utils/crypto');
const cacheManager = require('../cache/cacheManager');
const { CACHE_KEYS } = require('../cache/cacheKeys');
const { queueManager, QUEUES } = require('../queue/queueManager');

class TicketService {
  async purchaseTickets(purchaseData) {
    const {
      userId,
      eventId,
      tierId,
      quantity,
      attendeeName,
      attendeeEmail,
      attendeePhone,
      paymentMethod = 'mpesa',
    } = purchaseData;

    const client = await TicketModel.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Check event availability
      const event = await EventModel.getEventWithDetails(eventId);
      if (!event || event.status !== 'published') {
        throw new Error('Event not available');
      }
      
      if (event.is_sold_out) {
        throw new Error('Event is sold out');
      }
      
      // Check tier availability
      const tier = await TicketTierModel.checkAvailability(tierId, quantity);
      if (!tier.available) {
        throw new Error(tier.reason || 'Tickets not available');
      }
      
      // Calculate total price
      const tierDetails = await TicketTierModel.findById(tierId);
      const totalAmount = tierDetails.price * quantity;
      
      // Create payment record
      const payment = await PaymentModel.createPayment({
        userId,
        eventId,
        amount: totalAmount,
        paymentMethod,
        metadata: {
          tierId,
          quantity,
          attendeeName,
          attendeeEmail,
          attendeePhone,
        },
      });
      
      // Create tickets
      const tickets = [];
      for (let i = 0; i < quantity; i++) {
        const ticket = await TicketModel.createTicket({
          eventId,
          tierId,
          userId,
          attendeeName: i === 0 ? attendeeName : `${attendeeName} (Guest ${i + 1})`,
          attendeeEmail,
          attendeePhone,
          quantity: 1,
          purchasePrice: tierDetails.price,
        });
        
        // Generate QR code for ticket
        const qrData = await qrGenerator.generateTicketQR({
          ticketId: ticket.id,
          ticketNumber: ticket.ticket_number,
          eventId,
          eventTitle: event.title,
          userId,
          attendeeName: ticket.attendee_name,
          tierName: tierDetails.name,
        });
        
        // Update ticket with QR data
        await client.query(
          `UPDATE tickets 
           SET qr_code_image_url = $1, qr_code_hash = $2
           WHERE id = $3`,
          [qrData.cloudinaryUrl, ticket.qr_code_hash, ticket.id]
        );
        
        tickets.push({
          ...ticket,
          qrCode: qrData.qrDataURL,
          qrCodeUrl: qrData.cloudinaryUrl,
        });
      }
      
      // Update tier sold count
      await TicketTierModel.updateSoldCount(tierId);
      
      // Update event ticket counts
      await EventModel.updateTicketCounts(eventId);
      
      await client.query('COMMIT');
      
      // Queue email sending
      await queueManager.addJob(QUEUES.EMAIL, 'send_tickets', {
        userId,
        eventId,
        tickets,
        attendeeEmail,
        attendeeName,
        eventTitle: event.title,
        eventDate: event.event_date,
        venueName: event.venue_name,
        googleMapsLink: event.google_maps_link,
        totalAmount,
      });
      
      // Queue QR generation for backup
      await queueManager.addJob(QUEUES.QR_GENERATION, 'generate_ticket_qrs', {
        tickets: tickets.map(t => ({ id: t.id, number: t.ticket_number })),
      });
      
      // Invalidate cache
      await cacheManager.del(CACHE_KEYS.EVENT(eventId));
      await cacheManager.del(CACHE_KEYS.USER_TICKETS(userId));
      
      return {
        payment,
        tickets,
        totalAmount,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async verifyTicket(ticketNumber, eventId = null, scannerId = null) {
    const ticket = await TicketModel.getTicketByNumber(ticketNumber);
    
    if (!ticket) {
      return {
        valid: false,
        reason: 'Ticket not found',
      };
    }
    
    const validation = await TicketModel.checkTicketValidity(ticket.id, eventId);
    
    if (!validation.valid) {
      return {
        valid: false,
        reason: validation.reason,
      };
    }
    
    // Log scan attempt
    await this.logScanAttempt(ticket.id, scannerId, eventId, validation.valid);
    
    return {
      valid: true,
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        attendeeName: ticket.attendee_name,
        tierName: ticket.tier_name,
        eventTitle: ticket.event_title,
        eventDate: ticket.event_date,
        venueName: ticket.venue_name,
        quantity: ticket.quantity,
      },
    };
  }

  async markTicketAsUsed(ticketId, scannerId) {
    const ticket = await TicketModel.markTicketAsUsed(ticketId, scannerId);
    
    // Log successful scan
    await this.logScanAttempt(ticketId, scannerId, ticket.event_id, true);
    
    // Queue notification
    await queueManager.addJob(QUEUES.NOTIFICATION, 'ticket_used', {
      userId: ticket.user_id,
      ticketId,
      eventId: ticket.event_id,
      scannedAt: new Date(),
    });
    
    return ticket;
  }

  async logScanAttempt(ticketId, scannerId, eventId, isValid) {
    const db = TicketModel.db;
    await db.query(
      `INSERT INTO ticket_scans (ticket_id, scanner_id, event_id, scan_status)
       VALUES ($1, $2, $3, $4)`,
      [ticketId, scannerId, eventId, isValid ? 'valid' : 'invalid']
    );
  }

  async getUserTickets(userId, includePast = false) {
    let tickets = await TicketModel.getUserTickets(userId);
    
    if (!includePast) {
      tickets = tickets.filter(t => new Date(t.event_date) > new Date());
    }
    
    // Add QR codes for valid tickets
    for (const ticket of tickets) {
      if (ticket.status === 'valid') {
        const qrData = await qrGenerator.generateTicketQR({
          ticketId: ticket.id,
          ticketNumber: ticket.ticket_number,
          eventId: ticket.event_id,
          eventTitle: ticket.event_title,
          userId,
          attendeeName: ticket.attendee_name,
          tierName: ticket.tier_name,
        });
        ticket.qrCode = qrData.qrDataURL;
      }
    }
    
    return tickets;
  }

  async transferTicket(ticketId, newOwnerId, transferorId) {
    const ticket = await TicketModel.transferTicket(ticketId, newOwnerId, transferorId);
    
    // Queue notification to both parties
    await queueManager.addJob(QUEUES.NOTIFICATION, 'ticket_transferred', {
      ticketId,
      newOwnerId,
      transferorId,
      ticketNumber: ticket.ticket_number,
    });
    
    // Invalidate cache
    await cacheManager.del(CACHE_KEYS.USER_TICKETS(transferorId));
    await cacheManager.del(CACHE_KEYS.USER_TICKETS(newOwnerId));
    
    return ticket;
  }

  async getEventTicketStats(eventId) {
    const stats = await TicketModel.getTicketStats(eventId);
    const payments = await PaymentModel.getPaymentStats(eventId);
    
    return {
      ...stats,
      totalRevenue: payments.total_revenue || 0,
      averageTicketPrice: payments.average_ticket_price || 0,
    };
  }

  async generateBulkTickets(eventId, tierId, attendees) {
    const event = await EventModel.findById(eventId);
    if (!event) {
      throw new Error('Event not found');
    }
    
    const tier = await TicketTierModel.findById(tierId);
    if (!tier) {
      throw new Error('Ticket tier not found');
    }
    
    const tickets = [];
    
    for (const attendee of attendees) {
      const ticket = await TicketModel.createTicket({
        eventId,
        tierId,
        userId: attendee.userId || null,
        attendeeName: attendee.name,
        attendeeEmail: attendee.email,
        attendeePhone: attendee.phone,
        quantity: 1,
        purchasePrice: tier.price,
      });
      
      const qrData = await qrGenerator.generateTicketQR({
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        eventId,
        eventTitle: event.title,
        userId: attendee.userId,
        attendeeName: attendee.name,
        tierName: tier.name,
      });
      
      await TicketModel.db.query(
        `UPDATE tickets SET qr_code_image_url = $1 WHERE id = $2`,
        [qrData.cloudinaryUrl, ticket.id]
      );
      
      tickets.push({
        ...ticket,
        qrCodeUrl: qrData.cloudinaryUrl,
      });
    }
    
    // Update counts
    await TicketTierModel.updateSoldCount(tierId);
    await EventModel.updateTicketCounts(eventId);
    
    return tickets;
  }
}

module.exports = new TicketService();