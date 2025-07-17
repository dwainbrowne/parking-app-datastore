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
