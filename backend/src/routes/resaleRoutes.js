const express = require('express');
const router = express.Router();
const resaleController = require('../controllers/resaleController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');

// All resale routes require authentication
router.use(authMiddleware);

// Listing management
router.post('/listings', resaleController.createListing);
router.get('/listings', resaleController.getActiveListings);
router.get('/listings/my', resaleController.getMyListings);
router.get('/listings/:listingId', resaleController.getListingDetails);
router.put('/listings/:listingId/price', resaleController.updateListingPrice);
router.delete('/listings/:listingId', resaleController.cancelListing);

// Purchase
router.post('/listings/:listingId/purchase', resaleController.purchaseListing);

// Validation
router.get('/check/:ticketId', resaleController.checkResaleAllowed);

// Admin endpoints
router.get('/admin/stats', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const stats = await ResaleListingModel.getMarketplaceStats();
    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

module.exports = router;