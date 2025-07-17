# Parking Enforcement App - Backend API - Copilot Instructions

## Project Overview
Backend API implementation for a parking enforcement application using Cloudflare Workers and D1 database. This backend will serve both tenants/property owners and parking enforcement personnel through REST API endpoints.

## Architecture Requirements
- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2 for images/documents
- **API Framework**: Hono.js (recommended for Cloudflare Workers)
- **Language**: TypeScript
- **Authentication**: NOT IMPLEMENTED (to be handled by separate frontend application)

## User Types and API Contexts
1. **Tenant/Property Owner APIs** - Vehicle management, reservations, permits, violations
2. **Parking Enforcement APIs** - License plate lookup, ticket issuance, activity logging

## Backend Data Requirements

### Database Schema Design
The backend must support the following core entities and relationships:

#### Core Tables
- **users** - Basic user information (id, email, phone, role, unit_number)
- **vehicles** - Vehicle registration data
- **reservations** - Guest parking reservations
- **permits** - Residential parking permits
- **tickets** - Parking violation tickets
- **violations** - Violation types and rules
- **enforcement_logs** - Activity tracking for enforcement actions
- **messages** - Communication/announcements system

## Backend API Requirements

### Core API Functionality Context
The backend APIs must support the following user workflows (frontend context for API design):

#### Tenant/Property Owner Workflows
1. **Vehicle Management** - Register/update/remove vehicles
2. **Guest Parking** - Create/manage guest reservations with time slots
3. **Permit Management** - View/download digital permits
4. **Violation Tracking** - View tickets/violations tied to their vehicles
5. **Communication** - Receive announcements and parking notifications

#### Enforcement Personnel Workflows
1. **License Plate Validation** - Real-time lookup of plate registration status
2. **Ticket Issuance** - Create violation tickets with evidence
3. **Activity Logging** - Track all enforcement actions
4. **Shift Management** - Log shift activities and reports

### API Architecture Requirements
- RESTful API design with proper HTTP methods
- JSON request/response format
- Error handling with appropriate HTTP status codes
- Request validation and sanitization
- Rate limiting and security headers
- Comprehensive logging for audit trails

## Data Structure Requirements

### Core Interfaces
```typescript
interface User {
  id: string
  email: string
  phone: string
  role: 'tenant' | 'owner' | 'enforcement'
  unitNumber?: string
  createdAt: Date
  updatedAt: Date
}

interface Vehicle {
  id: string
  userId: string
  licensePlate: string
  make: string
  model: string
  color: string
  isPrimary: boolean
  createdAt: Date
  updatedAt: Date
}

interface GuestReservation {
  id: string
  userId: string
  guestName: string
  guestPhone?: string
  licensePlate: string
  vehicleMake: string
  vehicleModel: string
  vehicleColor: string
  reservationStart: Date
  reservationEnd: Date
  status: 'pending' | 'approved' | 'denied' | 'expired'
  createdAt: Date
  updatedAt: Date
}

interface Permit {
  id: string
  userId: string
  type: 'resident' | 'guest' | 'temporary'
  licensePlate: string
  validFrom: Date
  validUntil: Date
  isActive: boolean
  qrCode: string
  createdAt: Date
  updatedAt: Date
}

interface Ticket {
  id: string
  ticketNumber: string
  licensePlate: string
  violationType: string
  description: string
  location: string
  issuedBy: string
  issuedAt: Date
  evidenceUrls: string[]
  amount: number
  status: 'issued' | 'paid' | 'appealed' | 'dismissed'
  createdAt: Date
  updatedAt: Date
}

interface ViolationType {
  id: string
  code: string
  name: string
  description: string
  fineAmount: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

interface EnforcementLog {
  id: string
  officerId: string
  action: 'scan' | 'ticket' | 'warning' | 'patrol'
  licensePlate?: string
  location: string
  notes?: string
  timestamp: Date
  createdAt: Date
}

interface PlateLookupResult {
  licensePlate: string
  isRegistered: boolean
  permitType: 'resident' | 'guest' | null
  unitNumber: string | null
  ownerInfo?: {
    name: string
    phone: string
    email: string
  }
  activeReservation?: {
    guestName: string
    validFrom: Date
    validUntil: Date
  }
  violations: Ticket[]
  lastScannedAt?: Date
}
```

## API Endpoints Requirements

### Tenant/Owner API Endpoints
- `GET /api/users/{userId}/vehicles` - List user's registered vehicles
- `POST /api/users/{userId}/vehicles` - Add new vehicle
- `PUT /api/users/{userId}/vehicles/{vehicleId}` - Update vehicle details
- `DELETE /api/users/{userId}/vehicles/{vehicleId}` - Remove vehicle
- `POST /api/users/{userId}/reservations` - Create guest reservation
- `GET /api/users/{userId}/reservations` - Get user's reservations with filters
- `PUT /api/users/{userId}/reservations/{reservationId}` - Update reservation
- `DELETE /api/users/{userId}/reservations/{reservationId}` - Cancel reservation
- `GET /api/users/{userId}/permits` - Get user's permits
- `GET /api/users/{userId}/permits/{permitId}/download` - Download permit file
- `GET /api/users/{userId}/tickets` - Get user's violation tickets
- `GET /api/users/{userId}/messages` - Get user's messages/announcements

### Enforcement API Endpoints
- `POST /api/enforcement/scan` - Validate license plate status
- `POST /api/enforcement/tickets` - Issue a parking ticket
- `POST /api/enforcement/warnings` - Issue a warning
- `GET /api/enforcement/tickets` - Get enforcement history
- `GET /api/enforcement/logs` - Get enforcement activity logs
- `POST /api/enforcement/logs` - Log enforcement activity
- `POST /api/enforcement/shift-reports` - Submit shift report

### Common API Endpoints
- `GET /api/violations` - Get violation types and rules
- `POST /api/files/upload` - Upload images/documents to R2
- `GET /api/health` - Health check endpoint

## Database Schema Requirements

### Primary Tables
1. **users** - User accounts (tenants, owners, enforcement staff)
2. **vehicles** - Registered vehicles linked to users
3. **reservations** - Guest parking reservations
4. **permits** - Parking permits for residents
5. **tickets** - Violation tickets issued
6. **violation_types** - Violation categories and rules
7. **enforcement_logs** - Activity tracking
8. **messages** - Communication/announcements

### Relationships
- Users can have multiple vehicles (1:n)
- Users can have multiple reservations (1:n)
- Users can have multiple permits (1:n)
- Tickets are linked to license plates (not directly to users)
- Enforcement logs track all officer activities

## API Security Requirements
- Input validation and sanitization
- Rate limiting per endpoint
- Request/response logging
- Error handling with appropriate HTTP status codes
- CORS configuration
- Security headers (HSTS, CSP, etc.)

## Business Logic Requirements
- Prevent duplicate reservations for same time slot
- Enforce monthly reservation limits per user
- Auto-expire reservations after end time
- Grace period handling (5-minute buffer)
- Duplicate ticket prevention (same plate, same hour)
- Repeat offender tracking

## Performance Requirements
- Database query optimization
- Proper indexing strategy
- Efficient license plate lookups (<2 seconds)
- Pagination for large datasets
- Connection pooling and caching where appropriate

## Business Rules & Edge Cases
- Block duplicate license plates within same time slot
- Enforce max guest vehicle reservations per unit/month
- Auto-expire permits or reservations after set time
- Grace period handling (5-min before/after reservation)
- Duplicate ticket prevention (same hour)
- Repeat offender tracking (3+ infractions in 30 days)

## Auditing & Logging Requirements
- Log every parking reservation for audit
- Track guest vehicle entries per month
- All enforcement actions logged
- Violation history tracking
- Monthly reporting capabilities

## Performance Requirements
- Fast license plate lookup (<2 seconds)
- Efficient offline mode with sync
- Optimized image handling
- Mobile-responsive performance

## Task List
📋 **Task Progress**: [View Task List](./TASK_LIST.md)

## Development Guidelines
- Use TypeScript for type safety
- Follow RESTful API design principles
- Implement proper error handling and logging
- Use Hono.js framework for Cloudflare Workers
- Follow Cloudflare Workers best practices
- Implement comprehensive input validation
- Use environment variables for configuration
- Follow database migration best practices
- Implement proper testing strategies

## Testing Requirements
- Unit tests for all API endpoints
- Integration tests for database operations
- API endpoint validation testing
- Database schema testing
- Performance testing for high-traffic scenarios
- Mock data generation for testing

## Deployment Requirements
- Cloudflare Workers for API hosting
- Cloudflare D1 for database
- Cloudflare R2 for file storage
- Environment-based configuration
- Database migration scripts
- Monitoring and logging setup

## ⚠️ IMPORTANT: Wrangler Development Setup
**Critical Issue Resolution**: When running `wrangler dev`, if you encounter "Missing entry-point to Worker script" errors, use the following command from the `parking-app-api` directory:

```bash
wrangler dev --config /Users/dwainbrowne/Documents/_PROJECTS/ai-projects/parking-app-datastore/parking-app-api/wrangler.json
```

**Root Cause**: Wrangler sometimes fails to locate configuration files when running from certain working directories or with specific terminal sessions. Using the absolute path to the config file resolves this issue.

**Alternative Solutions**:
1. Use absolute path to config file (recommended)
2. Ensure you're in the correct project directory
3. Remove duplicate config files (keep only `wrangler.json`, not `wrangler.jsonc`)
4. Upgrade to latest Wrangler version: `npm update wrangler`

**Expected Success Output**:
```
✅ Your Worker has access to the following bindings:
   env.DB (parking-permits-db)      D1 Database      local
✅ Ready on http://localhost:8787
```
