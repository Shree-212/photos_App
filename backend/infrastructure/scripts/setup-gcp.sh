#!/bin/bash

# GCP Setup Script for Task Manager Microservices
# Run this script to set up your GCP environment

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    command -v gcloud >/dev/null 2>&1 || { print_error "gcloud CLI is required but not installed. Please install it first."; exit 1; }
    command -v docker >/dev/null 2>&1 || { print_error "Docker is required but not installed. Please install it first."; exit 1; }
    command -v kubectl >/dev/null 2>&1 || { print_error "kubectl is required but not installed. Please install it first."; exit 1; }
    
    print_status "All prerequisites are installed!"
}

# Get project configuration
get_project_config() {
    print_status "Setting up project configuration..."
    
    # Use the existing project ID
    if [ -z "$PROJECT_ID" ]; then
        PROJECT_ID="circular-hash-459513-q5"
        print_status "Using existing project ID: $PROJECT_ID"
    fi
    
    # Set default region and zone
    REGION=${REGION:-"us-central1"}
    ZONE=${ZONE:-"us-central1-a"}
    
    print_status "Project ID: $PROJECT_ID"
    print_status "Region: $REGION"
    print_status "Zone: $ZONE"
}

# Create GCP project
create_project() {
    print_status "Creating GCP project..."
    
    gcloud projects create $PROJECT_ID --name="Task Manager Microservices" || {
        print_warning "Project creation failed. It might already exist."
    }
    
    gcloud config set project $PROJECT_ID
    print_status "Set project as default: $PROJECT_ID"
}

# Enable required APIs
enable_apis() {
    print_status "Enabling required APIs..."
    
    apis=(
        "container.googleapis.com"
        "sqladmin.googleapis.com"
        "storage.googleapis.com"
        "cloudbuild.googleapis.com"
        "artifactregistry.googleapis.com"
        "monitoring.googleapis.com"
        "logging.googleapis.com"
        "cloudtrace.googleapis.com"
        "redis.googleapis.com"
        "pubsub.googleapis.com"
    )
    
    for api in "${apis[@]}"; do
        print_status "Enabling $api..."
        gcloud services enable $api
    done
    
    print_status "All APIs enabled successfully!"
}

# Set up service account
setup_service_account() {
    print_status "Setting up service account..."
    
    # Create service account
    gcloud iam service-accounts create task-manager-dev \
        --display-name="Task Manager Development Service Account" || {
        print_warning "Service account might already exist."
    }
    
    # Grant roles
    roles=(
        "roles/container.developer"
        "roles/cloudsql.client"
        "roles/storage.admin"
        "roles/artifactregistry.writer"
        "roles/monitoring.metricWriter"
        "roles/logging.logWriter"
    )
    
    for role in "${roles[@]}"; do
        print_status "Granting role: $role"
        gcloud projects add-iam-policy-binding $PROJECT_ID \
            --member="serviceAccount:task-manager-dev@$PROJECT_ID.iam.gserviceaccount.com" \
            --role="$role"
    done
    
    # Create and download key
    print_status "Creating service account key..."
    gcloud iam service-accounts keys create ~/task-manager-dev-key.json \
        --iam-account=task-manager-dev@$PROJECT_ID.iam.gserviceaccount.com
    
    print_status "Service account setup complete!"
    print_warning "Service account key saved to: ~/task-manager-dev-key.json"
    print_warning "Set GOOGLE_APPLICATION_CREDENTIALS=~/task-manager-dev-key.json in your environment"
}

# Create Artifact Registry
setup_artifact_registry() {
    print_status "Setting up Artifact Registry..."
    
    gcloud artifacts repositories create task-manager-repo \
        --repository-format=docker \
        --location=$REGION \
        --description="Task Manager Microservices Repository" || {
        print_warning "Repository might already exist."
    }
    
    # Configure Docker
    gcloud auth configure-docker ${REGION}-docker.pkg.dev
    
    print_status "Artifact Registry setup complete!"
}

# Create Cloud SQL instance
setup_cloud_sql() {
    print_status "Setting up Cloud SQL instance..."
    
    # Generate secure passwords
    DB_PASSWORD=${DB_PASSWORD:-$(openssl rand -base64 32)}
    APP_PASSWORD=${APP_PASSWORD:-$(openssl rand -base64 32)}
    
    print_status "Creating Cloud SQL instance (this may take several minutes)..."
    gcloud sql instances create task-manager-db \
        --database-version=POSTGRES_13 \
        --tier=db-f1-micro \
        --region=$REGION \
        --storage-type=SSD \
        --storage-size=10GB \
        --backup-start-time=02:00 || {
        print_warning "Cloud SQL instance might already exist."
    }
    
    # Set passwords
    print_status "Setting database passwords..."
    gcloud sql users set-password postgres \
        --instance=task-manager-db \
        --password=$DB_PASSWORD
    
    # Create database and user
    gcloud sql databases create taskmanager \
        --instance=task-manager-db || {
        print_warning "Database might already exist."
    }
    
    gcloud sql users create taskuser \
        --instance=task-manager-db \
        --password=$APP_PASSWORD || {
        print_warning "Database user might already exist."
    }
    
    print_status "Cloud SQL setup complete!"
    print_warning "Database passwords:"
    print_warning "  Postgres: $DB_PASSWORD"
    print_warning "  App User: $APP_PASSWORD"
    print_warning "Save these passwords securely!"
}

# Create GKE cluster
setup_gke_cluster() {
    print_status "Setting up GKE cluster (this may take several minutes)..."
    
    gcloud container clusters create task-manager-cluster \
        --num-nodes=2 \
        --machine-type=e2-medium \
        --zone=$ZONE \
        --enable-autoscaling \
        --min-nodes=1 \
        --max-nodes=5 \
        --enable-autorepair \
        --enable-autoupgrade || {
        print_warning "GKE cluster might already exist."
    }
    
    # Get credentials
    gcloud container clusters get-credentials task-manager-cluster --zone=$ZONE
    
    print_status "GKE cluster setup complete!"
}

# Set up Cloud Storage
setup_cloud_storage() {
    print_status "Setting up Cloud Storage..."
    
    gsutil mb gs://$PROJECT_ID-task-files || {
        print_warning "Storage bucket might already exist."
    }
    
    # Set bucket permissions
    gsutil iam ch allUsers:objectViewer gs://$PROJECT_ID-task-files
    
    print_status "Cloud Storage setup complete!"
}

# Set up Redis
setup_redis() {
    print_status "Setting up Redis (Memorystore)..."
    
    gcloud redis instances create task-manager-cache \
        --size=1 \
        --region=$REGION \
        --redis-version=redis_6_x \
        --tier=basic || {
        print_warning "Redis instance might already exist."
    }
    
    print_status "Redis setup complete!"
}

# Generate environment file
generate_env_file() {
    print_status "Generating environment configuration..."
    
    # Get service endpoints
    SQL_CONNECTION=$(gcloud sql instances describe task-manager-db --format="value(connectionName)")
    REDIS_HOST=$(gcloud redis instances describe task-manager-cache --region=$REGION --format="value(host)" 2>/dev/null || echo "localhost")
    
    cat > .env.production << EOF
# GCP Configuration
GOOGLE_PROJECT_ID=$PROJECT_ID
GOOGLE_CLOUD_STORAGE_BUCKET=$PROJECT_ID-task-files

# Database Configuration (Cloud SQL)
DB_CONNECTION_NAME=$SQL_CONNECTION
DB_HOST=/cloudsql/$SQL_CONNECTION
DB_NAME=taskmanager
DB_USER=taskuser
DB_PASSWORD=$APP_PASSWORD

# Redis Configuration
REDIS_HOST=$REDIS_HOST
REDIS_PORT=6379
REDIS_URL=redis://$REDIS_HOST:6379

# JWT Configuration
JWT_SECRET=$(openssl rand -base64 64)

# Docker Registry
DOCKER_REGISTRY=${REGION}-docker.pkg.dev/$PROJECT_ID/task-manager-repo
EOF
    
    print_status "Environment file created: .env.production"
    print_warning "Review and update the .env.production file as needed"
}

# Main execution
main() {
    print_status "Starting GCP setup for Task Manager Microservices..."
    
    check_prerequisites
    get_project_config
    
    print_warning "This script will create GCP resources that may incur costs."
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Setup cancelled."
        exit 0
    fi
    
    create_project
    enable_apis
    setup_service_account
    setup_artifact_registry
    setup_cloud_sql
    setup_gke_cluster
    setup_cloud_storage
    setup_redis
    generate_env_file
    
    print_status "GCP setup complete!"
    print_status "Next steps:"
    print_status "1. Review the .env.production file"
    print_status "2. Set GOOGLE_APPLICATION_CREDENTIALS=~/task-manager-dev-key.json"
    print_status "3. Build and deploy your microservices"
    print_warning "Don't forget to save your database passwords securely!"
}

# Run main function
main "$@"
