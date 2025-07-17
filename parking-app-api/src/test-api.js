// Test data and API validation script
// This can be run with: wrangler dev

// Test endpoints using the local development server
const BASE_URL = 'http://localhost:8787';

// Test data
const testTenant = {
  email: 'john.doe@example.com',
  first_name: 'John',
  last_name: 'Doe',
  unit_number: '101',
  phone: '555-0101',
  building_code: 'A'
};

const testVehicle = {
  license_plate: 'ABC123',
  make: 'Toyota',
  model: 'Camry',
  year: 2020,
  color: 'Blue',
  state_province: 'CA'
};

const testPermitRequest = {
  permit_type_id: 'resident',
  requested_start_date: '2025-01-01',
  requested_end_date: '2025-12-31',
  notes: 'Primary vehicle for unit 101'
};

async function testAPI() {
  console.log('🧪 Testing Parking Permits API');
  console.log('================================');

  try {
    // 1. Test health check
    console.log('1. Health check...');
    const healthResponse = await fetch(`${BASE_URL}/health`);
    const health = await healthResponse.json();
    console.log('✅ Health:', health);

    // 2. Test create tenant
    console.log('\n2. Creating tenant...');
    const tenantResponse = await fetch(`${BASE_URL}/api/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testTenant)
    });
    const tenant = await tenantResponse.json();
    console.log('✅ Tenant created:', tenant);

    const tenantId = tenant.data.id;

    // 3. Test create vehicle
    console.log('\n3. Creating vehicle...');
    const vehicleResponse = await fetch(`${BASE_URL}/api/tenants/${tenantId}/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testVehicle)
    });
    const vehicle = await vehicleResponse.json();
    console.log('✅ Vehicle created:', vehicle);

    const vehicleId = vehicle.data.id;

    // 4. Test submit permit request
    console.log('\n4. Submitting permit request...');
    const permitRequestResponse = await fetch(`${BASE_URL}/api/permit-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...testPermitRequest,
        tenant_id: tenantId,
        vehicle_id: vehicleId
      })
    });
    const permitRequest = await permitRequestResponse.json();
    console.log('✅ Permit request submitted:', permitRequest);

    // 5. Test license plate lookup
    console.log('\n5. Testing license plate lookup...');
    const lookupResponse = await fetch(`${BASE_URL}/api/license-plates/ABC123?state=CA`);
    const lookup = await lookupResponse.json();
    console.log('✅ License plate lookup:', lookup);

    // 6. Test get permit types
    console.log('\n6. Getting permit types...');
    const typesResponse = await fetch(`${BASE_URL}/api/permit-types`);
    const types = await typesResponse.json();
    console.log('✅ Permit types:', types);

    // 7. Test get tenant's permit requests
    console.log('\n7. Getting tenant permit requests...');
    const requestsResponse = await fetch(`${BASE_URL}/api/tenants/${tenantId}/permit-requests`);
    const requests = await requestsResponse.json();
    console.log('✅ Tenant requests:', requests);

    console.log('\n🎉 All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Test invalid license plate
async function testInvalidLicensePlate() {
  console.log('\n🧪 Testing invalid license plate...');

  try {
    const response = await fetch(`${BASE_URL}/api/license-plates/INVALID123?state=CA`);
    const result = await response.json();
    console.log('✅ Invalid plate test:', result);
  } catch (error) {
    console.error('❌ Invalid plate test failed:', error);
  }
}

// Test non-existent license plate
async function testNonExistentLicensePlate() {
  console.log('\n🧪 Testing non-existent license plate...');

  try {
    const response = await fetch(`${BASE_URL}/api/license-plates/XYZ999?state=CA`);
    const result = await response.json();
    console.log('✅ Non-existent plate test:', result);
  } catch (error) {
    console.error('❌ Non-existent plate test failed:', error);
  }
}

// Export for manual testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testAPI, testInvalidLicensePlate, testNonExistentLicensePlate };
}

// Instructions for manual testing
console.log(`
📋 Manual Testing Instructions:
==============================

1. Start the development server:
   wrangler dev

2. Open another terminal and test endpoints:

   # Health check
   curl ${BASE_URL}/health

   # Create tenant
   curl -X POST ${BASE_URL}/api/tenants \\
     -H "Content-Type: application/json" \\
     -d '${JSON.stringify(testTenant)}'

   # License plate lookup
   curl ${BASE_URL}/api/license-plates/ABC123?state=CA

   # Get permit types
   curl ${BASE_URL}/api/permit-types

3. Use a tool like Postman or Insomnia for more complex testing
`);
