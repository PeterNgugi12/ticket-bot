// backend/src/utils/qrScanner.js
const Jimp = require('jimp');
const QrCode = require('qrcode-reader');
const cryptoUtil = require('./crypto');

class QRScanner {
  async extractQRFromImage(imageBuffer) {
    return new Promise((resolve, reject) => {
      Jimp.read(imageBuffer, (err, image) => {
        if (err) {
          reject(new Error('Failed to read image: ' + err.message));
          return;
        }

        const qr = new QrCode();
        qr.callback = (err, value) => {
          if (err) {
            reject(new Error('No QR code found in image'));
            return;
          }
          resolve(value.result);
        };

        qr.decode(image.bitmap);
      });
    });
  }

  async extractQRFromBase64(base64String) {
    const buffer = Buffer.from(base64String.split(',')[1] || base64String, 'base64');
    return await this.extractQRFromImage(buffer);
  }

  validateQRFormat(qrData) {
    // Try to parse as plain JSON first (old format)
    try {
      const data = JSON.parse(qrData);
      
      // Check for old format with ticketId
      if (data.ticketId && data.eventId) {
        console.log('Detected old QR format (plain JSON)');
        return {
          valid: true,
          format: 'legacy',
          data: {
            ticketNumber: data.ticketId,
            eventId: data.eventId,
            attendeeName: data.attendeeName,
            attendeeEmail: data.attendeeEmail,
            tierName: data.tierName,
            qrSecret: data.qrSecret,
            price: data.price,
            purchaseDate: data.purchaseDate
          }
        };
      }
    } catch (e) {
      // Not plain JSON, continue to next format
    }

    // Try to decode as base64 (new secure format)
    try {
      const decoded = Buffer.from(qrData, 'base64').toString();
      const data = JSON.parse(decoded);
      
      // Check for secure format with signature
      if (data.sig && data.tid && data.tn) {
        console.log('Detected secure QR format (base64 + signature)');
        return {
          valid: true,
          format: 'secure',
          data: data
        };
      }
    } catch (error) {
      // Not valid base64 format
    }
    
    return { valid: false, reason: 'Invalid QR format - unable to parse' };
  }

  async processScanImage(imageBuffer, scannerId, eventId = null) {
    try {
      // Extract QR code from image
      const qrData = await this.extractQRFromImage(imageBuffer);
      console.log('Raw QR data extracted:', qrData.substring(0, 100) + '...');
      
      // Validate QR format
      const validation = this.validateQRFormat(qrData);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.reason,
          qrData,
        };
      }
      
      let ticketData = null;
      let verificationResult = null;
      
      // Handle different formats
      if (validation.format === 'legacy') {
        // Handle old format tickets
        const { data } = validation;
        
        // Query database for ticket
        const TicketModel = require('../models/TicketModel');
        const ticket = await TicketModel.findByTicketNumber(data.ticketNumber);
        
        if (!ticket) {
          return {
            success: false,
            error: 'Ticket not found in system',
            qrData,
          };
        }
        
        // Verify event match
        if (eventId && ticket.event_id !== eventId) {
          return {
            success: false,
            error: `Ticket is for a different event`,
            qrData,
            ticketData: ticket,
          };
        }
        
        // Verify QR secret
        if (data.qrSecret && ticket.qr_secret !== data.qrSecret) {
          return {
            success: false,
            error: 'Invalid QR code - security verification failed',
            qrData,
            ticketData: ticket,
          };
        }
        
        // Check if already checked in
        if (ticket.checked_in_at) {
          return {
            success: false,
            error: `Ticket already scanned at ${new Date(ticket.checked_in_at).toLocaleString()}`,
            qrData,
            ticketData: ticket,
          };
        }
        
        ticketData = ticket;
        verificationResult = { valid: true };
        
      } else if (validation.format === 'secure') {
        // Handle new secure format
        const { data } = validation;
        
        // Verify signature
        const { sig, ...payload } = data;
        const isValid = cryptoUtil.verifySignature(payload, sig);
        
        if (!isValid) {
          return {
            success: false,
            error: 'Invalid QR signature - ticket may be tampered',
            qrData,
          };
        }
        
        // Check expiry
        if (data.exp && data.exp < Date.now()) {
          return {
            success: false,
            error: 'QR code has expired',
            qrData,
          };
        }
        
        // Verify against database
        const ticketService = require('../services/ticketService');
        verificationResult = await ticketService.verifyTicket(data.tn, eventId, scannerId);
        
        if (verificationResult.valid) {
          ticketData = verificationResult.ticket;
        }
      }
      
      if (!verificationResult || !verificationResult.valid) {
        return {
          success: false,
          error: verificationResult?.reason || 'Ticket verification failed',
          qrData,
          ticketData: ticketData,
        };
      }
      
      return {
        success: true,
        error: null,
        qrData,
        ticketData: ticketData,
        payload: validation.data,
      };
      
    } catch (error) {
      console.error('QR scan processing error:', error);
      return {
        success: false,
        error: 'Failed to process QR code: ' + error.message,
      };
    }
  }
}

module.exports = new QRScanner();