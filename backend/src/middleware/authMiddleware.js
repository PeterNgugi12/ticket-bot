const authService = require('../services/authService');

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided',
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Get user from token
    const user = await authService.getUserFromToken(token);
    
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }
    
    // Attach user to request
    req.user = user;
    req.userId = user.id;
    req.accessToken = token;
    
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: error.message,
    });
  }
};

const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const user = await authService.getUserFromToken(token);
      if (user) {
        req.user = user;
        req.userId = user.id;
      }
    }
    next();
  } catch (error) {
    next();
  }
};

module.exports = { authMiddleware, optionalAuthMiddleware };