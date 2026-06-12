const scanService = require('../services/scanService');
const EventModel = require('../models/EventModel');

class ScanController {
  async scanTicket(req, res, next) {
    try {
      const { image, eventId, gateNumber } = req.body;
      
      if (!image) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Image is required',
        });
      }
      
      const result = await scanService.processScanFromBase64(
        image,
        req.userId,
        eventId,
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          gateNumber,
          verifiedBy: req.user.full_name,
        }
      );
      
      res.status(200).json({
        success: result.success,
        message: result.success ? 'Ticket validated successfully' : result.error,
        data: {
          ticket: result.ticketData,
          scanTime: result.scanTime,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getEventScans(req, res, next) {
    try {
      const { eventId } = req.params;
      const date = req.query.date;
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      
      // Verify organizer permission
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
          message: 'You can only view scans for your own events',
        });
      }
      
      const scans = await scanService.getEventScans(eventId, date, limit, offset);
      const stats = await scanService.getScanStats(eventId, date);
      
      res.status(200).json({
        success: true,
        data: { scans, stats, count: scans.length },
        pagination: { limit, offset },
      });
    } catch (error) {
      next(error);
    }
  }

  async getEventCheckins(req, res, next) {
    try {
      const { eventId } = req.params;
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      
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
          message: 'You can only view check-ins for your own events',
        });
      }
      
      const checkins = await scanService.getEventCheckins(eventId, limit, offset);
      const stats = await scanService.getScanStats(eventId);
      
      res.status(200).json({
        success: true,
        data: { checkins, stats, count: checkins.length },
        pagination: { limit, offset },
      });
    } catch (error) {
      next(error);
    }
  }

  async getScanStats(req, res, next) {
    try {
      const { eventId } = req.params;
      
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
          message: 'You can only view stats for your own events',
        });
      }
      
      const stats = await scanService.getScanStats(eventId);
      
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRecentScans(req, res, next) {
    try {
      // Only admins and organizers can view recent scans
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only admins can view all recent scans',
        });
      }
      
      const limit = parseInt(req.query.limit) || 50;
      const scans = await scanService.getRecentScans(limit);
      
      res.status(200).json({
        success: true,
        data: { scans, count: scans.length },
      });
    } catch (error) {
      next(error);
    }
  }

  async verifyMultiple(req, res, next) {
    try {
      const { eventId, ticketNumbers } = req.body;
      
      if (!ticketNumbers || !Array.isArray(ticketNumbers)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'ticketNumbers array is required',
        });
      }
      
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
          message: 'You can only verify tickets for your own events',
        });
      }
      
      const results = await scanService.verifyMultipleTickets(ticketNumbers, eventId, req.userId);
      
      res.status(200).json({
        success: true,
        data: { results },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ScanController();