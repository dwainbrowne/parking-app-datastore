#!/bin/bash

# Production Database Health Check
# This script monitors the production D1 database

echo "🗄️  Cloudflare D1 Database Health Check"
echo "======================================"

# Check database info
echo -e "\n📊 Database Information:"
wrangler d1 info parking-permits-db

# Check database size and record counts
echo -e "\n📈 Database Statistics:"
wrangler d1 execute parking-permits-db --remote --command "
SELECT 
    'tenants' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_records
FROM tenants
UNION ALL
SELECT 
    'vehicles' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN is_primary = 1 THEN 1 END) as primary_vehicles
FROM vehicles
UNION ALL
SELECT 
    'permit_requests' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_requests
FROM permit_requests
UNION ALL
SELECT 
    'permits' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_permits
FROM permits
UNION ALL
SELECT 
    'permit_types' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_types
FROM permit_types;
"

# Check recent activity
echo -e "\n🕒 Recent Activity (Last 24 hours):"
wrangler d1 execute parking-permits-db --remote --command "
SELECT 
    'Recent Permit Requests' as activity_type,
    COUNT(*) as count
FROM permit_requests 
WHERE created_at >= datetime('now', '-1 day')
UNION ALL
SELECT 
    'Recent Permits Issued' as activity_type,
    COUNT(*) as count
FROM permits 
WHERE created_at >= datetime('now', '-1 day')
UNION ALL
SELECT 
    'New Tenants' as activity_type,
    COUNT(*) as count
FROM tenants 
WHERE created_at >= datetime('now', '-1 day');
"

# Check permit status breakdown
echo -e "\n📋 Permit Request Status Breakdown:"
wrangler d1 execute parking-permits-db --remote --command "
SELECT 
    status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM permit_requests), 2) as percentage
FROM permit_requests 
GROUP BY status
ORDER BY count DESC;
"

# Check active permits by type
echo -e "\n🎫 Active Permits by Type:"
wrangler d1 execute parking-permits-db --remote --command "
SELECT 
    pt.name as permit_type,
    COUNT(p.id) as active_permits,
    COUNT(CASE WHEN p.valid_until >= date('now') THEN 1 END) as currently_valid
FROM permit_types pt
LEFT JOIN permits p ON pt.id = p.permit_type_id AND p.is_active = 1
GROUP BY pt.id, pt.name
ORDER BY active_permits DESC;
"

echo -e "\n✅ Database Health Check Complete!"
echo "======================================"
