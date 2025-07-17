# Centralized Permit Request API

This document describes the centralized permit request API endpoint that handles the complete workflow from the permit request form shown in the UI mockup.

## Overview

The centralized API endpoint `/api/submit-permit-request` handles the complete permit request process in a single API call:

1. **Creates or updates tenant** - Handles user information
2. **Creates or updates vehicle** - Handles vehicle registration
3. **Creates permit request** - Handles the actual permit request
4. **Auto-approves guest permits** - Automatically creates permits for guest requests

## API Endpoint

### POST `/api/submit-permit-request`

Creates a complete permit request with tenant, vehicle, and permit information.

#### Request Body

```json
{
  // Tenant Information (Required)
  "first_name": "John",
  "last_name": "Doe",
  "email": "john.doe@email.com",
  "phone": "555-123-4567",                    // Optional
  "unit_number": "101",                       // Optional (defaults to empty)
  "building_code": "A",                       // Optional
  "full_address": "123 Main St, Apt 101, Anytown, CA 90210", // Optional

  // Vehicle Information (Required)
  "license_plate": "ABC123",
  "make": "Toyota",
  "model": "Camry",
  "year": 2020,                               // Optional
  "color": "Blue",
  "state_province": "CA",
  "country": "US",                            // Optional (defaults to 'US')

  // Permit Request Information (Optional)
  "permit_type_id": "guest",                  // Optional (defaults to 'guest')
  "requested_start_date": "2025-07-18",      // Optional (defaults to today)
  "requested_end_date": "2025-07-19",        // Optional (defaults to today + 24 hours)
  "notes": "Guest visiting for the weekend",  // Optional
  "priority": 1                               // Optional (defaults to 1)
}
```

#### Required Fields

- `first_name`
- `last_name`
- `email`
- `license_plate`
- `make`
- `model`
- `color`
- `state_province`

#### Response

```json
{
  "success": true,
  "data": {
    "permit_request": {
      "id": "uuid",
      "request_number": "PR-20250718-00001",
      "tenant_id": "uuid",
      "vehicle_id": "uuid",
      "permit_type_id": "guest",
      "status": "approved",
      "tenant_name": "John Doe",
      "tenant_email": "john.doe@email.com",
      "unit_number": "101",
      "full_address": "123 Main St, Apt 101, Anytown, CA 90210",
      "license_plate": "ABC123",
      "make": "Toyota",
      "model": "Camry",
      "color": "Blue",
      "permit_type_name": "Guest Permit",
      "permit_number": "PM-20250718-00001",
      "valid_from": "2025-07-18",
      "valid_until": "2025-07-19",
      "permit_is_active": true
    },
    "tenant_id": "uuid",
    "vehicle_id": "uuid",
    "permit_request_id": "uuid",
    "auto_approved": true
  },
  "message": "Guest permit request submitted and automatically approved!"
}
```

## Business Logic

### Tenant Handling
- **Existing Tenant**: If email exists, updates tenant information if provided
- **New Tenant**: Creates new tenant with provided information

### Vehicle Handling
- **Existing Vehicle**: If license plate + state + tenant combination exists, updates vehicle info
- **New Vehicle**: Creates new vehicle registration

### Permit Request Handling
- **Guest Permits**: Automatically approved and permit created immediately
- **Other Permits**: Requires manual approval (stays in 'pending' status)

### Auto-Approval Rules
- Guest permits (`permit_type_id: "guest"`) are automatically approved
- Other permit types require manual review and approval

## Available Permit Types

| ID | Name | Duration | Auto-Approve |
|---|---|---|---|
| `guest` | Guest Permit | 7 days | Yes |
| `resident` | Resident Permit | 365 days | No |
| `temporary` | Temporary Permit | 30 days | No |
| `commercial` | Commercial Permit | 365 days | No |

## Error Handling

The API returns appropriate HTTP status codes and error messages:

- **400 Bad Request**: Missing required fields, invalid data format
- **404 Not Found**: Invalid permit type
- **409 Conflict**: Duplicate email or license plate
- **500 Internal Server Error**: Database or server errors

### Example Error Response

```json
{
  "success": false,
  "error": "Invalid email format"
}
```

## Testing

### HTTP File
Use `test-centralized-api.http` to test the API endpoints interactively.

### Test Script
Run the automated test script:
```bash
node test-centralized-api.js
```

### Database Setup
1. Run the database schema: `npm run db:setup`
2. (Optional) Add address field to existing database: Run `database/add-address-field.sql`

## Integration Notes

### Form Integration
The API is designed to work directly with the permit request form from the UI mockup:

1. **Form Fields Map Directly**: All form fields map to API parameters
2. **Validation**: Server-side validation matches form requirements
3. **Success Response**: Provides all necessary data for confirmation display
4. **Error Handling**: Returns user-friendly error messages

### Database Schema
The API automatically handles:
- Tenant creation/updates
- Vehicle registration
- Permit request creation
- Auto-generated request/permit numbers
- Timestamps and audit fields

### Related Endpoints
- `GET /api/permit-types` - Get available permit types
- `GET /api/license-plates/{plate}` - License plate lookup
- `GET /api/tenants/{id}/permit-requests` - Get tenant's requests
- `GET /api/permit-requests` - Admin view of all requests

## Example Usage

### Basic Guest Permit Request
```bash
curl -X POST http://localhost:8787/api/submit-permit-request \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@email.com",
    "license_plate": "ABC123",
    "make": "Toyota",
    "model": "Camry",
    "color": "Blue",
    "state_province": "CA"
  }'
```

### Complete Form Data
```bash
curl -X POST http://localhost:8787/api/submit-permit-request \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@email.com",
    "phone": "555-123-4567",
    "unit_number": "101",
    "full_address": "123 Main Street, Apt 101, Anytown, CA 90210",
    "license_plate": "ABC123",
    "make": "Toyota",
    "model": "Camry",
    "year": 2020,
    "color": "Blue",
    "state_province": "CA",
    "permit_type_id": "guest",
    "notes": "Guest visiting for the weekend"
  }'
```

This centralized approach simplifies frontend integration while maintaining data integrity and business logic on the backend.
