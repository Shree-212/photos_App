# 🚀 Task Manager - Complete Deployment Guide

## 📋 Prerequisites

### Required Software
```bash
# Install Google Cloud SDK
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init

# Install Terraform
brew install terraform
# OR download from: https://developer.hashicorp.com/terraform/downloads

# Install kubectl
gcloud components install kubectl
# OR: brew install kubectl

# Install Docker
# Download from: https://docs.docker.com/get-docker/

# Verify installations
gcloud version
terraform version
kubectl version --client
docker version
```

### GCP Account Setup
1. Create a Google Cloud Platform account
2. Create a new project or use existing one
3. Enable billing for the project
4. Create a service account with necessary permissions

### Service Account Setup
```bash
# Create service account
gcloud iam service-accounts create terraform-sa \
    --display-name="Terraform Service Account"

# Grant necessary roles
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:terraform-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/editor"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:terraform-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/container.admin"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:terraform-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/compute.admin"

# Create and download key
gcloud iam service-accounts keys create service-account-key.json \
    --iam-account=terraform-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

## 🏗️ Step-by-Step Deployment

### Step 1: Clone and Prepare Repository
```bash
# Clone the repository
git clone https://github.com/your-username/taskmanager.git
cd taskmanager

# Copy template files
cp backend/infrastructure/terraform/terraform.tfvars.template \
   backend/infrastructure/terraform/terraform.tfvars

# Copy your service account key
cp /path/to/service-account-key.json \
   backend/infrastructure/terraform/service-account-key.json
```

### Step 2: Configure Variables
Edit `backend/infrastructure/terraform/terraform.tfvars`:
```hcl
# GCP Project Configuration
project_id = "your-actual-project-id"
region     = "us-central1"
zone       = "us-central1-a"

# Application Configuration
app_name    = "taskmanager"
environment = "prod"

# Database Configuration
db_name     = "taskmanager"
db_user     = "taskuser"
db_password = "your-very-strong-password-123!"

# Storage Configuration (must be globally unique)
storage_bucket_name = "taskmanager-media-your-project-id-2025"

# Cluster Configuration
gke_num_nodes    = 1
gke_machine_type = "e2-medium"
gke_disk_size_gb = 20

# Safety Configuration
enable_deletion_protection = false  # Set to true for production
enable_backup             = true
```

### Step 3: Deploy Infrastructure
```bash
cd backend/infrastructure/terraform

# Initialize Terraform
terraform init

# Validate configuration
terraform validate

# Plan deployment
terraform plan

# Apply infrastructure (this takes 10-15 minutes)
terraform apply

# Note the outputs (save these values)
terraform output
```

### Step 4: Configure kubectl
```bash
# Get cluster credentials
gcloud container clusters get-credentials \
    taskmanager-prod-cluster \
    --zone=us-central1-a \
    --project=YOUR_PROJECT_ID

# Verify connection
kubectl cluster-info
kubectl get nodes
```

### Step 5: Build and Push Container Images
```bash
# Set up Docker authentication
gcloud auth configure-docker

# Build and push all images
cd backend
./deploy-gcp.sh

cd ../frontend  
./deploy-k8s.sh

# Verify images are pushed
gcloud container images list --repository=gcr.io/YOUR_PROJECT_ID
```

### Step 6: Prepare Kubernetes Secrets
```bash
cd backend/k8s

# Create base64 encoded secrets
echo -n "your-very-strong-password-123!" | base64
echo -n "your-jwt-secret-key" | base64
echo -n "postgresql://taskuser:your-very-strong-password-123!@DB_IP:5432/taskmanager" | base64

# Edit secrets.yaml with these values
# Update configmap.yaml with your bucket name and other settings
```

### Step 7: Deploy Applications
```bash
# Deploy in order
kubectl apply -f namespace.yaml
kubectl apply -f secrets.yaml
kubectl apply -f configmap.yaml
kubectl apply -f redis.yaml
kubectl apply -f backend-services.yaml
kubectl apply -f frontend.yaml

# Wait for deployments
kubectl get pods -n task-manager -w

# Check all pods are running
kubectl get pods -n task-manager
kubectl get services -n task-manager
```

### Step 8: Configure Database
```bash
# Port forward to database (in separate terminal)
kubectl port-forward service/postgres 5432:5432 -n task-manager

# Run migrations
cd backend
npm run migrate

# Or connect and create tables manually
psql -h localhost -U taskuser -d taskmanager
```

### Step 9: Test Application
```bash
# Get frontend URL
kubectl get service frontend -n task-manager

# Test API endpoints
curl http://FRONTEND_IP/api/health
curl http://FRONTEND_IP/api/auth/health
curl http://FRONTEND_IP/api/tasks/health
curl http://FRONTEND_IP/api/media/health

# Access frontend
open http://FRONTEND_IP
```

## 🔧 Configuration Options

### Development Environment
For development/testing, use smaller resources:
```hcl
gke_machine_type = "e2-micro"      # ~$0.60/day
gke_num_nodes    = 1
enable_deletion_protection = false
```

### Production Environment  
For production, use larger resources:
```hcl
gke_machine_type = "e2-standard-2"  # ~$2.88/day
gke_num_nodes    = 2
enable_deletion_protection = true
```

### Cost Optimization
- Use preemptible nodes for non-critical workloads
- Enable cluster autoscaling to scale to zero
- Use regional persistent disks instead of SSD
- Implement proper monitoring and alerting

## 🛠️ Troubleshooting

### Common Issues

#### 1. Terraform Apply Fails
```bash
# Check API enablement
gcloud services list --enabled

# Check quotas
gcloud compute regions describe us-central1

# Check permissions
gcloud auth list
gcloud config list
```

#### 2. Image Pull Errors
```bash
# Check image exists
gcloud container images list --repository=gcr.io/YOUR_PROJECT_ID

# Check authentication
gcloud auth configure-docker

# Check pod details
kubectl describe pod POD_NAME -n task-manager
```

#### 3. Database Connection Issues
```bash
# Check Cloud SQL status
gcloud sql instances describe taskmanager-prod-postgres

# Test connection
gcloud sql connect taskmanager-prod-postgres --user=taskuser

# Check secret values
kubectl get secret db-secret -o yaml -n task-manager
```

#### 4. Service Not Accessible
```bash
# Check service status
kubectl get services -n task-manager

# Check ingress/load balancer
kubectl describe service frontend -n task-manager

# Check logs
kubectl logs -f deployment/frontend -n task-manager
```

### Debug Commands
```bash
# Check all resources
kubectl get all -n task-manager

# Check events
kubectl get events -n task-manager --sort-by='.lastTimestamp'

# Check resource usage
kubectl top pods -n task-manager
kubectl top nodes

# Port forward for debugging
kubectl port-forward service/frontend 3000:3000 -n task-manager
kubectl port-forward service/task-service 8080:8080 -n task-manager
```

## 🔄 Maintenance

### Regular Tasks
- Monitor billing and resource usage
- Update container images regularly
- Rotate secrets and passwords
- Review and update resource quotas
- Monitor application logs and metrics

### Scaling
```bash
# Scale deployment
kubectl scale deployment task-service --replicas=3 -n task-manager

# Enable autoscaling
kubectl apply -f autoscaler.yaml
```

### Updates
```bash
# Rolling update
kubectl set image deployment/task-service \
    task-service=gcr.io/PROJECT/task-service:v2 \
    -n task-manager

# Check rollout
kubectl rollout status deployment/task-service -n task-manager

# Rollback if needed
kubectl rollout undo deployment/task-service -n task-manager
```

## 🗑️ Cleanup

### Complete Cleanup
```bash
# Delete Kubernetes resources
kubectl delete namespace task-manager

# Delete infrastructure
cd backend/infrastructure/terraform
terraform destroy

# Delete container images
gcloud container images delete gcr.io/PROJECT/auth-service --force-delete-tags
gcloud container images delete gcr.io/PROJECT/task-service --force-delete-tags
gcloud container images delete gcr.io/PROJECT/media-service --force-delete-tags
gcloud container images delete gcr.io/PROJECT/frontend --force-delete-tags
```

## 📞 Support

### Resources
- Google Cloud Documentation: https://cloud.google.com/docs
- Kubernetes Documentation: https://kubernetes.io/docs
- Terraform Documentation: https://terraform.io/docs

### Monitoring
- Google Cloud Console: https://console.cloud.google.com
- Kubernetes Dashboard: Deploy and access via kubectl proxy
- Application logs: Available in Cloud Logging

---

**Estimated Total Time**: 45-60 minutes for complete deployment  
**Estimated Monthly Cost**: $57 (with e2-medium nodes)  
**Minimum Cost**: $18/month (with e2-micro nodes)
