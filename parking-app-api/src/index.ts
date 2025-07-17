import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { HTTPException } from 'hono/http-exception';

// Import our database types
import type {
	Tenant,
	Vehicle,
	PermitRequest,
	Permit,
	CreateTenantInput,
	CreateVehicleInput,
	CreatePermitRequestInput,
	CreateCentralizedPermitRequestInput,
	LicensePlateLookupResult,
	PermitRequestStatus,
	EnforcementOfficer,
	Violation,
	Warning,
	EnforcementActivity,
	ShiftReport,
	OfflineAction,
	EnforcementLookupResult,
	CreateEnforcementOfficerInput,
	CreateViolationInput,
	CreateWarningInput,
	CreateEnforcementActivityInput,
	CreateShiftReportInput,
	VoidViolationInput,
	EnforcementFilters,
	ShiftFilters,
	ViolationStatus,
	EnforcementActivityType
} from '../database/types';

// Cloudflare Workers environment
interface Env {
	DB: D1Database;
}

// Create the Hono app
const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', cors({
	origin: ['http://localhost:3000', 'https://parking-app-tenant.snapsuite.workers.dev'],
	allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	allowHeaders: ['Content-Type', 'Authorization'],
	credentials: true,
}));

app.use('*', logger());
app.use('*', prettyJSON());

// Utility functions
const generateId = () => crypto.randomUUID();

const getCurrentTimestamp = () => new Date().toISOString();

// Helper function to generate request number
const generateRequestNumber = () => {
	const now = new Date();
	const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD format
	const randomSuffix = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
	return `PR-${dateStr}-${randomSuffix}`;
};

// Helper function to generate permit number
const generatePermitNumber = () => {
	const now = new Date();
	const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD format
	const randomSuffix = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
	return `PM-${dateStr}-${randomSuffix}`;
};

// Helper function to validate license plate format
const validateLicensePlate = (plate: string, state: string) => {
	if (!plate || !state) return false;
	if (plate.length < 2 || plate.length > 8) return false;
	return /^[A-Z0-9]+$/.test(plate.toUpperCase());
};

// Helper function to generate ticket number
const generateTicketNumber = () => {
	const now = new Date();
	const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD format
	const randomSuffix = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
	return `TK-${dateStr}-${randomSuffix}`;
};

// Helper function to generate warning number
const generateWarningNumber = () => {
	const now = new Date();
	const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD format
	const randomSuffix = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
	return `WN-${dateStr}-${randomSuffix}`;
};

// Helper function to generate shift report number
const generateShiftReportNumber = () => {
	const now = new Date();
	const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD format
	const randomSuffix = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
	return `SR-${dateStr}-${randomSuffix}`;
};

// Helper function to validate GPS coordinates
const validateGPSCoordinates = (latitude?: number, longitude?: number) => {
	if (latitude !== undefined && (latitude < -90 || latitude > 90)) return false;
	if (longitude !== undefined && (longitude < -180 || longitude > 180)) return false;
	return true;
};

// Helper function to check if within grace period (5 minutes buffer)
const isWithinGracePeriod = (permitStart: Date, permitEnd: Date, now: Date = new Date()) => {
	const graceMinutes = 5;
	const graceMs = graceMinutes * 60 * 1000;
	const gracePeriodStart = new Date(permitStart.getTime() - graceMs);
	const gracePeriodEnd = new Date(permitEnd.getTime() + graceMs);
	return now >= gracePeriodStart && now <= gracePeriodEnd;
};

// Helper function to check for duplicate tickets within 1 hour
const checkDuplicateTicket = async (DB: D1Database, licensePlate: string, stateProvince: string, issuedBy: string) => {
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
	const existingTicket = await DB.prepare(`
		SELECT id FROM violations
		WHERE license_plate = ? AND state_province = ? AND issued_by = ?
		AND issued_at > ? AND status != 'voided'
	`).bind(licensePlate, stateProvince, issuedBy, oneHourAgo.toISOString()).first();

	return !!existingTicket;
};

// =====================================================
// HEALTH CHECK
// =====================================================

app.get('/health', (c) => {
	return c.json({
		status: 'ok',
		timestamp: getCurrentTimestamp(),
		service: 'parking-permits-api'
	});
});

// =====================================================
// CENTRALIZED PERMIT REQUEST (Form Submission)
// =====================================================

// Complete permit request - creates tenant, vehicle, and permit request in one go
app.post('/api/submit-permit-request', async (c) => {
	try {
		const body = await c.req.json() as CreateCentralizedPermitRequestInput;

		// Validate required fields
		if (!body.first_name || !body.last_name || !body.email || !body.license_plate || !body.make || !body.model || !body.color || !body.state_province) {
			throw new HTTPException(400, {
				message: 'Missing required fields: first_name, last_name, email, license_plate, make, model, color, state_province'
			});
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(body.email)) {
			throw new HTTPException(400, { message: 'Invalid email format' });
		}

		// Validate license plate format
		const plate = body.license_plate.toUpperCase();
		const state = body.state_province.toUpperCase();
		if (!validateLicensePlate(plate, state)) {
			throw new HTTPException(400, { message: 'Invalid license plate format' });
		}

		// Set default values
		const permitTypeId = body.permit_type_id || 'guest';
		const requestedStartDate = body.requested_start_date ? new Date(body.requested_start_date) : new Date();
		const requestedEndDate = body.requested_end_date ? new Date(body.requested_end_date) : new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

		// Validate dates
		if (requestedStartDate < new Date(Date.now() - 24 * 60 * 60 * 1000)) { // Allow requests up to 24 hours in the past
			throw new HTTPException(400, { message: 'Start date cannot be more than 24 hours in the past' });
		}

		if (requestedEndDate <= requestedStartDate) {
			throw new HTTPException(400, { message: 'End date must be after start date' });
		}

		// Check if permit type exists
		const permitType = await c.env.DB.prepare(`
			SELECT id FROM permit_types WHERE id = ? AND is_active = TRUE
		`).bind(permitTypeId).first();

		if (!permitType) {
			throw new HTTPException(404, { message: 'Permit type not found' });
		}

		// Begin transaction-like operations
		let tenantId: string;
		let vehicleId: string;
		let permitRequestId: string;

		// Step 1: Check if tenant exists, if not create
		const existingTenant = await c.env.DB.prepare(`
			SELECT id FROM tenants WHERE email = ? AND is_active = TRUE
		`).bind(body.email.toLowerCase()).first();

		if (existingTenant) {
			tenantId = existingTenant.id as string;

			// Update tenant information if provided
			if (body.full_address || body.phone || body.unit_number) {
				await c.env.DB.prepare(`
					UPDATE tenants SET
						phone = COALESCE(?, phone),
						full_address = COALESCE(?, full_address),
						unit_number = COALESCE(?, unit_number),
						updated_at = CURRENT_TIMESTAMP
					WHERE id = ?
				`).bind(body.phone || null, body.full_address || null, body.unit_number || null, tenantId).run();
			}
		} else {
			// Create new tenant
			tenantId = generateId();
			const tenant: Tenant = {
				id: tenantId,
				email: body.email.toLowerCase(),
				phone: body.phone || undefined,
				first_name: body.first_name,
				last_name: body.last_name,
				unit_number: body.unit_number || '', // Default empty if not provided
				building_code: body.building_code || undefined,
				full_address: body.full_address || undefined,
				is_active: true,
				created_at: new Date(),
				updated_at: new Date()
			};

			const tenantResult = await c.env.DB.prepare(`
				INSERT INTO tenants (id, email, phone, first_name, last_name, unit_number, building_code, full_address, is_active)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).bind(
				tenant.id,
				tenant.email,
				tenant.phone || null,
				tenant.first_name,
				tenant.last_name,
				tenant.unit_number,
				tenant.building_code || null,
				tenant.full_address || null,
				tenant.is_active
			).run();

			if (!tenantResult.success) {
				throw new HTTPException(500, { message: 'Failed to create tenant' });
			}
		}

		// Step 2: Check if vehicle exists, if not create
		const existingVehicle = await c.env.DB.prepare(`
			SELECT id FROM vehicles WHERE license_plate = ? AND state_province = ? AND tenant_id = ?
		`).bind(plate, state, tenantId).first();

		if (existingVehicle) {
			vehicleId = existingVehicle.id as string;

			// Update vehicle information
			await c.env.DB.prepare(`
				UPDATE vehicles SET
					make = ?,
					model = ?,
					year = ?,
					color = ?,
					country = ?,
					updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`).bind(
				body.make,
				body.model,
				body.year || null,
				body.color,
				body.country || 'US',
				vehicleId
			).run();
		} else {
			// Create new vehicle
			vehicleId = generateId();
			const vehicle: Vehicle = {
				id: vehicleId,
				tenant_id: tenantId,
				license_plate: plate,
				make: body.make,
				model: body.model,
				year: body.year || undefined,
				color: body.color,
				state_province: state,
				country: body.country || 'US',
				is_primary: false,
				created_at: new Date(),
				updated_at: new Date()
			};

			const vehicleResult = await c.env.DB.prepare(`
				INSERT INTO vehicles (id, tenant_id, license_plate, make, model, year, color, state_province, country, is_primary)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).bind(
				vehicle.id,
				vehicle.tenant_id,
				vehicle.license_plate,
				vehicle.make,
				vehicle.model,
				vehicle.year || null,
				vehicle.color,
				vehicle.state_province,
				vehicle.country,
				vehicle.is_primary
			).run();

			if (!vehicleResult.success) {
				throw new HTTPException(500, { message: 'Failed to create vehicle' });
			}
		}

		// Step 3: Create permit request
		permitRequestId = generateId();
		const permitRequest: PermitRequest = {
			id: permitRequestId,
			request_number: generateRequestNumber(),
			tenant_id: tenantId,
			vehicle_id: vehicleId,
			permit_type_id: permitTypeId,
			requested_start_date: requestedStartDate,
			requested_end_date: requestedEndDate,
			status: 'pending',
			priority: body.priority || 1,
			notes: body.notes || undefined,
			internal_notes: undefined,
			submitted_at: new Date(),
			reviewed_at: undefined,
			reviewed_by: undefined,
			approved_at: undefined,
			rejected_at: undefined,
			rejection_reason: undefined,
			created_at: new Date(),
			updated_at: new Date()
		};

		const permitRequestResult = await c.env.DB.prepare(`
			INSERT INTO permit_requests (id, request_number, tenant_id, vehicle_id, permit_type_id, requested_start_date, requested_end_date, status, priority, notes)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).bind(
			permitRequest.id,
			permitRequest.request_number,
			permitRequest.tenant_id,
			permitRequest.vehicle_id,
			permitRequest.permit_type_id,
			permitRequest.requested_start_date.toISOString().split('T')[0],
			permitRequest.requested_end_date.toISOString().split('T')[0],
			permitRequest.status,
			permitRequest.priority,
			permitRequest.notes || null
		).run();

		if (!permitRequestResult.success) {
			throw new HTTPException(500, { message: 'Failed to create permit request' });
		}

		// Step 4: For guest permits, auto-approve and create permit
		if (permitTypeId === 'guest') {
			// Update permit request to approved
			await c.env.DB.prepare(`
				UPDATE permit_requests SET
					status = 'approved',
					approved_at = CURRENT_TIMESTAMP,
					reviewed_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`).bind(permitRequestId).run();

			// Create the permit
			const permitId = generateId();
			const permit: Permit = {
				id: permitId,
				permit_number: generatePermitNumber(),
				permit_request_id: permitRequestId,
				tenant_id: tenantId,
				vehicle_id: vehicleId,
				permit_type_id: permitTypeId,
				valid_from: requestedStartDate,
				valid_until: requestedEndDate,
				qr_code: undefined,
				digital_permit_url: undefined,
				is_active: true,
				issued_at: new Date(),
				revoked_at: undefined,
				revoked_reason: undefined,
				created_at: new Date(),
				updated_at: new Date()
			};

			const permitResult = await c.env.DB.prepare(`
				INSERT INTO permits (id, permit_number, permit_request_id, tenant_id, vehicle_id, permit_type_id, valid_from, valid_until, is_active)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).bind(
				permit.id,
				permit.permit_number,
				permit.permit_request_id,
				permit.tenant_id,
				permit.vehicle_id,
				permit.permit_type_id,
				permit.valid_from.toISOString().split('T')[0],
				permit.valid_until.toISOString().split('T')[0],
				permit.is_active
			).run();

			if (!permitResult.success) {
				throw new HTTPException(500, { message: 'Failed to create permit' });
			}
		}

		// Fetch the complete result with all related data
		const completeResult = await c.env.DB.prepare(`
			SELECT
				pr.*,
				t.first_name || ' ' || t.last_name as tenant_name,
				t.email as tenant_email,
				t.phone as tenant_phone,
				t.unit_number,
				t.full_address,
				v.license_plate,
				v.make,
				v.model,
				v.year,
				v.color,
				v.state_province,
				pt.name as permit_type_name,
				pt.description as permit_type_description,
				p.permit_number,
				p.valid_from,
				p.valid_until,
				p.is_active as permit_is_active
			FROM permit_requests pr
			JOIN tenants t ON pr.tenant_id = t.id
			JOIN vehicles v ON pr.vehicle_id = v.id
			JOIN permit_types pt ON pr.permit_type_id = pt.id
			LEFT JOIN permits p ON pr.id = p.permit_request_id
			WHERE pr.id = ?
		`).bind(permitRequestId).first();

		return c.json({
			success: true,
			data: {
				permit_request: completeResult,
				tenant_id: tenantId,
				vehicle_id: vehicleId,
				permit_request_id: permitRequestId,
				auto_approved: permitTypeId === 'guest'
			},
			message: permitTypeId === 'guest'
				? 'Guest permit request submitted and automatically approved!'
				: 'Permit request submitted successfully and is pending review'
		}, 201);

	} catch (error) {
		if (error instanceof HTTPException) throw error;

		// Handle unique constraint violations
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			if (error.message.includes('email')) {
				throw new HTTPException(409, { message: 'Email already exists' });
			}
			if (error.message.includes('license_plate')) {
				throw new HTTPException(409, { message: 'License plate already registered for this state' });
			}
		}

		console.error('Centralized permit request error:', error);
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// =====================================================
// TENANT MANAGEMENT
// =====================================================

// Create a new tenant
app.post('/api/tenants', async (c) => {
	try {
		const body = await c.req.json() as CreateTenantInput;

		// Validate required fields
		if (!body.email || !body.first_name || !body.last_name || !body.unit_number) {
			throw new HTTPException(400, { message: 'Missing required fields: email, first_name, last_name, unit_number' });
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(body.email)) {
			throw new HTTPException(400, { message: 'Invalid email format' });
		}

		const tenant: Tenant = {
			id: generateId(),
			email: body.email.toLowerCase(),
			phone: body.phone || undefined,
			first_name: body.first_name,
			last_name: body.last_name,
			unit_number: body.unit_number,
			building_code: body.building_code || undefined,
			full_address: body.full_address || undefined,
			is_active: true,
			created_at: new Date(),
			updated_at: new Date()
		};

		const result = await c.env.DB.prepare(`
      INSERT INTO tenants (id, email, phone, first_name, last_name, unit_number, building_code, full_address, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
			tenant.id,
			tenant.email,
		tenant.phone || null,
			tenant.first_name,
			tenant.last_name,
			tenant.unit_number,
		tenant.building_code || null,
		tenant.full_address || null,
			tenant.is_active
		).run();

		if (!result.success) {
			throw new HTTPException(500, { message: 'Failed to create tenant' });
		}

		return c.json({
			success: true,
			data: tenant,
			message: 'Tenant created successfully'
		}, 201);

	} catch (error) {
		if (error instanceof HTTPException) throw error;

		// Handle unique constraint violations
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			if (error.message.includes('email')) {
				throw new HTTPException(409, { message: 'Email already exists' });
			}
		}

		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Get tenant by ID
app.get('/api/tenants/:id', async (c) => {
	try {
		const tenantId = c.req.param('id');

		const tenant = await c.env.DB.prepare(`
      SELECT * FROM tenants WHERE id = ? AND is_active = TRUE
    `).bind(tenantId).first();

		if (!tenant) {
			throw new HTTPException(404, { message: 'Tenant not found' });
		}

		return c.json({
			success: true,
			data: tenant
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// =====================================================
// VEHICLE MANAGEMENT
// =====================================================

// Add a vehicle to a tenant
app.post('/api/tenants/:tenantId/vehicles', async (c) => {
	try {
		const tenantId = c.req.param('tenantId');
		const body = await c.req.json() as CreateVehicleInput;

		// Validate required fields
		if (!body.license_plate || !body.make || !body.model || !body.color || !body.state_province) {
			throw new HTTPException(400, { message: 'Missing required fields: license_plate, make, model, color, state_province' });
		}

		// Validate license plate format
		const plate = body.license_plate.toUpperCase();
		if (!validateLicensePlate(plate, body.state_province)) {
			throw new HTTPException(400, { message: 'Invalid license plate format' });
		}

		// Check if tenant exists
		const tenant = await c.env.DB.prepare(`
      SELECT id FROM tenants WHERE id = ? AND is_active = TRUE
    `).bind(tenantId).first();

		if (!tenant) {
			throw new HTTPException(404, { message: 'Tenant not found' });
		}

		const vehicle: Vehicle = {
			id: generateId(),
			tenant_id: tenantId,
			license_plate: plate,
			make: body.make,
			model: body.model,
			year: body.year || undefined,
			color: body.color,
			state_province: body.state_province.toUpperCase(),
			country: body.country || 'US',
			is_primary: body.is_primary || false,
			created_at: new Date(),
			updated_at: new Date()
		};

		const result = await c.env.DB.prepare(`
      INSERT INTO vehicles (id, tenant_id, license_plate, make, model, year, color, state_province, country, is_primary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
			vehicle.id,
			vehicle.tenant_id,
			vehicle.license_plate,
			vehicle.make,
			vehicle.model,
		vehicle.year || null,
			vehicle.color,
			vehicle.state_province,
			vehicle.country,
			vehicle.is_primary
		).run();

		if (!result.success) {
			throw new HTTPException(500, { message: 'Failed to create vehicle' });
		}

		return c.json({
			success: true,
			data: vehicle,
			message: 'Vehicle added successfully'
		}, 201);

	} catch (error) {
		if (error instanceof HTTPException) throw error;

		// Handle unique constraint violations
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			if (error.message.includes('license_plate')) {
				throw new HTTPException(409, { message: 'License plate already registered for this state' });
			}
		}

		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Get vehicles for a tenant
app.get('/api/tenants/:tenantId/vehicles', async (c) => {
	try {
		const tenantId = c.req.param('tenantId');

		const vehicles = await c.env.DB.prepare(`
      SELECT * FROM vehicles WHERE tenant_id = ? ORDER BY is_primary DESC, created_at ASC
    `).bind(tenantId).all();

		return c.json({
			success: true,
			data: vehicles.results,
			meta: { count: vehicles.results.length }
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// =====================================================
// PERMIT REQUEST MANAGEMENT
// =====================================================

// Submit a permit request
app.post('/api/permit-requests', async (c) => {
	try {
		const body = await c.req.json() as CreatePermitRequestInput;

		// Validate required fields
		if (!body.tenant_id || !body.vehicle_id || !body.permit_type_id || !body.requested_start_date || !body.requested_end_date) {
			throw new HTTPException(400, { message: 'Missing required fields: tenant_id, vehicle_id, permit_type_id, requested_start_date, requested_end_date' });
		}

		// Validate dates
		const startDate = new Date(body.requested_start_date);
		const endDate = new Date(body.requested_end_date);
		const now = new Date();

		if (startDate < now) {
			throw new HTTPException(400, { message: 'Start date cannot be in the past' });
		}

		if (endDate <= startDate) {
			throw new HTTPException(400, { message: 'End date must be after start date' });
		}

		// Check if tenant and vehicle exist
		const tenantVehicle = await c.env.DB.prepare(`
      SELECT t.id as tenant_id, v.id as vehicle_id
      FROM tenants t
      JOIN vehicles v ON t.id = v.tenant_id
      WHERE t.id = ? AND v.id = ? AND t.is_active = TRUE
    `).bind(body.tenant_id, body.vehicle_id).first();

		if (!tenantVehicle) {
			throw new HTTPException(404, { message: 'Tenant or vehicle not found' });
		}

		// Check if permit type exists
		const permitType = await c.env.DB.prepare(`
      SELECT id FROM permit_types WHERE id = ? AND is_active = TRUE
    `).bind(body.permit_type_id).first();

		if (!permitType) {
			throw new HTTPException(404, { message: 'Permit type not found' });
		}

		const permitRequest: PermitRequest = {
			id: generateId(),
			request_number: generateRequestNumber(),
			tenant_id: body.tenant_id,
			vehicle_id: body.vehicle_id,
			permit_type_id: body.permit_type_id,
			requested_start_date: startDate,
			requested_end_date: endDate,
			status: 'pending',
			priority: body.priority || 1,
			notes: body.notes || undefined,
			internal_notes: undefined,
			submitted_at: new Date(),
			reviewed_at: undefined,
			reviewed_by: undefined,
			approved_at: undefined,
			rejected_at: undefined,
			rejection_reason: undefined,
			created_at: new Date(),
			updated_at: new Date()
		};

		const result = await c.env.DB.prepare(`
      INSERT INTO permit_requests (id, request_number, tenant_id, vehicle_id, permit_type_id, requested_start_date, requested_end_date, status, priority, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
			permitRequest.id,
		permitRequest.request_number,
			permitRequest.tenant_id,
			permitRequest.vehicle_id,
			permitRequest.permit_type_id,
			permitRequest.requested_start_date.toISOString().split('T')[0],
			permitRequest.requested_end_date.toISOString().split('T')[0],
			permitRequest.status,
			permitRequest.priority,
		permitRequest.notes || null
		).run();

		if (!result.success) {
			throw new HTTPException(500, { message: 'Failed to create permit request' });
		}

		// Fetch the created request with auto-generated request number
		const createdRequest = await c.env.DB.prepare(`
      SELECT * FROM permit_requests WHERE id = ?
    `).bind(permitRequest.id).first();

		return c.json({
			success: true,
			data: createdRequest,
			message: 'Permit request submitted successfully'
		}, 201);

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Get permit requests for a tenant
app.get('/api/tenants/:tenantId/permit-requests', async (c) => {
	try {
		const tenantId = c.req.param('tenantId');
		const status = c.req.query('status') as PermitRequestStatus;

		let query = `
      SELECT
        pr.*,
        v.license_plate,
        v.make,
        v.model,
        v.color,
        pt.name as permit_type_name
      FROM permit_requests pr
      JOIN vehicles v ON pr.vehicle_id = v.id
      JOIN permit_types pt ON pr.permit_type_id = pt.id
      WHERE pr.tenant_id = ?
    `;

		const params = [tenantId];

		if (status) {
			query += ` AND pr.status = ?`;
			params.push(status);
		}

		query += ` ORDER BY pr.created_at DESC`;

		const requests = await c.env.DB.prepare(query).bind(...params).all();

		return c.json({
			success: true,
			data: requests.results,
			meta: { count: requests.results.length }
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// =====================================================
// LICENSE PLATE LOOKUP
// =====================================================

// Enhanced license plate lookup for enforcement
app.get('/api/enforcement/license-plates/:plate', async (c) => {
	try {
		const plate = c.req.param('plate').toUpperCase();
		const state = c.req.query('state')?.toUpperCase() || 'CA';
		const officerId = c.req.query('officer_id');

		// Validate license plate format
		if (!validateLicensePlate(plate, state)) {
			throw new HTTPException(400, { message: 'Invalid license plate format' });
		}

		// Log the scan activity
		if (officerId) {
			await c.env.DB.prepare(`
				INSERT INTO enforcement_activities (id, officer_id, activity_type, license_plate, state_province, performed_at)
				VALUES (?, ?, 'scan', ?, ?, ?)
			`).bind(generateId(), officerId, plate, state, getCurrentTimestamp()).run();
		}

		// Get vehicle and tenant information
		const vehicleInfo = await c.env.DB.prepare(`
			SELECT
				v.*,
				t.first_name,
				t.last_name,
				t.email,
				t.phone,
				t.unit_number,
				t.building_code,
				t.full_address
			FROM vehicles v
			JOIN tenants t ON v.tenant_id = t.id
			WHERE v.license_plate = ? AND v.state_province = ? AND t.is_active = TRUE
		`).bind(plate, state).first();

		if (!vehicleInfo) {
			// Vehicle not registered - return minimal enforcement context
			return c.json({
				success: true,
				data: {
					license_plate: plate,
					is_registered: false,
					tenant_info: undefined,
					vehicle_info: undefined,
					active_permits: [],
					pending_requests: [],
					permit_history: [],
					enforcement_context: {
						recent_violations: [],
						recent_warnings: [],
						is_repeat_offender: false,
						violation_count_30_days: 0,
						grace_period_active: false
					},
					current_status: 'no_permit',
					recommended_action: 'ticket'
				} as EnforcementLookupResult
			});
		}

		// Get active permits for this vehicle
		const activePermits = await c.env.DB.prepare(`
			SELECT
				p.*,
				pt.name as permit_type_name
			FROM permits p
			JOIN permit_types pt ON p.permit_type_id = pt.id
			WHERE p.vehicle_id = ? AND p.is_active = TRUE AND p.valid_until >= DATE('now')
			ORDER BY p.valid_until DESC
		`).bind(vehicleInfo.id).all();

		// Get pending permit requests
		const pendingRequests = await c.env.DB.prepare(`
			SELECT
				pr.*,
				pt.name as permit_type_name
			FROM permit_requests pr
			JOIN permit_types pt ON pr.permit_type_id = pt.id
			WHERE pr.vehicle_id = ? AND pr.status IN ('pending', 'under_review')
			ORDER BY pr.submitted_at DESC
		`).bind(vehicleInfo.id).all();

		// Get permit history (last 6 months)
		const permitHistory = await c.env.DB.prepare(`
			SELECT
				p.*,
				pt.name as permit_type_name
			FROM permits p
			JOIN permit_types pt ON p.permit_type_id = pt.id
			WHERE p.vehicle_id = ? AND p.issued_at >= DATE('now', '-6 months')
			ORDER BY p.issued_at DESC
		`).bind(vehicleInfo.id).all();

		// Get recent violations (last 30 days)
		const recentViolations = await c.env.DB.prepare(`
			SELECT * FROM violations
			WHERE license_plate = ? AND state_province = ?
			AND issued_at >= DATE('now', '-30 days')
			AND status != 'voided'
			ORDER BY issued_at DESC
		`).bind(plate, state).all();

		// Get recent warnings (last 30 days)
		const recentWarnings = await c.env.DB.prepare(`
			SELECT * FROM warnings
			WHERE license_plate = ? AND state_province = ?
			AND issued_at >= DATE('now', '-30 days')
			ORDER BY issued_at DESC
		`).bind(plate, state).all();

		// Calculate enforcement context
		const violationCount30Days = recentViolations.results.length;
		const isRepeatOffender = violationCount30Days >= 3;
		const lastViolationDate = recentViolations.results.length > 0
			? new Date(recentViolations.results[0].issued_at as string)
			: undefined;

		// Determine current status and grace period
		const now = new Date();
		let currentStatus: 'authorized' | 'expired' | 'no_permit' | 'grace_period' | 'violation';
		let gracePeriodActive = false;
		let gracePeriodExpires: Date | undefined;

		if (activePermits.results.length === 0) {
			currentStatus = 'no_permit';
		} else {
			// Check if any active permit covers current time
			const validPermit = activePermits.results.find(permit => {
				const validFrom = new Date(permit.valid_from as string);
				const validUntil = new Date(permit.valid_until as string);
				return now >= validFrom && now <= validUntil;
			});

			if (validPermit) {
				currentStatus = 'authorized';
			} else {
				// Check for grace period
				const gracePermit = activePermits.results.find(permit => {
					const validFrom = new Date(permit.valid_from as string);
					const validUntil = new Date(permit.valid_until as string);
					return isWithinGracePeriod(validFrom, validUntil, now);
				});

				if (gracePermit) {
					currentStatus = 'grace_period';
					gracePeriodActive = true;
					const validUntil = new Date(gracePermit.valid_until as string);
					gracePeriodExpires = new Date(validUntil.getTime() + 5 * 60 * 1000); // 5 minutes after permit expires
				} else {
					currentStatus = 'expired';
				}
			}
		}

		// Determine recommended action
		let recommendedAction: 'none' | 'warning' | 'ticket' | 'verify_manually';
		if (currentStatus === 'authorized') {
			recommendedAction = 'none';
		} else if (currentStatus === 'grace_period') {
			recommendedAction = 'verify_manually';
		} else if (isRepeatOffender) {
			recommendedAction = 'ticket';
		} else if (recentWarnings.results.length > 0) {
			recommendedAction = 'ticket';
		} else {
			recommendedAction = 'warning';
		}

		const result: EnforcementLookupResult = {
			license_plate: plate,
			is_registered: true,
			tenant_info: {
				id: vehicleInfo.tenant_id as string,
				name: `${vehicleInfo.first_name} ${vehicleInfo.last_name}`,
				email: vehicleInfo.email as string,
				unit_number: vehicleInfo.unit_number as string
			},
			vehicle_info: {
				id: vehicleInfo.id as string,
				make: vehicleInfo.make as string,
				model: vehicleInfo.model as string,
				year: vehicleInfo.year as number | undefined,
				color: vehicleInfo.color as string,
				state_province: vehicleInfo.state_province as string
			},
			active_permits: activePermits.results as any[],
			pending_requests: pendingRequests.results as any[],
			permit_history: permitHistory.results as any[],
			enforcement_context: {
				recent_violations: recentViolations.results as unknown as Violation[],
				recent_warnings: recentWarnings.results as unknown as Warning[],
				is_repeat_offender: isRepeatOffender,
				violation_count_30_days: violationCount30Days,
				last_violation_date: lastViolationDate,
				grace_period_active: gracePeriodActive,
				grace_period_expires: gracePeriodExpires
			},
			current_status: currentStatus,
			recommended_action: recommendedAction
		};

		return c.json({
			success: true,
			data: result
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		console.error('Enforcement license plate lookup error:', error);
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Original license plate lookup - for tenant/admin use
app.get('/api/license-plates/:plate', async (c) => {
	try {
		const plate = c.req.param('plate').toUpperCase();
		const state = c.req.query('state')?.toUpperCase() || 'CA';

		// Validate license plate format
		if (!validateLicensePlate(plate, state)) {
			throw new HTTPException(400, { message: 'Invalid license plate format' });
		}

		// Get vehicle and tenant information
		const vehicleInfo = await c.env.DB.prepare(`
			SELECT
				v.*,
				t.first_name,
				t.last_name,
				t.email,
				t.phone,
				t.unit_number,
				t.building_code
			FROM vehicles v
			JOIN tenants t ON v.tenant_id = t.id
			WHERE v.license_plate = ? AND v.state_province = ? AND t.is_active = TRUE
		`).bind(plate, state).first();

		if (!vehicleInfo) {
			// Vehicle not registered
			return c.json({
				success: true,
				data: {
					license_plate: plate,
					is_registered: false,
					tenant_info: undefined,
					vehicle_info: undefined,
					active_permits: [],
					pending_requests: [],
					permit_history: []
				} as LicensePlateLookupResult
			});
		}

		// Get active permits for this vehicle
		const activePermits = await c.env.DB.prepare(`
			SELECT
				p.*,
				pt.name as permit_type_name
			FROM permits p
			JOIN permit_types pt ON p.permit_type_id = pt.id
			WHERE p.vehicle_id = ? AND p.is_active = TRUE AND p.valid_until >= DATE('now')
			ORDER BY p.valid_until DESC
		`).bind(vehicleInfo.id).all();

		// Get pending permit requests
		const pendingRequests = await c.env.DB.prepare(`
			SELECT
				pr.*,
				pt.name as permit_type_name
			FROM permit_requests pr
			JOIN permit_types pt ON pr.permit_type_id = pt.id
			WHERE pr.vehicle_id = ? AND pr.status IN ('pending', 'under_review')
			ORDER BY pr.submitted_at DESC
		`).bind(vehicleInfo.id).all();

		// Get permit history (last 6 months)
		const permitHistory = await c.env.DB.prepare(`
			SELECT
				p.*,
				pt.name as permit_type_name
			FROM permits p
			JOIN permit_types pt ON p.permit_type_id = pt.id
			WHERE p.vehicle_id = ? AND p.issued_at >= DATE('now', '-6 months')
			ORDER BY p.issued_at DESC
		`).bind(vehicleInfo.id).all();

		const result: LicensePlateLookupResult = {
			license_plate: plate,
			is_registered: true,
			tenant_info: {
				id: vehicleInfo.tenant_id as string,
				name: `${vehicleInfo.first_name} ${vehicleInfo.last_name}`,
				email: vehicleInfo.email as string,
				unit_number: vehicleInfo.unit_number as string
			},
			vehicle_info: {
				id: vehicleInfo.id as string,
				make: vehicleInfo.make as string,
				model: vehicleInfo.model as string,
				year: vehicleInfo.year as number | undefined,
				color: vehicleInfo.color as string,
				state_province: vehicleInfo.state_province as string
			},
			active_permits: activePermits.results as any[],
			pending_requests: pendingRequests.results as any[],
			permit_history: permitHistory.results as any[]
		};

		return c.json({
			success: true,
			data: result
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		console.error('License plate lookup error:', error);
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// =====================================================
// ENFORCEMENT ENDPOINTS
// =====================================================

// Create enforcement officer
app.post('/api/enforcement/officers', async (c) => {
	try {
		const body = await c.req.json() as CreateEnforcementOfficerInput;

		// Validate required fields
		if (!body.badge_number || !body.first_name || !body.last_name || !body.email) {
			throw new HTTPException(400, {
				message: 'Missing required fields: badge_number, first_name, last_name, email'
			});
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(body.email)) {
			throw new HTTPException(400, { message: 'Invalid email format' });
		}

		const officer: EnforcementOfficer = {
			id: generateId(),
			badge_number: body.badge_number,
			first_name: body.first_name,
			last_name: body.last_name,
			email: body.email.toLowerCase(),
			phone: body.phone || undefined,
			is_active: true,
			created_at: new Date(),
			updated_at: new Date()
		};

		const result = await c.env.DB.prepare(`
			INSERT INTO enforcement_officers (id, badge_number, first_name, last_name, email, phone, is_active)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`).bind(
			officer.id,
			officer.badge_number,
			officer.first_name,
			officer.last_name,
			officer.email,
			officer.phone || null,
			officer.is_active
		).run();

		if (!result.success) {
			throw new HTTPException(500, { message: 'Failed to create enforcement officer' });
		}

		return c.json({
			success: true,
			data: officer,
			message: 'Enforcement officer created successfully'
		}, 201);

	} catch (error) {
		if (error instanceof HTTPException) throw error;

		// Handle unique constraint violations
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			if (error.message.includes('badge_number')) {
				throw new HTTPException(409, { message: 'Badge number already exists' });
			}
			if (error.message.includes('email')) {
				throw new HTTPException(409, { message: 'Email already exists' });
			}
		}

		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Issue a parking ticket
app.post('/api/enforcement/tickets', async (c) => {
	try {
		const body = await c.req.json() as CreateViolationInput;

		// Validate required fields
		if (!body.license_plate || !body.state_province || !body.issued_by || !body.violation_type || !body.violation_reason) {
			throw new HTTPException(400, {
				message: 'Missing required fields: license_plate, state_province, issued_by, violation_type, violation_reason'
			});
		}

		// Validate license plate format
		const plate = body.license_plate.toUpperCase();
		const state = body.state_province.toUpperCase();
		if (!validateLicensePlate(plate, state)) {
			throw new HTTPException(400, { message: 'Invalid license plate format' });
		}

		// Validate GPS coordinates if provided
		if (!validateGPSCoordinates(body.gps_latitude, body.gps_longitude)) {
			throw new HTTPException(400, { message: 'Invalid GPS coordinates' });
		}

		// Check if officer exists and is active
		const officer = await c.env.DB.prepare(`
			SELECT id FROM enforcement_officers WHERE id = ? AND is_active = TRUE
		`).bind(body.issued_by).first();

		if (!officer) {
			throw new HTTPException(404, { message: 'Enforcement officer not found or inactive' });
		}

		// Check for duplicate tickets within 1 hour
		const isDuplicate = await checkDuplicateTicket(c.env.DB, plate, state, body.issued_by);
		if (isDuplicate) {
			throw new HTTPException(409, {
				message: 'Duplicate ticket - a ticket for this license plate was already issued by this officer within the last hour'
			});
		}

		const violation: Violation = {
			id: generateId(),
			ticket_number: generateTicketNumber(),
			license_plate: plate,
			state_province: state,
			issued_by: body.issued_by,
			violation_type: body.violation_type,
			violation_reason: body.violation_reason,
			location: body.location || undefined,
			gps_latitude: body.gps_latitude || undefined,
			gps_longitude: body.gps_longitude || undefined,
			fine_amount: body.fine_amount || undefined,
			evidence_photo_urls: body.evidence_photo_urls ? JSON.stringify(body.evidence_photo_urls) : undefined,
			notes: body.notes || undefined,
			status: 'issued',
			issued_at: new Date(),
			voided_at: undefined,
			voided_reason: undefined,
			created_at: new Date(),
			updated_at: new Date()
		};

		const result = await c.env.DB.prepare(`
			INSERT INTO violations (id, ticket_number, license_plate, state_province, issued_by, violation_type, violation_reason, location, gps_latitude, gps_longitude, fine_amount, evidence_photo_urls, notes, status)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).bind(
			violation.id,
			violation.ticket_number,
			violation.license_plate,
			violation.state_province,
			violation.issued_by,
			violation.violation_type,
			violation.violation_reason,
			violation.location || null,
			violation.gps_latitude || null,
			violation.gps_longitude || null,
			violation.fine_amount || null,
			violation.evidence_photo_urls || null,
			violation.notes || null,
			violation.status
		).run();

		if (!result.success) {
			throw new HTTPException(500, { message: 'Failed to create violation ticket' });
		}

		// Log the enforcement activity
		await c.env.DB.prepare(`
			INSERT INTO enforcement_activities (id, officer_id, activity_type, license_plate, state_province, location, gps_latitude, gps_longitude, result)
			VALUES (?, ?, 'ticket', ?, ?, ?, ?, ?, 'violation_issued')
		`).bind(
			generateId(),
			body.issued_by,
			plate,
			state,
			body.location || null,
			body.gps_latitude || null,
			body.gps_longitude || null
		).run();

		return c.json({
			success: true,
			data: violation,
			message: 'Parking ticket issued successfully'
		}, 201);

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		console.error('Ticket issuance error:', error);
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Issue a parking warning
app.post('/api/enforcement/warnings', async (c) => {
	try {
		const body = await c.req.json() as CreateWarningInput;

		// Validate required fields
		if (!body.license_plate || !body.state_province || !body.issued_by || !body.warning_type || !body.warning_reason) {
			throw new HTTPException(400, {
				message: 'Missing required fields: license_plate, state_province, issued_by, warning_type, warning_reason'
			});
		}

		// Validate license plate format
		const plate = body.license_plate.toUpperCase();
		const state = body.state_province.toUpperCase();
		if (!validateLicensePlate(plate, state)) {
			throw new HTTPException(400, { message: 'Invalid license plate format' });
		}

		// Validate GPS coordinates if provided
		if (!validateGPSCoordinates(body.gps_latitude, body.gps_longitude)) {
			throw new HTTPException(400, { message: 'Invalid GPS coordinates' });
		}

		// Check if officer exists and is active
		const officer = await c.env.DB.prepare(`
			SELECT id FROM enforcement_officers WHERE id = ? AND is_active = TRUE
		`).bind(body.issued_by).first();

		if (!officer) {
			throw new HTTPException(404, { message: 'Enforcement officer not found or inactive' });
		}

		const warning: Warning = {
			id: generateId(),
			warning_number: generateWarningNumber(),
			license_plate: plate,
			state_province: state,
			issued_by: body.issued_by,
			warning_type: body.warning_type,
			warning_reason: body.warning_reason,
			location: body.location || undefined,
			gps_latitude: body.gps_latitude || undefined,
			gps_longitude: body.gps_longitude || undefined,
			notes: body.notes || undefined,
			issued_at: new Date(),
			created_at: new Date(),
			updated_at: new Date()
		};

		const result = await c.env.DB.prepare(`
			INSERT INTO warnings (id, warning_number, license_plate, state_province, issued_by, warning_type, warning_reason, location, gps_latitude, gps_longitude, notes)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).bind(
			warning.id,
			warning.warning_number,
			warning.license_plate,
			warning.state_province,
			warning.issued_by,
			warning.warning_type,
			warning.warning_reason,
			warning.location || null,
			warning.gps_latitude || null,
			warning.gps_longitude || null,
			warning.notes || null
		).run();

		if (!result.success) {
			throw new HTTPException(500, { message: 'Failed to create warning' });
		}

		// Log the enforcement activity
		await c.env.DB.prepare(`
			INSERT INTO enforcement_activities (id, officer_id, activity_type, license_plate, state_province, location, gps_latitude, gps_longitude, result)
			VALUES (?, ?, 'warning', ?, ?, ?, ?, ?, 'warning_issued')
		`).bind(
			generateId(),
			body.issued_by,
			plate,
			state,
			body.location || null,
			body.gps_latitude || null,
			body.gps_longitude || null
		).run();

		return c.json({
			success: true,
			data: warning,
			message: 'Parking warning issued successfully'
		}, 201);

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		console.error('Warning issuance error:', error);
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Get tickets by officer and/or date
app.get('/api/enforcement/tickets', async (c) => {
	try {
		const officerId = c.req.query('officer_id');
		const date = c.req.query('date');
		const status = c.req.query('status') as ViolationStatus;
		const licensePlate = c.req.query('license_plate');

		let query = `
			SELECT
				v.*,
				eo.badge_number,
				eo.first_name || ' ' || eo.last_name as officer_name
			FROM violations v
			JOIN enforcement_officers eo ON v.issued_by = eo.id
			WHERE 1=1
		`;

		const params: any[] = [];

		if (officerId) {
			query += ` AND v.issued_by = ?`;
			params.push(officerId);
		}

		if (date) {
			query += ` AND DATE(v.issued_at) = ?`;
			params.push(date);
		}

		if (status) {
			query += ` AND v.status = ?`;
			params.push(status);
		}

		if (licensePlate) {
			query += ` AND v.license_plate = ?`;
			params.push(licensePlate.toUpperCase());
		}

		query += ` ORDER BY v.issued_at DESC`;

		const tickets = await c.env.DB.prepare(query).bind(...params).all();

		return c.json({
			success: true,
			data: tickets.results,
			meta: { count: tickets.results.length }
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Void a ticket
app.put('/api/enforcement/tickets/:ticketId/void', async (c) => {
	try {
		const ticketId = c.req.param('ticketId');
		const body = await c.req.json() as VoidViolationInput;

		if (!body.voided_reason) {
			throw new HTTPException(400, { message: 'Missing required field: voided_reason' });
		}

		// Check if ticket exists
		const ticket = await c.env.DB.prepare(`
			SELECT id, status FROM violations WHERE id = ?
		`).bind(ticketId).first();

		if (!ticket) {
			throw new HTTPException(404, { message: 'Ticket not found' });
		}

		if (ticket.status === 'voided') {
			throw new HTTPException(409, { message: 'Ticket is already voided' });
		}

		const result = await c.env.DB.prepare(`
			UPDATE violations SET
				status = 'voided',
				voided_at = CURRENT_TIMESTAMP,
				voided_reason = ?,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`).bind(body.voided_reason, ticketId).run();

		if (!result.success) {
			throw new HTTPException(500, { message: 'Failed to void ticket' });
		}

		return c.json({
			success: true,
			message: 'Ticket voided successfully'
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Get warnings by officer and/or date
app.get('/api/enforcement/warnings', async (c) => {
	try {
		const officerId = c.req.query('officer_id');
		const date = c.req.query('date');
		const licensePlate = c.req.query('license_plate');

		let query = `
			SELECT
				w.*,
				eo.badge_number,
				eo.first_name || ' ' || eo.last_name as officer_name
			FROM warnings w
			JOIN enforcement_officers eo ON w.issued_by = eo.id
			WHERE 1=1
		`;

		const params: any[] = [];

		if (officerId) {
			query += ` AND w.issued_by = ?`;
			params.push(officerId);
		}

		if (date) {
			query += ` AND DATE(w.issued_at) = ?`;
			params.push(date);
		}

		if (licensePlate) {
			query += ` AND w.license_plate = ?`;
			params.push(licensePlate.toUpperCase());
		}

		query += ` ORDER BY w.issued_at DESC`;

		const warnings = await c.env.DB.prepare(query).bind(...params).all();

		return c.json({
			success: true,
			data: warnings.results,
			meta: { count: warnings.results.length }
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Log enforcement activity
app.post('/api/enforcement/activities', async (c) => {
	try {
		const body = await c.req.json() as CreateEnforcementActivityInput;

		// Validate required fields
		if (!body.officer_id || !body.activity_type) {
			throw new HTTPException(400, {
				message: 'Missing required fields: officer_id, activity_type'
			});
		}

		// Validate GPS coordinates if provided
		if (!validateGPSCoordinates(body.gps_latitude, body.gps_longitude)) {
			throw new HTTPException(400, { message: 'Invalid GPS coordinates' });
		}

		// Check if officer exists and is active
		const officer = await c.env.DB.prepare(`
			SELECT id FROM enforcement_officers WHERE id = ? AND is_active = TRUE
		`).bind(body.officer_id).first();

		if (!officer) {
			throw new HTTPException(404, { message: 'Enforcement officer not found or inactive' });
		}

		const activity: EnforcementActivity = {
			id: generateId(),
			officer_id: body.officer_id,
			activity_type: body.activity_type,
			license_plate: body.license_plate?.toUpperCase() || undefined,
			state_province: body.state_province?.toUpperCase() || undefined,
			location: body.location || undefined,
			gps_latitude: body.gps_latitude || undefined,
			gps_longitude: body.gps_longitude || undefined,
			result: body.result || undefined,
			notes: body.notes || undefined,
			performed_at: new Date(),
			created_at: new Date()
		};

		const result = await c.env.DB.prepare(`
			INSERT INTO enforcement_activities (id, officer_id, activity_type, license_plate, state_province, location, gps_latitude, gps_longitude, result, notes, performed_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).bind(
			activity.id,
			activity.officer_id,
			activity.activity_type,
			activity.license_plate || null,
			activity.state_province || null,
			activity.location || null,
			activity.gps_latitude || null,
			activity.gps_longitude || null,
			activity.result || null,
			activity.notes || null,
			activity.performed_at.toISOString()
		).run();

		if (!result.success) {
			throw new HTTPException(500, { message: 'Failed to log enforcement activity' });
		}

		return c.json({
			success: true,
			data: activity,
			message: 'Enforcement activity logged successfully'
		}, 201);

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Get enforcement activities
app.get('/api/enforcement/activities', async (c) => {
	try {
		const officerId = c.req.query('officer_id');
		const date = c.req.query('date');
		const activityType = c.req.query('activity_type') as EnforcementActivityType;

		let query = `
			SELECT
				ea.*,
				eo.badge_number,
				eo.first_name || ' ' || eo.last_name as officer_name
			FROM enforcement_activities ea
			JOIN enforcement_officers eo ON ea.officer_id = eo.id
			WHERE 1=1
		`;

		const params: any[] = [];

		if (officerId) {
			query += ` AND ea.officer_id = ?`;
			params.push(officerId);
		}

		if (date) {
			query += ` AND DATE(ea.performed_at) = ?`;
			params.push(date);
		}

		if (activityType) {
			query += ` AND ea.activity_type = ?`;
			params.push(activityType);
		}

		query += ` ORDER BY ea.performed_at DESC`;

		const activities = await c.env.DB.prepare(query).bind(...params).all();

		return c.json({
			success: true,
			data: activities.results,
			meta: { count: activities.results.length }
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Get activity summary for an officer
app.get('/api/enforcement/activities/summary', async (c) => {
	try {
		const officerId = c.req.query('officer_id');
		const period = c.req.query('period') || 'today'; // today, week, month

		if (!officerId) {
			throw new HTTPException(400, { message: 'Missing required parameter: officer_id' });
		}

		let dateFilter = '';
		switch (period) {
			case 'today':
				dateFilter = `AND DATE(ea.performed_at) = DATE('now')`;
				break;
			case 'week':
				dateFilter = `AND ea.performed_at >= DATE('now', '-7 days')`;
				break;
			case 'month':
				dateFilter = `AND ea.performed_at >= DATE('now', '-30 days')`;
				break;
			default:
				dateFilter = `AND DATE(ea.performed_at) = DATE('now')`;
		}

		const summary = await c.env.DB.prepare(`
			SELECT
				COUNT(*) as total_activities,
				COUNT(CASE WHEN activity_type = 'scan' THEN 1 END) as total_scans,
				COUNT(CASE WHEN activity_type = 'ticket' THEN 1 END) as total_tickets,
				COUNT(CASE WHEN activity_type = 'warning' THEN 1 END) as total_warnings,
				COUNT(CASE WHEN activity_type = 'patrol' THEN 1 END) as total_patrols
			FROM enforcement_activities ea
			WHERE ea.officer_id = ? ${dateFilter}
		`).bind(officerId).first();

		return c.json({
			success: true,
			data: {
				officer_id: officerId,
				period: period,
				summary: summary
			}
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// =====================================================
// PERMIT MANAGEMENT
// =====================================================

// Get all permit types
app.get('/api/permit-types', async (c) => {
	try {
		const permitTypes = await c.env.DB.prepare(`
      SELECT * FROM permit_types WHERE is_active = TRUE ORDER BY name
    `).all();

		return c.json({
			success: true,
			data: permitTypes.results
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Get active permit requests (for admin/enforcement)
app.get('/api/permit-requests', async (c) => {
	try {
		const status = c.req.query('status') as PermitRequestStatus;
		const page = parseInt(c.req.query('page') || '1');
		const limit = parseInt(c.req.query('limit') || '20');
		const offset = (page - 1) * limit;

		let query = `
      SELECT
        pr.*,
        t.first_name || ' ' || t.last_name as tenant_name,
        t.email as tenant_email,
        t.unit_number,
        v.license_plate,
        v.make,
        v.model,
        v.color,
        v.state_province,
        pt.name as permit_type_name
      FROM permit_requests pr
      JOIN tenants t ON pr.tenant_id = t.id
      JOIN vehicles v ON pr.vehicle_id = v.id
      JOIN permit_types pt ON pr.permit_type_id = pt.id
      WHERE t.is_active = TRUE
    `;

		const params = [];

		if (status) {
			query += ` AND pr.status = ?`;
			params.push(status);
		}

		query += ` ORDER BY pr.priority DESC, pr.submitted_at ASC LIMIT ? OFFSET ?`;
		params.push(limit, offset);

		const requests = await c.env.DB.prepare(query).bind(...params).all();

		return c.json({
			success: true,
			data: requests.results,
			meta: {
				page,
				limit,
				count: requests.results.length,
				has_more: requests.results.length === limit
			}
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// =====================================================
// SHIFT MANAGEMENT ENDPOINTS
// =====================================================

// Start a shift
app.post('/api/enforcement/shifts/start', async (c) => {
	try {
		const body = await c.req.json();
		const { officer_id, location, gps_latitude, gps_longitude } = body;

		if (!officer_id) {
			throw new HTTPException(400, { message: 'Missing required field: officer_id' });
		}

		// Validate GPS coordinates if provided
		if (!validateGPSCoordinates(gps_latitude, gps_longitude)) {
			throw new HTTPException(400, { message: 'Invalid GPS coordinates' });
		}

		// Check if officer exists and is active
		const officer = await c.env.DB.prepare(`
			SELECT id FROM enforcement_officers WHERE id = ? AND is_active = TRUE
		`).bind(officer_id).first();

		if (!officer) {
			throw new HTTPException(404, { message: 'Enforcement officer not found or inactive' });
		}

		// Check if officer already has an active shift today
		const existingShift = await c.env.DB.prepare(`
			SELECT id FROM shift_reports
			WHERE officer_id = ? AND shift_date = DATE('now') AND shift_end_time IS NULL
		`).bind(officer_id).first();

		if (existingShift) {
			throw new HTTPException(409, { message: 'Officer already has an active shift today' });
		}

		// Create shift report
		const shiftId = generateId();
		const shiftReport: ShiftReport = {
			id: shiftId,
			report_number: generateShiftReportNumber(),
			officer_id: officer_id,
			shift_date: new Date(),
			shift_start_time: new Date(),
			shift_end_time: undefined,
			total_scans: 0,
			total_tickets: 0,
			total_warnings: 0,
			total_violations_found: 0,
			patrol_areas: undefined,
			incidents: undefined,
			summary: undefined,
			submitted_at: new Date(),
			created_at: new Date(),
			updated_at: new Date()
		};

		const result = await c.env.DB.prepare(`
			INSERT INTO shift_reports (id, report_number, officer_id, shift_date, shift_start_time)
			VALUES (?, ?, ?, ?, ?)
		`).bind(
			shiftReport.id,
			shiftReport.report_number,
			shiftReport.officer_id,
			shiftReport.shift_date.toISOString().split('T')[0],
			shiftReport.shift_start_time!.toISOString()
		).run();

		if (!result.success) {
			throw new HTTPException(500, { message: 'Failed to start shift' });
		}

		// Log shift start activity
		await c.env.DB.prepare(`
			INSERT INTO enforcement_activities (id, officer_id, activity_type, location, gps_latitude, gps_longitude, result, performed_at)
			VALUES (?, ?, 'shift_start', ?, ?, ?, 'shift_started', ?)
		`).bind(
			generateId(),
			officer_id,
			location || null,
			gps_latitude || null,
			gps_longitude || null,
			getCurrentTimestamp()
		).run();

		return c.json({
			success: true,
			data: {
				shift_id: shiftId,
				officer_id: officer_id,
				shift_start_time: shiftReport.shift_start_time,
				report_number: shiftReport.report_number
			},
			message: 'Shift started successfully'
		}, 201);

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// End a shift
app.post('/api/enforcement/shifts/end', async (c) => {
	try {
		const body = await c.req.json();
		const { officer_id, summary, incidents, patrol_areas, location, gps_latitude, gps_longitude } = body;

		if (!officer_id) {
			throw new HTTPException(400, { message: 'Missing required field: officer_id' });
		}

		// Find active shift for officer
		const activeShift = await c.env.DB.prepare(`
			SELECT id FROM shift_reports
			WHERE officer_id = ? AND shift_date = DATE('now') AND shift_end_time IS NULL
		`).bind(officer_id).first();

		if (!activeShift) {
			throw new HTTPException(404, { message: 'No active shift found for this officer today' });
		}

		// Get shift statistics from activities
		const shiftStats = await c.env.DB.prepare(`
			SELECT
				COUNT(CASE WHEN activity_type = 'scan' THEN 1 END) as total_scans,
				COUNT(CASE WHEN activity_type = 'ticket' THEN 1 END) as total_tickets,
				COUNT(CASE WHEN activity_type = 'warning' THEN 1 END) as total_warnings,
				COUNT(CASE WHEN activity_type = 'patrol' THEN 1 END) as total_patrols
			FROM enforcement_activities
			WHERE officer_id = ? AND DATE(performed_at) = DATE('now')
		`).bind(officer_id).first();

		// Update shift report
		const result = await c.env.DB.prepare(`
			UPDATE shift_reports SET
				shift_end_time = CURRENT_TIMESTAMP,
				total_scans = ?,
				total_tickets = ?,
				total_warnings = ?,
				total_violations_found = ?,
				patrol_areas = ?,
				incidents = ?,
				summary = ?,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`).bind(
			(shiftStats?.total_scans as number) || 0,
			(shiftStats?.total_tickets as number) || 0,
			(shiftStats?.total_warnings as number) || 0,
			((shiftStats?.total_tickets as number) || 0) + ((shiftStats?.total_warnings as number) || 0),
			patrol_areas ? JSON.stringify(patrol_areas) : null,
			incidents ? JSON.stringify(incidents) : null,
			summary || null,
			activeShift.id
		).run();

		if (!result.success) {
			throw new HTTPException(500, { message: 'Failed to end shift' });
		}

		// Log shift end activity
		await c.env.DB.prepare(`
			INSERT INTO enforcement_activities (id, officer_id, activity_type, location, gps_latitude, gps_longitude, result, performed_at)
			VALUES (?, ?, 'shift_end', ?, ?, ?, 'shift_ended', ?)
		`).bind(
			generateId(),
			officer_id,
			location || null,
			gps_latitude || null,
			gps_longitude || null,
			getCurrentTimestamp()
		).run();

		return c.json({
			success: true,
			data: {
				shift_id: activeShift.id,
				officer_id: officer_id,
				shift_end_time: new Date(),
				statistics: shiftStats
			},
			message: 'Shift ended successfully'
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Get current shift for an officer
app.get('/api/enforcement/shifts/current', async (c) => {
	try {
		const officerId = c.req.query('officer_id');

		if (!officerId) {
			throw new HTTPException(400, { message: 'Missing required parameter: officer_id' });
		}

		const currentShift = await c.env.DB.prepare(`
			SELECT
				sr.*,
				eo.badge_number,
				eo.first_name || ' ' || eo.last_name as officer_name
			FROM shift_reports sr
			JOIN enforcement_officers eo ON sr.officer_id = eo.id
			WHERE sr.officer_id = ? AND sr.shift_date = DATE('now')
			ORDER BY sr.shift_start_time DESC
			LIMIT 1
		`).bind(officerId).first();

		if (!currentShift) {
			return c.json({
				success: true,
				data: null,
				message: 'No shift found for today'
			});
		}

		return c.json({
			success: true,
			data: currentShift
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Get shift reports
app.get('/api/enforcement/shifts/reports', async (c) => {
	try {
		const officerId = c.req.query('officer_id');
		const date = c.req.query('date');
		const startDate = c.req.query('start_date');
		const endDate = c.req.query('end_date');

		let query = `
			SELECT
				sr.*,
				eo.badge_number,
				eo.first_name || ' ' || eo.last_name as officer_name
			FROM shift_reports sr
			JOIN enforcement_officers eo ON sr.officer_id = eo.id
			WHERE 1=1
		`;

		const params: any[] = [];

		if (officerId) {
			query += ` AND sr.officer_id = ?`;
			params.push(officerId);
		}

		if (date) {
			query += ` AND sr.shift_date = ?`;
			params.push(date);
		}

		if (startDate && endDate) {
			query += ` AND sr.shift_date BETWEEN ? AND ?`;
			params.push(startDate, endDate);
		}

		query += ` ORDER BY sr.shift_date DESC, sr.shift_start_time DESC`;

		const reports = await c.env.DB.prepare(query).bind(...params).all();

		return c.json({
			success: true,
			data: reports.results,
			meta: { count: reports.results.length }
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// =====================================================
// OFFLINE SYNC ENDPOINTS
// =====================================================

// Queue offline action
app.post('/api/enforcement/sync/queue', async (c) => {
	try {
		const body = await c.req.json();
		const { officer_id, action_type, action_data, performed_at } = body;

		if (!officer_id || !action_type || !action_data || !performed_at) {
			throw new HTTPException(400, {
				message: 'Missing required fields: officer_id, action_type, action_data, performed_at'
			});
		}

		const offlineAction: OfflineAction = {
			id: generateId(),
			officer_id: officer_id,
			action_type: action_type,
			action_data: JSON.stringify(action_data),
			performed_at: new Date(performed_at),
			synced_at: undefined,
			is_synced: false,
			created_at: new Date()
		};

		const result = await c.env.DB.prepare(`
			INSERT INTO offline_actions (id, officer_id, action_type, action_data, performed_at, is_synced)
			VALUES (?, ?, ?, ?, ?, ?)
		`).bind(
			offlineAction.id,
			offlineAction.officer_id,
			offlineAction.action_type,
			offlineAction.action_data,
			offlineAction.performed_at.toISOString(),
			offlineAction.is_synced
		).run();

		if (!result.success) {
			throw new HTTPException(500, { message: 'Failed to queue offline action' });
		}

		return c.json({
			success: true,
			data: { action_id: offlineAction.id },
			message: 'Offline action queued successfully'
		}, 201);

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Process queued offline actions
app.post('/api/enforcement/sync/process', async (c) => {
	try {
		const body = await c.req.json();
		const { officer_id } = body;

		if (!officer_id) {
			throw new HTTPException(400, { message: 'Missing required field: officer_id' });
		}

		// Get all unsynced actions for the officer
		const unsyncedActions = await c.env.DB.prepare(`
			SELECT * FROM offline_actions
			WHERE officer_id = ? AND is_synced = FALSE
			ORDER BY performed_at ASC
		`).bind(officer_id).all();

		const processResults = [];
		let successCount = 0;
		let errorCount = 0;

		for (const action of unsyncedActions.results) {
			try {
				const actionData = JSON.parse(action.action_data as string);

				// Process based on action type
				switch (action.action_type) {
					case 'ticket':
						// Process ticket creation
						const ticketResult = await c.env.DB.prepare(`
							INSERT INTO violations (id, ticket_number, license_plate, state_province, issued_by, violation_type, violation_reason, location, gps_latitude, gps_longitude, fine_amount, notes, status, issued_at)
							VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?)
						`).bind(
							actionData.id,
							actionData.ticket_number,
							actionData.license_plate,
							actionData.state_province,
							actionData.issued_by,
							actionData.violation_type,
							actionData.violation_reason,
							actionData.location || null,
							actionData.gps_latitude || null,
							actionData.gps_longitude || null,
							actionData.fine_amount || null,
							actionData.notes || null,
							action.performed_at
						).run();

						if (ticketResult.success) {
							successCount++;
						} else {
							errorCount++;
						}
						break;

					case 'warning':
						// Process warning creation
						const warningResult = await c.env.DB.prepare(`
							INSERT INTO warnings (id, warning_number, license_plate, state_province, issued_by, warning_type, warning_reason, location, gps_latitude, gps_longitude, notes, issued_at)
							VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
						`).bind(
							actionData.id,
							actionData.warning_number,
							actionData.license_plate,
							actionData.state_province,
							actionData.issued_by,
							actionData.warning_type,
							actionData.warning_reason,
							actionData.location || null,
							actionData.gps_latitude || null,
							actionData.gps_longitude || null,
							actionData.notes || null,
							action.performed_at
						).run();

						if (warningResult.success) {
							successCount++;
						} else {
							errorCount++;
						}
						break;

					case 'scan':
						// Process scan activity
						const scanResult = await c.env.DB.prepare(`
							INSERT INTO enforcement_activities (id, officer_id, activity_type, license_plate, state_province, location, gps_latitude, gps_longitude, result, performed_at)
							VALUES (?, ?, 'scan', ?, ?, ?, ?, ?, ?, ?)
						`).bind(
							actionData.id,
							actionData.officer_id,
							actionData.license_plate,
							actionData.state_province,
							actionData.location || null,
							actionData.gps_latitude || null,
							actionData.gps_longitude || null,
							actionData.result || null,
							action.performed_at
						).run();

						if (scanResult.success) {
							successCount++;
						} else {
							errorCount++;
						}
						break;

					default:
						errorCount++;
				}

				// Mark action as synced
				await c.env.DB.prepare(`
					UPDATE offline_actions SET
						is_synced = TRUE,
						synced_at = CURRENT_TIMESTAMP
					WHERE id = ?
				`).bind(action.id).run();

				processResults.push({
					action_id: action.id,
					action_type: action.action_type,
					status: 'success'
				});

			} catch (actionError) {
				errorCount++;
				processResults.push({
					action_id: action.id,
					action_type: action.action_type,
					status: 'error',
					error: actionError instanceof Error ? actionError.message : 'Unknown error'
				});
			}
		}

		return c.json({
			success: true,
			data: {
				officer_id: officer_id,
				total_processed: unsyncedActions.results.length,
				success_count: successCount,
				error_count: errorCount,
				details: processResults
			},
			message: `Processed ${unsyncedActions.results.length} offline actions`
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Get sync status
app.get('/api/enforcement/sync/status', async (c) => {
	try {
		const officerId = c.req.query('officer_id');

		if (!officerId) {
			throw new HTTPException(400, { message: 'Missing required parameter: officer_id' });
		}

		const syncStatus = await c.env.DB.prepare(`
			SELECT
				COUNT(*) as total_actions,
				COUNT(CASE WHEN is_synced = TRUE THEN 1 END) as synced_actions,
				COUNT(CASE WHEN is_synced = FALSE THEN 1 END) as pending_actions,
				MAX(CASE WHEN is_synced = TRUE THEN synced_at END) as last_sync_time
			FROM offline_actions
			WHERE officer_id = ?
		`).bind(officerId).first();

		return c.json({
			success: true,
			data: {
				officer_id: officerId,
				...syncStatus
			}
		});

	} catch (error) {
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

// Error handler
app.onError((err, c) => {
	if (err instanceof HTTPException) {
		return c.json({
			success: false,
			error: err.message
		}, err.status);
	}

	console.error('Unhandled error:', err);
	return c.json({
		success: false,
		error: 'Internal server error'
	}, 500);
});

// 404 handler
app.notFound((c) => {
	return c.json({
		success: false,
		error: 'Not found'
	}, 404);
});

export default app;
