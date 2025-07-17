-- Test data for validating the parking permit request schema
-- This file contains sample data to verify the database structure

-- Test tenants
INSERT INTO tenants (id, email, first_name, last_name, unit_number, phone, building_code, full_address) VALUES
('tenant-001', 'john.doe@example.com', 'John', 'Doe', '101', '555-0101', 'A', '123 Main Street, Apt 101, Anytown, CA 90210'),
('tenant-002', 'jane.smith@example.com', 'Jane', 'Smith', '202', '555-0202', 'B', '456 Oak Avenue, Unit 202, Anytown, CA 90210'),
('tenant-003', 'bob.wilson@example.com', 'Bob', 'Wilson', '303', '555-0303', 'C', '789 Pine Street, Unit 303, Anytown, CA 90210');

-- Test vehicles
INSERT INTO vehicles (id, tenant_id, license_plate, make, model, year, color, state_province, is_primary) VALUES
('vehicle-001', 'tenant-001', 'ABC123', 'Toyota', 'Camry', 2020, 'Blue', 'CA', true),
('vehicle-002', 'tenant-001', 'XYZ789', 'Honda', 'Civic', 2021, 'Red', 'CA', false),
('vehicle-003', 'tenant-002', 'DEF456', 'Ford', 'Focus', 2019, 'White', 'CA', true),
('vehicle-004', 'tenant-003', 'GHI789', 'Chevrolet', 'Cruze', 2022, 'Black', 'CA', true);

-- Test permit requests
INSERT INTO permit_requests (id, tenant_id, vehicle_id, permit_type_id, requested_start_date, requested_end_date, notes, priority) VALUES
('request-001', 'tenant-001', 'vehicle-001', 'resident', '2025-01-01', '2025-12-31', 'Primary vehicle for unit 101', 1),
('request-002', 'tenant-001', 'vehicle-002', 'resident', '2025-01-01', '2025-12-31', 'Secondary vehicle for unit 101', 2),
('request-003', 'tenant-002', 'vehicle-003', 'resident', '2025-01-01', '2025-12-31', 'Primary vehicle for unit 202', 1),
('request-004', 'tenant-003', 'vehicle-004', 'guest', '2025-01-15', '2025-01-22', 'Guest vehicle for one week', 1);

-- Test enforcement officers
INSERT INTO enforcement_officers (id, badge_number, first_name, last_name, email, phone) VALUES
('officer-001', 'PEO001', 'Mike', 'Johnson', 'mike.johnson@enforcement.gov', '555-1001'),
('officer-002', 'PEO002', 'Sarah', 'Davis', 'sarah.davis@enforcement.gov', '555-1002'),
('officer-003', 'PEO003', 'Tom', 'Brown', 'tom.brown@enforcement.gov', '555-1003');

-- Test violations/tickets
INSERT INTO violations (id, license_plate, state_province, issued_by, violation_type, violation_reason, location, fine_amount, status) VALUES
('violation-001', 'UNKNOWN1', 'CA', 'officer-001', 'No Permit', 'Vehicle parked without valid permit', 'Main Street Parking Area', 75.00, 'issued'),
('violation-002', 'DEF456', 'CA', 'officer-002', 'Expired Permit', 'Vehicle permit expired 3 days ago', 'Building B Parking', 50.00, 'issued'),
('violation-003', 'REPEAT99', 'CA', 'officer-001', 'No Permit', 'Repeat offender - 4th violation this month', 'Visitor Parking Area', 150.00, 'issued');

-- Test warnings
INSERT INTO warnings (id, license_plate, state_province, issued_by, warning_type, warning_reason, location, notes) VALUES
('warning-001', 'XYZ789', 'CA', 'officer-003', 'Permit Display', 'Permit not clearly visible on dashboard', 'Building A Parking', 'Permit was in glove compartment'),
('warning-002', 'GHI789', 'CA', 'officer-002', 'Time Violation', 'Parked 10 minutes past guest permit expiration', 'Visitor Area', 'Guest informed of time limit');

-- Test enforcement activities
INSERT INTO enforcement_activities (id, officer_id, activity_type, license_plate, state_province, location, result) VALUES
('activity-001', 'officer-001', 'scan', 'ABC123', 'CA', 'Building A Parking', 'valid'),
('activity-002', 'officer-001', 'scan', 'DEF456', 'CA', 'Building B Parking', 'expired'),
('activity-003', 'officer-002', 'ticket', 'DEF456', 'CA', 'Building B Parking', 'violation_issued'),
('activity-004', 'officer-003', 'patrol', NULL, NULL, 'Main Street Area', 'patrol_completed'),
('activity-005', 'officer-001', 'scan', 'UNKNOWN1', 'CA', 'Main Street Parking', 'no_permit'),
('activity-006', 'officer-001', 'ticket', 'UNKNOWN1', 'CA', 'Main Street Parking', 'violation_issued');

-- Test shift reports
INSERT INTO shift_reports (id, officer_id, shift_date, shift_start_time, shift_end_time, total_scans, total_tickets, total_warnings, total_violations_found, summary) VALUES
('shift-001', 'officer-001', '2025-01-17', '2025-01-17 08:00:00', '2025-01-17 16:00:00', 25, 3, 1, 4, 'Routine patrol shift. Found multiple violations in main parking area.'),
('shift-002', 'officer-002', '2025-01-17', '2025-01-17 16:00:00', '2025-01-18 00:00:00', 18, 1, 2, 3, 'Evening shift. Mostly warnings issued for minor infractions.');

-- Test queries to validate the schema

-- Query 1: Get all pending permit requests with tenant and vehicle info
SELECT
    pr.request_number,
    pr.status,
    pr.submitted_at,
    pr.requested_start_date,
    pr.requested_end_date,
    (t.first_name || ' ' || t.last_name) as tenant_name,
    t.unit_number,
    v.license_plate,
    (v.make || ' ' || v.model || ' (' || CAST(v.year AS TEXT) || ')') as vehicle_info,
    v.color,
    pt.name as permit_type
FROM permit_requests pr
JOIN tenants t ON pr.tenant_id = t.id
JOIN vehicles v ON pr.vehicle_id = v.id
JOIN permit_types pt ON pr.permit_type_id = pt.id
WHERE pr.status = 'pending'
ORDER BY pr.priority, pr.submitted_at;

-- Query 2: Get tenant vehicle summary
SELECT
    (t.first_name || ' ' || t.last_name) as tenant_name,
    t.unit_number,
    t.email,
    COUNT(v.id) as vehicle_count,
    GROUP_CONCAT(v.license_plate, ', ') as license_plates
FROM tenants t
LEFT JOIN vehicles v ON t.id = v.tenant_id
GROUP BY t.id, t.first_name, t.last_name, t.unit_number, t.email
ORDER BY t.unit_number;

-- Query 3: License plate lookup
SELECT
    v.license_plate,
    v.state_province,
    (v.make || ' ' || v.model || ' (' || CAST(v.year AS TEXT) || ')') as vehicle_info,
    v.color,
    (t.first_name || ' ' || t.last_name) as owner_name,
    t.unit_number,
    t.email,
    t.phone,
    CASE WHEN v.is_primary = 1 THEN 'Primary' ELSE 'Secondary' END as vehicle_type
FROM vehicles v
JOIN tenants t ON v.tenant_id = t.id
WHERE v.license_plate = 'ABC123' AND v.state_province = 'CA';

-- Query 4: Permit type summary
SELECT
    pt.name,
    pt.description,
    pt.duration_days,
    pt.max_vehicles_per_tenant,
    pt.requires_approval,
    COUNT(pr.id) as pending_requests
FROM permit_types pt
LEFT JOIN permit_requests pr ON pt.id = pr.permit_type_id AND pr.status = 'pending'
WHERE pt.is_active = true
GROUP BY pt.id, pt.name, pt.description, pt.duration_days, pt.max_vehicles_per_tenant, pt.requires_approval
ORDER BY pt.name;

-- =====================================================
-- ENFORCEMENT VALIDATION QUERIES
-- =====================================================

-- Query 5: Enforcement license plate lookup with violation history
SELECT
    v.license_plate,
    v.state_province,
    (v.make || ' ' || v.model || ' (' || CAST(v.year AS TEXT) || ')') as vehicle_info,
    v.color,
    (t.first_name || ' ' || t.last_name) as owner_name,
    t.unit_number,
    COUNT(viol.id) as violation_count_30_days,
    COUNT(warn.id) as warning_count_30_days,
    MAX(viol.issued_at) as last_violation_date
FROM vehicles v
JOIN tenants t ON v.tenant_id = t.id
LEFT JOIN violations viol ON v.license_plate = viol.license_plate
    AND v.state_province = viol.state_province
    AND viol.issued_at >= DATE('now', '-30 days')
    AND viol.status != 'voided'
LEFT JOIN warnings warn ON v.license_plate = warn.license_plate
    AND v.state_province = warn.state_province
    AND warn.issued_at >= DATE('now', '-30 days')
WHERE v.license_plate = 'DEF456' AND v.state_province = 'CA'
GROUP BY v.id, v.license_plate, v.state_province, v.make, v.model, v.year, v.color, t.first_name, t.last_name, t.unit_number;

-- Query 6: Officer activity summary for today
SELECT
    eo.badge_number,
    (eo.first_name || ' ' || eo.last_name) as officer_name,
    COUNT(CASE WHEN ea.activity_type = 'scan' THEN 1 END) as total_scans,
    COUNT(CASE WHEN ea.activity_type = 'ticket' THEN 1 END) as total_tickets,
    COUNT(CASE WHEN ea.activity_type = 'warning' THEN 1 END) as total_warnings,
    COUNT(CASE WHEN ea.activity_type = 'patrol' THEN 1 END) as total_patrols,
    COUNT(*) as total_activities
FROM enforcement_officers eo
LEFT JOIN enforcement_activities ea ON eo.id = ea.officer_id
    AND DATE(ea.performed_at) = DATE('now')
WHERE eo.is_active = TRUE
GROUP BY eo.id, eo.badge_number, eo.first_name, eo.last_name
ORDER BY total_activities DESC;

-- Query 7: Recent violations with officer details
SELECT
    v.ticket_number,
    v.license_plate,
    v.violation_type,
    v.violation_reason,
    v.fine_amount,
    v.status,
    v.issued_at,
    (eo.first_name || ' ' || eo.last_name) as issued_by_officer,
    eo.badge_number,
    v.location
FROM violations v
JOIN enforcement_officers eo ON v.issued_by = eo.id
WHERE v.issued_at >= DATE('now', '-7 days')
ORDER BY v.issued_at DESC;

-- Query 8: Repeat offenders (3+ violations in 30 days)
SELECT
    v.license_plate,
    v.state_province,
    COUNT(*) as violation_count,
    GROUP_CONCAT(v.violation_type, ', ') as violation_types,
    MIN(v.issued_at) as first_violation,
    MAX(v.issued_at) as last_violation,
    SUM(v.fine_amount) as total_fines
FROM violations v
WHERE v.issued_at >= DATE('now', '-30 days')
    AND v.status != 'voided'
GROUP BY v.license_plate, v.state_province
HAVING COUNT(*) >= 3
ORDER BY violation_count DESC, last_violation DESC;

-- Query 9: Active shift summary
SELECT
    sr.report_number,
    (eo.first_name || ' ' || eo.last_name) as officer_name,
    eo.badge_number,
    sr.shift_date,
    sr.shift_start_time,
    sr.shift_end_time,
    CASE
        WHEN sr.shift_end_time IS NULL THEN 'Active'
        ELSE 'Completed'
    END as shift_status,
    sr.total_scans,
    sr.total_tickets,
    sr.total_warnings,
    sr.total_violations_found
FROM shift_reports sr
JOIN enforcement_officers eo ON sr.officer_id = eo.id
WHERE sr.shift_date = DATE('now')
ORDER BY sr.shift_start_time DESC;
