# GCP Services Used in Task Manager Project

## Overview

This document lists all Google Cloud Platform (GCP) services used in the Task Manager microservices project, their purpose, and estimated costs.

## Core Compute Services

### 1. Google Kubernetes Engine (GKE)
- **Purpose**: Container orchestration and management
- **Configuration**: 
  - 1 zonal cluster in us-central1-a
  - 3-10 e2-standard-4 nodes (auto-scaling)
  - Workload Identity enabled
  - Private cluster with authorized networks
- **Features Used**:
  - Horizontal Pod Autoscaler (HPA)
  - Network policies
  - Workload Identity
  - Private clusters
- **Estimated Cost**: $200-600/month (depending on scale)

### 2. Google Compute Engine (via GKE)
- **Purpose**: Virtual machines for Kubernetes nodes
- **Configuration**: e2-standard-4 instances (4 vCPUs, 16GB RAM)
- **Features Used**:
  - Persistent disks for storage
  - Auto-scaling instance groups
  - Custom service accounts
- **Estimated Cost**: Included in GKE pricing

## Database Services

### 3. Cloud SQL for PostgreSQL
- **Purpose**: Primary relational database
- **Configuration**:
  - PostgreSQL 13
  - db-custom-2-4096 (2 vCPUs, 4GB RAM)
  - Regional availability (high availability)
  - 100GB SSD storage
  - Automated backups with point-in-time recovery
- **Features Used**:
  - Private IP connectivity
  - SSL/TLS encryption
  - Automated backups
  - Read replicas (optional)
- **Estimated Cost**: $150-250/month

### 4. Memorystore for Redis
- **Purpose**: Caching and session storage
- **Configuration**:
  - 1GB standard tier
  - Private service access
  - Redis 6.x
- **Features Used**:
  - VPC native connectivity
  - High availability (optional)
  - In-transit encryption
- **Estimated Cost**: $40-80/month

## Storage Services

### 5. Cloud Storage
- **Purpose**: Media file storage (images, documents)
- **Configuration**:
  - Multi-regional bucket
  - Uniform bucket-level access
  - Object versioning enabled
  - Lifecycle policies for cost optimization
- **Features Used**:
  - CORS configuration for web access
  - IAM-based access control
  - Object lifecycle management
  - CDN integration (via Cloud CDN)
- **Estimated Cost**: $20-100/month (depending on usage)

### 6. Persistent Disks
- **Purpose**: Storage for Kubernetes pods and databases
- **Configuration**:
  - SSD persistent disks
  - Regional persistent disks for high availability
- **Features Used**:
  - Automatic encryption
  - Snapshot capabilities
  - Dynamic provisioning
- **Estimated Cost**: $50-150/month

## Messaging and Events

### 7. Cloud Pub/Sub
- **Purpose**: Asynchronous messaging between microservices
- **Configuration**:
  - Task events topic
  - Dead letter queue for failed messages
  - Subscription with retry policies
- **Features Used**:
  - Message ordering
  - Dead letter queues
  - Push/Pull subscriptions
  - Message filtering
- **Estimated Cost**: $10-50/month

## Networking Services

### 8. Cloud Load Balancing
- **Purpose**: Load balancing for web traffic
- **Configuration**:
  - Global HTTP(S) load balancer
  - SSL termination
  - URL-based routing
- **Features Used**:
  - Global load balancing
  - SSL certificates management
  - Backend health checks
  - CDN integration
- **Estimated Cost**: $20-100/month

### 9. Cloud CDN
- **Purpose**: Content delivery network for static assets
- **Configuration**:
  - Global edge locations
  - Cache policies for media files
- **Features Used**:
  - Global content distribution
  - Cache invalidation
  - Performance optimization
- **Estimated Cost**: $10-50/month

### 10. VPC (Virtual Private Cloud)
- **Purpose**: Network isolation and security
- **Configuration**:
  - Custom VPC with subnets
  - Private Google Access
  - Cloud NAT for outbound traffic
- **Features Used**:
  - Private subnets
  - Firewall rules
  - Network peering
  - Private service connections
- **Estimated Cost**: $5-20/month

### 11. Cloud NAT
- **Purpose**: Outbound internet access for private instances
- **Configuration**:
  - Regional Cloud NAT gateway
  - Static IP allocation
- **Estimated Cost**: $45-100/month

## DevOps and CI/CD Services

### 12. Cloud Build
- **Purpose**: Continuous integration and deployment
- **Configuration**:
  - Automated builds on git push
  - Multi-stage Docker builds
  - Integration with GKE
- **Features Used**:
  - Docker image building
  - Kubernetes deployment
  - Trigger-based builds
  - Build history and logs
- **Estimated Cost**: $10-50/month

### 13. Container Registry (Artifact Registry)
- **Purpose**: Docker image storage
- **Configuration**:
  - Private Docker registry
  - Regional storage
  - Vulnerability scanning
- **Features Used**:
  - Image versioning
  - Access control
  - Vulnerability scanning
  - Build integration
- **Estimated Cost**: $5-30/month

## Monitoring and Observability

### 14. Cloud Monitoring (formerly Stackdriver)
- **Purpose**: Application and infrastructure monitoring
- **Configuration**:
  - Custom metrics from applications
  - Infrastructure monitoring
  - Alerting policies
- **Features Used**:
  - Custom dashboards
  - Alerting
  - Log-based metrics
  - Uptime monitoring
- **Estimated Cost**: $10-100/month

### 15. Cloud Logging
- **Purpose**: Centralized log management
- **Configuration**:
  - Log aggregation from all services
  - Log retention policies
  - Log-based alerts
- **Features Used**:
  - Structured logging
  - Log search and filtering
  - Log exports
  - Integration with monitoring
- **Estimated Cost**: $20-200/month

### 16. Cloud Trace
- **Purpose**: Distributed tracing
- **Configuration**:
  - Automatic trace collection
  - Performance analysis
- **Features Used**:
  - Request tracing
  - Performance insights
  - Latency analysis
- **Estimated Cost**: $5-50/month

### 17. Error Reporting
- **Purpose**: Error tracking and alerting
- **Configuration**:
  - Automatic error detection
  - Error grouping and notification
- **Features Used**:
  - Real-time error tracking
  - Error notifications
  - Error analysis
- **Estimated Cost**: Free tier sufficient

## Security Services

### 18. Identity and Access Management (IAM)
- **Purpose**: Access control and authentication
- **Configuration**:
  - Service accounts for applications
  - Workload Identity for GKE
  - Role-based access control
- **Features Used**:
  - Fine-grained permissions
  - Service account keys
  - Workload Identity
  - Audit logging
- **Estimated Cost**: Free

### 19. Secret Manager
- **Purpose**: Secure storage of sensitive data
- **Configuration**:
  - Database credentials
  - API keys
  - Certificates
- **Features Used**:
  - Automatic secret rotation
  - Version management
  - Access logging
  - IAM integration
- **Estimated Cost**: $5-20/month

### 20. Cloud KMS (Key Management Service)
- **Purpose**: Encryption key management
- **Configuration**:
  - Customer-managed encryption keys
  - Key rotation policies
- **Features Used**:
  - Key lifecycle management
  - Encryption at rest
  - Audit logging
- **Estimated Cost**: $1-10/month

## DNS and Domain Services

### 21. Cloud DNS
- **Purpose**: Domain name resolution
- **Configuration**:
  - Public DNS zones
  - Health checking
- **Features Used**:
  - Global DNS resolution
  - DNS load balancing
  - DNSSEC
- **Estimated Cost**: $0.50-5/month

## API and Management Services

### 22. Cloud Endpoints
- **Purpose**: API management and monitoring
- **Configuration**:
  - API gateway features
  - Rate limiting
  - Authentication
- **Features Used**:
  - API monitoring
  - Rate limiting
  - API keys management
- **Estimated Cost**: $10-50/month

### 23. Cloud Resource Manager
- **Purpose**: Project and resource organization
- **Features Used**:
  - Project management
  - Resource hierarchy
  - Policy management
- **Estimated Cost**: Free

## Total Estimated Monthly Cost

### Production Environment:
- **Minimum**: $600-800/month
- **Typical**: $1,000-1,500/month
- **High-scale**: $2,000-5,000/month

### Development Environment:
- **Estimated**: $200-400/month

## Cost Optimization Strategies

1. **Use Preemptible Instances**: For non-critical workloads
2. **Right-size Resources**: Monitor and adjust instance sizes
3. **Implement Autoscaling**: Scale down during low usage
4. **Use Committed Use Discounts**: For predictable workloads
5. **Storage Lifecycle Policies**: Move old data to cheaper storage classes
6. **Monitor and Alert**: Set up billing alerts and budgets

## Required GCP APIs

The following APIs need to be enabled:

```bash
# Core compute and container APIs
compute.googleapis.com
container.googleapis.com

# Storage and database APIs
storage-api.googleapis.com
storage-component.googleapis.com
sql-component.googleapis.com
sqladmin.googleapis.com

# Caching and messaging APIs
redis.googleapis.com
pubsub.googleapis.com

# DevOps and CI/CD APIs
cloudbuild.googleapis.com
containerregistry.googleapis.com

# Monitoring and logging APIs
monitoring.googleapis.com
logging.googleapis.com
cloudtrace.googleapis.com
clouderrorreporting.googleapis.com

# Security and management APIs
iam.googleapis.com
secretmanager.googleapis.com
cloudkms.googleapis.com
cloudresourcemanager.googleapis.com

# Networking APIs
dns.googleapis.com
servicenetworking.googleapis.com
```

## Getting Started

1. **Enable APIs**: Use the provided script to enable all required APIs
2. **Set up billing**: Configure billing account and budgets
3. **Create service accounts**: Set up appropriate IAM roles
4. **Deploy infrastructure**: Use Terraform scripts provided
5. **Monitor costs**: Set up billing alerts and monitoring

## Support and Maintenance

- **Google Cloud Support**: Consider purchasing support plans for production
- **SLA Requirements**: Review SLA requirements for each service
- **Disaster Recovery**: Implement backup and disaster recovery plans
- **Security**: Regular security audits and compliance checks
