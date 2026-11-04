-- Seed Data for The Unified Service Scheduler (Scenario A)
-- Connect to scheduler database
\connect scheduler

-- ==============================================================================
-- 1. Dealerships & Workshop Settings
-- ==============================================================================
-- Dealership 1: Central Dealership (Direct Confirmation, requires_approval = FALSE)
-- Dealership 2: South Dealership (Approval Required, requires_approval = TRUE)
INSERT INTO dealerships (id, tenant_id, code, name, address, timezone) VALUES
(1, 1, 'DLR_CENTRAL_01', 'Central Dealership', '123 Innovation Way, Tech Park', 'Asia/Ho_Chi_Minh'),
(2, 1, 'DLR_SOUTH_02', 'South Dealership', '456 Automotive Blvd, District 7', 'Asia/Ho_Chi_Minh')
ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    name = EXCLUDED.name,
    address = EXCLUDED.address,
    timezone = EXCLUDED.timezone;

SELECT setval('dealerships_id_seq', (SELECT COALESCE(MAX(id), 1) FROM dealerships));

-- Workshop Settings for Dealership 1
INSERT INTO workshop_settings (
    dealership_id,
    tenant_id,
    timezone,
    opens_at,
    closes_at,
    slot_minutes,
    buffer_minutes,
    grace_minutes,
    lead_time_minutes,
    horizon_days,
    cancellation_cutoff_minutes,
    requires_approval,
    max_active_per_customer
)
VALUES (
    1,
    1,
    'Asia/Ho_Chi_Minh',
    '08:00:00',
    '18:00:00',
    30,
    15,
    15,
    60,
    30,
    120,
    FALSE,
    3
)
ON CONFLICT (dealership_id) DO UPDATE SET
    opens_at = EXCLUDED.opens_at,
    closes_at = EXCLUDED.closes_at,
    slot_minutes = EXCLUDED.slot_minutes,
    buffer_minutes = EXCLUDED.buffer_minutes,
    grace_minutes = EXCLUDED.grace_minutes,
    lead_time_minutes = EXCLUDED.lead_time_minutes,
    horizon_days = EXCLUDED.horizon_days,
    cancellation_cutoff_minutes = EXCLUDED.cancellation_cutoff_minutes,
    requires_approval = EXCLUDED.requires_approval,
    max_active_per_customer = EXCLUDED.max_active_per_customer;

-- Workshop Settings for Dealership 2 (requires_approval = TRUE for staff approval testing)
INSERT INTO workshop_settings (
    dealership_id,
    tenant_id,
    timezone,
    opens_at,
    closes_at,
    slot_minutes,
    buffer_minutes,
    grace_minutes,
    lead_time_minutes,
    horizon_days,
    cancellation_cutoff_minutes,
    requires_approval,
    max_active_per_customer
)
VALUES (
    2,
    1,
    'Asia/Ho_Chi_Minh',
    '08:00:00',
    '18:00:00',
    30,
    15,
    15,
    60,
    30,
    120,
    TRUE,
    3
)
ON CONFLICT (dealership_id) DO UPDATE SET
    opens_at = EXCLUDED.opens_at,
    closes_at = EXCLUDED.closes_at,
    slot_minutes = EXCLUDED.slot_minutes,
    buffer_minutes = EXCLUDED.buffer_minutes,
    grace_minutes = EXCLUDED.grace_minutes,
    lead_time_minutes = EXCLUDED.lead_time_minutes,
    horizon_days = EXCLUDED.horizon_days,
    cancellation_cutoff_minutes = EXCLUDED.cancellation_cutoff_minutes,
    requires_approval = EXCLUDED.requires_approval,
    max_active_per_customer = EXCLUDED.max_active_per_customer;

-- ==============================================================================
-- 2. Skills
-- ==============================================================================
INSERT INTO skills (id, tenant_id, code, name) VALUES
(1, 1, 'GENERAL_SERVICE', 'General Maintenance & Inspection'),
(2, 1, 'BRAKE', 'Brake Systems & Hydraulics'),
(3, 1, 'ENGINE', 'Engine & Transmission Powertrain'),
(4, 1, 'DIAGNOSTICS', 'Advanced Diagnostics & Electrical')
ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    name = EXCLUDED.name;

SELECT setval('skills_id_seq', (SELECT COALESCE(MAX(id), 1) FROM skills));

-- ==============================================================================
-- 3. Service Types (Grid-aligned: duration + 15m buffer % 30m == 0)
-- ==============================================================================
-- OIL_FILTER: 45m + 15m = 60m (2 grid slots) - matches Postman query code=OIL&name=Maintenance
-- FULL_BRAKE: 75m + 15m = 90m (3 grid slots)
-- MAJOR_INSPECTION: 105m + 15m = 120m (4 grid slots)
-- ENGINE_OVERHAUL: 165m + 15m = 180m (6 grid slots)
INSERT INTO service_types (id, tenant_id, skill_id, code, name, duration_minutes) VALUES
(1, 1, 1, 'OIL_FILTER', 'Routine Maintenance & Oil Filter Service', 45),
(2, 1, 2, 'FULL_BRAKE', 'Full Brake System Service & Fluid Flush', 75),
(3, 1, 4, 'MAJOR_INSPECTION', 'Comprehensive Inspection & Diagnostics', 105),
(4, 1, 3, 'ENGINE_OVERHAUL', 'Engine Powertrain Maintenance & Overhaul', 165)
ON CONFLICT (id) DO UPDATE SET
    skill_id = EXCLUDED.skill_id,
    code = EXCLUDED.code,
    name = EXCLUDED.name,
    duration_minutes = EXCLUDED.duration_minutes;

SELECT setval('service_types_id_seq', (SELECT COALESCE(MAX(id), 1) FROM service_types));

-- ==============================================================================
-- 4. Service Bays (10 bays for Dealership 1, 10 bays for Dealership 2)
-- ==============================================================================
DO $$
BEGIN
    -- Dealership 1 Bays: BAY-01 to BAY-10
    FOR i IN 1..10 LOOP
        INSERT INTO service_bays (tenant_id, dealership_id, code, is_active)
        VALUES (1, 1, 'BAY-' || LPAD(i::text, 2, '0'), TRUE)
        ON CONFLICT (dealership_id, code) DO UPDATE SET is_active = EXCLUDED.is_active;
    END LOOP;

    -- Dealership 2 Bays: BAY-S01 to BAY-S10
    FOR i IN 1..10 LOOP
        INSERT INTO service_bays (tenant_id, dealership_id, code, is_active)
        VALUES (1, 2, 'BAY-S' || LPAD(i::text, 2, '0'), TRUE)
        ON CONFLICT (dealership_id, code) DO UPDATE SET is_active = EXCLUDED.is_active;
    END LOOP;
END $$;

SELECT setval('service_bays_id_seq', (SELECT COALESCE(MAX(id), 1) FROM service_bays));

-- ==============================================================================
-- 5. Technicians & Skill Mappings (10 techs for Dealership 1, 10 techs for Dealership 2)
-- ==============================================================================
DO $$
BEGIN
    -- Dealership 1 Technicians: TECH-01 to TECH-10
    FOR i IN 1..10 LOOP
        INSERT INTO technicians (tenant_id, dealership_id, code, name, is_active)
        VALUES (1, 1, 'TECH-' || LPAD(i::text, 2, '0'), 'Technician ' || LPAD(i::text, 2, '0'), TRUE)
        ON CONFLICT (dealership_id, code) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active;
    END LOOP;

    -- Dealership 2 Technicians: TECH-S01 to TECH-S10
    FOR i IN 1..10 LOOP
        INSERT INTO technicians (tenant_id, dealership_id, code, name, is_active)
        VALUES (1, 2, 'TECH-S' || LPAD(i::text, 2, '0'), 'South Technician ' || LPAD(i::text, 2, '0'), TRUE)
        ON CONFLICT (dealership_id, code) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active;
    END LOOP;
END $$;

SELECT setval('technicians_id_seq', (SELECT COALESCE(MAX(id), 1) FROM technicians));

-- Map skills to Dealership 1 technicians:
-- Tech 1-4: General Service (Skill 1)
-- Tech 5-6: Brake (Skill 2) + General Service (Skill 1)
-- Tech 7-8: Engine (Skill 3) + General Service (Skill 1)
-- Tech 9-10: Diagnostics (Skill 4) + Brake (Skill 2) + General Service (Skill 1)
INSERT INTO technician_skills (tenant_id, technician_id, skill_id)
SELECT 1, t.id, 1 FROM technicians t WHERE t.dealership_id = 1
ON CONFLICT (technician_id, skill_id) DO NOTHING;

INSERT INTO technician_skills (tenant_id, technician_id, skill_id)
SELECT 1, t.id, 2 FROM technicians t WHERE t.dealership_id = 1 AND t.code IN ('TECH-05', 'TECH-06', 'TECH-09', 'TECH-10')
ON CONFLICT (technician_id, skill_id) DO NOTHING;

INSERT INTO technician_skills (tenant_id, technician_id, skill_id)
SELECT 1, t.id, 3 FROM technicians t WHERE t.dealership_id = 1 AND t.code IN ('TECH-07', 'TECH-08')
ON CONFLICT (technician_id, skill_id) DO NOTHING;

INSERT INTO technician_skills (tenant_id, technician_id, skill_id)
SELECT 1, t.id, 4 FROM technicians t WHERE t.dealership_id = 1 AND t.code IN ('TECH-09', 'TECH-10')
ON CONFLICT (technician_id, skill_id) DO NOTHING;

-- Map skills to Dealership 2 technicians:
INSERT INTO technician_skills (tenant_id, technician_id, skill_id)
SELECT 1, t.id, 1 FROM technicians t WHERE t.dealership_id = 2
ON CONFLICT (technician_id, skill_id) DO NOTHING;

INSERT INTO technician_skills (tenant_id, technician_id, skill_id)
SELECT 1, t.id, 2 FROM technicians t WHERE t.dealership_id = 2 AND t.code IN ('TECH-S05', 'TECH-S06', 'TECH-S09', 'TECH-S10')
ON CONFLICT (technician_id, skill_id) DO NOTHING;

INSERT INTO technician_skills (tenant_id, technician_id, skill_id)
SELECT 1, t.id, 3 FROM technicians t WHERE t.dealership_id = 2 AND t.code IN ('TECH-S07', 'TECH-S08')
ON CONFLICT (technician_id, skill_id) DO NOTHING;

INSERT INTO technician_skills (tenant_id, technician_id, skill_id)
SELECT 1, t.id, 4 FROM technicians t WHERE t.dealership_id = 2 AND t.code IN ('TECH-S09', 'TECH-S10')
ON CONFLICT (technician_id, skill_id) DO NOTHING;

SELECT setval('technician_skills_id_seq', (SELECT COALESCE(MAX(id), 1) FROM technician_skills));

-- ==============================================================================
-- 6. Sample Customers & Registered Vehicles
-- ==============================================================================
-- Customer 1: Nguyen Van A (Matches primary customer actor sub in tests)
-- Customer 2: Nguyen Van C
-- Customer 3: Nguyen Van D
-- Customer 4: John Doe (Matches Postman directory filter code=CUST&name=John&phone=090&email=example)
INSERT INTO customers (id, tenant_id, identity_subject, code, name, email, phone) VALUES
(1, 1, 'a1111111-1111-1111-1111-111111111111', 'CUST_001', 'Nguyen Van A', 'customer1@example.com', '+84901234567'),
(2, 1, 'c3333333-3333-3333-3333-333333333333', 'CUST_002', 'Nguyen Van C', 'customer2@example.com', '+84901234568'),
(3, 1, 'd4444444-4444-4444-4444-444444444444', 'CUST_003', 'Nguyen Van D', 'customer3@example.com', '+84901234569'),
(4, 1, 'a4444444-4444-4444-4444-444444444444', 'CUST_JOHN', 'John Doe', 'john.doe@example.com', '+84901234560')
ON CONFLICT (id) DO UPDATE SET
    identity_subject = EXCLUDED.identity_subject,
    code = EXCLUDED.code,
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone;

SELECT setval('customers_id_seq', (SELECT COALESCE(MAX(id), 1) FROM customers));

INSERT INTO vehicles (id, tenant_id, customer_id, vin, license_plate, make, model, year) VALUES 
(1, 1, 1, '1HGCR2F83HA000001', '51A-123.45', 'Honda', 'Accord', 2020),
(2, 1, 1, '1HGCR2F83HA000002', '51B-678.90', 'Toyota', 'Camry', 2022),
(3, 1, 2, '1HGCR2F83HA000003', '51C-123.45', 'Honda', 'Civic', 2021),
(4, 1, 2, '1HGCR2F83HA000004', '51D-675.99', 'Toyota', 'Corolla', 2022),
(5, 1, 3, '1HGCR2F83HA000005', '51B-671.95', 'Toyota', 'Camry', 2023),
(6, 1, 4, '1HGCR2F83HA000006', '51A-999.88', 'Ford', 'Ranger', 2023)
ON CONFLICT (id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id,
    vin = EXCLUDED.vin,
    license_plate = EXCLUDED.license_plate,
    make = EXCLUDED.make,
    model = EXCLUDED.model,
    year = EXCLUDED.year;

SELECT setval('vehicles_id_seq', (SELECT COALESCE(MAX(id), 1) FROM vehicles));

-- ==============================================================================
-- 7. Dealership Staff Members
-- ==============================================================================
-- Staff 1: Tran Thi Staff (Central Dealership, Primary staff identity in tests)
-- Staff 2: Le Van Staff2 (Central Dealership)
-- Staff 3: Pham Thi Staff South (South Dealership)
INSERT INTO staff_members (id, tenant_id, dealership_id, identity_subject, name) VALUES
(1, 1, 1, 'b2222222-2222-2222-2222-222222222222', 'Tran Thi Staff'),
(2, 1, 1, 'b3333333-3333-3333-3333-333333333333', 'Le Van Staff2'),
(3, 1, 2, 'b4444444-4444-4444-4444-444444444444', 'Pham Thi Staff South')
ON CONFLICT (id) DO UPDATE SET
    dealership_id = EXCLUDED.dealership_id,
    identity_subject = EXCLUDED.identity_subject,
    name = EXCLUDED.name;

SELECT setval('staff_members_id_seq', (SELECT COALESCE(MAX(id), 1) FROM staff_members));

-- ==============================================================================
-- 8. Seed Appointments & Details (Dedicated States for Test Suite Execution)
-- ==============================================================================
-- All seed appointments use non-overlapping slots & distinct resources to respect GiST constraints.
-- APT 1: PENDING (Dealership 2 - requires approval) -> For testing Staff Approve API
-- APT 2: PENDING (Dealership 2 - requires approval) -> For testing Staff Reject API
-- APT 3: CONFIRMED (Dealership 1) -> For testing Receptionist Check-in / Swap 1
-- APT 4: CONFIRMED (Dealership 1) -> For testing Swap 2
-- APT 5: CHECKED_IN (Dealership 1) -> For testing Technician Start Service API
-- APT 6: IN_PROGRESS (Dealership 1) -> For testing Technician Complete Service API
-- APT 7: CONFIRMED (Dealership 1, in past) -> For testing Mark No-Show API

INSERT INTO appointments (
    id, tenant_id, reference_code, dealership_id, customer_id, vehicle_id,
    service_type_id, service_type_ids, service_bay_id, technician_id,
    customer_name, vehicle_plate, vehicle_label,
    start_at, end_at, occupied_until, status, version, notes
)
SELECT
    'a0000000-0000-4000-8000-000000000001'::uuid, 1, 'APT-SEED-PENDING-01', 2, 2, 3,
    1, ARRAY[1]::bigint[],
    (SELECT id FROM service_bays WHERE dealership_id = 2 AND code = 'BAY-S01' LIMIT 1),
    (SELECT id FROM technicians WHERE dealership_id = 2 AND code = 'TECH-S01' LIMIT 1),
    'Nguyen Van C', '51C-123.45', '2021 Honda Civic',
    '2026-11-10 08:00:00+07'::timestamptz, '2026-11-10 08:45:00+07'::timestamptz, '2026-11-10 09:00:00+07'::timestamptz,
    'PENDING', 1, 'Awaiting South Dealership staff approval'
UNION ALL
SELECT
    'a0000000-0000-4000-8000-000000000002'::uuid, 1, 'APT-SEED-PENDING-02', 2, 3, 5,
    2, ARRAY[2]::bigint[],
    (SELECT id FROM service_bays WHERE dealership_id = 2 AND code = 'BAY-S02' LIMIT 1),
    (SELECT id FROM technicians WHERE dealership_id = 2 AND code = 'TECH-S02' LIMIT 1),
    'Nguyen Van D', '51B-671.95', '2023 Toyota Camry',
    '2026-11-10 09:00:00+07'::timestamptz, '2026-11-10 10:15:00+07'::timestamptz, '2026-11-10 10:30:00+07'::timestamptz,
    'PENDING', 1, 'Awaiting rejection test'
UNION ALL
SELECT
    'a0000000-0000-4000-8000-000000000003'::uuid, 1, 'APT-SEED-CONFIRMED-03', 1, 1, 1,
    1, ARRAY[1]::bigint[],
    (SELECT id FROM service_bays WHERE dealership_id = 1 AND code = 'BAY-01' LIMIT 1),
    (SELECT id FROM technicians WHERE dealership_id = 1 AND code = 'TECH-01' LIMIT 1),
    'Nguyen Van A', '51A-123.45', '2020 Honda Accord',
    '2026-11-10 08:00:00+07'::timestamptz, '2026-11-10 08:45:00+07'::timestamptz, '2026-11-10 09:00:00+07'::timestamptz,
    'CONFIRMED', 1, 'Routine inspection scheduled'
UNION ALL
SELECT
    'a0000000-0000-4000-8000-000000000004'::uuid, 1, 'APT-SEED-CONFIRMED-04', 1, 4, 6,
    1, ARRAY[1]::bigint[],
    (SELECT id FROM service_bays WHERE dealership_id = 1 AND code = 'BAY-02' LIMIT 1),
    (SELECT id FROM technicians WHERE dealership_id = 1 AND code = 'TECH-02' LIMIT 1),
    'John Doe', '51A-999.88', '2023 Ford Ranger',
    '2026-11-10 09:00:00+07'::timestamptz, '2026-11-10 09:45:00+07'::timestamptz, '2026-11-10 10:00:00+07'::timestamptz,
    'CONFIRMED', 1, 'Ready for atomic slot swap with APT 3'
UNION ALL
SELECT
    'a0000000-0000-4000-8000-000000000005'::uuid, 1, 'APT-SEED-CHECKEDIN-05', 1, 1, 2,
    2, ARRAY[2]::bigint[],
    (SELECT id FROM service_bays WHERE dealership_id = 1 AND code = 'BAY-03' LIMIT 1),
    (SELECT id FROM technicians WHERE dealership_id = 1 AND code = 'TECH-03' LIMIT 1),
    'Nguyen Van A', '51B-678.90', '2022 Toyota Camry',
    '2026-11-10 10:00:00+07'::timestamptz, '2026-11-10 11:15:00+07'::timestamptz, '2026-11-10 11:30:00+07'::timestamptz,
    'CHECKED_IN', 1, 'Vehicle arrived at workshop reception'
UNION ALL
SELECT
    'a0000000-0000-4000-8000-000000000006'::uuid, 1, 'APT-SEED-INPROGRESS-06', 1, 2, 4,
    1, ARRAY[1]::bigint[],
    (SELECT id FROM service_bays WHERE dealership_id = 1 AND code = 'BAY-04' LIMIT 1),
    (SELECT id FROM technicians WHERE dealership_id = 1 AND code = 'TECH-04' LIMIT 1),
    'Nguyen Van C', '51D-675.99', '2022 Toyota Corolla',
    '2026-11-10 11:00:00+07'::timestamptz, '2026-11-10 11:45:00+07'::timestamptz, '2026-11-10 12:00:00+07'::timestamptz,
    'IN_PROGRESS', 1, 'Maintenance work currently in progress'
UNION ALL
SELECT
    'a0000000-0000-4000-8000-000000000007'::uuid, 1, 'APT-SEED-NOSHOW-07', 1, 3, 5,
    1, ARRAY[1]::bigint[],
    (SELECT id FROM service_bays WHERE dealership_id = 1 AND code = 'BAY-05' LIMIT 1),
    (SELECT id FROM technicians WHERE dealership_id = 1 AND code = 'TECH-05' LIMIT 1),
    'Nguyen Van D', '51B-671.95', '2023 Toyota Camry',
    '2026-11-01 08:00:00+07'::timestamptz, '2026-11-01 08:45:00+07'::timestamptz, '2026-11-01 09:00:00+07'::timestamptz,
    'CONFIRMED', 1, 'Past appointment for no-show verification'
ON CONFLICT (id) DO UPDATE SET
    reference_code = EXCLUDED.reference_code,
    dealership_id = EXCLUDED.dealership_id,
    customer_id = EXCLUDED.customer_id,
    vehicle_id = EXCLUDED.vehicle_id,
    service_type_id = EXCLUDED.service_type_id,
    service_type_ids = EXCLUDED.service_type_ids,
    service_bay_id = EXCLUDED.service_bay_id,
    technician_id = EXCLUDED.technician_id,
    customer_name = EXCLUDED.customer_name,
    vehicle_plate = EXCLUDED.vehicle_plate,
    vehicle_label = EXCLUDED.vehicle_label,
    start_at = EXCLUDED.start_at,
    end_at = EXCLUDED.end_at,
    occupied_until = EXCLUDED.occupied_until,
    status = EXCLUDED.status,
    version = EXCLUDED.version,
    notes = EXCLUDED.notes;

-- Appointment Details for Seed Appointments
INSERT INTO appointment_details (
    id, tenant_id, appointment_id, service_type_id, code, name, duration_minutes, price, sequence_order
) VALUES
(1, 1, 'a0000000-0000-4000-8000-000000000001', 1, 'OIL_FILTER', 'Routine Maintenance & Oil Filter Service', 45, 150000.00, 1),
(2, 1, 'a0000000-0000-4000-8000-000000000002', 2, 'FULL_BRAKE', 'Full Brake System Service & Fluid Flush', 75, 350000.00, 1),
(3, 1, 'a0000000-0000-4000-8000-000000000003', 1, 'OIL_FILTER', 'Routine Maintenance & Oil Filter Service', 45, 150000.00, 1),
(4, 1, 'a0000000-0000-4000-8000-000000000004', 1, 'OIL_FILTER', 'Routine Maintenance & Oil Filter Service', 45, 150000.00, 1),
(5, 1, 'a0000000-0000-4000-8000-000000000005', 2, 'FULL_BRAKE', 'Full Brake System Service & Fluid Flush', 75, 350000.00, 1),
(6, 1, 'a0000000-0000-4000-8000-000000000006', 1, 'OIL_FILTER', 'Routine Maintenance & Oil Filter Service', 45, 150000.00, 1),
(7, 1, 'a0000000-0000-4000-8000-000000000007', 1, 'OIL_FILTER', 'Routine Maintenance & Oil Filter Service', 45, 150000.00, 1)
ON CONFLICT (id) DO UPDATE SET
    appointment_id = EXCLUDED.appointment_id,
    service_type_id = EXCLUDED.service_type_id,
    code = EXCLUDED.code,
    name = EXCLUDED.name,
    duration_minutes = EXCLUDED.duration_minutes,
    price = EXCLUDED.price;

SELECT setval('appointment_details_id_seq', (SELECT COALESCE(MAX(id), 1) FROM appointment_details));
