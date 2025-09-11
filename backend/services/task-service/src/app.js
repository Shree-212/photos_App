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
const { SimpleTracingManager } = require('../lib/simple-tracing');
require('dotenv').config();

const app = express();

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
const albumCounter = new promClient.Counter({
  name: 'albums_total',
  help: 'Total number of albums',
  labelNames: ['operation', 'status'],
  registers: [register]
});

const albumDuration = new promClient.Histogram({
  name: 'album_operation_duration_seconds',
  help: 'Duration of album operations',
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
  defaultMeta: { service: 'album-service' },
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

// Initialize tracing
const tracingManager = new SimpleTracingManager('album-service', logger);

// Middleware
app.use(helmet());

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

// Add tracing middleware before other middleware
app.use(tracingManager.createExpressMiddleware());

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
const albumSchema = Joi.object({
  title: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(2000).allow(''),
  tags: Joi.array().items(Joi.string().valid('childhood', 'love', 'family', 'friends', 'travel', 'nature', 'food', 'celebration', 'work', 'pets', 'hobbies', 'sports', 'art', 'music')).default([]),
  category: Joi.string().valid('nostalgia', 'emotions', 'happiness', 'pride', 'dreams', 'vibe', 'inspiration', 'memories').default('memories'),
  mediaIds: Joi.array().items(Joi.number().integer().positive()).default([])
});

const updateAlbumSchema = Joi.object({
  title: Joi.string().min(1).max(255),
  description: Joi.string().max(2000).allow(''),
  tags: Joi.array().items(Joi.string().valid('childhood', 'love', 'family', 'friends', 'travel', 'nature', 'food', 'celebration', 'work', 'pets', 'hobbies', 'sports', 'art', 'music')),
  category: Joi.string().valid('nostalgia', 'emotions', 'happiness', 'pride', 'dreams', 'vibe', 'inspiration', 'memories'),
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
      serviceId: 'album-service',
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

// Get album with media
const getAlbumWithMedia = async (albumId, userId, token = null) => {
  const albumResult = await pool.query(
    'SELECT * FROM albums WHERE id = $1 AND user_id = $2',
    [albumId, userId]
  );
  
  if (albumResult.rows.length === 0) {
    return null;
  }
  
  const album = albumResult.rows[0];
  
  // Get associated media
  const mediaResult = await pool.query(`
    SELECT m.*
    FROM media m
    JOIN album_media am ON m.id = am.media_id
    WHERE am.album_id = $1
    ORDER BY am.created_at
  `, [albumId]);
  
  album.media = mediaResult.rows.map(media => ({
    id: media.id,
    filename: media.filename,
    originalName: media.original_name,
    mimeType: media.mime_type,
    fileSize: media.size_bytes,
    createdAt: media.created_at,
    thumbnailUrl: `/api/media/${media.id}/thumbnail`,
    downloadUrl: `/api/media/${media.id}/download`
  }));
  
  return album;
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

const getCachedAlbums = async (cacheKey) => {
  try {
    const cached = await redis.get(cacheKey);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    logger.warn('Redis get failed:', error.message);
    return null;
  }
};

const setCachedAlbums = async (cacheKey, data, expireInSeconds = 300) => {
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
    service: 'album-service',
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

// Get all albums for the authenticated user
app.get('/albums', authenticate, async (req, res) => {
  const timer = albumDuration.startTimer({ operation: 'get_albums' });
  
  try {
    logger.info(`GET /albums`, { ip: req.ip, userAgent: req.get('User-Agent') });
    const { page = 1, limit = 10, tags, category, search } = req.query;
    const offset = (page - 1) * limit;
    
    // Check cache first
    const cacheKey = `${req.user.id}_${page}_${limit}_${tags || ''}_${category || ''}_${search || ''}`;
    const cached = await getCachedAlbums(cacheKey);
    if (cached) {
      logger.debug('Returning cached albums');
      albumCounter.labels('get_albums', 'cache_hit').inc();
      timer();
      return res.json(cached);
    }
    
    let query = `
      SELECT a.*, 
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', m.id,
                   'filename', m.filename,
                   'originalName', m.original_name,
                   'mimeType', m.mime_type,
                   'fileSize', m.size_bytes,
                   'thumbnailUrl', '/api/media/' || m.id || '/thumbnail',
                   'downloadUrl', '/api/media/' || m.id || '/download'
                 ) ORDER BY am.created_at
               ) FILTER (WHERE m.id IS NOT NULL),
               '[]'::json
             ) as media
      FROM albums a
      LEFT JOIN album_media am ON a.id = am.album_id
      LEFT JOIN media m ON am.media_id = m.id
      WHERE a.user_id = $1
    `;
    
    let queryParams = [req.user.id];
    let paramIndex = 2;
    
    // Add filters
    if (tags) {
      const tagsArray = Array.isArray(tags) ? tags : [tags];
      query += ` AND a.tags && $${paramIndex}`;
      queryParams.push(tagsArray);
      paramIndex++;
    }
    
    if (category) {
      query += ` AND a.category = $${paramIndex}`;
      queryParams.push(category);
      paramIndex++;
    }
    
    if (search) {
      query += ` AND (a.title ILIKE $${paramIndex} OR a.description ILIKE $${paramIndex})`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }
    
    query += ` GROUP BY a.id ORDER BY a.created_at DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, queryParams);
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM albums WHERE user_id = $1';
    let countParams = [req.user.id];
    let countIndex = 2;
    
    if (tags) {
      const tagsArray = Array.isArray(tags) ? tags : [tags];
      countQuery += ` AND tags && $${countIndex}`;
      countParams.push(tagsArray);
      countIndex++;
    }
    
    if (category) {
      countQuery += ` AND category = $${countIndex}`;
      countParams.push(category);
      countIndex++;
    }
    
    if (search) {
      countQuery += ` AND (title ILIKE $${countIndex} OR description ILIKE $${countIndex})`;
      countParams.push(`%${search}%`);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const totalAlbums = parseInt(countResult.rows[0].count);
    
    const response = {
      albums: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalAlbums,
        totalPages: Math.ceil(totalAlbums / limit),
        hasNext: parseInt(page) * parseInt(limit) < totalAlbums,
        hasPrevious: parseInt(page) > 1
      }
    };
    
    // Cache the response
    await setCachedAlbums(cacheKey, response);
    
    albumCounter.labels('get_albums', 'success').inc();
    timer();
    res.json(response);
  } catch (error) {
    albumCounter.labels('get_albums', 'error').inc();
    timer();
    logger.error('Failed to fetch albums:', error);
    res.status(500).json({ error: 'Failed to fetch albums' });
  }
});

// Get specific album
app.get('/albums/:id', authenticate, async (req, res) => {
  const timer = albumDuration.startTimer({ operation: 'get_album' });
  
  try {
    const albumId = req.params.id;
    const authHeader = req.headers.authorization;
    
    const album = await getAlbumWithMedia(albumId, req.user.id, authHeader);
    
    if (!album) {
      albumCounter.labels('get_album', 'not_found').inc();
      timer();
      return res.status(404).json({ error: 'Album not found' });
    }
    
    albumCounter.labels('get_album', 'success').inc();
    timer();
    res.json({
      success: true,
      data: album
    });
  } catch (error) {
    albumCounter.labels('get_album', 'error').inc();
    timer();
    logger.error('Failed to fetch album:', error);
    res.status(500).json({ error: 'Failed to fetch album' });
  }
});

// Create new album
app.post('/albums', authenticate, async (req, res) => {
  const timer = albumDuration.startTimer({ operation: 'create_album' });
  const client = await pool.connect();
  
  try {
    // Validate request body
    const { error, value } = albumSchema.validate(req.body);
    if (error) {
      albumCounter.labels('create_album', 'validation_error').inc();
      timer();
      return res.status(400).json({ 
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    
    const { title, description, tags, category, mediaIds } = value;
    
    await client.query('BEGIN');
    
    // Create the album
    const albumResult = await client.query(
      `INSERT INTO albums (user_id, title, description, tags, category) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, title, description, tags, category]
    );
    
    const album = albumResult.rows[0];
    
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
          `INSERT INTO album_media (album_id, media_id) VALUES ${mediaInserts}`,
          [album.id, ...validMediaIds]
        );
      }
    }
    
    await client.query('COMMIT');
    
    // Get the complete album with media
    const completeAlbum = await getAlbumWithMedia(album.id, req.user.id);
    
    // Invalidate user's album cache
    await invalidateUserCache(req.user.id);
    
    // Publish event
    await publishEvent('album.created', {
      albumId: album.id,
      userId: req.user.id,
      title: album.title,
      tags: album.tags,
      category: album.category,
      mediaCount: mediaIds ? mediaIds.length : 0
    });
    
    albumCounter.labels('create_album', 'success').inc();
    timer();
    logger.info('Album created', { albumId: album.id, userId: req.user.id });
    
    res.status(201).json({
      message: 'Album created successfully',
      album: completeAlbum
    });
  } catch (error) {
    await client.query('ROLLBACK');
    albumCounter.labels('create_album', 'error').inc();
    timer();
    logger.error('Failed to create album:', error);
    res.status(500).json({ error: 'Failed to create album' });
  } finally {
    client.release();
  }
});

// Attach media to album
app.post('/albums/:id/media', authenticate, async (req, res) => {
  const timer = albumDuration.startTimer({ operation: 'attach_media' });
  const client = await pool.connect();
  
  try {
    const albumId = req.params.id;
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
    
    // Verify album belongs to user
    const albumResult = await client.query(
      'SELECT id FROM albums WHERE id = $1 AND user_id = $2',
      [albumId, req.user.id]
    );
    
    if (albumResult.rows.length === 0) {
      await client.query('ROLLBACK');
      timer();
      return res.status(404).json({ error: 'Album not found' });
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
      'SELECT id FROM album_media WHERE album_id = $1 AND media_id = $2',
      [albumId, mediaId]
    );
    
    if (existingResult.rows.length > 0) {
      await client.query('ROLLBACK');
      timer();
      return res.status(409).json({ error: 'Media already attached to album' });
    }
    
    // Attach media to album
    await client.query(
      'INSERT INTO album_media (album_id, media_id) VALUES ($1, $2)',
      [albumId, mediaId]
    );
    
    await client.query('COMMIT');
    
    // Invalidate cache
    await invalidateUserCache(req.user.id);
    
    // Publish event
    await publishEvent('album.media_attached', {
      albumId: parseInt(albumId),
      mediaId,
      userId: req.user.id
    });
    
    timer();
    res.json({ message: 'Media attached to album successfully' });
    
  } catch (error) {
    await client.query('ROLLBACK');
    timer();
    logger.error('Failed to attach media to album:', error);
    res.status(500).json({ error: 'Failed to attach media to album' });
  } finally {
    client.release();
  }
});

// Remove media from album
app.delete('/albums/:id/media/:mediaId', authenticate, async (req, res) => {
  const timer = albumDuration.startTimer({ operation: 'detach_media' });
  const client = await pool.connect();
  
  try {
    const { id: albumId, mediaId } = req.params;
    
    await client.query('BEGIN');
    
    // Verify album belongs to user
    const albumResult = await client.query(
      'SELECT id FROM albums WHERE id = $1 AND user_id = $2',
      [albumId, req.user.id]
    );
    
    if (albumResult.rows.length === 0) {
      await client.query('ROLLBACK');
      timer();
      return res.status(404).json({ error: 'Album not found' });
    }
    
    // Remove the association
    const deleteResult = await client.query(
      'DELETE FROM album_media WHERE album_id = $1 AND media_id = $2',
      [albumId, mediaId]
    );
    
    if (deleteResult.rowCount === 0) {
      await client.query('ROLLBACK');
      timer();
      return res.status(404).json({ error: 'Media not attached to this album' });
    }
    
    await client.query('COMMIT');
    
    // Invalidate cache
    await invalidateUserCache(req.user.id);
    
    // Publish event
    await publishEvent('album.media_detached', {
      albumId: parseInt(albumId),
      mediaId: parseInt(mediaId),
      userId: req.user.id
    });
    
    timer();
    res.json({ message: 'Media removed from album successfully' });
    
  } catch (error) {
    await client.query('ROLLBACK');
    timer();
    logger.error('Failed to remove media from album:', error);
    res.status(500).json({ error: 'Failed to remove media from album' });
  } finally {
    client.release();
  }
});

// Get album media
app.get('/albums/:id/media', authenticate, async (req, res) => {
  try {
    const albumId = req.params.id;
    
    // Verify album belongs to user
    const albumResult = await pool.query(
      'SELECT id FROM albums WHERE id = $1 AND user_id = $2',
      [albumId, req.user.id]
    );
    
    if (albumResult.rows.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }
    
    // Get album media
    const mediaResult = await pool.query(`
      SELECT m.*
      FROM media m
      JOIN album_media am ON m.id = am.media_id
      WHERE am.album_id = $1
      ORDER BY am.created_at
    `, [albumId]);
    
    const media = mediaResult.rows.map(media => ({
      id: media.id,
      filename: media.filename,
      originalName: media.original_name,
      mimeType: media.mime_type,
      fileSize: media.size_bytes,
      createdAt: media.created_at,
      thumbnailUrl: `/api/media/${media.id}/thumbnail`,
      downloadUrl: `/api/media/${media.id}/download`
    }));
    
    res.json({
      success: true,
      data: media
    });
    
  } catch (error) {
    logger.error('Failed to fetch album media:', error);
    res.status(500).json({ error: 'Failed to fetch album media' });
  }
});
// Update album
app.put('/albums/:id', authenticate, async (req, res) => {
  const timer = albumDuration.startTimer({ operation: 'update_album' });
  const client = await pool.connect();
  
  try {
    const albumId = req.params.id;
    
    // Validate request body
    const { error, value } = updateAlbumSchema.validate(req.body);
    if (error) {
      albumCounter.labels('update_album', 'validation_error').inc();
      timer();
      return res.status(400).json({ 
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    
    const { mediaIds, ...albumUpdates } = value;
    
    await client.query('BEGIN');
    
    // Update album basic fields if any are provided
    if (Object.keys(albumUpdates).length > 0) {
      const setClause = Object.keys(albumUpdates)
        .map((key, index) => `${key} = $${index + 3}`)
        .join(', ');
      
      const query = `
        UPDATE albums SET 
        ${setClause},
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2 RETURNING *
      `;
      
      const result = await client.query(
        query,
        [albumId, req.user.id, ...Object.values(albumUpdates)]
      );
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        albumCounter.labels('update_album', 'not_found').inc();
        timer();
        return res.status(404).json({ error: 'Album not found' });
      }
    }
    
    // Handle media updates if mediaIds provided
    if (mediaIds && mediaIds.length >= 0) {
      // Remove all existing media attachments
      await client.query(
        'DELETE FROM album_media WHERE album_id = $1',
        [albumId]
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
          
          // Attach media to album
          await client.query(
            'INSERT INTO album_media (album_id, media_id) VALUES ($1, $2)',
            [albumId, mediaId]
          );
        }
      }
    }
    
    await client.query('COMMIT');
    
    // Get complete album with media
    const completeAlbum = await getAlbumWithMedia(albumId, req.user.id);
    
    // Invalidate user's album cache
    await invalidateUserCache(req.user.id);
    
    // Publish event
    await publishEvent('album.updated', {
      albumId: parseInt(albumId),
      userId: req.user.id,
      changes: Object.keys(albumUpdates),
      mediaUpdated: mediaIds !== undefined
    });
    
    albumCounter.labels('update_album', 'success').inc();
    timer();
    logger.info('Album updated', { albumId, userId: req.user.id });
    
    res.json({
      message: 'Album updated successfully',
      album: completeAlbum
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    albumCounter.labels('update_album', 'error').inc();
    timer();
    logger.error('Failed to update album:', error);
    res.status(500).json({ error: 'Failed to update album' });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Delete album
app.delete('/albums/:id', authenticate, async (req, res) => {
  const timer = albumDuration.startTimer({ operation: 'delete_album' });
  const client = await pool.connect();
  
  try {
    const albumId = req.params.id;
    
    await client.query('BEGIN');
    
    // Get album details before deletion for event
    const albumResult = await client.query(
      'SELECT * FROM albums WHERE id = $1 AND user_id = $2',
      [albumId, req.user.id]
    );
    
    if (albumResult.rows.length === 0) {
      await client.query('ROLLBACK');
      albumCounter.labels('delete_album', 'not_found').inc();
      timer();
      return res.status(404).json({ error: 'Album not found' });
    }
    
    const album = albumResult.rows[0];
    
    // Delete album (cascade will handle album_media)
    await client.query(
      'DELETE FROM albums WHERE id = $1 AND user_id = $2',
      [albumId, req.user.id]
    );
    
    await client.query('COMMIT');
    
    // Invalidate user's album cache
    await invalidateUserCache(req.user.id);
    
    // Publish event
    await publishEvent('album.deleted', {
      albumId: album.id,
      userId: req.user.id,
      title: album.title,
      category: album.category
    });
    
    albumCounter.labels('delete_album', 'success').inc();
    timer();
    logger.info('Album deleted', { albumId, userId: req.user.id });
    
    res.json({
      success: true,
      message: 'Album deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    albumCounter.labels('delete_album', 'error').inc();
    timer();
    logger.error('Failed to delete album:', error);
    res.status(500).json({ error: 'Failed to delete album' });
  } finally {
    client.release();
  }
});

// Get album statistics
app.get('/albums/stats/summary', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN 'childhood' = ANY(tags) THEN 1 END) as childhood,
        COUNT(CASE WHEN 'love' = ANY(tags) THEN 1 END) as love,
        COUNT(CASE WHEN 'family' = ANY(tags) THEN 1 END) as family,
        COUNT(CASE WHEN category = 'nostalgia' THEN 1 END) as nostalgia,
        COUNT(CASE WHEN category = 'happiness' THEN 1 END) as happiness,
        COUNT(CASE WHEN category = 'inspiration' THEN 1 END) as inspiration
      FROM albums WHERE user_id = $1
    `, [req.user.id]);
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Failed to fetch album statistics:', error);
    res.status(500).json({ error: 'Failed to fetch album statistics' });
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
  logger.info(`Album service running on port ${PORT}`);
  console.log(`Album service running on port ${PORT}`);
});
