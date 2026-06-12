const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const redisConfig = require('./config/redis');

// Middleware
const { sessionMiddleware } = require('./middleware/sessionMiddleware');
const { rateLimitMiddleware } = require('./middleware/rateLimiter');
const { authMiddleware } = require('./middleware/authMiddleware');
const { requireRole } = require('./middleware/rbacMiddleware');

// Routes
const authRoutes = require('./routes/authRoutes');
const eventRoutes = require('./routes/eventRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const mpesaRoutes = require('./routes/mpesaRoutes');
const qrRoutes = require('./routes/qrRoutes');
const emailRoutes = require('./routes/emailRoutes');
const walletRoutes = require('./routes/walletRoutes');
const resaleRoutes = require('./routes/resaleRoutes');
const scanRoutes = require('./routes/scanRoutes');
const adminRoutes = require('./routes/adminRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const scannerRoutes = require('./routes/scannerRoutes');

// Initialize Express app
const app = express();

// ==================== SECURITY MIDDLEWARE ====================
app.use(helmet({
  contentSecurityPolicy: config.isProduction(),
  crossOriginEmbedderPolicy: config.isProduction(),
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-site' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
}));

// ==================== CORS CONFIGURATION ====================
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    
    if (config.cors.allowedOrigins.includes(origin) || config.isDevelopment()) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Session-Token'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400,
}));

// ==================== COMPRESSION & LOGGING ====================
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

// Logging
if (config.isDevelopment()) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    skip: (req, res) => res.statusCode < 400,
  }));
}

const scannerRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 100 requests per minute
  message: {
    error: 'Too Many Requests',
    message: 'Too many requests, please slow down',
  },
});

// ==================== BODY PARSING ====================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==================== SESSION MIDDLEWARE ====================
app.use(sessionMiddleware);

// ==================== REQUEST ID MIDDLEWARE ====================
app.use((req, res, next) => {
  req.requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// ==================== GLOBAL RATE LIMITING ====================
const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    error: 'Too Many Requests',
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
               req.ip || 
               req.connection?.remoteAddress || 
               req.socket?.remoteAddress ||
               'unknown';
    return ip;
  },
  skip: (req) => req.path === '/health' || req.path === '/health/redis' || req.path === '/health/db',
});
app.use('/api', globalLimiter);

// ==================== HEALTH CHECK ENDPOINTS ====================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env,
    version: config.apiVersion,
  });
});

app.get('/health/redis', async (req, res) => {
  const health = await redisConfig.healthCheck();
  res.status(health.healthy ? 200 : 503).json(health);
});

app.get('/health/db', async (req, res) => {
  const dbPool = require('./db/pool');
  const health = await dbPool.healthCheck();
  res.status(health.healthy ? 200 : 503).json(health);
});

// ==================== API ROOT ====================
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'TIX CULTURE API',
    version: config.apiVersion,
    status: 'operational',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/v1/auth',
      events: '/api/v1/events',
      tickets: '/api/v1/tickets',
      mpesa: '/api/v1/mpesa',
      qr: '/api/v1/qr',
      email: '/api/v1/email',
      wallet: '/api/v1/wallet',
      resale: '/api/v1/resale',
      scan: '/api/v1/scan',
      admin: '/api/v1/admin',
    },
  });
});

// ==================== API ROUTES ====================
// Public routes (no authentication required)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/mpesa', mpesaRoutes); // Webhook endpoints are public
app.use('/api/v1/email/track', emailRoutes); // Tracking pixels are public

// Protected routes (authentication required)
app.use('/api/v1/events', eventRoutes);
app.use('/api/v1/tickets', ticketRoutes);
app.use('/api/v1/qr', qrRoutes);
app.use('/api/v1/email', emailRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/resale', resaleRoutes);
app.use('/api/v1/scan', scanRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/scanners', scannerRoutes,scannerRateLimiter);

// ==================== EXAMPLE PROTECTED ROUTES ====================
app.get('/api/v1/protected', authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: 'This is a protected route',
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

app.get('/api/v1/admin-only', 
  authMiddleware, 
  requireRole('admin', 'super_admin'),
  (req, res) => {
    res.json({
      success: true,
      message: 'Admin only route',
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
      },
    });
  }
);

app.get('/api/v1/organizer-only',
  authMiddleware,
  requireRole('organizer', 'admin', 'super_admin'),
  (req, res) => {
    res.json({
      success: true,
      message: 'Organizer only route',
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
      },
    });
  }
);

// ==================== DEBUG ENDPOINTS (Admin only in production) ====================
if (config.isDevelopment()) {
  app.get('/debug/cache-stats', async (req, res) => {
    const cacheManager = require('./cache/cacheManager');
    const stats = {
      redisConnected: redisConfig.connections?.size > 0,
      connections: redisConfig.connections ? Array.from(redisConfig.connections.keys()) : [],
      activeSessions: await cacheManager.get('session:stats') || 0,
    };
    res.json(stats);
  });

  app.get('/debug/queue-stats', async (req, res) => {
    const { queueManager } = require('./queue/queueManager');
    const stats = {};
    const queues = ['email_queue', 'qr_queue', 'mpesa_queue', 'scan_queue', 'notification_queue'];
    
    for (const queueName of queues) {
      const queue = queueManager.getQueue(queueName);
      if (queue) {
        stats[queueName] = await queue.getJobCounts();
      }
    }
    
    res.json(stats);
  });
}

// ==================== 404 HANDLER ====================
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.url}`,
    requestId: req.requestId,
  });
});

// ==================== GLOBAL ERROR HANDLER ====================
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  const logData = {
    requestId: req.requestId,
    status,
    message,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.userId,
  };
  
  if (config.isProduction()) {
    console.error(`[${req.requestId}] Error:`, logData);
    if (status === 500) {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        requestId: req.requestId,
      });
    }
  } else {
    console.error(`[${req.requestId}] Error:`, {
      ...logData,
      stack: err.stack,
    });
  }
  
  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Conflict',
      message: 'Resource already exists',
      requestId: req.requestId,
    });
  }
  
  if (err.code === '23503') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Referenced resource does not exist',
      requestId: req.requestId,
    });
  }
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      details: err.details,
      requestId: req.requestId,
    });
  }
  
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid token',
      requestId: req.requestId,
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token expired',
      requestId: req.requestId,
    });
  }
  
  res.status(status).json({
    error: message,
    status,
    requestId: req.requestId,
    ...(config.isDevelopment() && { stack: err.stack }),
  });
});

// ==================== GRACEFUL SHUTDOWN HANDLERS ====================
const gracefulShutdown = () => {
  console.log('\n🛑 Received shutdown signal, closing gracefully...');
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = app;