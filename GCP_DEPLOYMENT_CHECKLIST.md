# Task Manager GCP Deployment Checklist

## Pre-Deployment Checklist

### Prerequisites
- [ ] Google Cloud Account with billing enabled
- [ ] Domain name purchased (optional but recommended)
- [ ] gcloud CLI installed and authenticated
- [ ] kubectl installed
- [ ] Terraform installed
- [ ] Docker installed
- [ ] Git repository access

### Initial Setup
- [ ] Create GCP project
- [ ] Enable billing for the project
- [ ] Set up IAM roles and permissions
- [ ] Configure gcloud with project

## Infrastructure Setup

### 1. Enable Required APIs
```bash
# Run this command to enable all required APIs
gcloud services enable \
  compute.googleapis.com \
  container.googleapis.com \
  cloudbuild.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  pubsub.googleapis.com \
  storage-api.googleapis.com \
  sql-component.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  secretmanager.googleapis.com
```

### 2. Deploy Infrastructure with Terraform
- [ ] Navigate to `backend/infrastructure/terraform/`
- [ ] Create `terraform.tfvars` with your configuration
- [ ] Run `terraform init`
- [ ] Run `terraform plan` to review changes
- [ ] Run `terraform apply` to deploy infrastructure

### 3. Configure Kubernetes
- [ ] Get GKE cluster credentials
- [ ] Create namespace: `task-manager`
- [ ] Set up Workload Identity
- [ ] Create Kubernetes service accounts

## Application Deployment

### 4. Secrets Management
- [ ] Create database password secret
- [ ] Generate and store JWT secret
- [ ] Configure SMTP credentials for notifications
- [ ] Set up GCP service account key

### 5. Build and Push Images
- [ ] Configure Docker authentication: `gcloud auth configure-docker`
- [ ] Update `PROJECT_ID` in cloudbuild.yaml
- [ ] Run Cloud Build: `gcloud builds submit`
- [ ] Verify images in Container Registry

### 6. Deploy to Kubernetes
- [ ] Apply namespace configuration
- [ ] Apply ConfigMaps and Secrets
- [ ] Deploy PostgreSQL and Redis
- [ ] Deploy microservices (auth, task, media, notification)
- [ ] Deploy API Gateway
- [ ] Deploy Frontend (optional)
- [ ] Configure autoscaling
- [ ] Apply network policies

### 7. Configure Networking
- [ ] Set up ingress controllers
- [ ] Configure SSL certificates
- [ ] Set up domain DNS records
- [ ] Configure load balancers

## Post-Deployment Verification

### 8. Health Checks
- [ ] Verify all pods are running: `kubectl get pods -n task-manager`
- [ ] Check service endpoints: `kubectl get services -n task-manager`
- [ ] Test health endpoints for all services
- [ ] Verify database connectivity
- [ ] Test Redis connectivity

### 9. Functional Testing
- [ ] Test user registration
- [ ] Test user login
- [ ] Test task creation
- [ ] Test file upload functionality
- [ ] Test email notifications
- [ ] Test API Gateway routing

### 10. Monitoring Setup
- [ ] Configure monitoring dashboards
- [ ] Set up alerting policies
- [ ] Verify log aggregation
- [ ] Set up uptime monitoring
- [ ] Configure error reporting

## Security Configuration

### 11. Security Hardening
- [ ] Review IAM permissions
- [ ] Enable audit logging
- [ ] Configure network policies
- [ ] Set up security scanning
- [ ] Enable vulnerability scanning for containers

### 12. Backup and Recovery
- [ ] Configure database backups
- [ ] Set up persistent volume snapshots
- [ ] Document disaster recovery procedures
- [ ] Test backup restoration

## Performance Optimization

### 13. Performance Tuning
- [ ] Configure resource limits and requests
- [ ] Set up horizontal pod autoscaling
- [ ] Configure cluster autoscaling
- [ ] Optimize database performance
- [ ] Set up CDN for static assets

### 14. Cost Optimization
- [ ] Set up billing alerts
- [ ] Configure committed use discounts
- [ ] Implement storage lifecycle policies
- [ ] Review and optimize resource usage

## Documentation and Maintenance

### 15. Documentation
- [ ] Document deployment procedures
- [ ] Create runbooks for common operations
- [ ] Document backup and recovery procedures
- [ ] Create troubleshooting guides

### 16. Ongoing Maintenance
- [ ] Set up automated security patching
- [ ] Schedule regular backup tests
- [ ] Plan capacity monitoring
- [ ] Set up change management procedures

## Quick Start Commands

### One-time Setup
```bash
# Clone repository
git clone <your-repo-url>
cd taskmanager

# Set environment variables
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export ZONE="us-central1-a"

# Authenticate with GCP
gcloud auth login
gcloud config set project $PROJECT_ID
```

### Deploy Infrastructure
```bash
# Navigate to Terraform directory
cd backend/infrastructure/terraform

# Initialize and apply Terraform
terraform init
terraform apply
```

### Deploy Application
```bash
# Get GKE credentials
gcloud container clusters get-credentials task-manager-cluster \
  --zone $ZONE --project $PROJECT_ID

# Run deployment script
cd ../../
chmod +x deploy-gcp.sh
./deploy-gcp.sh
```

### Verify Deployment
```bash
# Check pod status
kubectl get pods -n task-manager

# Check services
kubectl get services -n task-manager

# Check ingress
kubectl get ingress -n task-manager

# Get external IPs
gcloud compute addresses list
```

## Troubleshooting

### Common Issues
1. **Pod CrashLoopBackOff**
   - Check logs: `kubectl logs <pod-name> -n task-manager`
   - Verify secrets and configmaps
   - Check resource limits

2. **Service Connection Issues**
   - Verify service discovery
   - Check network policies
   - Verify firewall rules

3. **Database Connection Issues**
   - Check Cloud SQL authorization
   - Verify private IP configuration
   - Check credentials

4. **Image Pull Errors**
   - Verify Container Registry permissions
   - Check image tags
   - Verify service account permissions

### Useful Commands
```bash
# Get cluster info
kubectl cluster-info

# Debug pod issues
kubectl describe pod <pod-name> -n task-manager

# View logs
kubectl logs -f <pod-name> -n task-manager

# Port forward for testing
kubectl port-forward svc/api-gateway 8080:80 -n task-manager

# Scale deployment
kubectl scale deployment <deployment-name> --replicas=3 -n task-manager
```

## Support and Resources

- **GCP Documentation**: https://cloud.google.com/docs
- **Kubernetes Documentation**: https://kubernetes.io/docs
- **Terraform GCP Provider**: https://registry.terraform.io/providers/hashicorp/google
- **Support**: Create issues in the project repository

## Cost Estimates

### Monthly Costs (Approximate)
- **Development Environment**: $200-400
- **Production Environment**: $800-2000
- **High-Scale Production**: $2000-5000

### Cost Optimization Tips
1. Use preemptible instances for development
2. Implement autoscaling to reduce idle costs
3. Use committed use discounts for predictable workloads
4. Regularly review and optimize resource usage
5. Set up billing alerts and budgets
