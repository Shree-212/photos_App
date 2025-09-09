const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const Redis = require('redis');
const winston = require('winston');
const Joi = require('joi');
const { PubSub } = require('@google-cloud/pubsub');
const { v4: uuidv4 } = require('uuid');
const promClient = require('prom-client');
const promMiddleware = require('express-prometheus-middleware');
const nodemailer = require('nodemailer');

// Import utilities
const { NotificationManager } = require('../utils/notification-manager');
const { EventProcessor } = require('../utils/event-processor');
const { SimpleTracingManager } = require('../lib/simple-tracing');

require('dotenv').config();

const app = express();

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
const eventCounter = new promClient.Counter({
  name: 'notification_events_processed_total',
  help: 'Total number of events processed',
  labelNames: ['event_type', 'status'],
  registers: [register]
});

const notificationCounter = new promClient.Counter({
  name: 'notifications_sent_total',
  help: 'Total number of notifications sent',
  labelNames: ['type', 'status'],
  registers: [register]
});

// Logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'notification-service' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

// Initialize tracing manager
const tracingManager = new SimpleTracingManager('notification-service', logger);

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'taskmanager',
  user: process.env.DB_USER || 'taskuser',
  password: process.env.DB_PASSWORD || 'taskpassword',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis connection
const redis = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redis.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

redis.on('connect', () => {
  logger.info('Connected to Redis');
});

// Pub/Sub client
const pubsub = new PubSub({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'dev-project'
});

// Email transporter configuration
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'noreply@taskmanager.com',
    pass: process.env.SMTP_PASS || 'your-app-password'
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3100',
  credentials: true
}));

// Add tracing middleware early
app.use(tracingManager.createExpressMiddleware());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP'
});

app.use('/api/', generalLimiter);

// Prometheus metrics middleware
app.use('/metrics', promMiddleware({
  metricsPath: '/metrics',
  collectDefaultMetrics: true,
  requestDurationBuckets: [0.1, 0.5, 1, 1.5, 2, 3, 5, 10],
}));

// Initialize notification and event processing
const notificationManager = new NotificationManager(pool, redis, emailTransporter, logger);
const eventProcessor = new EventProcessor(pubsub, notificationManager, logger);

// Routes

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database
    await pool.query('SELECT 1');
    
    // Check Redis
    await redis.ping();
    
    // Check Pub/Sub (basic check)
    const topics = await pubsub.getTopics();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'notification-service',
      version: '1.0.0',
      dependencies: {
        database: 'connected',
        redis: 'connected',
        pubsub: 'connected'
      }
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'notification-service',
      error: error.message
    });
  }
});

// Prometheus metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});

// Manual notification endpoint (for testing)
app.post('/api/notifications/send', async (req, res) => {
  try {
    const { type, recipient, subject, content, metadata } = req.body;
    
    const notification = {
      id: uuidv4(),
      type,
      recipient,
      subject,
      content,
      metadata: metadata || {},
      createdAt: new Date().toISOString()
    };

    await notificationManager.sendNotification(notification);
    notificationCounter.labels(type, 'success').inc();

    logger.info('Manual notification sent:', { 
      notificationId: notification.id, 
      type, 
      recipient 
    });

    res.json({
      success: true,
      notificationId: notification.id,
      message: 'Notification sent successfully'
    });

  } catch (error) {
    logger.error('Failed to send manual notification:', error);
    notificationCounter.labels(req.body.type || 'unknown', 'error').inc();
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get notification preferences
app.get('/api/notifications/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const preferences = await notificationManager.getUserPreferences(userId);
    
    res.json({
      success: true,
      preferences
    });

  } catch (error) {
    logger.error('Failed to get notification preferences:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update notification preferences
app.put('/api/notifications/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const preferences = req.body;
    
    await notificationManager.updateUserPreferences(userId, preferences);
    
    res.json({
      success: true,
      message: 'Preferences updated successfully'
    });

  } catch (error) {
    logger.error('Failed to update notification preferences:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get notification history
app.get('/api/notifications/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const history = await notificationManager.getNotificationHistory(userId, parseInt(limit), parseInt(offset));
    
    res.json({
      success: true,
      history
    });

  } catch (error) {
    logger.error('Failed to get notification history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { details: error.message })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Initialize and start server
async function startServer() {
  try {
    // Connect to Redis
    await redis.connect();
    
    // Initialize database tables
    await notificationManager.initialize();
    
    // Start event processing
    await eventProcessor.start();
    
    const PORT = process.env.PORT || 3004;
    app.listen(PORT, () => {
      logger.info(`Notification service running on port ${PORT}`);
      logger.info('Event processing started - listening for Pub/Sub events');
    });

  } catch (error) {
    logger.error('Failed to start notification service:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  try {
    await eventProcessor.stop();
    await redis.quit();
    await pool.end();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  try {
    await eventProcessor.stop();
    await redis.quit();
    await pool.end();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Export for testing
module.exports = app;

// Start server if not in test mode
if (require.main === module) {
  startServer();
}
