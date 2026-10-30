-- Database Initialization for The Unified Service Scheduler (Scenario A)
-- Connect to scheduler database
\connect scheduler

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Create dedicated test database for Concurrency & Test suites
SELECT 'CREATE DATABASE scheduler_test OWNER scheduler'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'scheduler_test')\gexec

\connect scheduler_test
CREATE EXTENSION IF NOT EXISTS btree_gist;
