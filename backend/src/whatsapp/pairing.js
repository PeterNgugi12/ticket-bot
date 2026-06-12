const readline = require('readline');
const WhatsAppPairingClient = require('../services/whatsapp/whatsappPairingClient');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║   🤖 TIX CULTURE WhatsApp Bot - Pairing Code Method                  ║
║                                                                       ║
║   This method is more reliable than QR codes.                        ║
║   You'll receive a 8-digit code to link your WhatsApp.               ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
  `);

  console.log('📌 Important Notes:');
  console.log('   • Use format: 254XXXXXXXXX (e.g., 254712345678)');
  console.log('   • Make sure WhatsApp is installed on your phone');
  console.log('   • Ensure you have a stable internet connection');
  console.log('   • If connection fails, try using a VPN\n');

  rl.question('📱 Enter your WhatsApp phone number: ', async (phoneNumber) => {
    if (!phoneNumber || phoneNumber.length < 10) {
      console.log('\n❌ Invalid phone number. Please use format: 254XXXXXXXXX\n');
      rl.close();
      process.exit(1);
    }

    const client = new WhatsAppPairingClient();
    
    try {
      const code = await client.connect(phoneNumber);
      
      if (code) {
        console.log('\n✅ Pairing code sent successfully!');
        console.log('📱 Enter the code in WhatsApp to link your device.\n');
      }
      
      console.log('💡 Bot Features:');
      console.log('   • Send "MENU" to see available commands');
      console.log('   • Browse trending events');
      console.log('   • Purchase tickets');
      console.log('   • View your tickets');
      console.log('   • Organizer mode for scanning');
      console.log('\n⏳ Bot is running. Press Ctrl+C to stop.\n');
      
    } catch (error) {
      console.error('\n❌ Failed to connect:', error.message);
      console.log('\n💡 Troubleshooting steps:');
      console.log('   1. Check your internet connection');
      console.log('   2. Try using a VPN (WhatsApp might be blocked)');
      console.log('   3. Make sure your phone number is correct');
      console.log('   4. Update WhatsApp to the latest version');
      console.log('   5. Try again in a few minutes\n');
      process.exit(1);
    }
  });
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down WhatsApp bot...');
  rl.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n🛑 Shutting down WhatsApp bot...');
  rl.close();
  process.exit(0);
});

main();