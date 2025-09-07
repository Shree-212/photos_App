# GCP Microservices Project Setup Guide

## Prerequisites

1. **Install Required Tools**
   ```bash
   # Install gcloud CLI (macOS)
   brew install --cask google-cloud-sdk
   
   # Install Docker Desktop
   brew install --cask docker
   
   # Install kubectl
   brew install kubectl
   
   # Install Terraform (optional for infrastructure as code)
   brew install terraform
   ```

2. **Verify Installations**
   ```bash
   gcloud version
   docker --version
   kubectl version --client
   terraform version
   ```

## Phase 1: GCP Account and Project Setup

### Step 1: Initialize GCP Account
```bash
# Login to your GCP account
gcloud auth login

# List available projects
gcloud projects list

# Create a new project (replace PROJECT_ID with your unique project ID)
export PROJECT_ID="task-manager-$(date +%s)"
gcloud projects create $PROJECT_ID --name="Task Manager Microservices"

# Set the project as default
gcloud config set project $PROJECT_ID

# Enable billing (you'll need to link a billing account)
# Go to: https://console.cloud.google.com/billing/linkedaccount
```

### Step 2: Enable Required APIs
```bash
# Enable all required Google Cloud APIs
gcloud services enable container.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable monitoring.googleapis.com
gcloud services enable logging.googleapis.com
gcloud services enable cloudtrace.googleapis.com
gcloud services enable redis.googleapis.com
gcloud services enable pubsub.googleapis.com
```

### Step 3: Set Up Authentication and Permissions
```bash
# Create a service account for development
gcloud iam service-accounts create task-manager-dev \
    --display-name="Task Manager Development Service Account"

# Grant necessary roles to the service account
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:task-manager-dev@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/container.developer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:task-manager-dev@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:task-manager-dev@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/storage.admin"

# Create and download service account key
gcloud iam service-accounts keys create ~/task-manager-dev-key.json \
    --iam-account=task-manager-dev@$PROJECT_ID.iam.gserviceaccount.com

# Set the environment variable for authentication
export GOOGLE_APPLICATION_CREDENTIALS=~/task-manager-dev-key.json
```

## Phase 2: Infrastructure Setup

### Step 1: Create Artifact Registry Repository
```bash
# Create repository for Docker images
gcloud artifacts repositories create task-manager-repo \
    --repository-format=docker \
    --location=us-central1 \
    --description="Task Manager Microservices Repository"

# Configure Docker to use the repository
gcloud auth configure-docker us-central1-docker.pkg.dev
```

### Step 2: Set Up Cloud SQL Instance
```bash
# Create Cloud SQL instance
gcloud sql instances create task-manager-db \
    --database-version=POSTGRES_13 \
    --tier=db-f1-micro \
    --region=us-central1 \
    --storage-type=SSD \
    --storage-size=10GB \
    --backup-start-time=02:00

# Set root password
gcloud sql users set-password postgres \
    --instance=task-manager-db \
    --password=your-secure-password

# Create application database
gcloud sql databases create taskmanager \
    --instance=task-manager-db

# Create application user
gcloud sql users create taskuser \
    --instance=task-manager-db \
    --password=secure-app-password
```

### Step 3: Create GKE Cluster
```bash
# Create GKE cluster
gcloud container clusters create task-manager-cluster \
    --num-nodes=2 \
    --machine-type=e2-medium \
    --zone=us-central1-a \
    --enable-autoscaling \
    --min-nodes=1 \
    --max-nodes=5 \
    --enable-autorepair \
    --enable-autoupgrade

# Get cluster credentials
gcloud container clusters get-credentials task-manager-cluster \
    --zone=us-central1-a
```

### Step 4: Set Up Cloud Storage
```bash
# Create storage bucket for file uploads
gsutil mb gs://$PROJECT_ID-task-files

# Set bucket permissions (make it publicly readable)
gsutil iam ch allUsers:objectViewer gs://$PROJECT_ID-task-files
```

### Step 5: Set Up Redis (Memorystore)
```bash
# Create Redis instance
gcloud redis instances create task-manager-cache \
    --size=1 \
    --region=us-central1 \
    --redis-version=redis_6_x \
    --tier=basic
```

## Phase 3: Local Development Setup

### Step 1: Environment Variables
Create a `.env.local` file in your backend directory:

```bash
# Database Configuration
DB_HOST=localhost
DB_NAME=taskmanager
DB_USER=taskuser
DB_PASSWORD=taskpassword

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-key

# Redis Configuration
REDIS_URL=redis://localhost:6379

# GCP Configuration
GOOGLE_PROJECT_ID=$PROJECT_ID
GOOGLE_CLOUD_STORAGE_BUCKET=$PROJECT_ID-task-files

# Service URLs (for local development)
AUTH_SERVICE_URL=http://localhost:3001
TASK_SERVICE_URL=http://localhost:3002
```

### Step 2: Production Environment Variables
For production deployment, you'll need to update these with actual GCP service endpoints:

```bash
# Get Cloud SQL connection name
gcloud sql instances describe task-manager-db --format="value(connectionName)"

# Get Redis host
gcloud redis instances describe task-manager-cache --region=us-central1 --format="value(host)"
```

## Phase 4: CI/CD Setup with Cloud Build

### Step 1: Create Cloud Build Configuration
This will be created in the next steps as `cloudbuild.yaml`

### Step 2: Set Up Build Triggers
```bash
# Connect your GitHub repository (you'll need to do this through the console)
# Go to: https://console.cloud.google.com/cloud-build/triggers

# Or create trigger via CLI (after connecting repo)
gcloud builds triggers create github \
    --repo-name=taskmanager \
    --repo-owner=YOUR_GITHUB_USERNAME \
    --branch-pattern="^main$" \
    --build-config=cloudbuild.yaml
```

## Phase 5: Monitoring and Logging Setup

### Step 1: Enable Monitoring
```bash
# Create notification channel (replace with your email)
gcloud alpha monitoring channels create \
    --display-name="Task Manager Alerts" \
    --type=email \
    --channel-labels=email_address=your-email@example.com
```

### Step 2: Set Up Log-based Metrics
```bash
# Create log-based metric for error tracking
gcloud logging metrics create task_manager_errors \
    --description="Count of error logs in task manager services" \
    --log-filter='resource.type="k8s_container" AND severity="ERROR"'
```

## Useful Commands

### Development Commands
```bash
# View logs from GKE
kubectl logs -f deployment/auth-service -n task-manager

# Port forward for local testing
kubectl port-forward service/auth-service 3001:80 -n task-manager

# Connect to Cloud SQL proxy
cloud_sql_proxy -instances=$PROJECT_ID:us-central1:task-manager-db=tcp:5432
```

### Debugging Commands
```bash
# Check cluster status
kubectl get nodes
kubectl get pods -n task-manager

# Check service endpoints
kubectl get services -n task-manager

# View pod logs
kubectl describe pod POD_NAME -n task-manager
```

### Cleanup Commands (for cost management)
```bash
# Delete GKE cluster
gcloud container clusters delete task-manager-cluster --zone=us-central1-a

# Delete Cloud SQL instance
gcloud sql instances delete task-manager-db

# Delete Redis instance
gcloud redis instances delete task-manager-cache --region=us-central1

# Delete storage bucket
gsutil rm -r gs://$PROJECT_ID-task-files
```

## Cost Optimization Tips

1. **Use Preemptible Nodes**: Add `--preemptible` flag when creating GKE cluster
2. **Set Resource Limits**: Define CPU and memory limits in Kubernetes deployments
3. **Enable Cluster Autoscaling**: Automatically scale based on demand
4. **Use Committed Use Discounts**: For production workloads
5. **Monitor Costs**: Set up billing alerts and budgets

## Security Best Practices

1. **Use Service Accounts**: Never use personal credentials in production
2. **Enable Binary Authorization**: Ensure only verified images are deployed
3. **Network Policies**: Restrict pod-to-pod communication
4. **Secrets Management**: Use Kubernetes secrets and Google Secret Manager
5. **Regular Updates**: Keep clusters and images updated

This guide provides a complete setup for your GCP microservices learning project. Follow these steps in order, and you'll have a production-ready infrastructure for your task manager application.
