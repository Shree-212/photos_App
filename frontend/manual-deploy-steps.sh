#!/bin/bash

# Simple Frontend Update Script
# Step-by-step commands to update only the frontend

echo "=== Frontend Update Commands ==="
echo ""
echo "1. Change to frontend directory:"
echo "cd /Users/shreeyanshukesarwani/Documents/GitHub/taskmanager/frontend"
echo ""
echo "2. Build and push Docker image:"
echo "docker build --platform linux/amd64 -f Dockerfile.k8s -t gcr.io/circular-hash-459513-q5/frontend:latest ."
echo ""
echo "3. Push to registry:"
echo "docker push gcr.io/circular-hash-459513-q5/frontend:latest"
echo ""
echo "4. Update frontend deployment:"
echo "kubectl rollout restart deployment/frontend -n task-manager"
echo ""
echo "5. Check status:"
echo "kubectl rollout status deployment/frontend -n task-manager"
echo ""
echo "6. Get pods:"
echo "kubectl get pods -n task-manager -l app=frontend"
echo ""
echo "7. Check service:"
echo "kubectl get service frontend-service -n task-manager"
echo ""
echo "=== Run these commands one by one ==="
