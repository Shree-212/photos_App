const { v4: uuidv4 } = require('uuid');

/**
 * Simplified Distributed Tracing Manager
 * Provides correlation IDs and request tracing without OpenTelemetry dependency
 */
class SimpleTracingManager {
  constructor(serviceName, logger) {
    this.serviceName = serviceName;
    this.logger = logger;
  }

  /**
   * Create Express middleware for request tracing
   */
  createExpressMiddleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Extract or generate correlation ID
      const correlationId = req.headers['x-correlation-id'] || uuidv4();
      const requestId = uuidv4();
      
      // Set correlation ID in headers for response
      res.setHeader('x-correlation-id', correlationId);
      res.setHeader('x-request-id', requestId);
      
      // Add trace context to request for use in handlers
      req.traceContext = {
        correlationId,
        requestId,
        serviceName: this.serviceName,
        startTime,
        spans: []
      };

      // Log request start
      this.logger.info('Request started', {
        service: this.serviceName,
        method: req.method,
        url: req.originalUrl || req.url,
        correlationId,
        requestId,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress
      });

      // Handle response completion
      const originalEnd = res.end;
      const self = this;
      res.end = function(...args) {
        const duration = Date.now() - startTime;
        
        // Log request completion
        req.traceContext.logger = self.logger;
        self.logger.info('Request completed', {
          service: self.serviceName,
          method: req.method,
          url: req.originalUrl || req.url,
          statusCode: res.statusCode,
          correlationId,
          requestId,
          duration,
          spans: req.traceContext.spans.length
        });

        // Call original end method
        originalEnd.apply(this, args);
      };

      next();
    };
  }

  /**
   * Start a new operation span
   */
  startSpan(req, operationName, attributes = {}) {
    if (!req.traceContext) {
      this.logger.warn('No trace context found in request');
      return { finish: () => {} };
    }

    const spanId = uuidv4();
    const startTime = Date.now();
    
    const span = {
      spanId,
      operationName,
      serviceName: this.serviceName,
      correlationId: req.traceContext.correlationId,
      requestId: req.traceContext.requestId,
      startTime,
      attributes: {
        'service.name': this.serviceName,
        ...attributes
      }
    };

    req.traceContext.spans.push(span);

    this.logger.debug('Span started', {
      service: this.serviceName,
      operation: operationName,
      spanId,
      correlationId: req.traceContext.correlationId,
      requestId: req.traceContext.requestId,
      attributes
    });

    return {
      span,
      finish: (error = null, result = null) => {
        const duration = Date.now() - startTime;
        span.duration = duration;
        span.endTime = Date.now();
        span.status = error ? 'error' : 'ok';
        
        if (error) {
          span.error = {
            message: error.message,
            type: error.constructor.name,
            stack: error.stack
          };
        }

        if (result) {
          span.result = result;
        }

        this.logger.info('Span completed', {
          service: this.serviceName,
          operation: operationName,
          spanId,
          correlationId: req.traceContext.correlationId,
          requestId: req.traceContext.requestId,
          duration,
          status: span.status,
          error: span.error?.message
        });
      }
    };
  }

  /**
   * Trace a database operation
   */
  traceDatabaseOperation(req, operation, query, params = []) {
    const spanOp = this.startSpan(req, `db.${operation}`, {
      'db.operation': operation,
      'db.statement': query.substring(0, 200), // Truncate long queries
      'db.type': 'postgresql',
      'component': 'database'
    });

    return {
      ...spanOp,
      finish: (error = null, result = null) => {
        const resultData = result ? {
          rowCount: result.rowCount,
          rows: result.rows?.length
        } : null;
        
        spanOp.finish(error, resultData);
      }
    };
  }

  /**
   * Trace an HTTP call to another service
   */
  traceServiceCall(req, targetService, method, url) {
    const spanOp = this.startSpan(req, `http.${targetService}`, {
      'http.method': method,
      'http.url': url,
      'service.target': targetService,
      'component': 'http-client'
    });

    return {
      ...spanOp,
      getHeaders: () => ({
        'x-correlation-id': req.traceContext?.correlationId || uuidv4(),
        'x-request-id': req.traceContext?.requestId || uuidv4(),
        'x-parent-service': this.serviceName
      }),
      finish: (error = null, response = null) => {
        const responseData = response ? {
          statusCode: response.status || response.statusCode,
          responseSize: response.headers?.['content-length'],
          responseHeaders: response.headers
        } : null;

        spanOp.finish(error, responseData);
      }
    };
  }

  /**
   * Trace a Pub/Sub event publication or consumption
   */
  tracePubSubOperation(req, operation, topic, eventType = null) {
    const spanOp = this.startSpan(req, `pubsub.${operation}`, {
      'messaging.system': 'pubsub',
      'messaging.destination': topic,
      'messaging.operation': operation,
      'messaging.event_type': eventType,
      'component': 'messaging'
    });

    return {
      ...spanOp,
      finish: (error = null, messageId = null) => {
        const resultData = messageId ? { messageId } : null;
        spanOp.finish(error, resultData);
      }
    };
  }

  /**
   * Add custom attributes to the current request context
   */
  addRequestAttributes(req, attributes) {
    if (req.traceContext) {
      req.traceContext.attributes = {
        ...req.traceContext.attributes,
        ...attributes
      };
    }
  }

  /**
   * Log an event with trace context
   */
  logWithTrace(req, level, message, additionalData = {}) {
    const traceData = req.traceContext ? {
      correlationId: req.traceContext.correlationId,
      requestId: req.traceContext.requestId,
      service: this.serviceName
    } : {};

    this.logger[level](message, {
      ...additionalData,
      ...traceData
    });
  }

  /**
   * Extract correlation ID from request
   */
  getCorrelationId(req) {
    return req.traceContext?.correlationId || req.headers['x-correlation-id'] || uuidv4();
  }

  /**
   * Propagate trace context to outgoing requests
   */
  getTraceHeaders(req) {
    const correlationId = this.getCorrelationId(req);
    const requestId = req.traceContext?.requestId || uuidv4();
    
    return {
      'x-correlation-id': correlationId,
      'x-request-id': requestId,
      'x-parent-service': this.serviceName
    };
  }

  /**
   * Create a standalone trace context (for background operations)
   */
  createTraceContext(correlationId = null) {
    return {
      correlationId: correlationId || uuidv4(),
      requestId: uuidv4(),
      serviceName: this.serviceName,
      startTime: Date.now(),
      spans: []
    };
  }

  /**
   * Get trace summary for the request
   */
  getTraceSummary(req) {
    if (!req.traceContext) return null;

    const totalDuration = Date.now() - req.traceContext.startTime;
    const completedSpans = req.traceContext.spans.filter(s => s.endTime);
    const errorSpans = completedSpans.filter(s => s.status === 'error');

    return {
      correlationId: req.traceContext.correlationId,
      requestId: req.traceContext.requestId,
      serviceName: this.serviceName,
      totalDuration,
      spanCount: req.traceContext.spans.length,
      completedSpans: completedSpans.length,
      errorSpans: errorSpans.length,
      spans: completedSpans.map(s => ({
        spanId: s.spanId,
        operation: s.operationName,
        duration: s.duration,
        status: s.status,
        error: s.error?.message
      }))
    };
  }
}

module.exports = { SimpleTracingManager };
