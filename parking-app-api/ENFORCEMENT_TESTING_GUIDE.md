# Parking Enforcement API - Testing Guide

## Quick Start

### 1. Start the Development Server
```bash
cd parking-app-api
wrangler dev
```

### 2. Validate Server is Ready
```bash
./validate-enforcement-api.sh
```

### 3. Run Comprehensive Tests
```bash
node test-enforcement-complete.js
```

## Manual Testing Options

### Option 1: Using VS Code REST Client
1. Install the "REST Client" extension in VS Code
2. Open `test-enforcement-api.http`
3. Click "Send Request" above any endpoint to test it
4. View responses inline in VS Code

### Option 2: Using curl Commands
```bash
# Health check
curl http://localhost:8787/health

# License plate lookup (enforcement)
curl "http://localhost:8787/api/enforcement/license-plates/ABC123?state=CA&officer_id=officer-001"

# Issue a ticket
curl -X POST http://localhost:8787/api/enforcement/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "license_plate": "TEST123",
    "state_province": "CA",
    "issued_by": "officer-001",
    "violation_type": "No Permit",
    "violation_reason": "Vehicle parked without valid permit",
    "location": "Test Area"
  }'
```

## Test Scenarios Covered

### ✅ Core Enforcement Functions
- **License Plate Lookup**: Enhanced lookup with enforcement context
- **Ticket Management**: Issue, view, void tickets with duplicate prevention
- **Warning System**: Issue and track parking warnings
- **Activity Logging**: Track all enforcement actions (scans, patrols, etc.)
- **Shift Management**: Start/end shifts with detailed reporting

### ✅ Advanced Features
- **Offline Sync**: Queue actions when offline, sync when online
- **Business Logic**: Grace periods, repeat offender detection, duplicate prevention
- **GPS Validation**: Location tracking and validation
- **Evidence Management**: Photo URLs and documentation

### ✅ Error Handling
- **Input Validation**: License plate format, GPS coordinates, required fields
- **Business Rules**: Duplicate tickets, invalid officers, data constraints
- **Network Issues**: Graceful handling of connection problems

### ✅ Integration Workflows
- **Complete Enforcement Cycle**: Start shift → Scan → Issue ticket → Log patrol → End shift
- **Multi-step Validation**: Ensure data consistency across related operations

## Key Test Data

### Pre-loaded Test Data (from test-data.sql)
- **Officers**: `officer-001`, `officer-002` with badge numbers `ENF001`, `ENF002`
- **Test Vehicles**: `ABC123`, `XYZ789` (valid permits), `REPEAT99` (repeat offender)
- **Violation Types**: No Permit, Expired Permit, Unauthorized Area, etc.

### Test License Plates to Try
- `ABC123` - Valid permit (should return registered with permit info)
- `XYZ789` - Valid permit (different user)
- `REPEAT99` - Repeat offender (3+ violations, should trigger alerts)
- `UNKNOWN99` - Unregistered vehicle
- `TESTPLATE` - Use for new ticket tests

## Expected Results

### Successful License Plate Lookup Response
```json
{
  "license_plate": "ABC123",
  "state_province": "CA",
  "is_registered": true,
  "permit_status": "valid",
  "permit_type": "resident",
  "unit_number": "101",
  "owner_info": {
    "name": "John Doe",
    "phone": "555-0101",
    "email": "john.doe@example.com"
  },
  "enforcement_context": {
    "scanned_by": "officer-001",
    "scan_timestamp": "2025-01-17T...",
    "is_repeat_offender": false,
    "violation_count": 0,
    "recent_violations": [],
    "grace_period_status": "none"
  }
}
```

### Successful Ticket Issuance Response
```json
{
  "id": "violation-...",
  "ticket_number": "TK-20250117-00001",
  "license_plate": "TEST123",
  "state_province": "CA",
  "status": "issued",
  "fine_amount": 75.00,
  "created_at": "2025-01-17T..."
}
```

## Troubleshooting

### Common Issues

1. **Server Not Running**
   ```
   Error: fetch failed (connection refused)
   ```
   **Solution**: Start the server with `wrangler dev`

2. **Database Not Connected**
   ```
   Error: D1_ERROR: no such table
   ```
   **Solution**: Run database setup scripts in `database/` folder

3. **Invalid Officer ID**
   ```
   Error: Officer not found
   ```
   **Solution**: Use `officer-001` or create officers via API first

4. **Duplicate Ticket Prevention**
   ```
   Error: Duplicate ticket detected
   ```
   **Solution**: This is expected behavior. Use different license plate or wait 1+ hour

## Monitoring During Tests

### View Real-time Logs
```bash
wrangler tail
```

### Check Database State
```bash
# View recent tickets
wrangler d1 execute parking-permits-db --command "SELECT * FROM violations ORDER BY created_at DESC LIMIT 5;"

# View officer activities
wrangler d1 execute parking-permits-db --command "SELECT * FROM enforcement_activities ORDER BY timestamp DESC LIMIT 10;"
```

## Performance Benchmarks

### Expected Response Times
- License plate lookup: < 500ms
- Ticket issuance: < 1s
- Activity logging: < 300ms
- Shift operations: < 800ms

### Load Testing
For load testing, use the generated test scripts with multiple concurrent requests:
```bash
# Run multiple test instances
for i in {1..5}; do
  node test-enforcement-complete.js &
done
wait
```

## Security Validation

### Test Input Sanitization
- SQL injection attempts in license plates
- XSS attempts in notes/descriptions
- Malformed GPS coordinates
- Oversized payload handling

### Rate Limiting Tests
- Rapid successive requests to same endpoint
- Large batch operations
- Concurrent officer operations

## Next Steps After Testing

1. **Production Deployment**: Use `wrangler deploy` when tests pass
2. **Frontend Integration**: Connect mobile app to tested endpoints
3. **Performance Optimization**: Based on test results and monitoring data
4. **Security Hardening**: Implement authentication and authorization layers
