-- Migration script to add full_address field to tenants table
-- Run this if you have an existing database without the full_address field

-- Add the full_address column to the tenants table
ALTER TABLE tenants ADD full_address TEXT;

-- Update the trigger to handle the new field
-- (The trigger will be automatically updated when you re-run the schema)

-- If you want to populate existing records with a default address, you can do:
-- UPDATE tenants SET full_address = unit_number || ' - Address not provided' WHERE full_address IS NULL;

-- Verify the change
SELECT sql FROM sqlite_master WHERE type='table' AND name='tenants';
