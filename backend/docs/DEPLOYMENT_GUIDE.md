# Complete Deployment Guide: Task Manager Microservices

This guide will walk you through deploying your Task Manager microservices application from local development to production on Google Cloud Platform.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [GCP Environment Setup](#gcp-environment-setup)
4. [Container Registry Setup](#container-registry-setup)
5. [Database Setup](#database-setup)
6. [Kubernetes Deployment](#kubernetes-deployment)
7. [Frontend Deployment](#frontend-deployment)
8. [CI/CD Pipeline](#cicd-pipeline)
9. [Monitoring and Logging](#monitoring-and-logging)
10. [Troubleshooting](#troubleshooting)

## Prerequisites

Before starting, ensure you have the following installed and configured:

- **Node.js** (v18 or higher)
- **Docker Desktop**
- **Google Cloud SDK (gcloud)**
- **kubectl**
- **Git**

## Local Development Setup

### Step 1: Clone and Setup Backend

```bash
# Clone your repository (replace with your actual repo URL)
git clone https://github.com/YOUR_USERNAME/taskmanager.git
cd taskmanager/backend

# Copy environment file
cp .env.example .env

# Edit the .env file with your local settings
nano .env
```

### Step 2: Start Backend Services

```bash
# Make sure Docker is running
docker --version

# Start all services
./start-dev.sh
```

This script will:
- Check Docker availability
- Install dependencies for all services
- Start PostgreSQL, Redis, and all microservices
- Wait for all services to be ready

### Step 3: Setup Frontend

```bash
# In a new terminal, navigate to frontend directory
cd ../frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

### Step 4: Test Local Setup

Open your browser and navigate to:
- Frontend: http://localhost:3100
- API Gateway: http://localhost:3000/api/docs
- Auth Service: http://localhost:3001/health
- Task Service: http://localhost:3002/health

## GCP Environment Setup

### Step 1: Run GCP Setup Script

```bash
cd backend
./infrastructure/scripts/setup-gcp.sh
```

This script will:
- Create a new GCP project
- Enable required APIs
- Set up service accounts
- Create Cloud SQL instance
- Set up GKE cluster
- Configure storage and Redis

### Step 2: Configure Local Environment

```bash
# Set up authentication
export GOOGLE_APPLICATION_CREDENTIALS=~/task-manager-dev-key.json

# Get your project ID
export PROJECT_ID=$(gcloud config get-value project)

# Get cluster credentials
gcloud container clusters get-credentials task-manager-cluster --zone=us-central1-a
```

## Container Registry Setup

### Step 1: Configure Docker

```bash
# Configure Docker to use Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev
```

### Step 2: Build and Push Images

```bash
# Build all images
docker-compose build

# Tag images for GCR
docker tag taskmanager_auth-service:latest us-central1-docker.pkg.dev/$PROJECT_ID/task-manager-repo/auth-service:latest
docker tag taskmanager_task-service:latest us-central1-docker.pkg.dev/$PROJECT_ID/task-manager-repo/task-service:latest
docker tag taskmanager_api-gateway:latest us-central1-docker.pkg.dev/$PROJECT_ID/task-manager-repo/api-gateway:latest

# Push images
docker push us-central1-docker.pkg.dev/$PROJECT_ID/task-manager-repo/auth-service:latest
docker push us-central1-docker.pkg.dev/$PROJECT_ID/task-manager-repo/task-service:latest
docker push us-central1-docker.pkg.dev/$PROJECT_ID/task-manager-repo/api-gateway:latest
```

## Database Setup

### Step 1: Initialize Database

```bash
# Connect to Cloud SQL instance
gcloud sql connect task-manager-db --user=postgres

# Run the initialization script
\i init.sql
\q
```

### Step 2: Update Connection Strings

```bash
# Get Cloud SQL connection name
gcloud sql instances describe task-manager-db --format="value(connectionName)"

# Update ConfigMap with actual connection details
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
```

## Kubernetes Deployment

### Step 1: Update Deployment Files

Replace `PROJECT_ID` in all deployment files:

```bash
# Update deployment files with your project ID
sed -i "s/PROJECT_ID/$PROJECT_ID/g" k8s/services/*/deployment.yaml
```

### Step 2: Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Apply secrets and config
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml

# Deploy services
kubectl apply -f k8s/services/auth-service/deployment.yaml
kubectl apply -f k8s/services/task-service/deployment.yaml
kubectl apply -f k8s/services/gateway/deployment.yaml

# Apply autoscaling
kubectl apply -f k8s/autoscaler.yaml

# Apply network policies
kubectl apply -f k8s/network-policy.yaml
```

### Step 3: Verify Deployment

```bash
# Check pod status
kubectl get pods -n task-manager

# Check services
kubectl get services -n task-manager

# Check ingress (if configured)
kubectl get ingress -n task-manager

# View logs
kubectl logs -f deployment/auth-service -n task-manager
```

## Frontend Deployment

### Step 1: Build Frontend for Production

```bash
cd frontend

# Update environment variables for production
echo "NEXT_PUBLIC_API_BASE_URL=https://your-api-domain.com" > .env.production

# Build the application
npm run build
```

### Step 2: Deploy to Google Cloud Run (Optional)

```bash
# Create Dockerfile for frontend
cat > Dockerfile << EOF
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT 3000
CMD ["node", "server.js"]
EOF

# Build and deploy to Cloud Run
gcloud run deploy task-manager-frontend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

## CI/CD Pipeline

### Step 1: Set up Cloud Build Triggers

```bash
# Connect your GitHub repository
gcloud alpha builds triggers create github \
  --repo-name=taskmanager \
  --repo-owner=YOUR_GITHUB_USERNAME \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml
```

### Step 2: Test the Pipeline

```bash
# Trigger a manual build
gcloud builds submit --config=cloudbuild.yaml .
```

## Monitoring and Logging

### Step 1: Set up Monitoring

```bash
# Create alerting policy
gcloud alpha monitoring policies create \
  --policy-from-file=monitoring/alerting-policy.yaml
```

### Step 2: View Logs

```bash
# View application logs
gcloud logging read "resource.type=k8s_container AND resource.labels.namespace_name=task-manager" \
  --limit=50 \
  --format="table(timestamp,severity,textPayload)"

# View specific service logs
kubectl logs -f deployment/auth-service -n task-manager
```

## Domain and SSL Setup

### Step 1: Reserve Static IP

```bash
# Reserve a global static IP
gcloud compute addresses create task-manager-ip --global
```

### Step 2: Configure DNS

Point your domain to the reserved IP address.

### Step 3: Update Ingress

Update `k8s/services/gateway/deployment.yaml` with your actual domain name.

## Environment Variables Summary

Here are the key environment variables you need to configure:

### Production Environment (.env.production)
```bash
NODE_ENV=production
DB_HOST=/cloudsql/PROJECT_ID:us-central1:task-manager-db
DB_NAME=taskmanager
DB_USER=taskuser
DB_PASSWORD=YOUR_SECURE_PASSWORD
JWT_SECRET=YOUR_JWT_SECRET
REDIS_URL=redis://REDIS_HOST:6379
GOOGLE_CLOUD_STORAGE_BUCKET=PROJECT_ID-task-files
CORS_ORIGIN=https://your-frontend-domain.com
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Pods Not Starting

```bash
# Check pod events
kubectl describe pod POD_NAME -n task-manager

# Check logs
kubectl logs POD_NAME -n task-manager
```

#### 2. Database Connection Issues

```bash
# Test Cloud SQL connection
gcloud sql connect task-manager-db --user=postgres

# Check if Cloud SQL Proxy is needed
kubectl run mysql-client --image=mysql:5.7 -i --rm --restart=Never -- \
  mysql -h CLOUD_SQL_IP -u taskuser -p
```

#### 3. Service Communication Issues

```bash
# Test service connectivity
kubectl exec -it POD_NAME -n task-manager -- curl http://SERVICE_NAME/health
```

#### 4. Image Pull Issues

```bash
# Check if images exist
gcloud container images list --repository=us-central1-docker.pkg.dev/PROJECT_ID/task-manager-repo

# Verify authentication
gcloud auth configure-docker us-central1-docker.pkg.dev
```

## Cost Optimization

### Recommended Settings for Production

1. **Use Preemptible Nodes** in GKE for cost savings
2. **Set Resource Limits** on all containers
3. **Enable Cluster Autoscaling**
4. **Use Committed Use Discounts** for steady workloads
5. **Monitor and Alert** on unexpected costs

### Cleanup Resources (Development)

```bash
# Delete GKE cluster
gcloud container clusters delete task-manager-cluster --zone=us-central1-a

# Delete Cloud SQL instance
gcloud sql instances delete task-manager-db

# Delete other resources
gcloud redis instances delete task-manager-cache --region=us-central1
gsutil rm -r gs://PROJECT_ID-task-files
```

## Security Best Practices

1. **Use least privilege** IAM roles
2. **Enable network policies** in Kubernetes
3. **Scan container images** for vulnerabilities
4. **Use secrets** for sensitive data
5. **Enable audit logging**
6. **Regular security updates**

## Next Steps

After successful deployment:

1. Set up monitoring dashboards
2. Configure backup strategies
3. Implement disaster recovery
4. Set up staging environments
5. Document operational procedures

## Support and Resources

- [Google Cloud Documentation](https://cloud.google.com/docs)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Next.js Documentation](https://nextjs.org/docs)

For issues, check the troubleshooting section or create an issue in your repository.
