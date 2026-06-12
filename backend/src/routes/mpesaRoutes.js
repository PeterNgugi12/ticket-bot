const express = require('express');
const router = express.Router();
const mpesaController = require('../controllers/mpesaController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Public webhook routes (no auth)
router.post('/callback', mpesaController.handleCallback);
router.post('/timeout', mpesaController.handleTimeout);

// 🆕 PUBLIC WHATSAPP ROUTES - NO AUTH REQUIRED
router.post('/whatsapp/initiate', mpesaController.initiateWhatsAppPayment);
router.get('/whatsapp/transaction/:checkoutRequestID', mpesaController.queryWhatsAppTransaction);

// Protected routes (require auth)
router.use(authMiddleware);

router.post('/initiate', mpesaController.initiatePayment);
router.post('/create', mpesaController.createPayment);
router.get('/payment/:paymentId', mpesaController.getPaymentStatus);
router.get('/transaction/:checkoutRequestID', mpesaController.queryTransaction);
router.get('/transaction-log/:transactionId', mpesaController.getTransactionLog);
router.get('/stats', mpesaController.getTransactionStats);
router.post('/replay/:transactionId', mpesaController.replayTransaction);

// Development only
if (process.env.NODE_ENV !== 'production') {
  router.post('/simulate', mpesaController.simulatePayment);
}

module.exports = router;