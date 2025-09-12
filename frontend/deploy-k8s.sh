#!/bin/bash

# Complete Application Kubernetes Deployment Script
# Deploys frontend (with integrated API gateway) + backend services

set -e

PROJECT_ID="circular-hash-459513-q5"
SERVICE_NAME="frontend"
IMAGE_TAG="latest"
REGION="us-central1"

echo "🚀 Starting complete application deployment to Kubernetes..."
echo "Project ID: $PROJECT_ID"
echo "Frontend Service: $SERVICE_NAME (with integrated API gateway)"

# Change to frontend directory
cd "$(dirname "$0")"
echo "📂 Current directory: $(pwd)"

# Configure Docker for GCR
echo "🔐 Configuring Docker for Google Container Registry..."
gcloud auth configure-docker

# Build Docker image for linux/amd64 architecture
echo "🔨 Building frontend Docker image (with integrated API gateway)..."
docker buildx build \
  --platform linux/amd64 \
  -f Dockerfile.k8s \
  -t gcr.io/${PROJECT_ID}/${SERVICE_NAME}:${IMAGE_TAG} \
  -t gcr.io/${PROJECT_ID}/${SERVICE_NAME}:$(date +%Y%m%d-%H%M%S) \
  . \
  --push

echo "✅ Frontend Docker image built and pushed successfully!"

# Ensure we're connected to the correct GKE cluster
echo "🔗 Setting up GKE connection..."
gcloud container clusters get-credentials task-manager-cluster \
  --zone us-central1-a \
  --project ${PROJECT_ID}

# Create namespace if it doesn't exist
echo "📦 Ensuring namespace exists..."
kubectl create namespace task-manager --dry-run=client -o yaml | kubectl apply -f -

# Deploy backend services first (required for frontend API rewrites)
echo "🏗️ Deploying backend services..."
kubectl apply -f ../backend/k8s/namespace.yaml
kubectl apply -f ../backend/k8s/minimal-deployments.yaml
kubectl apply -f ../backend/k8s/backend-services.yaml

# Wait for backend services to be ready
echo "⏳ Waiting for backend services to be ready..."
kubectl rollout status deployment/auth-service -n task-manager --timeout=300s
kubectl rollout status deployment/task-service -n task-manager --timeout=300s
kubectl rollout status deployment/media-service -n task-manager --timeout=300s

# Deploy frontend (with integrated API gateway)
echo "🚢 Deploying frontend with integrated API gateway..."
kubectl apply -f ../backend/k8s/frontend.yaml

# Wait for frontend deployment to be ready
echo "⏳ Waiting for frontend deployment to be ready..."
kubectl rollout status deployment/frontend -n task-manager --timeout=300s

# Get service information
echo "📋 Getting service information..."
echo "Frontend service:"
kubectl get service frontend -n task-manager
echo ""
echo "Backend services:"
kubectl get services -n task-manager | grep -E "(auth-service|task-service|media-service)"

# Get pod status
echo "📊 Getting pod status..."
kubectl get pods -n task-manager

# Get external IP (if LoadBalancer)
echo "🌐 Getting external access information..."
EXTERNAL_IP=$(kubectl get service frontend -n task-manager -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "Pending...")
if [ "$EXTERNAL_IP" != "Pending..." ] && [ -n "$EXTERNAL_IP" ]; then
    echo "✅ Application is accessible at: http://$EXTERNAL_IP"
    echo "   - Frontend: http://$EXTERNAL_IP"
    echo "   - API endpoints: http://$EXTERNAL_IP/api/*"
else
    echo "⏳ External IP is still pending. You can check later with:"
    echo "   kubectl get service frontend -n task-manager"
fi

# Show logs from frontend pod
echo "📝 Recent logs from frontend pod:"
FRONTEND_POD=$(kubectl get pods -n task-manager -l app=frontend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -n "$FRONTEND_POD" ]; then
    kubectl logs $FRONTEND_POD -n task-manager --tail=10
fi

echo ""
echo "🎉 Complete application deployment finished!"
echo ""
echo "Architecture:"
echo "  ├── Frontend (Next.js with integrated API gateway)"
echo "  ├── Auth Service (backend)"
echo "  ├── Task Service (backend)"
echo "  └── Media Service (backend)"
echo ""
echo "API Routing (handled by Next.js rewrites):"
echo "  /api/auth/* → auth-service"
echo "  /api/albums/* → task-service"
echo "  /api/media/* → media-service"
echo ""
echo "Commands to check status:"
echo "  kubectl get pods -n task-manager"
echo "  kubectl get services -n task-manager"
echo "  kubectl logs -f deployment/frontend -n task-manager"
echo ""
echo "To access the application locally:"
echo "  kubectl port-forward service/frontend 8080:80 -n task-manager"
echo "  Then open: http://localhost:8080"
