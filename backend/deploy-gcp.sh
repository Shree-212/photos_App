#!/bin/bash

# GCP Deployment Script for Task Manager Microservices
# This script deploys the complete Task Manager application to Google Cloud Platform

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

# Check prerequisites
check_prerequisites() {
    print_header "Checking prerequisites..."
    
    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed. Please install it first."
        exit 1
    fi
    
    # Check if terraform is installed
    if ! command -v terraform &> /dev/null; then
        print_error "terraform is not installed. Please install it first."
        exit 1
    fi
    
    # Check if docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "docker is not installed. Please install it first."
        exit 1
    fi
    
    print_status "All prerequisites are installed."
}

# Get configuration
get_configuration() {
    print_header "Configuration Setup"
    
    # Project ID
    if [ -z "$PROJECT_ID" ]; then
        read -p "Enter your GCP Project ID: " PROJECT_ID
    fi
    
    # Region
    if [ -z "$REGION" ]; then
        read -p "Enter GCP Region (default: us-central1): " REGION
        REGION=${REGION:-us-central1}
    fi
    
    # Zone
    if [ -z "$ZONE" ]; then
        read -p "Enter GCP Zone (default: us-central1-a): " ZONE
        ZONE=${ZONE:-us-central1-a}
    fi
    
    # Cluster name
    CLUSTER_NAME="task-manager-cluster"
    
    # Database password
    if [ -z "$DB_PASSWORD" ]; then
        read -s -p "Enter database password: " DB_PASSWORD
        echo
    fi
    
    # Domain (optional)
    if [ -z "$DOMAIN" ]; then
        read -p "Enter your domain (optional, press enter to skip): " DOMAIN
    fi
    
    print_status "Configuration completed."
    print_status "Project ID: $PROJECT_ID"
    print_status "Region: $REGION"
    print_status "Zone: $ZONE"
    print_status "Cluster: $CLUSTER_NAME"
    if [ -n "$DOMAIN" ]; then
        print_status "Domain: $DOMAIN"
    fi
}

# Setup GCP project
setup_gcp_project() {
    print_header "Setting up GCP project..."
    
    # Set active project
    gcloud config set project $PROJECT_ID
    
    # Enable required APIs
    print_status "Enabling required APIs..."
    gcloud services enable compute.googleapis.com \
        container.googleapis.com \
        cloudbuild.googleapis.com \
        cloudresourcemanager.googleapis.com \
        iam.googleapis.com \
        pubsub.googleapis.com \
        storage-api.googleapis.com \
        storage-component.googleapis.com \
        sql-component.googleapis.com \
        sqladmin.googleapis.com \
        redis.googleapis.com \
        monitoring.googleapis.com \
        logging.googleapis.com \
        cloudtrace.googleapis.com \
        clouderrorreporting.googleapis.com \
        secretmanager.googleapis.com
    
    print_status "GCP project setup completed."
}

# Deploy infrastructure with Terraform
deploy_infrastructure() {
    print_header "Deploying infrastructure with Terraform..."
    
    cd infrastructure/terraform
    
    # Initialize Terraform
    print_status "Initializing Terraform..."
    terraform init
    
    # Create terraform.tfvars
    cat > terraform.tfvars <<EOF
project_id = "$PROJECT_ID"
region = "$REGION"
zone = "$ZONE"
environment = "prod"
db_password = "$DB_PASSWORD"
EOF
    
    # Plan deployment
    print_status "Planning Terraform deployment..."
    terraform plan
    
    # Apply deployment
    print_status "Applying Terraform deployment..."
    terraform apply -auto-approve
    
    # Get outputs
    CLUSTER_NAME=$(terraform output -raw cluster_name)
    CLUSTER_LOCATION=$(terraform output -raw cluster_location)
    
    cd ../../
    
    print_status "Infrastructure deployment completed."
}

# Get GKE credentials
get_gke_credentials() {
    print_header "Getting GKE cluster credentials..."
    
    gcloud container clusters get-credentials $CLUSTER_NAME \
        --zone $ZONE \
        --project $PROJECT_ID
    
    print_status "GKE credentials configured."
}

# Create Kubernetes service account
create_k8s_service_account() {
    print_header "Creating Kubernetes service account..."
    
    # Create namespace
    kubectl create namespace task-manager --dry-run=client -o yaml | kubectl apply -f -
    
    # Create Kubernetes service account
    kubectl create serviceaccount task-manager-ksa \
        --namespace task-manager \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Annotate service account for Workload Identity
    kubectl annotate serviceaccount task-manager-ksa \
        --namespace task-manager \
        iam.gke.io/gcp-service-account=task-manager-app@$PROJECT_ID.iam.gserviceaccount.com \
        --overwrite
    
    print_status "Kubernetes service account created."
}

# Build and push container images
build_and_push_images() {
    print_header "Building and pushing container images..."
    
    # Configure Docker to use gcloud as a credential helper
    gcloud auth configure-docker
    
    # Build and push images using Cloud Build
    print_status "Submitting build to Cloud Build..."
    gcloud builds submit . --config=cloudbuild.yaml \
        --substitutions=_GKE_CLUSTER=$CLUSTER_NAME,_GKE_LOCATION=$ZONE
    
    print_status "Container images built and pushed."
}

# Update Kubernetes manifests
update_k8s_manifests() {
    print_header "Updating Kubernetes manifests..."
    
    # Update PROJECT_ID in deployment files
    find k8s/ -name "*.yaml" -type f -exec sed -i "s/PROJECT_ID/$PROJECT_ID/g" {} \;
    
    # Update domain if provided
    if [ -n "$DOMAIN" ]; then
        find k8s/ -name "*.yaml" -type f -exec sed -i "s/your-domain.com/$DOMAIN/g" {} \;
        find k8s/ -name "*.yaml" -type f -exec sed -i "s/api.your-domain.com/api.$DOMAIN/g" {} \;
    fi
    
    print_status "Kubernetes manifests updated."
}

# Create secrets
create_secrets() {
    print_header "Creating Kubernetes secrets..."
    
    # Create database secret
    kubectl create secret generic db-secret \
        --namespace=task-manager \
        --from-literal=username=taskuser \
        --from-literal=password=$DB_PASSWORD \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Create JWT secret
    JWT_SECRET=$(openssl rand -base64 32)
    kubectl create secret generic auth-secret \
        --namespace=task-manager \
        --from-literal=jwt-secret=$JWT_SECRET \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Create SMTP secret (you'll need to update these values)
    kubectl create secret generic smtp-secret \
        --namespace=task-manager \
        --from-literal=host=smtp.gmail.com \
        --from-literal=port=587 \
        --from-literal=user=noreply@taskmanager.com \
        --from-literal=password=your-app-password \
        --from-literal=from="Task Manager <noreply@taskmanager.com>" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    print_status "Kubernetes secrets created."
}

# Deploy to Kubernetes
deploy_to_kubernetes() {
    print_header "Deploying to Kubernetes..."
    
    # Apply namespace
    kubectl apply -f k8s/namespace.yaml
    
    # Apply ConfigMaps and Secrets
    kubectl apply -f k8s/configmap.yaml
    kubectl apply -f k8s/secrets.yaml
    
    # Deploy infrastructure services (PostgreSQL, Redis)
    kubectl apply -f k8s/postgresql.yaml
    kubectl apply -f k8s/redis.yaml
    
    # Wait for infrastructure services to be ready
    print_status "Waiting for infrastructure services to be ready..."
    kubectl wait --for=condition=ready pod -l app=postgresql --namespace=task-manager --timeout=300s
    kubectl wait --for=condition=ready pod -l app=redis --namespace=task-manager --timeout=300s
    
    # Deploy application services
    kubectl apply -f k8s/services/auth-service/deployment.yaml
    kubectl apply -f k8s/services/task-service/deployment.yaml
    kubectl apply -f k8s/services/media-service/deployment.yaml
    kubectl apply -f k8s/services/notification-service/deployment.yaml
    kubectl apply -f k8s/services/gateway/deployment.yaml
    
    # Deploy frontend
    kubectl apply -f k8s/frontend.yaml
    
    # Apply autoscaling
    kubectl apply -f k8s/autoscaler.yaml
    
    # Apply network policies
    kubectl apply -f k8s/network-policy.yaml
    
    print_status "Kubernetes deployment completed."
}

# Wait for deployment
wait_for_deployment() {
    print_header "Waiting for deployment to be ready..."
    
    # Wait for all deployments to be ready
    kubectl wait --for=condition=available deployment --all --namespace=task-manager --timeout=600s
    
    print_status "All deployments are ready."
}

# Get deployment info
get_deployment_info() {
    print_header "Deployment Information"
    
    # Get service endpoints
    print_status "Getting service information..."
    kubectl get services --namespace=task-manager
    
    # Get ingress information
    print_status "Getting ingress information..."
    kubectl get ingress --namespace=task-manager
    
    # Get pod status
    print_status "Getting pod status..."
    kubectl get pods --namespace=task-manager
    
    # Get external IPs
    print_status "External IP addresses:"
    gcloud compute addresses list --filter="name:frontend-ip OR name:task-manager-ip"
    
    print_status "Deployment completed successfully!"
    
    if [ -n "$DOMAIN" ]; then
        print_status "Your application will be available at:"
        print_status "Frontend: https://$DOMAIN"
        print_status "API: https://api.$DOMAIN"
    else
        print_status "Configure your domain DNS to point to the external IP addresses shown above."
    fi
}

# Cleanup function
cleanup() {
    print_header "Cleaning up temporary files..."
    
    # Remove terraform.tfvars if it exists
    if [ -f "infrastructure/terraform/terraform.tfvars" ]; then
        rm infrastructure/terraform/terraform.tfvars
    fi
    
    print_status "Cleanup completed."
}

# Main execution
main() {
    print_header "Task Manager GCP Deployment Script"
    print_status "Starting deployment process..."
    
    # Trap cleanup on exit
    trap cleanup EXIT
    
    check_prerequisites
    get_configuration
    setup_gcp_project
    deploy_infrastructure
    get_gke_credentials
    create_k8s_service_account
    update_k8s_manifests
    create_secrets
    build_and_push_images
    deploy_to_kubernetes
    wait_for_deployment
    get_deployment_info
    
    print_status "Deployment completed successfully!"
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
