const scanService = require('../../services/scanService');
const MessageFormatter = require('../utils/messageFormatter');

class ScanHandler {
  async handleQRImage(sock, sender, imageBuffer, organizerId, eventId = null) {
    try {
      // Show processing indicator
      await sock.sendPresenceUpdate('composing', sender);
      
      // Process the scan
      const result = await scanService.processScan(
        imageBuffer,
        organizerId,
        eventId,
        {
          userAgent: 'WhatsApp Bot',
          source: 'whatsapp',
        }
      );
      
      // Format response based on result
      let response;
      
      if (result.success && result.ticketData) {
        response = MessageFormatter.createScanResult(true, {
          attendee_name: result.ticketData.attendee_name,
          tier_name: result.ticketData.tier_name,
          event_title: result.ticketData.event_title,
          ticket_number: result.ticketData.ticket_number,
        });
        
        // Add additional info
        response += `\n\n${MessageFormatter.divider()}\n`;
        response += `🕒 Checked in at: ${new Date().toLocaleTimeString()}\n`;
        response += `🎟️ Ticket ID: ${result.ticketData.ticket_number}`;
      } else {
        response = MessageFormatter.createScanResult(false, {
          reason: result.error,
        });
      }
      
      // Add scan time info
      response += `\n\n⏱️ Scan completed in ${result.scanTime}ms`;
      
      await sock.sendMessage(sender, { text: response });
      
      return result;
    } catch (error) {
      console.error('WhatsApp scan handler error:', error);
      await sock.sendMessage(sender, {
        text: '❌ *Scan Failed*\n\nUnable to process the image. Please ensure:\n• The QR code is clearly visible\n• The image is well-lit\n• You\'re sending a valid ticket QR code',
      });
      return { success: false, error: error.message };
    }
  }

  async handleBulkScan(sock, sender, ticketNumbers, organizerId, eventId) {
    const results = await scanService.verifyMultipleTickets(ticketNumbers, eventId, organizerId);
    
    let response = '📊 *Bulk Verification Results*\n\n';
    response += MessageFormatter.divider() + '\n\n';
    
    let validCount = 0;
    let invalidCount = 0;
    
    for (const result of results) {
      if (result.valid) {
        validCount++;
        response += `✅ ${result.ticketNumber}\n`;
        response += `   ${result.ticketData?.attendee_name}\n`;
        response += `   ${result.ticketData?.tier_name}\n\n`;
      } else {
        invalidCount++;
        response += `❌ ${result.ticketNumber}\n`;
        response += `   ${result.reason}\n\n`;
      }
    }
    
    response += MessageFormatter.divider() + '\n';
    response += `📈 Summary: ${validCount} valid, ${invalidCount} invalid`;
    
    await sock.sendMessage(sender, { text: response });
    
    return { validCount, invalidCount };
  }
}

module.exports = new ScanHandler();