-- Seed Data for The Unified Service Scheduler (Scenario A)
-- Connect to scheduler database
\connect scheduler

-- 1. Seed Central Dealership & Settings
INSERT INTO dealerships (id, tenant_id, name, address, timezone)
VALUES (1, 1, 'Central Dealership', '123 Innovation Way, Tech Park', 'Asia/Ho_Chi_Minh')
ON CONFLICT (id) DO NOTHING;

SELECT setval('dealerships_id_seq', (SELECT MAX(id) FROM dealerships));

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
ON CONFLICT (dealership_id) DO NOTHING;

-- 2. Skills
INSERT INTO skills (id, tenant_id, code, name) VALUES
(1, 1, 'GENERAL_SERVICE', 'General Maintenance & Inspection'),
(2, 1, 'BRAKE', 'Brake Systems & Hydraulics'),
(3, 1, 'ENGINE', 'Engine & Transmission Powertrain'),
(4, 1, 'DIAGNOSTICS', 'Advanced Diagnostics & Electrical')
ON CONFLICT DO NOTHING;

SELECT setval('skills_id_seq', (SELECT MAX(id) FROM skills));

-- 3. Service Types
-- Standardized durations aligned to 30-minute slot grid with 15-minute buffer:
-- OIL_FILTER: 45m + 15m = 60m (2 grid slots)
-- FULL_BRAKE: 75m + 15m = 90m (3 grid slots)
-- MAJOR_INSPECTION: 105m + 15m = 120m (4 grid slots)
INSERT INTO service_types (id, tenant_id, skill_id, code, name, duration_minutes) VALUES
(1, 1, 1, 'OIL_FILTER', 'Standard Oil & Filter Service', 45),
(2, 1, 2, 'FULL_BRAKE', 'Full Brake System Service', 75),
(3, 1, 4, 'MAJOR_INSPECTION', 'Comprehensive Inspection & Diagnostics', 105)
ON CONFLICT DO NOTHING;

SELECT setval('service_types_id_seq', (SELECT MAX(id) FROM service_types));

-- 4. Service Bays (BAY-01 to BAY-10)
DO $$
BEGIN
    FOR i IN 1..10 LOOP
        INSERT INTO service_bays (tenant_id, dealership_id, code, is_active)
        VALUES (1, 1, 'BAY-' || LPAD(i::text, 2, '0'), TRUE)
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;

-- 5. Technicians (TECH-01 to TECH-10) and Skill Mappings
DO $$
BEGIN
    FOR i IN 1..10 LOOP
        INSERT INTO technicians (tenant_id, dealership_id, name, is_active)
        VALUES (1, 1, 'Technician ' || LPAD(i::text, 2, '0'), TRUE)
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;

-- Map skills to technicians:
-- Tech 1-4: General Service (Skill 1)
-- Tech 5-6: Brake (Skill 2) + General Service (Skill 1)
-- Tech 7-8: Engine (Skill 3) + General Service (Skill 1)
-- Tech 9-10: Diagnostics (Skill 4) + Brake (Skill 2) + General Service (Skill 1)
INSERT INTO technician_skills (tenant_id, technician_id, skill_id)
SELECT 1, t.id, 1 FROM technicians t WHERE t.id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
ON CONFLICT DO NOTHING;

INSERT INTO technician_skills (tenant_id, technician_id, skill_id)
SELECT 1, t.id, 2 FROM technicians t WHERE t.id IN (5, 6, 9, 10)
ON CONFLICT DO NOTHING;

INSERT INTO technician_skills (tenant_id, technician_id, skill_id)
SELECT 1, t.id, 3 FROM technicians t WHERE t.id IN (7, 8)
ON CONFLICT DO NOTHING;

INSERT INTO technician_skills (tenant_id, technician_id, skill_id)
SELECT 1, t.id, 4 FROM technicians t WHERE t.id IN (9, 10)
ON CONFLICT DO NOTHING;

-- 6. Sample Customer & Registered Vehicles
INSERT INTO customers (id, tenant_id, identity_subject, name, email, phone)
VALUES (1, 1, 'a1111111-1111-1111-1111-111111111111', 'Nguyen Van A', 'customer1@example.com', '+84901234567')
ON CONFLICT DO NOTHING;

SELECT setval('customers_id_seq', (SELECT MAX(id) FROM customers));

INSERT INTO vehicles (id, tenant_id, customer_id, vin, license_plate, make, model, year)
VALUES 
(1, 1, 1, '1HGCR2F83HA000001', '51A-123.45', 'Honda', 'Accord', 2020),
(2, 1, 1, '1HGCR2F83HA000002', '51B-678.90', 'Toyota', 'Camry', 2022)
ON CONFLICT DO NOTHING;

SELECT setval('vehicles_id_seq', (SELECT MAX(id) FROM vehicles));

-- 7. Dealership Staff
INSERT INTO staff_members (id, tenant_id, dealership_id, identity_subject, name)
VALUES (1, 1, 1, 'b2222222-2222-2222-2222-222222222222', 'Tran Thi Staff')
ON CONFLICT DO NOTHING;

SELECT setval('staff_members_id_seq', (SELECT MAX(id) FROM staff_members));
