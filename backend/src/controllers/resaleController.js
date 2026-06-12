const resaleService = require('../services/resaleService');

class ResaleController {
  async createListing(req, res, next) {
    try {
      const { ticketId, askingPrice } = req.body;
      
      const listing = await resaleService.createListing(
        ticketId,
        req.userId,
        askingPrice
      );
      
      res.status(201).json({
        success: true,
        message: 'Listing created successfully',
        data: { listing },
      });
    } catch (error) {
      next(error);
    }
  }

  async purchaseListing(req, res, next) {
    try {
      const { listingId } = req.params;
      
      const result = await resaleService.purchaseListing(listingId, req.userId);
      
      res.status(200).json({
        success: true,
        message: 'Ticket purchased successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelListing(req, res, next) {
    try {
      const { listingId } = req.params;
      
      const listing = await resaleService.cancelListing(listingId, req.userId);
      
      res.status(200).json({
        success: true,
        message: 'Listing cancelled successfully',
        data: { listing },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateListingPrice(req, res, next) {
    try {
      const { listingId } = req.params;
      const { price } = req.body;
      
      const listing = await resaleService.updateListingPrice(listingId, req.userId, price);
      
      res.status(200).json({
        success: true,
        message: 'Price updated successfully',
        data: { listing },
      });
    } catch (error) {
      next(error);
    }
  }

  async getActiveListings(req, res, next) {
    try {
      const eventId = req.query.eventId;
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      
      const listings = await resaleService.getActiveListings(eventId, limit, offset);
      const stats = await resaleService.getMarketplaceStats(eventId);
      
      res.status(200).json({
        success: true,
        data: { listings, count: listings.length, stats },
        pagination: { limit, offset },
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyListings(req, res, next) {
    try {
      const status = req.query.status;
      
      const listings = await resaleService.getSellerListings(req.userId, status);
      
      res.status(200).json({
        success: true,
        data: { listings, count: listings.length },
      });
    } catch (error) {
      next(error);
    }
  }

  async getListingDetails(req, res, next) {
    try {
      const { listingId } = req.params;
      
      const listing = await ResaleListingModel.findById(listingId);
      
      if (!listing) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Listing not found',
        });
      }
      
      // Get full details
      const fullListing = await ResaleListingModel.getListingByTicket(listing.ticket_id);
      
      res.status(200).json({
        success: true,
        data: { listing: fullListing || listing },
      });
    } catch (error) {
      next(error);
    }
  }

  async checkResaleAllowed(req, res, next) {
    try {
      const { ticketId } = req.params;
      
      const result = await ResaleListingModel.checkResaleAllowed(ticketId);
      
      res.status(200).json({
        success: result.allowed,
        message: result.allowed ? 'Resale allowed' : result.reason,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ResaleController();