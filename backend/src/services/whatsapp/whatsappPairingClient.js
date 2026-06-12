const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const path = require('path');
const fs = require('fs');
const messageHandler = require('./whatsappHandler');
const MessageFormatter = require('../../whatsapp/utils/messageFormatter');

class WhatsAppPairingClient {
  constructor() {
    this.sock = null;
    this.isConnected = false;
    this.logger = Pino({ level: 'info' });
    this.phoneNumber = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  async connect(phoneNumber) {
    this.phoneNumber = this.formatPhoneNumber(phoneNumber);
    
    console.log(`\n🔐 Attempting to connect WhatsApp for ${this.phoneNumber}...`);
    
    const sessionDir = path.join(__dirname, '../../whatsapp/sessions', this.phoneNumber);
    
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    this.sock = makeWASocket({
      auth: state,
      browser: ['TIX CULTURE', 'Chrome', '120.0.0.0'],
      version: [2, 3000, 1015901307],
      logger: this.logger,
      markOnlineOnConnect: true,
      syncFullHistory: false,
      patchHistoryBeforeFirstInitialization: false,
      generateHighQualityLinkPreview: true,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000, // Increased to 30 seconds
      retryRequestDelayMs: 5000, // Increased retry delay
      maxRetries: 5, // More retries
      qrTimeout: 60000,
      // Add these options for better connection stability
      emitOwnEvents: true,
      fireInitQueries: true,
    });

    // Handle connection updates
    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (connection === 'open') {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log(`\n✅ WhatsApp connected successfully for ${this.phoneNumber}!\n`);
        console.log('🎉 Bot is now ready to receive and send messages!\n');
        
        // Send welcome message
        setTimeout(() => this.sendTestMessage(), 2000);
      }
      
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        this.isConnected = false;
        
        if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(5000 * this.reconnectAttempts, 30000);
          console.log(`🔄 Connection closed. Reconnecting in ${delay/1000} seconds... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(this.phoneNumber), delay);
        } else if (!shouldReconnect) {
          console.log(`❌ Logged out. Please restart the bot.`);
        } else {
          console.log(`❌ Max reconnection attempts reached. Please restart the bot.`);
        }
      }
    });

    // Handle credentials update
    this.sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type === 'notify' && this.isConnected) {
        for (const msg of messages) {
          if (msg.key.fromMe) continue;
          
          const sender = msg.key.remoteJid;
          const messageText = msg.message?.conversation || 
                            msg.message?.extendedTextMessage?.text ||
                            msg.message?.imageMessage?.caption ||
                            '';
          
          if (messageText) {
            await messageHandler.handleMessage(this.sock, sender, messageText, msg);
          }
        }
      }
    });

    // Wait a bit before requesting pairing code
    await this.wait(3000);
    
    console.log(`\n📱 Requesting pairing code for ${this.phoneNumber}...`);
    
    try {
      const code = await this.sock.requestPairingCode(this.phoneNumber);
      console.log(`\n🔑 Your pairing code is: ${code}`);
      console.log(`\n📝 Instructions:`);
      console.log(`   1. Open WhatsApp on your phone`);
      console.log(`   2. Go to Settings > Linked Devices`);
      console.log(`   3. Tap "Link a Device"`);
      console.log(`   4. Tap "Link with Phone Number" instead of QR code`);
      console.log(`   5. Enter this code: ${code}`);
      console.log(`\n⏰ This code expires in 5 minutes.\n`);
      console.log(`💡 If the code doesn't work, try:\n   - Make sure WhatsApp is updated\n   - Check your internet connection\n   - Try using a VPN if in a restricted region\n`);
      
      return code;
    } catch (error) {
      console.error('Failed to get pairing code:', error.message);
      console.log('\n⚠️ Troubleshooting tips:');
      console.log('   1. Make sure your phone number is correct (format: 254XXXXXXXXX)');
      console.log('   2. Check your internet connection');
      console.log('   3. Try using a VPN if WhatsApp is blocked');
      console.log('   4. Make sure you have the latest WhatsApp version');
      console.log('   5. Try again in a few minutes\n');
      throw error;
    }

    return this.sock;
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async sendTestMessage() {
    try {
      // Wait a bit for connection to stabilize
      await this.wait(3000);
      
      // Get the bot's own number
      const botNumber = this.sock.user.id.split(':')[0];
      const formattedNumber = `${botNumber}@s.whatsapp.net`;
      
      const welcomeMsg = `🤖 *TIX CULTURE WhatsApp Bot Active* 🎉\n\nYour bot is now online and ready to help you manage events and tickets!\n\nType *MENU* to see available commands.`;
      
      await this.sock.sendMessage(formattedNumber, { text: welcomeMsg });
      console.log(`📨 Test message sent to your WhatsApp number\n`);
    } catch (error) {
      console.log('Could not send test message:', error.message);
    }
  }

  formatPhoneNumber(phone) {
    // Remove any non-digit characters
    let cleaned = phone.toString().replace(/\D/g, '');
    
    // Remove leading 0 or +254
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('254')) {
      cleaned = cleaned;
    } else if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    } else if (cleaned.length === 9) {
      cleaned = '254' + cleaned;
    }
    
    return cleaned;
  }

  async disconnect() {
    if (this.sock) {
      await this.sock.logout();
      this.isConnected = false;
      console.log('Disconnected from WhatsApp');
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      phoneNumber: this.phoneNumber,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

module.exports = WhatsAppPairingClient;