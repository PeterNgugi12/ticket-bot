const express = require('express');
const router = express.Router();
const qrController = require('../controllers/qrController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');

// All QR routes require authentication
router.use(authMiddleware);

// User routes
router.post('/generate/:ticketId', qrController.generateTicketQR);
router.get('/ticket/:ticketNumber', qrController.getTicketQR);
router.post('/regenerate/:ticketId', qrController.regenerateQR);
router.get('/download/:ticketNumber', qrController.downloadTicketPDF);

// Validation route (for organizers)
router.post('/validate', requireRole('organizer', 'admin', 'super_admin'), qrController.validateQR);

// Batch operations (organizer only)
router.post('/batch/:eventId', requireRole('organizer', 'admin', 'super_admin'), qrController.batchGenerateQRs);

module.exports = router;