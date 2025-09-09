# Quick Start Guide - Enhanced Task Manager

## 🚀 Getting Started

This guide will help you get the enhanced Task Manager microservices running locally with all the new features including media management, enhanced security, and comprehensive monitoring.

## Prerequisites

- **Node.js** 18+ 
- **Docker** & **Docker Compose**
- **Git**

## Quick Setup

### 1. Environment Setup
```bash
# Navigate to backend directory
cd backend

# Copy environment configuration
cp .env.example .env

# Edit .env file to customize settings (optional for local development)
```

### 2. Start All Services
```bash
# Make start script executable and run
chmod +x start-dev.sh
./start-dev.sh
```

This will:
- ✅ Install dependencies for all services
- ✅ Start PostgreSQL with schema initialization
- ✅ Start Redis for caching
- ✅ Start Pub/Sub emulator for events
- ✅ Start all microservices (Auth, Task, Media, API Gateway)
- ✅ Wait for all services to be healthy
- ✅ Display service URLs and testing commands

## Service URLs

Once started, your services will be available at:

| Service | URL | Description |
|---------|-----|-------------|
| **API Gateway** | http://localhost:3000 | Main entry point |
| **Auth Service** | http://localhost:3001 | Authentication |
| **Task Service** | http://localhost:3002 | Task management |
| **Media Service** | http://localhost:3003 | File uploads & media |
| **PostgreSQL** | localhost:5432 | Database |
| **Redis** | localhost:6379 | Cache & sessions |
| **Pub/Sub Emulator** | localhost:8085 | Event messaging |

## Quick API Tests

### 1. Health Check
```bash
curl http://localhost:3000/health
```

### 2. Register a User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!",
    "firstName": "Test",
    "lastName": "User"
  }'
```

### 3. Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!"
  }'
```

### 4. Create a Task (use token from login)
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Task",
    "description": "This is a test task"
  }'
```

### 5. Upload an Image
```bash
curl -X POST http://localhost:3000/api/media/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@path/to/your/image.jpg"
```

### 6. Attach Image to Task
```bash
curl -X POST http://localhost:3000/api/tasks/1/attach-media \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mediaId": 1}'
```

## Enhanced Features Available

### 🔐 Security Features
- **JWT Token Rotation**: Automatic token refresh for enhanced security
- **Rate Limiting**: Prevents abuse with configurable limits
- **Input Validation**: Comprehensive validation and sanitization
- **Password Strength**: Enforced strong password requirements
- **Audit Logging**: Security events tracking

### 📊 Monitoring & Metrics
- **Prometheus Metrics**: Available at `/metrics` on each service
- **Health Checks**: Comprehensive health monitoring at `/health`
- **Performance Tracking**: Request duration, database queries, Redis operations
- **Business Metrics**: User registrations, task operations, media uploads

### 🖼️ Media Management
- **File Upload**: Supports image uploads with validation
- **Image Optimization**: Automatic compression and thumbnail generation
- **Storage Options**: Local storage for development, GCS for production
- **Media Attachments**: Link images to tasks with many-to-many relationships

### ⚡ Performance Features
- **Redis Caching**: Fast access to frequently used data
- **Connection Pooling**: Optimized database connections
- **Circuit Breakers**: Fault tolerance between services
- **Event-Driven Architecture**: Pub/Sub for decoupled communication

## Monitoring URLs

### Prometheus Metrics
- Auth Service: http://localhost:3001/metrics
- Task Service: http://localhost:3002/metrics  
- Media Service: http://localhost:3003/metrics
- API Gateway: http://localhost:3000/metrics

### Health Checks
- Auth Service: http://localhost:3001/health
- Task Service: http://localhost:3002/health
- Media Service: http://localhost:3003/health
- API Gateway: http://localhost:3000/health

## Troubleshooting

### Services Not Starting?
```bash
# Check Docker is running
docker --version

# Check port availability
lsof -i :3000,3001,3002,3003,5432,6379,8085

# View service logs
docker-compose logs -f [service-name]
```

### Database Connection Issues?
```bash
# Check PostgreSQL is ready
docker-compose exec postgres pg_isready -U taskuser -d taskmanager

# View database logs
docker-compose logs postgres
```

### Redis Connection Issues?
```bash
# Test Redis connection
docker-compose exec redis redis-cli ping

# View Redis logs
docker-compose logs redis
```

## Stopping Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (clean reset)
docker-compose down -v
```

## Development Workflow

### Making Code Changes
1. Edit service code in `services/[service-name]/src/`
2. Services auto-reload with nodemon in development
3. Check logs: `docker-compose logs -f [service-name]`

### Database Changes
1. Create migration: `node lib/migration-manager.js create "migration_name"`
2. Edit migration files in `migrations/`
3. Apply migrations: `node lib/migration-manager.js migrate`

### Adding New Dependencies
1. Update `package.json` in relevant service
2. Rebuild container: `docker-compose up --build [service-name]`

## Next Steps

✅ **Backend Complete** - All microservices are running with enhanced features

🔄 **Frontend Integration** - Ready for React/Next.js frontend development

🚀 **Production Deployment** - Kubernetes configs ready for GCP deployment

📊 **Monitoring Setup** - Ready for Grafana dashboards and alerting

---

🎉 **Your enhanced Task Manager is now running!**

The system includes enterprise-grade patterns like circuit breakers, comprehensive monitoring, security best practices, and event-driven architecture. Perfect for learning advanced microservices concepts!

For detailed API documentation and advanced configuration, see the other documentation files in this repository.
