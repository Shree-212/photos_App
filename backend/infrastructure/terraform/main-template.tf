# Task Manager GCP Infrastructure - Clean Template

terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
}

# Variables with descriptions and defaults
variable "project_id" {
  description = "GCP Project ID where resources will be created"
  type        = string
  validation {
    condition     = length(var.project_id) > 0
    error_message = "Project ID cannot be empty."
  }
}

variable "region" {
  description = "GCP Region for regional resources (e.g., us-central1, europe-west1)"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP Zone for zonal resources (e.g., us-central1-a)"
  type        = string
  default     = "us-central1-a"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "app_name" {
  description = "Application name (used for resource naming)"
  type        = string
  default     = "taskmanager"
}

variable "domain_name" {
  description = "Domain name for the application (optional)"
  type        = string
  default     = "taskmanager.example.com"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "taskmanager"
}

variable "db_user" {
  description = "Database user"
  type        = string
  default     = "taskuser"
}

variable "db_password" {
  description = "Database password (must be strong)"
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.db_password) >= 8
    error_message = "Database password must be at least 8 characters long."
  }
}

variable "storage_bucket_name" {
  description = "Cloud Storage bucket name (must be globally unique)"
  type        = string
}

variable "gke_num_nodes" {
  description = "Number of GKE nodes per zone"
  type        = number
  default     = 1
  validation {
    condition     = var.gke_num_nodes >= 1 && var.gke_num_nodes <= 10
    error_message = "Number of nodes must be between 1 and 10."
  }
}

variable "gke_machine_type" {
  description = "GKE node machine type"
  type        = string
  default     = "e2-medium"
}

variable "gke_disk_size_gb" {
  description = "GKE node disk size in GB"
  type        = number
  default     = 20
  validation {
    condition     = var.gke_disk_size_gb >= 10 && var.gke_disk_size_gb <= 200
    error_message = "Disk size must be between 10 and 200 GB."
  }
}

variable "enable_deletion_protection" {
  description = "Enable deletion protection for critical resources"
  type        = bool
  default     = true
}

variable "enable_backup" {
  description = "Enable automatic backups for database"
  type        = bool
  default     = true
}

# Local values for resource naming
locals {
  resource_prefix = "${var.app_name}-${var.environment}"
  common_labels = {
    application = var.app_name
    environment = var.environment
    managed_by  = "terraform"
  }
}

# Configure the Google Cloud Provider
provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# Enable required APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "compute.googleapis.com",
    "container.googleapis.com",
    "sqladmin.googleapis.com",
    "storage-component.googleapis.com",
    "storage-api.googleapis.com",
    "pubsub.googleapis.com",
    "cloudbuild.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "cloudtrace.googleapis.com",
    "clouderrorreporting.googleapis.com",
  ])

  service                    = each.value
  disable_dependent_services = false
  disable_on_destroy         = false
}

# VPC Network
resource "google_compute_network" "vpc" {
  name                    = "${local.resource_prefix}-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.required_apis]
}

resource "google_compute_subnetwork" "subnet" {
  name          = "${local.resource_prefix}-subnet"
  ip_cidr_range = "10.0.0.0/16"
  region        = var.region
  network       = google_compute_network.vpc.id
  
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.1.0.0/16"
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.2.0.0/16"
  }
}

# Firewall rules for GKE
resource "google_compute_firewall" "allow_internal" {
  name    = "${local.resource_prefix}-allow-internal"
  network = google_compute_network.vpc.name

  allow {
    protocol = "icmp"
  }

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  source_ranges = ["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"]
}

# Static IP addresses
resource "google_compute_global_address" "frontend_ip" {
  name = "${local.resource_prefix}-frontend-ip"
}

resource "google_compute_global_address" "api_ip" {
  name = "${local.resource_prefix}-api-ip"
}

# GKE Cluster
resource "google_container_cluster" "main" {
  name     = "${local.resource_prefix}-cluster"
  location = var.zone

  # We can't just remove the default node pool
  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.subnet.name

  # Deletion protection
  deletion_protection = var.enable_deletion_protection

  # Workload Identity
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # IP allocation for pods and services
  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  # Enable network policy
  network_policy {
    enabled = true
  }

  addons_config {
    network_policy_config {
      disabled = false
    }
    
    horizontal_pod_autoscaling {
      disabled = false
    }
    
    http_load_balancing {
      disabled = false
    }
  }

  # Resource labels
  resource_labels = local.common_labels

  depends_on = [google_project_service.required_apis]
}

# GKE Node Pool
resource "google_container_node_pool" "main_nodes" {
  name       = "${local.resource_prefix}-node-pool"
  location   = var.zone
  cluster    = google_container_cluster.main.name
  node_count = var.gke_num_nodes

  node_config {
    machine_type = var.gke_machine_type
    disk_size_gb = var.gke_disk_size_gb
    disk_type    = "pd-balanced"
    
    # Google recommends custom service accounts with specific scopes
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = local.common_labels

    tags = ["${var.app_name}", "gke-node"]

    # Enable workload identity
    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    # Security settings
    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }
  }

  # Node management
  management {
    auto_repair  = true
    auto_upgrade = true
  }

  # Autoscaling configuration
  autoscaling {
    min_node_count = 1
    max_node_count = var.gke_num_nodes * 3
  }
}

# Cloud SQL Instance
resource "google_sql_database_instance" "postgres" {
  name             = "${local.resource_prefix}-postgres"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier = "db-f1-micro"
    
    disk_autoresize       = true
    disk_autoresize_limit = 100
    disk_size             = 20
    disk_type             = "PD_SSD"

    backup_configuration {
      enabled    = var.enable_backup
      start_time = "03:00"
      
      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled    = true
      require_ssl     = false
      
      authorized_networks {
        value = "0.0.0.0/0"
        name  = "all"
      }
    }

    database_flags {
      name  = "log_statement"
      value = "all"
    }

    user_labels = local.common_labels
  }

  deletion_protection = var.enable_deletion_protection

  depends_on = [google_project_service.required_apis]
}

resource "google_sql_database" "database" {
  name     = var.db_name
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "users" {
  name     = var.db_user
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}

# Cloud Storage Bucket
resource "google_storage_bucket" "media" {
  name          = var.storage_bucket_name
  location      = "US-CENTRAL1"
  storage_class = "STANDARD"

  uniform_bucket_level_access = true
  force_destroy              = !var.enable_deletion_protection

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }

  labels = local.common_labels
}

# Pub/Sub Topics
resource "google_pubsub_topic" "task_events" {
  name = "${local.resource_prefix}-events"

  labels = local.common_labels
}

resource "google_pubsub_topic" "dead_letter" {
  name = "${local.resource_prefix}-dead-letter"

  labels = local.common_labels
}

resource "google_pubsub_subscription" "task_events_subscription" {
  name  = "${local.resource_prefix}-events-subscription"
  topic = google_pubsub_topic.task_events.name

  ack_deadline_seconds       = 20
  message_retention_duration = "86400s"

  expiration_policy {
    ttl = "86400s"
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 10
  }

  labels = local.common_labels
}

# Outputs
output "cluster_name" {
  description = "Name of the GKE cluster"
  value       = google_container_cluster.main.name
}

output "cluster_location" {
  description = "Location of the GKE cluster"
  value       = google_container_cluster.main.location
}

output "cluster_endpoint" {
  description = "Endpoint of the GKE cluster"
  value       = google_container_cluster.main.endpoint
  sensitive   = true
}

output "frontend_ip" {
  description = "Static IP address for frontend"
  value       = google_compute_global_address.frontend_ip.address
}

output "api_ip" {
  description = "Static IP address for API"
  value       = google_compute_global_address.api_ip.address
}

output "database_ip" {
  description = "IP address of the Cloud SQL instance"
  value       = google_sql_database_instance.postgres.ip_address[0].ip_address
}

output "database_connection_name" {
  description = "Connection name for Cloud SQL instance"
  value       = google_sql_database_instance.postgres.connection_name
}

output "storage_bucket" {
  description = "Name of the Cloud Storage bucket"
  value       = google_storage_bucket.media.name
}

output "pubsub_topic" {
  description = "Name of the Pub/Sub topic"
  value       = google_pubsub_topic.task_events.name
}

output "vpc_network" {
  description = "Name of the VPC network"
  value       = google_compute_network.vpc.name
}

output "project_id" {
  description = "GCP Project ID"
  value       = var.project_id
}
