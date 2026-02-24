-- Drop old products tables before recreating with new schema
-- CAUTION: This will delete all existing data!

DROP VIEW IF EXISTS product_statistics CASCADE;
DROP TABLE IF EXISTS inventory_history CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS sat_product_codes CASCADE;
DROP TABLE IF EXISTS sat_unit_codes CASCADE;
