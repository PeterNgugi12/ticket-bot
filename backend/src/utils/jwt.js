const jwt = require('jsonwebtoken');
const config = require('../config');

class JWTUtil {
  constructor() {
    this.secret = config.jwt.secret;
    this.accessExpiry = config.jwt.expiresIn || '15m';
    this.refreshExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';
    this.issuer = process.env.JWT_ISSUER || 'tix-culture';
    this.audience = process.env.JWT_AUDIENCE || 'tix-culture-api';
  }

  generateAccessToken(payload) {
    return jwt.sign(
      {
        ...payload,
        type: 'access',
      },
      this.secret,
      {
        expiresIn: this.accessExpiry,
        issuer: this.issuer,
        audience: this.audience,
      }
    );
  }

  generateRefreshToken(payload) {
    return jwt.sign(
      {
        ...payload,
        type: 'refresh',
      },
      this.secret,
      {
        expiresIn: this.refreshExpiry,
        issuer: this.issuer,
        audience: this.audience,
      }
    );
  }

  generateTokens(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      phoneNumber: user.phone_number,
      role: user.role,
    };

    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
      expiresIn: this.getExpirySeconds(this.accessExpiry),
    };
  }

  verifyToken(token, type = 'access') {
    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: this.issuer,
        audience: this.audience,
      });

      // Check token type
      if (decoded.type !== type) {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  refreshAccessToken(refreshToken) {
    const decoded = this.verifyToken(refreshToken, 'refresh');
    const { userId, email, phoneNumber, role } = decoded;
    
    return this.generateAccessToken({
      userId,
      email,
      phoneNumber,
      role,
    });
  }

  decodeToken(token) {
    return jwt.decode(token);
  }

  getExpirySeconds(expiryString) {
    const match = expiryString.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // default 15 minutes
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 900;
    }
  }
}

module.exports = new JWTUtil();