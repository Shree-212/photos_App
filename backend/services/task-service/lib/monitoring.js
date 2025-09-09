// Monitoring and metrics utilities for Task Manager services

const promClient = require('prom-client');

/**
 * Initialize Prometheus metrics collection
 */
class MetricsCollector {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.register = promClient.register;
    
    // Collect default metrics
    promClient.collectDefaultMetrics({ 
      register: this.register,
      prefix: `${serviceName}_`
    });

    // Initialize custom metrics
    this.initializeCustomMetrics();
  }

  initializeCustomMetrics() {
    // HTTP request metrics
    this.httpRequestDuration = new promClient.Histogram({
      name: `${this.serviceName}_http_request_duration_seconds`,
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
    });

    this.httpRequestTotal = new promClient.Counter({
      name: `${this.serviceName}_http_requests_total`,
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code']
    });

    this.httpRequestSize = new promClient.Histogram({
      name: `${this.serviceName}_http_request_size_bytes`,
      help: 'Size of HTTP requests in bytes',
      labelNames: ['method', 'route'],
      buckets: [100, 1000, 10000, 100000, 1000000, 10000000]
    });

    this.httpResponseSize = new promClient.Histogram({
      name: `${this.serviceName}_http_response_size_bytes`,
      help: 'Size of HTTP responses in bytes',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [100, 1000, 10000, 100000, 1000000, 10000000]
    });

    // Database connection metrics
    this.dbConnections = new promClient.Gauge({
      name: `${this.serviceName}_db_connections_active`,
      help: 'Number of active database connections'
    });

    this.dbQueryDuration = new promClient.Histogram({
      name: `${this.serviceName}_db_query_duration_seconds`,
      help: 'Duration of database queries in seconds',
      labelNames: ['query_type'],
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 3, 5]
    });

    this.dbQueryTotal = new promClient.Counter({
      name: `${this.serviceName}_db_queries_total`,
      help: 'Total number of database queries',
      labelNames: ['query_type', 'status']
    });

    // Redis metrics
    this.redisConnections = new promClient.Gauge({
      name: `${this.serviceName}_redis_connections_active`,
      help: 'Number of active Redis connections'
    });

    this.redisOperationDuration = new promClient.Histogram({
      name: `${this.serviceName}_redis_operation_duration_seconds`,
      help: 'Duration of Redis operations in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1]
    });

    this.redisOperationTotal = new promClient.Counter({
      name: `${this.serviceName}_redis_operations_total`,
      help: 'Total number of Redis operations',
      labelNames: ['operation', 'status']
    });

    // Business-specific metrics
    this.businessOperationTotal = new promClient.Counter({
      name: `${this.serviceName}_business_operations_total`,
      help: 'Total number of business operations',
      labelNames: ['operation', 'status']
    });

    this.businessOperationDuration = new promClient.Histogram({
      name: `${this.serviceName}_business_operation_duration_seconds`,
      help: 'Duration of business operations in seconds',
      labelNames: ['operation'],
      buckets: [0.1, 0.3, 0.5, 1, 2, 5, 10]
    });

    // Error metrics
    this.errorTotal = new promClient.Counter({
      name: `${this.serviceName}_errors_total`,
      help: 'Total number of errors',
      labelNames: ['type', 'endpoint']
    });

    // Service health metrics
    this.serviceHealth = new promClient.Gauge({
      name: `${this.serviceName}_service_health`,
      help: 'Service health status (1 = healthy, 0 = unhealthy)'
    });

    this.uptime = new promClient.Gauge({
      name: `${this.serviceName}_uptime_seconds`,
      help: 'Service uptime in seconds'
    });

    // Register all metrics
    this.register.registerMetric(this.httpRequestDuration);
    this.register.registerMetric(this.httpRequestTotal);
    this.register.registerMetric(this.httpRequestSize);
    this.register.registerMetric(this.httpResponseSize);
    this.register.registerMetric(this.dbConnections);
    this.register.registerMetric(this.dbQueryDuration);
    this.register.registerMetric(this.dbQueryTotal);
    this.register.registerMetric(this.redisConnections);
    this.register.registerMetric(this.redisOperationDuration);
    this.register.registerMetric(this.redisOperationTotal);
    this.register.registerMetric(this.businessOperationTotal);
    this.register.registerMetric(this.businessOperationDuration);
    this.register.registerMetric(this.errorTotal);
    this.register.registerMetric(this.serviceHealth);
    this.register.registerMetric(this.uptime);

    // Initialize health as healthy
    this.serviceHealth.set(1);
    
    // Update uptime every 10 seconds
    this.uptimeInterval = setInterval(() => {
      this.uptime.set(process.uptime());
    }, 10000);
  }

  /**
   * Create middleware for HTTP metrics collection
   */
  createHttpMetricsMiddleware() {
    return (req, res, next) => {
      const start = Date.now();
      const requestSize = parseInt(req.get('content-length')) || 0;
      
      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const route = req.route ? req.route.path : req.path;
        const responseSize = parseInt(res.get('content-length')) || 0;

        this.httpRequestDuration
          .labels(req.method, route, res.statusCode)
          .observe(duration);

        this.httpRequestTotal
          .labels(req.method, route, res.statusCode)
          .inc();

        if (requestSize > 0) {
          this.httpRequestSize
            .labels(req.method, route)
            .observe(requestSize);
        }

        if (responseSize > 0) {
          this.httpResponseSize
            .labels(req.method, route, res.statusCode)
            .observe(responseSize);
        }

        // Track errors
        if (res.statusCode >= 400) {
          const errorType = res.statusCode >= 500 ? 'server_error' : 'client_error';
          this.errorTotal.labels(errorType, route).inc();
        }
      });

      next();
    };
  }

  /**
   * Track database query metrics
   */
  trackDbQuery(queryType, promiseOrCallback) {
    const start = Date.now();
    
    if (typeof promiseOrCallback === 'function') {
      // Callback style
      return (...args) => {
        const callback = args[args.length - 1];
        args[args.length - 1] = (err, result) => {
          const duration = (Date.now() - start) / 1000;
          this.dbQueryDuration.labels(queryType).observe(duration);
          this.dbQueryTotal.labels(queryType, err ? 'error' : 'success').inc();
          callback(err, result);
        };
        return promiseOrCallback(...args);
      };
    } else {
      // Promise style
      return promiseOrCallback
        .then(result => {
          const duration = (Date.now() - start) / 1000;
          this.dbQueryDuration.labels(queryType).observe(duration);
          this.dbQueryTotal.labels(queryType, 'success').inc();
          return result;
        })
        .catch(error => {
          const duration = (Date.now() - start) / 1000;
          this.dbQueryDuration.labels(queryType).observe(duration);
          this.dbQueryTotal.labels(queryType, 'error').inc();
          throw error;
        });
    }
  }

  /**
   * Track Redis operation metrics
   */
  trackRedisOperation(operation, promise) {
    const start = Date.now();
    
    return promise
      .then(result => {
        const duration = (Date.now() - start) / 1000;
        this.redisOperationDuration.labels(operation).observe(duration);
        this.redisOperationTotal.labels(operation, 'success').inc();
        return result;
      })
      .catch(error => {
        const duration = (Date.now() - start) / 1000;
        this.redisOperationDuration.labels(operation).observe(duration);
        this.redisOperationTotal.labels(operation, 'error').inc();
        throw error;
      });
  }

  /**
   * Track business operation metrics
   */
  trackBusinessOperation(operation, promise) {
    const start = Date.now();
    
    return promise
      .then(result => {
        const duration = (Date.now() - start) / 1000;
        this.businessOperationDuration.labels(operation).observe(duration);
        this.businessOperationTotal.labels(operation, 'success').inc();
        return result;
      })
      .catch(error => {
        const duration = (Date.now() - start) / 1000;
        this.businessOperationDuration.labels(operation).observe(duration);
        this.businessOperationTotal.labels(operation, 'error').inc();
        throw error;
      });
  }

  /**
   * Set service health status
   */
  setHealthStatus(healthy) {
    this.serviceHealth.set(healthy ? 1 : 0);
  }

  /**
   * Update connection counts
   */
  updateDbConnections(count) {
    this.dbConnections.set(count);
  }

  updateRedisConnections(count) {
    this.redisConnections.set(count);
  }

  /**
   * Get metrics for Prometheus endpoint
   */
  async getMetrics() {
    return await this.register.metrics();
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.uptimeInterval) {
      clearInterval(this.uptimeInterval);
    }
  }
}

/**
 * Health check utilities
 */
class HealthChecker {
  constructor() {
    this.checks = new Map();
  }

  /**
   * Register a health check
   */
  registerCheck(name, checkFunction, timeout = 5000) {
    this.checks.set(name, { checkFunction, timeout });
  }

  /**
   * Run all health checks
   */
  async runChecks() {
    const results = {};
    let overallHealth = true;

    for (const [name, { checkFunction, timeout }] of this.checks) {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Health check timeout')), timeout);
        });

        const result = await Promise.race([
          checkFunction(),
          timeoutPromise
        ]);

        results[name] = {
          status: 'healthy',
          details: result
        };
      } catch (error) {
        results[name] = {
          status: 'unhealthy',
          error: error.message
        };
        overallHealth = false;
      }
    }

    return {
      status: overallHealth ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: results
    };
  }

  /**
   * Create Express middleware for health checks
   */
  createMiddleware() {
    return async (req, res) => {
      try {
        const health = await this.runChecks();
        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        res.status(500).json({
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    };
  }
}

/**
 * Common health check functions
 */
const healthChecks = {
  /**
   * Database health check
   */
  database: (pool) => async () => {
    const start = Date.now();
    const result = await pool.query('SELECT 1 as health');
    const duration = Date.now() - start;
    
    return {
      query_time_ms: duration,
      connection_count: pool.totalCount,
      idle_count: pool.idleCount,
      waiting_count: pool.waitingCount
    };
  },

  /**
   * Redis health check
   */
  redis: (client) => async () => {
    const start = Date.now();
    await client.ping();
    const duration = Date.now() - start;
    
    return {
      ping_time_ms: duration,
      connected: client.isOpen
    };
  },

  /**
   * External service health check
   */
  externalService: (url, timeout = 3000) => async () => {
    const axios = require('axios');
    const start = Date.now();
    
    const response = await axios.get(url, { timeout });
    const duration = Date.now() - start;
    
    return {
      response_time_ms: duration,
      status_code: response.status,
      url: url
    };
  },

  /**
   * Memory usage health check
   */
  memory: (maxMemoryMB = 512) => async () => {
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };

    const isHealthy = memUsageMB.rss < maxMemoryMB;
    
    return {
      ...memUsageMB,
      max_memory_mb: maxMemoryMB,
      healthy: isHealthy
    };
  },

  /**
   * Disk space health check
   */
  diskSpace: (path = '/', minFreeGB = 1) => async () => {
    const fs = require('fs').promises;
    const stats = await fs.statfs(path);
    
    const freeGB = (stats.bavail * stats.bsize) / (1024 * 1024 * 1024);
    const totalGB = (stats.blocks * stats.bsize) / (1024 * 1024 * 1024);
    const usedGB = totalGB - freeGB;
    
    return {
      path,
      total_gb: Math.round(totalGB * 100) / 100,
      used_gb: Math.round(usedGB * 100) / 100,
      free_gb: Math.round(freeGB * 100) / 100,
      usage_percent: Math.round((usedGB / totalGB) * 100),
      healthy: freeGB > minFreeGB
    };
  }
};

/**
 * Application performance monitoring
 */
class APMTracker {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.traces = new Map();
  }

  /**
   * Start a new trace
   */
  startTrace(traceId, operation) {
    this.traces.set(traceId, {
      operation,
      startTime: Date.now(),
      spans: []
    });
  }

  /**
   * Add a span to a trace
   */
  addSpan(traceId, spanName, startTime, endTime, tags = {}) {
    const trace = this.traces.get(traceId);
    if (trace) {
      trace.spans.push({
        name: spanName,
        startTime,
        endTime,
        duration: endTime - startTime,
        tags
      });
    }
  }

  /**
   * Finish a trace
   */
  finishTrace(traceId, status = 'success', error = null) {
    const trace = this.traces.get(traceId);
    if (trace) {
      trace.endTime = Date.now();
      trace.duration = trace.endTime - trace.startTime;
      trace.status = status;
      if (error) {
        trace.error = error.message;
      }

      // In a real implementation, you would send this to a tracing system
      console.log('Trace completed:', {
        service: this.serviceName,
        traceId,
        ...trace
      });

      this.traces.delete(traceId);
    }
  }

  /**
   * Create middleware for automatic trace creation
   */
  createTraceMiddleware() {
    return (req, res, next) => {
      const traceId = req.headers['x-trace-id'] || 
                     `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      req.traceId = traceId;
      this.startTrace(traceId, `${req.method} ${req.path}`);

      res.on('finish', () => {
        const status = res.statusCode >= 400 ? 'error' : 'success';
        this.finishTrace(traceId, status);
      });

      next();
    };
  }
}

module.exports = {
  MetricsCollector,
  HealthChecker,
  healthChecks,
  APMTracker
};
