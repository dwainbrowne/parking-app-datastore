#!/bin/bash
# Database Migration Commands for Parking Permit Requests
# Generated automatically - DO NOT EDIT

set -e

echo "🚀 Starting database migration..."
echo "📁 Setting up Cloudflare D1 database"
echo ""

echo "Create D1 database (run once)"
wrangler d1 create parking-permits-db

echo "Execute schema statements"
wrangler d1 execute parking-permits-db --command "CREATE INDEX IF NOT EXISTS idx_tenants_unit_number ON tenants(unit_number);"
wrangler d1 execute parking-permits-db --command "CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(is_active);"
wrangler d1 execute parking-permits-db --command "CREATE INDEX IF NOT EXISTS idx_vehicles_license_plate ON vehicles(license_plate);"
wrangler d1 execute parking-permits-db --command "CREATE INDEX IF NOT EXISTS idx_vehicles_primary ON vehicles(is_primary);"
wrangler d1 execute parking-permits-db --command "CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_license_plate_unique ON vehicles(license_plate, state_province);"
wrangler d1 execute parking-permits-db --command "CREATE INDEX IF NOT EXISTS idx_permit_requests_vehicle_id ON permit_requests(vehicle_id);"
wrangler d1 execute parking-permits-db --command "CREATE INDEX IF NOT EXISTS idx_permit_requests_status ON permit_requests(status);"
wrangler d1 execute parking-permits-db --command "CREATE INDEX IF NOT EXISTS idx_permit_requests_submitted_at ON permit_requests(submitted_at);"
wrangler d1 execute parking-permits-db --command "CREATE INDEX IF NOT EXISTS idx_permit_requests_number ON permit_requests(request_number);"
wrangler d1 execute parking-permits-db --command "CREATE INDEX IF NOT EXISTS idx_permits_vehicle_id ON permits(vehicle_id);"
wrangler d1 execute parking-permits-db --command "CREATE INDEX IF NOT EXISTS idx_permits_active ON permits(is_active);"
wrangler d1 execute parking-permits-db --command "CREATE INDEX IF NOT EXISTS idx_permits_valid_period ON permits(valid_from, valid_until);"
wrangler d1 execute parking-permits-db --command "CREATE INDEX IF NOT EXISTS idx_permits_number ON permits(permit_number);"
wrangler d1 execute parking-permits-db --command "END;"
wrangler d1 execute parking-permits-db --command "END;"
wrangler d1 execute parking-permits-db --command "END;"
wrangler d1 execute parking-permits-db --command "END;"
wrangler d1 execute parking-permits-db --command "END;"
wrangler d1 execute parking-permits-db --command "END;"

echo ""
echo "✅ Database migration completed successfully!"
echo "🔗 Add the database binding to your wrangler.toml file"
echo ""