const app = require('./app');
const config = require('./config');
const redisConfig = require('./config/redis');
const dbPool = require('./db/pool');
const { queueManager, QUEUES } = require('./queue/queueManager');

// Initialize all queues
const queues = [
  QUEUES.EMAIL,
  QUEUES.QR_GENERATION,
  QUEUES.MPESA_CALLBACK,
  QUEUES.TICKET_SCAN,
  QUEUES.NOTIFICATION,
  QUEUES.REPORT
];

console.log('\n📋 Initializing Queues...');
queues.forEach(queueName => {
  try {
    queueManager.createQueue(queueName);
    console.log(`   ✅ Queue initialized: ${queueName}`);
  } catch (error) {
    console.log(`   ⚠️ Queue ${queueName} already exists or error:`, error.message);
  }
});
console.log('');

const server = app.listen(config.port, config.host, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║   🎤 TIX CULTURE API - Production Ready                              ║
║                                                                       ║
║   Environment: ${config.env.padEnd(55)}║
║   Server: ${`${config.host}:${config.port}`.padEnd(55)}║
║   API Version: ${config.apiVersion.padEnd(55)}║
║   Status: 🟢 Running                                                  ║
║                                                                       ║
║   📍 Endpoints:                                                       ║
║   • Health:    http://${config.host}:${config.port}/health            ║
║   • API Root:  http://${config.host}:${config.port}/                  ║
║   • Auth:      http://${config.host}:${config.port}/api/v1/auth       ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
  `);
  
  console.log('📋 Active Queues:');
  queues.forEach(queue => console.log(`   • ${queue}`));
  console.log('');
});

// Graceful shutdown function
const gracefulShutdown = async () => {
  console.log('\n🛑 Received shutdown signal, closing gracefully...');
  
  // Stop accepting new connections
  server.close(async () => {
    console.log('✅ HTTP server closed');
    
    try {
      // Close Redis connections
      await redisConfig.closeAll();
      console.log('✅ Redis connections closed');
      
      // Close database pool
      await dbPool.close();
      console.log('✅ Database pool closed');
      
      // Close queue connections
      await queueManager.closeAll();
      console.log('✅ Queue connections closed');
      
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });
  
  // Force close after timeout
  setTimeout(() => {
    console.error('⚠️ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown();
});

module.exports = server;