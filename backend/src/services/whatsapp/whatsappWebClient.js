const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCodeTerminal = require('qrcode-terminal');
const messageHandler = require('./whatsappHandler');
const MessageFormatter = require('../../whatsapp/utils/messageFormatter');

class WhatsAppWebClient {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.phoneNumber = null;
  }

  async connect() {
    console.log('\n🤖 Initializing WhatsApp Web Client...\n');

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: './src/whatsapp/sessions/web'
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      }
    });

    // Handle QR code
    this.client.on('qr', (qr) => {
      console.log('\n📱 QR Code received! Scan this QR code with WhatsApp:\n');
      QRCodeTerminal.generate(qr, { small: true });
      console.log('\n⏰ QR code expires in 60 seconds...\n');
      console.log('📝 Instructions:');
      console.log('   1. Open WhatsApp on your phone');
      console.log('   2. Go to Settings > Linked Devices');
      console.log('   3. Tap "Link a Device"');
      console.log('   4. Scan this QR code\n');
    });

    // Handle ready event
    this.client.on('ready', () => {
      this.isReady = true;
      console.log('\n✅ WhatsApp client is ready!\n');
      console.log('🎉 Bot is now online and ready to receive messages!\n');
      this.sendReadyMessage();
    });

    // Handle authentication failure
    this.client.on('auth_failure', (msg) => {
      console.error('\n❌ Authentication failed:', msg);
      console.log('Please restart the bot and scan the QR code again.\n');
    });

    // Handle disconnection
    this.client.on('disconnected', (reason) => {
      this.isReady = false;
      console.log('\n⚠️ WhatsApp client disconnected:', reason);
      console.log('Restarting in 5 seconds...\n');
      setTimeout(() => this.connect(), 5000);
    });

    // Handle incoming messages
    this.client.on('message', async (message) => {
      if (message.fromMe) return;
      
      const sender = message.from;
      const messageText = message.body;
      const hasMedia = message.hasMedia;
      
      if (messageText) {
        await messageHandler.handleMessage(this.client, sender, messageText, message);
      }
      
      if (hasMedia) {
        try {
          const media = await message.downloadMedia();
          await messageHandler.handleImageMessage(this.client, sender, media, message);
        } catch (error) {
          console.error('Failed to download media:', error);
        }
      }
    });

    // Initialize client
    await this.client.initialize();
    
    return this.client;
  }

  async sendReadyMessage() {
    try {
      // Get client info
      const info = this.client.info;
      if (info && info.wid) {
        const welcomeMsg = `🤖 *TIX CULTURE WhatsApp Bot Active* 🎉\n\nYour bot is now online and ready to help you manage events and tickets!\n\nType *MENU* to see available commands.`;
        
        await this.client.sendMessage(info.wid._serialized, welcomeMsg);
        console.log('📨 Welcome message sent to your WhatsApp\n');
      }
    } catch (error) {
      console.log('Could not send welcome message:', error.message);
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.destroy();
      this.isReady = false;
      console.log('Disconnected from WhatsApp');
    }
  }

  getStatus() {
    return {
      connected: this.isReady,
      info: this.client?.info,
    };
  }
}

module.exports = WhatsAppWebClient;