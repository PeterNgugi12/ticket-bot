const nodemailer = require('nodemailer');
const emailUtils = require('../utils/emailUtils');
const EmailTemplateService = require('./emailTemplateService');
const { queueManager, QUEUES } = require('../queue/queueManager');
const cacheManager = require('../cache/cacheManager');

class EmailService {
  constructor() {
    this.transporter = null;
    this.rateLimit = parseInt(process.env.EMAIL_RATE_LIMIT) || 100;
    this.sentCount = 0;
    this.lastReset = Date.now();
    this.initTransporter();
  }

  initTransporter() {
    const provider = process.env.EMAIL_PROVIDER || 'smtp';
    
    if (provider === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: this.rateLimit,
      });
    } else if (provider === 'ses') {
      const AWS = require('aws-sdk');
      AWS.config.update({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION,
      });
      this.transporter = nodemailer.createTransport({
        SES: new AWS.SES({ apiVersion: '2010-12-01' }),
      });
    } else if (provider === 'sendgrid') {
      this.transporter = nodemailer.createTransport({
        service: 'SendGrid',
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY,
        },
      });
    }
  }

  async sendEmail(emailData, options = {}) {
    const {
      to,
      subject,
      html,
      text,
      from = process.env.EMAIL_FROM,
      replyTo = process.env.EMAIL_REPLY_TO,
      attachments = [],
      headers = {},
      priority = 'normal',
    } = emailData;

    // Validate email
    if (!emailUtils.validateEmail(to)) {
      throw new Error(`Invalid email address: ${to}`);
    }

    // Check rate limit
    await this.checkRateLimit();

    // Prepare email
    const mailOptions = {
      from,
      to: emailUtils.sanitizeEmail(to),
      subject,
      html: emailUtils.inlineCss(html),
      text: text || emailUtils.convertToText(html),
      replyTo,
      attachments,
      headers: {
        ...emailUtils.createEmailHeaders(emailData),
        ...headers,
        'X-Priority': priority === 'high' ? '1' : priority === 'low' ? '5' : '3',
      },
      priority,
    };

    // Add tracking
    if (options.trackOpen !== false) {
      mailOptions.html = emailUtils.addTrackingPixel(mailOptions.html, emailData.id);
    }

    // Send email
    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.sentCount++;
      
      // Log success
      await this.logEmailDelivery({
        ...emailData,
        messageId: info.messageId,
        status: 'sent',
        sentAt: new Date(),
      });
      
      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
      };
    } catch (error) {
      console.error('Email send failed:', error);
      
      // Log failure
      await this.logEmailDelivery({
        ...emailData,
        status: 'failed',
        error: error.message,
        failedAt: new Date(),
      });
      
      throw error;
    }
  }

  async sendTicketConfirmation(ticketData, userData) {
    const template = await EmailTemplateService.renderTemplate('ticket-confirmation', {
      ...ticketData,
      ...userData,
      year: new Date().getFullYear(),
      appUrl: process.env.APP_URL,
    });
    
    const attachments = [];
    
    // Attach QR code if available
    if (ticketData.qrCodeBuffer) {
      attachments.push({
        filename: `ticket-${ticketData.ticketNumber}.png`,
        content: ticketData.qrCodeBuffer,
        encoding: 'base64',
        cid: 'ticket-qr',
      });
    }
    
    // Attach PDF ticket
    if (ticketData.pdfBuffer) {
      attachments.push({
        filename: `ticket-${ticketData.ticketNumber}.pdf`,
        content: ticketData.pdfBuffer,
        contentType: 'application/pdf',
      });
    }
    
    return await this.sendEmail({
      id: `ticket_${ticketData.ticketNumber}`,
      to: userData.email,
      subject: `🎫 Your Tickets for ${ticketData.eventTitle}`,
      html: template.html,
      text: template.text,
      attachments,
      type: 'ticket_confirmation',
      ticketNumber: ticketData.ticketNumber,
      eventId: ticketData.eventId,
      userId: userData.id,
      priority: 'high',
    });
  }

  async sendPaymentReceipt(paymentData, userData) {
    const template = await EmailTemplateService.renderTemplate('payment-receipt', {
      ...paymentData,
      ...userData,
      year: new Date().getFullYear(),
      appUrl: process.env.APP_URL,
    });
    
    // Generate PDF receipt
    const pdfBuffer = await this.generateReceiptPDF(paymentData, userData);
    
    return await this.sendEmail({
      id: `receipt_${paymentData.id}`,
      to: userData.email,
      subject: `💰 Payment Receipt - ${paymentData.amount} KES`,
      html: template.html,
      text: template.text,
      attachments: [
        {
          filename: `receipt-${paymentData.id}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
      type: 'payment_receipt',
      priority: 'normal',
    });
  }

  async sendEventReminder(eventData, attendees) {
    const results = [];
    
    for (const attendee of attendees) {
      const template = await EmailTemplateService.renderTemplate('event-reminder', {
        ...eventData,
        attendee,
        daysUntil: Math.ceil((new Date(eventData.eventDate) - new Date()) / (1000 * 60 * 60 * 24)),
        year: new Date().getFullYear(),
        appUrl: process.env.APP_URL,
      });
      
      const result = await this.sendEmail({
        id: `reminder_${eventData.id}_${attendee.userId}`,
        to: attendee.email,
        subject: `⏰ Reminder: ${eventData.title} is Tomorrow!`,
        html: template.html,
        text: template.text,
        type: 'event_reminder',
        eventId: eventData.id,
        userId: attendee.userId,
        priority: 'normal',
      });
      
      results.push(result);
    }
    
    return results;
  }

  async sendWelcomeEmail(userData) {
    const template = await EmailTemplateService.renderTemplate('welcome', {
      ...userData,
      year: new Date().getFullYear(),
      appUrl: process.env.APP_URL,
    });
    
    return await this.sendEmail({
      id: `welcome_${userData.id}`,
      to: userData.email,
      subject: '🎉 Welcome to TIX CULTURE!',
      html: template.html,
      text: template.text,
      type: 'welcome',
      userId: userData.id,
      priority: 'high',
    });
  }

  async sendPasswordResetEmail(userData, resetToken) {
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
    
    const template = await EmailTemplateService.renderTemplate('password-reset', {
      ...userData,
      resetUrl,
      year: new Date().getFullYear(),
      appUrl: process.env.APP_URL,
    });
    
    return await this.sendEmail({
      id: `reset_${userData.id}_${Date.now()}`,
      to: userData.email,
      subject: '🔐 Reset Your TIX CULTURE Password',
      html: template.html,
      text: template.text,
      type: 'password_reset',
      userId: userData.id,
      priority: 'high',
    });
  }

  async sendBulkEmails(emailsData) {
    const results = [];
    const batchSize = parseInt(process.env.EMAIL_QUEUE_BATCH_SIZE) || 50;
    
    for (let i = 0; i < emailsData.length; i += batchSize) {
      const batch = emailsData.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(emailData => this.sendEmail(emailData))
      );
      results.push(...batchResults);
      
      // Delay between batches
      if (i + batchSize < emailsData.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return {
      total: emailsData.length,
      successful: results.filter(r => r.status === 'fulfilled' && r.value.success).length,
      failed: results.filter(r => r.status === 'rejected' || !r.value?.success).length,
      results,
    };
  }

  async checkRateLimit() {
    const now = Date.now();
    const minuteAgo = now - 60000;
    
    if (this.lastReset < minuteAgo) {
      this.sentCount = 0;
      this.lastReset = now;
    }
    
    if (this.sentCount >= this.rateLimit) {
      const waitTime = 60000 - (now - this.lastReset);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.sentCount = 0;
      this.lastReset = Date.now();
    }
  }

  async logEmailDelivery(logData) {
    const db = require('../db/pool');
    await db.query(
      `INSERT INTO email_logs (email, subject, template, status, message_id, error, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [
        logData.to,
        logData.subject,
        logData.type,
        logData.status,
        logData.messageId,
        logData.error,
        { ticketNumber: logData.ticketNumber, eventId: logData.eventId, userId: logData.userId },
      ]
    );
  }

  async generateReceiptPDF(paymentData, userData) {
    // Simplified PDF generation - in production use a proper PDF library
    const PDFDocument = require('pdfkit');
    const buffers = [];
    const doc = new PDFDocument();
    
    doc.on('data', buffers.push.bind(buffers));
    
    doc.fontSize(20).text('TIX CULTURE', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).text('Payment Receipt', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Receipt Number: ${paymentData.id}`);
    doc.text(`Date: ${new Date().toLocaleDateString()}`);
    doc.text(`Customer: ${userData.fullName}`);
    doc.text(`Email: ${userData.email}`);
    doc.moveDown();
    doc.text(`Amount: KES ${paymentData.amount.toLocaleString()}`);
    doc.text(`Payment Method: ${paymentData.paymentMethod}`);
    doc.text(`Transaction ID: ${paymentData.mpesa_transaction_id || 'N/A'}`);
    doc.moveDown();
    doc.text('Thank you for choosing TIX CULTURE!', { align: 'center' });
    
    doc.end();
    
    return Buffer.concat(buffers);
  }
}

module.exports = new EmailService();