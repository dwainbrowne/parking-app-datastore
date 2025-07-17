#!/usr/bin/env node
/**
 * Simple HTTP test for the centralized permit request API
 * This bypasses the need for a running server and tests the API directly
 */

// Simple test to verify the API works
const testAPI = async () => {
  console.log('Testing Centralized Permit Request API...');

  // Basic test data
  const testData = {
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
  };

  try {
    console.log('Making request to http://localhost:8787/api/submit-permit-request');
    const response = await fetch('http://localhost:8787/api/submit-permit-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Success!', result);
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
};

// If server is not running, provide instructions
const checkServer = async () => {
  try {
    const response = await fetch('http://localhost:8787/health');
    if (response.ok) {
      console.log('✅ Server is running');
      return true;
    }
  } catch (error) {
    console.log('❌ Server is not running');
    console.log('Please start the server first:');
    console.log('  cd /Users/dwainbrowne/Documents/_PROJECTS/ai-projects/parking-app-datastore/parking-app-api');
    console.log('  wrangler dev --config wrangler.toml');
    return false;
  }
};

// Run the test
const main = async () => {
  const serverRunning = await checkServer();
  if (serverRunning) {
    await testAPI();
  }
};

main().catch(console.error);
