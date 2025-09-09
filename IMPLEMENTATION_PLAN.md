# Task Manager Enhancement Implementation Plan

## Overview
This plan extends the existing Task Manager microservices project to include new media management capabilities and address identified architecture gaps for deeper microservices understanding.

## Architecture Changes

### Current Architecture
```
Frontend (Next.js) → API Gateway → Auth Service
                                 → Task Service
                   → PostgreSQL
                   → Redis
```

### Enhanced Architecture
```
Frontend (Next.js) → API Gateway → Auth Service
                                 → Task Service ←→ Media Service
                                 → Media Service ←→ Google Cloud Storage
                                 → Notification Service (Pub/Sub)
                   → PostgreSQL (with migrations)
                   → Redis (with clustering)
                   → Prometheus Metrics
                   → Distributed Tracing
```

## New Services & Components

### 1. Media Service
- **Purpose**: Centralized image/file management
- **Storage**: Google Cloud Storage integration
- **Features**:
  - Upload/download images
  - Image metadata management
  - Media library browsing
  - Image optimization and resizing
  - Access control integration

### 2. Enhanced Task Service
- **New Features**:
  - Image attachment support
  - Task image gallery
  - Integration with Media Service

### 3. Event-Driven Architecture (Pub/Sub)
- **Events**:
  - `task.created`
  - `task.updated` 
  - `task.deleted`
  - `media.uploaded`
  - `media.deleted`
  - `user.registered`

### 4. Database Migration System
- **Tool**: Custom migration system with versioning
- **Features**:
  - Schema versioning
  - Rollback capability
  - Environment-specific migrations

## Gap Addressing Map

| Gap/Risk | Implementation | Files Affected |
|----------|----------------|----------------|
| **File Upload Service** | Media Service with GCS | `media-service/`, `k8s/` |
| **Event-Driven Architecture** | Cloud Pub/Sub integration | All services |
| **Distributed Tracing** | Jaeger integration | All services |
| **Database Migrations** | Custom migration system | `migrations/`, `services/` |
| **Prometheus Metrics** | Metrics endpoints | All services |
| **Secret Management** | GCP Secret Manager | `k8s/secrets.yaml`, services |
| **API Versioning** | Version headers & routing | `api-gateway/` |
| **Data Validation** | Joi schemas across services | All services |
| **Error Handling** | Centralized error middleware | All services |
| **Service Redundancy** | Redis clustering, service mesh prep | `k8s/`, `docker-compose.yml` |

## Implementation Phases

### Phase 1: Core Infrastructure (Days 1-2)
1. Remove test files
2. Setup database migrations
3. Enhance secret management
4. Add Prometheus metrics foundation

### Phase 2: Media Service (Days 3-4)
1. Create media-service backend
2. Implement GCS integration
3. Add media API endpoints
4. Update API Gateway routing

### Phase 3: Event-Driven Architecture (Days 5-6)
1. Implement Pub/Sub integration
2. Add event publishers/subscribers
3. Create notification service foundation

### Phase 4: Enhanced Task Service (Day 7)
1. Add image attachment functionality
2. Integrate with Media Service
3. Update task endpoints

### Phase 5: Frontend Enhancement (Days 8-9)
1. Create media manager interface
2. Add image carousel component
3. Integrate task image functionality

### Phase 6: Monitoring & Tracing (Day 10)
1. Complete distributed tracing setup
2. Add comprehensive monitoring
3. Create health check endpoints

### Phase 7: Deployment & Testing (Days 11-12)
1. Update Kubernetes configurations
2. Update GCP deployment scripts
3. Setup local development environment
4. Documentation and testing guides

## Technical Specifications

### Media Service API Endpoints
```
POST   /media/upload          - Upload image
GET    /media/:id             - Get image metadata
GET    /media/:id/download    - Download image
GET    /media                 - List images (paginated)
DELETE /media/:id             - Delete image
POST   /media/:id/optimize    - Optimize image
```

### Enhanced Task Service Endpoints
```
POST   /tasks                 - Create task (with image support)
PUT    /tasks/:id            - Update task (with image support)
POST   /tasks/:id/images     - Add image to task
DELETE /tasks/:id/images/:imageId - Remove image from task
GET    /tasks/:id/images     - Get task images
```

### Event Schema
```javascript
{
  eventType: 'task.created',
  timestamp: '2025-09-09T10:00:00Z',
  serviceId: 'task-service',
  correlationId: 'uuid',
  data: {
    taskId: 123,
    userId: 456,
    // ... task data
  }
}
```

### Database Schema Changes
```sql
-- New tables
CREATE TABLE media_files (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  gcs_path VARCHAR(500) NOT NULL,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE task_media (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  media_id INTEGER REFERENCES media_files(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, media_id)
);

CREATE TABLE schema_migrations (
  id SERIAL PRIMARY KEY,
  version VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Local Development Setup

### Environment Variables
```bash
# Media Service
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_STORAGE_BUCKET=taskmanager-media
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

# Pub/Sub
PUBSUB_EMULATOR_HOST=localhost:8085

# Monitoring
JAEGER_ENDPOINT=http://localhost:14268/api/traces
PROMETHEUS_PORT=9090
```

### Docker Compose Updates
- Add media-service
- Add Pub/Sub emulator
- Add Jaeger
- Add Prometheus
- Add Redis cluster

## Security Enhancements

### Secret Management
- Move to GCP Secret Manager
- Implement JWT rotation
- Add service-to-service authentication
- Implement proper RBAC

### Access Control
- Media file access permissions
- User-based image isolation
- Admin media management interface

## Monitoring & Observability

### Metrics to Track
- Request latency per service
- Error rates
- File upload success/failure rates
- Storage usage
- Database connection pool usage
- Event processing latency

### Distributed Tracing
- Request flow across services
- Database query tracing
- External API call tracing
- File upload/download tracing

## Next Steps After Implementation

### Short-term (1-2 weeks)
- OAuth2/OIDC integration
- Container vulnerability scanning
- API rate limiting improvements

### Long-term (1-2 months)
- Istio service mesh
- Multi-region deployment
- Advanced caching strategies
- Machine learning integration for image processing

## Success Criteria

1. ✅ Media Service successfully uploads/downloads images
2. ✅ Tasks can have attached images displayed in UI
3. ✅ Media manager interface works for browsing images
4. ✅ Events are properly published and consumed
5. ✅ Database migrations work correctly
6. ✅ Metrics and tracing are functional
7. ✅ Local development environment is stable
8. ✅ GCP deployment is successful
9. ✅ All identified gaps are addressed
10. ✅ No test files remain in the project

This plan provides a structured approach to enhancing your microservices architecture while addressing the identified gaps and implementing the requested features.
