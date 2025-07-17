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
	PermitRequestStatus
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

// License plate lookup - core functionality
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
			active_permits: activePermits.results as any,
			pending_requests: pendingRequests.results as any,
			permit_history: permitHistory.results as any
		};

		return c.json({
			success: true,
			data: result
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
