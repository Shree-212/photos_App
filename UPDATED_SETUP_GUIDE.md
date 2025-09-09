# Task Manager - Updated Setup Guide

## 🚀 Quick Start (Updated for New Services)

This updated guide includes the new notification service and distributed tracing enhancements.

### Prerequisites

- **Docker Desktop** (with Docker Compose)
- **Node.js** 16+ (for local development)
- **Git**
- **curl** (for testing)

### Services Overview

The Task Manager now includes **5 microservices**:

1. **🔐 Auth Service** (Port 3001) - Authentication & authorization
2. **📋 Task Service** (Port 3002) - Task management with media support
3. **🖼️ Media Service** (Port 3003) - File upload/download with image processing
4. **📧 Notification Service** (Port 3004) - **NEW** Event-driven notifications & emails
5. **🌐 API Gateway** (Port 3000) - Request routing & load balancing

### Infrastructure Components

- **PostgreSQL** (Port 5432) - Primary database
- **Redis** (Port 6379) - Caching & session storage  
- **Pub/Sub Emulator** (Port 8085) - Event messaging system

## 🛠️ Local Development Setup

### 1. Clone and Setup

```bash
# Clone repository
git clone <repository-url>
cd taskmanager/backend

# Copy environment configuration
cp .env.example .env

# Edit .env file with your settings (especially email configuration)
nano .env
```

### 2. Configure Email (New Requirement)

Update your `.env` file with email settings for the notification service:

```bash
# Email Configuration (required for notification service)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # Use app password, not regular password
SMTP_FROM="Task Manager <your-email@gmail.com>"
```

### 3. Start All Services

```bash
# Make script executable
chmod +x start-dev.sh

# Run development environment
./start-dev.sh
```

The script will:
- ✅ Check Docker status
- ✅ Install dependencies for all 5 services
- ✅ Build and start all containers
- ✅ Wait for services to be ready
- ✅ Show service status and URLs

### 4. Verify Services

After startup, verify all services are running:

```bash
# Check service health
curl http://localhost:3000/health  # API Gateway
curl http://localhost:3001/health  # Auth Service
curl http://localhost:3002/health  # Task Service
curl http://localhost:3003/health  # Media Service
curl http://localhost:3004/health  # Notification Service (NEW)

# Check service status
docker-compose ps
```

## 🔧 New Features & Capabilities

### Distributed Tracing

All services now include correlation ID tracing:

- Every request gets a unique `x-correlation-id` header
- Trace data flows through all service calls
- Enhanced logging with request context
- Performance monitoring for database and service calls

### Event-Driven Architecture

The notification service processes events from:

- Task creation/updates
- Media uploads/deletions
- User authentication events
- System-wide notifications

### Enhanced API Gateway

Updated routing for all services:

```bash
# API Gateway routes
/api/auth/*          → Auth Service
/api/tasks/*         → Task Service  
/api/media/*         → Media Service
/api/notifications/* → Notification Service (NEW)
```

## 📋 Development Workflow

### Working with Individual Services

```bash
# View logs for specific service
docker-compose logs -f notification-service
docker-compose logs -f media-service

# Restart a specific service
docker-compose restart task-service

# Rebuild and restart
docker-compose up --build -d auth-service
```

### Testing New Features

```bash
# Test notification service
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"test","recipient":"user@example.com","message":"Test notification"}'

# Test task with media
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Task with notification","description":"This will trigger events"}'
```

### Monitoring & Debugging

```bash
# View distributed tracing logs
docker-compose logs -f | grep "correlationId"

# Monitor Pub/Sub events
docker-compose logs -f pubsub-emulator

# Check Redis cache
docker-compose exec redis redis-cli monitor

# Database access
docker-compose exec postgres psql -U taskuser -d taskmanager
```

## 🔄 Migration Notes

### From Previous Version

If you're upgrading from the previous version:

1. **New Dependencies**: The notification service requires email configuration
2. **Database Schema**: New notification tables are auto-created
3. **Environment Variables**: Added tracing and email configuration
4. **Port Usage**: Notification service uses port 3004

### Breaking Changes

- **Email Configuration**: Required for notification service to function
- **API Endpoints**: New `/api/notifications/*` endpoints added
- **Event System**: All services now publish events to Pub/Sub

## 🚀 Production Deployment

### GCP Cloud Build

The updated `cloudbuild.yaml` now includes all 5 services:

```bash
# Trigger build
gcloud builds submit --config cloudbuild.yaml

# Deploy to GKE
kubectl apply -f k8s/
```

### Environment Configuration

Production environment variables:

```bash
# Service URLs (internal cluster communication)
AUTH_SERVICE_URL=http://auth-service:3001
TASK_SERVICE_URL=http://task-service:3002
MEDIA_SERVICE_URL=http://media-service:3003
NOTIFICATION_SERVICE_URL=http://notification-service:3004

# Production email service
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key

# Distributed tracing in production
TRACING_ENABLED=true
TRACING_SAMPLE_RATE=0.1  # Sample 10% of requests
LOG_LEVEL=info
```

## 🛠️ Troubleshooting

### Common Issues

1. **Notification Service Email Errors**
   ```bash
   # Check email configuration
   docker-compose logs notification-service | grep -i smtp
   
   # Test email connectivity
   docker-compose exec notification-service npm run test:email
   ```

2. **Tracing Not Working**
   ```bash
   # Verify correlation IDs in logs
   docker-compose logs | grep correlationId
   
   # Check tracing configuration
   curl http://localhost:3000/health -H "x-correlation-id: test-123"
   ```

3. **Service Communication Issues**
   ```bash
   # Check service discovery
   docker-compose exec api-gateway nslookup notification-service
   
   # Test internal communication
   docker-compose exec api-gateway curl http://notification-service:3004/health
   ```

### Service Dependencies

Start order dependencies:
1. PostgreSQL, Redis, Pub/Sub Emulator
2. Auth Service
3. Task Service, Media Service, Notification Service  
4. API Gateway

## 📊 Monitoring

### Health Checks

```bash
# All services health check
for port in 3000 3001 3002 3003 3004; do
  echo "Port $port: $(curl -s http://localhost:$port/health | jq -r .status)"
done
```

### Metrics

Prometheus metrics available at:
- http://localhost:3000/metrics (API Gateway)
- http://localhost:3001/metrics (Auth Service)
- http://localhost:3002/metrics (Task Service)
- http://localhost:3003/metrics (Media Service)
- http://localhost:3004/metrics (Notification Service)

---

**Updated**: September 2025
**Version**: 2.0 (with notification service and distributed tracing)

For additional help, check the service logs or open an issue in the repository.
