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
