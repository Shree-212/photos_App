# Task Manager - Enhanced Microservices Platform

> **Enterprise-grade microservices architecture with media management, enhanced security, and comprehensive monitoring**

## 🎯 Project Overview

An advanced task management system built with modern microservices architecture, featuring image attachments, event-driven communication, and production-ready monitoring. Perfect for learning enterprise patterns and cloud-native development.

## ✨ Key Features

### 🔐 Enhanced Security
- **JWT Token Rotation** with automatic refresh
- **Multi-layer Rate Limiting** for different endpoint types
- **Advanced Password Validation** with strength requirements
- **Input Sanitization** and validation
- **Security Audit Logging** for compliance

### 🖼️ Media Management
- **File Upload Service** with image optimization
- **Thumbnail Generation** using Sharp
- **Multi-storage Support** (Local for dev, GCS for production)
- **Media-Task Relationships** with many-to-many associations
- **File Type Validation** and size limits

### 📊 Monitoring & Observability
- **Prometheus Metrics** collection across all services
- **Comprehensive Health Checks** with dependency monitoring
- **Business Metrics** tracking (registrations, uploads, etc.)
- **Performance Monitoring** (response times, DB queries)
- **Structured Logging** with Winston

### ⚡ Performance & Reliability
- **Redis Caching** for sessions and metadata
- **Circuit Breaker Pattern** for service resilience
- **Connection Pooling** for database optimization
- **Event-Driven Architecture** with Google Cloud Pub/Sub
- **Database Migration System** with rollback support

## 🏗️ Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│             │    │             │    │             │    │             │
│ API Gateway │◄──►│Auth Service │    │Task Service │◄──►│Media Service│
│   :3000     │    │   :3001     │    │   :3002     │    │   :3003     │
│             │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │                   │
       │                   │                   │                   │
       └───────────────────┼───────────────────┼───────────────────┘
                           │                   │
                    ┌─────────────┐    ┌─────────────┐
                    │             │    │             │
                    │ PostgreSQL  │    │    Redis    │
                    │   :5432     │    │   :6379     │
                    │             │    │             │
                    └─────────────┘    └─────────────┘
                           │
                    ┌─────────────┐    ┌─────────────┐
                    │             │    │             │
                    │   GCS       │    │  Pub/Sub    │
                    │  Storage    │    │ Emulator    │
                    │             │    │   :8085     │
                    └─────────────┘    └─────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Git

### Get Started
```bash
# Clone repository
git clone <repository-url>
cd taskmanager/backend

# Setup environment
cp .env.example .env

# Start all services
chmod +x start-dev.sh
./start-dev.sh
```

**That's it!** All services will be running with monitoring, security, and media capabilities.

📖 **[Complete Setup Guide](QUICK_START_GUIDE.md)**

## 📋 Service Documentation

| Document | Description |
|----------|-------------|
| **[Quick Start Guide](QUICK_START_GUIDE.md)** | Get running in minutes |
| **[Implementation Plan](IMPLEMENTATION_PLAN.md)** | Architecture & design decisions |
| **[Development Status](DEVELOPMENT_STATUS.md)** | Current progress & next steps |
| **[GCP Learning Plan](GCP_Microservices_Learning_Plan.md)** | Cloud deployment guide |

## 🔧 Technology Stack

### Backend Services
- **Node.js** + Express.js microservices
- **PostgreSQL** with custom migration system
- **Redis** for caching and sessions
- **Google Cloud Storage** for media files
- **Google Cloud Pub/Sub** for event messaging

### Monitoring & Security
- **Prometheus** metrics collection
- **Winston** structured logging
- **Helmet** security headers
- **Rate limiting** with express-rate-limit
- **JWT** with automatic rotation

### DevOps & Deployment
- **Docker** containerization
- **Docker Compose** for local development
- **Kubernetes** production deployment
- **GitHub Actions** CI/CD ready
- **Terraform** infrastructure as code

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify` - Token verification
- `GET /api/auth/profile` - User profile

### Task Management
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create task
- `GET /api/tasks/:id` - Get task details
- `GET /api/tasks/:id/with-media` - Get task with media
- `POST /api/tasks/:id/attach-media` - Attach media to task

### Media Management
- `POST /api/media/upload` - Upload files
- `GET /api/media/:id` - Get media metadata
- `GET /api/media/:id/download` - Download file
- `GET /api/media/:id/thumbnail` - Get thumbnail

### Monitoring
- `GET /health` - Health check (all services)
- `GET /metrics` - Prometheus metrics (all services)

## 🔍 Monitoring Dashboard

Each service exposes comprehensive metrics:

```bash
# Service health
curl http://localhost:3000/health

# Prometheus metrics
curl http://localhost:3000/metrics
```

**Metrics Include:**
- HTTP request duration & count
- Database query performance
- Redis operation timing
- Business operation success rates
- Memory and CPU usage
- Error rates by endpoint

## 🛡️ Security Features

### Authentication & Authorization
- Secure JWT tokens with rotation
- Password strength enforcement
- Rate limiting per endpoint type
- Session management with Redis

### Input Validation
- Comprehensive input sanitization
- File upload validation
- SQL injection prevention
- XSS protection with Helmet

### Audit & Compliance
- Security event logging
- Authentication attempt tracking
- Privileged action monitoring
- GDPR-ready data handling

## 🌟 Advanced Patterns

### Circuit Breaker
```javascript
// Automatic fault tolerance between services
const circuitBreaker = new CircuitBreaker(serviceCall, {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
});
```

### Event-Driven Architecture
```javascript
// Decoupled service communication
await pubSubClient.topic('task-events').publish({
  eventType: 'MEDIA_ATTACHED',
  taskId: task.id,
  mediaId: media.id
});
```

### Database Migrations
```bash
# Create new migration
node lib/migration-manager.js create "add_user_preferences"

# Apply migrations
node lib/migration-manager.js migrate

# Rollback if needed
node lib/migration-manager.js rollback
```

## 📈 Performance Features

- **Connection Pooling**: Optimized database connections
- **Redis Caching**: Fast access to frequently used data  
- **Image Optimization**: Automatic compression & thumbnails
- **Lazy Loading**: Efficient data fetching patterns
- **Horizontal Scaling**: Kubernetes-ready architecture

## 🚢 Production Deployment

### Kubernetes Ready
```bash
# Deploy to Kubernetes
kubectl apply -f backend/k8s/
```

### Google Cloud Platform
- **GKE** for container orchestration
- **Cloud SQL** for managed PostgreSQL
- **Memorystore** for managed Redis
- **Cloud Storage** for media files
- **Cloud Pub/Sub** for messaging

## 🧪 Testing

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Load testing
npm run test:load

# Security tests
npm run test:security
```

## 📚 Learning Outcomes

This project demonstrates:

✅ **Microservices Architecture** patterns and best practices  
✅ **Event-Driven Design** with pub/sub messaging  
✅ **Security Patterns** including JWT rotation and rate limiting  
✅ **Monitoring & Observability** with Prometheus and health checks  
✅ **Database Design** with migrations and relationships  
✅ **Container Orchestration** with Docker and Kubernetes  
✅ **Cloud Integration** with Google Cloud Platform  
✅ **DevOps Practices** with CI/CD and infrastructure as code  

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Express.js** for the robust web framework
- **Google Cloud Platform** for cloud services
- **Prometheus** for monitoring capabilities
- **Sharp** for image processing
- **Redis** for caching performance

---

**Built with ❤️ for learning microservices architecture**

Ready to scale to enterprise levels! 🚀
