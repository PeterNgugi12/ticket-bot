const crypto = require('crypto');
const CryptoJS = require('crypto-js');

class CryptoUtil {
  constructor() {
    this.secretKey = process.env.JWT_SECRET || 'tix-culture-secret-key';
    this.algorithm = 'aes-256-cbc';
  }

  generateSecureHash(data) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data) + this.secretKey + Date.now())
      .digest('hex');
  }

  generateTicketHash(ticketId, eventId, userId) {
    const data = `${ticketId}:${eventId}:${userId}:${this.secretKey}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  encryptQRData(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      this.algorithm,
      crypto.scryptSync(this.secretKey, 'salt', 32),
      iv
    );
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      iv: iv.toString('hex'),
      content: encrypted,
    };
  }

  decryptQRData(encryptedData) {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      crypto.scryptSync(this.secretKey, 'salt', 32),
      Buffer.from(encryptedData.iv, 'hex')
    );
    
    let decrypted = decipher.update(encryptedData.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
  }

  generateTransactionId() {
    return `TIX_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  generateTicketNumber() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `TIX-${timestamp}-${random}`.toUpperCase();
  }

  signData(data) {
    const hmac = crypto.createHmac('sha256', this.secretKey);
    hmac.update(JSON.stringify(data));
    return hmac.digest('hex');
  }

  verifySignature(data, signature) {
    const expectedSignature = this.signData(data);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

module.exports = new CryptoUtil();