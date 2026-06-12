class MessageFormatter {
  static bold(text) {
    return `*${text}*`;
  }

  static italic(text) {
    return `_${text}_`;
  }

  static strike(text) {
    return `~${text}~`;
  }

  static code(text) {
    return `\`${text}\``;
  }

  static link(url, text = null) {
    return text ? `[${text}](${url})` : url;
  }

  static bulletList(items) {
    return items.map(item => `• ${item}`).join('\n');
  }

  static numberedList(items) {
    return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
  }

  static header(text, level = 1) {
    return `${'#'.repeat(level)} ${text}`;
  }

  static divider() {
    return '─'.repeat(30);
  }

  static quote(text) {
    return `> ${text}`;
  }

  static formatPrice(amount, currency = 'KES') {
    // Handle undefined, null, or invalid amounts
    if (!amount || isNaN(amount)) {
      return `${currency} 0`;
    }
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) {
      return `${currency} 0`;
    }
    return `${currency} ${numAmount.toLocaleString()}`;
  }

  static formatDate(date, includeTime = true) {
    if (!date) return 'TBD';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'TBD';
    
    if (includeTime) {
      return d.toLocaleString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return d.toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  static formatPhoneNumber(phone) {
    if (!phone) return 'N/A';
    // Remove any non-digit characters
    let cleaned = phone.toString().replace(/\D/g, '');
    
    // Format Kenyan phone numbers
    if (cleaned.startsWith('254') && cleaned.length === 12) {
      return `+${cleaned}`;
    }
    if (cleaned.startsWith('0') && cleaned.length === 10) {
      return `+254${cleaned.slice(1)}`;
    }
    if (cleaned.length === 9) {
      return `+254${cleaned}`;
    }
    return phone;
  }

  static truncate(text, maxLength = 100) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  static escapeMarkdown(text) {
    if (!text) return '';
    const specialChars = ['_', '*', '~', '`', '[', ']', '(', ')', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    let escaped = text;
    specialChars.forEach(char => {
      escaped = escaped.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
    });
    return escaped;
  }

  static createWelcomeMessage(userName = 'there') {
    return `
🎤 *WELCOME TO TIX CULTURE* 🔥

Hey ${userName}! Welcome to the hottest event ticketing platform on WhatsApp.

What would you like to do today?

${this.numberedList([
      'Trending Events 🔥',
      'Secret Events 🔒',
      'My Tickets 🎟️',
      'VIP Club 👑',
      'Help ℹ️',
    ])}

Type the number of your choice to get started.

*Pro tip:* Save this number to contacts for quick access! 🚀
    `.trim();
  }

  static createEventCard(event) {
    if (!event) return 'Event not found';
    
    return `
🎤 *${this.bold(event.title || 'Untitled Event')}*

📍 ${event.venue_name || 'TBD'}
📅 ${this.formatDate(event.event_date)}

${event.description ? `📝 ${this.truncate(event.description, 150)}\n` : ''}

👀 ${event.interested_count || 0} people interested
⏳ ${event.tickets_remaining || 0} tickets left

🎟️ *Ticket Options:*
${event.ticket_tiers?.map(tier => 
  `  ${tier.name}: ${this.formatPrice(tier.price)}`
).join('\n') || '  No ticket tiers available'}

Reply with *TIER NUMBER* to buy tickets!
    `.trim();
  }

  static createTicketMessage(ticket, event) {
    if (!ticket || !event) return 'Ticket information not available';
    
    return `
🎟️ *YOUR TICKET* 🎟️

*Event:* ${this.bold(event.title || 'Unknown Event')}
*Tier:* ${ticket.tier_name || 'Standard'}
*Quantity:* ${ticket.quantity || 1}
*Total:* ${this.formatPrice(ticket.total_price || 0)}

👤 *Name:* ${ticket.attendee_name || 'N/A'}
📞 *Phone:* ${ticket.phone || 'N/A'}

📍 *Location:* 
${event.google_maps_link || `https://www.google.com/maps?q=${event.latitude},${event.longitude}`}

⚠️ *IMPORTANT:*
• Do NOT share this ticket
• Screenshots will NOT work
• Show QR code at entrance
• Arrive 30 mins early

${this.divider()}

Your QR ticket is attached below 👇
    `.trim();
  }

  static createScanResult(isValid, ticketData = null) {
    if (isValid && ticketData) {
      return `
✅ *ACCESS GRANTED*

👤 *${ticketData.attendee_name || 'N/A'}*
🎟️ *${ticketData.tier_name || 'Standard'}*
📍 *${ticketData.event_title || 'Unknown Event'}*

🕒 Checked in successfully

Enjoy the event! 🎉
      `.trim();
    } else {
      return `
❌ *ACCESS DENIED*

${ticketData?.reason || 'Invalid or already used ticket'}

Please contact support for assistance.
      `.trim();
    }
  }

  static createPaymentPrompt(eventTitle, tierName, quantity, totalPrice) {
    return `
💰 *PAYMENT REQUIRED*

*Event:* ${eventTitle || 'Unknown Event'}
*Ticket:* ${tierName || 'Standard'} x${quantity || 1}
*Total:* ${this.formatPrice(totalPrice || 0)}

Reply with your M-Pesa number to continue:

Example: *254700123456*

We'll send an STK Push to your phone.
    `.trim();
  }

  static createPaymentSuccessMessage(eventTitle, tickets, emailSent = true) {
    return `
✅ *PAYMENT SUCCESSFUL!* 🎉

You're all set for *${eventTitle || 'your event'}*!

${tickets?.map(ticket => `🎟️ ${ticket.tier_name || 'Standard'} x${ticket.quantity || 1}`).join('\n') || '🎟️ Tickets booked'}

📧 ${emailSent ? 'Ticket sent to your email' : 'Check your email for tickets'}

🎉 Share with friends & get KES 200 cashback!

${this.divider()}

Reply *MENU* to go back or *MY TICKETS* to view all tickets.
    `.trim();
  }
}

module.exports = MessageFormatter;