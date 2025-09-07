const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { Pool } = require('pg');
const Redis = require('redis');
const winston = require('winston');
const Joi = require('joi');
require('dotenv').config();

const app = express();

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'task-service' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'taskuser',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'taskmanager',
  password: process.env.DB_PASSWORD || 'taskpassword',
  port: process.env.DB_PORT || 5432,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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

// Connect to Redis
redis.connect().catch(logger.error);

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    logger.error('Error connecting to the database:', err.stack);
  } else {
    logger.info('Connected to PostgreSQL database');
    release();
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3100',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Validation schemas
const taskSchema = Joi.object({
  title: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(2000).allow(''),
  priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
  status: Joi.string().valid('pending', 'in-progress', 'completed', 'cancelled').default('pending'),
  dueDate: Joi.date().iso().allow(null)
});

const updateTaskSchema = Joi.object({
  title: Joi.string().min(1).max(255),
  description: Joi.string().max(2000).allow(''),
  priority: Joi.string().valid('low', 'medium', 'high'),
  status: Joi.string().valid('pending', 'in-progress', 'completed', 'cancelled'),
  dueDate: Joi.date().iso().allow(null)
}).min(1);

// Helper functions
const verifyTokenWithAuthService = async (token) => {
  const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
  logger.debug(`Verifying token with auth service: ${authServiceUrl}`);
  
  try {
    const response = await axios.post(
      `${authServiceUrl}/auth/verify`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
        validateStatus: function (status) {
          return status < 500; // Don't throw for 4xx responses
        }
      }
    );
    
    if (response.status === 200) {
      logger.debug('Token verification successful');
      return response.data.user;
    } else {
      logger.warn(`Token verification failed with status: ${response.status}`);
      throw new Error(`Authentication failed: ${response.data?.error || 'Invalid token'}`);
    }
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      logger.error('Auth service timeout');
      throw new Error('Authentication service timeout');
    } else if (error.code === 'ECONNREFUSED') {
      logger.error('Cannot connect to auth service');
      throw new Error('Authentication service unavailable');
    } else {
      logger.error('Auth service verification failed:', error.message);
      throw new Error('Token verification failed');
    }
  }
};

const getCachedTasks = async (cacheKey) => {
  try {
    const cached = await redis.get(cacheKey);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    logger.warn('Redis get failed:', error.message);
    return null;
  }
};

const setCachedTasks = async (cacheKey, data, expireInSeconds = 300) => {
  try {
    await redis.setEx(cacheKey, expireInSeconds, JSON.stringify(data));
  } catch (error) {
    logger.warn('Redis set failed:', error.message);
  }
};

const invalidateUserCache = async (userId) => {
  try {
    const pattern = `${userId}_*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    logger.warn('Cache invalidation failed:', error.message);
  }
};

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    logger.debug('Authenticating request with token');
    const user = await verifyTokenWithAuthService(token);
    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication failed:', error.message);
    res.status(401).json({ error: error.message || 'Authentication failed' });
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  logger.info(`GET /health`, { ip: req.ip, userAgent: req.get('User-Agent') });
  res.json({ 
    status: 'healthy', 
    service: 'task-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Readiness check endpoint
app.get('/ready', async (req, res) => {
  try {
    // Check database connection
    await pool.query('SELECT 1');
    
    // Check Redis connection
    let redisStatus = 'connected';
    try {
      await redis.ping();
    } catch (error) {
      redisStatus = 'disconnected';
      logger.warn('Redis health check failed:', error.message);
    }
    
    // Check auth service connection
    try {
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
      await axios.get(`${authServiceUrl}/health`, { timeout: 3000 });
    } catch (error) {
      logger.warn('Auth service health check failed:', error.message);
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
      error: 'Service dependencies not available',
      timestamp: new Date().toISOString()
    });
  }
});

// Get all tasks for the authenticated user
app.get('/tasks', authenticate, async (req, res) => {
  try {
    logger.info(`GET /tasks`, { ip: req.ip, userAgent: req.get('User-Agent') });
    const { page = 1, limit = 10, status, priority, search } = req.query;
    const offset = (page - 1) * limit;
    
    // Check cache first
    const cacheKey = `${req.user.id}_${page}_${limit}_${status || ''}_${priority || ''}_${search || ''}`;
    const cached = await getCachedTasks(cacheKey);
    if (cached) {
      logger.debug('Returning cached tasks');
      return res.json(cached);
    }
    
    let query = 'SELECT * FROM tasks WHERE user_id = $1';
    let queryParams = [req.user.id];
    let paramIndex = 2;
    
    // Add filters
    if (status) {
      query += ` AND status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }
    
    if (priority) {
      query += ` AND priority = $${paramIndex}`;
      queryParams.push(priority);
      paramIndex++;
    }
    
    if (search) {
      query += ` AND (title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }
    
    query += ' ORDER BY created_at DESC';
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, queryParams);
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM tasks WHERE user_id = $1';
    let countParams = [req.user.id];
    let countIndex = 2;
    
    if (status) {
      countQuery += ` AND status = $${countIndex}`;
      countParams.push(status);
      countIndex++;
    }
    
    if (priority) {
      countQuery += ` AND priority = $${countIndex}`;
      countParams.push(priority);
      countIndex++;
    }
    
    if (search) {
      countQuery += ` AND (title ILIKE $${countIndex} OR description ILIKE $${countIndex})`;
      countParams.push(`%${search}%`);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const totalTasks = parseInt(countResult.rows[0].count);
    
    const response = {
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalTasks,
        pages: Math.ceil(totalTasks / limit)
      },
      timestamp: new Date().toISOString()
    };
    
    // Cache the response
    await setCachedTasks(cacheKey, response);
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to fetch tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get specific task
app.get('/tasks/:id', authenticate, async (req, res) => {
  try {
    const taskId = req.params.id;
    
    const result = await pool.query(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
      [taskId, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Failed to fetch task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// Create new task
app.post('/tasks', authenticate, async (req, res) => {
  try {
    // Validate request body
    const { error, value } = taskSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    
    const { title, description, priority, status, dueDate } = value;
    
    const result = await pool.query(
      `INSERT INTO tasks (user_id, title, description, priority, status, due_date) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, title, description, priority, status, dueDate]
    );
    
    // Invalidate user's task cache
    await invalidateUserCache(req.user.id);
    
    logger.info('Task created', { taskId: result.rows[0].id, userId: req.user.id });
    
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Task created successfully'
    });
  } catch (error) {
    logger.error('Failed to create task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
app.put('/tasks/:id', authenticate, async (req, res) => {
  try {
    const taskId = req.params.id;
    
    // Validate request body
    const { error, value } = updateTaskSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    
    const updates = value;
    const setClause = Object.keys(updates)
      .map((key, index) => `${key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)} = $${index + 3}`)
      .join(', ');
    
    if (setClause === '') {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    const query = `
      UPDATE tasks SET 
      ${setClause},
      updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2 RETURNING *
    `;
    
    const result = await pool.query(
      query,
      [taskId, req.user.id, ...Object.values(updates)]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Invalidate user's task cache
    await invalidateUserCache(req.user.id);
    
    logger.info('Task updated', { taskId, userId: req.user.id });
    
    res.json({
      success: true,
      data: result.rows[0],
      message: 'Task updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
app.delete('/tasks/:id', authenticate, async (req, res) => {
  try {
    const taskId = req.params.id;
    
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING *',
      [taskId, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Invalidate user's task cache
    await invalidateUserCache(req.user.id);
    
    logger.info('Task deleted', { taskId, userId: req.user.id });
    
    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Get task statistics
app.get('/tasks/stats/summary', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'in-progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority,
        COUNT(CASE WHEN due_date < CURRENT_DATE AND status != 'completed' THEN 1 END) as overdue
      FROM tasks WHERE user_id = $1
    `, [req.user.id]);
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Failed to fetch task statistics:', error);
    res.status(500).json({ error: 'Failed to fetch task statistics' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  logger.info(`Task service running on port ${PORT}`);
  console.log(`Task service running on port ${PORT}`);
});
