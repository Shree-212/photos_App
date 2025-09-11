#!/bin/bash

# Complete Photo Albums GCP Deployment Script
# This script handles the full deployment including database migration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[DEPLOY]${NC} $1"
}

# Check if we have a GCP project ID
check_project_id() {
    if [ -z "$PROJECT_ID" ]; then
        print_error "PROJECT_ID environment variable is not set"
        echo "Please set your PROJECT_ID:"
        echo "export PROJECT_ID=your-gcp-project-id"
        exit 1
    fi
    print_status "Using PROJECT_ID: $PROJECT_ID"
}

# Run database migration first
run_database_migration() {
    print_header "Running database migration to convert tasks to albums..."
    
    # Check if the migration file exists
    if [ ! -f "migrations/20250912000000_convert_tasks_to_albums.sql" ]; then
        print_error "Migration file not found"
        exit 1
    fi
    
    # Set database connection info
    export DB_HOST=${DB_HOST:-"localhost"}
    export DB_NAME=${DB_NAME:-"taskmanager"}
    export DB_USER=${DB_USER:-"taskuser"}
    export DB_PASSWORD=${DB_PASSWORD:-"taskpassword"}
    export DB_PORT=${DB_PORT:-5432}
    
    print_status "Running migration script..."
    cd scripts
    node migrate.js migrate
    cd ..
    
    print_status "Database migration completed successfully!"
}

# Build and push all images to Container Registry
build_and_push_all() {
    print_header "Building and pushing all services..."
    
    # Configure Docker authentication
    gcloud auth configure-docker --quiet
    
    # Build backend services
    print_status "Building backend services..."
    gcloud builds submit . --config=cloudbuild.yaml --project=$PROJECT_ID
    
    # Build frontend
    print_status "Building frontend..."
    cd ../frontend
    gcloud builds submit . --config=cloudbuild.yaml --project=$PROJECT_ID
    cd ../backend
    
    print_status "All images built and pushed successfully!"
}

# Update Kubernetes manifests with project ID
update_manifests() {
    print_header "Updating Kubernetes manifests..."
    
    # Update PROJECT_ID in all deployment files
    find k8s/ -name "*.yaml" -type f -exec sed -i "s/PROJECT_ID/$PROJECT_ID/g" {} \;
    
    print_status "Kubernetes manifests updated with PROJECT_ID: $PROJECT_ID"
}

# Deploy to GKE
deploy_to_gke() {
    print_header "Deploying to Google Kubernetes Engine..."
    
    # Get GKE credentials
    CLUSTER_NAME="photo-albums-cluster"
    REGION="us-central1-a"
    
    print_status "Getting GKE cluster credentials..."
    gcloud container clusters get-credentials $CLUSTER_NAME --zone $REGION --project $PROJECT_ID
    
    # Create namespace
    print_status "Creating namespace..."
    kubectl create namespace photo-albums --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply all Kubernetes resources
    print_status "Applying Kubernetes resources..."
    
    # Apply in order
    kubectl apply -f k8s/namespace.yaml
    kubectl apply -f k8s/configmap.yaml
    kubectl apply -f k8s/secrets.yaml
    
    # Deploy infrastructure services first
    kubectl apply -f k8s/postgresql.yaml
    kubectl apply -f k8s/redis.yaml
    
    # Wait for infrastructure to be ready
    print_status "Waiting for infrastructure services..."
    kubectl wait --for=condition=ready pod -l app=postgresql --namespace=photo-albums --timeout=300s || true
    kubectl wait --for=condition=ready pod -l app=redis --namespace=photo-albums --timeout=300s || true
    
    # Deploy application services
    kubectl apply -f k8s/services/auth-service/deployment.yaml
    kubectl apply -f k8s/services/album-service/deployment.yaml
    kubectl apply -f k8s/services/media-service/deployment.yaml
    kubectl apply -f k8s/services/notification-service/deployment.yaml
    kubectl apply -f k8s/services/gateway/deployment.yaml
    
    # Deploy frontend
    kubectl apply -f k8s/frontend.yaml
    
    # Apply additional configurations
    kubectl apply -f k8s/autoscaler.yaml || true
    kubectl apply -f k8s/network-policy.yaml || true
    
    print_status "Kubernetes deployment completed!"
}

# Check deployment status
check_deployment() {
    print_header "Checking deployment status..."
    
    # Wait for deployments to be ready
    print_status "Waiting for deployments to be ready..."
    kubectl wait --for=condition=available deployment --all --namespace=photo-albums --timeout=600s || true
    
    # Get deployment info
    echo
    print_status "Services:"
    kubectl get services --namespace=photo-albums
    
    echo
    print_status "Pods:"
    kubectl get pods --namespace=photo-albums
    
    echo
    print_status "Deployments:"
    kubectl get deployments --namespace=photo-albums
    
    print_status "Deployment status check completed!"
}

# Main function
main() {
    print_header "Photo Albums - Complete GCP Deployment"
    print_status "Starting complete deployment process..."
    
    # Check prerequisites
    check_project_id
    
    # Step 1: Run database migration
    run_database_migration
    
    # Step 2: Build and push images
    build_and_push_all
    
    # Step 3: Update manifests
    update_manifests
    
    # Step 4: Deploy to GKE
    deploy_to_gke
    
    # Step 5: Check deployment
    check_deployment
    
    echo
    print_status "🎉 Photo Albums deployment completed successfully!"
    print_status "Your application should be available in a few minutes."
    print_warning "Don't forget to configure your domain DNS if using a custom domain."
}

# Handle interrupts gracefully
trap 'print_error "Deployment interrupted"; exit 1' INT TERM

# Run main function
main "$@"
