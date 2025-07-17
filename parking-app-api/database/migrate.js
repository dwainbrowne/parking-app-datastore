#!/usr/bin/env node

/**
 * Database Migration Script for Parking Permit Requests
 * This script sets up the D1 database using the schema.sql file
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
  schemaFile: join(__dirname, 'schema.sql'),
  databaseName: 'parking-permits-db',
  environment: process.env.NODE_ENV || 'development'
};

/**
 * Read and parse the schema file
 */
function readSchemaFile() {
  try {
    const schemaContent = readFileSync(CONFIG.schemaFile, 'utf-8');
    console.log('✅ Schema file loaded successfully');
    return schemaContent;
  } catch (error) {
    console.error('❌ Error reading schema file:', error);
    process.exit(1);
  }
}

/**
 * Split schema into individual statements
 */
function parseSchemaStatements(schema) {
  // Split by semicolon, but be careful with statements inside views and triggers
  const statements = schema
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))
    .map(stmt => stmt + ';');

  return statements;
}

/**
 * Generate Wrangler D1 commands
 */
function generateWranglerCommands(statements) {
  const commands = [];

  // Add database creation command
  commands.push(`# Create D1 database (run once)`);
  commands.push(`wrangler d1 create ${CONFIG.databaseName}`);
  commands.push('');

  // Add schema execution commands
  commands.push(`# Execute schema statements`);

  statements.forEach((statement, index) => {
    // Clean up the statement for command line
    const cleanStatement = statement
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanStatement.length > 0) {
      commands.push(`wrangler d1 execute ${CONFIG.databaseName} --command "${cleanStatement}"`);
    }
  });

  return commands;
}

/**
 * Generate batch SQL file for D1
 */
function generateBatchSQL(statements) {
  const batchSQL = [
    '-- Parking Permit Request Database Setup',
    '-- Generated batch SQL for Cloudflare D1',
    '-- Execute using: wrangler d1 execute parking-permits-db --file=setup.sql',
    '',
    ...statements
  ].join('\n');

  return batchSQL;
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('🚀 Starting database migration...');
  console.log(`📁 Schema file: ${CONFIG.schemaFile}`);
  console.log(`🗄️  Database: ${CONFIG.databaseName}`);
  console.log(`🌍 Environment: ${CONFIG.environment}`);
  console.log('');

  try {
    // Read schema
    const schema = readSchemaFile();

    // Parse statements
    const statements = parseSchemaStatements(schema);
    console.log(`📝 Parsed ${statements.length} SQL statements`);

    // Generate commands
    const commands = generateWranglerCommands(statements);
    const batchSQL = generateBatchSQL(statements);

    // Write batch SQL file
    const { writeFileSync } = await import('fs');
    const batchSQLPath = join(__dirname, 'setup.sql');
    writeFileSync(batchSQLPath, batchSQL);
    console.log(`📄 Batch SQL file created: ${batchSQLPath}`);

    // Write commands file
    const commandsPath = join(__dirname, 'migration-commands.sh');
    const commandsContent = [
      '#!/bin/bash',
      '# Database Migration Commands for Parking Permit Requests',
      '# Generated automatically - DO NOT EDIT',
      '',
      'set -e',
      '',
      'echo "🚀 Starting database migration..."',
      'echo "📁 Setting up Cloudflare D1 database"',
      'echo ""',
      '',
      ...commands.map(cmd => cmd.startsWith('#') ? `echo "${cmd.substring(1).trim()}"` : cmd),
      '',
      'echo ""',
      'echo "✅ Database migration completed successfully!"',
      'echo "🔗 Add the database binding to your wrangler.toml file"',
      'echo ""'
    ].join('\n');

    writeFileSync(commandsPath, commandsContent);
    console.log(`📄 Migration commands created: ${commandsPath}`);

    // Display instructions
    console.log('');
    console.log('📋 NEXT STEPS:');
    console.log('1. Run the migration commands:');
    console.log(`   chmod +x ${commandsPath}`);
    console.log(`   ./${commandsPath}`);
    console.log('');
    console.log('2. OR execute the batch SQL file:');
    console.log(`   wrangler d1 execute ${CONFIG.databaseName} --file=${batchSQLPath}`);
    console.log('');
    console.log('3. Add database binding to wrangler.toml:');
    console.log('   [[d1_databases]]');
    console.log(`   binding = "DB"`);
    console.log(`   database_name = "${CONFIG.databaseName}"`);
    console.log('   database_id = "YOUR_DATABASE_ID"');
    console.log('');
    console.log('✅ Migration preparation completed!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === __filename) {
  runMigration();
}

export { runMigration, CONFIG };
