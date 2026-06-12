const juice = require('juice');
const { htmlToText } = require('html-to-text');

class EmailUtils {
  constructor() {
    this.htmlToTextOptions = {
      wordwrap: 130,
      selectors: [
        { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
        { selector: 'img', format: 'skip' },
      ],
    };
  }

  inlineCss(html) {
    return juice(html);
  }

  convertToText(html) {
    return htmlToText(html, this.htmlToTextOptions);
  }

  validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  sanitizeEmail(email) {
    return email.toLowerCase().trim();
  }

  generateUnsubscribeToken(email) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(email + process.env.JWT_SECRET).digest('hex');
  }

  extractImagesFromHtml(html) {
    const images = [];
    const imgRegex = /<img[^>]+src="([^">]+)"/g;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      images.push(match[1]);
    }
    return images;
  }

  addTrackingPixel(html, emailId) {
    const trackingPixel = `<img src="${process.env.APP_URL}/api/v1/email/track/${emailId}/open" width="1" height="1" style="display:none;">`;
    return html.replace('</body>', `${trackingPixel}</body>`);
  }

  addUTMParameters(html, campaign, source) {
    const utmParams = `utm_source=${source}&utm_medium=email&utm_campaign=${campaign}`;
    const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>/g;
    
    let modifiedHtml = html;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const originalUrl = match[1];
      const separator = originalUrl.includes('?') ? '&' : '?';
      const newUrl = `${originalUrl}${separator}${utmParams}`;
      modifiedHtml = modifiedHtml.replace(originalUrl, newUrl);
    }
    
    return modifiedHtml;
  }

  createEmailHeaders(emailData) {
    return {
      'X-Entity-Ref-ID': emailData.id,
      'X-Ticket-Number': emailData.ticketNumber,
      'X-Event-ID': emailData.eventId,
      'X-User-ID': emailData.userId,
      'X-Email-Type': emailData.type,
      'X-Priority': emailData.priority || 'normal',
      'List-Unsubscribe': `<${process.env.APP_URL}/api/v1/email/unsubscribe/${emailData.userId}>`,
      'Feedback-ID': `${emailData.type}:${emailData.id}:tixculture`,
    };
  }

  async getEmailProvider() {
    const provider = process.env.EMAIL_PROVIDER || 'smtp';
    
    switch (provider) {
      case 'ses':
        return require('./sesProvider');
      case 'sendgrid':
        return require('./sendgridProvider');
      default:
        return require('./smtpProvider');
    }
  }
}

module.exports = new EmailUtils();