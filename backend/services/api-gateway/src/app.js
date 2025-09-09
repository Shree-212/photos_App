const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const proxy = require('express-http-proxy');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const CircuitBreaker = require('opossum');
const axios = require('axios');
require('dotenv').config();

const app = express();

// Logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'api-gateway' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

// Service URLs
const services = {
  auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
  task: process.env.TASK_SERVICE_URL || 'http://task-service:3002',
  media: process.env.MEDIA_SERVICE_URL || 'http://media-service:3003'
};

// Circuit breaker options
const circuitBreakerOptions = {
  timeout: 8000, // 8 seconds
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10
};

// Create circuit breaker function for service calls
const createServiceCall = (serviceName) => {
  const circuitBreaker = new CircuitBreaker(
    async (url, options) => {
      logger.debug(`Circuit breaker calling ${serviceName}:`, url);
      return await axios(url, options);
    },
    {
      ...circuitBreakerOptions,
      name: `${serviceName}-circuit-breaker`
    }
  );

  // Circuit breaker event listeners
  circuitBreaker.on('open', () => 
    logger.warn(`${serviceName} circuit breaker opened - requests will be rejected`)
  );
  circuitBreaker.on('halfOpen', () => 
    logger.info(`${serviceName} circuit breaker half-opened - testing service`)
  );
  circuitBreaker.on('close', () => 
    logger.info(`${serviceName} circuit breaker closed - service is healthy`)
  );
  circuitBreaker.on('failure', (err) => 
    logger.error(`${serviceName} circuit breaker failure:`, err.message)
  );

  return circuitBreaker;
};

// Create circuit breakers for each service
const authCircuitBreaker = createServiceCall('auth-service');
const taskCircuitBreaker = createServiceCall('task-service');
const mediaCircuitBreaker = createServiceCall('media-service');

// Middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3100',
      'http://localhost:3000',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  next();
});

// Service health check functions with circuit breaker integration
const checkServiceHealth = async (serviceName, url, circuitBreaker) => {
  try {
    // Use circuit breaker for health checks if available
    let response;
    if (circuitBreaker && !circuitBreaker.opened) {
      try {
        response = await circuitBreaker.fire(`${url}/health`, { 
          timeout: 5000,
          validateStatus: function (status) {
            return status < 500;
          }
        });
      } catch (circuitBreakerError) {
        // If circuit breaker fails, try direct call
        response = await axios.get(`${url}/health`, { 
          timeout: 3000,
          validateStatus: function (status) {
            return status < 500;
          }
        });
      }
    } else {
      // Direct call if no circuit breaker or if circuit breaker is open
      response = await axios.get(`${url}/health`, { 
        timeout: 3000,
        validateStatus: function (status) {
          return status < 500;
        }
      });
    }
    
    return { 
      service: serviceName, 
      status: response.status === 200 ? 'healthy' : 'unhealthy',
      url,
      responseTime: response.headers['x-response-time'] || 'N/A',
      circuitBreakerState: circuitBreaker ? (circuitBreaker.opened ? 'open' : 'closed') : 'none'
    };
  } catch (error) {
    return { 
      service: serviceName, 
      status: 'unhealthy', 
      url,
      error: error.message,
      circuitBreakerState: circuitBreaker ? (circuitBreaker.opened ? 'open' : 'closed') : 'none'
    };
  }
};

// Health check endpoint
app.get('/health', async (req, res) => {
  const healthChecks = await Promise.all([
    checkServiceHealth('auth-service', services.auth, authCircuitBreaker),
    checkServiceHealth('task-service', services.task, taskCircuitBreaker),
    checkServiceHealth('media-service', services.media, mediaCircuitBreaker)
  ]);
  
  const allHealthy = healthChecks.every(check => check.status === 'healthy');
  
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: healthChecks,
    circuitBreakers: {
      'auth-service': {
        state: authCircuitBreaker.opened ? 'open' : 'closed',
        stats: authCircuitBreaker.stats
      },
      'task-service': {
        state: taskCircuitBreaker.opened ? 'open' : 'closed',
        stats: taskCircuitBreaker.stats
      },
      'media-service': {
        state: mediaCircuitBreaker.opened ? 'open' : 'closed',
        stats: mediaCircuitBreaker.stats
      }
    }
  });
});

// Enhanced proxy configuration with circuit breaker integration
const createEnhancedProxy = (target, pathRewrite = {}, circuitBreaker = null) => {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    timeout: 10000, // 10 seconds
    proxyTimeout: 10000,
    secure: false,
    followRedirects: true,
    
    // Handle JSON body properly
    onProxyReq: (proxyReq, req, res) => {
      // Add request ID for tracing
      const requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      proxyReq.setHeader('x-request-id', requestId);
      proxyReq.setHeader('x-forwarded-by', 'api-gateway');
      
      logger.debug('Proxying request:', {
        method: req.method,
        path: req.path,
        target: target + req.path,
        requestId,
        contentType: req.headers['content-type']
      });
      
      // Set request timeout
      proxyReq.setTimeout(9000, () => {
        logger.error('Proxy request timeout:', {
          path: req.path,
          target,
          requestId
        });
        proxyReq.destroy();
      });
    },
    
    onError: (err, req, res) => {
      logger.error('Proxy error:', {
        error: err.message,
        target,
        path: req.path,
        method: req.method,
        code: err.code
      });
      
      if (!res.headersSent) {
        let statusCode = 502;
        let message = 'Service temporarily unavailable';
        
        // Handle different error types
        if (err.code === 'ECONNREFUSED') {
          message = 'Service is not available';
        } else if (err.code === 'ECONNABORTED' || err.code === 'TIMEOUT') {
          statusCode = 504;
          message = 'Service request timeout';
        } else if (circuitBreaker && circuitBreaker.opened) {
          statusCode = 503;
          message = 'Service circuit breaker is open';
        }
        
        res.status(statusCode).json({
          error: message,
          service: target,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        });
      }
    },
    
    onProxyRes: (proxyRes, req, res) => {
      const requestId = req.headers['x-request-id'] || 'unknown';
      
      logger.debug('Received response:', {
        statusCode: proxyRes.statusCode,
        path: req.path,
        target,
        requestId,
        responseTime: Date.now() - req.startTime
      });
      
      // Add response headers
      proxyRes.headers['x-proxy-by'] = 'api-gateway';
      proxyRes.headers['x-response-time'] = Date.now() - req.startTime;
      proxyRes.headers['x-request-id'] = requestId;
    }
  });
};

// Alternative express-http-proxy implementation with circuit breaker
const createExpressProxy = (target, circuitBreaker = null) => {
  return proxy(target, {
    timeout: 10000,
    
    proxyReqPathResolver: (req) => {
      // This function determines the path sent to the target service
      let newPath = req.url;
      
      logger.info('Path resolver input:', {
        originalUrl: req.originalUrl,
        url: req.url,
        path: req.path
      });
      
      // For auth service, req.url is already stripped, just add /auth prefix
      if (req.originalUrl.startsWith('/api/auth')) {
        newPath = '/auth' + req.url;
      }
      
      // For task service, req.url is already stripped, just add /tasks prefix
      if (req.originalUrl.startsWith('/api/tasks')) {
        newPath = '/tasks' + req.url;
        // Handle root path case
        if (newPath === '/tasks/') {
          newPath = '/tasks';
        }
      }
      
      // For media service, req.url is already stripped, just add /media prefix
      if (req.originalUrl.startsWith('/api/media')) {
        newPath = '/media' + req.url;
        // Handle root path case
        if (newPath === '/media/') {
          newPath = '/media';
        }
      }
      
      logger.info('Path resolver output:', {
        originalUrl: req.originalUrl,
        reqUrl: req.url,
        newPath: newPath,
        target: target
      });
      
      return newPath;
    },
    
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      // Add request ID for tracing
      const requestId = srcReq.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      proxyReqOpts.headers = proxyReqOpts.headers || {};
      proxyReqOpts.headers['x-request-id'] = requestId;
      proxyReqOpts.headers['x-forwarded-by'] = 'api-gateway-express-proxy';
      
      logger.debug('Express proxy request options:', {
        method: srcReq.method,
        path: proxyReqOpts.path,
        target: target,
        requestId
      });
      
      return proxyReqOpts;
    },
    
    proxyReqBodyDecorator: (bodyContent, srcReq) => {
      // Handle body properly
      logger.debug('Express proxy body:', {
        hasBody: !!bodyContent,
        contentType: srcReq.headers['content-type'],
        bodyLength: bodyContent ? bodyContent.length : 0
      });
      return bodyContent;
    },
    
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      const requestId = userReq.headers['x-request-id'] || 'unknown';
      
      logger.debug('Express proxy response:', {
        statusCode: proxyRes.statusCode,
        path: userReq.path,
        target,
        requestId,
        responseTime: Date.now() - userReq.startTime
      });
      
      // Add response headers
      userRes.setHeader('x-proxy-by', 'api-gateway-express-proxy');
      userRes.setHeader('x-response-time', Date.now() - userReq.startTime);
      userRes.setHeader('x-request-id', requestId);
      
      return proxyResData;
    },
    
    proxyErrorHandler: (err, res, next) => {
      logger.error('Express proxy error:', {
        error: err.message,
        target,
        code: err.code
      });
      
      let statusCode = 502;
      let message = 'Service temporarily unavailable';
      
      if (err.code === 'ECONNREFUSED') {
        message = 'Service is not available';
      } else if (err.code === 'ECONNABORTED' || err.code === 'TIMEOUT') {
        statusCode = 504;
        message = 'Service request timeout';
      } else if (circuitBreaker && circuitBreaker.opened) {
        statusCode = 503;
        message = 'Service circuit breaker is open';
      }
      
      res.status(statusCode).json({
        error: message,
        service: target,
        timestamp: new Date().toISOString(),
        proxyType: 'express-http-proxy'
      });
    }
  });
};

// Add request start time and ID for response time calculation
app.use((req, res, next) => {
  req.startTime = Date.now();
  req.requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('x-request-id', req.requestId);
  next();
});

// Circuit breaker middleware for route protection
const withCircuitBreaker = (circuitBreaker, serviceName) => {
  return async (req, res, next) => {
    // Check if circuit breaker is open
    if (circuitBreaker.opened) {
      logger.warn(`${serviceName} circuit breaker is open, rejecting request`);
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: `${serviceName} is currently unavailable due to high error rate`,
        circuitBreakerState: 'open',
        timestamp: new Date().toISOString()
      });
    }
    next();
  };
};

// Auth service routes with different proxy strategies
// Use express-http-proxy for POST/PUT requests (better body handling)
app.use('/api/auth', 
  withCircuitBreaker(authCircuitBreaker, 'auth-service'),
  (req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      // Use express-http-proxy for requests with body
      logger.debug('Using express-http-proxy for auth request:', {
        method: req.method,
        originalUrl: req.originalUrl,
        url: req.url,
        path: req.path
      });
      
      const expressProxy = createExpressProxy(services.auth, authCircuitBreaker);
      return expressProxy(req, res, next);
    } else {
      // Use http-proxy-middleware for GET requests
      logger.debug('Using http-proxy-middleware for auth request:', {
        method: req.method,
        originalUrl: req.originalUrl
      });
      
      return createEnhancedProxy(services.auth, {
        '^/api/auth': ''
      }, authCircuitBreaker)(req, res, next);
    }
  }
);

// Task service routes with different proxy strategies
app.use('/api/tasks',
  withCircuitBreaker(taskCircuitBreaker, 'task-service'),
  (req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      // Use express-http-proxy for requests with body
      logger.debug('Using express-http-proxy for task request:', {
        method: req.method,
        originalUrl: req.originalUrl,
        url: req.url,
        path: req.path
      });
      
      const expressProxy = createExpressProxy(services.task, taskCircuitBreaker);
      return expressProxy(req, res, next);
    } else {
      // Use http-proxy-middleware for GET requests
      logger.debug('Using http-proxy-middleware for task request:', {
        method: req.method,
        originalUrl: req.originalUrl
      });
      
      return createEnhancedProxy(services.task, {
        '^/api/tasks': '/tasks'
      }, taskCircuitBreaker)(req, res, next);
    }
  }
);

// Media service routes with special handling for file uploads
app.use('/api/media',
  withCircuitBreaker(mediaCircuitBreaker, 'media-service'),
  (req, res, next) => {
    // Special handling for file uploads (multipart/form-data)
    if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
      logger.debug('Using http-proxy-middleware for media upload:', {
        method: req.method,
        originalUrl: req.originalUrl,
        contentType: req.headers['content-type']
      });
      
      // Use http-proxy-middleware for file uploads (better stream handling)
      return createEnhancedProxy(services.media, {
        '^/api/media': '/media'
      }, mediaCircuitBreaker)(req, res, next);
    } else if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      // Use express-http-proxy for JSON requests with body
      logger.debug('Using express-http-proxy for media request:', {
        method: req.method,
        originalUrl: req.originalUrl,
        url: req.url,
        path: req.path
      });
      
      const expressProxy = createExpressProxy(services.media, mediaCircuitBreaker);
      return expressProxy(req, res, next);
    } else {
      // Use http-proxy-middleware for GET requests
      logger.debug('Using http-proxy-middleware for media request:', {
        method: req.method,
        originalUrl: req.originalUrl
      });
      
      return createEnhancedProxy(services.media, {
        '^/api/media': '/media'
      }, mediaCircuitBreaker)(req, res, next);
    }
  }
);

// Direct media access (bypassing /api prefix for frontend convenience)
app.use('/media',
  withCircuitBreaker(mediaCircuitBreaker, 'media-service'),
  createEnhancedProxy(services.media, {}, mediaCircuitBreaker)
);

// Alternative direct routing with circuit breaker (for debugging and fallback)
app.get('/api/direct/auth/health', async (req, res) => {
  try {
    let response;
    if (authCircuitBreaker.opened) {
      return res.status(503).json({ 
        error: 'Auth service circuit breaker is open',
        circuitBreakerState: 'open'
      });
    }
    
    response = await authCircuitBreaker.fire(`${services.auth}/health`, { timeout: 5000 });
    res.json({
      ...response.data,
      circuitBreakerState: 'closed',
      directCall: true
    });
  } catch (error) {
    logger.error('Direct auth health check failed:', error.message);
    res.status(502).json({ 
      error: 'Auth service unavailable',
      message: error.message,
      circuitBreakerState: authCircuitBreaker.opened ? 'open' : 'closed'
    });
  }
});

app.get('/api/direct/tasks/health', async (req, res) => {
  try {
    let response;
    if (taskCircuitBreaker.opened) {
      return res.status(503).json({ 
        error: 'Task service circuit breaker is open',
        circuitBreakerState: 'open'
      });
    }
    
    response = await taskCircuitBreaker.fire(`${services.task}/health`, { timeout: 5000 });
    res.json({
      ...response.data,
      circuitBreakerState: 'closed',
      directCall: true
    });
  } catch (error) {
    logger.error('Direct task health check failed:', error.message);
    res.status(502).json({ 
      error: 'Task service unavailable',
      message: error.message,
      circuitBreakerState: taskCircuitBreaker.opened ? 'open' : 'closed'
    });
  }
});

app.get('/api/direct/media/health', async (req, res) => {
  try {
    let response;
    if (mediaCircuitBreaker.opened) {
      return res.status(503).json({ 
        error: 'Media service circuit breaker is open',
        circuitBreakerState: 'open'
      });
    }
    
    response = await mediaCircuitBreaker.fire(`${services.media}/health`, { timeout: 5000 });
    res.json({
      ...response.data,
      circuitBreakerState: 'closed',
      directCall: true
    });
  } catch (error) {
    logger.error('Direct media health check failed:', error.message);
    res.status(502).json({ 
      error: 'Media service unavailable',
      message: error.message,
      circuitBreakerState: mediaCircuitBreaker.opened ? 'open' : 'closed'
    });
  }
});

// Circuit breaker status endpoint for monitoring
app.get('/api/circuit-breakers', (req, res) => {
  res.json({
    'auth-service': {
      name: authCircuitBreaker.name,
      state: authCircuitBreaker.opened ? 'open' : (authCircuitBreaker.halfOpen ? 'half-open' : 'closed'),
      stats: authCircuitBreaker.stats,
      options: authCircuitBreaker.options
    },
    'task-service': {
      name: taskCircuitBreaker.name,
      state: taskCircuitBreaker.opened ? 'open' : (taskCircuitBreaker.halfOpen ? 'half-open' : 'closed'),
      stats: taskCircuitBreaker.stats,
      options: taskCircuitBreaker.options
    },
    'media-service': {
      name: mediaCircuitBreaker.name,
      state: mediaCircuitBreaker.opened ? 'open' : (mediaCircuitBreaker.halfOpen ? 'half-open' : 'closed'),
      stats: mediaCircuitBreaker.stats,
      options: mediaCircuitBreaker.options
    },
    timestamp: new Date().toISOString()
  });
});

// Proxy strategy information endpoint
app.get('/api/proxy-info', (req, res) => {
  res.json({
    strategy: 'Hybrid Proxy Strategy',
    description: 'Using different proxy libraries based on HTTP method',
    routes: {
      '/api/auth': {
        'GET requests': 'http-proxy-middleware',
        'POST/PUT/PATCH requests': 'express-http-proxy',
        reason: 'express-http-proxy handles request bodies better'
      },
      '/api/tasks': {
        'GET requests': 'http-proxy-middleware', 
        'POST/PUT/PATCH requests': 'express-http-proxy',
        reason: 'express-http-proxy handles request bodies better'
      },
      '/api/media': {
        'GET requests': 'http-proxy-middleware',
        'File uploads (multipart)': 'http-proxy-middleware',
        'POST/PUT/PATCH (JSON)': 'express-http-proxy',
        reason: 'http-proxy-middleware handles file streams better, express-http-proxy for JSON'
      },
      '/media': {
        'All requests': 'http-proxy-middleware',
        reason: 'Direct media access for downloads and thumbnails'
      }
    },
    circuitBreakers: {
      enabled: true,
      services: ['auth-service', 'task-service', 'media-service'],
      configuration: circuitBreakerOptions
    },
    timestamp: new Date().toISOString()
  });
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Task Manager API Gateway',
    version: '1.0.0',
    description: 'API Gateway for Task Manager microservices',
    endpoints: {
      auth: {
        base: '/api/auth',
        service: services.auth,
        routes: [
          'POST /api/auth/register',
          'POST /api/auth/login',
          'POST /api/auth/logout',
          'POST /api/auth/verify',
          'POST /api/auth/refresh',
          'GET /api/auth/profile'
        ]
      },
      tasks: {
        base: '/api/tasks',
        service: services.task,
        routes: [
          'GET /api/tasks',
          'POST /api/tasks',
          'GET /api/tasks/:id',
          'PUT /api/tasks/:id',
          'DELETE /api/tasks/:id',
          'POST /api/tasks/:id/media',
          'DELETE /api/tasks/:id/media/:mediaId',
          'GET /api/tasks/:id/media',
          'GET /api/tasks/stats/summary'
        ]
      },
      media: {
        base: '/api/media',
        service: services.media,
        routes: [
          'POST /api/media/upload',
          'GET /api/media',
          'GET /api/media/:id',
          'GET /api/media/:id/download',
          'GET /api/media/:id/thumbnail',
          'DELETE /api/media/:id'
        ],
        direct: {
          base: '/media',
          service: services.media,
          routes: [
            'GET /media/:id/download',
            'GET /media/:id/thumbnail'
          ]
        }
      }
    },
    health: '/health',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Gateway error:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method
  });
  
  if (error.message.includes('CORS')) {
    return res.status(403).json({ error: 'CORS policy violation' });
  }
  
  res.status(500).json({
    error: 'Internal gateway error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The requested endpoint ${req.method} ${req.originalUrl} was not found`,
    availableEndpoints: ['/api/auth/*', '/api/tasks/*', '/api/media/*', '/media/*', '/health', '/api'],
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
  logger.info('Service mappings:', services);
  console.log(`API Gateway running on port ${PORT}`);
  console.log('Service mappings:', services);
});
