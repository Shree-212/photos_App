#!/bin/bash

# Local development startup script for Task Manager Microservices

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker Desktop."
        exit 1
    fi
    print_status "Docker is running ✓"
}

# Check if required files exist
check_files() {
    if [ ! -f "docker-compose.yml" ]; then
        print_error "docker-compose.yml not found. Please run this script from the backend directory."
        exit 1
    fi
    
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            print_warning ".env file not found. Copying from .env.example"
            cp .env.example .env
        else
            print_error ".env file not found and no .env.example to copy from."
            exit 1
        fi
    fi
    
    print_status "Required files found ✓"
}

# Install dependencies for all services
install_dependencies() {
    print_status "Installing dependencies for all services..."
    
    services=("auth-service" "task-service" "api-gateway")
    
    for service in "${services[@]}"; do
        if [ -d "services/$service" ]; then
            print_status "Installing dependencies for $service..."
            cd "services/$service"
            npm install
            cd "../.."
        else
            print_warning "Service directory services/$service not found"
        fi
    done
    
    print_status "Dependencies installed ✓"
}

# Build and start services
start_services() {
    print_status "Building and starting services..."
    
    # Stop any existing containers
    docker-compose down
    
    # Build and start services
    docker-compose up --build -d
    
    print_status "Services started ✓"
}

# Wait for services to be ready
wait_for_services() {
    print_status "Waiting for services to be ready..."
    
    # Wait for database
    print_status "Waiting for PostgreSQL..."
    while ! docker-compose exec postgres pg_isready -U taskuser -d taskmanager >/dev/null 2>&1; do
        sleep 1
        echo -n "."
    done
    echo ""
    print_status "PostgreSQL is ready ✓"
    
    # Wait for Redis
    print_status "Waiting for Redis..."
    while ! docker-compose exec redis redis-cli ping >/dev/null 2>&1; do
        sleep 1
        echo -n "."
    done
    echo ""
    print_status "Redis is ready ✓"
    
    # Wait for auth service
    print_status "Waiting for Auth Service..."
    while ! curl -s http://localhost:3001/health >/dev/null 2>&1; do
        sleep 1
        echo -n "."
    done
    echo ""
    print_status "Auth Service is ready ✓"
    
    # Wait for task service
    print_status "Waiting for Task Service..."
    while ! curl -s http://localhost:3002/health >/dev/null 2>&1; do
        sleep 1
        echo -n "."
    done
    echo ""
    print_status "Task Service is ready ✓"
    
    # Wait for API Gateway
    print_status "Waiting for API Gateway..."
    while ! curl -s http://localhost:3000/health >/dev/null 2>&1; do
        sleep 1
        echo -n "."
    done
    echo ""
    print_status "API Gateway is ready ✓"
}

# Show service status
show_status() {
    print_status "Service Status:"
    docker-compose ps
    
    echo ""
    print_status "Service URLs:"
    echo "  🔐 Auth Service:    http://localhost:3001"
    echo "  📋 Task Service:    http://localhost:3002"
    echo "  🌐 API Gateway:     http://localhost:3000"
    echo "  📚 API Docs:        http://localhost:3000/api/docs"
    echo "  🗄️  PostgreSQL:     localhost:5432"
    echo "  🔴 Redis:           localhost:6379"
    
    echo ""
    print_status "Test the API:"
    echo "  curl http://localhost:3000/health"
    echo "  curl http://localhost:3000/api/docs"
    
    echo ""
    print_status "View logs:"
    echo "  docker-compose logs -f [service-name]"
    echo "  Services: auth-service, task-service, api-gateway, postgres, redis"
    
    echo ""
    print_status "Stop services:"
    echo "  docker-compose down"
}

# Main execution
main() {
    print_status "Starting Task Manager Microservices..."
    
    check_docker
    check_files
    
    # Ask if user wants to install dependencies
    read -p "Install/update dependencies? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_dependencies
    fi
    
    start_services
    wait_for_services
    show_status
    
    print_status "🎉 All services are up and running!"
    print_warning "Press Ctrl+C to stop all services"
    
    # Keep script running to show logs
    docker-compose logs -f
}

# Handle Ctrl+C
trap 'print_status "Stopping services..."; docker-compose down; exit 0' INT

# Run main function
main "$@"
