-- Initialize PostgreSQL 18 extensions for The Unified Service Scheduler (Scenario A)
-- Required for tstzrange exclusion constraints (no_bay_overlap, no_technician_overlap, no_vehicle_overlap)

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Create dedicated test database for Pest Feature & Multi-connection Concurrency suites
SELECT 'CREATE DATABASE scheduler_test OWNER scheduler'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'scheduler_test')\gexec

\connect scheduler_test
CREATE EXTENSION IF NOT EXISTS btree_gist;
