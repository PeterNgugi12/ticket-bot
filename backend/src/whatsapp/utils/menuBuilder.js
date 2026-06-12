const MessageFormatter = require('./messageFormatter');

class MenuBuilder {
  constructor() {
    this.menus = new Map();
  }

  registerMenu(menuId, menuConfig) {
    this.menus.set(menuId, menuConfig);
  }

 async buildMenu(menuId, context = {}) {
  const menu = this.menus.get(menuId);
  if (!menu) {
    throw new Error(`Menu ${menuId} not found`);
  }

  let content = menu.content;
  if (typeof content === 'function') {
    content = await content(context);
  }

  // Check if content returned an object with mediaUrl
  let text = content;
  let mediaUrl = null;
  
  if (content && typeof content === 'object') {
    text = content.text || '';
    mediaUrl = content.mediaUrl || null;
  }

  const options = await this.buildOptions(menu.options, context);
  
  const result = {
    text: `${text}\n\n${options}`,
    options: menu.options,
    expectsInput: menu.expectsInput || false,
    inputType: menu.inputType || null,
    nextMenu: menu.nextMenu || null,
  };
  
  if (mediaUrl) {
    result.mediaUrl = mediaUrl;
  }
  
  return result;
}

  async buildOptions(options, context) {
    if (!options || options.length === 0) {
      return '';
    }

    let optionsText = MessageFormatter.divider() + '\n\n';
    
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      let label = option.label;
      
      if (typeof label === 'function') {
        label = await label(context);
      }
      
      optionsText += `${i + 1}. ${label}\n`;
    }
    
    optionsText += '\n_Type the number to select_\n';
    optionsText += `_Or type *MENU* to go back_`;
    
    return optionsText;
  }

  createMainMenu() {
    return {
      id: 'main',
      content: `
🎤 *TIX CULTURE* 🔥
*Your Premium Event Ticketing Platform*

Welcome to the hottest event ticketing experience on WhatsApp!

✨ *What we offer:*
• Exclusive event access
• Instant digital tickets
• Secure M-Pesa payments
• VIP experiences
• Ticket resale marketplace

*What would you like to do today?*
      `,
      options: [
        { label: '🔥 Trending Events', action: 'trending', nextMenu: 'trending' },
        { label: '🔒 Secret Events', action: 'secret', nextMenu: 'secret_events' },
        { label: '🎟️ My Tickets', action: 'my_tickets', nextMenu: 'my_tickets' },
        { label: '👑 VIP Club', action: 'vip', nextMenu: 'vip_club' },
        { label: '🎤 Organizer Mode', action: 'organizer', nextMenu: 'organizer_login' },
        { label: '💰 Wallet', action: 'wallet', nextMenu: 'wallet' },
        { label: 'ℹ️ Help & Support', action: 'help', nextMenu: 'help' },
      ],
    };
  }

createTrendingMenu() {
  return {
    id: 'trending',
    content: async (context) => {
      const events = await context.fetchTrendingEvents();
      
      if (!events || events.length === 0) {
        return '🔥 *NO TRENDING EVENTS*\n\nCheck back later for upcoming events!';
      }
      
      let content = '🔥 *TRENDING THIS WEEK* 🔥\n\n';
      
      for (let i = 0; i < Math.min(events.length, 5); i++) {
        const event = events[i];
        
        // Get min price from ticket tiers
        let minPrice = event.min_price;
        if (!minPrice && event.ticket_tiers && event.ticket_tiers.length > 0) {
          minPrice = Math.min(...event.ticket_tiers.map(t => t.price));
        }
        
        const ticketsRemaining = event.tickets_remaining || (event.total_tickets - (event.tickets_sold || 0)) || 0;
        const eventDate = new Date(event.event_date);
        const dateStr = eventDate.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
        
        content += `${i + 1}. *${event.title || 'Untitled Event'}*\n`;
        content += `   📅 ${dateStr} at ${eventDate.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}\n`;
        content += `   📍 ${event.venue_name || 'TBD'}\n`;
        content += `   🎟️ From ${MessageFormatter.formatPrice(minPrice || 0)}\n`;
        content += `   ⏳ ${ticketsRemaining} tickets left\n\n`;
      }
      
      content += '\nSelect an event number to view full details and ticket options.';
      return content;
    },
    options: [],
    dynamicOptions: true,
    expectsInput: true,
    nextMenu: 'event_details',
  };
}
createEventDetailsMenu() {
  return {
    id: 'event_details',
    content: async (context) => {
      const event = context.selectedEvent;
      
      if (!event) {
        return '❌ Event not found. Please try again.';
      }
      
      // Format date and time
      const eventDate = new Date(event.event_date);
      const formattedDate = eventDate.toLocaleDateString('en-KE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const formattedTime = eventDate.toLocaleTimeString('en-KE', {
        hour: '2-digit',
        minute: '2-digit'
      });
      
      // Get image URL
      const imageUrl = event.image_url || null;
      
      let contentText = `
🎤 *${MessageFormatter.bold(event.title)}* 🔥

${MessageFormatter.divider()}

📝 *Description:*
${event.description || 'No description provided'}

📅 *Date:* ${formattedDate}
⏰ *Time:* ${formattedTime}
📍 *Venue:* ${event.venue_name || 'TBD'}

${MessageFormatter.divider()}

🎟️ *TICKET OPTIONS:*
`;
      
      // Display ticket tiers
      const tiers = event.ticket_tiers || [];
      if (tiers.length === 0) {
        contentText += '\n❌ No ticket tiers available for this event.';
      } else {
        for (let i = 0; i < tiers.length; i++) {
          const tier = tiers[i];
          contentText += `\n${i + 1}. *${tier.name}*`;
          contentText += `\n   💰 Price: ${MessageFormatter.formatPrice(tier.price)}`;
          contentText += `\n   🎟️ Available: ${tier.remaining_count || tier.quantity} tickets`;
          if (tier.benefits && tier.benefits.length > 0) {
            contentText += `\n   ✨ Benefits:`;
            tier.benefits.forEach(benefit => {
              contentText += `\n      • ${benefit}`;
            });
          }
        }
      }

      contentText += `

${MessageFormatter.divider()}

📍 *Location:*
${event.venue_name}
${event.latitude && event.longitude ? `📍 Google Maps: https://www.google.com/maps?q=${event.latitude},${event.longitude}` : ''}

⚠️ *Important:*
• No refunds within 24hrs of event
• Valid ID required for entry
• Screenshots not accepted
${event.min_age_restriction ? `• Min Age: ${event.min_age_restriction}+` : ''}

${MessageFormatter.divider()}

Reply with the *TIER NUMBER* to purchase tickets.
Example: *1* for ${tiers[0]?.name || 'Regular'} tickets

Type *BACK* to go back
Type *MENU* for main menu
      `;
      
      // Return object with text and optional mediaUrl
      if (imageUrl) {
        return { text: contentText, mediaUrl: imageUrl };
      }
      return contentText;
    },
    options: [],
    dynamicOptions: true,
    expectsInput: true,
    nextMenu: 'ticket_quantity',
  };
}

  createTicketQuantityMenu() {
    return {
      id: 'ticket_quantity',
      content: async (context) => {
        const event = context.selectedEvent;
        const tier = context.selectedTier;
        
        return `
🎟️ *TICKET QUANTITY*

*Event:* ${event.title}
*Tier:* ${tier.name}
*Price:* ${MessageFormatter.formatPrice(tier.price)} each

Maximum ${tier.max_per_person || 10} tickets per person
${tier.remaining_count} tickets available

How many tickets would you like?
        `;
      },
      expectsInput: true,
      inputType: 'number',
      nextMenu: 'attendee_details',
      validate: async (input, context) => {
        const quantity = parseInt(input);
        const tier = context.selectedTier;
        
        if (isNaN(quantity) || quantity < 1) {
          return { valid: false, error: 'Please enter a valid number (1 or more)' };
        }
        
        if (quantity > (tier.max_per_person || 10)) {
          return { valid: false, error: `Maximum ${tier.max_per_person || 10} tickets per person` };
        }
        
        if (quantity > tier.remaining_count) {
          return { valid: false, error: `Only ${tier.remaining_count} tickets available` };
        }
        
        return { valid: true, data: { quantity } };
      },
    };
  }

  createAttendeeDetailsMenu() {
    return {
      id: 'attendee_details',
      content: `
👤 *ATTENDEE INFORMATION*

Please provide the following details for the ticket(s):

1️⃣ *Full Name*
(As it appears on ID)

2️⃣ *Email Address*
(Tickets will be sent here)

3️⃣ *Phone Number*
(For M-Pesa payment)

Type the information in this format:
*Name | Email | Phone*

Example:
*John Doe | john@email.com | 254712345678*
      `,
      expectsInput: true,
      inputType: 'formatted',
      nextMenu: 'payment_confirmation',
      parseInput: (input) => {
        const parts = input.split('|').map(p => p.trim());
        return {
          fullName: parts[0],
          email: parts[1],
          phone: parts[2],
        };
      },
      validate: async (input, context) => {
        const parts = input.split('|').map(p => p.trim());
        
        if (parts.length < 3) {
          return { valid: false, error: 'Please use format: Name | Email | Phone' };
        }
        
        const [name, email, phone] = parts;
        
        if (!name || name.length < 2) {
          return { valid: false, error: 'Please enter a valid name' };
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return { valid: false, error: 'Please enter a valid email address' };
        }
        
        const phoneRegex = /^\+?254[0-9]{9}$|^0[0-9]{9}$/;
        if (!phoneRegex.test(phone)) {
          return { valid: false, error: 'Please enter a valid Kenyan phone number (e.g., 254712345678)' };
        }
        
        return { 
          valid: true, 
          data: { fullName: name, email, phone: MessageFormatter.formatPhoneNumber(phone) } 
        };
      },
    };
  }

  createPaymentConfirmationMenu() {
    return {
      id: 'payment_confirmation',
      content: async (context) => {
        const event = context.selectedEvent;
        const tier = context.selectedTier;
        const quantity = context.quantity;
        const attendee = context.attendeeDetails;
        const totalPrice = tier.price * quantity;
        
        context.totalPrice = totalPrice;
        
        return `
💰 *PAYMENT CONFIRMATION*

*Order Summary:*
${MessageFormatter.divider()}

*Event:* ${event.title}
*Tier:* ${tier.name}
*Quantity:* ${quantity}
*Unit Price:* ${MessageFormatter.formatPrice(tier.price)}
*Total:* ${MessageFormatter.formatPrice(totalPrice)}

*Attendee:*
Name: ${attendee.fullName}
Email: ${attendee.email}
Phone: ${attendee.phone}

${MessageFormatter.divider()}

To complete your purchase, reply with:
*PAY* - To pay via M-Pesa
*CANCEL* - To cancel order

An STK push will be sent to ${attendee.phone}
        `;
      },
      options: [
        { label: 'PAY - Complete Purchase', action: 'pay', nextMenu: 'mpesa_payment' },
        { label: 'CANCEL - Cancel Order', action: 'cancel', nextMenu: 'main' },
      ],
      expectsInput: true,
      nextMenu: null,
    };
  }

  createMpesaPaymentMenu() {
    return {
      id: 'mpesa_payment',
      content: `
💳 *M-PESA PAYMENT*

We've sent an STK Push to your phone.

Please check your phone and:
1. Enter your M-PESA PIN
2. Confirm the payment

*Status:* Waiting for payment...

Type *CHECK* to check payment status
Type *CANCEL* to cancel
      `,
      expectsInput: true,
      nextMenu: 'payment_result',
    };
  }

  createPaymentResultMenu() {
    return {
      id: 'payment_result',
      content: async (context) => {
        if (context.paymentSuccess) {
          const event = context.selectedEvent;
          const quantity = context.quantity;
          const tier = context.selectedTier;
          
          return `
✅ *PAYMENT SUCCESSFUL!* 🎉

${MessageFormatter.divider()}

*Your tickets have been booked!*

🎟️ *${event.title}*
   ${tier.name} x${quantity}
   Total: ${MessageFormatter.formatPrice(context.totalPrice)}

📧 Tickets sent to: ${context.attendeeDetails.email}
📱 Also available in "My Tickets" menu

📍 *Event Location:*
${event.google_maps_link || `https://www.google.com/maps?q=${event.latitude},${event.longitude}`}

⚠️ *Important:*
• Show QR code at entrance
• Arrive 30 minutes early
• Carry valid ID

${MessageFormatter.divider()}

🎉 *Share & Earn!*
Invite friends and get KES 200 cashback!
Share link: wa.me/${process.env.WHATSAPP_BOT_NUMBER}

Type *MENU* to continue
          `;
        } else {
          return `
❌ *PAYMENT FAILED*

Your payment could not be processed.

Possible reasons:
• Insufficient funds
• Incorrect PIN
• Network timeout

Please try again or use a different payment method.

Type *MENU* to return to main menu
          `;
        }
      },
      options: [
        { label: 'MENU - Main Menu', action: 'menu', nextMenu: 'main' },
      ],
    };
  }

  createMyTicketsMenu() {
    return {
      id: 'my_tickets',
      content: async (context) => {
        const tickets = await context.fetchUserTickets(context.userId);
        
        if (tickets.length === 0) {
          return `
🎟️ *NO TICKETS YET*

You haven't purchased any tickets.

Check out our trending events to get started!
Type *TRENDING* to see upcoming events.
          `;
        }
        
        let content = '🎟️ *YOUR TICKETS* 🎟️\n\n';
        
        const upcoming = tickets.filter(t => t.status === 'valid' && new Date(t.event_date) > new Date());
        const past = tickets.filter(t => t.status === 'used' || new Date(t.event_date) <= new Date());
        
        if (upcoming.length > 0) {
          content += '*UPCOMING EVENTS*\n';
          for (let i = 0; i < upcoming.length; i++) {
            const ticket = upcoming[i];
            content += `${i + 1}. *${ticket.event_title}*\n`;
            content += `   ${ticket.tier_name} x${ticket.quantity}\n`;
            content += `   📅 ${MessageFormatter.formatDate(ticket.event_date)}\n`;
            content += `   📍 ${ticket.venue_name}\n\n`;
          }
        }
        
        if (past.length > 0) {
          content += '*PAST EVENTS*\n';
          for (let i = 0; i < Math.min(past.length, 3); i++) {
            const ticket = past[i];
            content += `• ${ticket.event_title} (${ticket.status === 'used' ? '✓ Used' : 'Expired'})\n`;
          }
        }
        
        content += '\nReply with ticket number to view QR code and details.\n';
        content += 'Type *MENU* to go back';
        
        return content;
      },
      dynamicOptions: true,
      expectsInput: true,
      nextMenu: 'ticket_details',
    };
  }

  createTicketDetailsMenu() {
    return {
      id: 'ticket_details',
      content: async (context) => {
        const ticket = context.selectedTicket;
        
        if (!ticket) {
          return 'Ticket not found.';
        }
        
        const isUpcoming = ticket.status === 'valid' && new Date(ticket.event_date) > new Date();
        
        let content = `
🎟️ *TICKET DETAILS*

${MessageFormatter.divider()}

*Event:* ${ticket.event_title}
*Tier:* ${ticket.tier_name}
*Quantity:* ${ticket.quantity}
*Attendee:* ${ticket.attendee_name}
*Status:* ${ticket.status === 'valid' ? '✅ Valid' : ticket.status === 'used' ? '✓ Used' : '❌ Expired'}

*Event Details:*
📍 ${ticket.venue_name}
📅 ${MessageFormatter.formatDate(ticket.event_date)}

${isUpcoming ? `
*Options:*
1️⃣ View QR Code
2️⃣ View Location
3️⃣ Sell Ticket (Resale)
4️⃣ Transfer Ticket
5️⃣ Get Reminder
` : ''}

Reply with option number or *BACK*
        `;
        
        return content;
      },
      options: [
        { label: 'View QR Code', action: 'view_qr', nextMenu: 'ticket_qr' },
        { label: 'View Location', action: 'view_location', nextMenu: 'ticket_location' },
        { label: 'Sell Ticket', action: 'sell_ticket', nextMenu: 'resale_price' },
        { label: 'Transfer Ticket', action: 'transfer_ticket', nextMenu: 'transfer_details' },
        { label: 'Get Reminder', action: 'reminder', nextMenu: null },
      ],
      expectsInput: true,
    };
  }

  createOrganizerLoginMenu() {
    return {
      id: 'organizer_login',
      content: `
🎤 *ORGANIZER MODE*

This area is for event organizers only.

Please login to access:
• Ticket scanning
• Event statistics
• Check-in management
• Revenue reports

Type *LOGIN* to continue
Type *BACK* to return
      `,
      options: [
        { label: 'LOGIN', action: 'login', nextMenu: 'organizer_email' },
        { label: 'BACK', action: 'back', nextMenu: 'main' },
      ],
    };
  }

  createOrganizerDashboardMenu() {
    return {
      id: 'organizer_dashboard',
      content: async (context) => {
        const stats = await context.fetchOrganizerStats(context.organizerId);
        
        return `
✅ *ORGANIZER DASHBOARD*

Welcome back, ${context.organizerName}!

📊 *Quick Stats:*
• Active Events: ${stats.activeEvents}
• Today's Check-ins: ${stats.todayCheckins}
• Total Tickets Sold: ${stats.totalTicketsSold}
• Revenue (Today): ${MessageFormatter.formatPrice(stats.todayRevenue)}
• Revenue (Total): ${MessageFormatter.formatPrice(stats.totalRevenue)}

*What would you like to do?*
        `;
      },
      options: [
        { label: '📷 Scan Ticket', action: 'scan', nextMenu: 'scan_ticket' },
        { label: '📊 Event Stats', action: 'stats', nextMenu: 'event_stats' },
        { label: '✓ Check-ins Today', action: 'checkins', nextMenu: 'checkins_list' },
        { label: '💰 Withdraw Earnings', action: 'withdraw', nextMenu: 'withdraw_amount' },
        { label: '🚪 Logout', action: 'logout', nextMenu: 'main' },
      ],
    };
  }

  createScanTicketMenu() {
    return {
      id: 'scan_ticket',
      content: `
📷 *SCANNER MODE*

Please send the ticket QR code image.

Instructions:
1. Open the ticket QR code on attendee's phone
2. Take a clear photo of the QR code
3. Send the image here

The system will automatically verify the ticket.

Type *CANCEL* to stop scanning
      `,
      expectsInput: true,
      inputType: 'image',
      nextMenu: 'scan_result',
    };
  }

  createScanResultMenu() {
    return {
      id: 'scan_result',
      content: async (context) => {
        const scanResult = context.scanResult;
        
        if (scanResult.valid) {
          return `
✅ *ACCESS GRANTED*

${MessageFormatter.divider()}

*Ticket Details:*
Ticket ID: ${scanResult.ticketNumber}
Event: ${scanResult.eventTitle}
Tier: ${scanResult.tierName}
Attendee: ${scanResult.attendeeName}

*Check-in Time:* ${new Date().toLocaleString()}

${MessageFormatter.divider()}

Status: ✓ Checked in successfully

Type *SCAN* to scan another ticket
Type *MENU* for dashboard
          `;
        } else {
          return `
❌ *ACCESS DENIED*

${MessageFormatter.divider()}

Reason: ${scanResult.reason}

${scanResult.reason === 'already_used' ? 
  `This ticket was already used at: ${scanResult.usedAt}` : 
  scanResult.reason === 'invalid' ? 
  'The QR code is invalid or has been tampered with' :
  'Ticket not found in system'}

${MessageFormatter.divider()}

Please ask the attendee to contact support.

Type *SCAN* to try again
Type *MENU* for dashboard
          `;
        }
      },
      options: [
        { label: 'SCAN - Scan Another', action: 'scan_again', nextMenu: 'scan_ticket' },
        { label: 'MENU - Dashboard', action: 'menu', nextMenu: 'organizer_dashboard' },
      ],
    };
  }

  createWalletMenu() {
    return {
      id: 'wallet',
      content: async (context) => {
        const wallet = await context.fetchWallet(context.userId);
        
        return `
💰 *MY WALLET*

${MessageFormatter.divider()}

*Balance:* ${MessageFormatter.formatPrice(wallet.balance)}
*Total Spent:* ${MessageFormatter.formatPrice(wallet.totalSpent)}
*Cashback Earned:* ${MessageFormatter.formatPrice(wallet.cashbackEarned)}
*Pending Withdrawals:* ${MessageFormatter.formatPrice(wallet.pendingWithdrawals)}

${MessageFormatter.divider()}

*Recent Transactions:*
${wallet.recentTransactions.map(t => 
  `• ${t.type}: ${MessageFormatter.formatPrice(t.amount)} (${MessageFormatter.formatDate(t.createdAt, false)})`
).join('\n')}

*Options:*
1️⃣ Deposit via M-Pesa
2️⃣ Withdraw to M-Pesa
3️⃣ Transaction History
4️⃣ Cashback Offers

Reply with option number
        `;
      },
      options: [
        { label: 'Deposit via M-Pesa', action: 'deposit', nextMenu: 'deposit_amount' },
        { label: 'Withdraw to M-Pesa', action: 'withdraw', nextMenu: 'withdraw_amount' },
        { label: 'Transaction History', action: 'history', nextMenu: 'transaction_history' },
        { label: 'Cashback Offers', action: 'offers', nextMenu: 'cashback_offers' },
      ],
    };
  }

  createHelpMenu() {
    return {
      id: 'help',
      content: `
ℹ️ *HELP & SUPPORT*

Need assistance? Here's how we can help:

1️⃣ *Buy Tickets* - Select Trending Events (Option 1)
2️⃣ *My Tickets* - View purchased tickets (Option 3)
3️⃣ *Secret Events* - Exclusive experiences (Option 2)
4️⃣ *VIP Club* - Premium benefits (Option 4)
5️⃣ *Wallet* - View balance and transactions (Option 6)

*FAQs:*
• Tickets are sent via email and WhatsApp
• QR codes are unique and can't be shared
• Refunds available up to 24hrs before event
• For resale, go to My Tickets > Sell Ticket

*Contact Support:*
📧 support@tixculture.com
📱 WhatsApp: Same number you're chatting with

Type *MENU* to go back to main menu.
      `,
      options: [
        { label: 'MENU - Back to Main', action: 'menu', nextMenu: 'main' },
      ],
    };
  }

  createVipClubMenu() {
    return {
      id: 'vip_club',
      content: `
👑 *VIP CLUB* 👑

Welcome to the exclusive VIP Club!

*VIP Benefits:*
✨ Early access to tickets (24 hours before public)
✨ 5% cashback on all ticket purchases
✨ Exclusive VIP-only events
✨ Free ticket delivery
✨ Priority customer support
✨ Birthday bonus tickets

*How to Join:*
• Purchase 5+ tickets in a month
• Refer 10+ friends to TIX CULTURE
• Or pay KES 5,000 annual fee

*Current VIP Members:* 1,247

Type *JOIN* to become a VIP member
Type *BACK* to return to main menu
      `,
      options: [
        { label: 'JOIN - Become VIP Member', action: 'join_vip', nextMenu: 'vip_join' },
        { label: 'BACK - Return to Main', action: 'back', nextMenu: 'main' },
      ],
    };
  }

  createSecretEventsMenu() {
    return {
      id: 'secret_events',
      content: `
🔒 *SECRET EVENTS* 🔒

These are invite-only experiences featuring:
• Top artists performing incognito
• Hidden locations revealed after purchase
• Limited capacity (max 100 people)
• Exclusive merchandise

*Requirements to Unlock:*
✓ Have attended 3+ events
✓ Have VIP Club status
✓ Or use a referral code from an existing member

*Upcoming Secret Events:*
• 🎤 Secret Concert - Date TBD
• 🍷 Wine & Dine Experience
• 🎨 Private Art Gallery Night

Type *UNLOCK* if you have a referral code
Type *REQUEST* to request access
Type *BACK* to return
      `,
      options: [
        { label: 'UNLOCK - Enter Referral Code', action: 'unlock', nextMenu: 'unlock_secret' },
        { label: 'REQUEST - Request Access', action: 'request', nextMenu: 'request_access' },
        { label: 'BACK - Return to Main', action: 'back', nextMenu: 'main' },
      ],
    };
  }
}

module.exports = new MenuBuilder();