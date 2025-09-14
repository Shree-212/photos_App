# 🚀 Task Manager - Infrastructure Backup & Restoration Guide

**Date Created**: September 15, 2025  
**Project**: Task Manager Microservices  
**GCP Project**: circular-hash-459513-q5  
**Status**: Successfully deployed and tested ✅  

## 📋 Overview

This document contains all the necessary information to rebuild the complete Task Manager infrastructure on Google Cloud Platform. The original deployment was successfully running with:

- **3 Microservices**: Auth, Task, and Media services
- **Frontend**: Next.js application
- **Database**: PostgreSQL on Cloud SQL
- **Storage**: Google Cloud Storage for media files
- **Orchestration**: Google Kubernetes Engine (GKE)
- **Messaging**: Pub/Sub for event-driven communication

## 🏗️ Infrastructure Components

### Core Services Deployed:
- **GKE Cluster**: `task-manager-cluster` (us-central1-a)
- **Cloud SQL**: PostgreSQL 13 (`task-manager-postgres`)
- **Cloud Storage**: Media bucket (`taskmanager-media-circular-hash-459513-q5`)
- **Pub/Sub**: Event messaging (`task-manager-events`)
- **VPC**: Custom networking (`task-manager-vpc`)
- **Static IPs**: Frontend and API load balancers

### Resource Specifications:
- **GKE Nodes**: e2-medium (2 vCPU, 4GB RAM)
- **Database**: db-f1-micro (shared core, 0.6GB RAM)
- **Storage**: Standard class with lifecycle policies
- **Network**: Private cluster with public endpoints

## 💰 Cost Analysis (When Running)

### Daily Estimated Costs:
- **GKE Cluster**: ~$1.44/day (e2-medium × 1 node)
- **Cloud SQL**: ~$0.32/day (db-f1-micro)
- **Storage**: ~$0.05/day (20GB + transfer)
- **Networking**: ~$0.10/day (static IPs + data transfer)
- **Total**: **~$1.91/day** or **~$57/month**

### Cost Optimization Options:
1. Use `e2-micro` nodes instead of `e2-medium`
2. Use regional persistent disks instead of SSD
3. Implement cluster autoscaling to scale to zero
4. Use preemptible nodes for non-critical workloads

## 🔧 Prerequisites for Restoration

### Required Tools:
```bash
# Google Cloud SDK
gcloud version

# Terraform
terraform version  # >= 1.0

# Kubernetes CLI
kubectl version

# Docker
docker version
```

### Required Accounts & Access:
- Google Cloud Platform account with billing enabled
- Project with sufficient quotas for:
  - Compute Engine instances
  - GKE clusters
  - Cloud SQL instances
  - Static IP addresses

### Required Files:
- Service account key file (`service-account-key.json`)
- Terraform configuration files
- Kubernetes manifest files
- Docker images (in container registries)

## 📁 File Structure

```
taskmanager/
├── backend/
│   ├── infrastructure/
│   │   └── terraform/         # Infrastructure as Code
│   ├── k8s/                   # Kubernetes manifests
│   ├── services/              # Microservices source code
│   │   ├── auth-service/
│   │   ├── task-service/
│   │   └── media-service/
│   └── migrations/            # Database migrations
├── frontend/                  # Next.js application
└── docs/                      # Documentation
```

## 🚀 Quick Restoration Steps

### 1. Setup GCP Project
```bash
# Set project ID
export PROJECT_ID="your-new-project-id"
gcloud config set project $PROJECT_ID

# Enable billing and required APIs
gcloud services enable compute.googleapis.com
gcloud services enable container.googleapis.com
gcloud services enable sqladmin.googleapis.com
# ... (see full list in terraform files)
```

### 2. Deploy Infrastructure
```bash
cd backend/infrastructure/terraform

# Initialize Terraform
terraform init

# Create terraform.tfvars
cat > terraform.tfvars << EOF
project_id = "your-new-project-id"
region     = "us-central1"
zone       = "us-central1-a"
app_name   = "taskmanager"
environment = "production"
storage_bucket_name = "taskmanager-media-your-project-id"
gke_num_nodes = 1
gke_machine_type = "e2-medium"
gke_disk_size_gb = 20
EOF

# Deploy infrastructure
terraform plan
terraform apply
```

### 3. Deploy Applications
```bash
# Get cluster credentials
gcloud container clusters get-credentials task-manager-cluster --zone=us-central1-a

# Apply Kubernetes manifests
kubectl apply -f ../k8s/namespace.yaml
kubectl apply -f ../k8s/secrets.yaml
kubectl apply -f ../k8s/configmap.yaml
kubectl apply -f ../k8s/postgresql.yaml
kubectl apply -f ../k8s/redis.yaml
kubectl apply -f ../k8s/backend-services.yaml
kubectl apply -f ../k8s/frontend.yaml
```

## 🔐 Security Considerations

### Secrets Management:
- Database passwords stored in Kubernetes secrets
- Service account keys for Cloud Storage access
- JWT secrets for authentication
- API keys for external services

### Network Security:
- Private GKE cluster with authorized networks
- Cloud SQL with VPC peering
- Network policies for pod-to-pod communication
- HTTPS termination at load balancer

## 🗄️ Database Schema

### Core Tables:
- `users`: User authentication and profiles
- `tasks`: Task management with status tracking
- `media_files`: File metadata and storage paths
- `task_media`: Many-to-many relationship

### Sample Migration:
```sql
-- See backend/migrations/ for complete schema
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🐳 Container Images

### Required Images:
```bash
# Backend services
gcr.io/${PROJECT_ID}/auth-service:latest
gcr.io/${PROJECT_ID}/task-service:latest
gcr.io/${PROJECT_ID}/media-service:latest

# Frontend
gcr.io/${PROJECT_ID}/frontend:latest

# Supporting services
postgres:13
redis:alpine
```

### Build Commands:
```bash
# Build and push all services
cd backend && ./deploy-gcp.sh

# Build frontend
cd frontend && ./deploy-k8s.sh
```

## 🔄 CI/CD Pipeline

### Cloud Build Configuration:
- Triggers on git push to main branch
- Builds Docker images
- Pushes to Google Container Registry
- Deploys to GKE cluster

### Manual Deployment:
```bash
# Backend services
cd backend
./deploy-gcp.sh

# Frontend
cd frontend
./deploy-frontend-only.sh
```

## 📊 Monitoring & Logging

### Available Monitoring:
- Google Cloud Monitoring for infrastructure metrics
- Application logs via Cloud Logging
- Custom metrics for business logic
- Health checks for all services

### Key Metrics to Monitor:
- Pod CPU/Memory usage
- Database connection pool
- Storage bucket usage
- API response times
- Error rates

## 🔧 Troubleshooting

### Common Issues:
1. **Pod not starting**: Check resource limits and image pull secrets
2. **Database connection**: Verify Cloud SQL proxy and credentials
3. **Storage access**: Check service account permissions
4. **Network issues**: Verify VPC and firewall rules

### Debug Commands:
```bash
# Check pod status
kubectl get pods -n task-manager

# View logs
kubectl logs -f deployment/task-service -n task-manager

# Describe resources
kubectl describe pod <pod-name> -n task-manager
```

## 📚 Additional Resources

### Documentation Files:
- `DEVELOPMENT_STATUS.md`: Current development status
- `GCP_DEPLOYMENT_GUIDE.md`: Detailed deployment instructions
- `STEP_BY_STEP_GUIDE.md`: Complete setup walkthrough
- `QUICK_START_GUIDE.md`: Fast deployment guide

### Configuration Examples:
- All Terraform files are documented with variables
- Kubernetes manifests include resource specifications
- Docker configurations with build optimization

## ⚠️ Important Notes

### Before Redeployment:
1. **Update project IDs** in all configuration files
2. **Generate new service account keys**
3. **Review and adjust resource quotas**
4. **Update DNS/domain configurations**
5. **Restore database data if needed**

### Cost Management:
1. **Monitor billing daily** during initial deployment
2. **Set up billing alerts** for cost control
3. **Use development/staging environments** for testing
4. **Implement cluster autoscaling** for production

---

**Last Updated**: September 15, 2025  
**Status**: Backup Complete ✅  
**Next Action**: Ready for future deployment when needed
