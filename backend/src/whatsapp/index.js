const whatsappClient = require('../services/whatsapp/whatsappClient');
const config = require('../config');

async function startWhatsAppBot() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║   🤖 TIX CULTURE WhatsApp Bot                                         ║
║                                                                       ║
║   Status: Starting up...                                              ║
║   Environment: ${config.env.padEnd(50)}║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
  `);
  
  try {
    // Start the bot (QR code method)
    await whatsappClient.start();
    
    console.log('\n💡 Bot Features:');
    console.log('   • Send "MENU" to see available commands');
    console.log('   • Browse trending events');
    console.log('   • Purchase tickets');
    console.log('   • View your tickets');
    console.log('   • Organizer mode for scanning');
    console.log('\n⏳ Bot is running. Press Ctrl+C to stop.\n');
    
  } catch (error) {
    console.error('❌ Failed to start WhatsApp bot:', error);
    setTimeout(startWhatsAppBot, 5000);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down WhatsApp bot...');
  await whatsappClient.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n🛑 Shutting down WhatsApp bot...');
  await whatsappClient.disconnect();
  process.exit(0);
});

// Start the bot
startWhatsAppBot();