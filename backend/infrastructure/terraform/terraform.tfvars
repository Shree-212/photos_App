# GCP Project Configuration
project_id = "circular-hash-459513-q5"
region     = "us-central1"
zone       = "us-central1-a"

# Application Configuration
app_name = "taskmanager"
environment = "production"

# Domain Configuration (using GCP-generated domains)
domain_name = "taskmanager.example.com"

# Database Configuration
db_name = "taskmanager_prod"
db_user = "taskmanager_user"

# Storage Configuration
storage_bucket_name = "taskmanager-media-circular-hash-459513-q5"

# Cluster Configuration (reduced to fit quota)
gke_num_nodes = 1
gke_machine_type = "e2-medium"
gke_disk_size_gb = 20
