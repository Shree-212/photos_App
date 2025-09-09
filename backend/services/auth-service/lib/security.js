// Security middleware and utilities for Task Manager services

const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

/**
 * Enhanced JWT Management with rotation support
 */
class JWTManager {
  constructor() {
    this.currentSecret = process.env.JWT_SECRET || this.generateSecret();
    this.previousSecret = process.env.JWT_PREVIOUS_SECRET || null;
    this.rotationInterval = process.env.JWT_ROTATION_INTERVAL || '7d'; // 7 days
    this.expiresIn = process.env.JWT_EXPIRES_IN || '24h';
  }

  generateSecret() {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Generate JWT token with current secret
   */
  generateToken(payload) {
    return jwt.sign(payload, this.currentSecret, {
      expiresIn: this.expiresIn,
      issuer: 'task-manager',
      audience: 'task-manager-users'
    });
  }

  /**
   * Verify JWT token, trying current secret first, then previous
   */
  verifyToken(token) {
    try {
      // Try current secret first
      return jwt.verify(token, this.currentSecret, {
        issuer: 'task-manager',
        audience: 'task-manager-users'
      });
    } catch (error) {
      if (this.previousSecret) {
        try {
          // Fallback to previous secret for graceful rotation
          const decoded = jwt.verify(token, this.previousSecret, {
            issuer: 'task-manager',
            audience: 'task-manager-users'
          });
          // Mark token for re-issuance
          decoded._shouldRotate = true;
          return decoded;
        } catch (previousError) {
          throw error; // Throw original error
        }
      }
      throw error;
    }
  }

  /**
   * Rotate JWT secret
   */
  rotateSecret() {
    this.previousSecret = this.currentSecret;
    this.currentSecret = this.generateSecret();
    
    // In production, these should be saved to a secure store
    console.log('JWT secret rotated. Update environment variables:');
    console.log(`JWT_SECRET=${this.currentSecret}`);
    console.log(`JWT_PREVIOUS_SECRET=${this.previousSecret}`);
  }
}

/**
 * Enhanced rate limiting configurations
 */
const createRateLimiter = (windowMs, max, message, skipSuccessfulRequests = false) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    handler: (req, res) => {
      res.status(429).json({
        error: message,
        retryAfter: Math.round(windowMs / 1000)
      });
    }
  });
};

// Rate limiting configurations
const rateLimiters = {
  // General API rate limiting
  general: createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    100, // requests
    'Too many requests from this IP, please try again later.'
  ),

  // Strict rate limiting for authentication
  auth: createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    5, // requests
    'Too many authentication attempts, please try again later.'
  ),

  // File upload rate limiting
  upload: createRateLimiter(
    60 * 1000, // 1 minute
    10, // requests
    'Too many upload attempts, please try again later.'
  ),

  // Password reset rate limiting
  passwordReset: createRateLimiter(
    60 * 60 * 1000, // 1 hour
    3, // requests
    'Too many password reset attempts, please try again later.'
  )
};

/**
 * Security headers middleware
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for file uploads
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

/**
 * Authentication middleware with JWT rotation support
 */
const createAuthMiddleware = (jwtManager, redisClient = null) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      // Verify token
      const decoded = jwtManager.verifyToken(token);

      // Check if token should be rotated
      if (decoded._shouldRotate) {
        const newToken = jwtManager.generateToken({
          userId: decoded.userId,
          email: decoded.email,
          firstName: decoded.firstName,
          lastName: decoded.lastName
        });
        
        res.set('X-New-Token', newToken);
      }

      // Check token blacklist in Redis (if available)
      if (redisClient) {
        const isBlacklisted = await redisClient.get(`blacklist:${token}`);
        if (isBlacklisted) {
          return res.status(401).json({ error: 'Token has been revoked' });
        }
      }

      req.user = decoded;
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid token' });
      }
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      
      console.error('Authentication error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  };
};

/**
 * Input validation and sanitization utilities
 */
const sanitizers = {
  /**
   * Sanitize string input
   */
  sanitizeString: (str, maxLength = 255) => {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, maxLength);
  },

  /**
   * Sanitize email input
   */
  sanitizeEmail: (email) => {
    if (typeof email !== 'string') return '';
    return email.toLowerCase().trim();
  },

  /**
   * Validate and sanitize file upload
   */
  validateFileUpload: (file, allowedTypes = [], maxSize = 10 * 1024 * 1024) => {
    const errors = [];

    if (!file) {
      errors.push('No file provided');
      return { valid: false, errors };
    }

    // Check file size
    if (file.size > maxSize) {
      errors.push(`File size exceeds ${maxSize} bytes`);
    }

    // Check file type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
      errors.push(`File type ${file.mimetype} not allowed`);
    }

    // Check file name
    const dangerousChars = /[<>:"/\\|?*\x00-\x1f]/g;
    if (dangerousChars.test(file.originalname)) {
      errors.push('File name contains dangerous characters');
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitizedFilename: file.originalname.replace(dangerousChars, '_')
    };
  }
};

/**
 * Password strength validation
 */
const validatePasswordStrength = (password) => {
  const errors = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  // Check for common patterns
  const commonPatterns = [
    /123456/,
    /password/i,
    /qwerty/i,
    /abc123/i
  ];
  
  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      errors.push('Password contains common patterns');
      break;
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Secure password hashing
 */
const hashPassword = async (password) => {
  const saltRounds = 12; // Higher than default for better security
  return await bcrypt.hash(password, saltRounds);
};

/**
 * Token blacklist utility for logout
 */
const blacklistToken = async (redisClient, token, expiresIn = '24h') => {
  if (!redisClient) return;
  
  const expiry = expiresIn.endsWith('h') 
    ? parseInt(expiresIn) * 3600 
    : parseInt(expiresIn);
    
  await redisClient.setEx(`blacklist:${token}`, expiry, 'true');
};

/**
 * Security audit logging
 */
const auditLogger = (logger) => {
  return {
    logAuthAttempt: (req, success, reason = null) => {
      logger.info('Authentication attempt', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        success,
        reason,
        timestamp: new Date().toISOString()
      });
    },

    logSecurityEvent: (event, details = {}) => {
      logger.warn('Security event', {
        event,
        ...details,
        timestamp: new Date().toISOString()
      });
    },

    logPrivilegedAction: (req, action, target = null) => {
      logger.info('Privileged action', {
        userId: req.user?.userId,
        ip: req.ip,
        action,
        target,
        timestamp: new Date().toISOString()
      });
    }
  };
};

module.exports = {
  JWTManager,
  rateLimiters,
  securityHeaders,
  createAuthMiddleware,
  sanitizers,
  validatePasswordStrength,
  hashPassword,
  blacklistToken,
  auditLogger
};
