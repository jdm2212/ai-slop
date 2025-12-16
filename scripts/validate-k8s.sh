#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
K8S_DIR="$PROJECT_ROOT/k8s"

echo "=== Validating Kubernetes Manifests ==="
echo ""

# Check for kubeconform or kubeval
VALIDATOR=""
if command -v kubeconform &> /dev/null; then
    VALIDATOR="kubeconform"
elif command -v kubeval &> /dev/null; then
    VALIDATOR="kubeval"
fi

ERRORS=0

# Validate YAML syntax
echo "==> Checking YAML syntax..."
for file in "$K8S_DIR"/*.yaml; do
    if ! python3 -c "import yaml; yaml.safe_load(open('$file'))" 2>/dev/null; then
        echo "  FAIL: $file has invalid YAML syntax"
        ERRORS=$((ERRORS + 1))
    else
        echo "  OK: $(basename "$file")"
    fi
done

# Validate against Kubernetes schemas if validator is available
if [ -n "$VALIDATOR" ]; then
    echo ""
    echo "==> Validating against Kubernetes schemas with $VALIDATOR..."
    for file in "$K8S_DIR"/*.yaml; do
        if [ "$VALIDATOR" = "kubeconform" ]; then
            if ! kubeconform -summary "$file" 2>/dev/null; then
                ERRORS=$((ERRORS + 1))
            fi
        else
            if ! kubeval "$file" 2>/dev/null; then
                ERRORS=$((ERRORS + 1))
            fi
        fi
    done
else
    echo ""
    echo "Note: Install kubeconform or kubeval for schema validation"
    echo "  brew install kubeconform"
fi

# Check required files exist
echo ""
echo "==> Checking required manifests..."
REQUIRED_FILES=(
    "namespace.yaml"
    "server-deployment.yaml"
    "server-service.yaml"
    "client-deployment.yaml"
    "client-service.yaml"
    "ingress.yaml"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$K8S_DIR/$file" ]; then
        echo "  OK: $file exists"
    else
        echo "  FAIL: $file is missing"
        ERRORS=$((ERRORS + 1))
    fi
done

# Validate Dockerfiles
echo ""
echo "==> Checking Dockerfiles..."
for dockerfile in "$PROJECT_ROOT/server/Dockerfile" "$PROJECT_ROOT/client/Dockerfile"; do
    if [ -f "$dockerfile" ]; then
        if grep -q "^FROM" "$dockerfile"; then
            echo "  OK: $(basename "$(dirname "$dockerfile")")/Dockerfile"
        else
            echo "  FAIL: $dockerfile appears invalid"
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo "  FAIL: $dockerfile is missing"
        ERRORS=$((ERRORS + 1))
    fi
done

# Check for common issues in manifests
echo ""
echo "==> Checking for common issues..."

# Check namespace consistency
NAMESPACES=$(grep -h "namespace:" "$K8S_DIR"/*.yaml 2>/dev/null | sort -u | wc -l)
if [ "$NAMESPACES" -gt 1 ]; then
    echo "  WARN: Multiple namespaces found in manifests"
fi

# Check image pull policy for local development
if grep -q "imagePullPolicy: Always" "$K8S_DIR"/*.yaml 2>/dev/null; then
    echo "  WARN: imagePullPolicy is Always - may fail with local images in kind"
fi

echo ""
if [ $ERRORS -eq 0 ]; then
    echo "=== All validations passed ==="
    exit 0
else
    echo "=== $ERRORS validation(s) failed ==="
    exit 1
fi
