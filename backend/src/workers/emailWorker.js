const { queueManager, QUEUES } = require('../queue/queueManager');
const emailService = require('../services/emailService');
const qrTicketService = require('../services/qrTicketService');
const TicketModel = require('../models/TicketModel');
const EventModel = require('../models/EventModel');
const UserModel = require('../models/UserModel');

class EmailWorker {
  constructor() {
    this.setupWorkers();
  }

  setupWorkers() {
    const queue = queueManager.getQueue(QUEUES.EMAIL);
    
    if (!queue) {
      console.error('Email queue not found');
      return;
    }
    
    // Process ticket email sending
    queue.process('send_tickets', async (job) => {
      const { 
        userId, eventId, tickets, attendeeEmail, 
        attendeeName, eventTitle, eventDate, 
        venueName, totalAmount 
      } = job.data;
      
      console.log(`Sending ticket email to ${attendeeEmail}`);
      
      // Get user details
      const user = await UserModel.findById(userId);
      const event = await EventModel.findById(eventId);
      const ticket = tickets[0];
      
      // Get QR code for ticket
      const qrResult = await qrTicketService.getTicketQR(ticket.ticket_number, 'full');
      const qrBuffer = qrResult?.qr?.buffer ? Buffer.from(qrResult.qr.buffer, 'base64') : null;
      
      // Get PDF ticket
      const pdfBuffer = await qrTicketService.generatePrintableTicket(ticket.ticket_number);
      
      const result = await emailService.sendTicketConfirmation(
        {
          ticketNumber: ticket.ticket_number,
          eventTitle,
          eventDate,
          venueName,
          tierName: ticket.tier_name,
          quantity: tickets.length,
          totalAmount,
          eventId,
          qrCodeBuffer: qrBuffer,
          pdfBuffer,
          googleMapsLink: event.google_maps_link,
        },
        {
          id: userId,
          email: attendeeEmail,
          fullName: attendeeName,
        }
      );
      
      return result;
    });
    
    // Process payment receipt
    queue.process('send_receipt', async (job) => {
      const { payment, user } = job.data;
      
      console.log(`Sending receipt to ${user.email}`);
      
      const result = await emailService.sendPaymentReceipt(payment, user);
      
      return result;
    });
    
    // Process event reminders
    queue.process('send_reminders', async (job) => {
      const { eventId } = job.data;
      
      console.log(`Sending reminders for event ${eventId}`);
      
      const event = await EventModel.findById(eventId);
      const tickets = await TicketModel.getEventTickets(eventId, 'valid');
      
      // Get unique attendees
      const attendees = [];
      const seenUsers = new Set();
      
      for (const ticket of tickets) {
        if (!seenUsers.has(ticket.user_id)) {
          seenUsers.add(ticket.user_id);
          const user = await UserModel.findById(ticket.user_id);
          attendees.push({
            userId: ticket.user_id,
            email: user.email,
            name: ticket.attendee_name,
            tierName: ticket.tier_name,
            ticketNumber: ticket.ticket_number,
          });
        }
      }
      
      const result = await emailService.sendEventReminder(event, attendees);
      
      return result;
    });
    
    // Process welcome email
    queue.process('send_welcome', async (job) => {
      const { user } = job.data;
      
      console.log(`Sending welcome email to ${user.email}`);
      
      const result = await emailService.sendWelcomeEmail(user);
      
      return result;
    });
    
    // Process bulk emails
    queue.process('send_bulk', async (job) => {
      const { emails } = job.data;
      
      console.log(`Sending bulk emails: ${emails.length} emails`);
      
      const result = await emailService.sendBulkEmails(emails);
      
      return result;
    });
    
    console.log('Email worker initialized');
  }
}

// Start worker
if (require.main === module) {
  new EmailWorker();
  console.log('Email worker running...');
}

module.exports = EmailWorker;