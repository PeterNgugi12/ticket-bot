const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');

// Public tracking routes (no auth)
router.get('/track/:emailId/open', emailController.trackOpen);
router.get('/track/:emailId/click/:link', emailController.trackClick);

// Protected routes
router.use(authMiddleware);

// Email sending
router.post('/test', emailController.sendTestEmail);

// Template management (admin only)
router.get('/templates', requireRole('admin', 'super_admin'), emailController.getTemplates);
router.post('/templates', requireRole('admin', 'super_admin'), emailController.createTemplate);
router.put('/templates/:templateName', requireRole('admin', 'super_admin'), emailController.updateTemplate);
router.delete('/templates/:templateName', requireRole('admin', 'super_admin'), emailController.deleteTemplate);
router.post('/preview/:templateName', emailController.previewTemplate);

// Stats (admin only)
router.get('/stats', requireRole('admin', 'super_admin'), emailController.getEmailStats);

module.exports = router;