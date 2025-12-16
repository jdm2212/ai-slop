#!/bin/bash
set -e

CLUSTER_NAME="chat-app-test"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== Chat App Kubernetes Local Testing ==="
echo ""

# Check for required tools
check_tool() {
    if ! command -v "$1" &> /dev/null; then
        echo "Error: $1 is not installed. Please install it first."
        exit 1
    fi
}

check_tool docker
check_tool kind
check_tool kubectl

# Parse arguments
TEARDOWN_ONLY=false
SKIP_BUILD=false
SKIP_TEARDOWN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --teardown)
            TEARDOWN_ONLY=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-teardown)
            SKIP_TEARDOWN=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--teardown] [--skip-build] [--skip-teardown]"
            exit 1
            ;;
    esac
done

# Teardown function
teardown() {
    echo "==> Tearing down cluster..."
    kind delete cluster --name "$CLUSTER_NAME" 2>/dev/null || true
}

# Handle teardown-only mode
if [ "$TEARDOWN_ONLY" = true ]; then
    teardown
    echo "Cluster deleted successfully."
    exit 0
fi

# Cleanup existing cluster unless skip-teardown
if [ "$SKIP_TEARDOWN" = false ]; then
    teardown
fi

# Create cluster
echo "==> Creating kind cluster..."
kind create cluster --name "$CLUSTER_NAME" --config "$PROJECT_ROOT/k8s/kind-config.yaml" --wait 60s

# Build Docker images unless skipped
if [ "$SKIP_BUILD" = false ]; then
    echo ""
    echo "==> Building Docker images..."

    echo "Building chat-server..."
    docker build -t chat-server:latest "$PROJECT_ROOT/server"

    echo "Building chat-client..."
    docker build -t chat-client:latest "$PROJECT_ROOT/client"
fi

# Load images into kind cluster
echo ""
echo "==> Loading images into kind cluster..."
kind load docker-image chat-server:latest --name "$CLUSTER_NAME"
kind load docker-image chat-client:latest --name "$CLUSTER_NAME"

# Install nginx ingress controller
echo ""
echo "==> Installing nginx ingress controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# Wait for ingress controller to be ready
echo "==> Waiting for ingress controller..."
kubectl wait --namespace ingress-nginx \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/component=controller \
    --timeout=120s

# Apply Kubernetes manifests
echo ""
echo "==> Applying Kubernetes manifests..."
kubectl apply -f "$PROJECT_ROOT/k8s/namespace.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/server-deployment.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/server-service.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/client-deployment.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/client-service.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/ingress.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/server-nodeport.yaml"

# Wait for deployments
echo ""
echo "==> Waiting for deployments to be ready..."
kubectl wait --namespace chat-app \
    --for=condition=available deployment/chat-server \
    --timeout=120s
kubectl wait --namespace chat-app \
    --for=condition=available deployment/chat-client \
    --timeout=120s

# Show status
echo ""
echo "=== Deployment Status ==="
kubectl get all -n chat-app
echo ""
kubectl get ingress -n chat-app

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Add this to your /etc/hosts file:"
echo "  127.0.0.1 chat.local"
echo ""
echo "Then access the app at: http://chat.local"
echo ""
echo "Note: WebSocket connects directly via NodePort (localhost:3001)"
echo "      to bypass nginx ingress WebSocket issues."
echo ""
echo "To tear down the cluster, run:"
echo "  $0 --teardown"
