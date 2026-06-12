const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { rateLimitMiddleware } = require('../middleware/rateLimiter');

// Public routes (with rate limiting)
router.post('/register', 
  rateLimitMiddleware({ windowMs: 3600000, maxRequests: 5 }), // 5 per hour
  authController.register
);

router.post('/login',
  rateLimitMiddleware({ windowMs: 900000, maxRequests: 10 }), // 10 per 15 min
  authController.login
);

router.post('/login/phone',
  rateLimitMiddleware({ windowMs: 900000, maxRequests: 5 }),
  authController.loginWithPhone
);

router.post('/verify-otp',
  rateLimitMiddleware({ windowMs: 900000, maxRequests: 10 }),
  authController.verifyOTP
);

router.post('/refresh-token',
  rateLimitMiddleware({ windowMs: 3600000, maxRequests: 100 }),
  authController.refreshToken
);

router.post('/forgot-password',
  rateLimitMiddleware({ windowMs: 3600000, maxRequests: 3 }),
  authController.forgotPassword
);

router.post('/reset-password',
  rateLimitMiddleware({ windowMs: 3600000, maxRequests: 3 }),
  authController.resetPassword
);

// Protected routes (require authentication)
router.post('/logout',
  authMiddleware,
  authController.logout
);

router.post('/logout-all',
  authMiddleware,
  authController.logoutAllDevices
);

router.post('/change-password',
  authMiddleware,
  authController.changePassword
);

router.get('/profile',
  authMiddleware,
  authController.getProfile
);

router.put('/profile',
  authMiddleware,
  authController.updateProfile
);

module.exports = router;