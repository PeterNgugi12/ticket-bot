const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');
const { uploadEventImage } = require('../middleware/upload');
const { validateEvent } = require('../middleware/validation');

// Public routes (no auth required)
router.get('/trending', eventController.getTrendingEvents);
router.get('/upcoming', eventController.getUpcomingEvents);
router.get('/search', eventController.searchEvents);
router.get('/nearby', eventController.getNearbyEvents);
router.get('/secret', authMiddleware, eventController.getSecretEvents);
router.get('/:eventId', eventController.getEvent);

// Protected routes (auth required)
router.use(authMiddleware);

// Organizer routes
// This is correct - uploadEventImage should come first
router.post('/',
  requireRole('organizer', 'admin', 'super_admin'),
  uploadEventImage,  // First, handle file upload
  validateEvent,     // Then validate the data (but this expects JSON)
  eventController.createEvent
);

router.put('/:eventId',
  requireRole('organizer', 'admin', 'super_admin'),
  uploadEventImage,
  eventController.updateEvent
);

router.post('/:eventId/publish',
  requireRole('organizer', 'admin', 'super_admin'),
  eventController.publishEvent
);

router.delete('/:eventId',
  requireRole('organizer', 'admin', 'super_admin'),
  eventController.deleteEvent
);

router.get('/my/events',
  requireRole('organizer', 'admin', 'super_admin'),
  eventController.getMyEvents
);

router.get('/:eventId/stats',
  requireRole('organizer', 'admin', 'super_admin'),
  eventController.getEventStats
);

// Ticket tier routes
router.post('/:eventId/tiers',
  requireRole('organizer', 'admin', 'super_admin'),
  eventController.addTicketTier
);

router.put('/tiers/:tierId',
  requireRole('organizer', 'admin', 'super_admin'),
  eventController.updateTicketTier
);

module.exports = router;