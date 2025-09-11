#!/bin/bash

# Quick deployment script for Photo Albums application
# Deploys to existing GCP project: circular-hash-459513-q5

set -e

# Configuration
export PROJECT_ID="circular-hash-459513-q5"
export REGION="us-central1"
export ZONE="us-central1-a"
export CLUSTER_NAME="photo-albums-cluster"

echo "🚀 Deploying Photo Albums application to GCP..."
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Zone: $ZONE"

# Step 1: Set GCP project
echo "📋 Setting GCP project..."
gcloud config set project $PROJECT_ID

# Step 2: Get GKE credentials (assuming cluster exists)
echo "🔐 Getting GKE credentials..."
gcloud container clusters get-credentials $CLUSTER_NAME --zone $ZONE --project $PROJECT_ID 2>/dev/null || {
    echo "⚠️  Cluster not found. You may need to create it first using the full deployment script."
}

# Step 3: Create namespace
echo "📁 Creating namespace..."
kubectl create namespace photo-albums --dry-run=client -o yaml | kubectl apply -f -

# Step 4: Apply database migration
echo "🗄️  Applying database migration..."
echo "Note: Run the database migration manually if needed:"
echo "kubectl exec -it <postgres-pod> -n photo-albums -- psql -U albumuser -d photoalbums -f /path/to/migration.sql"

# Step 5: Build and push images
echo "🔨 Building and pushing Docker images..."
cd backend
gcloud builds submit . --config=cloudbuild.yaml
cd ..

cd frontend  
gcloud builds submit . --config=cloudbuild.yaml
cd ..

# Step 6: Deploy Kubernetes manifests
echo "☸️  Deploying to Kubernetes..."
cd backend

# Apply configurations
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml

# Deploy services
kubectl apply -f k8s/services/

# Deploy infrastructure
kubectl apply -f k8s/postgresql.yaml
kubectl apply -f k8s/redis.yaml

# Wait for infrastructure
echo "⏳ Waiting for infrastructure to be ready..."
kubectl wait --for=condition=ready pod -l app=postgresql --namespace=photo-albums --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis --namespace=photo-albums --timeout=300s

# Deploy application services  
find k8s/ -name "*deployment.yaml" -exec kubectl apply -f {} \;

# Deploy frontend
kubectl apply -f k8s/frontend.yaml

cd ..

# Step 7: Check deployment status
echo "📊 Checking deployment status..."
kubectl get pods -n photo-albums
kubectl get services -n photo-albums

echo "✅ Deployment completed!"
echo "Use 'kubectl get pods -n photo-albums' to check pod status"
echo "Use 'kubectl get services -n photo-albums' to get service endpoints"
