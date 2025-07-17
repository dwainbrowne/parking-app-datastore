-- Parking Permit Request Database Schema
-- Focused on core permit request functionality
-- For Cloudflare D1 Database (SQLite)

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Tenants table - Basic tenant information
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    unit_number TEXT NOT NULL,
    building_code TEXT,
    full_address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Vehicles table - Vehicle information for permit requests
CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    license_plate TEXT NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER,
    color TEXT NOT NULL,
    state_province TEXT NOT NULL,
    country TEXT DEFAULT 'US',
    is_primary BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Permit types - Different types of parking permits available
CREATE TABLE IF NOT EXISTS permit_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    duration_days INTEGER NOT NULL,
    max_vehicles_per_tenant INTEGER DEFAULT 1,
    requires_approval BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Permit requests - Central table for all permit requests
CREATE TABLE IF NOT EXISTS permit_requests (
    id TEXT PRIMARY KEY,
    request_number TEXT UNIQUE NOT NULL,
    tenant_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    permit_type_id TEXT NOT NULL,
    requested_start_date DATE NOT NULL,
    requested_end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 1,
    notes TEXT,
    internal_notes TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    reviewed_by TEXT,
    approved_at DATETIME,
    rejected_at DATETIME,
    rejection_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    FOREIGN KEY (permit_type_id) REFERENCES permit_types(id) ON DELETE RESTRICT,
    CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'cancelled', 'expired'))
);

-- Permits table - Approved permits
CREATE TABLE IF NOT EXISTS permits (
    id TEXT PRIMARY KEY,
    permit_number TEXT UNIQUE NOT NULL,
    permit_request_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    permit_type_id TEXT NOT NULL,
    valid_from DATE NOT NULL,
    valid_until DATE NOT NULL,
    qr_code TEXT,
    digital_permit_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,
    revoked_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (permit_request_id) REFERENCES permit_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    FOREIGN KEY (permit_type_id) REFERENCES permit_types(id) ON DELETE RESTRICT
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Tenant indexes
CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);
CREATE INDEX IF NOT EXISTS idx_tenants_unit_number ON tenants(unit_number);
CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(is_active);

-- Vehicle indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_id ON vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_license_plate ON vehicles(license_plate);
CREATE INDEX IF NOT EXISTS idx_vehicles_primary ON vehicles(is_primary);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_license_plate_unique ON vehicles(license_plate, state_province);

-- Permit request indexes
CREATE INDEX IF NOT EXISTS idx_permit_requests_tenant_id ON permit_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_permit_requests_vehicle_id ON permit_requests(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_permit_requests_status ON permit_requests(status);
CREATE INDEX IF NOT EXISTS idx_permit_requests_submitted_at ON permit_requests(submitted_at);
CREATE INDEX IF NOT EXISTS idx_permit_requests_number ON permit_requests(request_number);

-- Permit indexes
CREATE INDEX IF NOT EXISTS idx_permits_tenant_id ON permits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_permits_vehicle_id ON permits(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_permits_active ON permits(is_active);
CREATE INDEX IF NOT EXISTS idx_permits_valid_period ON permits(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_permits_number ON permits(permit_number);

-- Enforcement indexes
CREATE INDEX IF NOT EXISTS idx_enforcement_officers_badge ON enforcement_officers(badge_number);
CREATE INDEX IF NOT EXISTS idx_enforcement_officers_email ON enforcement_officers(email);
CREATE INDEX IF NOT EXISTS idx_enforcement_officers_active ON enforcement_officers(is_active);

CREATE INDEX IF NOT EXISTS idx_violations_license_plate ON violations(license_plate, state_province);
CREATE INDEX IF NOT EXISTS idx_violations_officer_date ON violations(issued_by, DATE(issued_at));
CREATE INDEX IF NOT EXISTS idx_violations_status ON violations(status);
CREATE INDEX IF NOT EXISTS idx_violations_ticket_number ON violations(ticket_number);

CREATE INDEX IF NOT EXISTS idx_warnings_license_plate ON warnings(license_plate, state_province);
CREATE INDEX IF NOT EXISTS idx_warnings_officer_date ON warnings(issued_by, DATE(issued_at));
CREATE INDEX IF NOT EXISTS idx_warnings_warning_number ON warnings(warning_number);

CREATE INDEX IF NOT EXISTS idx_activities_officer_date ON enforcement_activities(officer_id, DATE(performed_at));
CREATE INDEX IF NOT EXISTS idx_activities_license_plate ON enforcement_activities(license_plate, state_province);
CREATE INDEX IF NOT EXISTS idx_activities_type ON enforcement_activities(activity_type);

CREATE INDEX IF NOT EXISTS idx_shift_reports_officer_date ON shift_reports(officer_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_shift_reports_number ON shift_reports(report_number);

CREATE INDEX IF NOT EXISTS idx_offline_actions_sync ON offline_actions(is_synced, officer_id);

-- =====================================================
-- INITIAL DATA - PERMIT TYPES
-- =====================================================

-- Insert default permit types
INSERT OR IGNORE INTO permit_types (id, name, description, duration_days, max_vehicles_per_tenant, requires_approval) VALUES
    ('resident', 'Resident Permit', 'Standard residential parking permit', 365, 2, FALSE),
    ('guest', 'Guest Permit', 'Temporary guest parking permit', 7, 1, FALSE),
    ('temporary', 'Temporary Permit', 'Short-term temporary parking permit', 30, 1, TRUE),
    ('commercial', 'Commercial Permit', 'Commercial vehicle parking permit', 365, 1, TRUE);

-- =====================================================
-- ENFORCEMENT TABLES
-- =====================================================

-- Enforcement Officers table
CREATE TABLE IF NOT EXISTS enforcement_officers (
    id TEXT PRIMARY KEY,
    badge_number TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Violations/Tickets table
CREATE TABLE IF NOT EXISTS violations (
    id TEXT PRIMARY KEY,
    ticket_number TEXT UNIQUE NOT NULL,
    license_plate TEXT NOT NULL,
    state_province TEXT NOT NULL,
    issued_by TEXT NOT NULL, -- enforcement officer ID
    violation_type TEXT NOT NULL,
    violation_reason TEXT NOT NULL,
    location TEXT,
    gps_latitude REAL,
    gps_longitude REAL,
    fine_amount DECIMAL(10,2),
    evidence_photo_urls TEXT, -- JSON array of photo URLs
    notes TEXT,
    status TEXT DEFAULT 'issued', -- issued, paid, disputed, voided
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    voided_at DATETIME,
    voided_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (issued_by) REFERENCES enforcement_officers(id) ON DELETE RESTRICT,
    CHECK (status IN ('issued', 'paid', 'disputed', 'voided'))
);

-- Warnings table
CREATE TABLE IF NOT EXISTS warnings (
    id TEXT PRIMARY KEY,
    warning_number TEXT UNIQUE NOT NULL,
    license_plate TEXT NOT NULL,
    state_province TEXT NOT NULL,
    issued_by TEXT NOT NULL, -- enforcement officer ID
    warning_type TEXT NOT NULL,
    warning_reason TEXT NOT NULL,
    location TEXT,
    gps_latitude REAL,
    gps_longitude REAL,
    notes TEXT,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (issued_by) REFERENCES enforcement_officers(id) ON DELETE RESTRICT
);

-- Enforcement Activity Log table
CREATE TABLE IF NOT EXISTS enforcement_activities (
    id TEXT PRIMARY KEY,
    officer_id TEXT NOT NULL,
    activity_type TEXT NOT NULL, -- scan, ticket, warning, patrol
    license_plate TEXT,
    state_province TEXT,
    location TEXT,
    gps_latitude REAL,
    gps_longitude REAL,
    result TEXT, -- valid, expired, unauthorized, no_permit, etc.
    notes TEXT,
    performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (officer_id) REFERENCES enforcement_officers(id) ON DELETE RESTRICT,
    CHECK (activity_type IN ('scan', 'ticket', 'warning', 'patrol', 'shift_start', 'shift_end'))
);

-- Shift Reports table
CREATE TABLE IF NOT EXISTS shift_reports (
    id TEXT PRIMARY KEY,
    report_number TEXT UNIQUE NOT NULL,
    officer_id TEXT NOT NULL,
    shift_date DATE NOT NULL,
    shift_start_time DATETIME,
    shift_end_time DATETIME,
    total_scans INTEGER DEFAULT 0,
    total_tickets INTEGER DEFAULT 0,
    total_warnings INTEGER DEFAULT 0,
    total_violations_found INTEGER DEFAULT 0,
    patrol_areas TEXT, -- JSON array of areas covered
    incidents TEXT, -- JSON array of incident notes
    summary TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (officer_id) REFERENCES enforcement_officers(id) ON DELETE RESTRICT
);

-- Offline Action Queue table (for sync when back online)
CREATE TABLE IF NOT EXISTS offline_actions (
    id TEXT PRIMARY KEY,
    officer_id TEXT NOT NULL,
    action_type TEXT NOT NULL, -- ticket, warning, scan
    action_data TEXT NOT NULL, -- JSON data for the action
    performed_at DATETIME NOT NULL,
    synced_at DATETIME,
    is_synced BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (officer_id) REFERENCES enforcement_officers(id) ON DELETE RESTRICT
);

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- View for active permit requests with tenant and vehicle info
CREATE VIEW IF NOT EXISTS active_permit_requests AS
SELECT
    pr.id,
    pr.request_number,
    pr.status,
    pr.submitted_at,
    pr.requested_start_date,
    pr.requested_end_date,
    pr.priority,
    pr.notes,
    t.first_name || ' ' || t.last_name as tenant_name,
    t.email as tenant_email,
    t.unit_number,
    v.license_plate,
    v.make,
    v.model,
    v.year,
    v.color,
    v.state_province,
    pt.name as permit_type_name,
    pt.description as permit_type_description
FROM permit_requests pr
JOIN tenants t ON pr.tenant_id = t.id
JOIN vehicles v ON pr.vehicle_id = v.id
JOIN permit_types pt ON pr.permit_type_id = pt.id
WHERE pr.status IN ('pending', 'under_review')
ORDER BY pr.priority DESC, pr.submitted_at ASC;

-- View for active permits
CREATE VIEW IF NOT EXISTS active_permits AS
SELECT
    p.id,
    p.permit_number,
    p.valid_from,
    p.valid_until,
    p.is_active,
    p.issued_at,
    t.first_name || ' ' || t.last_name as tenant_name,
    t.email as tenant_email,
    t.unit_number,
    v.license_plate,
    v.make,
    v.model,
    v.color,
    v.state_province,
    pt.name as permit_type_name
FROM permits p
JOIN tenants t ON p.tenant_id = t.id
JOIN vehicles v ON p.vehicle_id = v.id
JOIN permit_types pt ON p.permit_type_id = pt.id
WHERE p.is_active = TRUE
AND p.valid_until >= DATE('now')
ORDER BY p.valid_until DESC;

-- =====================================================
-- TRIGGERS FOR UPDATED_AT TIMESTAMPS
-- =====================================================

-- Trigger for tenants
CREATE TRIGGER IF NOT EXISTS update_tenants_updated_at
    AFTER UPDATE ON tenants
    FOR EACH ROW
    BEGIN
        UPDATE tenants SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Trigger for vehicles
CREATE TRIGGER IF NOT EXISTS update_vehicles_updated_at
    AFTER UPDATE ON vehicles
    FOR EACH ROW
    BEGIN
        UPDATE vehicles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Trigger for permit_requests
CREATE TRIGGER IF NOT EXISTS update_permit_requests_updated_at
    AFTER UPDATE ON permit_requests
    FOR EACH ROW
    BEGIN
        UPDATE permit_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Trigger for permits
CREATE TRIGGER IF NOT EXISTS update_permits_updated_at
    AFTER UPDATE ON permits
    FOR EACH ROW
    BEGIN
        UPDATE permits SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Enforcement triggers
CREATE TRIGGER IF NOT EXISTS update_enforcement_officers_updated_at
    AFTER UPDATE ON enforcement_officers
    FOR EACH ROW
    BEGIN
        UPDATE enforcement_officers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_violations_updated_at
    AFTER UPDATE ON violations
    FOR EACH ROW
    BEGIN
        UPDATE violations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_warnings_updated_at
    AFTER UPDATE ON warnings
    FOR EACH ROW
    BEGIN
        UPDATE warnings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_shift_reports_updated_at
    AFTER UPDATE ON shift_reports
    FOR EACH ROW
    BEGIN
        UPDATE shift_reports SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- =====================================================
-- TRIGGER FOR AUTO-GENERATING REQUEST NUMBERS
-- =====================================================

CREATE TRIGGER IF NOT EXISTS generate_request_number
    AFTER INSERT ON permit_requests
    FOR EACH ROW
    WHEN NEW.request_number IS NULL
    BEGIN
        UPDATE permit_requests
        SET request_number = 'PR-' || strftime('%Y%m%d', 'now') || '-' || substr('00000' || NEW.rowid, -5, 5)
        WHERE id = NEW.id;
    END;

-- =====================================================
-- TRIGGER FOR AUTO-GENERATING PERMIT NUMBERS
-- =====================================================

CREATE TRIGGER IF NOT EXISTS generate_permit_number
    AFTER INSERT ON permits
    FOR EACH ROW
    WHEN NEW.permit_number IS NULL
    BEGIN
        UPDATE permits
        SET permit_number = 'PM-' || strftime('%Y%m%d', 'now') || '-' || substr('00000' || NEW.rowid, -5, 5)
        WHERE id = NEW.id;
    END;

-- =====================================================
-- TRIGGERS FOR AUTO-GENERATING ENFORCEMENT NUMBERS
-- =====================================================

CREATE TRIGGER IF NOT EXISTS generate_ticket_number
    AFTER INSERT ON violations
    FOR EACH ROW
    WHEN NEW.ticket_number IS NULL
    BEGIN
        UPDATE violations
        SET ticket_number = 'TK-' || strftime('%Y%m%d', 'now') || '-' || substr('00000' || NEW.rowid, -5, 5)
        WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS generate_warning_number
    AFTER INSERT ON warnings
    FOR EACH ROW
    WHEN NEW.warning_number IS NULL
    BEGIN
        UPDATE warnings
        SET warning_number = 'WN-' || strftime('%Y%m%d', 'now') || '-' || substr('00000' || NEW.rowid, -5, 5)
        WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS generate_shift_report_number
    AFTER INSERT ON shift_reports
    FOR EACH ROW
    WHEN NEW.report_number IS NULL
    BEGIN
        UPDATE shift_reports
        SET report_number = 'SR-' || strftime('%Y%m%d', 'now') || '-' || substr('00000' || NEW.rowid, -5, 5)
        WHERE id = NEW.id;
    END;
