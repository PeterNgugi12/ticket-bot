const QRScanner = require('../utils/qrScanner');
const ImageProcessorService = require('./imageProcessorService');
const ScanLogModel = require('../models/ScanLogModel');
const CheckinModel = require('../models/CheckinModel');
const TicketModel = require('../models/TicketModel');
const { queueManager, QUEUES } = require('../queue/queueManager');

class ScanService {
  async processScan(imageBuffer, scannerId, eventId = null, metadata = {}) {
    const startTime = Date.now();
    
    try {
      // Validate image quality
      const qualityCheck = await ImageProcessorService.validateImageQuality(imageBuffer);
      if (!qualityCheck.valid) {
        return {
          success: false,
          error: qualityCheck.reason,
          scanTime: Date.now() - startTime,
        };
      }
      
      // Enhance image for better QR detection
      const enhancedImage = await ImageProcessorService.enhanceImageForQR(imageBuffer);
      
      // Extract and validate QR
      const scanResult = await QRScanner.processScanImage(enhancedImage, scannerId, eventId);
      
      // Log scan attempt
      const scanLog = await ScanLogModel.createScanLog({
        ticketId: scanResult.ticketData.id, 
        scannerId,
        eventId: eventId || scanResult.ticketData?.event_id,
        scanStatus: scanResult.success ? 'valid' : 
                    scanResult.error?.includes('already') ? 'already_used' :
                    scanResult.error?.includes('wrong') ? 'wrong_event' : 'invalid',
        qrData: scanResult.qrData,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        locationData: metadata.locationData,
      });
      
      // If valid, create check-in record
      if (scanResult.success && scanResult.ticketData) {
        const checkin = await CheckinModel.createCheckin({
          ticketId: scanResult.ticketData.id,
          eventId: scanResult.ticketData.event_id,
          userId: scanResult.ticketData.user_id,
          scannerId,
          gateNumber: metadata.gateNumber,
          verifiedBy: metadata.verifiedBy,
          metadata: { scanLogId: scanLog.id, ...metadata },
        });
        
        // Mark ticket as used
        await TicketModel.markTicketAsUsed(scanResult.ticketData.id, scannerId);
        
        // Queue notification to attendee
        await queueManager.addJob(QUEUES.NOTIFICATION, 'ticket_scanned', {
          userId: scanResult.ticketData.user_id,
          ticketId: scanResult.ticketData.id,
          eventId: scanResult.ticketData.event_id,
          scannedAt: new Date(),
          scannerId,
        });
        
        scanResult.checkin = checkin;
      }
      
      return {
        success: scanResult.success,
        error: scanResult.error,
        ticketData: scanResult.ticketData,
        scanLog,
        scanTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Scan processing failed:', error);
      return {
        success: false,
        error: 'Failed to process scan: ' + error.message,
        scanTime: Date.now() - startTime,
      };
    }
  }

  async processScanFromBase64(base64Image, scannerId, eventId = null, metadata = {}) {
    const buffer = Buffer.from(base64Image.split(',')[1] || base64Image, 'base64');
    return await this.processScan(buffer, scannerId, eventId, metadata);
  }

  async getEventScans(eventId, date = null, limit = 100, offset = 0) {
    return await ScanLogModel.getScansByEvent(eventId, date, limit, offset);
  }

  async getEventCheckins(eventId, limit = 100, offset = 0) {
    return await CheckinModel.getCheckinsByEvent(eventId, limit, offset);
  }

  async getScanStats(eventId, date = null) {
    const scanStats = await ScanLogModel.getScanStats(eventId, date);
    const checkinStats = await CheckinModel.getCheckinStats(eventId);
    const hourlyCheckins = await CheckinModel.getHourlyCheckins(eventId);
    
    return {
      scans: scanStats,
      checkins: checkinStats,
      hourlyCheckins,
    };
  }

  async getTicketScans(ticketId) {
    return await ScanLogModel.getScansByTicket(ticketId);
  }

  async getRecentScans(limit = 50) {
    return await ScanLogModel.getRecentScans(limit);
  }

  async verifyMultipleTickets(ticketNumbers, eventId, scannerId) {
    const results = [];
    
    for (const ticketNumber of ticketNumbers) {
      const verification = await TicketModel.checkTicketValidityByNumber(ticketNumber, eventId);
      results.push({
        ticketNumber,
        valid: verification.valid,
        reason: verification.reason,
        ticketData: verification.ticket,
      });
    }
    
    return results;
  }
}

module.exports = new ScanService();