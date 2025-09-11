#!/bin/bash

# Script to update Kubernetes deployment files for Photo Albums

set -e

echo "Updating Kubernetes deployment files for Photo Albums..."

# Function to update namespace in files
update_namespace() {
    local file="$1"
    if [ -f "$file" ]; then
        echo "Updating namespace in $file"
        sed -i '' 's/namespace: task-manager/namespace: photo-albums/g' "$file"
        sed -i '' 's/task-manager\.svc\.cluster\.local/photo-albums.svc.cluster.local/g' "$file"
        sed -i '' 's/gcr\.io\/.*\//gcr.io\/PROJECT_ID\//g' "$file"
    fi
}

# Function to update image references
update_images() {
    local file="$1"
    if [ -f "$file" ]; then
        echo "Updating image references in $file"
        # Update task-service to album-service
        sed -i '' 's/task-service/album-service/g' "$file"
        # Update image tags to latest
        sed -i '' 's/:cors-fixed/:latest/g' "$file"
    fi
}

# Update auth-service (already done but let's ensure consistency)
update_namespace "k8s/services/auth-service/deployment.yaml"
update_images "k8s/services/auth-service/deployment.yaml"

# Update media-service
update_namespace "k8s/services/media-service/deployment.yaml"
update_images "k8s/services/media-service/deployment.yaml"

# Update notification-service
update_namespace "k8s/services/notification-service/deployment.yaml"
update_images "k8s/services/notification-service/deployment.yaml"

# Update gateway
update_namespace "k8s/services/gateway/deployment.yaml"
update_images "k8s/services/gateway/deployment.yaml"

# Update ConfigMap
update_namespace "k8s/configmap.yaml"

# Update Secrets
update_namespace "k8s/secrets.yaml"

# Update PostgreSQL
update_namespace "k8s/postgresql.yaml"

# Update Redis
update_namespace "k8s/redis.yaml"

# Update Frontend
update_namespace "k8s/frontend.yaml"

# Update Autoscaler
update_namespace "k8s/autoscaler.yaml"

# Update Network Policy
update_namespace "k8s/network-policy.yaml"

echo "All Kubernetes files updated for Photo Albums!"
echo "Remember to update PROJECT_ID placeholder before deploying."
