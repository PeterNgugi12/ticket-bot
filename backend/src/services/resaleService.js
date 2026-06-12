const Decimal = require('decimal.js');
const ResaleListingModel = require('../models/ResaleListingModel');
const EscrowModel = require('../models/EscrowModel');
const TicketModel = require('../models/TicketModel');
const EventModel = require('../models/EventModel');
const walletService = require('./walletService');
const { queueManager, QUEUES } = require('../queue/queueManager');

class ResaleService {
  constructor() {
    this.platformFeePercentage = parseFloat(process.env.RESALE_PLATFORM_FEE_PERCENTAGE) || 0.05;
    this.listingDurationDays = parseInt(process.env.RESALE_LISTING_DURATION_DAYS) || 7;
    this.minPriceMultiplier = parseFloat(process.env.RESALE_MIN_PRICE_MULTIPLIER) || 0.5;
    this.maxPriceMultiplier = parseFloat(process.env.RESALE_MAX_PRICE_MULTIPLIER) || 3.0;
    this.escrowReleaseDelayHours = parseInt(process.env.ESCROW_RELEASE_DELAY_HOURS) || 24;
  }

  async createListing(ticketId, sellerId, askingPrice) {
    // Check if resale is allowed
    const resaleCheck = await ResaleListingModel.checkResaleAllowed(ticketId);
    if (!resaleCheck.allowed) {
      throw new Error(resaleCheck.reason);
    }

    // Check if ticket already has active listing
    const existingListing = await ResaleListingModel.getListingByTicket(ticketId);
    if (existingListing) {
      throw new Error('Ticket already has an active listing');
    }

    // Get ticket details for price validation
    const ticket = await TicketModel.findById(ticketId);
    const tier = await TicketTierModel.findById(ticket.tier_id);
    
    // Validate asking price
    const minPrice = tier.price * this.minPriceMultiplier;
    const maxPrice = tier.price * this.maxPriceMultiplier;
    
    if (askingPrice < minPrice) {
      throw new Error(`Minimum asking price is KES ${minPrice} (${this.minPriceMultiplier * 100}% of original)`);
    }
    
    if (askingPrice > maxPrice) {
      throw new Error(`Maximum asking price is KES ${maxPrice} (${this.maxPriceMultiplier * 100}% of original)`);
    }

    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.listingDurationDays);

    // Create listing
    const listing = await ResaleListingModel.createListing({
      ticketId,
      sellerId,
      askingPrice,
      expiresAt,
    });

    // Queue notification
    await queueManager.addJob(QUEUES.NOTIFICATION, 'listing_created', {
      listingId: listing.id,
      sellerId,
      ticketId,
    });

    return listing;
  }

  async purchaseListing(listingId, buyerId) {
    const client = await ResaleListingModel.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get listing details
      const listing = await ResaleListingModel.findById(listingId);
      
      if (!listing || listing.status !== 'active') {
        throw new Error('Listing is not available');
      }
      
      if (new Date(listing.expires_at) < new Date()) {
        throw new Error('Listing has expired');
      }
      
      // Get ticket and verify resale still allowed
      const resaleCheck = await ResaleListingModel.checkResaleAllowed(listing.ticket_id);
      if (!resaleCheck.allowed) {
        throw new Error(`Cannot purchase: ${resaleCheck.reason}`);
      }
      
      // Get ticket details
      const ticket = await TicketModel.findById(listing.ticket_id);
      const event = await EventModel.findById(ticket.event_id);
      
      // Calculate fees
      const platformFee = new Decimal(listing.asking_price).times(this.platformFeePercentage);
      const sellerAmount = new Decimal(listing.asking_price).minus(platformFee);
      
      // Check buyer balance
      const buyerBalance = await walletService.getBalance(buyerId);
      if (buyerBalance.lessThan(listing.asking_price)) {
        throw new Error('Insufficient wallet balance');
      }
      
      // Calculate escrow release date (after event)
      const releaseDate = new Date(event.event_date);
      releaseDate.setHours(releaseDate.getHours() + this.escrowReleaseDelayHours);
      
      // Create escrow
      const escrow = await EscrowModel.createEscrow({
        listingId,
        buyerId,
        sellerId: listing.seller_id,
        amount: listing.asking_price,
        platformFee: platformFee.toNumber(),
        sellerAmount: sellerAmount.toNumber(),
        releaseDate,
        metadata: {
          eventId: event.id,
          eventDate: event.event_date,
          ticketNumber: ticket.ticket_number,
        },
      });
      
      // Debit buyer
      await walletService.debit(
        buyerId,
        listing.asking_price,
        'resale_purchase',
        escrow.id,
        `Purchase of ticket ${ticket.ticket_number} for ${event.title}`,
        { listingId, ticketId: ticket.id }
      );
      
      // Update listing status
      await ResaleListingModel.updateListingStatus(listingId, 'sold', {
        buyerId,
        platformFee: platformFee.toNumber(),
        sellerAmount: sellerAmount.toNumber(),
      });
      
      // Update ticket ownership
      await TicketModel.transferTicket(ticket.id, buyerId, listing.seller_id);
      
      await client.query('COMMIT');
      
      // Queue notifications
      await queueManager.addJob(QUEUES.NOTIFICATION, 'ticket_purchased_resale', {
        listingId,
        buyerId,
        sellerId: listing.seller_id,
        ticketId: ticket.id,
        amount: listing.asking_price,
      });
      
      // Queue escrow release job
      await queueManager.addJob(QUEUES.NOTIFICATION, 'release_escrow', {
        escrowId: escrow.id,
        listingId,
        sellerId: listing.seller_id,
        amount: sellerAmount.toNumber(),
      }, { delay: this.escrowReleaseDelayHours * 3600000 });
      
      return {
        listing,
        escrow,
        ticket,
        platformFee: platformFee.toNumber(),
        sellerAmount: sellerAmount.toNumber(),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async releaseEscrow(escrowId) {
    const escrow = await EscrowModel.findById(escrowId);
    
    if (!escrow) {
      throw new Error('Escrow not found');
    }
    
    if (escrow.status !== 'pending') {
      throw new Error(`Escrow is already ${escrow.status}`);
    }
    
    if (new Date(escrow.release_date) > new Date()) {
      throw new Error('Escrow cannot be released yet');
    }
    
    // Credit seller
    await walletService.credit(
      escrow.seller_id,
      escrow.seller_amount,
      'resale_earning',
      escrow.id,
      `Earnings from ticket resale`,
      { escrowId, listingId: escrow.listing_id }
    );
    
    // Credit platform fee to admin wallet
    await walletService.credit(
      'admin_system',
      escrow.platform_fee,
      'platform_fee',
      escrow.id,
      `Platform fee from resale`,
      { escrowId }
    );
    
    // Update escrow status
    await EscrowModel.updateEscrowStatus(escrowId, 'released');
    
    return escrow;
  }

  async cancelListing(listingId, sellerId) {
    const listing = await ResaleListingModel.findById(listingId);
    
    if (!listing) {
      throw new Error('Listing not found');
    }
    
    if (listing.seller_id !== sellerId) {
      throw new Error('You can only cancel your own listings');
    }
    
    if (listing.status !== 'active') {
      throw new Error(`Cannot cancel listing with status: ${listing.status}`);
    }
    
    const updated = await ResaleListingModel.updateListingStatus(listingId, 'cancelled');
    
    return updated;
  }

  async updateListingPrice(listingId, sellerId, newPrice) {
    const listing = await ResaleListingModel.findById(listingId);
    
    if (!listing) {
      throw new Error('Listing not found');
    }
    
    if (listing.seller_id !== sellerId) {
      throw new Error('You can only update your own listings');
    }
    
    if (listing.status !== 'active') {
      throw new Error(`Cannot update listing with status: ${listing.status}`);
    }
    
    // Get ticket for price validation
    const ticket = await TicketModel.findById(listing.ticket_id);
    const tier = await TicketTierModel.findById(ticket.tier_id);
    
    const minPrice = tier.price * this.minPriceMultiplier;
    const maxPrice = tier.price * this.maxPriceMultiplier;
    
    if (newPrice < minPrice) {
      throw new Error(`Minimum price is KES ${minPrice}`);
    }
    
    if (newPrice > maxPrice) {
      throw new Error(`Maximum price is KES ${maxPrice}`);
    }
    
    const updated = await ResaleListingModel.update(listingId, { asking_price: newPrice });
    
    return updated;
  }

  async getActiveListings(eventId = null, limit = 50, offset = 0) {
    return await ResaleListingModel.getActiveListings(eventId, limit, offset);
  }

  async getSellerListings(sellerId, status = null) {
    return await ResaleListingModel.getSellerListings(sellerId, status);
  }

  async getMarketplaceStats(eventId = null) {
    return await ResaleListingModel.getMarketplaceStats(eventId);
  }

  async expireExpiredListings() {
    const expired = await ResaleListingModel.expireListings();
    
    for (const listing of expired) {
      await queueManager.addJob(QUEUES.NOTIFICATION, 'listing_expired', {
        listingId: listing.id,
        sellerId: listing.seller_id,
        ticketId: listing.ticket_id,
      });
    }
    
    return expired;
  }
}

module.exports = new ResaleService();