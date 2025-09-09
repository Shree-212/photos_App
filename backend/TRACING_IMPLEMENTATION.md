# Distributed Tracing Implementation

## Overview
This document describes the implementation of distributed tracing across all microservices in the Task Manager application. The tracing system provides correlation ID propagation, request tracking, and centralized logging for improved observability.

## Architecture

### Simple Tracing Manager
Located in `/backend/lib/simple-tracing.js`, this lightweight tracing library provides:

- **Correlation ID Generation**: Unique identifiers for tracking requests across services
- **Express Middleware**: Automatic tracing integration for HTTP requests
- **Database Query Tracing**: Performance monitoring for database operations
- **Service Call Tracing**: Tracking inter-service communications
- **Centralized Logging**: Structured logging with trace context

### Key Features

1. **Request Correlation**: Each request gets a unique `correlation-id` that follows it through all services
2. **Span Management**: Hierarchical tracking of operations within a request
3. **Performance Monitoring**: Automatic timing of operations
4. **Error Tracking**: Detailed error context with trace information
5. **Service Topology**: Understanding of service dependencies and call patterns

## Implementation Details

### Services Integrated

1. **API Gateway** (`/services/api-gateway/src/app.js`)
   - Entry point for all external requests
   - Generates initial correlation IDs
   - Propagates tracing headers to downstream services

2. **Auth Service** (`/services/auth-service/src/app.js`)
   - User authentication and authorization
   - Token verification and user management
   - Database operations tracing

3. **Task Service** (`/services/task-service/src/app.js`)
   - Task CRUD operations
   - Business logic tracking
   - Database and cache operations

4. **Media Service** (`/services/media-service/src/app.js`)
   - File upload and download operations
   - Image processing tracing
   - Storage operations monitoring

5. **Notification Service** (`/services/notification-service/src/app.js`)
   - Event processing and notifications
   - Email delivery tracking
   - Pub/Sub integration monitoring

### Middleware Integration

Each service includes the tracing middleware early in the request pipeline:

```javascript
const { SimpleTracingManager } = require('../../lib/simple-tracing');

// Initialize tracing
const tracingManager = new SimpleTracingManager('service-name', logger);

// Add middleware
app.use(tracingManager.createExpressMiddleware());
```

### Correlation ID Flow

1. **Request Entry**: API Gateway generates or extracts correlation ID from headers
2. **Header Propagation**: Correlation ID passed via `x-correlation-id` header
3. **Service Processing**: Each service logs operations with correlation context
4. **Response**: Correlation ID returned in response headers for client tracking

## Usage Examples

### Express Middleware
```javascript
// Automatically applied to all routes
app.use(tracingManager.createExpressMiddleware());
```

### Database Query Tracing
```javascript
// Wrap database queries for performance tracking
const result = await tracingManager.traceDbQuery(
  'get_user_tasks',
  pool.query('SELECT * FROM tasks WHERE user_id = $1', [userId])
);
```

### Service Call Tracing
```javascript
// Track inter-service communications
const response = await tracingManager.traceServiceCall(
  'auth-service',
  'verify_token',
  axios.post(authUrl, data, { headers })
);
```

### Manual Span Creation
```javascript
// Create custom spans for business logic
const span = tracingManager.startSpan('process_task_creation');
try {
  // Business logic here
  span.setTag('task_id', taskId);
  span.setTag('user_id', userId);
} catch (error) {
  span.setError(error);
  throw error;
} finally {
  span.finish();
}
```

## Benefits

1. **Request Tracing**: Complete visibility into request flow across services
2. **Performance Monitoring**: Identify bottlenecks and slow operations
3. **Error Debugging**: Detailed context for troubleshooting issues
4. **Service Dependencies**: Understanding of service interaction patterns
5. **Production Observability**: Real-time monitoring of system behavior

## Log Format

Tracing logs include structured data:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "info",
  "service": "task-service",
  "correlationId": "req_1705312245123_abc123",
  "spanId": "span_1705312245124_def456",
  "operation": "create_task",
  "duration": 245,
  "tags": {
    "user_id": "user_123",
    "task_id": "task_456"
  }
}
```

## Integration with Existing Systems

The tracing implementation integrates seamlessly with:

- **Winston Logging**: Existing log configuration and transports
- **Prometheus Metrics**: Performance data for monitoring dashboards
- **Circuit Breakers**: Error tracking and service health
- **Database Connections**: Query performance monitoring
- **Redis Cache**: Cache operation tracing

## Future Enhancements

1. **OpenTelemetry Integration**: Migration to industry-standard tracing
2. **Jaeger/Zipkin**: Visual trace analysis and service maps
3. **Custom Dashboards**: Grafana integration for trace visualization
4. **Alerting**: Automated alerts based on trace data patterns
5. **Sampling**: Intelligent trace sampling for high-volume environments

## Configuration

Environment variables for tracing configuration:

```bash
# Tracing configuration
TRACING_ENABLED=true
TRACING_SAMPLE_RATE=1.0
TRACING_LOG_LEVEL=info

# Service identification
SERVICE_NAME=task-service
SERVICE_VERSION=1.0.0
```

## Monitoring and Maintenance

- Monitor trace logs for correlation ID coverage
- Verify span hierarchy and timing accuracy  
- Check for trace data completeness across services
- Review performance impact of tracing overhead
- Validate error context and debugging information

This tracing implementation provides a solid foundation for observability in the microservices architecture, enabling better monitoring, debugging, and performance optimization.
