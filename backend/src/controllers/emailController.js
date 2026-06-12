const emailService = require('../services/emailService');
const emailTemplateService = require('../services/emailTemplateService');
const { queueManager, QUEUES } = require('../queue/queueManager');

class EmailController {
  async sendTestEmail(req, res, next) {
    try {
      const { to, subject, template, data } = req.body;
      
      const { html, text } = await emailTemplateService.renderTemplate(template, data);
      
      const result = await emailService.sendEmail({
        to,
        subject,
        html,
        text,
        type: 'test',
      });
      
      res.status(200).json({
        success: true,
        message: 'Test email sent',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  
  async previewTemplate(req, res, next) {
    try {
      const { templateName } = req.params;
      const data = req.body;
      
      const html = await emailTemplateService.previewTemplate(templateName, data);
      
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      next(error);
    }
  }
  
  async getTemplates(req, res, next) {
    try {
      const templates = await emailTemplateService.listTemplates();
      
      res.status(200).json({
        success: true,
        data: { templates },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async createTemplate(req, res, next) {
    try {
      const { name, content } = req.body;
      
      await emailTemplateService.createTemplate(name, content);
      
      res.status(201).json({
        success: true,
        message: 'Template created successfully',
      });
    } catch (error) {
      next(error);
    }
  }
  
  async updateTemplate(req, res, next) {
    try {
      const { templateName } = req.params;
      const { content } = req.body;
      
      await emailTemplateService.updateTemplate(templateName, content);
      
      res.status(200).json({
        success: true,
        message: 'Template updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
  
  async deleteTemplate(req, res, next) {
    try {
      const { templateName } = req.params;
      
      await emailTemplateService.deleteTemplate(templateName);
      
      res.status(200).json({
        success: true,
        message: 'Template deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
  
  async trackOpen(req, res, next) {
    try {
      const { emailId } = req.params;
      
      // Log email open
      const db = require('../db/pool');
      await db.query(
        `INSERT INTO email_tracking (email_id, event, created_at)
         VALUES ($1, 'open', CURRENT_TIMESTAMP)`,
        [emailId]
      );
      
      // Return transparent pixel
      const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(pixel);
    } catch (error) {
      next(error);
    }
  }
  
  async trackClick(req, res, next) {
    try {
      const { emailId, link } = req.params;
      const redirectUrl = Buffer.from(link, 'base64').toString();
      
      // Log click
      const db = require('../db/pool');
      await db.query(
        `INSERT INTO email_tracking (email_id, event, metadata, created_at)
         VALUES ($1, 'click', $2, CURRENT_TIMESTAMP)`,
        [emailId, { url: redirectUrl }]
      );
      
      res.redirect(redirectUrl);
    } catch (error) {
      next(error);
    }
  }
  
  async getEmailStats(req, res, next) {
    try {
      const db = require('../db/pool');
      
      const stats = await db.query(`
        SELECT 
          COUNT(*) as total_sent,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as successful,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          COUNT(DISTINCT email) as unique_recipients
        FROM email_logs
        WHERE created_at > NOW() - INTERVAL '30 days'
      `);
      
      const tracking = await db.query(`
        SELECT 
          COUNT(DISTINCT CASE WHEN event = 'open' THEN email_id END) as opens,
          COUNT(DISTINCT CASE WHEN event = 'click' THEN email_id END) as clicks
        FROM email_tracking
        WHERE created_at > NOW() - INTERVAL '30 days'
      `);
      
      res.status(200).json({
        success: true,
        data: {
          ...stats.rows[0],
          opens: tracking.rows[0].opens,
          clicks: tracking.rows[0].clicks,
          openRate: stats.rows[0].successful > 0 
            ? (tracking.rows[0].opens / stats.rows[0].successful * 100).toFixed(2) 
            : 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EmailController();