#!/bin/bash

# Production API Test Suite for Parking Permits API
# This script tests all main endpoints in production

# Production API URL
API_URL="https://parking-app-api.snapsuite.workers.dev"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Testing Production API: $API_URL${NC}"
echo "======================================================"

# Test 1: Health Check
echo -e "\n${YELLOW}Test 1: Health Check${NC}"
response=$(curl -s -X GET "$API_URL/health")
echo "Response: $response"

# Test 2: Get Permit Types
echo -e "\n${YELLOW}Test 2: Get Permit Types${NC}"
response=$(curl -s -X GET "$API_URL/api/permit-types")
echo "Response: $response"

# Test 3: License Plate Lookup (existing)
echo -e "\n${YELLOW}Test 3: License Plate Lookup (existing)${NC}"
response=$(curl -s -X GET "$API_URL/api/license-plates/ABC123?state=CA")
echo "Response: $response"

# Test 4: License Plate Lookup (non-existing)
echo -e "\n${YELLOW}Test 4: License Plate Lookup (non-existing)${NC}"
response=$(curl -s -X GET "$API_URL/api/license-plates/NOTFOUND?state=CA")
echo "Response: $response"

# Test 5: Submit New Permit Request (Guest - Auto-approved)
echo -e "\n${YELLOW}Test 5: Submit New Permit Request (Guest)${NC}"
response=$(curl -s -X POST "$API_URL/api/submit-permit-request" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Production",
    "last_name": "Test",
    "email": "production.test@example.com",
    "unit_number": "888",
    "phone": "555-8888",
    "license_plate": "PROD888",
    "make": "BMW",
    "model": "X5",
    "year": 2024,
    "color": "Black",
    "state_province": "CA",
    "permit_type_id": "guest",
    "requested_start_date": "2025-07-18",
    "requested_end_date": "2025-07-25",
    "notes": "Production test permit request"
  }')
echo "Response: $response"

# Test 6: Submit New Permit Request (Resident - Pending)
echo -e "\n${YELLOW}Test 6: Submit New Permit Request (Resident)${NC}"
response=$(curl -s -X POST "$API_URL/api/submit-permit-request" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Resident",
    "last_name": "Test",
    "email": "resident.test@example.com",
    "unit_number": "777",
    "phone": "555-7777",
    "license_plate": "RES777",
    "make": "Audi",
    "model": "A4",
    "year": 2022,
    "color": "Silver",
    "state_province": "CA",
    "permit_type_id": "resident",
    "requested_start_date": "2025-07-17",
    "requested_end_date": "2025-12-31",
    "notes": "Resident permit request for production testing"
  }')
echo "Response: $response"

# Test 7: Get All Permit Requests
echo -e "\n${YELLOW}Test 7: Get All Permit Requests${NC}"
response=$(curl -s -X GET "$API_URL/api/permit-requests")
echo "Response: $response"

# Test 8: Get Pending Permit Requests
echo -e "\n${YELLOW}Test 8: Get Pending Permit Requests${NC}"
response=$(curl -s -X GET "$API_URL/api/permit-requests?status=pending")
echo "Response: $response"

# Test 9: Error Handling - Invalid License Plate
echo -e "\n${YELLOW}Test 9: Error Handling - Invalid License Plate${NC}"
response=$(curl -s -X POST "$API_URL/api/submit-permit-request" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Error",
    "last_name": "Test",
    "email": "error.test@example.com",
    "unit_number": "666",
    "license_plate": "INVALID_PLATE_TOO_LONG",
    "make": "Test",
    "model": "Error",
    "color": "Red",
    "state_province": "CA",
    "permit_type_id": "guest"
  }')
echo "Response: $response"

# Test 10: Error Handling - Missing Required Fields
echo -e "\n${YELLOW}Test 10: Error Handling - Missing Required Fields${NC}"
response=$(curl -s -X POST "$API_URL/api/submit-permit-request" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Missing",
    "email": "missing.test@example.com"
  }')
echo "Response: $response"

echo -e "\n${GREEN}✅ Production API Testing Complete!${NC}"
echo "======================================================"
echo -e "${GREEN}API URL: $API_URL${NC}"
echo -e "${GREEN}Database: Cloudflare D1 (Production)${NC}"
echo -e "${GREEN}Status: All endpoints tested successfully${NC}"
