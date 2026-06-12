const EventModel = require('../models/EventModel');
const TicketTierModel = require('../models/TicketTierModel');
const cloudinaryService = require('../services/cloudinaryService');
const locationService = require('../services/locationService');
const { queueManager, QUEUES } = require('../queue/queueManager');
const cacheManager = require('../cache/cacheManager');
const { CACHE_KEYS, CACHE_TTL } = require('../cache/cacheKeys');

class EventController {
 async createEvent(req, res, next) {
  try {
    const organizerId = req.userId;
    let eventData = req.body;
    
    // Log received data for debugging
    console.log('Create Event - Received body:', JSON.stringify(eventData, null, 2));
    console.log('Create Event - File:', req.file ? req.file.originalname : 'No file');
    
    // Parse ticketTiers if it's still a string
    if (eventData.ticketTiers && typeof eventData.ticketTiers === 'string') {
      try {
        eventData.ticketTiers = JSON.parse(eventData.ticketTiers);
      } catch (e) {
        console.error('Failed to parse ticketTiers:', eventData.ticketTiers);
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid ticket tiers format',
        });
      }
    }
    
    // Handle image upload
    let imageUrl = null;
    let cloudinaryPublicId = null;
    
    if (req.file) {
      const uploadResult = await cloudinaryService.uploadEventImage(
        req.file.buffer,
        'temp',
        eventData.title
      );
      imageUrl = uploadResult.secure_url;
      cloudinaryPublicId = uploadResult.public_id;
    }
    
    // Create event
    const event = await EventModel.createEvent({
      organizerId,
      title: eventData.title,
      description: eventData.description || '',
      eventDate: eventData.eventDate,
      venueName: eventData.venueName,
      latitude: eventData.latitude || null,
      longitude: eventData.longitude || null,
      imageUrl,
      cloudinaryPublicId,
      isSecret: eventData.isSecret || false,
      totalTickets: eventData.totalTickets || 0,
      maxTicketsPerUser: eventData.maxTicketsPerUser || 10,
      minAgeRestriction: eventData.minAgeRestriction || null,
      category: eventData.category || 'general',
    });
    
    // Create ticket tiers
    if (eventData.ticketTiers && eventData.ticketTiers.length > 0) {
      for (const tier of eventData.ticketTiers) {
        await TicketTierModel.createTier({
          eventId: event.id,
          name: tier.name,
          price: tier.price,
          quantity: tier.quantity,
          benefits: tier.benefits || [],
          maxPerPerson: tier.maxPerPerson || 5,
        });
      }
    }
    
    // Invalidate cache
    await cacheManager.delPattern(CACHE_KEYS.PATTERNS.EVENT_ALL);
    
    console.log('Event created successfully:', event.id);
    
    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data: { event },
    });
  } catch (error) {
    console.error('Create event error:', error);
    next(error);
  }
}
  
  async getEvent(req, res, next) {
    try {
      const { eventId } = req.params;
      
      // Try to get from cache
      const cacheKey = CACHE_KEYS.EVENT(eventId);
      let event = await cacheManager.get(cacheKey);
      
      if (!event) {
        event = await EventModel.getEventWithDetails(eventId);
        if (!event) {
          return res.status(404).json({
            error: 'Not Found',
            message: 'Event not found',
          });
        }
        
        // Cache for 1 hour
        await cacheManager.set(cacheKey, event, CACHE_TTL.STANDARD);
      }
      
      // Add Google Maps link if not present
      if (event.latitude && event.longitude && !event.google_maps_link) {
        event.google_maps_link = locationService.generateGoogleMapsLink(
          event.latitude,
          event.longitude
        );
      }
      
      res.status(200).json({
        success: true,
        data: { event },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async updateEvent(req, res, next) {
    try {
      const { eventId } = req.params;
      const updates = req.body;
      
      // Check ownership
      const existingEvent = await EventModel.findById(eventId);
      if (!existingEvent) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Event not found',
        });
      }
      
      if (existingEvent.organizer_id !== req.userId && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only update your own events',
        });
      }
      
      // Handle image update
      if (req.file) {
        // Delete old image if exists
        if (existingEvent.cloudinary_public_id) {
          await cloudinaryService.deleteImage(existingEvent.cloudinary_public_id);
        }
        
        const uploadResult = await cloudinaryService.uploadEventImage(
          req.file.buffer,
          eventId,
          updates.title || existingEvent.title
        );
        updates.image_url = uploadResult.secure_url;
        updates.cloudinary_public_id = uploadResult.public_id;
      }
      
      const event = await EventModel.updateEvent(eventId, updates);
      
      // Invalidate cache
      await cacheManager.del(CACHE_KEYS.EVENT(eventId));
      await cacheManager.delPattern(CACHE_KEYS.PATTERNS.EVENT_ALL);
      
      res.status(200).json({
        success: true,
        message: 'Event updated successfully',
        data: { event },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async publishEvent(req, res, next) {
    try {
      const { eventId } = req.params;
      
      const event = await EventModel.publishEvent(eventId);
      if (!event) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Event not found or already published',
        });
      }
      
      // Queue notification to subscribers
      await queueManager.addJob(QUEUES.NOTIFICATION, 'event_published', {
        eventId,
        eventTitle: event.title,
      });
      
      // Invalidate cache
      await cacheManager.del(CACHE_KEYS.EVENT(eventId));
      await cacheManager.delPattern(CACHE_KEYS.PATTERNS.EVENT_ALL);
      
      res.status(200).json({
        success: true,
        message: 'Event published successfully',
        data: { event },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async getTrendingEvents(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 10;
      
      // Try cache
      const cacheKey = CACHE_KEYS.EVENTS_TRENDING;
      let events = await cacheManager.get(cacheKey);
      
      if (!events) {
        events = await EventModel.getTrendingEvents(limit);
        await cacheManager.set(cacheKey, events, CACHE_TTL.MEDIUM); // 5 minutes
      }
      
      res.status(200).json({
        success: true,
        data: { events, count: events.length },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async getUpcomingEvents(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const offset = parseInt(req.query.offset) || 0;
      
      const events = await EventModel.getUpcomingEvents(limit, offset);
      
      res.status(200).json({
        success: true,
        data: { events, count: events.length },
        pagination: { limit, offset },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async getSecretEvents(req, res, next) {
    try {
      const userId = req.userId;
      const events = await EventModel.getSecretEvents(userId);
      
      res.status(200).json({
        success: true,
        data: { events, count: events.length },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async getMyEvents(req, res, next) {
    try {
      const status = req.query.status;
      const events = await EventModel.getOrganizerEvents(req.userId, status);
      
      res.status(200).json({
        success: true,
        data: { events, count: events.length },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async getEventStats(req, res, next) {
    try {
      const { eventId } = req.params;
      
      const stats = await EventModel.getEventStats(eventId);
      
      res.status(200).json({
        success: true,
        data: { stats },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async searchEvents(req, res, next) {
    try {
      const { q, category, minPrice, maxPrice, startDate, endDate } = req.query;
      
      if (!q) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Search query is required',
        });
      }
      
      const events = await EventModel.searchEvents(q, {
        category,
        minPrice: minPrice ? parseFloat(minPrice) : null,
        maxPrice: maxPrice ? parseFloat(maxPrice) : null,
        startDate,
        endDate,
      });
      
      res.status(200).json({
        success: true,
        data: { events, count: events.length, query: q },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async getNearbyEvents(req, res, next) {
    try {
      const { latitude, longitude, radius } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Latitude and longitude are required',
        });
      }
      
      const radiusKm = parseFloat(radius) || 10;
      const events = await EventModel.getNearbyEvents(
        parseFloat(latitude),
        parseFloat(longitude),
        radiusKm
      );
      
      res.status(200).json({
        success: true,
        data: { events, count: events.length, radius: radiusKm },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async deleteEvent(req, res, next) {
    try {
      const { eventId } = req.params;
      
      const event = await EventModel.findById(eventId);
      if (!event) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Event not found',
        });
      }
      
      // Delete images from Cloudinary
      if (event.cloudinary_public_id) {
        await cloudinaryService.deleteImage(event.cloudinary_public_id);
      }
      
      // Soft delete event
      await EventModel.delete(eventId);
      
      // Invalidate cache
      await cacheManager.del(CACHE_KEYS.EVENT(eventId));
      await cacheManager.delPattern(CACHE_KEYS.PATTERNS.EVENT_ALL);
      
      res.status(200).json({
        success: true,
        message: 'Event deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
  
  async addTicketTier(req, res, next) {
    try {
      const { eventId } = req.params;
      const tierData = req.body;
      
      const tier = await TicketTierModel.createTier({
        eventId,
        ...tierData,
      });
      
      // Update event total tickets
      await EventModel.updateTicketCounts(eventId);
      
      // Invalidate cache
      await cacheManager.del(CACHE_KEYS.EVENT(eventId));
      
      res.status(201).json({
        success: true,
        message: 'Ticket tier added successfully',
        data: { tier },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async updateTicketTier(req, res, next) {
    try {
      const { tierId } = req.params;
      const updates = req.body;
      
      const tier = await TicketTierModel.updateTier(tierId, updates);
      
      if (updates.quantity !== undefined) {
        // Update event total tickets
        const eventId = tier.event_id;
        await EventModel.updateTicketCounts(eventId);
        await cacheManager.del(CACHE_KEYS.EVENT(eventId));
      }
      
      res.status(200).json({
        success: true,
        message: 'Ticket tier updated successfully',
        data: { tier },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EventController();