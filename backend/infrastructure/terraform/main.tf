# Photo Albums GCP Infrastructure - Simplified Version

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

# Variables
variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "circular-hash-459513-q5"
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP Zone"
  type        = string
  default     = "us-central1-a"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "photo-albums"
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = "photoalbums.example.com"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "photoalbums_prod"
}

variable "db_user" {
  description = "Database user"
  type        = string
  default     = "photoalbums_user"
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "storage_bucket_name" {
  description = "Cloud Storage bucket name"
  type        = string
}

variable "gke_num_nodes" {
  description = "Number of GKE nodes"
  type        = number
  default     = 1
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
}

# Configure the Google Cloud Provider
provider "google" {
  credentials = file("service-account-key.json")
  project     = var.project_id
  region      = var.region
}

provider "google-beta" {
  credentials = file("service-account-key.json")
  project     = var.project_id
  region      = var.region
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

# VPC Network (Simplified)
resource "google_compute_network" "vpc" {
  name                    = "photo-albums-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.required_apis]
}

resource "google_compute_subnetwork" "subnet" {
  name          = "photo-albums-subnet"
  ip_cidr_range = "10.0.0.0/16"
  region        = var.region
  network       = google_compute_network.vpc.id

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.1.0.0/16"
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.2.0.0/16"
  }
}

# Static IP addresses
resource "google_compute_global_address" "frontend_ip" {
  name = "photo-albums-frontend-ip"
}

resource "google_compute_global_address" "api_ip" {
  name = "photo-albums-api-ip"
}

# GKE Cluster (Simplified - using default service account)
resource "google_container_cluster" "photo_albums" {
  name     = "photo-albums-cluster"
  location = var.zone

  # We can't just remove the default node pool, so we need to set node_count to 1
  initial_node_count       = 1
  remove_default_node_pool = false

  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.subnet.name

  # Allow deletion for cleanup
  deletion_protection = false

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
  }

  # Simplified node configuration
  node_config {
    machine_type = var.gke_machine_type
    disk_size_gb = var.gke_disk_size_gb
    
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      application = "photo-albums"
      environment = var.environment
    }

    tags = ["photo-albums", "gke-node"]
  }

  depends_on = [google_project_service.required_apis]
}

# Cloud SQL (Simplified - Public IP)
resource "google_sql_database_instance" "postgres" {
  name             = "photo-albums-postgres"
  database_version = "POSTGRES_13"
  region           = var.region

  settings {
    tier = "db-f1-micro"  # Smallest instance to save costs
    disk_size = 20        # Smaller disk size

    backup_configuration {
      enabled = true
      start_time = "03:00"
    }

    ip_configuration {
      ipv4_enabled = true  # Using public IP for simplicity
      authorized_networks {
        value = "0.0.0.0/0"  # Allow from anywhere (adjust for security)
        name  = "all"
      }
    }
  }

  deletion_protection = false  # Allow deletion for testing

  depends_on = [google_project_service.required_apis]
}

resource "google_sql_database" "database" {
  name     = "photoalbums"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "users" {
  name     = "albumuser"
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}

# Cloud Storage
resource "google_storage_bucket" "media" {
  name          = var.storage_bucket_name
  location      = "US-CENTRAL1"
  storage_class = "STANDARD"

  uniform_bucket_level_access = true
  force_destroy = true  # Allow forced destruction with objects

  cors {
    origin          = ["*"]  # Allow from any origin for testing
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
}

# Pub/Sub (Simplified)
resource "google_pubsub_topic" "album_events" {
  name = "photo-albums-events"

  labels = {
    application = "photo-albums"
    environment = var.environment
  }
}

resource "google_pubsub_topic" "dead_letter" {
  name = "photo-albums-dead-letter"
}

resource "google_pubsub_subscription" "album_events_subscription" {
  name  = "photo-albums-events-subscription"
  topic = google_pubsub_topic.album_events.name

  ack_deadline_seconds = 20
  message_retention_duration = "86400s"  # 1 day (matches expiration)
  
  # Remove message retention to avoid conflict with expiration policy
  expiration_policy {
    ttl = "86400s"  # 24 hours
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 10
  }
}

# Outputs
output "cluster_name" {
  value = google_container_cluster.photo_albums.name
}

output "cluster_location" {
  value = google_container_cluster.photo_albums.location
}

output "cluster_endpoint" {
  value = google_container_cluster.photo_albums.endpoint
}

output "frontend_ip" {
  value = google_compute_global_address.frontend_ip.address
}

output "api_ip" {
  value = google_compute_global_address.api_ip.address
}

output "database_ip" {
  value = google_sql_database_instance.postgres.ip_address.0.ip_address
}

output "database_connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}

output "storage_bucket" {
  value = google_storage_bucket.media.name
}

output "pubsub_topic" {
  value = google_pubsub_topic.album_events.name
}
