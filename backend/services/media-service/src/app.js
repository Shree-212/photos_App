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
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3100',
  credentials: true
}));

// Add tracing middleware early
app.use(tracingManager.createExpressMiddleware());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use(limiter);

// Prometheus middleware
app.use(promMiddleware({
  metricsPath: '/metrics',
  collectDefaultMetrics: true,
  collectGCMetrics: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
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
    const response = await axios.post(`${process.env.AUTH_SERVICE_URL || 'http://localhost:3001'}/auth/verify`, {}, {
      headers: { authorization: `Bearer ${token}` }
    });
    
    req.user = response.data.user;
    next();
  } catch (error) {
    logger.error('Token verification failed:', error.message);
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
    logger.error('Failed to publish event:', error.message);
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
      // Google Cloud Storage
      const gcsPath = `media/${req.user.id}/${filename}`;
      const file = bucket.file(gcsPath);
      const stream = file.createWriteStream({
        metadata: {
          contentType: req.file.mimetype,
          metadata: {
            originalName: req.file.originalname,
            uploadedBy: req.user.id.toString(),
            uploadedAt: new Date().toISOString()
          }
        }
      });

      await new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('finish', resolve);
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

    res.status(201).json({
      message: 'File uploaded successfully',
      media: {
        id: mediaFile.id,
        filename: mediaFile.filename,
        originalName: mediaFile.original_name,
        mimeType: mediaFile.mime_type,
        sizeBytes: mediaFile.size_bytes,
        isPublic: mediaFile.is_public,
        createdAt: mediaFile.created_at,
        downloadUrl: `/api/media/${mediaFile.id}/download`,
        thumbnailUrl: `/api/media/${mediaFile.id}/thumbnail`
      }
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
    
    res.json({
      media: {
        id: mediaFile.id,
        filename: mediaFile.filename,
        originalName: mediaFile.original_name,
        mimeType: mediaFile.mime_type,
        sizeBytes: mediaFile.size_bytes,
        isPublic: mediaFile.is_public,
        metadata: mediaFile.metadata,
        createdAt: mediaFile.created_at,
        downloadUrl: `/api/media/${mediaFile.id}/download`,
        thumbnailUrl: `/api/media/${mediaFile.id}/thumbnail`
      }
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
    
    // Only generate thumbnails for images
    if (!mediaFile.mime_type.startsWith('image/')) {
      return res.status(400).json({ error: 'Thumbnails only available for images' });
    }

    const cacheKey = `thumbnail:${mediaFile.id}:${width}x${height}`;
    
    // Check cache first
    const cachedThumbnail = await redis.get(cacheKey);
    if (cachedThumbnail) {
      const thumbnailBuffer = Buffer.from(cachedThumbnail, 'base64');
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
      return res.send(thumbnailBuffer);
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
        return res.status(404).json({ error: 'File not found in local storage' });
      }
    } else {
      // Google Cloud Storage
      const file = bucket.file(mediaFile.gcs_path);
      [fileBuffer] = await file.download();
    }
    
    const thumbnailBuffer = await sharp(fileBuffer)
      .resize(parseInt(width), parseInt(height), {
        fit: sharp.fit.cover,
        position: sharp.strategy.entropy
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Cache thumbnail for 1 hour
    await redis.setEx(cacheKey, 3600, thumbnailBuffer.toString('base64'));

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
    res.send(thumbnailBuffer);

  } catch (error) {
    logger.error('Thumbnail generation failed:', error.message);
    res.status(500).json({ error: 'Thumbnail generation failed' });
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

    // Publish event
    await publishEvent('media.deleted', {
      mediaId: mediaFile.id,
      userId: req.user.id,
      filename: mediaFile.filename
    });

    // Clear thumbnail cache
    const thumbnailKeys = await redis.keys(`thumbnail:${mediaFile.id}:*`);
    if (thumbnailKeys.length > 0) {
      await redis.del(...thumbnailKeys);
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
