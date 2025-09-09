const { trace, context, SpanStatusCode, SpanKind } = require('@opentelemetry/api');
const { v4: uuidv4 } = require('uuid');

/**
 * Distributed Tracing Manager for Task Manager Microservices
 * Provides correlation IDs, span management, and request tracing
 */
class TracingManager {
  constructor(serviceName, logger) {
    this.serviceName = serviceName;
    this.logger = logger;
    this.tracer = trace.getTracer(serviceName, '1.0.0');
  }

  /**
   * Start a new trace span
   */
  startSpan(operationName, parentContext = null, attributes = {}) {
    const span = this.tracer.startSpan(
      operationName,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'service.name': this.serviceName,
          'service.version': '1.0.0',
          ...attributes
        }
      },
      parentContext || context.active()
    );

    // Add correlation ID if not present
    if (!attributes['correlation.id']) {
      span.setAttributes({
        'correlation.id': uuidv4()
      });
    }

    return span;
  }

  /**
   * Create Express middleware for request tracing
   */
  createExpressMiddleware() {
    return (req, res, next) => {
      // Extract or generate correlation ID
      const correlationId = req.headers['x-correlation-id'] || uuidv4();
      
      // Set correlation ID in headers for response
      res.setHeader('x-correlation-id', correlationId);
      
      // Start a new span for this request
      const span = this.startSpan(
        `${req.method} ${req.path}`,
        null,
        {
          'http.method': req.method,
          'http.url': req.originalUrl || req.url,
          'http.route': req.route?.path || req.path,
          'http.user_agent': req.headers['user-agent'],
          'correlation.id': correlationId,
          'request.id': uuidv4()
        }
      );

      // Add trace context to request for use in handlers
      req.traceContext = {
        span,
        correlationId,
        context: trace.setSpan(context.active(), span)
      };

      // Log request start
      this.logger.info('Request started', {
        method: req.method,
        url: req.originalUrl || req.url,
        correlationId,
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress
      });

      // Handle response completion
      const originalEnd = res.end;
      res.end = function(...args) {
        // Set span status and attributes
        span.setAttributes({
          'http.status_code': res.statusCode,
          'http.response.size': res.get('content-length') || 0
        });

        // Set span status based on response code
        if (res.statusCode >= 400) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `HTTP ${res.statusCode}`
          });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }

        // Log request completion
        req.traceContext.manager = this;
        this.logger.info('Request completed', {
          method: req.method,
          url: req.originalUrl || req.url,
          statusCode: res.statusCode,
          correlationId,
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          duration: Date.now() - req.traceContext.startTime
        });

        // End the span
        span.end();

        // Call original end method
        originalEnd.apply(this, args);
      }.bind(this);

      // Store start time
      req.traceContext.startTime = Date.now();

      next();
    };
  }

  /**
   * Create a child span within the current trace context
   */
  createChildSpan(req, operationName, attributes = {}) {
    if (!req.traceContext) {
      this.logger.warn('No trace context found in request, creating new span');
      return this.startSpan(operationName, null, attributes);
    }

    const span = this.tracer.startSpan(
      operationName,
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          'service.name': this.serviceName,
          'correlation.id': req.traceContext.correlationId,
          ...attributes
        }
      },
      req.traceContext.context
    );

    return span;
  }

  /**
   * Trace a database operation
   */
  traceDatabaseOperation(req, operation, query, params = []) {
    const span = this.createChildSpan(req, `db.${operation}`, {
      'db.operation': operation,
      'db.statement': query,
      'db.type': 'postgresql',
      'component': 'database'
    });

    return {
      span,
      finish: (error = null, result = null) => {
        if (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message
          });
          span.setAttributes({
            'error': true,
            'error.message': error.message,
            'error.type': error.constructor.name
          });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
          if (result && result.rowCount !== undefined) {
            span.setAttributes({
              'db.rows_affected': result.rowCount
            });
          }
        }
        span.end();
      }
    };
  }

  /**
   * Trace an HTTP call to another service
   */
  traceServiceCall(req, targetService, method, url) {
    const span = this.createChildSpan(req, `http.${targetService}`, {
      'http.method': method,
      'http.url': url,
      'service.target': targetService,
      'component': 'http-client',
      'span.kind': 'client'
    });

    return {
      span,
      getHeaders: () => ({
        'x-correlation-id': req.traceContext?.correlationId || uuidv4(),
        'x-trace-id': span.spanContext().traceId,
        'x-span-id': span.spanContext().spanId
      }),
      finish: (error = null, response = null) => {
        if (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message
          });
          span.setAttributes({
            'error': true,
            'error.message': error.message,
            'error.type': error.constructor.name
          });
        } else if (response) {
          span.setAttributes({
            'http.status_code': response.status || response.statusCode,
            'http.response.size': response.headers?.['content-length'] || 0
          });
          
          if ((response.status || response.statusCode) >= 400) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: `HTTP ${response.status || response.statusCode}`
            });
          } else {
            span.setStatus({ code: SpanStatusCode.OK });
          }
        }
        span.end();
      }
    };
  }

  /**
   * Trace a Pub/Sub event publication or consumption
   */
  tracePubSubOperation(req, operation, topic, eventType = null) {
    const span = this.createChildSpan(req, `pubsub.${operation}`, {
      'messaging.system': 'pubsub',
      'messaging.destination': topic,
      'messaging.operation': operation,
      'component': 'messaging'
    });

    if (eventType) {
      span.setAttributes({
        'messaging.message_type': eventType
      });
    }

    return {
      span,
      finish: (error = null, messageId = null) => {
        if (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message
          });
          span.setAttributes({
            'error': true,
            'error.message': error.message
          });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
          if (messageId) {
            span.setAttributes({
              'messaging.message_id': messageId
            });
          }
        }
        span.end();
      }
    };
  }

  /**
   * Add custom attributes to the current span
   */
  addSpanAttributes(req, attributes) {
    if (req.traceContext?.span) {
      req.traceContext.span.setAttributes(attributes);
    }
  }

  /**
   * Log an event with trace context
   */
  logWithTrace(req, level, message, additionalData = {}) {
    const traceData = req.traceContext ? {
      correlationId: req.traceContext.correlationId,
      traceId: req.traceContext.span.spanContext().traceId,
      spanId: req.traceContext.span.spanContext().spanId
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
    const headers = {
      'x-correlation-id': correlationId
    };

    if (req.traceContext?.span) {
      const spanContext = req.traceContext.span.spanContext();
      headers['x-trace-id'] = spanContext.traceId;
      headers['x-span-id'] = spanContext.spanId;
    }

    return headers;
  }
}

module.exports = { TracingManager };
