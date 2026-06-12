const MessageFormatter = require('../../whatsapp/utils/messageFormatter');
const menuBuilder = require('../../whatsapp/utils/menuBuilder');
const sceneManager = require('./whatsappScenes');
const WhatsAppSessionModel = require('../../models/WhatsAppSessionModel');
const cacheManager = require('../../cache/cacheManager');
const { CACHE_KEYS, CACHE_TTL } = require('../../cache/cacheKeys');
const UserModel = require('../../models/UserModel');
const EventModel = require('../../models/EventModel');
const TicketModel = require('../../models/TicketModel');
const sessionService = require('../sessionService');
const axios = require('axios');
const crypto = require('crypto');
const QRCode = require('qrcode');

class WhatsAppMessageHandler {
  constructor() {
    this.userStates = new Map();
    this.rateLimits = new Map();
    this.paymentCheckCount = {};
    this.registerMenus();
    this.registerScenes();
    this.accessToken = null;
  }

  registerMenus() {
    menuBuilder.registerMenu('main', menuBuilder.createMainMenu());
    menuBuilder.registerMenu('trending', menuBuilder.createTrendingMenu());
    menuBuilder.registerMenu('event_details', menuBuilder.createEventDetailsMenu());
    menuBuilder.registerMenu('ticket_quantity', menuBuilder.createTicketQuantityMenu());
    menuBuilder.registerMenu('attendee_name', this.createAttendeeNameMenu());
    menuBuilder.registerMenu('attendee_email', this.createAttendeeEmailMenu());
    menuBuilder.registerMenu('attendee_phone', this.createAttendeePhoneMenu());
    menuBuilder.registerMenu('payment_confirmation', menuBuilder.createPaymentConfirmationMenu());
    menuBuilder.registerMenu('mpesa_payment', menuBuilder.createMpesaPaymentMenu());
    menuBuilder.registerMenu('payment_result', menuBuilder.createPaymentResultMenu());
    menuBuilder.registerMenu('my_tickets', menuBuilder.createMyTicketsMenu());
    menuBuilder.registerMenu('ticket_details', menuBuilder.createTicketDetailsMenu());
    menuBuilder.registerMenu('organizer_login', menuBuilder.createOrganizerLoginMenu());
    menuBuilder.registerMenu('organizer_dashboard', menuBuilder.createOrganizerDashboardMenu());
    menuBuilder.registerMenu('scan_ticket', menuBuilder.createScanTicketMenu());
    menuBuilder.registerMenu('scan_result', menuBuilder.createScanResultMenu());
    menuBuilder.registerMenu('wallet', menuBuilder.createWalletMenu());
    menuBuilder.registerMenu('help', menuBuilder.createHelpMenu());
    menuBuilder.registerMenu('vip_club', menuBuilder.createVipClubMenu());
    menuBuilder.registerMenu('secret_events', menuBuilder.createSecretEventsMenu());
  }

  createAttendeeNameMenu() {
    return {
      text: `📝 *Attendee Full Name*\n\nPlease enter the attendee's full name:\n\nExample: *John Doe*\n\nType *cancel* to cancel purchase.`,
    };
  }

  createAttendeeEmailMenu() {
    return {
      text: `📧 *Attendee Email Address*\n\nPlease enter the attendee's email address:\n\nExample: *john@example.com*\n\nType *back* to go back or *cancel* to cancel.`,
    };
  }

  createAttendeePhoneMenu() {
    return {
      text: `📱 *Attendee Phone Number*\n\nPlease enter the attendee's phone number (Kenyan number):\n\nExamples:\n• *0712345678*\n• *254712345678*\n\nType *back* to go back or *cancel* to cancel.`,
    };
  }

  registerScenes() {
    sceneManager.registerScene('purchase', sceneManager.createPurchaseScene());
    sceneManager.registerScene('resale', sceneManager.createResaleScene());
  }

  isGroupOrBroadcast(sender) {
    return sender.includes('@g.us') || sender === 'status@broadcast';
  }

  async handleMessage(sock, sender, message, rawMessage) {
    if (this.isGroupOrBroadcast(sender)) {
      console.log(`⏭️ Ignoring ${sender.includes('@g.us') ? 'group' : 'broadcast'} message`);
      return;
    }
    
    const phoneNumber = sender.split('@')[0];
    console.log(`📱 Processing message from ${phoneNumber}: "${message}"`);
    
    try {
      const isRateLimited = await this.checkRateLimit(phoneNumber);
      if (isRateLimited) {
        await sock.sendMessage(sender, {
          text: '⏰ *Rate Limit Exceeded*\n\nPlease wait a moment before sending more messages.',
        });
        return;
      }
      
      let user = await UserModel.findByPhone(phoneNumber);
      if (!user) {
        console.log(`👤 Auto-registering new user: ${phoneNumber}`);
        user = await UserModel.createUser({
          phoneNumber,
          fullName: `User_${phoneNumber.slice(-6)}`,
          role: 'user',
        });
      }
      
      await WhatsAppSessionModel.updateLastMessage(phoneNumber);
      let userState = await this.getUserState(phoneNumber);
      
      await sock.sendPresenceUpdate('composing', sender);
      let response = await this.processMenuNavigation(phoneNumber, message, userState.currentMenu || 'main', userState.context || {}, user, sock, sender);
      await sock.sendPresenceUpdate('paused', sender);
      
      if (response) {
        if (response.mediaUrl) {
          console.log(`📤 Sending media to ${phoneNumber}: ${response.mediaUrl}`);
          try {
            const imageResponse = await axios.get(response.mediaUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(imageResponse.data);
            await sock.sendMessage(sender, {
              image: imageBuffer,
              caption: response.text,
            });
          } catch (mediaError) {
            console.error('Failed to send media:', mediaError);
            await sock.sendMessage(sender, { text: response.text });
          }
        } else if (response.text) {
          console.log(`📤 Sending text to ${phoneNumber}`);
          await sock.sendMessage(sender, { text: response.text });
        }
        
        if (response.newState) {
          await this.updateUserState(phoneNumber, response.newState);
        }
      }
      
    } catch (error) {
      console.error('Error handling message:', error);
      await sock.sendMessage(sender, {
        text: '❌ *Oops! Something went wrong*\n\nPlease try again later.',
      });
    }
  }

  async initiateMpesaPayment(phoneNumber, amount, accountReference, metadata) {
    try {
      console.log(`💰 Initiating payment for: ${phoneNumber}, amount: ${amount}`);
      
      let formattedPhone = phoneNumber.toString().replace(/\D/g, '');
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '254' + formattedPhone.substring(1);
      }
      if (!formattedPhone.startsWith('254')) {
        formattedPhone = '254' + formattedPhone;
      }
      
      console.log(`📱 Sending STK push to: ${formattedPhone}`);
      
      const response = await axios.post('http://localhost:3000/api/v1/mpesa/whatsapp/initiate', {
        phoneNumber: formattedPhone,
        amount: amount,
        accountReference: accountReference || `TIX-${Date.now()}`,
        transactionDesc: `Ticket Purchase - ${metadata.eventTitle}`,
        metadata: {
          eventId: metadata.eventId,
          eventTitle: metadata.eventTitle,
          tierId: metadata.tierId,
          quantity: metadata.quantity,
          attendeeName: metadata.attendeeName,
          attendeeEmail: metadata.attendeeEmail,
          userId: metadata.userId,
          source: 'whatsapp'
        }
      }, {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`✅ STK Push initiated successfully to ${formattedPhone}`);
      return response.data;
      
    } catch (error) {
      console.error('M-Pesa initiation error:', error.response?.data || error.message);
      
      if (process.env.NODE_ENV !== 'production') {
        let mockPhone = phoneNumber.toString().replace(/\D/g, '');
        if (mockPhone.startsWith('0')) mockPhone = '254' + mockPhone.substring(1);
        if (!mockPhone.startsWith('254')) mockPhone = '254' + mockPhone;
        
        console.log('Using mock payment response for development');
        return {
          success: true,
          mock: true,
          data: {
            checkoutRequestID: `MOCK_${Date.now()}`,
            merchantRequestID: `MOCK_MERCHANT_${Date.now()}`,
            responseCode: '0',
            responseDescription: 'Success',
            customerMessage: `STK Push sent to ${mockPhone}`
          },
          message: 'Payment initiated (mock mode)'
        };
      }
      
      return { 
        success: false, 
        error: error.response?.data?.message || error.message || 'Payment initiation failed' 
      };
    }
  }

  async checkPaymentStatus(checkoutRequestID) {
    if (checkoutRequestID && checkoutRequestID.startsWith('MOCK_')) {
      console.log(`🎭 MOCK PAYMENT: Auto-completing mock payment ${checkoutRequestID}`);
      
      this.paymentCheckCount[checkoutRequestID] = (this.paymentCheckCount[checkoutRequestID] || 0) + 1;
      
      if (this.paymentCheckCount[checkoutRequestID] >= 2) {
        delete this.paymentCheckCount[checkoutRequestID];
        return { 
          success: true, 
          status: 'completed', 
          transactionId: `MOCK_TXN_${Date.now()}`
        };
      }
      
      return { success: true, status: 'pending' };
    }
    
    try {
      console.log(`📱 Checking payment status for: ${checkoutRequestID}`);
      
      const response = await axios.get(`http://localhost:3000/api/v1/mpesa/whatsapp/transaction/${checkoutRequestID}`, {
        timeout: 10000,
      });
      
      const data = response.data;
      console.log(`📊 Payment status response:`, data);
      
      if (data.success && data.data?.resultCode === '0') {
        return { success: true, status: 'completed', transactionId: data.data.mpesaReceiptNumber };
      } else if (data.success && data.data?.resultCode === '1037') {
        return { success: false, status: 'failed', error: 'Transaction cancelled by user' };
      } else if (data.success) {
        return { success: true, status: 'pending' };
      } else {
        return { success: false, error: data.message || 'Payment pending' };
      }
    } catch (error) {
      console.error('Check payment status error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      return { success: false, error: error.message };
    }
  }

  async createTicketsAfterPayment(paymentResult, context, user) {
  try {
    console.log(`🎫 Creating tickets for user: ${user.id}, event: ${context.selectedEvent.title}`);
    
    const { selectedEvent, selectedTier, quantity, attendeeDetails } = context;
    
    const tickets = [];
    
    for (let i = 0; i < quantity; i++) {
      const ticketNumber = `TIX_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
      
      const qrCodeData = {
        ticketId: ticketNumber,
        eventId: selectedEvent.id,
        eventTitle: selectedEvent.title,
        attendeeName: attendeeDetails.fullName,
        attendeeEmail: attendeeDetails.email,
        tierName: selectedTier.name,
        price: selectedTier.price,
        purchaseDate: new Date().toISOString(),
        qrSecret: crypto.randomBytes(32).toString('hex')
      };
      
      const qrCodeBase64 = await QRCode.toDataURL(JSON.stringify(qrCodeData));
      
      // FIX: Use the correct field names that match your TicketModel
      const ticket = await TicketModel.createTicket({
        eventId: selectedEvent.id,
        tierId: selectedTier.id,
        userId: user.id,
        attendeeName: attendeeDetails.fullName,
        attendeeEmail: attendeeDetails.email,
        attendeePhone: attendeeDetails.phone,
        quantity: 1,
        purchasePrice: selectedTier.price,  // Changed from 'price' to 'purchasePrice'
        // Also pass these if your model expects them
        ticketNumber: ticketNumber,
        qrCode: qrCodeBase64,
        qrSecret: qrCodeData.qrSecret,
        status: 'valid'
      });
      
      tickets.push(ticket);
    }
    
    console.log(`✅ Created ${tickets.length} tickets successfully`);
    return { success: true, tickets };
    
  } catch (error) {
    console.error('Error creating tickets:', error);
    return { success: false, error: error.message };
  }
}

  async processMenuNavigation(phoneNumber, message, currentMenu, context, user, sock, sender) {
    const cmd = message.toLowerCase().trim();
    
    if (cmd === 'cancel') {
      const menu = await menuBuilder.buildMenu('main', this.getBaseContext(user));
      return {
        text: `❌ *Operation cancelled*\n\n${menu.text}`,
        newState: { currentMenu: 'main', context: { userId: user.id } },
      };
    }
    
    if (cmd === 'back') {
      if (currentMenu === 'attendee_email') {
        const menu = this.createAttendeeNameMenu();
        return {
          text: menu.text,
          newState: { currentMenu: 'attendee_name', context: { ...context, userId: user.id } },
        };
      }
      if (currentMenu === 'attendee_phone') {
        const menu = this.createAttendeeEmailMenu();
        return {
          text: menu.text,
          newState: { currentMenu: 'attendee_email', context: { ...context, userId: user.id } },
        };
      }
      
      const parentMenu = this.getParentMenu(currentMenu);
      const menu = await menuBuilder.buildMenu(parentMenu, this.getBaseContext(user));
      return {
        text: menu.text,
        newState: { currentMenu: parentMenu, context: { userId: user.id } },
      };
    }
    
    if (cmd === 'debug') {
      try {
        const events = await EventModel.getTrendingEvents();
        const debugMsg = `📊 *Debug Info*\n\nTrending Events Count: ${events.length}\n\nEvents:\n${events.map(e => `• ${e.title}\n  Date: ${new Date(e.event_date).toLocaleDateString()}\n  Status: ${e.status}\n  Tickets: ${e.tickets_remaining || 0} left`).join('\n\n') || 'No events found'}`;
        return {
          text: debugMsg,
          newState: { currentMenu: 'main', context: { userId: user.id } },
        };
      } catch (error) {
        return {
          text: `Debug error: ${error.message}`,
          newState: { currentMenu: 'main', context: { userId: user.id } },
        };
      }
    }
    
    if (cmd === 'menu' || cmd === 'start' || cmd === 'hi' || cmd === 'hello') {
      const menu = await menuBuilder.buildMenu('main', this.getBaseContext(user));
      return {
        text: menu.text,
        newState: { currentMenu: 'main', context: { userId: user.id } },
      };
    }
    
    const selection = parseInt(message);
    if (!isNaN(selection) && selection > 0 && selection < 10) {
      
      if (currentMenu === 'main') {
        const menuOptions = {
          1: 'trending',
          2: 'secret_events',
          3: 'my_tickets',
          4: 'vip_club',
          5: 'organizer_login',
          6: 'wallet',
          7: 'help',
        };
        
        const nextMenu = menuOptions[selection];
        if (nextMenu) {
          try {
            const menu = await menuBuilder.buildMenu(nextMenu, this.getBaseContext(user));
            return {
              text: menu.text,
              newState: { currentMenu: nextMenu, context: { userId: user.id } },
            };
          } catch (error) {
            console.error(`Error building menu ${nextMenu}:`, error);
            const mainMenu = await menuBuilder.buildMenu('main', this.getBaseContext(user));
            const comingSoonMessages = {
              2: '🔒 *Secret Events Coming Soon!*\n\nSecret events will be available once you attend 3+ events or get VIP status.',
              4: '👑 *VIP Club Coming Soon!*\n\nVIP benefits will be available soon. Stay tuned!',
              6: '💰 *Wallet Coming Soon!*\n\nWallet functionality will be available in the next update.',
            };
            const message = comingSoonMessages[selection] || '❌ This feature is coming soon!';
            return {
              text: `${message}\n\n${mainMenu.text}`,
              newState: { currentMenu: 'main', context: { userId: user.id } },
            };
          }
        }
      }
      
      if (currentMenu === 'trending') {
        try {
          console.log('Fetching trending events...');
          const events = await EventModel.getTrendingEvents();
          console.log(`Found ${events.length} trending events`);
          
          if (events.length === 0) {
            const mainMenu = await menuBuilder.buildMenu('main', this.getBaseContext(user));
            return {
              text: `🔥 *NO TRENDING EVENTS*\n\nCheck back later for upcoming events!\n\n${mainMenu.text}`,
              newState: { currentMenu: 'main', context: { userId: user.id } },
            };
          }
          
          const selectedEvent = events[selection - 1];
          if (selectedEvent) {
            const menuResult = await menuBuilder.buildMenu('event_details', {
              ...this.getBaseContext(user),
              selectedEvent,
            });
            
            return {
              text: menuResult.text,
              mediaUrl: menuResult.mediaUrl || null,
              newState: { currentMenu: 'event_details', context: { ...context, selectedEvent, userId: user.id } },
            };
          } else {
            const trendingMenu = await menuBuilder.buildMenu('trending', this.getBaseContext(user));
            return {
              text: `❌ *Invalid selection*\n\nPlease select a number between 1 and ${events.length}.\n\n${trendingMenu.text}`,
              newState: { currentMenu: 'trending', context: { userId: user.id } },
            };
          }
        } catch (error) {
          console.error('Error in trending selection:', error);
          const mainMenu = await menuBuilder.buildMenu('main', this.getBaseContext(user));
          return {
            text: `❌ *Error loading events*\n\n${error.message}\n\n${mainMenu.text}`,
            newState: { currentMenu: 'main', context: { userId: user.id } },
          };
        }
      }
      
      if (currentMenu === 'my_tickets') {
        try {
          const tickets = await TicketModel.getUserTickets(user.id);
          console.log(`📋 Found ${tickets.length} tickets for user ${user.id}`);
          
          if (!tickets || tickets.length === 0) {
            const mainMenu = await menuBuilder.buildMenu('main', this.getBaseContext(user));
            return {
              text: `📭 *NO TICKETS YET*\n\nYou haven't purchased any tickets yet.\n\nSelect *1* from the main menu to browse events and buy tickets!\n\n${mainMenu.text}`,
              newState: { currentMenu: 'main', context: { userId: user.id } },
            };
          }
          
          const selectedTicket = tickets[selection - 1];
          if (selectedTicket) {
            const menu = await menuBuilder.buildMenu('ticket_details', {
              ...this.getBaseContext(user),
              selectedTicket,
            });
            
            if (selectedTicket.qr_code) {
              await sock.sendMessage(sender, {
                image: { url: selectedTicket.qr_code },
                caption: `🎫 *Your Ticket*\n\nEvent: ${selectedTicket.event_title}\nAttendee: ${selectedTicket.attendee_name}\nTicket ID: ${selectedTicket.ticket_number}`
              });
            }
            
            return {
              text: menu.text,
              newState: { currentMenu: 'ticket_details', context: { ...context, selectedTicket, userId: user.id } },
            };
          } else {
            let ticketList = `🎟️ *YOUR TICKETS* (${tickets.length})\n\n`;
            for (let i = 0; i < tickets.length; i++) {
              const t = tickets[i];
              ticketList += `${i + 1}. ${t.event_title}\n`;
              ticketList += `   📅 ${new Date(t.event_date).toLocaleDateString()}\n`;
              ticketList += `   👤 ${t.attendee_name}\n`;
              ticketList += `   🎫 ${t.ticket_number}\n\n`;
            }
            ticketList += `Reply with ticket number to view details.`;
            
            return {
              text: ticketList,
              newState: { currentMenu: 'my_tickets', context: { ...context, userId: user.id } },
            };
          }
        } catch (error) {
          console.error('Error fetching tickets:', error);
          const mainMenu = await menuBuilder.buildMenu('main', this.getBaseContext(user));
          return {
            text: `❌ *Error loading tickets*\n\n${error.message}\n\n${mainMenu.text}`,
            newState: { currentMenu: 'main', context: { userId: user.id } },
          };
        }
      }
      
      if (currentMenu === 'event_details') {
        const selectedEvent = context.selectedEvent;
        if (!selectedEvent) {
          const menu = await menuBuilder.buildMenu('main', this.getBaseContext(user));
          return {
            text: `❌ Event not found. Please try again.\n\n${menu.text}`,
            newState: { currentMenu: 'main', context: { userId: user.id } },
          };
        }
        
        const tiers = selectedEvent.ticket_tiers || [];
        const selectedTierIndex = selection - 1;
        
        if (selectedTierIndex >= 0 && selectedTierIndex < tiers.length) {
          const selectedTier = tiers[selectedTierIndex];
          
          context.selectedTier = selectedTier;
          context.selectedTierIndex = selectedTierIndex;
          
          const menu = await menuBuilder.buildMenu('ticket_quantity', {
            ...this.getBaseContext(user),
            selectedEvent,
            selectedTier,
          });
          
          return {
            text: menu.text,
            newState: { 
              currentMenu: 'ticket_quantity', 
              context: { ...context, selectedTier, selectedTierIndex, userId: user.id } 
            },
          };
        } else {
          const menu = await menuBuilder.buildMenu('event_details', {
            ...this.getBaseContext(user),
            selectedEvent,
          });
          return {
            text: `❌ *Invalid selection*\n\nPlease select a valid tier number (1-${tiers.length}).\n\n${menu.text}`,
            newState: { currentMenu: 'event_details', context: { ...context, userId: user.id } },
          };
        }
      }
      
      if (currentMenu === 'ticket_quantity') {
        const quantity = selection;
        const tier = context.selectedTier;
        
        if (isNaN(quantity) || quantity < 1) {
          const menu = await menuBuilder.buildMenu('ticket_quantity', {
            ...this.getBaseContext(user),
            selectedEvent: context.selectedEvent,
            selectedTier: tier,
          });
          return {
            text: `❌ *Invalid quantity*\n\nPlease enter a valid number (1 or more).\n\n${menu.text}`,
            newState: { currentMenu: 'ticket_quantity', context: { ...context, userId: user.id } },
          };
        }
        
        if (quantity > (tier.max_per_person || 10)) {
          const menu = await menuBuilder.buildMenu('ticket_quantity', {
            ...this.getBaseContext(user),
            selectedEvent: context.selectedEvent,
            selectedTier: tier,
          });
          return {
            text: `❌ *Maximum ${tier.max_per_person || 10} tickets per person*\n\nPlease enter a smaller quantity.\n\n${menu.text}`,
            newState: { currentMenu: 'ticket_quantity', context: { ...context, userId: user.id } },
          };
        }
        
        if (quantity > (tier.remaining_count || 0)) {
          const menu = await menuBuilder.buildMenu('ticket_quantity', {
            ...this.getBaseContext(user),
            selectedEvent: context.selectedEvent,
            selectedTier: tier,
          });
          return {
            text: `❌ *Only ${tier.remaining_count} tickets available*\n\nPlease enter a smaller quantity.\n\n${menu.text}`,
            newState: { currentMenu: 'ticket_quantity', context: { ...context, userId: user.id } },
          };
        }
        
        context.quantity = quantity;
        
        const menu = this.createAttendeeNameMenu();
        return {
          text: menu.text,
          newState: { 
            currentMenu: 'attendee_name', 
            context: { ...context, quantity, userId: user.id } 
          },
        };
      }
    }
    
    if (currentMenu === 'attendee_name') {
      if (!message || message.trim().length < 2) {
        const menu = this.createAttendeeNameMenu();
        return {
          text: `❌ *Invalid name*\n\nPlease enter a valid name (at least 2 characters).\n\n${menu.text}`,
          newState: { currentMenu: 'attendee_name', context: { ...context, userId: user.id } },
        };
      }
      
      context.attendeeName = message.trim();
      
      const menu = this.createAttendeeEmailMenu();
      return {
        text: menu.text,
        newState: { 
          currentMenu: 'attendee_email', 
          context: { ...context, userId: user.id } 
        },
      };
    }
    
    if (currentMenu === 'attendee_email') {
      const email = message.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (!emailRegex.test(email)) {
        const menu = this.createAttendeeEmailMenu();
        return {
          text: `❌ *Invalid email address*\n\nPlease enter a valid email address.\n\n${menu.text}`,
          newState: { currentMenu: 'attendee_email', context: { ...context, userId: user.id } },
        };
      }
      
      context.attendeeEmail = email;
      
      const menu = this.createAttendeePhoneMenu();
      return {
        text: menu.text,
        newState: { 
          currentMenu: 'attendee_phone', 
          context: { ...context, userId: user.id } 
        },
      };
    }
    
    if (currentMenu === 'attendee_phone') {
      let phone = message.trim().replace(/\s/g, '');
      
      if (!phone.startsWith('+') && !phone.startsWith('254') && !phone.startsWith('0')) {
        phone = '0' + phone;
      }
      
      const phoneRegex = /^\+?254[0-9]{9}$|^0[0-9]{9}$/;
      if (!phoneRegex.test(phone)) {
        const menu = this.createAttendeePhoneMenu();
        return {
          text: `❌ *Invalid phone number*\n\nPlease enter a valid Kenyan phone number (e.g., 254712345678 or 0712345678).\n\n${menu.text}`,
          newState: { currentMenu: 'attendee_phone', context: { ...context, userId: user.id } },
        };
      }
      
      context.attendeeDetails = {
        fullName: context.attendeeName,
        email: context.attendeeEmail,
        phone: phone
      };
      
      const totalPrice = context.selectedTier.price * context.quantity;
      context.totalPrice = totalPrice;
      
      const menu = await menuBuilder.buildMenu('payment_confirmation', {
        ...this.getBaseContext(user),
        selectedEvent: context.selectedEvent,
        selectedTier: context.selectedTier,
        quantity: context.quantity,
        attendeeDetails: context.attendeeDetails,
        totalPrice,
      });
      
      return {
        text: menu.text,
        newState: { 
          currentMenu: 'payment_confirmation', 
          context: { ...context, attendeeDetails: context.attendeeDetails, totalPrice, userId: user.id } 
        },
      };
    }
    
    if (currentMenu === 'payment_confirmation') {
      const response = message.toUpperCase().trim();
      
      if (response === 'PAY') {
        await sock.sendMessage(sender, { 
          text: '⏳ *Processing Payment*\n\nInitiating M-Pesa STK Push... Please wait.\n\nCheck your phone for the M-Pesa prompt.' 
        });
        
        console.log(`📱 Sending STK push to attendee: ${context.attendeeDetails.phone}`);
        
        const paymentResult = await this.initiateMpesaPayment(
          context.attendeeDetails.phone,
          context.totalPrice,
          `TIX-${Date.now()}`,
          {
            eventId: context.selectedEvent.id,
            eventTitle: context.selectedEvent.title,
            tierId: context.selectedTier.id,
            quantity: context.quantity,
            attendeeName: context.attendeeDetails.fullName,
            attendeeEmail: context.attendeeDetails.email,
            userId: user.id,
          }
        );
        
        if (paymentResult.success) {
          context.checkoutRequestID = paymentResult.data?.checkoutRequestID;
          context.paymentInitiated = true;
          
          const menu = await menuBuilder.buildMenu('mpesa_payment', {
            ...this.getBaseContext(user),
            selectedEvent: context.selectedEvent,
            selectedTier: context.selectedTier,
            quantity: context.quantity,
            attendeeDetails: context.attendeeDetails,
            totalPrice: context.totalPrice,
            checkoutRequestID: context.checkoutRequestID,
          });
          
          const mockNotice = paymentResult.mock ? '\n\n⚠️ *MOCK MODE*: Payment simulation only.' : '';
          
          return {
            text: `✅ *STK Push Sent!*\n\nCheck your phone (${context.attendeeDetails.phone}) and enter your M-Pesa PIN to complete the payment.${mockNotice}\n\n${menu.text}`,
            newState: { 
              currentMenu: 'mpesa_payment', 
              context: { ...context, userId: user.id, paymentInitiated: true } 
            },
          };
        } else {
          const menu = await menuBuilder.buildMenu('payment_confirmation', {
            ...this.getBaseContext(user),
            selectedEvent: context.selectedEvent,
            selectedTier: context.selectedTier,
            quantity: context.quantity,
            attendeeDetails: context.attendeeDetails,
            totalPrice: context.totalPrice,
          });
          
          return {
            text: `❌ *Payment Failed*\n\nCould not initiate M-Pesa payment: ${paymentResult.error || 'Unknown error'}\n\nPlease try again.\n\n${menu.text}`,
            newState: { currentMenu: 'payment_confirmation', context: { ...context, userId: user.id } },
          };
        }
      } else if (response === 'CANCEL') {
        const menu = await menuBuilder.buildMenu('main', this.getBaseContext(user));
        return {
          text: `❌ *Purchase cancelled*\n\n${menu.text}`,
          newState: { currentMenu: 'main', context: { userId: user.id } },
        };
      } else {
        const menu = await menuBuilder.buildMenu('payment_confirmation', {
          ...this.getBaseContext(user),
          selectedEvent: context.selectedEvent,
          selectedTier: context.selectedTier,
          quantity: context.quantity,
          attendeeDetails: context.attendeeDetails,
          totalPrice: context.totalPrice,
        });
        return {
          text: `❌ *Invalid option*\n\nPlease reply with PAY or CANCEL.\n\n${menu.text}`,
          newState: { currentMenu: 'payment_confirmation', context: { ...context, userId: user.id } },
        };
      }
    }
    
    if (currentMenu === 'mpesa_payment') {
      const response = message.toUpperCase().trim();
      
      if (response === 'CHECK') {
        await sock.sendMessage(sender, { text: '⏳ Checking payment status...' });
        
        const statusResult = await this.checkPaymentStatus(context.checkoutRequestID);
        
        if (statusResult.success && statusResult.status === 'completed') {
          context.paymentSuccess = true;
          
          // CREATE TICKETS AFTER SUCCESSFUL PAYMENT
          const ticketResult = await this.createTicketsAfterPayment(statusResult, context, user);
          
          if (ticketResult.success) {
            context.createdTickets = ticketResult.tickets;
            
            // Send QR codes for each ticket
            for (let i = 0; i < ticketResult.tickets.length; i++) {
              const ticket = ticketResult.tickets[i];
              await sock.sendMessage(sender, {
                image: { url: ticket.qr_code },
                caption: `🎫 *Ticket ${i + 1} of ${ticketResult.tickets.length}*\n\n` +
                         `Event: ${context.selectedEvent.title}\n` +
                         `Attendee: ${context.attendeeDetails.fullName}\n` +
                         `Ticket ID: ${ticket.ticket_number}\n\n` +
                         `Show this QR code at the entrance.`
              });
            }
            
            const menu = await menuBuilder.buildMenu('payment_result', {
              ...this.getBaseContext(user),
              paymentSuccess: true,
              selectedEvent: context.selectedEvent,
              selectedTier: context.selectedTier,
              quantity: context.quantity,
              attendeeDetails: context.attendeeDetails,
              totalPrice: context.totalPrice,
              transactionId: statusResult.transactionId,
              tickets: ticketResult.tickets,
            });
            
            return {
              text: `✅ *Payment Successful!*\n\n` +
                    `🎟️ ${context.quantity} ticket(s) have been created.\n` +
                    `📧 Tickets have been sent to ${context.attendeeDetails.email}\n` +
                    `💳 Transaction ID: ${statusResult.transactionId}\n\n` +
                    `${menu.text}`,
              newState: { 
                currentMenu: 'payment_result', 
                context: { ...context, userId: user.id, paymentSuccess: true, createdTickets: ticketResult.tickets } 
              },
            };
          } else {
            return {
              text: `⚠️ *Payment Successful but Ticket Creation Failed*\n\n` +
                    `Your payment of ${context.totalPrice} KES was successful,\n` +
                    `but there was an issue creating your tickets.\n\n` +
                    `Please contact support with your transaction ID:\n` +
                    `${statusResult.transactionId}\n\n` +
                    `Type *MENU* to return.`,
              newState: { currentMenu: 'main', context: { userId: user.id } },
            };
          }
        } else if (statusResult.success && statusResult.status === 'pending') {
          return {
            text: `⏳ *Payment Pending*\n\nYour payment is still being processed.\n\nPlease check your phone and enter your M-Pesa PIN if you haven't already.\n\nType *CHECK* again to refresh status.\nType *CANCEL* to cancel.`,
            newState: { currentMenu: 'mpesa_payment', context: { ...context, userId: user.id } },
          };
        } else {
          return {
            text: `❌ *Payment Failed*\n\n${statusResult.error || 'Payment could not be processed'}\n\nPlease try again.\n\nType *MENU* to return.`,
            newState: { currentMenu: 'main', context: { userId: user.id } },
          };
        }
      } else if (response === 'CANCEL') {
        const menu = await menuBuilder.buildMenu('main', this.getBaseContext(user));
        return {
          text: `❌ *Payment cancelled*\n\n${menu.text}`,
          newState: { currentMenu: 'main', context: { userId: user.id } },
        };
      } else {
        return {
          text: `❌ *Invalid option*\n\nPlease reply with CHECK to check payment status or CANCEL to cancel.\n\nType *MENU* to return to main menu.`,
          newState: { currentMenu: 'mpesa_payment', context: { ...context, userId: user.id } },
        };
      }
    }
    
    if (currentMenu === 'organizer_email') {
      context.orgEmail = message;
      const menu = await menuBuilder.buildMenu('organizer_password', this.getBaseContext(user));
      return {
        text: menu.text,
        newState: { currentMenu: 'organizer_password', context: { ...context, orgEmail: message, userId: user.id } },
      };
    }
    
    if (currentMenu === 'organizer_password') {
      const isValid = await this.validateOrganizer(context.orgEmail, message);
      if (isValid) {
        const menu = await menuBuilder.buildMenu('organizer_dashboard', {
          ...this.getBaseContext(user),
          organizerId: isValid.id,
          organizerName: isValid.fullName,
        });
        return {
          text: menu.text,
          newState: { currentMenu: 'organizer_dashboard', context: { ...context, organizerId: isValid.id, organizerName: isValid.fullName, userId: user.id } },
        };
      } else {
        const menu = await menuBuilder.buildMenu('organizer_login', this.getBaseContext(user));
        return {
          text: `❌ *Invalid credentials*\n\nPlease try again.\n\n${menu.text}`,
          newState: { currentMenu: 'organizer_login', context: { userId: user.id } },
        };
      }
    }
    
    const menu = await menuBuilder.buildMenu('main', this.getBaseContext(user));
    return {
      text: `❌ *Invalid option*\n\nPlease reply with a number from the menu.\n\n${menu.text}`,
      newState: { currentMenu: 'main', context: { userId: user.id } },
    };
  }

  getBaseContext(user) {
    return {
      userId: user.id,
      fetchTrendingEvents: () => EventModel.getTrendingEvents(),
      fetchUserTickets: (userId) => TicketModel.getUserTickets(userId),
      fetchOrganizerStats: (orgId) => EventModel.getOrganizerStats(orgId),
      fetchWallet: (userId) => this.fetchWallet(userId),
    };
  }

  getParentMenu(currentMenu) {
    const parentMap = {
      'event_details': 'trending',
      'ticket_quantity': 'event_details',
      'attendee_name': 'ticket_quantity',
      'attendee_email': 'attendee_name',
      'attendee_phone': 'attendee_email',
      'payment_confirmation': 'attendee_phone',
      'mpesa_payment': 'payment_confirmation',
      'payment_result': 'mpesa_payment',
      'ticket_details': 'my_tickets',
      'organizer_dashboard': 'organizer_login',
    };
    return parentMap[currentMenu] || 'main';
  }

  async getUserState(phoneNumber) {
    try {
      const cacheKey = CACHE_KEYS.WHATSAPP_STATE(phoneNumber);
      let state = await cacheManager.get(cacheKey);
      if (state) return state;
    } catch (error) {
      console.error('Cache error:', error);
    }
    
    if (this.userStates.has(phoneNumber)) {
      return this.userStates.get(phoneNumber);
    }
    
    return {
      currentMenu: 'main',
      context: {},
      lastInteraction: Date.now(),
    };
  }

  async updateUserState(phoneNumber, state) {
    try {
      const cacheKey = CACHE_KEYS.WHATSAPP_STATE(phoneNumber);
      await cacheManager.set(cacheKey, state, 3600);
    } catch (error) {
      console.error('Cache error:', error);
    }
    this.userStates.set(phoneNumber, state);
  }

  async checkRateLimit(phoneNumber) {
    try {
      const rateKey = `wa:ratelimit:${phoneNumber}`;
      try {
        const current = await cacheManager.increment(rateKey, 1);
        if (current === 1) {
          await cacheManager.expire(rateKey, 60);
        }
        return current > 60;
      } catch (cacheError) {
        const now = Date.now();
        const userLimit = this.rateLimits.get(phoneNumber) || { count: 0, resetTime: now + 60000 };
        if (now > userLimit.resetTime) {
          userLimit.count = 0;
          userLimit.resetTime = now + 60000;
        }
        userLimit.count++;
        this.rateLimits.set(phoneNumber, userLimit);
        return userLimit.count > 60;
      }
    } catch (error) {
      console.error('Rate limit error:', error);
      return false;
    }
  }

  async validateOrganizer(email, password) {
    try {
      const user = await UserModel.findByEmail(email);
      if (user && (user.role === 'organizer' || user.role === 'admin')) {
        const passwordUtil = require('../../utils/password');
        const isValid = await passwordUtil.compare(password, user.password_hash);
        if (isValid) {
          return { id: user.id, fullName: user.full_name };
        }
      }
      return null;
    } catch (error) {
      console.error('Error validating organizer:', error);
      return null;
    }
  }

  async fetchWallet(userId) {
    try {
      const WalletModel = require('../../models/WalletModel');
      const wallet = await WalletModel.getWallet(userId);
      const TransactionModel = require('../../models/TransactionModel');
      const transactions = await TransactionModel.getUserTransactions(userId, 5);
      
      return {
        balance: wallet?.balance || 0,
        totalSpent: wallet?.total_spent || 0,
        cashbackEarned: wallet?.total_cashback || 0,
        pendingWithdrawals: wallet?.pending_withdrawals || 0,
        recentTransactions: transactions.map(t => ({
          type: t.type,
          amount: t.amount,
          createdAt: t.created_at,
        })),
      };
    } catch (error) {
      console.error('Error fetching wallet:', error);
      return {
        balance: 0,
        totalSpent: 0,
        cashbackEarned: 0,
        pendingWithdrawals: 0,
        recentTransactions: [],
      };
    }
  }
}

module.exports = new WhatsAppMessageHandler();