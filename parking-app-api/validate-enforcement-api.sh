#!/bin/bash

# Quick validation script for the Parking Enforcement API
# Checks if the server is running and basic endpoints are accessible

echo "🔍 Parking Enforcement API Validation"
echo "====================================="

# Check if server is running
echo "📡 Checking if server is running..."
if curl -s http://localhost:8787/health > /dev/null; then
    echo "✅ Server is running on http://localhost:8787"
else
    echo "❌ Server is not running. Please start with: wrangler dev"
    exit 1
fi

# Check health endpoint
echo "🏥 Checking health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:8787/health)
if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    echo "✅ Health endpoint is working"
else
    echo "❌ Health endpoint is not responding correctly"
    echo "Response: $HEALTH_RESPONSE"
    exit 1
fi

# Check if database is connected
echo "🗄️ Checking database connection..."
LICENSE_RESPONSE=$(curl -s "http://localhost:8787/api/license-plates/TEST123?state=CA")
if echo "$LICENSE_RESPONSE" | grep -q "license_plate\|is_registered"; then
    echo "✅ Database connection is working"
else
    echo "❌ Database connection issue"
    echo "Response: $LICENSE_RESPONSE"
    exit 1
fi

# Check enforcement endpoints exist
echo "👮 Checking enforcement endpoints..."
ENFORCEMENT_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8787/api/enforcement/license-plates/TEST123?state=CA&officer_id=officer-001")
if [ "$ENFORCEMENT_RESPONSE" = "200" ] || [ "$ENFORCEMENT_RESPONSE" = "404" ]; then
    echo "✅ Enforcement endpoints are accessible"
else
    echo "❌ Enforcement endpoints are not accessible (HTTP $ENFORCEMENT_RESPONSE)"
    exit 1
fi

echo ""
echo "✅ All validation checks passed!"
echo "🚀 Server is ready for enforcement API testing"
echo ""
echo "Next steps:"
echo "1. Run comprehensive tests: node test-enforcement-complete.js"
echo "2. Test individual endpoints using test-enforcement-api.http in VS Code"
echo "3. Use wrangler tail to monitor logs during testing"
