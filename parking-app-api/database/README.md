# Parking Permit Request Database Schema

This directory contains the focused database schema for handling parking permit requests based on license plates and tenant information.

## Overview

The schema is designed to be minimal and focused on the core functionality of:
- Managing tenant information
- Registering vehicles with license plates
- Processing permit requests
- Issuing permits

## Files

- `schema.sql` - Complete database schema with tables, indexes, views, and triggers
- `types.ts` - TypeScript type definitions matching the schema
- `migrate.js` - Migration script to set up the D1 database
- `README.md` - This file

## Database Tables

### Core Tables

1. **tenants** - Basic tenant information
   - `id`, `email`, `phone`, `first_name`, `last_name`, `unit_number`, `building_code`

2. **vehicles** - Vehicle registration data
   - `id`, `tenant_id`, `license_plate`, `make`, `model`, `year`, `color`, `state_province`, `country`

3. **permit_types** - Available permit types
   - `id`, `name`, `description`, `duration_days`, `max_vehicles_per_tenant`, `requires_approval`

4. **permit_requests** - Central permit request tracking
   - `id`, `request_number`, `tenant_id`, `vehicle_id`, `permit_type_id`, `status`, `requested_start_date`, `requested_end_date`

5. **permits** - Issued permits
   - `id`, `permit_number`, `permit_request_id`, `tenant_id`, `vehicle_id`, `valid_from`, `valid_until`, `qr_code`

### Views

- **active_permit_requests** - Join view of pending/under review requests with tenant and vehicle info
- **active_permits** - Join view of active permits with related data

## Key Features

### Automatic Number Generation
- Request numbers: `PR-YYYYMMDD-00001`
- Permit numbers: `PM-YYYYMMDD-00001`

### Status Tracking
- Permit requests: `pending`, `under_review`, `approved`, `rejected`, `cancelled`, `expired`
- Permits: `active` with date-based validation

### Constraints
- Unique license plates per state/province
- Foreign key relationships with cascading deletes
- Automatic timestamp updates

### Default Permit Types
- `resident` - Standard residential permit (365 days, 2 vehicles, no approval needed)
- `guest` - Guest permit (7 days, 1 vehicle, no approval needed)
- `temporary` - Temporary permit (30 days, 1 vehicle, approval required)
- `commercial` - Commercial permit (365 days, 1 vehicle, approval required)

## Setup Instructions

### Quick Setup (Recommended)

1. Run the setup script:
   ```bash
   cd parking-app-api/database
   ./setup.sh
   ```

2. This will:
   - Create the D1 database named `parking-permits-db`
   - Execute the complete schema
   - Provide next steps for configuration

### Manual Setup

1. Create the D1 database:
   ```bash
   wrangler d1 create parking-permits-db
   ```

2. Execute the schema:
   ```bash
   wrangler d1 execute parking-permits-db --file=schema.sql
   ```

3. (Optional) Load test data:
   ```bash
   wrangler d1 execute parking-permits-db --file=test-data.sql
   ```

## Wrangler Configuration

Add this to your `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "parking-permits-db"
database_id = "YOUR_DATABASE_ID"
```

## Usage Examples

### Creating a Permit Request

```sql
-- 1. Insert tenant
INSERT INTO tenants (id, email, first_name, last_name, unit_number)
VALUES ('tenant-123', 'john.doe@example.com', 'John', 'Doe', '101');

-- 2. Insert vehicle
INSERT INTO vehicles (id, tenant_id, license_plate, make, model, color, state_province)
VALUES ('vehicle-456', 'tenant-123', 'ABC123', 'Toyota', 'Camry', 'Blue', 'CA');

-- 3. Create permit request
INSERT INTO permit_requests (id, tenant_id, vehicle_id, permit_type_id, requested_start_date, requested_end_date)
VALUES ('request-789', 'tenant-123', 'vehicle-456', 'resident', '2025-01-01', '2025-12-31');
```

### Querying Active Requests

```sql
-- Get all pending requests
SELECT * FROM active_permit_requests WHERE status = 'pending';

-- Get requests for specific tenant
SELECT * FROM active_permit_requests WHERE tenant_email = 'john.doe@example.com';
```

### License Plate Lookup

```sql
-- Find vehicle by license plate
SELECT 
    v.*,
    t.first_name || ' ' || t.last_name as owner_name,
    t.unit_number,
    t.email
FROM vehicles v
JOIN tenants t ON v.tenant_id = t.id
WHERE v.license_plate = 'ABC123' AND v.state_province = 'CA';
```

## API Integration

The TypeScript types in `types.ts` are designed to work with:
- Hono.js API framework
- Cloudflare Workers
- D1 database client

Example API usage:

```typescript
import { CreatePermitRequestInput, PermitRequest } from './database/types';

// Create new permit request
const createPermitRequest = async (input: CreatePermitRequestInput): Promise<PermitRequest> => {
  // Implementation using D1 client
};
```

## Performance Considerations

- Indexed columns: `license_plate`, `tenant_id`, `status`, `email`
- Unique constraints on license plates per state
- Efficient joins through foreign keys
- Automatic timestamp updates via triggers

## Security Notes

- No authentication implemented in schema (handled by application layer)
- All timestamps are UTC
- Soft deletes not implemented (using hard deletes)
- Input validation should be handled at API layer
