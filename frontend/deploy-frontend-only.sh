#!/bin/bash

# Frontend-only Kubernetes Deployment Script
# Only builds and updates the frontend service (with integrated API gateway)

set -e

PROJECT_ID="circular-hash-459513-q5"
SERVICE_NAME="frontend"
IMAGE_TAG="latest"

echo "🚀 Starting frontend-only deployment to Kubernetes..."
echo "Project ID: $PROJECT_ID"
echo "Service: $SERVICE_NAME (with integrated API gateway)"

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

# Create namespace if it doesn't exist (non-destructive)
echo "📦 Ensuring namespace exists..."
kubectl create namespace task-manager --dry-run=client -o yaml | kubectl apply -f -

# Deploy/update only the frontend service
echo "🚢 Deploying/updating frontend service..."
kubectl apply -f ../backend/k8s/frontend.yaml

# Force update the deployment to use the new image
echo "🔄 Rolling out frontend update..."
kubectl rollout restart deployment/frontend -n task-manager

# Wait for frontend deployment to be ready
echo "⏳ Waiting for frontend rollout to complete..."
kubectl rollout status deployment/frontend -n task-manager --timeout=300s

# Get frontend service information
echo "📋 Frontend service status:"
kubectl get service frontend -n task-manager

# Get frontend pod status
echo "📊 Frontend pod status:"
kubectl get pods -n task-manager -l app=frontend

# Get external IP (if LoadBalancer)
echo "🌐 Getting external access information..."
EXTERNAL_IP=$(kubectl get service frontend -n task-manager -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "Pending...")
if [ "$EXTERNAL_IP" != "Pending..." ] && [ -n "$EXTERNAL_IP" ]; then
    echo "✅ Application is accessible at: http://$EXTERNAL_IP"
    echo "   - Frontend: http://$EXTERNAL_IP"
    echo "   - API endpoints: http://$EXTERNAL_IP/api/*"
else
    echo "⏳ External IP is still pending. Check with:"
    echo "   kubectl get service frontend -n task-manager"
fi

# Show recent logs from frontend pod
echo "📝 Recent logs from frontend pod:"
FRONTEND_POD=$(kubectl get pods -n task-manager -l app=frontend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -n "$FRONTEND_POD" ]; then
    echo "Pod: $FRONTEND_POD"
    kubectl logs $FRONTEND_POD -n task-manager --tail=15
else
    echo "No frontend pods found"
fi

echo ""
echo "🎉 Frontend deployment completed!"
echo ""
echo "Quick status check:"
echo "  kubectl get pods -n task-manager -l app=frontend"
echo "  kubectl logs -f deployment/frontend -n task-manager"
echo ""
echo "Local access:"
echo "  kubectl port-forward service/frontend 8080:80 -n task-manager"
