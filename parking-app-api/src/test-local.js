// Simple test to validate our API works
// Run with: node test-local.js

import { serve } from '@hono/node-server';
import app from './index.js';

const port = 3000;

console.log(`🚀 Starting server on http://localhost:${port}`);
serve({
  fetch: app.fetch,
  port,
});

console.log('✅ Server started! Try these endpoints:');
console.log(`  Health: http://localhost:${port}/health`);
console.log(`  Permit Types: http://localhost:${port}/api/permit-types`);
console.log(`  License Lookup: http://localhost:${port}/api/license-plates/ABC123?state=CA`);
