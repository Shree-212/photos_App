# Kubernetes Deployment Manifests Summary

This directory contains all the Kubernetes configuration files needed to deploy the Task Manager application.

## 📁 File Structure

```
k8s/
├── namespace.yaml              # Application namespace
├── secrets.yaml               # Database and API secrets
├── configmap.yaml             # Application configuration
├── postgresql.yaml            # Database deployment (if needed)
├── redis.yaml                 # Redis cache deployment
├── backend-services.yaml      # All microservices
├── frontend.yaml              # Frontend deployment
├── minimal-deployments.yaml   # Minimal resource version
├── autoscaler.yaml            # Horizontal Pod Autoscaler
└── network-policy.yaml        # Network security policies
```

## 🚀 Deployment Order

1. **Namespace**: `kubectl apply -f namespace.yaml`
2. **Secrets**: `kubectl apply -f secrets.yaml`
3. **ConfigMap**: `kubectl apply -f configmap.yaml`
4. **Database**: `kubectl apply -f postgresql.yaml` (if using in-cluster DB)
5. **Redis**: `kubectl apply -f redis.yaml`
6. **Backend Services**: `kubectl apply -f backend-services.yaml`
7. **Frontend**: `kubectl apply -f frontend.yaml`
8. **Autoscaler**: `kubectl apply -f autoscaler.yaml`
9. **Network Policies**: `kubectl apply -f network-policy.yaml`

## 🔧 Configuration Requirements

### Before Deployment:
1. **Update image references** in all deployment files
2. **Set correct database connection strings** in secrets
3. **Configure storage bucket names** in environment variables
4. **Update domain names** and ingress configurations
5. **Adjust resource requests/limits** based on your cluster size

### Environment Variables to Update:
- `DATABASE_URL`: Cloud SQL connection string
- `STORAGE_BUCKET`: Google Cloud Storage bucket name
- `PUBSUB_TOPIC`: Pub/Sub topic name
- `JWT_SECRET`: Strong JWT signing secret
- `API_URL`: Backend API URL
- `FRONTEND_URL`: Frontend application URL

## 🔐 Secrets Configuration

The `secrets.yaml` file contains base64 encoded values. To update:

```bash
# Encode new values
echo -n "your-secret-value" | base64

# Decode existing values
echo "encoded-value" | base64 -d
```

## 📊 Resource Specifications

### Default Resource Allocation:
- **Auth Service**: 100m CPU, 128Mi RAM
- **Task Service**: 100m CPU, 128Mi RAM  
- **Media Service**: 100m CPU, 256Mi RAM
- **Frontend**: 100m CPU, 128Mi RAM
- **Redis**: 50m CPU, 64Mi RAM

### Production Recommendations:
- **Auth Service**: 200m CPU, 256Mi RAM
- **Task Service**: 300m CPU, 512Mi RAM
- **Media Service**: 500m CPU, 1Gi RAM
- **Frontend**: 200m CPU, 256Mi RAM
- **Redis**: 100m CPU, 128Mi RAM

## 🔄 Health Checks

All services include:
- **Liveness Probes**: Restart unhealthy containers
- **Readiness Probes**: Route traffic only to ready containers
- **Health Check Endpoints**: `/health` for all services

## 🌐 Service Exposure

### Service Types:
- **Backend Services**: ClusterIP (internal only)
- **Frontend**: LoadBalancer with static IP
- **Database**: ClusterIP (if using in-cluster)

### Ingress Configuration:
- **Frontend**: External access via Load Balancer
- **API**: Exposed through frontend proxy or separate ingress
- **TLS**: Configure certificates for HTTPS

## 🔒 Security Policies

### Network Policies:
- **Default Deny**: Block all traffic by default
- **Allow Internal**: Enable service-to-service communication
- **Allow Frontend**: Permit external access to frontend
- **Allow Database**: Restricted database access

### Pod Security:
- **Non-root containers**: All services run as non-root
- **Read-only filesystem**: Where possible
- **Resource limits**: Prevent resource exhaustion
- **Network policies**: Isolate sensitive services

## 📈 Scaling Configuration

### Horizontal Pod Autoscaler:
- **CPU Target**: 70% utilization
- **Memory Target**: 80% utilization
- **Min Replicas**: 1 per service
- **Max Replicas**: 5 per service

### Manual Scaling:
```bash
# Scale specific deployment
kubectl scale deployment task-service --replicas=3 -n task-manager

# Scale all deployments
kubectl scale deployment --all --replicas=2 -n task-manager
```

## 🛠️ Troubleshooting

### Common Commands:
```bash
# Check pod status
kubectl get pods -n task-manager

# View pod logs
kubectl logs -f deployment/task-service -n task-manager

# Describe pod issues
kubectl describe pod <pod-name> -n task-manager

# Port forward for debugging
kubectl port-forward service/frontend 3000:3000 -n task-manager

# Execute commands in pod
kubectl exec -it <pod-name> -n task-manager -- /bin/bash
```

### Common Issues:
1. **ImagePullBackOff**: Check image names and registry access
2. **CrashLoopBackOff**: Check application logs and configuration
3. **Pending Pods**: Check resource requests vs cluster capacity
4. **Network Issues**: Verify service names and network policies

## 🔄 Updates and Rollbacks

### Rolling Updates:
```bash
# Update image
kubectl set image deployment/task-service task-service=gcr.io/project/task-service:v2 -n task-manager

# Check rollout status
kubectl rollout status deployment/task-service -n task-manager

# Rollback if needed
kubectl rollout undo deployment/task-service -n task-manager
```

## 📝 Notes

- All configurations are set for a **production-ready** deployment
- **Resource requests** are conservative to fit on small clusters
- **Secrets** should be rotated regularly
- **Images** should be updated to specific tags (not `latest`)
- **Monitoring** should be configured for all services

## 🔧 Customization

To adapt for your environment:

1. **Update all image references** to your container registry
2. **Modify resource requests/limits** based on your workload
3. **Configure ingress** for your domain and SSL certificates  
4. **Adjust replica counts** for your availability requirements
5. **Update environment variables** for your external services
