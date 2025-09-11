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
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const { PubSub } = require('@google-cloud/pubsub');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const promClient = require('prom-client');
const promMiddleware = require('express-prometheus-middleware');
const { SimpleTracingManager } = require('../lib/simple-tracing');
require('dotenv').config();

const app = express();

// Trust proxy for accurate client IP detection
app.set('trust proxy', true);

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
const uploadCounter = new promClient.Counter({
  name: 'media_uploads_total',
  help: 'Total number of media uploads',
  labelNames: ['status', 'mime_type'],
  registers: [register]
});

const downloadCounter = new promClient.Counter({
  name: 'media_downloads_total',
  help: 'Total number of media downloads',
  labelNames: ['status'],
  registers: [register]
});

const storageGauge = new promClient.Gauge({
  name: 'media_storage_bytes',
  help: 'Total storage used in bytes',
  registers: [register]
});

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'media-service' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

// Initialize tracing manager after logger is defined
const tracingManager = new SimpleTracingManager('media-service', logger);

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'taskmanager',
  user: process.env.DB_USER || 'taskuser',
  password: process.env.DB_PASSWORD || 'taskpassword',
  port: process.env.DB_PORT || 5432,
});

// Redis connection
const redis = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redis.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

redis.connect();

// Initialize storage based on environment
let storage, bucket, pubsub;

if (process.env.USE_LOCAL_STORAGE !== 'true') {
  // Google Cloud Storage
  storage = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
  });

  bucket = storage.bucket(process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'taskmanager-media');

  // Pub/Sub client (only for GCS mode)
  pubsub = new PubSub({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
  });
} else {
  // For local storage, we'll skip Pub/Sub events or use a mock
  pubsub = {
    topic: () => ({
      publishMessage: async () => {
        logger.info('Pub/Sub event skipped (local storage mode)');
      }
    })
  };
}

// Security middleware
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

// Add tracing middleware early
app.use(tracingManager.createExpressMiddleware());

// Rate limiting disabled for media service (handled by API gateway)
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
//   message: 'Too many requests from this IP, please try again later.',
//   standardHeaders: true,
//   legacyHeaders: false,
//   // Configure for production behind proxy
//   keyGenerator: (req) => {
//     return req.ip;
//   },
//   skip: (req) => {
//     // Skip rate limiting for health checks
//     return req.path === '/health' || req.path === '/metrics';
//   }
// });

// app.use(limiter);

// Prometheus middleware
app.use(promMiddleware({
  metricsPath: '/metrics',
  collectDefaultMetrics: true,
  collectGCMetrics: true,
}));

// Body parsing middleware with increased limits for large files
app.use(express.json({ limit: '600mb' }));
app.use(express.urlencoded({ extended: true, limit: '600mb' }));

// Increase request timeout for large file uploads
app.use((req, res, next) => {
  // Set timeout to 10 minutes for upload endpoints
  if (req.path.includes('/upload')) {
    req.setTimeout(600000); // 10 minutes
    res.setTimeout(600000); // 10 minutes
  }
  next();
});

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for large video files
  },
  fileFilter: (req, file, cb) => {
    // Allow image and video files
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  }
});

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // Verify token with auth service
    const authUrl = `${process.env.AUTH_SERVICE_URL || 'http://localhost:3001'}/auth/verify`;
    logger.info('Making auth request to:', { authUrl });
    
    const response = await axios.post(authUrl, {}, {
      headers: { authorization: `Bearer ${token}` },
      timeout: 5000
    });
    
    logger.info('Auth response received:', { status: response.status, data: response.data });
    req.user = response.data.user;
    next();
  } catch (error) {
    logger.error('Token verification failed:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      code: error.code,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers
      }
    });
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Validation schemas
const uploadSchema = Joi.object({
  optimize: Joi.boolean().default(true),
  quality: Joi.number().min(1).max(100).default(80),
  width: Joi.number().min(1).max(2048),
  height: Joi.number().min(1).max(2048),
  isPublic: Joi.boolean().default(false),
  metadata: Joi.object().default({})
});

// Event publishing helper
const publishEvent = async (eventType, data, correlationId = null) => {
  try {
    // Skip if Pub/Sub is not configured
    if (!pubsub || process.env.USE_LOCAL_STORAGE === 'true') {
      logger.info('Event skipped (Pub/Sub not configured):', { eventType });
      return;
    }

    const event = {
      eventType,
      timestamp: new Date().toISOString(),
      serviceId: 'media-service',
      correlationId: correlationId || uuidv4(),
      data
    };

    const topic = pubsub.topic('task-manager-events');
    await topic.publishMessage({ json: event });
    
    logger.info('Event published:', { eventType, correlationId: event.correlationId });
  } catch (error) {
    logger.warn('Failed to publish event (non-critical):', { 
      eventType, 
      error: error.message 
    });
  }
};

// Image optimization helper
const optimizeImage = async (buffer, options = {}) => {
  const { quality = 80, width, height } = options;
  
  let sharpInstance = sharp(buffer)
    .jpeg({ quality, progressive: true })
    .png({ compressionLevel: 9 });

  if (width || height) {
    sharpInstance = sharpInstance.resize(width, height, {
      fit: sharp.fit.inside,
      withoutEnlargement: true
    });
  }

  return await sharpInstance.toBuffer();
};

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'media-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});

// Upload media file
app.post('/media/upload', authenticateToken, upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      uploadCounter.labels('error', 'none').inc();
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate request body
    const { error, value } = uploadSchema.validate(req.body);
    if (error) {
      uploadCounter.labels('error', req.file.mimetype).inc();
      return res.status(400).json({ error: error.details[0].message });
    }

    const { optimize, quality, width, height, isPublic, metadata } = value;
    
    // Generate unique filename
    const fileExtension = mime.extension(req.file.mimetype) || 'bin';
    const filename = `${uuidv4()}.${fileExtension}`;
    
    logger.info('Processing upload:', {
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      fileExtension,
      filename,
      size: req.file.size
    });
    
    // Optimize image if requested
    let fileBuffer = req.file.buffer;
    if (optimize && req.file.mimetype.startsWith('image/')) {
      fileBuffer = await optimizeImage(req.file.buffer, { quality, width, height });
    }

    let filePath;
    let storageUrl;

    // Check if using local storage or GCS
    if (process.env.USE_LOCAL_STORAGE === 'true') {
      // Local storage
      const uploadsDir = process.env.LOCAL_STORAGE_PATH || '/app/uploads';
      const userDir = path.join(uploadsDir, req.user.id.toString());
      
      // Ensure directory exists
      await fs.mkdir(userDir, { recursive: true });
      
      filePath = path.join(userDir, filename);
      await fs.writeFile(filePath, fileBuffer);
      
      storageUrl = filePath;
    } else {
      // Google Cloud Storage - use streaming for better memory management
      const gcsPath = `media/${req.user.id}/${filename}`;
      const file = bucket.file(gcsPath);
      
      // Configure upload options
      const uploadOptions = {
        metadata: {
          contentType: req.file.mimetype,
          metadata: {
            originalName: req.file.originalname,
            uploadedBy: req.user.id.toString(),
            uploadedAt: new Date().toISOString()
          }
        },
        // Enable resumable uploads for large files
        resumable: req.file.size > 10 * 1024 * 1024 // Use resumable for files > 10MB
      };

      const stream = file.createWriteStream(uploadOptions);

      await new Promise((resolve, reject) => {
        stream.on('error', (error) => {
          logger.error('GCS upload stream error:', error);
          reject(error);
        });
        
        stream.on('finish', () => {
          logger.info('GCS upload completed successfully', { 
            filename, 
            size: fileBuffer.length,
            gcsPath 
          });
          resolve(null);
        });
        
        // Write the buffer to the stream
        stream.end(fileBuffer);
      });
      
      storageUrl = gcsPath;
    }

    // Save metadata to database
    const result = await pool.query(`
      INSERT INTO media (
        filename, original_name, mime_type, size_bytes, 
        ${process.env.USE_LOCAL_STORAGE === 'true' ? 'local_path' : 'gcs_path'}, 
        user_id, metadata, is_public
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      filename,
      req.file.originalname,
      req.file.mimetype,
      fileBuffer.length,
      storageUrl,
      req.user.id,
      JSON.stringify(metadata),
      isPublic
    ]);

    const mediaFile = result.rows[0];

    // Update storage metrics
    storageGauge.inc(fileBuffer.length);
    uploadCounter.labels('success', req.file.mimetype).inc();

    // Publish event
    await publishEvent('media.uploaded', {
      mediaId: mediaFile.id,
      userId: req.user.id,
      filename: mediaFile.filename,
      originalName: mediaFile.original_name,
      mimeType: mediaFile.mime_type,
      sizeBytes: mediaFile.size_bytes
    });

    logger.info('Media file uploaded successfully', {
      mediaId: mediaFile.id,
      filename: mediaFile.filename,
      userId: req.user.id,
      duration: Date.now() - startTime
    });

    // Prepare response object
    const responseMedia = {
      id: mediaFile.id,
      filename: mediaFile.filename,
      originalName: mediaFile.original_name,
      mimeType: mediaFile.mime_type,
      sizeBytes: mediaFile.size_bytes,
      isPublic: mediaFile.is_public,
      createdAt: mediaFile.created_at,
      downloadUrl: `/api/media/${mediaFile.id}/download`
    };

    // Only include thumbnail URL for images
    if (mediaFile.mime_type.startsWith('image/')) {
      responseMedia.thumbnailUrl = `/api/media/${mediaFile.id}/thumbnail`;
    }

    res.status(201).json({
      message: 'File uploaded successfully',
      media: responseMedia
    });

  } catch (error) {
    uploadCounter.labels('error', req.file?.mimetype || 'unknown').inc();
    logger.error('Upload failed:', { 
      message: error.message, 
      stack: error.stack,
      code: error.code,
      details: error
    });
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Get media file metadata
app.get('/media/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM media 
      WHERE id = $1 AND (user_id = $2 OR is_public = true)
    `, [req.params.id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    const mediaFile = result.rows[0];
    
    // Prepare response object
    const responseMedia = {
      id: mediaFile.id,
      filename: mediaFile.filename,
      originalName: mediaFile.original_name,
      mimeType: mediaFile.mime_type,
      sizeBytes: mediaFile.size_bytes,
      isPublic: mediaFile.is_public,
      metadata: mediaFile.metadata,
      createdAt: mediaFile.created_at,
      downloadUrl: `/api/media/${mediaFile.id}/download`
    };

    // Only include thumbnail URL for images
    if (mediaFile.mime_type.startsWith('image/')) {
      responseMedia.thumbnailUrl = `/api/media/${mediaFile.id}/thumbnail`;
    }
    
    res.json({
      media: responseMedia
    });

  } catch (error) {
    logger.error('Get media metadata failed:', error.message);
    res.status(500).json({ error: 'Failed to retrieve media metadata' });
  }
});

// Download media file
app.get('/media/:id/download', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM media 
      WHERE id = $1 AND (user_id = $2 OR is_public = true)
    `, [req.params.id, req.user.id]);

    if (result.rows.length === 0) {
      downloadCounter.labels('not_found').inc();
      return res.status(404).json({ error: 'Media file not found' });
    }

    const mediaFile = result.rows[0];

    // Set appropriate headers
    res.setHeader('Content-Type', mediaFile.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${mediaFile.original_name}"`);
    
    if (process.env.USE_LOCAL_STORAGE === 'true') {
      // Local storage
      const filePath = mediaFile.local_path;
      
      try {
        // Check if file exists
        await fs.access(filePath);
        
        // Send file
        res.sendFile(path.resolve(filePath));
        downloadCounter.labels('success').inc();
      } catch (error) {
        downloadCounter.labels('not_found').inc();
        return res.status(404).json({ error: 'File not found in storage' });
      }
    } else {
      // Google Cloud Storage
      const file = bucket.file(mediaFile.gcs_path);
      
      // Check if file exists in storage
      const [exists] = await file.exists();
      if (!exists) {
        downloadCounter.labels('not_found').inc();
        return res.status(404).json({ error: 'File not found in storage' });
      }
      
      // Stream file from GCS
      const readStream = file.createReadStream();
      readStream.pipe(res);
      downloadCounter.labels('success').inc();

      readStream.on('error', (error) => {
        downloadCounter.labels('error').inc();
        logger.error('Download stream error:', error.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Download failed' });
        }
      });
    }

  } catch (error) {
    downloadCounter.labels('error').inc();
    logger.error('Download failed:', error.message);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Generate thumbnail
app.get('/media/:id/thumbnail', authenticateToken, async (req, res) => {
  const { width = 150, height = 150 } = req.query;
  
  try {
    const result = await pool.query(`
      SELECT * FROM media 
      WHERE id = $1 AND (user_id = $2 OR is_public = true)
    `, [req.params.id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    const mediaFile = result.rows[0];
    
    // For non-image files, return a default placeholder or error
    if (!mediaFile.mime_type.startsWith('image/')) {
      // Return 404 for non-image thumbnails instead of 400
      // This allows the frontend to handle it as "missing" rather than "bad request"
      return res.status(404).json({ error: 'Thumbnail not available for this file type' });
    }

    const cacheKey = `thumbnail:${mediaFile.id}:${width}x${height}`;
    
    // Check cache first (with error handling)
    try {
      const cachedThumbnail = await redis.get(cacheKey);
      if (cachedThumbnail) {
        const thumbnailBuffer = Buffer.from(cachedThumbnail, 'base64');
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
        return res.send(thumbnailBuffer);
      }
    } catch (redisError) {
      logger.warn('Redis cache check failed for thumbnail:', redisError.message);
    }

    // Generate thumbnail
    let fileBuffer;
    
    if (process.env.USE_LOCAL_STORAGE === 'true') {
      // Local storage - read from local file
      const filePath = mediaFile.local_path;
      if (!filePath) {
        return res.status(404).json({ error: 'Local file path not found' });
      }
      
      try {
        fileBuffer = await fs.readFile(filePath);
      } catch (error) {
        logger.error('Local file read failed:', error.message);
        return res.status(404).json({ error: 'File not found in local storage' });
      }
    } else {
      // Google Cloud Storage
      try {
        const file = bucket.file(mediaFile.gcs_path);
        [fileBuffer] = await file.download();
      } catch (gcsError) {
        logger.error('GCS file download failed:', gcsError.message);
        return res.status(404).json({ error: 'File not found in storage' });
      }
    }
    
    // Generate thumbnail using Sharp
    let thumbnailBuffer;
    try {
      thumbnailBuffer = await sharp(fileBuffer)
        .resize(parseInt(width), parseInt(height), {
          fit: sharp.fit.cover,
          position: sharp.strategy.entropy
        })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch (sharpError) {
      logger.error('Sharp thumbnail generation failed:', sharpError.message);
      return res.status(500).json({ error: 'Thumbnail generation failed: ' + sharpError.message });
    }

    // Cache thumbnail for 1 hour (with error handling)
    try {
      await redis.setEx(cacheKey, 3600, thumbnailBuffer.toString('base64'));
    } catch (redisError) {
      logger.warn('Redis cache set failed for thumbnail:', redisError.message);
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
    res.send(thumbnailBuffer);

  } catch (error) {
    logger.error('Thumbnail generation failed:', { 
      message: error.message, 
      stack: error.stack,
      mediaId: req.params.id
    });
    res.status(500).json({ error: 'Thumbnail generation failed: ' + error.message });
  }
});

// List media files
app.get('/media', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, type, search } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT * FROM media 
      WHERE user_id = $1
    `;
    
    const params = [req.user.id];
    let paramIndex = 2;

    if (type) {
      query += ` AND mime_type LIKE $${paramIndex}`;
      params.push(`${type}/%`);
      paramIndex++;
    }

    if (search) {
      query += ` AND (original_name ILIKE $${paramIndex} OR filename ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) FROM media WHERE user_id = $1
    `;
    const countParams = [req.user.id];
    let countParamIndex = 2;

    if (type) {
      countQuery += ` AND mime_type LIKE $${countParamIndex}`;
      countParams.push(`${type}/%`);
      countParamIndex++;
    }

    if (search) {
      countQuery += ` AND (original_name ILIKE $${countParamIndex} OR filename ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / limit);

    const mediaFiles = result.rows.map(file => ({
      id: file.id,
      filename: file.filename,
      originalName: file.original_name,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      isPublic: file.is_public,
      metadata: file.metadata,
      createdAt: file.created_at,
      downloadUrl: `/api/media/${file.id}/download`,
      thumbnailUrl: `/api/media/${file.id}/thumbnail`
    }));

    res.json({
      media: mediaFiles,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });

  } catch (error) {
    logger.error('List media failed:', error.message);
    res.status(500).json({ error: 'Failed to list media files' });
  }
});

// Delete media file
app.delete('/media/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get media file info
    const result = await client.query(`
      SELECT * FROM media WHERE id = $1 AND user_id = $2
    `, [req.params.id, req.user.id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Media file not found' });
    }

    const mediaFile = result.rows[0];

    // Delete from Google Cloud Storage
    const file = bucket.file(mediaFile.gcs_path);
    await file.delete();

    // Delete from database
    await client.query('DELETE FROM media WHERE id = $1', [req.params.id]);

    await client.query('COMMIT');

    // Update storage metrics
    storageGauge.dec(mediaFile.size_bytes);

    // Publish event (handle errors separately to not affect response)
    try {
      await publishEvent('media.deleted', {
        mediaId: mediaFile.id,
        userId: req.user.id,
        filename: mediaFile.filename
      });
    } catch (eventError) {
      logger.warn('Failed to publish delete event:', eventError.message);
    }

    // Clear thumbnail cache (handle errors separately to not affect response)
    try {
      const thumbnailKeys = await redis.keys(`thumbnail:${mediaFile.id}:*`);
      if (thumbnailKeys.length > 0) {
        await redis.del(...thumbnailKeys);
      }
    } catch (cacheError) {
      logger.warn('Failed to clear thumbnail cache:', cacheError.message);
    }

    logger.info('Media file deleted successfully', {
      mediaId: mediaFile.id,
      filename: mediaFile.filename,
      userId: req.user.id
    });

    res.json({ message: 'Media file deleted successfully' });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Delete media failed:', error.message);
    res.status(500).json({ error: 'Failed to delete media file' });
  } finally {
    client.release();
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  
  logger.error('Unhandled error:', error.message);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  logger.info(`Media service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  await pool.end();
  await redis.quit();
  process.exit(0);
});
