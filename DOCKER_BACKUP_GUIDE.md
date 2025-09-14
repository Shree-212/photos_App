# 🐳 Docker Configuration Backup

This document contains all Docker-related configurations for the Task Manager application.

## 📁 Docker Files Overview

### Backend Services
- `backend/services/auth-service/Dockerfile`
- `backend/services/task-service/Dockerfile`  
- `backend/services/media-service/Dockerfile`
- `backend/docker-compose.yml` (for local development)

### Frontend
- `frontend/Dockerfile`
- `frontend/Dockerfile.k8s` (for Kubernetes deployment)
- `frontend/Dockerfile.prod` (for production)

### Build Scripts
- `backend/deploy-gcp.sh` (builds and pushes all backend services)
- `frontend/deploy-k8s.sh` (builds and pushes frontend)

## 🏗️ Standard Dockerfile Template

### Node.js Service Template
```dockerfile
# Multi-stage build for Node.js services
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application (if needed)
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

# Set working directory
WORKDIR /app

# Copy built application and dependencies
COPY --from=builder --chown=nodeuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodeuser:nodejs /app/dist ./dist
COPY --from=builder --chown=nodeuser:nodejs /app/package*.json ./

# Switch to non-root user
USER nodeuser

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start application
CMD ["npm", "start"]
```

### Next.js Frontend Template
```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start application
CMD ["npm", "start"]
```

## 🐳 Docker Compose for Local Development

### Full Stack Development
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: taskmanager
      POSTGRES_USER: taskuser
      POSTGRES_PASSWORD: password123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U taskuser -d taskmanager"]
      interval: 30s
      timeout: 10s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 5

  auth-service:
    build:
      context: ./services/auth-service
      dockerfile: Dockerfile
    ports:
      - "8081:8080"
    environment:
      - DATABASE_URL=postgresql://taskuser:password123@postgres:5432/taskmanager
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=your-jwt-secret-key
      - NODE_ENV=development
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./services/auth-service:/app
      - /app/node_modules

  task-service:
    build:
      context: ./services/task-service
      dockerfile: Dockerfile
    ports:
      - "8082:8080"
    environment:
      - DATABASE_URL=postgresql://taskuser:password123@postgres:5432/taskmanager
      - REDIS_URL=redis://redis:6379
      - AUTH_SERVICE_URL=http://auth-service:8080
      - NODE_ENV=development
    depends_on:
      - postgres
      - redis
      - auth-service
    volumes:
      - ./services/task-service:/app
      - /app/node_modules

  media-service:
    build:
      context: ./services/media-service
      dockerfile: Dockerfile
    ports:
      - "8083:8080"
    environment:
      - DATABASE_URL=postgresql://taskuser:password123@postgres:5432/taskmanager
      - REDIS_URL=redis://redis:6379
      - AUTH_SERVICE_URL=http://auth-service:8080
      - STORAGE_BUCKET=local-storage
      - NODE_ENV=development
    depends_on:
      - postgres
      - redis
      - auth-service
    volumes:
      - ./services/media-service:/app
      - /app/node_modules
      - ./uploads:/app/uploads

  frontend:
    build:
      context: ../frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8081
      - NEXT_PUBLIC_TASK_API_URL=http://localhost:8082
      - NEXT_PUBLIC_MEDIA_API_URL=http://localhost:8083
      - NODE_ENV=development
    depends_on:
      - auth-service
      - task-service
      - media-service
    volumes:
      - ../frontend:/app
      - /app/node_modules
      - /app/.next

volumes:
  postgres_data:
```

## 🚀 Build and Deployment Scripts

### Backend Build Script (`backend/deploy-gcp.sh`)
```bash
#!/bin/bash

# Set project ID
PROJECT_ID="your-gcp-project-id"

# Build and push each service
services=("auth-service" "task-service" "media-service")

for service in "${services[@]}"; do
    echo "Building $service..."
    
    # Build Docker image
    docker build -t "gcr.io/${PROJECT_ID}/${service}:latest" \
        "./services/${service}"
    
    # Push to Google Container Registry
    docker push "gcr.io/${PROJECT_ID}/${service}:latest"
    
    echo "$service built and pushed successfully!"
done

echo "All backend services built and pushed!"
```

### Frontend Build Script (`frontend/deploy-k8s.sh`)
```bash
#!/bin/bash

# Set project ID
PROJECT_ID="your-gcp-project-id"

echo "Building frontend..."

# Build Docker image
docker build -t "gcr.io/${PROJECT_ID}/frontend:latest" \
    -f Dockerfile.k8s .

# Push to Google Container Registry
docker push "gcr.io/${PROJECT_ID}/frontend:latest"

echo "Frontend built and pushed successfully!"
```

## 🔧 Docker Best Practices Implemented

### Security
- **Non-root users**: All containers run as non-root
- **Minimal base images**: Using Alpine Linux for smaller attack surface
- **No secrets in images**: Environment variables for sensitive data
- **Health checks**: Proper health check endpoints

### Performance
- **Multi-stage builds**: Smaller production images
- **Layer caching**: Optimized Dockerfile layer order
- **Dependencies first**: Copy package.json before source code
- **.dockerignore**: Exclude unnecessary files

### Reliability
- **Health checks**: Container health monitoring
- **Graceful shutdown**: Proper signal handling
- **Resource limits**: Memory and CPU constraints
- **Restart policies**: Automatic container restart

## 🏃‍♂️ Quick Start Commands

### Local Development
```bash
# Start all services
cd backend
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Rebuild specific service
docker-compose up -d --build auth-service
```

### Production Build
```bash
# Set your project ID
export PROJECT_ID="your-gcp-project-id"

# Configure Docker for GCR
gcloud auth configure-docker

# Build and push all services
cd backend
./deploy-gcp.sh

cd ../frontend
./deploy-k8s.sh

# Verify images
gcloud container images list --repository=gcr.io/$PROJECT_ID
```

### Image Management
```bash
# List all images
docker images

# Remove unused images
docker image prune -a

# Tag image for different environment
docker tag gcr.io/PROJECT/service:latest gcr.io/PROJECT/service:v1.0.0

# Pull specific version
docker pull gcr.io/PROJECT/service:v1.0.0
```

## 🐛 Troubleshooting

### Common Issues

#### Build Failures
```bash
# Clear Docker cache
docker system prune -a

# Build with no cache
docker build --no-cache -t image-name .

# Check build context size
du -sh .
```

#### Authentication Issues
```bash
# Re-authenticate with GCP
gcloud auth login
gcloud auth configure-docker

# Check current authentication
gcloud auth list
```

#### Image Size Issues
```bash
# Analyze image layers
docker history image-name

# Use dive for detailed analysis
dive image-name
```

## 📊 Resource Specifications

### Container Resources
```yaml
# Production resource specifications
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

# Development resource specifications
resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 200m
    memory: 256Mi
```

### Image Sizes (Approximate)
- **Auth Service**: ~150MB
- **Task Service**: ~150MB
- **Media Service**: ~180MB
- **Frontend**: ~200MB
- **Total**: ~680MB

## 🔄 CI/CD Integration

### GitHub Actions Example
```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Google Cloud
      uses: google-github-actions/setup-gcloud@v0
      with:
        service_account_key: ${{ secrets.GCP_SA_KEY }}
        project_id: ${{ secrets.GCP_PROJECT_ID }}
    
    - name: Configure Docker
      run: gcloud auth configure-docker
    
    - name: Build and Push
      run: |
        cd backend
        ./deploy-gcp.sh
        cd ../frontend
        ./deploy-k8s.sh
```

---

**Last Updated**: September 15, 2025  
**Docker Version**: 20.10+  
**Node.js Version**: 18 LTS  
**Base Images**: Alpine Linux for minimal size
