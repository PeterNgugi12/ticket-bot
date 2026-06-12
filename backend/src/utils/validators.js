const Joi = require('joi');

const validators = {
  // User registration validation
  registerUser: Joi.object({
    phoneNumber: Joi.string()
      .pattern(/^\+?[0-9]{10,15}$/)
      .required()
      .messages({
        'string.pattern.base': 'Phone number must be valid (10-15 digits, optional + prefix)',
      }),
    email: Joi.string()
      .email()
      .required()
      .messages({
        'string.email': 'Invalid email address',
      }),
    fullName: Joi.string()
      .min(2)
      .max(100)
      .required()
      .messages({
        'string.min': 'Full name must be at least 2 characters',
        'string.max': 'Full name cannot exceed 100 characters',
      }),
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters',
        'string.pattern.base': 'Password must contain uppercase, lowercase, number, and special character',
      }),
  }),

  // Login validation
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),

  // Phone login validation
  phoneLogin: Joi.object({
    phoneNumber: Joi.string()
      .pattern(/^\+?[0-9]{10,15}$/)
      .required(),
  }),

  // Token refresh validation
  refreshToken: Joi.object({
    refreshToken: Joi.string().required(),
  }),

  // Change password validation
  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required(),
  }),

  // Forgot password validation
  forgotPassword: Joi.object({
    email: Joi.string().email().required(),
  }),

  // Reset password validation
  resetPassword: Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required(),
  }),
};

module.exports = validators;