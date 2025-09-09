# Production Deployment Configuration

## Overview

This guide covers deploying the updated Task Manager microservices (including the new notification service and distributed tracing) to Google Cloud Platform.

## Updated Architecture

### Services (5 total)
- **auth-service**: Authentication and authorization
- **task-service**: Task management with distributed tracing
- **media-service**: File handling with tracing integration  
- **notification-service**: NEW - Event-driven notifications and emails
- **api-gateway**: Request routing with correlation ID propagation

### Infrastructure Dependencies
- **Cloud SQL (PostgreSQL)**: Primary database
- **Cloud Memorystore (Redis)**: Caching layer
- **Cloud Pub/Sub**: Event messaging system
- **Cloud Storage**: Media file storage
- **Cloud Build**: CI/CD pipeline
- **GKE**: Container orchestration

## GCP Setup Requirements

### 1. Enable Required APIs

```bash
gcloud services enable \
  container.googleapis.com \
  cloudbuild.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  pubsub.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com
```

### 2. Create GKE Cluster

```bash
# Create enhanced cluster for 5 services
gcloud container clusters create task-manager-cluster \
  --zone=us-central1-a \
  --num-nodes=4 \
  --machine-type=e2-standard-2 \
  --enable-autoscaling \
  --min-nodes=2 \
  --max-nodes=8 \
  --enable-autorepair \
  --enable-autoupgrade
```

### 3. Setup Cloud SQL with New Schema

```bash
# Create Cloud SQL instance
gcloud sql instances create task-manager-db \
  --database-version=POSTGRES_13 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --storage-auto-increase

# Create database and user
gcloud sql databases create taskmanager --instance=task-manager-db
gcloud sql users create taskuser --instance=task-manager-db --password=SECURE_PASSWORD
```

### 4. Setup Cloud Memorystore (Redis)

```bash
gcloud redis instances create task-manager-redis \
  --size=1 \
  --region=us-central1 \
  --redis-version=redis_6_x
```

### 5. Create Pub/Sub Topics

```bash
# Create main event topic
gcloud pubsub topics create task-manager-events

# Create notification-specific topics
gcloud pubsub topics create task-notifications
gcloud pubsub topics create user-notifications

# Create subscriptions
gcloud pubsub subscriptions create notification-service-subscription \
  --topic=task-manager-events
```

### 6. Setup Cloud Storage

```bash
# Create media storage bucket
gsutil mb gs://task-manager-media-prod

# Set appropriate permissions
gsutil iam ch serviceAccount:GKE_SERVICE_ACCOUNT:objectAdmin gs://task-manager-media-prod
```

## Kubernetes Configuration Updates

### Updated ConfigMap

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: task-manager-config
  namespace: task-manager
data:
  # Database configuration
  DB_HOST: "10.x.x.x"  # Cloud SQL private IP
  DB_NAME: "taskmanager"
  DB_USER: "taskuser"
  
  # Redis configuration  
  REDIS_URL: "redis://10.x.x.x:6379"  # Cloud Memorystore IP
  
  # Service URLs (internal)
  AUTH_SERVICE_URL: "http://auth-service:3001"
  TASK_SERVICE_URL: "http://task-service:3002"
  MEDIA_SERVICE_URL: "http://media-service:3003"
  NOTIFICATION_SERVICE_URL: "http://notification-service:3004"
  
  # GCP Configuration
  GCP_PROJECT_ID: "your-project-id"
  GCS_BUCKET: "task-manager-media-prod"
  PUBSUB_TOPIC: "task-manager-events"
  
  # Production settings
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  
  # Distributed Tracing
  TRACING_ENABLED: "true"
  TRACING_SAMPLE_RATE: "0.1"
  SERVICE_VERSION: "2.0.0"
```

### Secrets Configuration

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: task-manager-secrets
  namespace: task-manager
type: Opaque
data:
  DB_PASSWORD: base64_encoded_password
  JWT_SECRET: base64_encoded_jwt_secret
  SMTP_USER: base64_encoded_email
  SMTP_PASS: base64_encoded_app_password
  GCP_SERVICE_ACCOUNT_KEY: base64_encoded_service_account_json
```

## Service Deployment Configurations

### Notification Service Deployment

```yaml
# k8s/services/notification-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notification-service
  namespace: task-manager
spec:
  replicas: 2
  selector:
    matchLabels:
      app: notification-service
  template:
    metadata:
      labels:
        app: notification-service
    spec:
      containers:
      - name: notification-service
        image: gcr.io/PROJECT_ID/notification-service:latest
        ports:
        - containerPort: 3004
        env:
        - name: PORT
          value: "3004"
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: task-manager-config
              key: DB_HOST
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: task-manager-secrets
              key: DB_PASSWORD
        - name: SMTP_USER
          valueFrom:
            secretKeyRef:
              name: task-manager-secrets
              key: SMTP_USER
        - name: SMTP_PASS
          valueFrom:
            secretKeyRef:
              name: task-manager-secrets
              key: SMTP_PASS
        envFrom:
        - configMapRef:
            name: task-manager-config
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3004
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3004
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: notification-service
  namespace: task-manager
spec:
  selector:
    app: notification-service
  ports:
  - port: 3004
    targetPort: 3004
  type: ClusterIP
```

### Enhanced API Gateway Deployment

Update the API Gateway deployment to include notification service routing:

```yaml
# k8s/services/gateway/deployment.yaml (updated environment)
env:
- name: AUTH_SERVICE_URL
  valueFrom:
    configMapKeyRef:
      name: task-manager-config
      key: AUTH_SERVICE_URL
- name: TASK_SERVICE_URL
  valueFrom:
    configMapKeyRef:
      name: task-manager-config
      key: TASK_SERVICE_URL
- name: MEDIA_SERVICE_URL
  valueFrom:
    configMapKeyRef:
      name: task-manager-config
      key: MEDIA_SERVICE_URL
- name: NOTIFICATION_SERVICE_URL
  valueFrom:
    configMapKeyRef:
      name: task-manager-config
      key: NOTIFICATION_SERVICE_URL
```

## Cloud Build Pipeline Updates

The updated `cloudbuild.yaml` now builds all 5 services:

```bash
# Trigger build for all services
gcloud builds submit --config cloudbuild.yaml

# Or trigger automatically on git push
gcloud builds triggers create github \
  --repo-name=taskmanager \
  --repo-owner=YOUR_GITHUB_USERNAME \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml
```

## Monitoring & Observability

### Stackdriver Logging

Configure structured logging with correlation IDs:

```yaml
# Cloud Logging filter for distributed tracing
resource.type="k8s_container"
resource.labels.cluster_name="task-manager-cluster"
jsonPayload.correlationId!=""
```

### Monitoring Dashboards

Create custom dashboards for:
- Service health across all 5 services
- Request correlation and tracing
- Notification delivery metrics
- Email delivery success/failure rates
- Inter-service communication patterns

### Alerting

Setup alerts for:
- Service unavailability (any of the 5 services)
- High error rates with correlation ID context
- Email delivery failures
- Database connection issues
- Pub/Sub message processing delays

## Environment-Specific Configuration

### Development
```bash
# 5 services with emulators
PUBSUB_EMULATOR_HOST=localhost:8085
USE_LOCAL_STORAGE=true
TRACING_SAMPLE_RATE=1.0
```

### Staging
```bash
# 5 services with limited GCP resources
TRACING_SAMPLE_RATE=0.5
LOG_LEVEL=debug
```

### Production
```bash
# 5 services with full GCP infrastructure
TRACING_SAMPLE_RATE=0.1
LOG_LEVEL=info
SMTP_HOST=smtp.sendgrid.net
```

## Deployment Commands

### Initial Deployment

```bash
# Create namespace
kubectl create namespace task-manager

# Apply all configurations
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/services/

# Verify all 5 services are running
kubectl get pods -n task-manager
kubectl get services -n task-manager
```

### Rolling Updates

```bash
# Update specific service
kubectl set image deployment/notification-service \
  notification-service=gcr.io/PROJECT_ID/notification-service:NEW_TAG \
  -n task-manager

# Check rollout status
kubectl rollout status deployment/notification-service -n task-manager
```

### Health Checks

```bash
# Check all service health
kubectl get pods -n task-manager -o wide
kubectl logs -f deployment/notification-service -n task-manager

# Test service connectivity
kubectl exec -it deployment/api-gateway -n task-manager -- \
  curl http://notification-service:3004/health
```

## Backup & Recovery

### Database Backup
```bash
gcloud sql backups create --instance=task-manager-db
```

### Redis Backup
```bash
gcloud redis instances export task-manager-redis \
  gs://task-manager-backups/redis-backup-$(date +%Y%m%d)
```

### Configuration Backup
```bash
kubectl get configmap,secret -n task-manager -o yaml > k8s-backup.yaml
```

---

**Updated**: September 2025  
**Services**: 5 microservices with distributed tracing  
**New Features**: Notification service, correlation ID tracing, enhanced monitoring
