#!/bin/bash

# Database Setup Script for Parking Permit Requests
# This script sets up the Cloudflare D1 database

set -e

DB_NAME="parking-permits-db"
SCHEMA_FILE="schema.sql"

echo "🚀 Starting database setup..."
echo "📁 Database: $DB_NAME"
echo "📄 Schema file: $SCHEMA_FILE"
echo ""

# Step 1: Create the database
echo "1️⃣ Creating D1 database..."
wrangler d1 create $DB_NAME

echo ""
echo "2️⃣ Executing schema..."
wrangler d1 execute $DB_NAME --file=$SCHEMA_FILE

echo ""
echo "✅ Database setup completed successfully!"
echo ""
echo "📋 NEXT STEPS:"
echo "1. Copy the database ID from the output above"
echo "2. Add the database binding to your wrangler.toml file:"
echo ""
echo "   [[d1_databases]]"
echo "   binding = \"DB\""
echo "   database_name = \"$DB_NAME\""
echo "   database_id = \"YOUR_DATABASE_ID\""
echo ""
echo "3. Test the connection in your Cloudflare Worker"
echo ""
echo "🎉 Ready to start accepting parking permit requests!"
