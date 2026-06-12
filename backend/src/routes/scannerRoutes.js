// backend/src/routes/scannerRoutes.js
const express = require('express');
const router = express.Router();
const scannerController = require('../controllers/scannerController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');

// ==================== PUBLIC ROUTES ====================
router.post('/login', scannerController.scannerLogin);
router.post('/verify', scannerController.verifyScanner);

// ==================== SCANNER APP ROUTES (API Key Auth) ====================
// Apply API key validation to specific routes
router.post('/scan', scannerController.validateScannerApiKey, scannerController.scanTicket);
router.get('/stats', scannerController.validateScannerApiKey, scannerController.getScannerStats);
router.get('/event', scannerController.validateScannerApiKey, scannerController.getAssignedEvent);
router.post('/heartbeat', scannerController.validateScannerApiKey, scannerController.heartbeat);
router.get('/recent-scans', scannerController.validateScannerApiKey, scannerController.getRecentScans);
router.post('/change-password', scannerController.validateScannerApiKey, scannerController.changePassword);

// ==================== ORGANIZER ROUTES (JWT Auth) ====================
router.post('/team', authMiddleware, requireRole('organizer', 'admin', 'super_admin'), scannerController.addTeamMember);
router.get('/team', authMiddleware, requireRole('organizer', 'admin', 'super_admin'), scannerController.getTeamMembers);
router.put('/team/:memberId/status', authMiddleware, requireRole('organizer', 'admin', 'super_admin'), scannerController.updateTeamMemberStatus);
router.delete('/team/:memberId', authMiddleware, requireRole('organizer', 'admin', 'super_admin'), scannerController.deleteTeamMember);
router.get('/team/:memberId/stats', authMiddleware, requireRole('organizer', 'admin', 'super_admin'), scannerController.getTeamMemberStats);

module.exports = router;