const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');

// All ticket routes require authentication
router.use(authMiddleware);

// User routes
router.post('/purchase', ticketController.purchaseTickets);
router.get('/my-tickets', ticketController.getMyTickets);
router.get('/my-tickets/:ticketId', ticketController.getTicketDetails);
router.post('/transfer/:ticketId', ticketController.transferTicket);
router.get('/download/:ticketId', ticketController.downloadQRCode);

// Verification routes (for organizers)
router.post('/verify', requireRole('organizer', 'admin', 'super_admin'), ticketController.verifyTicket);
router.post('/mark-used/:ticketId', requireRole('organizer', 'admin', 'super_admin'), ticketController.markTicketUsed);
router.get('/event/:eventId', requireRole('organizer', 'admin', 'super_admin'), ticketController.getEventTickets);
router.get('/event/:eventId/stats', requireRole('organizer', 'admin', 'super_admin'), ticketController.getTicketStats);

// QR scanning
router.post('/scan', ticketController.scanQRCode);

module.exports = router;