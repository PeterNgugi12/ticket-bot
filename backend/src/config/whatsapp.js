const path = require('path');

const whatsappConfig = {
  sessionDir: process.env.WHATSAPP_SESSION_DIR || './src/whatsapp/sessions',
  mediaDir: process.env.WHATSAPP_MEDIA_DIR || './src/whatsapp/media',
  autoReconnect: process.env.WHATSAPP_AUTO_RECONNECT === 'true' || true,
  reconnectInterval: parseInt(process.env.WHATSAPP_RECONNECT_INTERVAL) || 5000,
  maxReconnectAttempts: parseInt(process.env.WHATSAPP_MAX_RECONNECT_ATTEMPTS) || 10,
  messageTTL: parseInt(process.env.WHATSAPP_MESSAGE_TTL) || 86400,
  baileys: {
    browser: ['TIX CULTURE', 'Chrome', '120.0.0.0'],
    version: [2, 3000, 1015901307],
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    },
    markOnlineOnConnect: true,
    syncFullHistory: false,
    patchHistory: false,
    qrTimeout: 60000,
  },
  rateLimit: {
    messagesPerMinute: 60,
    maxMessagesPerSession: 1000,
  },
  menu: {
    timeout: 300000,
    maxDepth: 3,
  },
};

module.exports = whatsappConfig;