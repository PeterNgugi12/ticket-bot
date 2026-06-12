const MessageFormatter = require('../../whatsapp/utils/messageFormatter');

class WhatsAppMenu {
  constructor() {
    this.menus = {
      main: {
        text: `
🎤 *TIX CULTURE* 🔥

What do you want to do today?

${MessageFormatter.numberedList([
          'Trending Events 🔥',
          'Secret Events 🔒',
          'My Tickets 🎟️',
          'VIP Club 👑',
          'Organizer Mode 🎤',
          'Help ℹ️',
        ])}

Reply with the number of your choice.
        `,
        options: {
          '1': 'trending_events',
          '2': 'secret_events',
          '3': 'my_tickets',
          '4': 'vip_club',
          '5': 'organizer_login',
          '6': 'help',
        },
      },
      
      trending_events: {
        text: async () => {
          // Fetch trending events from database
          const events = await this.fetchTrendingEvents();
          
          if (events.length === 0) {
            return 'No trending events at the moment. Check back later! 🔥';
          }
          
          let response = '🔥 *TRENDING THIS WEEK* 🔥\n\n';
          events.forEach((event, index) => {
            response += `${index + 1}. *${event.title}*\n`;
            response += `   📅 ${MessageFormatter.formatDate(event.event_date)}\n`;
            response += `   📍 ${event.venue_name}\n`;
            response += `   🎟️ From ${MessageFormatter.formatPrice(event.min_price)}\n\n`;
          });
          
          response += 'Reply with the event number for details.\n';
          response += 'Or type *BACK* to return to main menu.';
          
          return response;
        },
        options: {},
        dynamicOptions: true,
      },
      
      secret_events: {
        text: `
🔒 *SECRET EVENTS* 🔒

These are invite-only experiences. 

To unlock, you must:
• Have attended 3+ events
• Have VIP status
• Or use a referral code

Type *UNLOCK* if you have a code, or *BACK* to return.
        `,
        options: {
          'unlock': 'unlock_secret',
          'back': 'main',
        },
      },
      
      my_tickets: {
        text: async (context) => {
          const userId = context.userId;
          const tickets = await this.fetchUserTickets(userId);
          
          if (tickets.length === 0) {
            return '🎟️ *NO TICKETS YET*\n\nYou haven\'t purchased any tickets.\n\nCheck out trending events to get started! 🔥';
          }
          
          let response = '🎟️ *YOUR TICKETS* 🎟️\n\n';
          
          tickets.forEach((ticket, index) => {
            const status = ticket.status === 'valid' ? '✅ Valid' : 
                          ticket.status === 'used' ? '✓ Used' : '⚠️ Other';
            response += `${index + 1}. *${ticket.event_title}*\n`;
            response += `   ${ticket.tier_name} x${ticket.quantity}\n`;
            response += `   ${status}\n`;
            response += `   📅 ${MessageFormatter.formatDate(ticket.event_date)}\n\n`;
          });
          
          response += 'Reply with the ticket number to view details.\n';
          response += 'Or type *BACK* to return.';
          
          return response;
        },
        options: {},
        dynamicOptions: true,
      },
      
      organizer_login: {
        text: `
🎤 *ORGANIZER MODE* 🎤

This mode is for event organizers only.

To continue, please login:

Type *LOGIN* to start
Type *BACK* to return
        `,
        options: {
          'login': 'organizer_auth',
          'back': 'main',
        },
      },
      
      organizer_auth: {
        text: `
🔐 *ORGANIZER LOGIN*

Please enter your email address:

Example: *organizer@event.com*
        `,
        expecting: 'email',
        nextMenu: 'organizer_password',
      },
      
      organizer_password: {
        text: `
🔐 *ORGANIZER LOGIN*

Please enter your password:
        `,
        expecting: 'password',
        nextMenu: 'organizer_dashboard',
      },
      
      organizer_dashboard: {
        text: async (context) => {
          const stats = await this.fetchOrganizerStats(context.organizerId);
          
          return `
✅ *LOGGED IN AS ORGANIZER*

What would you like to do?

${MessageFormatter.numberedList([
            'Scan Ticket 🎟️',
            'Event Stats 📊',
            'Check-ins Today ✓',
            'Revenue Report 💰',
            'Logout 🚪',
          ])}

Reply with the number.
          `;
        },
        options: {
          '1': 'scan_ticket',
          '2': 'organizer_stats',
          '3': 'checkins_today',
          '4': 'revenue_report',
          '5': 'logout',
        },
      },
      
      scan_ticket: {
        text: `
📷 *SCANNER MODE*

Please send the ticket QR code image to scan.

The image should be clear and well-lit.

Type *CANCEL* to stop scanning.
        `,
        expecting: 'qr_image',
        handler: 'handleQRScan',
      },
      
      help: {
        text: `
ℹ️ *HELP & SUPPORT*

Need assistance? Here's how we can help:

1️⃣ *Buy Tickets* - Select Trending Events
2️⃣ *My Tickets* - View purchased tickets
3️⃣ *Secret Events* - Exclusive experiences
4️⃣ *VIP Club* - Premium benefits

*FAQs:*
• Tickets are sent via email and WhatsApp
• QR codes are unique and can't be shared
• Refunds available up to 24hrs before event
• For resale, go to My Tickets > Sell

Contact support: *support@tixculture.com*

Type *MENU* to go back.
        `,
        options: {
          'menu': 'main',
        },
      },
    };
  }

  async processMessage(phoneNumber, message, currentState) {
    const { currentMenu, context, expecting } = currentState;
    
    // Handle special commands
    const cmd = message.toLowerCase().trim();
    if (cmd === 'menu' || cmd === 'back') {
      return {
        text: await this.getMenuText('main', context),
        newState: { currentMenu: 'main', context: {}, expecting: null },
      };
    }
    
    if (cmd === 'cancel' && expecting) {
      return {
        text: await this.getMenuText('main', context),
        newState: { currentMenu: 'main', context: {}, expecting: null },
      };
    }
    
    // Handle expected input (form filling)
    if (expecting) {
      return await this.handleExpectedInput(phoneNumber, message, currentState);
    }
    
    // Handle menu navigation
    const menu = this.menus[currentMenu];
    if (!menu) {
      return {
        text: await this.getMenuText('main', context),
        newState: { currentMenu: 'main', context: {}, expecting: null },
      };
    }
    
    // Check if it's a valid option
    let nextMenu = menu.options[message];
    
    if (!nextMenu && menu.dynamicOptions) {
      // Handle dynamic options (event numbers, ticket numbers, etc.)
      nextMenu = await this.handleDynamicOption(currentMenu, message, context);
    }
    
    if (nextMenu) {
      return {
        text: await this.getMenuText(nextMenu, context),
        newState: { currentMenu: nextMenu, context, expecting: null },
      };
    }
    
    // Invalid option
    return {
      text: `❌ *Invalid option*\n\nPlease reply with a valid number from the menu.\n\n${await this.getMenuText(currentMenu, context)}`,
      newState: currentState,
    };
  }

  async handleExpectedInput(phoneNumber, message, currentState) {
    const { currentMenu, context, expecting } = currentState;
    
    switch (expecting) {
      case 'email':
        context.email = message;
        return {
          text: await this.getMenuText('organizer_password', context),
          newState: { ...currentState, expecting: 'password', context },
        };
        
      case 'password':
        // Validate password
        const isValid = await this.validateOrganizer(context.email, message);
        if (isValid) {
          context.organizerId = isValid.id;
          return {
            text: await this.getMenuText('organizer_dashboard', context),
            newState: { currentMenu: 'organizer_dashboard', context, expecting: null },
          };
        } else {
          return {
            text: '❌ *Invalid credentials*\n\nPlease try again or type *BACK* to return.',
            newState: { currentMenu: 'organizer_login', context: {}, expecting: null },
          };
        }
        
      default:
        return {
          text: await this.getMenuText('main', context),
          newState: { currentMenu: 'main', context: {}, expecting: null },
        };
    }
  }

  async handleDynamicOption(currentMenu, selection, context) {
    switch (currentMenu) {
      case 'trending_events':
        // Show event details
        const eventIndex = parseInt(selection) - 1;
        const events = await this.fetchTrendingEvents();
        if (events[eventIndex]) {
          context.selectedEvent = events[eventIndex];
          return 'event_details';
        }
        return null;
        
      case 'my_tickets':
        const ticketIndex = parseInt(selection) - 1;
        const tickets = await this.fetchUserTickets(context.userId);
        if (tickets[ticketIndex]) {
          context.selectedTicket = tickets[ticketIndex];
          return 'ticket_details';
        }
        return null;
        
      default:
        return null;
    }
  }

  async getMenuText(menuName, context) {
    const menu = this.menus[menuName];
    if (!menu) return this.menus.main.text;
    
    if (typeof menu.text === 'function') {
      return await menu.text(context);
    }
    
    return menu.text;
  }

  async fetchTrendingEvents() {
    // Placeholder - will be implemented with database
    return [
      {
        id: '1',
        title: 'Amapiano Night',
        event_date: '2024-02-15 20:00:00',
        venue_name: 'Westlands, Nairobi',
        min_price: 1000,
        tickets_remaining: 47,
      },
    ];
  }

  async fetchUserTickets(userId) {
    // Placeholder - will be implemented with database
    return [];
  }

  async fetchOrganizerStats(organizerId) {
    // Placeholder - will be implemented with database
    return {
      totalEvents: 5,
      totalTicketsSold: 1250,
      totalRevenue: 1250000,
      checkinsToday: 45,
    };
  }

  async validateOrganizer(email, password) {
    // Placeholder - will be implemented with auth service
    return null;
  }
}

module.exports = new WhatsAppMenu();