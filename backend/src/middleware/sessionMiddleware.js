const sessionService = require('../services/sessionService');

const sessionMiddleware = async (req, res, next) => {
  // Get session token from header or cookie
  const sessionToken = req.headers['x-session-token'] || req.cookies?.sessionToken;
  
  if (!sessionToken) {
    req.session = null;
    return next();
  }
  
  const session = await sessionService.validateSession(sessionToken);
  
  if (session) {
    req.session = session;
    req.userId = session.userId;
    
    // Refresh session on activity
    await sessionService.refreshSession(sessionToken);
  } else {
    req.session = null;
  }
  
  next();
};

const requireSession = async (req, res, next) => {
  if (!req.session) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid session token required',
    });
  }
  
  next();
};

module.exports = { sessionMiddleware, requireSession };