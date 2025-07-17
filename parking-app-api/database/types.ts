/**
 * Database Schema Types for Parking Permit Requests
 * Focused on core permit request functionality
 */

export interface Tenant {
  id: string;
  email: string;
  phone?: string;
  first_name: string;
  last_name: string;
  unit_number: string;
  building_code?: string;
	full_address?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Vehicle {
  id: string;
  tenant_id: string;
  license_plate: string;
  make: string;
  model: string;
  year?: number;
  color: string;
  state_province: string;
  country: string;
  is_primary: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PermitType {
  id: string;
  name: string;
  description?: string;
  duration_days: number;
  max_vehicles_per_tenant: number;
  requires_approval: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export type PermitRequestStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export interface PermitRequest {
  id: string;
  request_number: string;
  tenant_id: string;
  vehicle_id: string;
  permit_type_id: string;
  requested_start_date: Date;
  requested_end_date: Date;
  status: PermitRequestStatus;
  priority: number;
  notes?: string;
  internal_notes?: string;
  submitted_at: Date;
  reviewed_at?: Date;
  reviewed_by?: string;
  approved_at?: Date;
  rejected_at?: Date;
  rejection_reason?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Permit {
  id: string;
  permit_number: string;
  permit_request_id: string;
  tenant_id: string;
  vehicle_id: string;
  permit_type_id: string;
  valid_from: Date;
  valid_until: Date;
  qr_code?: string;
  digital_permit_url?: string;
  is_active: boolean;
  issued_at: Date;
  revoked_at?: Date;
  revoked_reason?: string;
  created_at: Date;
  updated_at: Date;
}

// View types for common queries
export interface ActivePermitRequestView {
  id: string;
  request_number: string;
  status: PermitRequestStatus;
  submitted_at: Date;
  requested_start_date: Date;
  requested_end_date: Date;
  priority: number;
  notes?: string;
  tenant_name: string;
  tenant_email: string;
  unit_number: string;
  license_plate: string;
  make: string;
  model: string;
  year?: number;
  color: string;
  state_province: string;
  permit_type_name: string;
  permit_type_description?: string;
}

export interface ActivePermitView {
  id: string;
  permit_number: string;
  valid_from: Date;
  valid_until: Date;
  is_active: boolean;
  issued_at: Date;
  tenant_name: string;
  tenant_email: string;
  unit_number: string;
  license_plate: string;
  make: string;
  model: string;
  color: string;
  state_province: string;
  permit_type_name: string;
}

// Input types for API requests
export interface CreateTenantInput {
  email: string;
  phone?: string;
  first_name: string;
  last_name: string;
  unit_number: string;
  building_code?: string;
	full_address?: string;
}

export interface CreateVehicleInput {
  tenant_id: string;
  license_plate: string;
  make: string;
  model: string;
  year?: number;
  color: string;
  state_province: string;
  country?: string;
  is_primary?: boolean;
}

export interface CreatePermitRequestInput {
  tenant_id: string;
  vehicle_id: string;
  permit_type_id: string;
  requested_start_date: Date;
  requested_end_date: Date;
  notes?: string;
  priority?: number;
}

export interface UpdatePermitRequestInput {
  status?: PermitRequestStatus;
  reviewed_by?: string;
  rejection_reason?: string;
  internal_notes?: string;
  priority?: number;
}

export interface CreatePermitInput {
  permit_request_id: string;
  tenant_id: string;
  vehicle_id: string;
  permit_type_id: string;
  valid_from: Date;
  valid_until: Date;
  qr_code?: string;
  digital_permit_url?: string;
}

// Centralized permit request - handles tenant, vehicle, and permit creation
export interface CreateCentralizedPermitRequestInput {
	// Tenant information
	first_name: string;
	last_name: string;
	email: string;
	phone?: string;
	unit_number: string;
	building_code?: string;
	full_address?: string;

	// Vehicle information
	license_plate: string;
	make: string;
	model: string;
	year?: number;
	color: string;
	state_province: string;
	country?: string;

	// Permit request information
	permit_type_id?: string; // Optional, defaults to 'guest'
	requested_start_date?: string; // Optional, defaults to today
	requested_end_date?: string; // Optional, defaults to today + 24 hours
	notes?: string;
	priority?: number;
}

// Utility types
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PermitRequestFilters {
  tenant_id?: string;
  status?: PermitRequestStatus;
  permit_type_id?: string;
  submitted_from?: Date;
  submitted_to?: Date;
  unit_number?: string;
}

export interface PermitFilters {
  tenant_id?: string;
  vehicle_id?: string;
  permit_type_id?: string;
  valid_from?: Date;
  valid_until?: Date;
  is_active?: boolean;
}

// Database response types
export interface DatabaseResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    has_more?: boolean;
  };
}

export interface PermitRequestWithDetails extends PermitRequest {
  tenant: Tenant;
  vehicle: Vehicle;
  permit_type: PermitType;
  permit?: Permit;
}

export interface PermitWithDetails extends Permit {
  tenant: Tenant;
  vehicle: Vehicle;
  permit_type: PermitType;
  permit_request: PermitRequest;
}

// License plate lookup result
export interface LicensePlateLookupResult {
  license_plate: string;
  is_registered: boolean;
  tenant_info?: {
    id: string;
    name: string;
    email: string;
    unit_number: string;
  };
  vehicle_info?: {
    id: string;
    make: string;
    model: string;
    year?: number;
    color: string;
    state_province: string;
  };
  active_permits: ActivePermitView[];
  pending_requests: ActivePermitRequestView[];
  permit_history: Permit[];
}

// =====================================================
// ENFORCEMENT TYPES
// =====================================================

export interface EnforcementOfficer {
  id: string;
  badge_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export type ViolationStatus = 'issued' | 'paid' | 'disputed' | 'voided';

export interface Violation {
  id: string;
  ticket_number: string;
  license_plate: string;
  state_province: string;
  issued_by: string; // enforcement officer ID
  violation_type: string;
  violation_reason: string;
  location?: string;
  gps_latitude?: number;
  gps_longitude?: number;
  fine_amount?: number;
  evidence_photo_urls?: string; // JSON array of photo URLs
  notes?: string;
  status: ViolationStatus;
  issued_at: Date;
  voided_at?: Date;
  voided_reason?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Warning {
  id: string;
  warning_number: string;
  license_plate: string;
  state_province: string;
  issued_by: string; // enforcement officer ID
  warning_type: string;
  warning_reason: string;
  location?: string;
  gps_latitude?: number;
  gps_longitude?: number;
  notes?: string;
  issued_at: Date;
  created_at: Date;
  updated_at: Date;
}

export type EnforcementActivityType = 'scan' | 'ticket' | 'warning' | 'patrol' | 'shift_start' | 'shift_end';

export interface EnforcementActivity {
  id: string;
  officer_id: string;
  activity_type: EnforcementActivityType;
  license_plate?: string;
  state_province?: string;
  location?: string;
  gps_latitude?: number;
  gps_longitude?: number;
  result?: string; // valid, expired, unauthorized, no_permit, etc.
  notes?: string;
  performed_at: Date;
  created_at: Date;
}

export interface ShiftReport {
  id: string;
  report_number: string;
  officer_id: string;
  shift_date: Date;
  shift_start_time?: Date;
  shift_end_time?: Date;
  total_scans: number;
  total_tickets: number;
  total_warnings: number;
  total_violations_found: number;
  patrol_areas?: string; // JSON array of areas covered
  incidents?: string; // JSON array of incident notes
  summary?: string;
  submitted_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface OfflineAction {
  id: string;
  officer_id: string;
  action_type: string; // ticket, warning, scan
  action_data: string; // JSON data for the action
  performed_at: Date;
  synced_at?: Date;
  is_synced: boolean;
  created_at: Date;
}

// Enhanced license plate lookup with enforcement context
export interface EnforcementLookupResult extends LicensePlateLookupResult {
  enforcement_context: {
    recent_violations: Violation[];
    recent_warnings: Warning[];
    is_repeat_offender: boolean;
    violation_count_30_days: number;
    last_violation_date?: Date;
    grace_period_active: boolean;
    grace_period_expires?: Date;
  };
  current_status: 'authorized' | 'expired' | 'no_permit' | 'grace_period' | 'violation';
  recommended_action: 'none' | 'warning' | 'ticket' | 'verify_manually';
}

// Input types for enforcement API requests
export interface CreateEnforcementOfficerInput {
  badge_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
}

export interface CreateViolationInput {
  license_plate: string;
  state_province: string;
  issued_by: string;
  violation_type: string;
  violation_reason: string;
  location?: string;
  gps_latitude?: number;
  gps_longitude?: number;
  fine_amount?: number;
  evidence_photo_urls?: string[];
  notes?: string;
}

export interface CreateWarningInput {
  license_plate: string;
  state_province: string;
  issued_by: string;
  warning_type: string;
  warning_reason: string;
  location?: string;
  gps_latitude?: number;
  gps_longitude?: number;
  notes?: string;
}

export interface CreateEnforcementActivityInput {
  officer_id: string;
  activity_type: EnforcementActivityType;
  license_plate?: string;
  state_province?: string;
  location?: string;
  gps_latitude?: number;
  gps_longitude?: number;
  result?: string;
  notes?: string;
}

export interface CreateShiftReportInput {
  officer_id: string;
  shift_date: string;
  shift_start_time?: string;
  shift_end_time?: string;
  total_scans?: number;
  total_tickets?: number;
  total_warnings?: number;
  total_violations_found?: number;
  patrol_areas?: string[];
  incidents?: string[];
  summary?: string;
}

export interface VoidViolationInput {
  voided_reason: string;
}

// Filter types for enforcement queries
export interface EnforcementFilters {
  officer_id?: string;
  date?: string;
  start_date?: string;
  end_date?: string;
  license_plate?: string;
  state_province?: string;
  status?: ViolationStatus;
  violation_type?: string;
}

export interface ShiftFilters {
  officer_id?: string;
  shift_date?: string;
  start_date?: string;
  end_date?: string;
}
