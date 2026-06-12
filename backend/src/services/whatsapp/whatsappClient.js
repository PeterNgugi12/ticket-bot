const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const messageHandler = require('./whatsappHandler');
const MessageFormatter = require('../../whatsapp/utils/messageFormatter');

class WhatsAppClient {
  constructor() {
    this.sock = null;
    this.isConnected = false;
    this.initialized = false;
    this.isConnecting = false;
    this.qrCodeGenerated = false;
    // Use root sessions folder like the working bot
    this.sessionDir = path.join(process.cwd(), 'sessions');
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.logger = Pino({ level: 'info' });
    
    // Ensure session directory exists
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  async initialize(phoneNumber = null) {
    if (phoneNumber) {
      return await this.connectWithPairingCode(phoneNumber);
    }
    await this.start();
  }

  async start() {
    if (this.isConnecting) {
      console.log('Already connecting, skipping...');
      return;
    }
    
    this.isConnecting = true;
    
    try {
      const { version, isLatest } = await fetchLatestWaWebVersion();
      console.log(`Using WhatsApp Web version: ${version.join('.')} (Latest: ${isLatest})`);
      
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
      
      this.sock = makeWASocket({
        auth: state,
        browser: ['TIX CULTURE', 'Chrome', '120.0.0.0'],
        version: version,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        printQRInTerminal: false,
      });
      
      this.sock.ev.on('creds.update', saveCreds);
      
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !this.qrCodeGenerated) {
          this.qrCodeGenerated = true;
          console.log('\n' + '═'.repeat(60));
          console.log('📱 SCAN THIS QR CODE WITH WHATSAPP');
          console.log('═'.repeat(60));
          
          // Generate smaller QR for terminal
          const smallQR = await QRCode.toString(qr, { type: 'terminal', small: true });
          console.log(smallQR);
          
          // Also save as image
          const qrImagePath = path.join(process.cwd(), 'qr-code.png');
          await QRCode.toFile(qrImagePath, qr, { 
            width: 300, 
            margin: 1,
            color: {
              dark: '#000000',
              light: '#ffffff'
            }
          });
          console.log(`\n📱 QR Code also saved as: ${qrImagePath}`);
          console.log('📱 Open this file with any image viewer to scan\n');
          
          console.log('💡 INSTRUCTIONS:');
          console.log('   1. Open WhatsApp on your phone');
          console.log('   2. Go to Settings → Linked Devices');
          console.log('   3. Tap "Link a Device"');
          console.log('   4. Scan the QR code from the terminal or qr-code.png file');
          console.log('═'.repeat(60) + '\n');
        }
        
        if (connection === 'open') {
          console.log('\n' + '🎉'.repeat(30));
          console.log('✅ WHATSAPP BOT CONNECTED SUCCESSFULLY!');
          console.log('🎉'.repeat(30));
          if (this.sock.user) {
            console.log(`🤖 Bot is ready to receive messages!`);
          }
          this.isConnected = true;
          this.initialized = true;
          this.reconnectAttempts = 0;
          this.qrCodeGenerated = false;
          this.isConnecting = false;
          this.setupMessageHandler();
          
          // Send welcome message
          setTimeout(() => this.sendWelcomeMessage(), 2000);
        }
        
        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          
          console.log(`\n❌ Connection closed. Status: ${statusCode}`);
          
          if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(10000 * Math.pow(1.5, this.reconnectAttempts), 120000);
            console.log(`🔄 Reconnecting in ${Math.floor(delay/1000)} seconds... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            this.initialized = false;
            this.qrCodeGenerated = false;
            this.isConnecting = false;
            
            setTimeout(() => this.start(), delay);
          } else if (statusCode === DisconnectReason.loggedOut) {
            console.log('📱 Session logged out. Deleting sessions and restarting...');
            if (fs.existsSync(this.sessionDir)) {
              fs.rmSync(this.sessionDir, { recursive: true, force: true });
              fs.mkdirSync(this.sessionDir, { recursive: true });
            }
            this.isConnecting = false;
            setTimeout(() => this.start(), 5000);
          } else {
            console.log('❌ Max reconnection attempts reached. Please restart the bot manually.');
            this.isConnecting = false;
          }
        }
      });
      
      this.sock.ev.on('error', (error) => {
        console.error('WhatsApp socket error:', error);
      });
      
    } catch (error) {
      console.error('❌ Error initializing WhatsApp bot:', error);
      this.isConnecting = false;
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = 10000;
        console.log(`🔄 Retrying initialization in ${delay/1000} seconds... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        setTimeout(() => this.start(), delay);
      }
    }
  }

  async connectWithPairingCode(phoneNumber) {
    try {
      console.log('\n🔐 Setting up pairing code authentication...');
      console.log(`📱 Phone number: ${phoneNumber}\n`);
      
      // Clear sessions first
      if (fs.existsSync(this.sessionDir)) {
        fs.rmSync(this.sessionDir, { recursive: true, force: true });
        fs.mkdirSync(this.sessionDir, { recursive: true });
        console.log('🗑️ Cleared sessions directory');
      }
      
      const { version } = await fetchLatestWaWebVersion();
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
      
      this.sock = makeWASocket({
        auth: state,
        browser: ['TIX CULTURE', 'Chrome', '120.0.0.0'],
        version: version,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        printQRInTerminal: false,
      });

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
          this.isConnected = true;
          this.initialized = true;
          this.reconnectAttempts = 0;
          console.log('\n✅ WhatsApp Bot Connected Successfully!');
          console.log('💬 Your bot is now ready to receive messages!\n');
          this.setupMessageHandler();
          setTimeout(() => this.sendWelcomeMessage(), 2000);
        } else if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          console.log('Connection closed with status:', statusCode);
          
          if (statusCode !== DisconnectReason.loggedOut && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(5000 * this.reconnectAttempts, 30000);
            console.log(`Reconnecting in ${delay/1000} seconds... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => this.connectWithPairingCode(phoneNumber), delay);
          }
        }
      });

      this.sock.ev.on('creds.update', saveCreds);
      
      console.log('⏳ Requesting pairing code from WhatsApp...');
      const code = await this.sock.requestPairingCode(phoneNumber);
      
      console.log('\n' + '═'.repeat(60));
      console.log(`🔐 YOUR PAIRING CODE: ${code}`);
      console.log('═'.repeat(60));
      console.log('\n📱 INSTRUCTIONS:');
      console.log('   1. Open WhatsApp on your phone');
      console.log('   2. Go to Settings → Linked Devices');
      console.log('   3. Tap "Link a Device"');
      console.log('   4. Tap "Link with Phone Number"');
      console.log('   5. Enter this code when prompted');
      console.log('   6. Wait for connection...');
      console.log('═'.repeat(60) + '\n');
      
    } catch (error) {
      console.error('\n❌ Pairing code error:', error.message);
    }
  }

  setupMessageHandler() {
    console.log('📱 Message handler is active');
    console.log('👂 Listening for incoming messages...\n');
    
    this.sock.ev.on('messages.upsert', async (messageUpdate) => {
      try {
        const m = messageUpdate.messages[0];
        if (!m.message || m.key.fromMe) return;
        
        const sender = m.key.remoteJid;
        
        // IGNORE GROUP MESSAGES AND BROADCAST MESSAGES
        // Check if it's a group message (contains '@g.us')
        if (sender.includes('@g.us')) {
          console.log(`🚫 Ignoring group message from: ${sender}`);
          return;
        }
        
        // Check if it's a broadcast message
        if (sender.includes('@broadcast')) {
          console.log(`🚫 Ignoring broadcast message from: ${sender}`);
          return;
        }
        
        // Check if it's a status broadcast
        if (sender === 'status@broadcast') {
          console.log(`🚫 Ignoring status broadcast`);
          return;
        }
        
        let messageText = '';
        
        if (m.message.conversation) {
          messageText = m.message.conversation;
        } else if (m.message.extendedTextMessage) {
          messageText = m.message.extendedTextMessage.text;
        } else if (m.message.imageMessage) {
          messageText = m.message.imageMessage.caption || '';
        }
        
        if (messageText) {
          console.log(`📨 Message from ${sender}: ${messageText.substring(0, 50)}`);
          await messageHandler.handleMessage(this.sock, sender, messageText, m);
        }
      } catch (error) {
        console.error('Message handling error:', error);
      }
    });
    
    this.sock.ev.on('call', async (calls) => {
      for (const call of calls) {
        // Ignore calls from groups or broadcasts
        if (call.from.includes('@g.us') || call.from.includes('@broadcast')) {
          console.log(`🚫 Ignoring call from: ${call.from}`);
          continue;
        }
        console.log('📞 Incoming call from:', call.from);
        // Auto-reject calls with a message
        if (this.sock && this.initialized) {
          await this.sock.sendMessage(call.from, {
            text: `📞 *Call Received*\n\nWe currently support text messages only.\nPlease send us a text message for assistance.\n\nThank you! 🌟`
          });
        }
      }
    });
  }

  async sendWelcomeMessage() {
    try {
      if (this.sock && this.initialized && this.sock.user) {
        const botNumber = this.sock.user.id.split(':')[0];
        const formattedNumber = `${botNumber}@s.whatsapp.net`;
        const welcomeMessage = `🎤 *WELCOME TO TIX CULTURE* 🔥

Hey there! Welcome to the hottest event ticketing platform on WhatsApp.

What would you like to do today?

1️⃣ Trending Events 🔥
2️⃣ Secret Events 🔒
3️⃣ My Tickets 🎟️
4️⃣ VIP Club 👑
5️⃣ Help ℹ️

Type the number of your choice to get started.

*Pro tip:* Save this number to contacts for quick access! 🚀`;
        
        await this.sock.sendMessage(formattedNumber, { text: welcomeMessage });
        console.log('📨 Welcome message sent to bot owner');
      }
    } catch (error) {
      console.log('Could not send welcome message:', error.message);
    }
  }

  async sendMessage(phoneNumber, message, options = {}) {
    try {
      if (this.sock && this.initialized) {
        const formattedNumber = this.formatPhoneNumber(phoneNumber);
        const result = await this.sock.sendMessage(formattedNumber, { text: message, ...options });
        return result;
      }
      return null;
    } catch (error) {
      console.error('Failed to send message:', error);
      return null;
    }
  }

  formatPhoneNumber(phone) {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.slice(1);
    }
    if (!cleaned.startsWith('254')) {
      cleaned = '254' + cleaned;
    }
    return `${cleaned}@s.whatsapp.net`;
  }

  async disconnect() {
    if (this.sock) {
      await this.sock.end();
      this.isConnected = false;
      this.initialized = false;
      console.log('📴 WhatsApp Bot disconnected');
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      initialized: this.initialized,
    };
  }
}

const whatsappClient = new WhatsAppClient();
module.exports = whatsappClient;