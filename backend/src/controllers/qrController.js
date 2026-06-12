const qrTicketService = require('../services/qrTicketService');
const TicketModel = require('../models/TicketModel');

class QRController {
  async generateTicketQR(req, res, next) {
    try {
      const { ticketId } = req.params;
      
      // Check ownership
      const ticket = await TicketModel.findById(ticketId);
      if (!ticket) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Ticket not found',
        });
      }
      
      if (ticket.user_id !== req.userId && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only generate QR for your own tickets',
        });
      }
      
      const result = await qrTicketService.generateTicketQRs(ticketId);
      
      res.status(200).json({
        success: true,
        message: 'QR code generated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  
  async getTicketQR(req, res, next) {
    try {
      const { ticketNumber } = req.params;
      const format = req.query.format || 'dataURL';
      
      const ticket = await TicketModel.getTicketByNumber(ticketNumber);
      if (!ticket) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Ticket not found',
        });
      }
      
      // Check ownership or organizer permission
      const isOwner = ticket.user_id === req.userId;
      const isOrganizer = req.user.role === 'organizer' || req.user.role === 'admin';
      
      if (!isOwner && !isOrganizer) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only view your own tickets',
        });
      }
      
      const qrData = await qrTicketService.getTicketQR(ticketNumber, format);
      
      if (format === 'buffer') {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `inline; filename=ticket-${ticketNumber}.png`);
        return res.send(Buffer.from(qrData, 'base64'));
      }
      
      if (format === 'download') {
        const pdfBuffer = await qrTicketService.generatePrintableTicket(ticketNumber);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=ticket-${ticketNumber}.pdf`);
        return res.send(pdfBuffer);
      }
      
      res.status(200).json({
        success: true,
        data: { qrCode: qrData, format },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async batchGenerateQRs(req, res, next) {
    try {
      const { eventId } = req.params;
      
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
          message: 'You can only generate QR for your own events',
        });
      }
      
      const result = await qrTicketService.generateBatchTicketsQRs(eventId);
      
      res.status(200).json({
        success: true,
        message: `Generated ${result.successful} of ${result.total} QR codes`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  
  async validateQR(req, res, next) {
    try {
      const { qrData } = req.body;
      
      const validation = await qrTicketService.validateTicketQR(qrData);
      
      res.status(200).json({
        success: validation.valid,
        message: validation.valid ? 'Valid ticket' : validation.reason,
        data: validation.valid ? { ticket: validation.ticket } : null,
      });
    } catch (error) {
      next(error);
    }
  }
  
  async regenerateQR(req, res, next) {
    try {
      const { ticketId } = req.params;
      
      const ticket = await TicketModel.findById(ticketId);
      if (!ticket) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Ticket not found',
        });
      }
      
      if (ticket.user_id !== req.userId && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only regenerate QR for your own tickets',
        });
      }
      
      const result = await qrTicketService.regenerateQR(ticketId);
      
      res.status(200).json({
        success: true,
        message: 'QR code regenerated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  
  async downloadTicketPDF(req, res, next) {
    try {
      const { ticketNumber } = req.params;
      
      const ticket = await TicketModel.getTicketByNumber(ticketNumber);
      if (!ticket) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Ticket not found',
        });
      }
      
      if (ticket.user_id !== req.userId && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only download your own tickets',
        });
      }
      
      const pdfBuffer = await qrTicketService.generatePrintableTicket(ticketNumber);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=ticket-${ticketNumber}.pdf`);
      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new QRController();