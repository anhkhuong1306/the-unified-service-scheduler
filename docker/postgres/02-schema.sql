-- Database Schema for The Unified Service Scheduler (Scenario A)
-- Connect to scheduler database
\connect scheduler

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Dealerships & Staff
CREATE TABLE IF NOT EXISTS dealerships (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500) NOT NULL,
    timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID
);

CREATE TABLE IF NOT EXISTS staff_members (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    dealership_id BIGINT NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
    identity_subject UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID,
    CONSTRAINT uq_staff_tenant_subject UNIQUE (tenant_id, identity_subject)
);

-- 2. Customers & Vehicles
CREATE TABLE IF NOT EXISTS customers (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    identity_subject UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID,
    CONSTRAINT uq_customer_tenant_subject UNIQUE (tenant_id, identity_subject)
);

CREATE TABLE IF NOT EXISTS vehicles (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    vin VARCHAR(17) NOT NULL,
    license_plate VARCHAR(20) NOT NULL,
    make VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    year INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID,
    CONSTRAINT uq_vehicle_tenant_vin UNIQUE (tenant_id, vin)
);

-- 3. Workshop Settings
CREATE TABLE IF NOT EXISTS workshop_settings (
    dealership_id BIGINT PRIMARY KEY REFERENCES dealerships(id) ON DELETE CASCADE,
    tenant_id BIGINT NOT NULL,
    timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    opens_at TIME NOT NULL DEFAULT '08:00:00',
    closes_at TIME NOT NULL DEFAULT '18:00:00',
    slot_minutes INT NOT NULL DEFAULT 30,
    buffer_minutes INT NOT NULL DEFAULT 15,
    grace_minutes INT NOT NULL DEFAULT 15,
    lead_time_minutes INT NOT NULL DEFAULT 60,
    horizon_days INT NOT NULL DEFAULT 30,
    cancellation_cutoff_minutes INT NOT NULL DEFAULT 120,
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    max_active_per_customer INT NOT NULL DEFAULT 3,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID,
    CONSTRAINT ck_ws_slot CHECK (slot_minutes > 0),
    CONSTRAINT ck_ws_buffer CHECK (buffer_minutes >= 0),
    CONSTRAINT ck_ws_grace CHECK (grace_minutes >= 0),
    CONSTRAINT ck_ws_lead CHECK (lead_time_minutes >= 0),
    CONSTRAINT ck_ws_horizon CHECK (horizon_days > 0),
    CONSTRAINT ck_ws_cutoff CHECK (cancellation_cutoff_minutes >= 0),
    CONSTRAINT ck_ws_max CHECK (max_active_per_customer > 0),
    CONSTRAINT ck_ws_hours CHECK (closes_at > opens_at)
);

-- 4. Skills & Service Types
CREATE TABLE IF NOT EXISTS skills (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID,
    CONSTRAINT uq_skill_tenant_code UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS service_types (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    skill_id BIGINT REFERENCES skills(id) ON DELETE SET NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    duration_minutes INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID,
    CONSTRAINT uq_service_type_tenant_code UNIQUE (tenant_id, code)
);

-- 5. Service Bays & Technicians
CREATE TABLE IF NOT EXISTS service_bays (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    dealership_id BIGINT NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID,
    CONSTRAINT uq_bay_dealership_code UNIQUE (dealership_id, code)
);

CREATE TABLE IF NOT EXISTS technicians (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    dealership_id BIGINT NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID
);

CREATE TABLE IF NOT EXISTS technician_skills (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    technician_id BIGINT NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    skill_id BIGINT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID,
    CONSTRAINT uq_tech_skill UNIQUE (technician_id, skill_id)
);

-- 6. Appointments & GiST Exclusion Constraints
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id BIGINT NOT NULL DEFAULT 1,
    reference_code VARCHAR(64) NOT NULL UNIQUE,
    dealership_id BIGINT NOT NULL REFERENCES dealerships(id),
    customer_id BIGINT NOT NULL REFERENCES customers(id),
    vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
    service_type_id BIGINT NOT NULL REFERENCES service_types(id),
    service_bay_id BIGINT NOT NULL REFERENCES service_bays(id),
    technician_id BIGINT NOT NULL REFERENCES technicians(id),
    customer_name VARCHAR(255) NOT NULL,
    vehicle_plate VARCHAR(50) NOT NULL,
    vehicle_label VARCHAR(255) NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    occupied_until TIMESTAMPTZ NOT NULL,
    period tstzrange GENERATED ALWAYS AS (tstzrange(start_at, occupied_until, '[)')) STORED,
    status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED',
    version INT NOT NULL DEFAULT 1,
    notes TEXT,
    cancel_reason VARCHAR(255),
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID
);

-- Exclusion constraints preventing double-booking
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS no_bay_overlap;
ALTER TABLE appointments ADD CONSTRAINT no_bay_overlap EXCLUDE USING gist
    (service_bay_id WITH =, period WITH &&)
    WHERE (status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'));

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS no_technician_overlap;
ALTER TABLE appointments ADD CONSTRAINT no_technician_overlap EXCLUDE USING gist
    (technician_id WITH =, period WITH &&)
    WHERE (status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'));

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS no_vehicle_overlap;
ALTER TABLE appointments ADD CONSTRAINT no_vehicle_overlap EXCLUDE USING gist
    (vehicle_id WITH =, period WITH &&)
    WHERE (status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'));

-- 7. Appointment Events Audit Trail
CREATE TABLE IF NOT EXISTS appointment_events (
    id BIGSERIAL PRIMARY KEY,
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    actor_subject UUID,
    actor_type VARCHAR(50) NOT NULL DEFAULT 'customer',
    changes JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Idempotency Keys
CREATE TABLE IF NOT EXISTS idempotency_keys (
    subject UUID NOT NULL,
    key VARCHAR(255) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
    locked_until TIMESTAMPTZ,
    response JSONB,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (subject, key)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys (expires_at);

-- 9. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_appt_customer_active
    ON appointments (customer_id)
    WHERE status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS');

CREATE UNIQUE INDEX IF NOT EXISTS uq_appt_tenant_reference_code
    ON appointments (tenant_id, reference_code);

CREATE INDEX IF NOT EXISTS idx_service_bays_dealership_active
    ON service_bays (dealership_id, id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_technicians_dealership_active
    ON technicians (dealership_id, id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_tech_skills_skill_tech
    ON technician_skills (skill_id, technician_id);
