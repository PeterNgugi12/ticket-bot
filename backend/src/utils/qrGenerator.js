const QRCode = require('qrcode');
const crypto = require('crypto');
const sharp = require('sharp');
const cryptoUtil = require('./crypto');

class QRGenerator {
  constructor() {
    this.qrConfig = {
      width: 500,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    };
  }

  async generateTicketQR(ticketData, options = {}) {
    const {
      ticketId,
      ticketNumber,
      eventId,
      eventTitle,
      userId,
      attendeeName,
      tierName,
      eventDate,
      venueName,
    } = ticketData;

    // Create secure payload
    const payload = {
      v: '1.0', // version
      tid: ticketId,
      tn: ticketNumber,
      eid: eventId,
      uid: userId,
      name: attendeeName,
      tier: tierName,
      exp: new Date(eventDate).getTime(),
      ts: Date.now(),
    };

    // Add signature
    const signature = cryptoUtil.signData(payload);
    const qrData = Buffer.from(JSON.stringify({ ...payload, sig: signature })).toString('base64');

    // Generate QR with branding
    const qrBuffer = await QRCode.toBuffer(qrData, {
      ...this.qrConfig,
      ...options,
    });

    // Add logo overlay if provided
    let finalBuffer = qrBuffer;
    if (options.logoUrl) {
      finalBuffer = await this.addLogoToQR(qrBuffer, options.logoUrl);
    }

    // Generate different formats
    const qrDataURL = await QRCode.toDataURL(qrData, this.qrConfig);
    const qrSVG = await QRCode.toString(qrData, { ...this.qrConfig, type: 'svg' });

    return {
      qrData,
      qrBuffer: finalBuffer,
      qrDataURL,
      qrSVG,
      signature,
      payload,
    };
  }

  async addLogoToQR(qrBuffer, logoUrl) {
    try {
      const qrImage = sharp(qrBuffer);
      const qrMetadata = await qrImage.metadata();
      
      // Resize logo to 20% of QR code size
      const logoSize = Math.floor(qrMetadata.width * 0.2);
      
      let logoBuffer;
      if (logoUrl.startsWith('http')) {
        const response = await fetch(logoUrl);
        logoBuffer = await response.buffer();
      } else {
        logoBuffer = Buffer.from(logoUrl.split(',')[1], 'base64');
      }
      
      const logo = sharp(logoBuffer).resize(logoSize, logoSize);
      
      const result = await qrImage
        .composite([{
          input: await logo.toBuffer(),
          gravity: 'center',
        }])
        .png()
        .toBuffer();
      
      return result;
    } catch (error) {
      console.error('Failed to add logo to QR:', error);
      return qrBuffer;
    }
  }

  async generateBatchQRs(tickets, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 10;
    
    for (let i = 0; i < tickets.length; i += batchSize) {
      const batch = tickets.slice(i, i + batchSize);
      const batchPromises = batch.map(ticket => 
        this.generateTicketQR(ticket, options)
      );
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Log progress
      console.log(`Generated ${Math.min(i + batchSize, tickets.length)}/${tickets.length} QR codes`);
    }
    
    return results;
  }

  async generateEventPass(eventData, attendees) {
    const passes = [];
    
    for (const attendee of attendees) {
      const qrData = await this.generateTicketQR({
        ticketId: attendee.ticketId,
        ticketNumber: attendee.ticketNumber,
        eventId: eventData.id,
        eventTitle: eventData.title,
        userId: attendee.userId,
        attendeeName: attendee.name,
        tierName: attendee.tierName,
        eventDate: eventData.event_date,
        venueName: eventData.venue_name,
      });
      
      passes.push({
        ...attendee,
        qrCode: qrData.qrDataURL,
        qrBuffer: qrData.qrBuffer,
      });
    }
    
    return passes;
  }

  async generatePrintableTicket(ticketData, qrBuffer) {
    // Generate a printable ticket with QR code
    const ticketHtml = this.generateTicketHTML(ticketData, qrBuffer);
    const pdfBuffer = await this.generatePDF(ticketHtml);
    
    return pdfBuffer;
  }

  generateTicketHTML(ticketData, qrBuffer) {
    const qrBase64 = qrBuffer.toString('base64');
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${ticketData.eventTitle} - Ticket</title>
        <style>
          @page { size: A4; margin: 1cm; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .ticket {
            border: 2px solid #333;
            border-radius: 10px;
            padding: 20px;
            max-width: 600px;
            margin: 0 auto;
          }
          .header { text-align: center; border-bottom: 2px dashed #ccc; padding-bottom: 10px; }
          .event-title { font-size: 24px; color: #e74c3c; margin: 10px 0; }
          .details { margin: 20px 0; }
          .detail-row { margin: 10px 0; }
          .label { font-weight: bold; color: #555; }
          .qr-container { text-align: center; margin: 20px 0; }
          .qr-code { max-width: 200px; }
          .footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="header">
            <h2>TIX CULTURE</h2>
            <div class="event-title">${ticketData.eventTitle}</div>
          </div>
          <div class="details">
            <div class="detail-row"><span class="label">Ticket Number:</span> ${ticketData.ticketNumber}</div>
            <div class="detail-row"><span class="label">Attendee:</span> ${ticketData.attendeeName}</div>
            <div class="detail-row"><span class="label">Ticket Type:</span> ${ticketData.tierName}</div>
            <div class="detail-row"><span class="label">Date:</span> ${new Date(ticketData.eventDate).toLocaleString()}</div>
            <div class="detail-row"><span class="label">Venue:</span> ${ticketData.venueName}</div>
          </div>
          <div class="qr-container">
            <img class="qr-code" src="data:image/png;base64,${qrBase64}" alt="QR Code">
          </div>
          <div class="footer">
            This ticket is unique and non-transferable.<br>
            Present this QR code at the entrance.
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async generatePDF(html) {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setContent(html);
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    return pdf;
  }

  verifyQRData(qrDataString) {
    try {
      // Decode from base64
      const decoded = Buffer.from(qrDataString, 'base64').toString();
      const data = JSON.parse(decoded);
      
      // Verify signature
      const { sig, ...payload } = data;
      const isValid = cryptoUtil.verifySignature(payload, sig);
      
      if (!isValid) {
        return { valid: false, reason: 'Invalid signature' };
      }
      
      // Check expiry
      if (payload.exp && payload.exp < Date.now()) {
        return { valid: false, reason: 'Ticket expired' };
      }
      
      return { valid: true, data: payload };
    } catch (error) {
      return { valid: false, reason: 'Invalid QR format' };
    }
  }

  async generateWalletPass(ticketData, qrBuffer) {
    // Generate Apple Wallet/Google Pay pass format
    const passData = {
      formatVersion: 1,
      passTypeIdentifier: 'pass.com.tixculture.ticket',
      serialNumber: ticketData.ticketNumber,
      teamIdentifier: 'YOUR_TEAM_ID',
      webServiceURL: 'https://api.tixculture.com/passes',
      authenticationToken: crypto.randomBytes(32).toString('hex'),
      organizationName: 'TIX CULTURE',
      description: ticketData.eventTitle,
      logoText: ticketData.eventTitle,
      relevantDate: new Date(ticketData.eventDate).toISOString(),
      barcode: {
        format: 'PKBarcodeFormatQR',
        message: ticketData.ticketNumber,
        messageEncoding: 'utf-8',
        altText: 'Scan QR code for entry',
      },
      locations: [],
      primaryFields: [
        { key: 'event', label: 'Event', value: ticketData.eventTitle },
        { key: 'tier', label: 'Ticket Type', value: ticketData.tierName },
      ],
      secondaryFields: [
        { key: 'attendee', label: 'Attendee', value: ticketData.attendeeName },
        { key: 'date', label: 'Date', value: new Date(ticketData.eventDate).toLocaleDateString() },
      ],
      auxiliaryFields: [
        { key: 'venue', label: 'Venue', value: ticketData.venueName },
      ],
    };
    
    return passData;
  }
}

module.exports = new QRGenerator();