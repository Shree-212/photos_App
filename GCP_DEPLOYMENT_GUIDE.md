# Photo Albums - GCP Deployment Guide

This guide will help you deploy the complete Photo Albums application to Google Cloud Platform.

## Prerequisites

1. **Google Cloud SDK installed and configured**
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Required APIs enabled in your GCP project**
   - Kubernetes Engine API
   - Cloud Build API
   - Container Registry API
   - Cloud SQL API
   - Cloud Storage API

3. **kubectl installed**
   ```bash
   gcloud components install kubectl
   ```

## Quick Deployment

### 1. Set your GCP Project ID
```bash
export PROJECT_ID=your-gcp-project-id
```

### 2. Run the complete deployment script
```bash
cd backend
./deploy-complete.sh
```

This will:
- Run the database migration to convert tasks to albums
- Build and push all Docker images
- Deploy to Google Kubernetes Engine
- Set up all required services

## Manual Deployment Steps

If you prefer to deploy step by step:

### 1. Infrastructure Setup
```bash
cd backend/infrastructure/terraform
terraform init
terraform plan -var="project_id=$PROJECT_ID" -var="db_password=your-secure-password"
terraform apply -var="project_id=$PROJECT_ID" -var="db_password=your-secure-password"
```

### 2. Database Migration
```bash
cd backend
export DB_HOST=your-database-host
export DB_PASSWORD=your-database-password
cd scripts
node migrate.js migrate
```

### 3. Build and Push Images
```bash
cd backend
gcloud builds submit . --config=cloudbuild.yaml

cd ../frontend
gcloud builds submit . --config=cloudbuild.yaml
```

### 4. Deploy to Kubernetes
```bash
cd backend
./update-k8s.sh  # Update namespaces and image references
kubectl apply -f k8s/
```

## Post-Deployment

### Check Status
```bash
kubectl get pods -n photo-albums
kubectl get services -n photo-albums
```

### Get External IPs
```bash
kubectl get ingress -n photo-albums
```

### View Logs
```bash
kubectl logs -f deployment/album-service -n photo-albums
kubectl logs -f deployment/frontend -n photo-albums
```

## Configuration

### Environment Variables
The application uses these key environment variables:

- `DB_HOST`: Database host (Cloud SQL instance)
- `DB_NAME`: Database name (default: photoalbums)
- `DB_USER`: Database user (default: albumuser)
- `DB_PASSWORD`: Database password
- `CORS_ORIGIN`: Frontend URL for CORS

### Storage
- Media files are stored in Google Cloud Storage
- Database runs on Cloud SQL (PostgreSQL)
- Redis for caching and sessions

## Monitoring

### Cloud Console
- **Kubernetes**: Cloud Console > Kubernetes Engine
- **Logs**: Cloud Console > Logging
- **Monitoring**: Cloud Console > Monitoring

### kubectl Commands
```bash
# Pod status
kubectl get pods -n photo-albums

# Service status
kubectl get services -n photo-albums

# Logs
kubectl logs -f deployment/album-service -n photo-albums

# Describe issues
kubectl describe pod <pod-name> -n photo-albums
```

## Troubleshooting

### Common Issues

1. **Images not found**
   - Ensure PROJECT_ID is set correctly
   - Check that Cloud Build completed successfully

2. **Database connection issues**
   - Verify Cloud SQL instance is running
   - Check database credentials in secrets

3. **Services not starting**
   - Check pod logs: `kubectl logs <pod-name> -n photo-albums`
   - Verify ConfigMap and Secrets are applied

### Cleanup
To remove everything:
```bash
kubectl delete namespace photo-albums
terraform destroy
```

## Features Deployed

- ✅ Album management with tags and categories
- ✅ Google Photos-style photo grid
- ✅ Media upload and management
- ✅ User authentication
- ✅ Responsive web interface
- ✅ API Gateway for microservices
- ✅ Auto-scaling and monitoring

## Support

For issues or questions:
1. Check the pod logs
2. Verify all services are running
3. Check the Cloud Console for any errors
4. Review the Kubernetes events: `kubectl get events -n photo-albums`
