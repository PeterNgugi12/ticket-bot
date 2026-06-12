const authService = require('../services/authService');
const validators = require('../utils/validators');
const passwordUtil = require('../utils/password');

class AuthController {
  async register(req, res, next) {
    try {
      // Validate input
      const { error, value } = validators.registerUser.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Validation Error',
          message: error.details[0].message,
        });
      }
      
      const { phoneNumber, email, fullName, password } = value;
      
      const result = await authService.register({
        phoneNumber,
        email,
        fullName,
        password,
        deviceInfo: req.headers['user-agent'],
        ipAddress: req.ip,
      });
      
      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  
  async login(req, res, next) {
    try {
      const { error, value } = validators.login.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Validation Error',
          message: error.details[0].message,
        });
      }
      
      const { email, password } = value;
      
      const result = await authService.login(email, password, {
        deviceInfo: req.headers['user-agent'],
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      
      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  
  async loginWithPhone(req, res, next) {
    try {
      const { error, value } = validators.phoneLogin.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Validation Error',
          message: error.details[0].message,
        });
      }
      
      const { phoneNumber } = value;
      
      const result = await authService.loginWithPhone(phoneNumber, {
        deviceInfo: req.headers['user-agent'],
        ipAddress: req.ip,
      });
      
      res.status(200).json({
        success: true,
        message: result.requiresOTP ? 'OTP sent' : 'Login successful',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  
  async verifyOTP(req, res, next) {
    try {
      const { phoneNumber, otp } = req.body;
      
      if (!phoneNumber || !otp) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Phone number and OTP are required',
        });
      }
      
      const result = await authService.verifyOTP(phoneNumber, otp);
      
      res.status(200).json({
        success: true,
        message: 'OTP verified successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  
  async refreshToken(req, res, next) {
    try {
      const { error, value } = validators.refreshToken.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Validation Error',
          message: error.details[0].message,
        });
      }
      
      const { refreshToken } = value;
      
      const result = await authService.refreshToken(refreshToken);
      
      res.status(200).json({
        success: true,
        message: 'Token refreshed',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  
  async logout(req, res, next) {
    try {
      const sessionToken = req.headers['x-session-token'];
      
      await authService.logout(sessionToken);
      
      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }
  
  async logoutAllDevices(req, res, next) {
    try {
      const sessionToken = req.headers['x-session-token'];
      
      const count = await authService.logoutAllDevices(req.userId, sessionToken);
      
      res.status(200).json({
        success: true,
        message: `Logged out from ${count} other devices`,
        data: { devicesLoggedOut: count },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async changePassword(req, res, next) {
    try {
      const { error, value } = validators.changePassword.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Validation Error',
          message: error.details[0].message,
        });
      }
      
      const { currentPassword, newPassword } = value;
      
      await authService.changePassword(req.userId, currentPassword, newPassword);
      
      res.status(200).json({
        success: true,
        message: 'Password changed successfully. Please login again.',
      });
    } catch (error) {
      next(error);
    }
  }
  
  async forgotPassword(req, res, next) {
    try {
      const { error, value } = validators.forgotPassword.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Validation Error',
          message: error.details[0].message,
        });
      }
      
      const { email } = value;
      
      await authService.requestPasswordReset(email);
      
      res.status(200).json({
        success: true,
        message: 'If an account exists with that email, you will receive password reset instructions.',
      });
    } catch (error) {
      next(error);
    }
  }
  
  async resetPassword(req, res, next) {
    try {
      const { error, value } = validators.resetPassword.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Validation Error',
          message: error.details[0].message,
        });
      }
      
      const { token, newPassword } = value;
      
      await authService.resetPassword(token, newPassword);
      
      res.status(200).json({
        success: true,
        message: 'Password reset successfully. Please login with your new password.',
      });
    } catch (error) {
      next(error);
    }
  }
  
  async getProfile(req, res, next) {
    try {
      const user = req.user;
      
      res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }
  
  async updateProfile(req, res, next) {
    try {
      const { fullName, email } = req.body;
      const updates = {};
      
      if (fullName) updates.full_name = fullName;
      if (email) updates.email = email;
      
      // Add validation for email uniqueness
      if (email) {
        const existingUser = await UserModel.findByEmail(email);
        if (existingUser && existingUser.id !== req.userId) {
          return res.status(400).json({
            error: 'Validation Error',
            message: 'Email already in use',
          });
        }
      }
      
      const updatedUser = await UserModel.update(req.userId, updates);
      delete updatedUser.password_hash;
      
      // Update cache
      await cacheManager.set(CACHE_KEYS.USER(req.userId), updatedUser, CACHE_TTL.STANDARD);
      
      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: { user: updatedUser },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();