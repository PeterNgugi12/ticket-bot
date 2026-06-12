// Cache key constants for consistent key naming
const CACHE_KEYS = {
  // User related
  USER: (id) => `user:${id}`,
  USER_SESSION: (sessionId) => `user:session:${sessionId}`,
  USER_WALLET: (userId) => `user:wallet:${userId}`,
  USER_TICKETS: (userId) => `user:tickets:${userId}`,
  
  // Event related
  EVENT: (id) => `event:${id}`,
  EVENTS_TRENDING: 'events:trending',
  EVENTS_UPCOMING: (limit) => `events:upcoming:${limit}`,
  EVENTS_SECRET: 'events:secret',
  EVENT_TICKETS: (eventId) => `event:tickets:${eventId}`,
  EVENT_STATS: (eventId) => `event:stats:${eventId}`,
  
  // Ticket related
  TICKET: (id) => `ticket:${id}`,
  TICKET_QR: (hash) => `ticket:qr:${hash}`,
  
  // Organizer related
  ORGANIZER_EVENTS: (organizerId) => `organizer:${organizerId}:events`,
  ORGANIZER_STATS: (organizerId) => `organizer:${organizerId}:stats`,
  
  // Rate limiting
  RATE_LIMIT: (ip, endpoint) => `rate:${ip}:${endpoint}`,
  
  // WhatsApp sessions
  WHATSAPP_SESSION: (phoneNumber) => `wa:session:${phoneNumber}`,
  WHATSAPP_STATE: (phoneNumber) => `wa:state:${phoneNumber}`,
  
  // Payment related
  PAYMENT_REQUEST: (checkoutId) => `payment:${checkoutId}`,
  MPESA_CALLBACK_LOCK: (transactionId) => `mpesa:lock:${transactionId}`,
  
  // Resale
  RESALE_LISTINGS: (eventId) => `resale:${eventId}`,
  
  // Pattern matching (for batch invalidation)
  PATTERNS: {
    USER_ALL: 'user:*',
    EVENT_ALL: 'event:*',
    TICKET_ALL: 'ticket:*',
  },
};

// TTL values in seconds
const CACHE_TTL = {
  SHORT: 60,           // 1 minute
  MEDIUM: 300,         // 5 minutes
  STANDARD: 3600,      // 1 hour
  LONG: 86400,         // 24 hours
  WEEK: 604800,        // 7 days
  SESSION: 86400,      // 24 hours
  RATE_LIMIT: 900,     // 15 minutes
};

module.exports = { CACHE_KEYS, CACHE_TTL };