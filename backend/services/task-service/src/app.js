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
const { PubSub } = require('@google-cloud/pubsub');
const { v4: uuidv4 } = require('uuid');
const promClient = require('prom-client');
const promMiddleware = require('express-prometheus-middleware');
require('dotenv').config();

const app = express();

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
const taskCounter = new promClient.Counter({
  name: 'tasks_total',
  help: 'Total number of tasks',
  labelNames: ['operation', 'status'],
  registers: [register]
});

const taskDuration = new promClient.Histogram({
  name: 'task_operation_duration_seconds',
  help: 'Duration of task operations',
  labelNames: ['operation'],
  registers: [register]
});

// Pub/Sub client for event publishing
const pubsub = new PubSub({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

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

// Prometheus middleware
app.use(promMiddleware({
  metricsPath: '/metrics',
  collectDefaultMetrics: true,
  collectGCMetrics: true,
}));

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
  dueDate: Joi.date().iso().allow(null),
  mediaIds: Joi.array().items(Joi.number().integer().positive()).default([])
});

const updateTaskSchema = Joi.object({
  title: Joi.string().min(1).max(255),
  description: Joi.string().max(2000).allow(''),
  priority: Joi.string().valid('low', 'medium', 'high'),
  status: Joi.string().valid('pending', 'in-progress', 'completed', 'cancelled'),
  dueDate: Joi.date().iso().allow(null),
  mediaIds: Joi.array().items(Joi.number().integer().positive()).default([])
}).min(1);

const attachMediaSchema = Joi.object({
  mediaId: Joi.number().integer().positive().required()
});

// Helper functions

// Event publishing helper
const publishEvent = async (eventType, data, correlationId = null) => {
  try {
    const event = {
      eventType,
      timestamp: new Date().toISOString(),
      serviceId: 'task-service',
      correlationId: correlationId || uuidv4(),
      data
    };

    const topic = pubsub.topic('task-manager-events');
    await topic.publishMessage({ json: event });
    
    logger.info('Event published:', { eventType, correlationId: event.correlationId });
  } catch (error) {
    logger.error('Failed to publish event:', error.message);
  }
};

// Media service integration
const getMediaFiles = async (mediaIds, userId, token) => {
  if (!mediaIds || mediaIds.length === 0) return [];
  
  try {
    const mediaServiceUrl = process.env.MEDIA_SERVICE_URL || 'http://localhost:3003';
    const promises = mediaIds.map(id => 
      axios.get(`${mediaServiceUrl}/media/${id}`, {
        headers: { authorization: `Bearer ${token}` },
        timeout: 5000
      })
    );
    
    const responses = await Promise.allSettled(promises);
    return responses
      .filter(result => result.status === 'fulfilled' && result.value.status === 200)
      .map(result => result.value.data.media);
  } catch (error) {
    logger.warn('Failed to fetch media files:', error.message);
    return [];
  }
};

// Get task with media
const getTaskWithMedia = async (taskId, userId, token = null) => {
  const taskResult = await pool.query(
    'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
    [taskId, userId]
  );
  
  if (taskResult.rows.length === 0) {
    return null;
  }
  
  const task = taskResult.rows[0];
  
  // Get associated media
  const mediaResult = await pool.query(`
    SELECT m.*
    FROM media m
    JOIN task_media tm ON m.id = tm.media_id
    WHERE tm.task_id = $1
    ORDER BY tm.created_at
  `, [taskId]);
  
  task.media = mediaResult.rows.map(media => ({
    id: media.id,
    filename: media.filename,
    originalName: media.original_name,
    mimeType: media.mime_type,
    fileSize: media.size_bytes,
    createdAt: media.created_at,
    thumbnailUrl: `/media/${media.id}/thumbnail`,
    downloadUrl: `/media/${media.id}/download`
  }));
  
  return task;
};
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

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
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
  const timer = taskDuration.startTimer({ operation: 'get_tasks' });
  
  try {
    logger.info(`GET /tasks`, { ip: req.ip, userAgent: req.get('User-Agent') });
    const { page = 1, limit = 10, status, priority, search } = req.query;
    const offset = (page - 1) * limit;
    
    // Check cache first
    const cacheKey = `${req.user.id}_${page}_${limit}_${status || ''}_${priority || ''}_${search || ''}`;
    const cached = await getCachedTasks(cacheKey);
    if (cached) {
      logger.debug('Returning cached tasks');
      taskCounter.labels('get_tasks', 'cache_hit').inc();
      timer();
      return res.json(cached);
    }
    
    let query = `
      SELECT t.*, 
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', m.id,
                   'filename', m.filename,
                   'originalName', m.original_name,
                   'mimeType', m.mime_type,
                   'fileSize', m.size_bytes,
                   'thumbnailUrl', '/media/' || m.id || '/thumbnail',
                   'downloadUrl', '/media/' || m.id || '/download'
                 ) ORDER BY tm.created_at
               ) FILTER (WHERE m.id IS NOT NULL),
               '[]'::json
             ) as media
      FROM tasks t
      LEFT JOIN task_media tm ON t.id = tm.task_id
      LEFT JOIN media m ON tm.media_id = m.id
      WHERE t.user_id = $1
    `;
    
    let queryParams = [req.user.id];
    let paramIndex = 2;
    
    // Add filters
    if (status) {
      query += ` AND t.status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }
    
    if (priority) {
      query += ` AND t.priority = $${paramIndex}`;
      queryParams.push(priority);
      paramIndex++;
    }
    
    if (search) {
      query += ` AND (t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }
    
    query += ` GROUP BY t.id ORDER BY t.created_at DESC`;
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
    
    taskCounter.labels('get_tasks', 'success').inc();
    timer();
    res.json(response);
  } catch (error) {
    taskCounter.labels('get_tasks', 'error').inc();
    timer();
    logger.error('Failed to fetch tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get specific task
app.get('/tasks/:id', authenticate, async (req, res) => {
  const timer = taskDuration.startTimer({ operation: 'get_task' });
  
  try {
    const taskId = req.params.id;
    const authHeader = req.headers.authorization;
    
    const task = await getTaskWithMedia(taskId, req.user.id, authHeader);
    
    if (!task) {
      taskCounter.labels('get_task', 'not_found').inc();
      timer();
      return res.status(404).json({ error: 'Task not found' });
    }
    
    taskCounter.labels('get_task', 'success').inc();
    timer();
    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    taskCounter.labels('get_task', 'error').inc();
    timer();
    logger.error('Failed to fetch task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// Create new task
app.post('/tasks', authenticate, async (req, res) => {
  const timer = taskDuration.startTimer({ operation: 'create_task' });
  const client = await pool.connect();
  
  try {
    // Validate request body
    const { error, value } = taskSchema.validate(req.body);
    if (error) {
      taskCounter.labels('create_task', 'validation_error').inc();
      timer();
      return res.status(400).json({ 
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    
    const { title, description, priority, status, dueDate, mediaIds } = value;
    
    await client.query('BEGIN');
    
    // Create the task
    const taskResult = await client.query(
      `INSERT INTO tasks (user_id, title, description, priority, status, due_date) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, title, description, priority, status, dueDate]
    );
    
    const task = taskResult.rows[0];
    
    // Attach media files if provided
    if (mediaIds && mediaIds.length > 0) {
      // Verify media files belong to the user
      const mediaResult = await client.query(
        'SELECT id FROM media WHERE id = ANY($1) AND user_id = $2',
        [mediaIds, req.user.id]
      );
      
      const validMediaIds = mediaResult.rows.map(row => row.id);
      
      if (validMediaIds.length > 0) {
        const mediaInserts = validMediaIds.map((mediaId, index) => 
          `($1, $${index + 2})`
        ).join(', ');
        
        await client.query(
          `INSERT INTO task_media (task_id, media_id) VALUES ${mediaInserts}`,
          [task.id, ...validMediaIds]
        );
      }
    }
    
    await client.query('COMMIT');
    
    // Get the complete task with media
    const completeTask = await getTaskWithMedia(task.id, req.user.id);
    
    // Invalidate user's task cache
    await invalidateUserCache(req.user.id);
    
    // Publish event
    await publishEvent('task.created', {
      taskId: task.id,
      userId: req.user.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      mediaCount: mediaIds ? mediaIds.length : 0
    });
    
    taskCounter.labels('create_task', 'success').inc();
    timer();
    logger.info('Task created', { taskId: task.id, userId: req.user.id });
    
    res.status(201).json({
      success: true,
      data: completeTask,
      message: 'Task created successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    taskCounter.labels('create_task', 'error').inc();
    timer();
    logger.error('Failed to create task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  } finally {
    client.release();
  }
});

// Attach media to task
app.post('/tasks/:id/media', authenticate, async (req, res) => {
  const timer = taskDuration.startTimer({ operation: 'attach_media' });
  const client = await pool.connect();
  
  try {
    const taskId = req.params.id;
    const { error, value } = attachMediaSchema.validate(req.body);
    
    if (error) {
      timer();
      return res.status(400).json({ 
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    
    const { mediaId } = value;
    
    await client.query('BEGIN');
    
    // Verify task belongs to user
    const taskResult = await client.query(
      'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
      [taskId, req.user.id]
    );
    
    if (taskResult.rows.length === 0) {
      await client.query('ROLLBACK');
      timer();
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Verify media belongs to user
    const mediaResult = await client.query(
      'SELECT id FROM media WHERE id = $1 AND user_id = $2',
      [mediaId, req.user.id]
    );
    
    if (mediaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      timer();
      return res.status(404).json({ error: 'Media file not found' });
    }
    
    // Check if already attached
    const existingResult = await client.query(
      'SELECT id FROM task_media WHERE task_id = $1 AND media_id = $2',
      [taskId, mediaId]
    );
    
    if (existingResult.rows.length > 0) {
      await client.query('ROLLBACK');
      timer();
      return res.status(409).json({ error: 'Media already attached to task' });
    }
    
    // Attach media to task
    await client.query(
      'INSERT INTO task_media (task_id, media_id) VALUES ($1, $2)',
      [taskId, mediaId]
    );
    
    await client.query('COMMIT');
    
    // Invalidate cache
    await invalidateUserCache(req.user.id);
    
    // Publish event
    await publishEvent('task.media_attached', {
      taskId: parseInt(taskId),
      mediaId,
      userId: req.user.id
    });
    
    timer();
    res.json({ message: 'Media attached to task successfully' });
    
  } catch (error) {
    await client.query('ROLLBACK');
    timer();
    logger.error('Failed to attach media to task:', error);
    res.status(500).json({ error: 'Failed to attach media to task' });
  } finally {
    client.release();
  }
});

// Remove media from task
app.delete('/tasks/:id/media/:mediaId', authenticate, async (req, res) => {
  const timer = taskDuration.startTimer({ operation: 'detach_media' });
  const client = await pool.connect();
  
  try {
    const { id: taskId, mediaId } = req.params;
    
    await client.query('BEGIN');
    
    // Verify task belongs to user
    const taskResult = await client.query(
      'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
      [taskId, req.user.id]
    );
    
    if (taskResult.rows.length === 0) {
      await client.query('ROLLBACK');
      timer();
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Remove the association
    const deleteResult = await client.query(
      'DELETE FROM task_media WHERE task_id = $1 AND media_id = $2',
      [taskId, mediaId]
    );
    
    if (deleteResult.rowCount === 0) {
      await client.query('ROLLBACK');
      timer();
      return res.status(404).json({ error: 'Media not attached to this task' });
    }
    
    await client.query('COMMIT');
    
    // Invalidate cache
    await invalidateUserCache(req.user.id);
    
    // Publish event
    await publishEvent('task.media_detached', {
      taskId: parseInt(taskId),
      mediaId: parseInt(mediaId),
      userId: req.user.id
    });
    
    timer();
    res.json({ message: 'Media removed from task successfully' });
    
  } catch (error) {
    await client.query('ROLLBACK');
    timer();
    logger.error('Failed to remove media from task:', error);
    res.status(500).json({ error: 'Failed to remove media from task' });
  } finally {
    client.release();
  }
});

// Get task media
app.get('/tasks/:id/media', authenticate, async (req, res) => {
  try {
    const taskId = req.params.id;
    
    // Verify task belongs to user
    const taskResult = await pool.query(
      'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
      [taskId, req.user.id]
    );
    
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Get task media
    const mediaResult = await pool.query(`
      SELECT m.*
      FROM media m
      JOIN task_media tm ON m.id = tm.media_id
      WHERE tm.task_id = $1
      ORDER BY tm.created_at
    `, [taskId]);
    
    const media = mediaResult.rows.map(media => ({
      id: media.id,
      filename: media.filename,
      originalName: media.original_name,
      mimeType: media.mime_type,
      fileSize: media.size_bytes,
      createdAt: media.created_at,
      thumbnailUrl: `/media/${media.id}/thumbnail`,
      downloadUrl: `/media/${media.id}/download`
    }));
    
    res.json({
      success: true,
      data: media
    });
    
  } catch (error) {
    logger.error('Failed to fetch task media:', error);
    res.status(500).json({ error: 'Failed to fetch task media' });
  }
});
// Update task
app.put('/tasks/:id', authenticate, async (req, res) => {
  const timer = taskDuration.startTimer({ operation: 'update_task' });
  const client = await pool.connect();
  
  try {
    const taskId = req.params.id;
    
    // Validate request body
    const { error, value } = updateTaskSchema.validate(req.body);
    if (error) {
      taskCounter.labels('update_task', 'validation_error').inc();
      timer();
      return res.status(400).json({ 
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    
    const { mediaIds, ...taskUpdates } = value;
    
    await client.query('BEGIN');
    
    // Update task basic fields if any are provided
    if (Object.keys(taskUpdates).length > 0) {
      const setClause = Object.keys(taskUpdates)
        .map((key, index) => `${key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)} = $${index + 3}`)
        .join(', ');
      
      const query = `
        UPDATE tasks SET 
        ${setClause},
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2 RETURNING *
      `;
      
      const result = await client.query(
        query,
        [taskId, req.user.id, ...Object.values(taskUpdates)]
      );
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        taskCounter.labels('update_task', 'not_found').inc();
        timer();
        return res.status(404).json({ error: 'Task not found' });
      }
    }
    
    // Handle media updates if mediaIds provided
    if (mediaIds && mediaIds.length >= 0) {
      // Remove all existing media attachments
      await client.query(
        'DELETE FROM task_media WHERE task_id = $1',
        [taskId]
      );
      
      // Add new media attachments
      if (mediaIds.length > 0) {
        for (const mediaId of mediaIds) {
          // Verify media exists and belongs to user
          const mediaCheck = await client.query(
            'SELECT id FROM media WHERE id = $1 AND user_id = $2',
            [mediaId, req.user.id]
          );
          
          if (mediaCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            timer();
            return res.status(400).json({ 
              error: `Media with ID ${mediaId} not found or access denied` 
            });
          }
          
          // Attach media to task
          await client.query(
            'INSERT INTO task_media (task_id, media_id) VALUES ($1, $2)',
            [taskId, mediaId]
          );
        }
      }
    }
    
    await client.query('COMMIT');
    
    // Get complete task with media
    const completeTask = await getTaskWithMedia(taskId, req.user.id);
    
    // Invalidate user's task cache
    await invalidateUserCache(req.user.id);
    
    // Publish event
    await publishEvent('task.updated', {
      taskId: parseInt(taskId),
      userId: req.user.id,
      changes: Object.keys(taskUpdates),
      mediaUpdated: mediaIds !== undefined
    });
    
    taskCounter.labels('update_task', 'success').inc();
    timer();
    logger.info('Task updated', { taskId, userId: req.user.id });
    
    res.json({
      success: true,
      data: completeTask,
      message: 'Task updated successfully'
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    taskCounter.labels('update_task', 'error').inc();
    timer();
    logger.error('Failed to update task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Delete task
app.delete('/tasks/:id', authenticate, async (req, res) => {
  const timer = taskDuration.startTimer({ operation: 'delete_task' });
  const client = await pool.connect();
  
  try {
    const taskId = req.params.id;
    
    await client.query('BEGIN');
    
    // Get task details before deletion for event
    const taskResult = await client.query(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
      [taskId, req.user.id]
    );
    
    if (taskResult.rows.length === 0) {
      await client.query('ROLLBACK');
      taskCounter.labels('delete_task', 'not_found').inc();
      timer();
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = taskResult.rows[0];
    
    // Delete task (cascade will handle task_media)
    await client.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2',
      [taskId, req.user.id]
    );
    
    await client.query('COMMIT');
    
    // Invalidate user's task cache
    await invalidateUserCache(req.user.id);
    
    // Publish event
    await publishEvent('task.deleted', {
      taskId: task.id,
      userId: req.user.id,
      title: task.title,
      status: task.status
    });
    
    taskCounter.labels('delete_task', 'success').inc();
    timer();
    logger.info('Task deleted', { taskId, userId: req.user.id });
    
    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    taskCounter.labels('delete_task', 'error').inc();
    timer();
    logger.error('Failed to delete task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  } finally {
    client.release();
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
