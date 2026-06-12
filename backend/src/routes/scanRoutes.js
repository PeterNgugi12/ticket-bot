const express = require('express');
const router = express.Router();
const scanController = require('../controllers/scanController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');

// All scan routes require authentication
router.use(authMiddleware);

// Scanning (organizers only)
router.post('/scan', requireRole('organizer', 'admin', 'super_admin'), scanController.scanTicket);
router.post('/verify-multiple', requireRole('organizer', 'admin', 'super_admin'), scanController.verifyMultiple);

// Event scan data (organizers only)
router.get('/events/:eventId/scans', requireRole('organizer', 'admin', 'super_admin'), scanController.getEventScans);
router.get('/events/:eventId/checkins', requireRole('organizer', 'admin', 'super_admin'), scanController.getEventCheckins);
router.get('/events/:eventId/stats', requireRole('organizer', 'admin', 'super_admin'), scanController.getScanStats);

// Admin routes
router.get('/recent', requireRole('admin', 'super_admin'), scanController.getRecentScans);

module.exports = router;