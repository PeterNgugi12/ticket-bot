const WhatsAppWebClient = require('../services/whatsapp/whatsappWebClient');

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║   🤖 TIX CULTURE WhatsApp Bot - QR Code Method                       ║
║                                                                       ║
║   This method uses WhatsApp Web with better connection stability.    ║
║   You'll need to scan a QR code to link your WhatsApp.               ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
  `);

  console.log('📌 Important Notes:');
  console.log('   • Make sure WhatsApp is installed on your phone');
  console.log('   • Ensure you have a stable internet connection');
  console.log('   • This will open a browser instance in the background');
  console.log('   • The QR code will appear in this terminal\n');

  const client = new WhatsAppWebClient();
  
  try {
    await client.connect();
    
    console.log('\n💡 Bot Features:');
    console.log('   • Send "MENU" to see available commands');
    console.log('   • Browse trending events');
    console.log('   • Purchase tickets');
    console.log('   • View your tickets');
    console.log('   • Organizer mode for scanning');
    console.log('\n⏳ Bot is running. Press Ctrl+C to stop.\n');
    
  } catch (error) {
    console.error('\n❌ Failed to connect:', error.message);
    console.log('\n💡 Troubleshooting steps:');
    console.log('   1. Make sure you have Chrome/Chromium installed');
    console.log('   2. Check your internet connection');
    console.log('   3. Try running as administrator');
    console.log('   4. Disable antivirus temporarily');
    console.log('   5. Try again in a few minutes\n');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down WhatsApp bot...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n🛑 Shutting down WhatsApp bot...');
  process.exit(0);
});

main();