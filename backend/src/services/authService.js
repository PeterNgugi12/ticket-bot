const UserModel = require('../models/UserModel');
const jwtUtil = require('../utils/jwt');
const passwordUtil = require('../utils/password');
const cacheManager = require('../cache/cacheManager');
const sessionService = require('./sessionService');
const { CACHE_KEYS, CACHE_TTL } = require('../cache/cacheKeys');

class AuthService {
  async register(userData) {
    const { phoneNumber, email, fullName, password } = userData;
    
    // Check if user already exists
    const existingUser = await UserModel.findByPhoneOrEmail(phoneNumber);
    if (existingUser) {
      throw new Error('User with this phone number or email already exists');
    }
    
    // Hash password
    const passwordHash = await passwordUtil.hash(password);
    
    // Create user
    const user = await UserModel.createUser({
      phoneNumber,
      email,
      fullName,
      passwordHash,
      role: 'user',
    });
    
    // Generate tokens
    const tokens = jwtUtil.generateTokens(user);
    
    // Create session
    const sessionToken = await sessionService.createSession(user.id, {
      deviceInfo: userData.deviceInfo,
      ipAddress: userData.ipAddress,
    });
    
    // Cache user data
    await cacheManager.set(
      CACHE_KEYS.USER(user.id),
      user,
      CACHE_TTL.STANDARD
    );
    
    return {
      user,
      tokens,
      sessionToken,
    };
  }

  async login(identifier, password, metadata = {}) {
    // Find user by email or phone
    const user = await UserModel.findByPhoneOrEmail(identifier);
    
    if (!user) {
      throw new Error('Invalid credentials');
    }
    
    if (!user.is_active) {
      throw new Error('Account is deactivated');
    }
    
    // Check password
    const isValidPassword = await passwordUtil.compare(password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }
    
    // Remove password hash from user object
    delete user.password_hash;
    
    // Generate tokens
    const tokens = jwtUtil.generateTokens(user);
    
    // Create session
    const sessionToken = await sessionService.createSession(user.id, {
      deviceInfo: metadata.deviceInfo,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    
    // Update last active
    await UserModel.updateLastActive(user.id);
    
    // Cache user data
    await cacheManager.set(
      CACHE_KEYS.USER(user.id),
      user,
      CACHE_TTL.STANDARD
    );
    
    return {
      user,
      tokens,
      sessionToken,
    };
  }

  async loginWithPhone(phoneNumber, metadata = {}) {
    const user = await UserModel.findByPhone(phoneNumber);
    
    if (!user) {
      // Auto-register if user doesn't exist
      return await this.autoRegister(phoneNumber, metadata);
    }
    
    if (!user.is_active) {
      throw new Error('Account is deactivated');
    }
    
    // Generate OTP (will implement in next step for WhatsApp)
    const otp = this.generateOTP();
    
    // Store OTP in Redis
    await cacheManager.set(
      `otp:${phoneNumber}`,
      { otp, userId: user.id },
      300 // 5 minutes expiry
    );
    
    delete user.password_hash;
    
    return {
      user,
      requiresOTP: true,
      otp, // In production, don't return OTP, send via SMS/WhatsApp
    };
  }

  async verifyOTP(phoneNumber, otp) {
    const storedOTP = await cacheManager.get(`otp:${phoneNumber}`);
    
    if (!storedOTP || storedOTP.otp !== otp) {
      throw new Error('Invalid or expired OTP');
    }
    
    const user = await UserModel.findByPhone(phoneNumber);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Clear OTP
    await cacheManager.del(`otp:${phoneNumber}`);
    
    // Generate tokens
    const tokens = jwtUtil.generateTokens(user);
    
    delete user.password_hash;
    
    return {
      user,
      tokens,
    };
  }

  async autoRegister(phoneNumber, metadata = {}) {
    // Create user with temporary name
    const tempName = `User_${phoneNumber.slice(-6)}`;
    
    const user = await UserModel.createUser({
      phoneNumber,
      email: null, // Will be added later
      fullName: tempName,
      passwordHash: null, // No password for WhatsApp users
      role: 'user',
    });
    
    // Generate OTP for verification
    const otp = this.generateOTP();
    await cacheManager.set(
      `otp:${phoneNumber}`,
      { otp, userId: user.id, isNewUser: true },
      300
    );
    
    return {
      user,
      requiresOTP: true,
      otp, // In production, send via WhatsApp
      isNewUser: true,
    };
  }

  async refreshToken(refreshToken) {
    try {
      const decoded = jwtUtil.verifyToken(refreshToken, 'refresh');
      const newAccessToken = jwtUtil.refreshAccessToken(refreshToken);
      
      return {
        accessToken: newAccessToken,
        refreshToken, // Keep same refresh token
      };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  async logout(sessionToken) {
    if (sessionToken) {
      await sessionService.destroySession(sessionToken);
    }
    return true;
  }

  async logoutAllDevices(userId, currentSessionToken) {
    // Destroy all sessions except current
    const sessions = await sessionService.getUserSessions(userId);
    
    for (const session of sessions) {
      if (session.token !== currentSessionToken) {
        await sessionService.destroySession(session.token);
      }
    }
    
    return sessions.length - 1;
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await UserModel.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check current password
    const isValid = await passwordUtil.compare(currentPassword, user.password_hash);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }
    
    // Validate new password strength
    const strength = passwordUtil.validatePasswordStrength(newPassword);
    if (!strength.isValid) {
      throw new Error(`Weak password: ${strength.errors.join(', ')}`);
    }
    
    // Hash new password
    const newPasswordHash = await passwordUtil.hash(newPassword);
    
    // Update password
    await UserModel.updatePassword(userId, newPasswordHash);
    
    // Invalidate all sessions (force re-login)
    await sessionService.destroyAllUserSessions(userId);
    
    return true;
  }

  async requestPasswordReset(email) {
    const user = await UserModel.findByEmail(email);
    
    if (!user) {
      // Don't reveal if user exists for security
      return true;
    }
    
    // Generate reset token
    const resetToken = jwtUtil.generateAccessToken({
      userId: user.id,
      purpose: 'password_reset',
    });
    
    // Store reset token in Redis
    await cacheManager.set(
      `password_reset:${resetToken}`,
      { userId: user.id },
      3600 // 1 hour expiry
    );
    
    // In production, send email with reset link
    console.log(`Password reset link: http://localhost:3000/reset-password?token=${resetToken}`);
    
    return true;
  }

  async resetPassword(token, newPassword) {
    // Verify token
    let decoded;
    try {
      decoded = jwtUtil.verifyToken(token);
    } catch (error) {
      throw new Error('Invalid or expired reset token');
    }
    
    if (decoded.purpose !== 'password_reset') {
      throw new Error('Invalid token purpose');
    }
    
    // Check if token is still valid in Redis
    const resetData = await cacheManager.get(`password_reset:${token}`);
    if (!resetData) {
      throw new Error('Reset token has expired');
    }
    
    // Validate new password
    const strength = passwordUtil.validatePasswordStrength(newPassword);
    if (!strength.isValid) {
      throw new Error(`Weak password: ${strength.errors.join(', ')}`);
    }
    
    // Hash new password
    const newPasswordHash = await passwordUtil.hash(newPassword);
    
    // Update password
    await UserModel.updatePassword(decoded.userId, newPasswordHash);
    
    // Invalidate reset token
    await cacheManager.del(`password_reset:${token}`);
    
    // Invalidate all sessions
    await sessionService.destroyAllUserSessions(decoded.userId);
    
    return true;
  }

  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async getUserFromToken(accessToken) {
    try {
      const decoded = jwtUtil.verifyToken(accessToken, 'access');
      
      // Try to get from cache
      let user = await cacheManager.get(CACHE_KEYS.USER(decoded.userId));
      
      if (!user) {
        user = await UserModel.findById(decoded.userId);
        if (user) {
          delete user.password_hash;
          await cacheManager.set(
            CACHE_KEYS.USER(decoded.userId),
            user,
            CACHE_TTL.STANDARD
          );
        }
      }
      
      return user;
    } catch (error) {
      return null;
    }
  }
}

module.exports = new AuthService();