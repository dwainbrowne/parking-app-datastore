#!/usr/bin/env node

/**
 * Database Test Script
 * Tests the centralized permit request API and database operations
 */

const API_BASE_URL = 'http://localhost:8787';

// Test data for centralized permit request
const testRequests = [
  {
    name: 'Guest Permit - Auto Approved',
    data: {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@test.com',
      phone: '555-123-4567',
      unit_number: '101',
      building_code: 'A',
      full_address: '123 Main Street, Apt 101, Anytown, CA 90210',
      license_plate: 'ABC123',
      make: 'Toyota',
      model: 'Camry',
      year: 2020,
      color: 'Blue',
      state_province: 'CA',
      country: 'US',
      permit_type_id: 'guest',
      notes: 'Guest visiting for the weekend'
    }
  },
  {
    name: 'Temporary Permit - Requires Approval',
    data: {
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane.smith@test.com',
      phone: '555-987-6543',
      unit_number: '205',
      building_code: 'B',
      full_address: '456 Oak Avenue, Unit 205, Anytown, CA 90210',
      license_plate: 'XYZ789',
      make: 'Honda',
      model: 'Civic',
      year: 2019,
      color: 'Red',
      state_province: 'CA',
      country: 'US',
      permit_type_id: 'temporary',
      requested_start_date: '2025-07-18',
      requested_end_date: '2025-08-18',
      notes: 'Temporary permit for visiting family member',
      priority: 2
    }
  },
  {
    name: 'Minimal Fields - Default Values',
    data: {
      first_name: 'Bob',
      last_name: 'Johnson',
      email: 'bob.johnson@test.com',
      license_plate: 'DEF456',
      make: 'Ford',
      model: 'Focus',
      color: 'White',
      state_province: 'CA'
    }
  },
  {
    name: 'Existing Tenant - New Vehicle',
    data: {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@test.com',
      phone: '555-123-4567',
      unit_number: '101',
      full_address: '123 Main Street, Apt 101, Anytown, CA 90210 (Updated)',
      license_plate: 'GHI789',
      make: 'Nissan',
      model: 'Altima',
      year: 2021,
      color: 'Silver',
      state_province: 'CA',
      permit_type_id: 'guest',
      notes: 'Second vehicle for existing tenant'
    }
  }
];

// Test functions
async function testHealthCheck() {
  console.log('\n🔍 Testing Health Check...');
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();

    if (response.ok) {
      console.log('✅ Health check passed:', data);
      return true;
    } else {
      console.log('❌ Health check failed:', data);
      return false;
    }
  } catch (error) {
    console.log('❌ Health check error:', error.message);
    return false;
  }
}

async function testPermitTypes() {
  console.log('\n🔍 Testing Permit Types...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/permit-types`);
    const data = await response.json();

    if (response.ok) {
      console.log('✅ Permit types retrieved:', data.data.length, 'types');
      data.data.forEach(type => {
        console.log(`  - ${type.name} (${type.id}): ${type.duration_days} days`);
      });
      return true;
    } else {
      console.log('❌ Permit types failed:', data);
      return false;
    }
  } catch (error) {
    console.log('❌ Permit types error:', error.message);
    return false;
  }
}

async function testCentralizedPermitRequest(testCase) {
  console.log(`\n🔍 Testing: ${testCase.name}`);
  try {
    const response = await fetch(`${API_BASE_URL}/api/submit-permit-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testCase.data)
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Success:', data.message);
      console.log('  - Tenant ID:', data.data.tenant_id);
      console.log('  - Vehicle ID:', data.data.vehicle_id);
      console.log('  - Request ID:', data.data.permit_request_id);
      console.log('  - Auto Approved:', data.data.auto_approved);

      if (data.data.permit_request.permit_number) {
        console.log('  - Permit Number:', data.data.permit_request.permit_number);
      }

      return {
        success: true,
        tenantId: data.data.tenant_id,
        vehicleId: data.data.vehicle_id,
        licensePlate: testCase.data.license_plate
      };
    } else {
      console.log('❌ Failed:', data.error);
      return { success: false };
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return { success: false };
  }
}

async function testLicensePlateLookup(licensePlate, state = 'CA') {
  console.log(`\n🔍 Testing License Plate Lookup: ${licensePlate}`);
  try {
    const response = await fetch(`${API_BASE_URL}/api/license-plates/${licensePlate}?state=${state}`);
    const data = await response.json();

    if (response.ok) {
      const result = data.data;
      console.log('✅ License plate lookup successful');
      console.log('  - Registered:', result.is_registered);

      if (result.is_registered) {
        console.log('  - Tenant:', result.tenant_info.name);
        console.log('  - Unit:', result.tenant_info.unit_number);
        console.log('  - Vehicle:', `${result.vehicle_info.make} ${result.vehicle_info.model} (${result.vehicle_info.color})`);
        console.log('  - Active Permits:', result.active_permits.length);
        console.log('  - Pending Requests:', result.pending_requests.length);
      }

      return true;
    } else {
      console.log('❌ License plate lookup failed:', data.error);
      return false;
    }
  } catch (error) {
    console.log('❌ License plate lookup error:', error.message);
    return false;
  }
}

async function testErrorHandling() {
  console.log('\n🔍 Testing Error Handling...');

  // Test invalid email
  console.log('  Testing invalid email...');
  const invalidEmailResponse = await fetch(`${API_BASE_URL}/api/submit-permit-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      first_name: 'Test',
      last_name: 'User',
      email: 'invalid-email',
      license_plate: 'TEST123',
      make: 'Test',
      model: 'Car',
      color: 'Black',
      state_province: 'CA'
    })
  });

  const invalidEmailData = await invalidEmailResponse.json();
  if (invalidEmailResponse.status === 400 && invalidEmailData.error.includes('Invalid email')) {
    console.log('  ✅ Invalid email handling works');
  } else {
    console.log('  ❌ Invalid email handling failed');
  }

  // Test missing required fields
  console.log('  Testing missing required fields...');
  const missingFieldsResponse = await fetch(`${API_BASE_URL}/api/submit-permit-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      first_name: 'Test',
      email: 'test@email.com'
    })
  });

  const missingFieldsData = await missingFieldsResponse.json();
  if (missingFieldsResponse.status === 400 && missingFieldsData.error.includes('Missing required fields')) {
    console.log('  ✅ Missing fields handling works');
  } else {
    console.log('  ❌ Missing fields handling failed');
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Centralized Permit Request API Tests');
  console.log('=' .repeat(60));

  // Test health check first
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    console.log('\n❌ Health check failed. Make sure the server is running on localhost:8787');
    process.exit(1);
  }

  // Test permit types
  await testPermitTypes();

  // Test centralized permit requests
  const results = [];
  for (const testCase of testRequests) {
    const result = await testCentralizedPermitRequest(testCase);
    results.push(result);
  }

  // Test license plate lookups for successful registrations
  const successfulResults = results.filter(r => r.success);
  for (const result of successfulResults) {
    await testLicensePlateLookup(result.licensePlate);
  }

  // Test error handling
  await testErrorHandling();

  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 Test Summary:');
  console.log(`✅ Successful permit requests: ${results.filter(r => r.success).length}`);
  console.log(`❌ Failed permit requests: ${results.filter(r => !r.success).length}`);
  console.log(`📋 Total tests: ${results.length}`);

  if (results.every(r => r.success)) {
    console.log('\n🎉 All tests passed! The centralized API is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above for details.');
  }
}

// Run the tests
runTests().catch(console.error);
