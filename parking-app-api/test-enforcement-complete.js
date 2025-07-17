#!/usr/bin/env node
/**
 * Comprehensive test script for the Parking Enforcement API
 * Tests all enforcement endpoints with proper sequencing and validation
 */

const baseUrl = 'http://localhost:8787';

// Test helper functions
async function makeRequest(method, path, body = null) {
  const url = `${baseUrl}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return {
      status: response.status,
      ok: response.ok,
      data,
      url
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      error: error.message,
      url
    };
  }
}

function logTest(testName, passed, details = '') {
  const status = passed ? '✅' : '❌';
  console.log(`${status} ${testName}${details ? `: ${details}` : ''}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function logSection(sectionName) {
  console.log(`\n🔍 ${sectionName}`);
  console.log('='.repeat(50));
}

async function runTests() {
  console.log('🚀 Starting Parking Enforcement API Tests');
  console.log(`Base URL: ${baseUrl}`);

  // Store test data for cleanup
  const testData = {
    officers: [],
    tickets: [],
    warnings: [],
    activities: [],
    shifts: []
  };

  try {
    // ===== HEALTH CHECK =====
    logSection('Health Check');
    const health = await makeRequest('GET', '/health');
    logTest('Health endpoint', health.ok && health.data.status === 'healthy');

    // ===== ENFORCEMENT OFFICER MANAGEMENT =====
    logSection('Enforcement Officer Management');

    // Create test officer
    const createOfficer = await makeRequest('POST', '/api/enforcement/officers', {
      badge_number: 'TEST001',
      first_name: 'Test',
      last_name: 'Officer',
      email: 'test.officer@enforcement.gov',
      phone: '555-0001'
    });
    logTest('Create enforcement officer', createOfficer.ok);

    if (createOfficer.ok) {
      testData.officers.push(createOfficer.data.id);
    }

    // ===== LICENSE PLATE LOOKUP =====
    logSection('License Plate Lookup');

    // Test enhanced lookup with enforcement context
    const enhancedLookup = await makeRequest('GET', '/api/enforcement/license-plates/ABC123?state=CA&officer_id=officer-001');
    logTest('Enhanced license plate lookup', enhancedLookup.ok);
    logTest('Lookup includes enforcement data', enhancedLookup.ok && enhancedLookup.data.enforcement_context !== undefined);

    // Test unknown vehicle lookup
    const unknownLookup = await makeRequest('GET', '/api/enforcement/license-plates/UNKNOWN99?state=CA&officer_id=officer-001');
    logTest('Unknown vehicle lookup', unknownLookup.ok);
    logTest('Unknown vehicle marked as unregistered', unknownLookup.ok && !unknownLookup.data.is_registered);

    // ===== TICKET MANAGEMENT =====
    logSection('Ticket Management');

    // Issue a test ticket
    const issueTicket = await makeRequest('POST', '/api/enforcement/tickets', {
      license_plate: 'TESTPLATE',
      state_province: 'CA',
      issued_by: 'officer-001',
      violation_type: 'No Permit',
      violation_reason: 'Vehicle parked without valid permit',
      location: 'Test Parking Area',
      gps_latitude: 34.0522,
      gps_longitude: -118.2437,
      fine_amount: 75.00,
      evidence_photo_urls: ['https://example.com/photo1.jpg'],
      notes: 'Test ticket issuance'
    });
    logTest('Issue parking ticket', issueTicket.ok);

    let ticketId = null;
    if (issueTicket.ok) {
      ticketId = issueTicket.data.id;
      testData.tickets.push(ticketId);
    }

    // Test duplicate ticket prevention
    const duplicateTicket = await makeRequest('POST', '/api/enforcement/tickets', {
      license_plate: 'TESTPLATE',
      state_province: 'CA',
      issued_by: 'officer-001',
      violation_type: 'No Permit',
      violation_reason: 'Duplicate test ticket',
      location: 'Test Parking Area'
    });
    logTest('Duplicate ticket prevention', !duplicateTicket.ok || duplicateTicket.data.error);

    // Get tickets by officer
    const ticketsByOfficer = await makeRequest('GET', '/api/enforcement/tickets?officer_id=officer-001');
    logTest('Get tickets by officer', ticketsByOfficer.ok);

    // Void a ticket if we created one
    if (ticketId) {
      const voidTicket = await makeRequest('PUT', `/api/enforcement/tickets/${ticketId}/void`, {
        voided_reason: 'Test void operation'
      });
      logTest('Void ticket', voidTicket.ok);
    }

    // ===== WARNING MANAGEMENT =====
    logSection('Warning Management');

    // Issue a test warning
    const issueWarning = await makeRequest('POST', '/api/enforcement/warnings', {
      license_plate: 'ABC123',
      state_province: 'CA',
      issued_by: 'officer-001',
      warning_type: 'Permit Display',
      warning_reason: 'Permit not clearly visible',
      location: 'Building A Parking',
      notes: 'Test warning issuance'
    });
    logTest('Issue parking warning', issueWarning.ok);

    if (issueWarning.ok) {
      testData.warnings.push(issueWarning.data.id);
    }

    // Get warnings by officer
    const warningsByOfficer = await makeRequest('GET', '/api/enforcement/warnings?officer_id=officer-001');
    logTest('Get warnings by officer', warningsByOfficer.ok);

    // ===== ACTIVITY LOGGING =====
    logSection('Activity Logging');

    // Log scan activity
    const logScan = await makeRequest('POST', '/api/enforcement/activities', {
      officer_id: 'officer-001',
      activity_type: 'scan',
      license_plate: 'ABC123',
      state_province: 'CA',
      location: 'Building A Parking',
      result: 'valid',
      notes: 'Test scan activity'
    });
    logTest('Log scan activity', logScan.ok);

    // Log patrol activity
    const logPatrol = await makeRequest('POST', '/api/enforcement/activities', {
      officer_id: 'officer-001',
      activity_type: 'patrol',
      location: 'Main Street Area',
      result: 'patrol_completed',
      notes: 'Test patrol activity'
    });
    logTest('Log patrol activity', logPatrol.ok);

    // Get activities by officer
    const activitiesByOfficer = await makeRequest('GET', '/api/enforcement/activities?officer_id=officer-001');
    logTest('Get activities by officer', activitiesByOfficer.ok);

    // Get activity summary
    const activitySummary = await makeRequest('GET', '/api/enforcement/activities/summary?officer_id=officer-001&period=today');
    logTest('Get activity summary', activitySummary.ok);

    // ===== SHIFT MANAGEMENT =====
    logSection('Shift Management');

    // Start shift
    const startShift = await makeRequest('POST', '/api/enforcement/shifts/start', {
      officer_id: 'officer-001',
      location: 'Test Station',
      gps_latitude: 34.0522,
      gps_longitude: -118.2437
    });
    logTest('Start shift', startShift.ok);

    // Get current shift
    const currentShift = await makeRequest('GET', '/api/enforcement/shifts/current?officer_id=officer-001');
    logTest('Get current shift', currentShift.ok);
    logTest('Current shift is active', currentShift.ok && currentShift.data.shift_status === 'active');

    // Wait a moment before ending shift
    await new Promise(resolve => setTimeout(resolve, 1000));

    // End shift
    const endShift = await makeRequest('POST', '/api/enforcement/shifts/end', {
      officer_id: 'officer-001',
      summary: 'Test shift completed successfully',
      incidents: ['Test incident'],
      patrol_areas: ['Test Area 1', 'Test Area 2'],
      location: 'Test Station'
    });
    logTest('End shift', endShift.ok);

    // Get shift reports
    const shiftReports = await makeRequest('GET', '/api/enforcement/shifts/reports?officer_id=officer-001');
    logTest('Get shift reports', shiftReports.ok);

    // ===== OFFLINE SYNC =====
    logSection('Offline Sync');

    // Queue offline action
    const queueAction = await makeRequest('POST', '/api/enforcement/sync/queue', {
      officer_id: 'officer-001',
      action_type: 'ticket',
      action_data: {
        id: 'offline-test-001',
        license_plate: 'OFFLINE01',
        state_province: 'CA',
        issued_by: 'officer-001',
        violation_type: 'No Permit',
        violation_reason: 'Offline test ticket'
      },
      performed_at: new Date().toISOString()
    });
    logTest('Queue offline action', queueAction.ok);

    // Get sync status
    const syncStatus = await makeRequest('GET', '/api/enforcement/sync/status?officer_id=officer-001');
    logTest('Get sync status', syncStatus.ok);

    // Process queued actions
    const processQueue = await makeRequest('POST', '/api/enforcement/sync/process', {
      officer_id: 'officer-001'
    });
    logTest('Process queued actions', processQueue.ok);

    // ===== ERROR HANDLING TESTS =====
    logSection('Error Handling');

    // Test invalid license plate format
    const invalidPlate = await makeRequest('GET', '/api/enforcement/license-plates/TOOLONGPLATEFORMAT?state=CA&officer_id=officer-001');
    logTest('Invalid license plate rejection', !invalidPlate.ok || invalidPlate.data.error);

    // Test missing required fields
    const incompleteTicket = await makeRequest('POST', '/api/enforcement/tickets', {
      license_plate: 'INCOMPLETE'
    });
    logTest('Incomplete ticket rejection', !incompleteTicket.ok);

    // Test invalid GPS coordinates
    const invalidGPS = await makeRequest('POST', '/api/enforcement/tickets', {
      license_plate: 'TESTGPS',
      state_province: 'CA',
      issued_by: 'officer-001',
      violation_type: 'No Permit',
      violation_reason: 'Testing invalid GPS',
      gps_latitude: 91.0,
      gps_longitude: -181.0
    });
    logTest('Invalid GPS coordinates rejection', !invalidGPS.ok);

    // ===== INTEGRATION TEST =====
    logSection('Integration Test - Complete Workflow');

    // Complete enforcement workflow
    const workflowStart = await makeRequest('POST', '/api/enforcement/shifts/start', {
      officer_id: 'officer-001',
      location: 'Integration Test Area'
    });

    const workflowScan = await makeRequest('GET', '/api/enforcement/license-plates/WORKFLOW01?state=CA&officer_id=officer-001');

    const workflowTicket = await makeRequest('POST', '/api/enforcement/tickets', {
      license_plate: 'WORKFLOW01',
      state_province: 'CA',
      issued_by: 'officer-001',
      violation_type: 'No Permit',
      violation_reason: 'Integration test violation',
      location: 'Integration Test Area'
    });

    const workflowPatrol = await makeRequest('POST', '/api/enforcement/activities', {
      officer_id: 'officer-001',
      activity_type: 'patrol',
      location: 'Integration Test Area',
      result: 'patrol_completed'
    });

    const workflowEnd = await makeRequest('POST', '/api/enforcement/shifts/end', {
      officer_id: 'officer-001',
      summary: 'Integration test workflow completed'
    });

    const workflowPassed = workflowStart.ok && workflowScan.ok && workflowTicket.ok && workflowPatrol.ok && workflowEnd.ok;
    logTest('Complete enforcement workflow', workflowPassed);

    // ===== SUMMARY =====
    logSection('Test Summary');

    if (process.exitCode === 1) {
      console.log('❌ Some tests failed. Check the output above for details.');
    } else {
      console.log('✅ All tests passed successfully!');
    }

    console.log('\n📊 Test Coverage:');
    console.log('- ✅ Health check');
    console.log('- ✅ Officer management');
    console.log('- ✅ License plate lookup');
    console.log('- ✅ Ticket issuance and management');
    console.log('- ✅ Warning issuance and management');
    console.log('- ✅ Activity logging');
    console.log('- ✅ Shift management');
    console.log('- ✅ Offline sync');
    console.log('- ✅ Error handling');
    console.log('- ✅ Integration workflow');

  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
    process.exitCode = 1;
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests().then(() => {
    process.exit(process.exitCode || 0);
  });
}

module.exports = { runTests };
