// backend/src/controllers/scannerController.js
const ScannerTeamMemberModel = require('../models/ScannerTeamMemberModel');
const TicketModel = require('../models/TicketModel');
const EventModel = require('../models/EventModel');
const passwordUtil = require('../utils/password');
const jwt = require('jsonwebtoken');

class ScannerController {
  // Scanner login for mobile app
  async scannerLogin(req, res, next) {
    try {
      const { email, password, apiKey } = req.body;
      
      let scanner;
      
      if (apiKey) {
        scanner = await ScannerTeamMemberModel.getTeamMemberByApiKey(apiKey);
      } else if (email && password) {
        const result = await ScannerTeamMemberModel.db.query(
          'SELECT * FROM scanner_team_members WHERE email = $1 AND is_active = true',
          [email]
        );
        scanner = result.rows[0];
        
        if (scanner && await passwordUtil.compare(password, scanner.password_hash)) {
          // Valid credentials
        } else {
          scanner = null;
        }
      }
      
      if (!scanner) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials',
        });
      }
      
      if (scanner.status !== 'active') {
        return res.status(401).json({
          success: false,
          message: `Account is ${scanner.status}`,
        });
      }
      
      // Generate mobile session token
      const sessionToken = jwt.sign(
        {
          id: scanner.id,
          role: 'scanner',
          eventId: scanner.event_id,
        },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );
      
      // Update last login
      await ScannerTeamMemberModel.db.query(
        'UPDATE scanner_team_members SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [scanner.id]
      );
      
      res.status(200).json({
        success: true,
        data: {
          id: scanner.id,
          name: scanner.name,
          email: scanner.email,
          eventId: scanner.event_id,
          eventTitle: scanner.event_title,
          sessionToken,
          apiKey: scanner.api_key,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Validate scanner API key middleware
  async validateScannerApiKey(req, res, next) {
    try {
      // Check both x-api-key header and Authorization header (for Bearer tokens if needed)
      let apiKey = req.headers['x-api-key'];
      
      // Also check if the Authorization header contains an API key
      if (!apiKey && req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
          // This is a JWT token, not an API key - skip for scanner routes
          // The authMiddleware will handle this
          return next();
        } else if (authHeader.startsWith('ApiKey ')) {
          apiKey = authHeader.substring(7);
        }
      }
      
      console.log('Validating API key:', apiKey ? 'Present' : 'Missing');
      
      if (!apiKey) {
        return res.status(401).json({
          success: false,
          message: 'API key required. Please provide x-api-key header.',
        });
      }
      
      const scanner = await ScannerTeamMemberModel.getTeamMemberByApiKey(apiKey);
      
      if (!scanner) {
        return res.status(401).json({
          success: false,
          message: 'Invalid API key',
        });
      }
      
      console.log('Scanner validated:', { id: scanner.id, name: scanner.name, eventId: scanner.event_id });
      
      req.scanner = scanner;
      req.scannerId = scanner.id;
      next();
    } catch (error) {
      console.error('API key validation error:', error);
      next(error);
    }
  }
  
  // Verify scanner (for mobile app)
  async verifyScanner(req, res, next) {
    try {
      const { sessionToken } = req.body;
      
      if (!sessionToken) {
        return res.status(401).json({
          success: false,
          message: 'Session token required',
        });
      }
      
      const decoded = jwt.verify(sessionToken, process.env.JWT_SECRET);
      
      const scanner = await ScannerTeamMemberModel.db.query(
        'SELECT * FROM scanner_team_members WHERE id = $1 AND status = $2 AND is_active = true',
        [decoded.id, 'active']
      );
      
      if (!scanner.rows[0]) {
        return res.status(401).json({
          success: false,
          message: 'Invalid session',
        });
      }
      
      res.status(200).json({
        success: true,
        data: { scanner: scanner.rows[0] },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Scan ticket
 // backend/src/controllers/scannerController.js

// Scan ticket
async scanTicket(req, res, next) {
  try {
    console.log('=== SCAN TICKET REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const scannerId = req.scannerId;
    const scanner = req.scanner;
    
    let ticketNumber;
    let qrSecret;
    let eventId;
    
    // Handle different request formats
    if (req.body.qrData) {
      // Format 1: QR data as JSON string
      let ticketData;
      try {
        ticketData = JSON.parse(req.body.qrData);
      } catch (e) {
        ticketData = { ticketNumber: req.body.qrData };
      }
      ticketNumber = ticketData.ticketNumber || ticketData.ticketId;
      qrSecret = ticketData.qrSecret;
      eventId = ticketData.eventId;
    } else {
      // Format 2: Direct fields (what your mobile app sends)
      ticketNumber = req.body.ticketId;
      qrSecret = req.body.qrSecret;
      eventId = req.body.eventId;
    }
    
    console.log('Parsed data:', { ticketNumber, eventId, scannerEventId: scanner.event_id });
    
    if (!ticketNumber) {
      await ScannerTeamMemberModel.recordScan(scannerId, null, 'invalid', {
        error: 'No ticket number provided',
      });
      
      return res.status(400).json({
        success: false,
        message: 'Invalid QR code - No ticket number',
      });
    }
    
    // Get ticket by ticket_number (not by ID)
    const ticket = await TicketModel.getTicketByNumber(ticketNumber);
    
    console.log('Ticket found:', ticket ? {
      id: ticket.id,
      ticket_number: ticket.ticket_number,
      event_id: ticket.event_id,
      status: ticket.status,
      has_qr_secret: !!ticket.qr_secret
    } : 'NOT FOUND');
    
    if (!ticket) {
      await ScannerTeamMemberModel.recordScan(scannerId, null, 'invalid', {
        ticketNumber,
        error: 'Ticket not found',
      });
      
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }
    
    // Verify QR secret if provided
    if (qrSecret && ticket.qr_secret && ticket.qr_secret !== qrSecret) {
      await ScannerTeamMemberModel.recordScan(scannerId, ticket.id, 'failed', {
        ticketNumber,
        error: 'Invalid QR secret',
      });
      
      return res.status(400).json({
        success: false,
        message: 'Invalid QR code - Security verification failed',
      });
    }
    
    // Check if ticket belongs to scanner's event
    if (ticket.event_id !== scanner.event_id) {
      await ScannerTeamMemberModel.recordScan(scannerId, ticket.id, 'failed', {
        ticketNumber,
        error: 'Wrong event',
        ticketEvent: ticket.event_title,
        scannerEvent: scanner.event_title,
      });
      
      return res.status(400).json({
        success: false,
        message: `This ticket is for a different event`,
      });
    }
    
    // Check ticket status
    if (ticket.status === 'used' || ticket.checked_in_at) {
      await ScannerTeamMemberModel.recordScan(scannerId, ticket.id, 'already_used', {
        ticketNumber,
        usedAt: ticket.checked_in_at,
      });
      
      return res.status(400).json({
        success: false,
        message: 'Ticket already used',
        data: { usedAt: ticket.checked_in_at },
      });
    }
    
    if (ticket.status !== 'valid') {
      await ScannerTeamMemberModel.recordScan(scannerId, ticket.id, 'failed', {
        ticketNumber,
        status: ticket.status,
      });
      
      return res.status(400).json({
        success: false,
        message: `Ticket is ${ticket.status}`,
      });
    }
    
    // Mark ticket as used
    await TicketModel.markTicketAsUsed(ticket.id, scannerId);
    
    // Record successful scan
    await ScannerTeamMemberModel.recordScan(scannerId, ticket.id, 'success', {
      ticketNumber,
      attendeeName: ticket.attendee_name,
    });
    
    // Update scan count
    await ScannerTeamMemberModel.db.query(
      'UPDATE scanner_team_members SET scans_count = scans_count + 1 WHERE id = $1',
      [scannerId]
    );
    
    res.status(200).json({
      success: true,
      message: 'Ticket validated successfully',
      data: {
        ticketNumber: ticket.ticket_number,
        attendeeName: ticket.attendee_name,
        eventTitle: ticket.event_title,
        checkedInAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Scan ticket error:', error);
    next(error);
  }
}
  
  // Get scanner stats
  async getScannerStats(req, res, next) {
    try {
      const scannerId = req.scannerId;
      const period = req.query.period || 'today';
      
      const stats = await ScannerTeamMemberModel.getScanStats(scannerId, period);
      
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Get assigned event
  async getAssignedEvent(req, res, next) {
    try {
      const scanner = req.scanner;
      
      const event = await EventModel.getEventWithDetails(scanner.event_id);
      
      res.status(200).json({
        success: true,
        data: { event },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Heartbeat (update last active)
  async heartbeat(req, res, next) {
    try {
      const scannerId = req.scannerId;
      
      await ScannerTeamMemberModel.db.query(
        'UPDATE scanner_team_members SET last_active = CURRENT_TIMESTAMP WHERE id = $1',
        [scannerId]
      );
      
      res.status(200).json({
        success: true,
        message: 'Heartbeat recorded',
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Organizer: Add team member
  async addTeamMember(req, res, next) {
    try {
      console.log('=== ADD TEAM MEMBER DEBUG ===');
      console.log('req.userId:', req.userId);
      console.log('req.user:', req.user);
      console.log('req.user.role:', req.user?.role);
      
      const organizerId = req.userId;
      const { name, email, phone, password, eventId } = req.body;
      
      console.log('Request body:', { name, email, phone, eventId });
      
      // Verify event belongs to organizer
      const event = await EventModel.findById(eventId);
      console.log('Found event:', event ? { id: event.id, organizer_id: event.organizer_id } : 'Not found');
      
      if (!event || event.organizer_id !== organizerId) {
        console.log('Event validation failed:', {
          eventExists: !!event,
          eventOrganizerId: event?.organizer_id,
          requestOrganizerId: organizerId
        });
        return res.status(400).json({
          success: false,
          message: 'Invalid event',
        });
      }
      
      const member = await ScannerTeamMemberModel.createTeamMember({
        organizerId,
        eventId,
        name,
        email,
        phone,
        password,
      });
      
      res.status(201).json({
        success: true,
        message: 'Team member added successfully',
        data: { member },
      });
    } catch (error) {
      console.error('Add team member error:', error);
      next(error);
    }
  }
  
  // Organizer: Get team members
  async getTeamMembers(req, res, next) {
    try {
      const organizerId = req.userId;
      const { eventId } = req.query;
      
      const members = await ScannerTeamMemberModel.getTeamMembersByOrganizer(organizerId, eventId);
      
      res.status(200).json({
        success: true,
        data: { members, count: members.length },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Organizer: Update team member status
  async updateTeamMemberStatus(req, res, next) {
    try {
      const organizerId = req.userId;
      const { memberId } = req.params;
      const { status } = req.body;
      
      const member = await ScannerTeamMemberModel.updateStatus(memberId, organizerId, status);
      
      if (!member) {
        return res.status(404).json({
          success: false,
          message: 'Team member not found',
        });
      }
      
      res.status(200).json({
        success: true,
        message: `Team member ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
        data: { member },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Organizer: Delete team member
  async deleteTeamMember(req, res, next) {
    try {
      const organizerId = req.userId;
      const { memberId } = req.params;
      
      const member = await ScannerTeamMemberModel.deleteTeamMember(memberId, organizerId);
      
      if (!member) {
        return res.status(404).json({
          success: false,
          message: 'Team member not found',
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Team member removed successfully',
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Organizer: Get team member stats
  async getTeamMemberStats(req, res, next) {
    try {
      const organizerId = req.userId;
      const { memberId } = req.params;
      
      const member = await ScannerTeamMemberModel.getTeamMemberById(memberId, organizerId);
      
      if (!member) {
        return res.status(404).json({
          success: false,
          message: 'Team member not found',
        });
      }
      
      const stats = await ScannerTeamMemberModel.getScanStats(memberId, 'all');
      
      res.status(200).json({
        success: true,
        data: { member, stats },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Get recent scans for this scanner
  async getRecentScans(req, res, next) {
    try {
      const scannerId = req.scannerId;
      const limit = parseInt(req.query.limit) || 20;
      
      console.log('Fetching recent scans for scanner:', scannerId);
      
      const result = await ScannerTeamMemberModel.db.query(
        `SELECT 
          sl.id, 
          sl.result,
          sl.scanned_at,
          t.ticket_number as ticket_id, 
          t.attendee_name as name, 
          tt.name as ticket_type,
          e.title as event_title,
          e.venue_name as event_venue
         FROM scan_logs sl
         JOIN tickets t ON t.id = sl.ticket_id
         JOIN ticket_tiers tt ON tt.id = t.tier_id
         JOIN events e ON e.id = t.event_id
         WHERE sl.scanner_id = $1
         ORDER BY sl.scanned_at DESC
         LIMIT $2`,
        [scannerId, limit]
      );
      
      console.log(`Found ${result.rows.length} scans for scanner ${scannerId}`);
      
      const formatTimeAgo = (date) => {
        const seconds = Math.floor((new Date() - new Date(date)) / 1000);
        if (seconds < 60) return `${seconds} sec ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hr ago`;
        const days = Math.floor(hours / 24);
        return `${days} day${days > 1 ? 's' : ''} ago`;
      };
      
      const recentScans = result.rows.map(scan => ({
        id: scan.id,
        name: scan.name,
        ticketType: scan.ticket_type,
        time: formatTimeAgo(scan.scanned_at),
        status: scan.result === 'success' ? 'valid' : 'invalid',
        ticketId: scan.ticket_id
      }));
      
      res.status(200).json({
        success: true,
        data: { scans: recentScans }
      });
    } catch (error) {
      console.error('Error fetching recent scans:', error);
      next(error);
    }
  }
  
  // Change password
  async changePassword(req, res, next) {
    try {
      const scannerId = req.scannerId;
      const { currentPassword, newPassword } = req.body;
      
      // Get scanner from database
      const result = await ScannerTeamMemberModel.db.query(
        'SELECT * FROM scanner_team_members WHERE id = $1',
        [scannerId]
      );
      
      const scanner = result.rows[0];
      
      // Verify current password
      const isValid = await passwordUtil.compare(currentPassword, scanner.password_hash);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect',
        });
      }
      
      // Hash new password
      const newPasswordHash = await passwordUtil.hash(newPassword);
      
      // Update password
      await ScannerTeamMemberModel.db.query(
        'UPDATE scanner_team_members SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newPasswordHash, scannerId]
      );
      
      res.status(200).json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ScannerController();