const analyticsService = require('../services/analyticsService');

class AnalyticsController {
  async getRevenueAnalytics(req, res, next) {
    try {
      const days = parseInt(req.query.days) || 30;
      
      const revenue = await analyticsService.getRevenueAnalytics(days);
      
      res.status(200).json({
        success: true,
        data: { revenue, days },
      });
    } catch (error) {
      next(error);
    }
  }

  async getTicketSalesAnalytics(req, res, next) {
    try {
      const { eventId } = req.params;
      const days = parseInt(req.query.days) || 30;
      
      const sales = await analyticsService.getTicketSalesAnalytics(eventId, days);
      
      res.status(200).json({
        success: true,
        data: { sales, days },
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserGrowthAnalytics(req, res, next) {
    try {
      const days = parseInt(req.query.days) || 30;
      
      const growth = await analyticsService.getUserGrowthAnalytics(days);
      
      res.status(200).json({
        success: true,
        data: { growth, days },
      });
    } catch (error) {
      next(error);
    }
  }

  async getEventPerformance(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 10;
      
      const performance = await analyticsService.getEventPerformanceAnalytics(limit);
      
      res.status(200).json({
        success: true,
        data: { performance, limit },
      });
    } catch (error) {
      next(error);
    }
  }

  async getOrganizerPerformance(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 10;
      
      const performance = await analyticsService.getOrganizerPerformanceAnalytics(limit);
      
      res.status(200).json({
        success: true,
        data: { performance, limit },
      });
    } catch (error) {
      next(error);
    }
  }

  async getPaymentMethodAnalytics(req, res, next) {
    try {
      const methods = await analyticsService.getPaymentMethodAnalytics();
      
      res.status(200).json({
        success: true,
        data: { methods },
      });
    } catch (error) {
      next(error);
    }
  }

  async getResaleAnalytics(req, res, next) {
    try {
      const analytics = await analyticsService.getResaleMarketplaceAnalytics();
      
      res.status(200).json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  }

  async getCheckinAnalytics(req, res, next) {
    try {
      const { eventId } = req.params;
      
      const checkins = await analyticsService.getCheckinAnalytics(eventId);
      
      res.status(200).json({
        success: true,
        data: { checkins },
      });
    } catch (error) {
      next(error);
    }
  }

  async getRealTimeStats(req, res, next) {
    try {
      const stats = await analyticsService.getRealTimeStats();
      
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AnalyticsController();