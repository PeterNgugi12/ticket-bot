const express = require('express');
const router = express.Router();

// Webhook endpoints for various services

// M-Pesa webhooks (already handled in mpesaRoutes, but adding for completeness)
router.post('/mpesa/callback', (req, res) => {
  console.log('M-Pesa callback received:', req.body);
  res.status(200).json({ ResultCode: '0', ResultDesc: 'Success' });
});

router.post('/mpesa/timeout', (req, res) => {
  console.log('M-Pesa timeout received:', req.body);
  res.status(200).json({ ResultCode: '0', ResultDesc: 'Success' });
});

// WhatsApp webhooks (for business API)
router.post('/whatsapp', (req, res) => {
  console.log('WhatsApp webhook received:', req.body);
  res.status(200).json({ status: 'ok' });
});

// Generic webhook endpoint
router.post('/generic', (req, res) => {
  console.log('Generic webhook received:', req.body);
  res.status(200).json({ received: true });
});

module.exports = router;