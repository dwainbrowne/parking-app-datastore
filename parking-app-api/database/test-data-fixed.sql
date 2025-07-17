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

-- Test permit requests (with request_number field)
INSERT INTO permit_requests (id, request_number, tenant_id, vehicle_id, permit_type_id, requested_start_date, requested_end_date, notes, priority) VALUES
('request-001', 'PR-20250101-00001', 'tenant-001', 'vehicle-001', 'resident', '2025-01-01', '2025-12-31', 'Primary vehicle for unit 101', 1),
('request-002', 'PR-20250101-00002', 'tenant-001', 'vehicle-002', 'resident', '2025-01-01', '2025-12-31', 'Secondary vehicle for unit 101', 2),
('request-003', 'PR-20250101-00003', 'tenant-002', 'vehicle-003', 'resident', '2025-01-01', '2025-12-31', 'Primary vehicle for unit 202', 1),
('request-004', 'PR-20250115-00004', 'tenant-003', 'vehicle-004', 'guest', '2025-01-15', '2025-01-22', 'Guest vehicle for one week', 1);

-- Test approved permits for some requests
INSERT INTO permits (id, permit_number, permit_request_id, tenant_id, vehicle_id, permit_type_id, valid_from, valid_until, is_active) VALUES
('permit-001', 'PM-20250101-00001', 'request-001', 'tenant-001', 'vehicle-001', 'resident', '2025-01-01', '2025-12-31', true),
('permit-002', 'PM-20250115-00002', 'request-004', 'tenant-003', 'vehicle-004', 'guest', '2025-01-15', '2025-01-22', true);

-- Update permit requests to approved status for those with permits
UPDATE permit_requests SET status = 'approved', approved_at = CURRENT_TIMESTAMP WHERE id IN ('request-001', 'request-004');
