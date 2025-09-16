const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const Redis = require('redis');
const winston = require('winston');
const Joi = require('joi');
const promClient = require('prom-client');
const path = require('path');

// Import security and monitoring utilities
const { 
  JWTManager, 
  rateLimiters, 
  securityHeaders, 
  createAuthMiddleware,
  sanitizers,
  validatePasswordStrength,
  hashPassword: secureHashPassword,
  blacklistToken,
  auditLogger
} = require('../lib/security');

const { 
  MetricsCollector, 
  HealthChecker, 
  healthChecks 
} = require('../lib/monitoring');

const { SimpleTracingManager } = require('../lib/simple-tracing');
const FirebaseAuthService = require('./services/firebaseAuthService');

require('dotenv').config();

const app = express();

// Initialize security and monitoring
const jwtManager = new JWTManager();
const metricsCollector = new MetricsCollector('auth_service');
const healthChecker = new HealthChecker();

// Create Prometheus metrics
const authAttempts = new promClient.Counter({
  name: 'auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['type', 'status']
});

const activeUsers = new promClient.Gauge({
  name: 'active_users_total',
  help: 'Total number of active users'
});

// Custom rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiter for OTP endpoints
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each IP to 3 OTP requests per windowMs
  message: 'Too many OTP requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Very strict rate limiter for OTP verification
const otpVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // limit each IP to 10 verification attempts per 5 minutes
  message: 'Too many OTP verification attempts from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const auditLog = auditLogger(winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'auth-service' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
}));

// Logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'auth-service' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

// Initialize tracing manager after logger is defined
const tracingManager = new SimpleTracingManager('auth-service', logger);

// Initialize Firebase Auth service (100% GCP native)
const firebaseAuthService = new FirebaseAuthService(logger, pool);

// Schedule verification session cleanup every hour
setInterval(async () => {
  try {
    await firebaseAuthService.cleanup();
  } catch (error) {
    logger.error('Firebase auth cleanup error:', error);
  }
}, 60 * 60 * 1000); // 1 hour

// Middleware with fallbacks
app.use(securityHeaders || helmet());

// CORS support for browser requests (including preflight)
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow frontend origin
    if (origin.includes('34.134.60.168') || origin.includes('localhost')) {
      return callback(null, true);
    }
    
    return callback(null, true); // Allow all for now
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Add tracing middleware early in the chain
app.use(tracingManager.createExpressMiddleware());

app.use(express.json({ limit: '10mb' }));

// Rate limiting with fallback
app.use(rateLimiters?.general || rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
}));

// Metrics middleware with error handling
if (metricsCollector && metricsCollector.createHttpMetricsMiddleware) {
  app.use(metricsCollector.createHttpMetricsMiddleware());
}

// Database connection with better error handling
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'taskmanager',
  user: process.env.DB_USER || 'taskuser',
  password: process.env.DB_PASSWORD || 'taskpassword',
  port: 5432,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // Reduced from 2000 to 5000
});

// Test database connection on startup
(async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    logger.info('Database connection established successfully');
  } catch (error) {
    logger.error('Failed to connect to database:', error.message);
    // Don't exit the process, just log the error
    // process.exit(1);
  }
})();

// Redis connection with error handling
let redisClient;
(async () => {
  if (process.env.REDIS_URL) {
    try {
      redisClient = Redis.createClient({
        url: process.env.REDIS_URL,
        socket: {
          connectTimeout: 5000,
          commandTimeout: 5000,
        },
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            // End reconnecting on a specific error and flush all commands with
            // a individual error
            logger.warn('Redis server refused connection, operating without cache');
            return null;
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            // End reconnecting after a specific timeout and flush all commands
            // with a individual error
            logger.warn('Redis retry time exhausted, operating without cache');
            return null;
          }
          if (options.attempt > 3) {
            // End reconnecting with built in error
            logger.warn('Redis max retry attempts reached, operating without cache');
            return null;
          }
          // reconnect after
          return Math.min(options.attempt * 100, 3000);
        }
      });
      
      redisClient.on('error', (err) => {
        logger.warn('Redis connection error, operating without cache:', err.message);
        redisClient = null;
      });
      
      redisClient.on('connect', () => {
        logger.info('Redis connected');
        if (metricsCollector.updateRedisConnections) {
          metricsCollector.updateRedisConnections(1);
        }
      });
      
      await redisClient.connect();
      logger.info('Redis connection established');
    } catch (error) {
      logger.warn('Failed to connect to Redis, operating without cache:', error.message);
      redisClient = null;
    }
  } else {
    logger.info('Redis URL not configured, operating without cache');
  }
})();

// Setup health checks with error handling
try {
  if (healthChecks && healthChecks.database) {
    healthChecker.registerCheck('database', healthChecks.database(pool));
  } else {
    // Fallback database health check
    healthChecker.registerCheck('database', async () => {
      try {
        await pool.query('SELECT 1');
        return { status: 'healthy' };
      } catch (error) {
        return { status: 'unhealthy', error: error.message };
      }
    });
  }

  if (redisClient && healthChecks && healthChecks.redis) {
    healthChecker.registerCheck('redis', healthChecks.redis(redisClient));
  } else if (redisClient) {
    // Fallback redis health check
    healthChecker.registerCheck('redis', async () => {
      try {
        await redisClient.ping();
        return { status: 'healthy' };
      } catch (error) {
        return { status: 'unhealthy', error: error.message };
      }
    });
  }

  if (healthChecks && healthChecks.memory) {
    healthChecker.registerCheck('memory', healthChecks.memory(256)); // 256MB limit
  }
} catch (error) {
  logger.warn('Failed to setup health checks:', error.message);
}

// Validation schemas with enhanced security
const registerSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(8).max(128).required(),
  firstName: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s]+$/).required(),
  lastName: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s]+$/).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().required()
});

// Mobile auth validation schemas
const phoneSchema = Joi.object({
  phoneNumber: Joi.string().min(10).max(20).required(),
  countryCode: Joi.string().length(2).default('US').optional()
});

const verifyOTPSchema = Joi.object({
  phoneNumber: Joi.string().min(10).max(20).required(),
  otpCode: Joi.string().length(6).pattern(/^\d{6}$/).required(),
  countryCode: Joi.string().length(2).default('US').optional()
});

const registerMobileSchema = Joi.object({
  phoneNumber: Joi.string().min(10).max(20).required(),
  otpCode: Joi.string().length(6).pattern(/^\d{6}$/).required(),
  firstName: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s]+$/).required(),
  lastName: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s]+$/).required(),
  email: Joi.string().email().max(255).optional(),
  countryCode: Joi.string().length(2).default('US').optional()
});

// Helper functions with fallbacks
const generateToken = (user) => {
  if (jwtManager && jwtManager.generateToken) {
    return jwtManager.generateToken({ 
      userId: user.id, 
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name
    });
  } else {
    // Fallback JWT generation
    return jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      },
      process.env.JWT_SECRET || 'fallback-secret-key',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
  }
};

const verifyPassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

const hashPassword = async (password) => {
  if (secureHashPassword) {
    return await secureHashPassword(password);
  } else {
    // Fallback password hashing
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }
};

const validatePassword = (password) => {
  if (validatePasswordStrength) {
    return validatePasswordStrength(password);
  } else {
    // Basic password validation fallback
    const errors = [];
    if (password.length < 8) errors.push('Password must be at least 8 characters long');
    if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
};

const sanitizeInput = (input, maxLength = 255) => {
  if (sanitizers && sanitizers.sanitizeString) {
    return sanitizers.sanitizeString(input, maxLength);
  } else {
    // Fallback sanitization
    return input.trim().substring(0, maxLength);
  }
};

const sanitizeEmail = (email) => {
  if (sanitizers && sanitizers.sanitizeEmail) {
    return sanitizers.sanitizeEmail(email);
  } else {
    // Fallback email sanitization
    return email.toLowerCase().trim();
  }
};

const logAudit = (req, success, reason) => {
  if (auditLog && auditLog.logAuthAttempt) {
    auditLog.logAuthAttempt(req, success, reason);
  } else {
    // Fallback audit logging
    logger.info('Auth attempt', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      success,
      reason,
      timestamp: new Date().toISOString()
    });
  }
};

// Cache user token in Redis
const cacheUserToken = async (userId, token) => {
  if (redisClient) {
    try {
      await redisClient.setEx(`user_token:${userId}`, 86400, token); // 24 hours
    } catch (error) {
      logger.warn('Failed to cache user token:', error);
    }
  }
};

// Invalidate user token from Redis
const invalidateUserToken = async (userId) => {
  if (redisClient) {
    try {
      await redisClient.del(`user_token:${userId}`);
    } catch (error) {
      logger.warn('Failed to invalidate user token:', error);
    }
  }
};

// Check if token is cached
const isTokenCached = async (userId, token) => {
  if (redisClient) {
    try {
      const cachedToken = await redisClient.get(`user_token:${userId}`);
      return cachedToken === token;
    } catch (error) {
      logger.warn('Failed to check token cache:', error);
      return true; // Allow if cache check fails
    }
  }
  return true;
};

// Middleware for request logging and metrics
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Health check endpoint with fallback
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'auth-service',
      checks: {}
    };

    // Check database
    try {
      await pool.query('SELECT 1');
      health.checks.database = 'healthy';
    } catch (error) {
      health.checks.database = 'unhealthy';
      health.status = 'unhealthy';
    }

    // Check Redis (optional)
    if (redisClient) {
      try {
        await redisClient.ping();
        health.checks.redis = 'healthy';
      } catch (error) {
        health.checks.redis = 'unhealthy';
        // Don't mark overall service as unhealthy for Redis
      }
    } else {
      health.checks.redis = 'not-configured';
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'auth-service',
      error: error.message
    });
  }
});

// Metrics endpoint with error handling
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', promClient.register.contentType);
    
    if (metricsCollector && metricsCollector.getMetrics) {
      const metrics = await metricsCollector.getMetrics();
      res.end(metrics);
    } else {
      // Fallback to default Prometheus registry
      const metrics = await promClient.register.metrics();
      res.end(metrics);
    }
  } catch (error) {
    logger.error('Metrics endpoint error:', error);
    res.status(500).end('Error collecting metrics: ' + error.message);
  }
});

// Ready check endpoint
app.get('/ready', async (req, res) => {
  try {
    // Check database connection
    await pool.query('SELECT 1');
    
    // Check Redis connection (optional)
    let redisStatus = 'not-configured';
    if (redisClient) {
      try {
        await redisClient.ping();
        redisStatus = 'connected';
      } catch (error) {
        redisStatus = 'disconnected';
      }
    }
    
    res.json({ 
      status: 'ready',
      database: 'connected',
      redis: redisStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({ 
      status: 'not-ready',
      error: 'Database connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Mobile Authentication Endpoints (Firebase-powered)

// Send phone verification (Firebase handles SMS)
app.post('/auth/send-phone-verification', otpLimiter, async (req, res) => {
  try {
    // Validate input
    const { error, value } = phoneSchema.validate(req.body);
    if (error) {
      logAudit(req, false, 'validation_failed');
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message)
      });
    }

    const { phoneNumber, countryCode = 'US' } = value;
    const clientIP = req.ip || req.connection.remoteAddress;
    
    // Initiate phone verification via Firebase (100% GCP native)
    const result = await firebaseAuthService.initiatePhoneVerification(phoneNumber, clientIP);
    
    if (result.success) {
      authAttempts.labels('send_phone_verification', 'success').inc();
      logger.info('Phone verification initiated via Firebase', { phoneNumber, ip: clientIP });
      
      res.json({
        success: true,
        message: result.message,
        sessionId: result.sessionId, // Firebase verification ID
        expiresAt: result.expiresAt,
        remainingAttempts: result.remainingAttempts
      });
    } else {
      authAttempts.labels('send_phone_verification', result.rateLimited ? 'rate_limited' : 'failed').inc();
      logAudit(req, false, result.rateLimited ? 'rate_limited' : 'send_verification_failed');
      
      const statusCode = result.rateLimited ? 429 : 400;
      res.status(statusCode).json({
        success: false,
        error: result.error,
        ...(result.resetTime && { resetTime: result.resetTime })
      });
    }
  } catch (error) {
    authAttempts.labels('send_phone_verification', 'error').inc();
    logAudit(req, false, 'server_error');
    logger.error('Send phone verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify phone and login with Firebase
app.post('/auth/verify-phone', otpVerifyLimiter, async (req, res) => {
  try {
    // Validate input
    const { error, value } = verifyOTPSchema.validate(req.body);
    if (error) {
      logAudit(req, false, 'validation_failed');
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message)
      });
    }

    const { phoneNumber, otpCode, countryCode = 'US' } = value;
    const clientIP = req.ip || req.connection.remoteAddress;
    
    // Verify phone via Firebase
    const result = await firebaseAuthService.verifyPhoneNumber(phoneNumber, otpCode, clientIP);
    
    if (result.success) {
      // Generate JWT token for the authenticated user
      const token = generateToken(result.user);
      
      // Cache token
      await cacheUserToken(result.user.id, token);
      
      // Update metrics
      authAttempts.labels('verify_phone', 'success').inc();
      activeUsers.inc();
      
      logAudit(req, true, 'firebase_phone_login_success');
      logger.info('User logged in via Firebase phone verification', { 
        userId: result.user.id, 
        phoneNumber: result.user.phoneNumber 
      });
      
      res.json({
        success: true,
        message: 'Login successful',
        token, // Your app's JWT token
        firebaseToken: result.firebaseToken, // Firebase custom token for client
        user: result.user
      });
    } else {
      authAttempts.labels('verify_phone', result.rateLimited ? 'rate_limited' : 'invalid_verification').inc();
      logAudit(req, false, result.rateLimited ? 'rate_limited' : 'invalid_verification');
      
      const statusCode = result.rateLimited ? 429 : 401;
      res.status(statusCode).json({
        success: false,
        error: result.error,
        ...(result.remainingAttempts !== undefined && { remainingAttempts: result.remainingAttempts })
      });
    }
  } catch (error) {
    authAttempts.labels('verify_phone', 'error').inc();
    logAudit(req, false, 'server_error');
    logger.error('Verify phone error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register with phone number using Firebase
app.post('/auth/register-phone', otpVerifyLimiter, async (req, res) => {
  try {
    // Validate input
    const { error, value } = registerMobileSchema.validate(req.body);
    if (error) {
      logAudit(req, false, 'validation_failed');
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message)
      });
    }

    const { phoneNumber, otpCode, firstName, lastName, email, countryCode = 'US' } = value;
    const clientIP = req.ip || req.connection.remoteAddress;
    
    // First verify the phone number via Firebase
    const verificationResult = await firebaseAuthService.verifyPhoneNumber(phoneNumber, otpCode, clientIP);
    
    if (!verificationResult.success) {
      authAttempts.labels('register_phone', 'invalid_verification').inc();
      logAudit(req, false, 'invalid_verification');
      return res.status(401).json({
        success: false,
        error: verificationResult.error,
        ...(verificationResult.remainingAttempts !== undefined && { remainingAttempts: verificationResult.remainingAttempts })
      });
    }

    // Sanitize inputs
    const sanitizedFirstName = sanitizeInput(firstName, 50);
    const sanitizedLastName = sanitizeInput(lastName, 50);
    const sanitizedEmail = email ? sanitizeEmail(email) : null;
    
    // Get validated phone number from verification result
    const validatedPhoneNumber = verificationResult.user.phoneNumber;
    
    // Check if user already has an email set (existing user)
    if (verificationResult.user.email) {
      // User already exists with email - just return the token
      const token = generateToken(verificationResult.user);
      await cacheUserToken(verificationResult.user.id, token);
      
      authAttempts.labels('register_phone', 'existing_user').inc();
      logger.info('Existing user logged in with Firebase phone verification', { 
        userId: verificationResult.user.id, 
        phoneNumber: validatedPhoneNumber 
      });
      
      return res.json({
        success: true,
        message: 'Login successful with existing account',
        token,
        firebaseToken: verificationResult.firebaseToken,
        user: verificationResult.user
      });
    }
    
    // Check if email is already taken (if provided)
    if (sanitizedEmail) {
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [sanitizedEmail, verificationResult.user.id]
      );
      
      if (existingUser.rows.length > 0) {
        logAudit(req, false, 'email_exists');
        return res.status(409).json({ 
          error: 'Email already exists with another account' 
        });
      }
    }
    
    // Update the user record with complete information
    const updateResult = await pool.query(`
      UPDATE users 
      SET first_name = $1, 
          last_name = $2, 
          email = $3,
          updated_at = NOW()
      WHERE id = $4 
      RETURNING id, email, first_name, last_name, phone_number, is_phone_verified, created_at
    `, [sanitizedFirstName, sanitizedLastName, sanitizedEmail, verificationResult.user.id]);
    
    const updatedUser = updateResult.rows[0];
    
    // Generate token
    const token = generateToken(updatedUser);
    await cacheUserToken(updatedUser.id, token);
    
    // Log successful registration
    authAttempts.labels('register_phone', 'success').inc();
    logAudit(req, true, 'firebase_phone_registration_success');
    logger.info('User registered successfully with Firebase phone verification', { 
      userId: updatedUser.id, 
      phoneNumber: validatedPhoneNumber,
      email: sanitizedEmail 
    });
    
    res.status(201).json({ 
      success: true,
      message: 'User registered successfully',
      token,
      firebaseToken: verificationResult.firebaseToken,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        phoneNumber: updatedUser.phone_number,
        isPhoneVerified: updatedUser.is_phone_verified,
        createdAt: updatedUser.created_at
      }
    });
  } catch (error) {
    authAttempts.labels('register_phone', 'error').inc();
    logAudit(req, false, 'server_error');
    logger.error('Firebase phone registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify Firebase ID token endpoint
app.post('/auth/verify-firebase-token', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: 'Firebase ID token required' });
    }
    
    const result = await firebaseAuthService.verifyFirebaseToken(idToken);
    
    if (result.success) {
      // Optionally sync with your local user database
      res.json({
        success: true,
        firebase: {
          uid: result.uid,
          phoneNumber: result.phoneNumber,
          email: result.email,
          verified: result.verified
        }
      });
    } else {
      res.status(401).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Firebase token verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check phone number availability endpoint
app.post('/auth/check-phone', async (req, res) => {
  try {
    const { error, value } = phoneSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message)
      });
    }

    const { phoneNumber, countryCode = 'US' } = value;
    
    // Validate and format phone number
    const phoneValidation = firebaseAuthService.validatePhoneNumber(phoneNumber, countryCode);
    if (!phoneValidation.valid) {
      return res.status(400).json({ 
        error: phoneValidation.error 
      });
    }
    
    // Check if phone number exists
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, is_phone_verified FROM users WHERE phone_number = $1',
      [phoneValidation.formatted]
    );
    
    const exists = result.rows.length > 0;
    const user = exists ? result.rows[0] : null;
    
    res.json({
      phoneNumber: phoneValidation.formatted,
      exists,
      isRegistered: exists && user.email && user.first_name,
      isPhoneVerified: exists ? user.is_phone_verified : false
    });
  } catch (error) {
    logger.error('Check phone error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Traditional Email Authentication Endpoints

// Register endpoint
app.post('/auth/register', rateLimiters?.auth || authLimiter, async (req, res) => {
  try {
    // Validate input
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      logAudit(req, false, 'validation_failed');
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message)
      });
    }

    const { email, password, firstName, lastName } = value;
    
    // Sanitize inputs
    const sanitizedEmail = sanitizeEmail(email);
    const sanitizedFirstName = sanitizeInput(firstName, 50);
    const sanitizedLastName = sanitizeInput(lastName, 50);
    
    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      logAudit(req, false, 'weak_password');
      return res.status(400).json({ 
        error: 'Password does not meet security requirements', 
        details: passwordValidation.errors
      });
    }
    
    // Check if user already exists
    const existingUser = await (metricsCollector?.trackDbQuery ? 
      metricsCollector.trackDbQuery('select_user', pool.query('SELECT id FROM users WHERE email = $1', [sanitizedEmail])) :
      pool.query('SELECT id FROM users WHERE email = $1', [sanitizedEmail])
    );
    
    if (existingUser.rows.length > 0) {
      logAudit(req, false, 'user_exists');
      return res.status(409).json({ error: 'User already exists with this email' });
    }
    
    // Hash password with enhanced security
    const hashedPassword = await hashPassword(password);
    
    // Create user
    const result = await (metricsCollector?.trackDbQuery ?
      metricsCollector.trackDbQuery('insert_user',
        pool.query(
          'INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id, email, first_name, last_name, created_at',
          [sanitizedEmail, hashedPassword, sanitizedFirstName, sanitizedLastName]
        )
      ) :
      pool.query(
        'INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id, email, first_name, last_name, created_at',
        [sanitizedEmail, hashedPassword, sanitizedFirstName, sanitizedLastName]
      )
    );
    
    const user = result.rows[0];
    
    // Generate token
    const token = generateToken(user);
    
    // Cache token
    await cacheUserToken(user.id, token);
    
    // Log successful registration
    logAudit(req, true, 'registration_success');
    logger.info('User registered successfully', { userId: user.id, email: user.email });
    
    res.status(201).json({ 
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    logAudit(req, false, 'server_error');
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login endpoint
app.post('/auth/login', authLimiter, async (req, res) => {
  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      authAttempts.labels('login', 'validation_failed').inc();
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message)
      });
    }

    const { email, password } = value;
    
    // Find user
    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name, created_at FROM users WHERE email = $1',
      [sanitizeEmail(email)]
    );
    
    if (result.rows.length === 0) {
      authAttempts.labels('login', 'invalid_credentials').inc();
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Verify password
    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      authAttempts.labels('login', 'invalid_credentials').inc();
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate token
    const token = generateToken(user);
    
    // Cache token
    await cacheUserToken(user.id, token);
    
    // Update metrics
    authAttempts.labels('login', 'success').inc();
    activeUsers.inc();
    
    logger.info('User logged in successfully', { userId: user.id, email: user.email });
    
    res.json({ 
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    authAttempts.labels('login', 'error').inc();
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Token verification endpoint
app.post('/auth/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
    
    // Check if token is still cached (optional, for additional security)
    const isCached = await isTokenCached(decoded.userId, token);
    if (!isCached) {
      return res.status(401).json({ error: 'Token has been invalidated' });
    }
    
    // Verify user still exists
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    res.json({ 
      valid: true, 
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    logger.error('Token verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout endpoint
app.post('/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Verify token to get user ID
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
    
    // Invalidate token from cache
    await invalidateUserToken(decoded.userId);
    
    logger.info('User logged out successfully', { userId: decoded.userId });
    
    res.json({ message: 'Logout successful' });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    logger.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile endpoint
app.get('/auth/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
    
    // Get user profile
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, created_at, updated_at FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    logger.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  if (redisClient) {
    await redisClient.disconnect();
  }
  
  await pool.end();
  process.exit(0);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info(`Auth service running on port ${PORT}`);
  console.log(`Auth service running on port ${PORT}`);
});
