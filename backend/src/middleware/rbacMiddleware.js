const roles = {
  user: ['user'],
  organizer: ['organizer', 'user'],
  admin: ['admin', 'organizer', 'user'],
  super_admin: ['super_admin', 'admin', 'organizer', 'user'],
};

const permissions = {
  // User permissions
  'user:read': ['user', 'organizer', 'admin', 'super_admin'],
  'user:update': ['user', 'organizer', 'admin', 'super_admin'],
  'user:delete': ['admin', 'super_admin'],
  
  // Event permissions
  'event:create': ['organizer', 'admin', 'super_admin'],
  'event:read': ['user', 'organizer', 'admin', 'super_admin'],
  'event:update': ['organizer', 'admin', 'super_admin'],
  'event:delete': ['admin', 'super_admin'],
  
  // Ticket permissions
  'ticket:purchase': ['user', 'organizer', 'admin', 'super_admin'],
  'ticket:scan': ['organizer', 'admin', 'super_admin'],
  'ticket:refund': ['admin', 'super_admin'],
  
  // Organizer permissions
  'organizer:stats': ['organizer', 'admin', 'super_admin'],
  'organizer:withdraw': ['organizer', 'admin', 'super_admin'],
  
  // Admin permissions
  'admin:users': ['admin', 'super_admin'],
  'admin:withdrawals': ['admin', 'super_admin'],
  'admin:analytics': ['admin', 'super_admin'],
  'admin:system': ['super_admin'],
};

const rbacMiddleware = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }
    
    const userRole = req.user.role;
    const allowedRoles = permissions[requiredPermission];
    
    if (!allowedRoles) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: `Permission '${requiredPermission}' not defined`,
      });
    }
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Insufficient permissions. Required: ${requiredPermission}`,
      });
    }
    
    next();
  };
};

const requireRole = (...requiredRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }
    
    if (!requiredRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Required roles: ${requiredRoles.join(', ')}`,
      });
    }
    
    next();
  };
};

const isOwner = (getResourceUserId) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }
    
    // Super admin can access anything
    if (req.user.role === 'super_admin') {
      return next();
    }
    
    const resourceUserId = await getResourceUserId(req);
    
    if (req.user.id !== resourceUserId && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only access your own resources',
      });
    }
    
    next();
  };
};

module.exports = { rbacMiddleware, requireRole, isOwner, permissions, roles };