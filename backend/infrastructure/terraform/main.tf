# Task Manager GCP Infrastructure with Terraform

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
    "cloudbuild.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "pubsub.googleapis.com",
    "storage-api.googleapis.com",
    "storage-component.googleapis.com",
    "sql-component.googleapis.com",
    "sqladmin.googleapis.com",
    "memcache.googleapis.com",
    "redis.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "cloudtrace.googleapis.com",
    "clouderrorreporting.googleapis.com",
    "secretmanager.googleapis.com"
  ])

  service = each.value
  project = var.project_id

  disable_dependent_services = false
  disable_on_destroy         = false
}

# GKE Cluster
resource "google_container_cluster" "task_manager" {
  name     = "task-manager-cluster"
  location = var.zone
  project  = var.project_id

  # Remove default node pool
  remove_default_node_pool = true
  initial_node_count       = 1

  # Network configuration
  network    = google_compute_network.vpc.self_link
  subnetwork = google_compute_subnetwork.subnet.self_link

  # Security configuration
  master_auth {
    client_certificate_config {
      issue_client_certificate = false
    }
  }

  # Workload Identity
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Network policy
  network_policy {
    enabled  = true
    provider = "CALICO"
  }

  # Private cluster configuration
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }

  # IP allocation policy
  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  # Addons
  addons_config {
    http_load_balancing {
      disabled = false
    }
    horizontal_pod_autoscaling {
      disabled = false
    }
    network_policy_config {
      disabled = false
    }
  }

  depends_on = [
    google_project_service.required_apis
  ]
}

# Node Pool
resource "google_container_node_pool" "primary_nodes" {
  name       = "primary-node-pool"
  location   = var.zone
  cluster    = google_container_cluster.task_manager.name
  node_count = 3

  node_config {
    preemptible  = false
    machine_type = "e2-standard-4"

    # Google recommends custom service accounts with minimal permissions
    service_account = google_service_account.gke_node.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      environment = var.environment
      application = "task-manager"
    }

    tags = ["task-manager", "gke-node"]

    # Security
    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }

  # Auto-scaling
  autoscaling {
    min_node_count = 1
    max_node_count = 10
  }

  # Auto-upgrade and auto-repair
  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

# VPC Network
resource "google_compute_network" "vpc" {
  name                    = "task-manager-vpc"
  auto_create_subnetworks = false
  project                 = var.project_id
}

# Subnet
resource "google_compute_subnetwork" "subnet" {
  name          = "task-manager-subnet"
  ip_cidr_range = "10.0.0.0/16"
  region        = var.region
  network       = google_compute_network.vpc.id
  project       = var.project_id

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.1.0.0/16"
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.2.0.0/16"
  }
}

# Cloud SQL PostgreSQL instance
resource "google_sql_database_instance" "postgres" {
  name             = "task-manager-postgres"
  database_version = "POSTGRES_13"
  region           = var.region
  project          = var.project_id

  settings {
    tier              = "db-custom-2-4096"
    availability_type = "REGIONAL"
    disk_type         = "PD_SSD"
    disk_size         = 100

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      location                       = var.region
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 30
      }
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
      require_ssl     = true
    }

    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    maintenance_window {
      day          = 7
      hour         = 3
      update_track = "stable"
    }
  }

  deletion_protection = true

  depends_on = [
    google_service_networking_connection.private_vpc_connection
  ]
}

# Cloud SQL Database
resource "google_sql_database" "database" {
  name     = "taskmanager"
  instance = google_sql_database_instance.postgres.name
  project  = var.project_id
}

# Cloud SQL User
resource "google_sql_user" "users" {
  name     = "taskuser"
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
  project  = var.project_id
}

# Private service connection for Cloud SQL
resource "google_compute_global_address" "private_ip_address" {
  name          = "private-ip-address"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
  project       = var.project_id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]
}

# Memorystore Redis
resource "google_redis_instance" "cache" {
  name           = "task-manager-cache"
  memory_size_gb = 1
  region         = var.region
  project        = var.project_id

  authorized_network = google_compute_network.vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  redis_version     = "REDIS_6_X"
  display_name      = "Task Manager Cache"
  reserved_ip_range = "10.3.0.0/29"

  labels = {
    environment = var.environment
    application = "task-manager"
  }
}

# Cloud Storage bucket for media files
resource "google_storage_bucket" "media" {
  name          = "${var.project_id}-taskmanager-media"
  location      = var.region
  force_destroy = false
  project       = var.project_id

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      age                   = 30
      matches_storage_class = ["STANDARD"]
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  cors {
    origin          = ["https://your-domain.com"]
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }
}

# Pub/Sub topic for events
resource "google_pubsub_topic" "task_events" {
  name    = "task-manager-events"
  project = var.project_id

  labels = {
    environment = var.environment
    application = "task-manager"
  }
}

# Pub/Sub subscription
resource "google_pubsub_subscription" "task_events_subscription" {
  name    = "task-manager-events-subscription"
  topic   = google_pubsub_topic.task_events.name
  project = var.project_id

  message_retention_duration = "604800s" # 7 days
  retain_acked_messages      = false
  ack_deadline_seconds       = 20

  expiration_policy {
    ttl = "300000.5s"
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

# Dead letter topic
resource "google_pubsub_topic" "dead_letter" {
  name    = "task-manager-dead-letter"
  project = var.project_id
}

# Service accounts
resource "google_service_account" "gke_node" {
  account_id   = "gke-node-sa"
  display_name = "GKE Node Service Account"
  project      = var.project_id
}

resource "google_service_account" "app_service_account" {
  account_id   = "task-manager-app"
  display_name = "Task Manager Application Service Account"
  project      = var.project_id
}

# IAM roles for GKE node service account
resource "google_project_iam_member" "gke_node_roles" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/monitoring.viewer",
    "roles/storage.objectViewer"
  ])

  role    = each.value
  member  = "serviceAccount:${google_service_account.gke_node.email}"
  project = var.project_id
}

# IAM roles for application service account
resource "google_project_iam_member" "app_service_account_roles" {
  for_each = toset([
    "roles/storage.objectAdmin",
    "roles/pubsub.publisher",
    "roles/pubsub.subscriber",
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor"
  ])

  role    = each.value
  member  = "serviceAccount:${google_service_account.app_service_account.email}"
  project = var.project_id
}

# Workload Identity binding
resource "google_service_account_iam_member" "workload_identity" {
  service_account_id = google_service_account.app_service_account.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[task-manager/task-manager-ksa]"
}

# Static IP addresses
resource "google_compute_global_address" "frontend_ip" {
  name    = "frontend-ip"
  project = var.project_id
}

resource "google_compute_global_address" "api_ip" {
  name    = "task-manager-ip"
  project = var.project_id
}

# Cloud Build trigger
resource "google_cloudbuild_trigger" "deploy_trigger" {
  name     = "task-manager-deploy"
  project  = var.project_id
  location = var.region

  github {
    owner = "your-github-username"
    name  = "taskmanager"
    push {
      branch = "^main$"
    }
  }

  filename = "backend/cloudbuild.yaml"

  substitutions = {
    _GKE_CLUSTER  = google_container_cluster.task_manager.name
    _GKE_LOCATION = var.zone
  }
}

# Variables for sensitive data
variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

# Outputs
output "cluster_name" {
  value = google_container_cluster.task_manager.name
}

output "cluster_location" {
  value = google_container_cluster.task_manager.location
}

output "database_connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}

output "redis_host" {
  value = google_redis_instance.cache.host
}

output "redis_port" {
  value = google_redis_instance.cache.port
}

output "storage_bucket" {
  value = google_storage_bucket.media.name
}

output "pubsub_topic" {
  value = google_pubsub_topic.task_events.name
}

output "frontend_ip" {
  value = google_compute_global_address.frontend_ip.address
}

output "api_ip" {
  value = google_compute_global_address.api_ip.address
}
