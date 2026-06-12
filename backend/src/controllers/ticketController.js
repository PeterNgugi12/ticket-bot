const ticketService = require('../services/ticketService');
const TicketModel = require('../models/TicketModel');
const EventModel = require('../models/EventModel');
const qrGenerator = require('../utils/qrGenerator');

class TicketController {
  async purchaseTickets(req, res, next) {
    try {
      const {
        eventId,
        tierId,
        quantity,
        attendeeName,
        attendeeEmail,
        attendeePhone,
        paymentMethod,
      } = req.body;
      
      const result = await ticketService.purchaseTickets({
        userId: req.userId,
        eventId,
        tierId,
        quantity: parseInt(quantity),
        attendeeName,
        attendeeEmail,
        attendeePhone,
        paymentMethod,
      });
      
      res.status(201).json({
        success: true,
        message: 'Tickets purchased successfully',
        data: {
          paymentId: result.payment.id,
          tickets: result.tickets.map(t => ({
            id: t.id,
            ticketNumber: t.ticket_number,
            qrCode: t.qrCode,
          })),
          totalAmount: result.totalAmount,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async getMyTickets(req, res, next) {
    try {
      const includePast = req.query.includePast === 'true';
      const tickets = await ticketService.getUserTickets(req.userId, includePast);
      
      res.status(200).json({
        success: true,
        data: { tickets, count: tickets.length },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async getTicketDetails(req, res, next) {
    try {
      const { ticketId } = req.params;
      const ticket = await TicketModel.findById(ticketId);
      
      if (!ticket) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Ticket not found',
        });
      }
      
      // Check ownership
      if (ticket.user_id !== req.userId && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only view your own tickets',
        });
      }
      
      // Get full details
      const fullTicket = await TicketModel.getTicketByNumber(ticket.ticket_number);
      
      res.status(200).json({
        success: true,
        data: { ticket: fullTicket },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async verifyTicket(req, res, next) {
    try {
      const { ticketNumber, eventId } = req.body;
      const scannerId = req.userId;
      
      const result = await ticketService.verifyTicket(ticketNumber, eventId, scannerId);
      
      res.status(200).json({
        success: result.valid,
        message: result.valid ? 'Ticket is valid' : result.reason,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  
  async markTicketUsed(req, res, next) {
    try {
      const { ticketId } = req.params;
      const scannerId = req.userId;
      
      const ticket = await ticketService.markTicketAsUsed(ticketId, scannerId);
      
      res.status(200).json({
        success: true,
        message: 'Ticket marked as used',
        data: { ticket },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async transferTicket(req, res, next) {
    try {
      const { ticketId } = req.params;
      const { newOwnerId } = req.body;
      
      const ticket = await ticketService.transferTicket(ticketId, newOwnerId, req.userId);
      
      res.status(200).json({
        success: true,
        message: 'Ticket transferred successfully',
        data: { ticket },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async getEventTickets(req, res, next) {
    try {
      const { eventId } = req.params;
      const status = req.query.status;
      
      // Check if user is organizer of this event
      const event = await EventModel.findById(eventId);
      if (!event) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Event not found',
        });
      }
      
      if (event.organizer_id !== req.userId && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only view tickets for your own events',
        });
      }
      
      const tickets = await TicketModel.getEventTickets(eventId, status);
      
      res.status(200).json({
        success: true,
        data: { tickets, count: tickets.length },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async getTicketStats(req, res, next) {
    try {
      const { eventId } = req.params;
      
      const stats = await ticketService.getEventTicketStats(eventId);
      
      res.status(200).json({
        success: true,
        data: { stats },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async downloadQRCode(req, res, next) {
    try {
      const { ticketId } = req.params;
      const ticket = await TicketModel.findById(ticketId);
      
      if (!ticket) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Ticket not found',
        });
      }
      
      if (ticket.user_id !== req.userId && req.user.role !== 'organizer') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only download your own tickets',
        });
      }
      
      const fullTicket = await TicketModel.getTicketByNumber(ticket.ticket_number);
      
      const qrBuffer = await qrGenerator.generateTicketQR({
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        eventId: ticket.event_id,
        eventTitle: fullTicket.event_title,
        userId: ticket.user_id,
        attendeeName: ticket.attendee_name,
        tierName: fullTicket.tier_name,
      });
      
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename=ticket-${ticket.ticket_number}.png`);
      res.send(qrBuffer.qrBuffer);
    } catch (error) {
      next(error);
    }
  }
  
  async scanQRCode(req, res, next) {
    try {
      const { qrData } = req.body;
      
      const verification = qrGenerator.verifyQRData(qrData);
      
      if (!verification.valid) {
        return res.status(400).json({
          success: false,
          message: verification.reason,
        });
      }
      
      const { data } = verification;
      
      if (data.type === 'checkin') {
        const ticket = await TicketModel.findById(data.ticketId);
        if (!ticket) {
          return res.status(404).json({
            success: false,
            message: 'Ticket not found',
          });
        }
        
        const validation = await TicketModel.checkTicketValidity(data.ticketId, data.eventId);
        
        res.status(200).json({
          success: validation.valid,
          message: validation.valid ? 'Valid ticket' : validation.reason,
          data: validation.valid ? { ticket } : null,
        });
      } else {
        res.status(200).json({
          success: true,
          data,
        });
      }
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TicketController();