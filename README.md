# The Unified Service Scheduler — Backend (Scenario A)

> An intelligent, DMS-aligned (Dealer Management System) workshop service appointment scheduling backend built with **NestJS Monorepo (`apps/` + `libs/`)**, **Node.js 22+ LTS**, **TypeScript 5+**, **TypeORM**, and **PostgreSQL 18** (`btree_gist` Exclusion Constraints & Advisory Locks).

---

## Table of Contents

- [1. Architectural Overview](#1-architectural-overview)
- [2. Prerequisites](#2-prerequisites)
- [3. Quick Start with Docker Compose](#3-quick-start-with-docker-compose)
  - [Step 1: Prepare Environment Configuration](#step-1-prepare-environment-configuration)
  - [Step 2: Launch the Services](#step-2-launch-the-services)
  - [Step 3: Initialize Database (On-Demand)](#step-3-initialize-database-on-demand)
  - [Step 4: Verify Service Health](#step-4-verify-service-health)
- [4. CLI Commands & Scripts](#4-cli-commands-scripts)
- [5. Unified Response Envelope](#5-unified-response-envelope)
- [6. Project Documentation & Specifications](#6-project-documentation--specifications)
- [7. AI Collaboration Narrative](#7-ai-collaboration-narrative)
  - [7.1 High-Level Guiding Strategy & SDLC Framework](#71-high-level-guiding-strategy--sdlc-framework)
  - [7.2 Phase-by-Phase Verification & Refinement Process](#72-phase-by-phase-verification--refinement-process)
  - [7.3 Ensuring Final Code Quality & Core Philosophy](#73-ensuring-final-code-quality--core-philosophy)
- [8. Testing Guide: Excel Test Matrices & Postman Collections](#8-testing-guide-excel-test-matrices--postman-collections)
  - [8.1 Test Artifacts Overview (`docs/test/`)](#81-test-artifacts-overview-docstest)
  - [8.2 Structure & Interpretation of Excel Test Matrices](#82-structure--interpretation-of-excel-test-matrices)
  - [8.3 Postman Collection Setup & Execution Flow](#83-postman-collection-setup--execution-flow)
---

## 1. Architectural Overview

The project is structured as a **Modular Monolith** using the official **NestJS Monorepo** layout. It clearly separates **physical deployment entry points (`apps/`)** from **domain bounded contexts (`libs/`)**:

```text
source/
├── apps/
│   ├── scheduler-api/          # Primary stateless REST API server (horizontally scalable)
│   └── scheduler-worker/       # Background cronjob worker (single replica, PENDING expiry job)
└── libs/
    ├── common/                 # (@app/common) ALS RequestContext, Pino Logger, @LogSpan(), Envelope, Filters
    ├── contracts/              # (@app/contracts) Public DI tokens, cross-module DTOs & interfaces
    ├── workshop/               # (@app/workshop) Core domain: Settings, Service Catalog, Resource, Booking
    ├── crm/                    # (@app/crm) Customer & Vehicle lifecycle domain
    ├── organization/           # (@app/organization) Dealership directory, tenant, and staff domain
    └── sso-mock/               # (@app/sso-mock) Minimal Mock OIDC Provider (RS256 JWT via jose)
```

### Key Technical Highlights:
1. **Concurrency & Data Integrity:**
   - Multi-tier advisory lock hierarchy (**`NS_CUSTOMER`** $\to$ **`NS_BOOKING`** $\to$ **`FOR UPDATE`** ordered by id ASC) strictly prevents cross-dealership active-limit bypass (Case 6) and eliminates deadlocks.
   - Resource allocation within a dealership is serialized using `pg_advisory_xact_lock(NS_BOOKING::int4, dealership_id::int4)` within a single dedicated `EntityManager` transaction.
   - Double-booking is 100% prevented at the storage level via three PostgreSQL **`EXCLUDE USING gist`** constraints (`no_bay_overlap`, `no_technician_overlap`, `no_vehicle_overlap`) on `tstzrange(start_at, occupied_until, '[)')`.
2. **Real-Time Reactive Streaming (`@Sse()` + PostgreSQL `LISTEN / NOTIFY`):**
   - Transactional post-commit event dispatch (`pg_notify('appointment_events', payload)`) delivers live notifications strictly upon database `COMMIT`, eliminating phantom events.
   - Synchronizes events across horizontal API pods and background worker processes (`apps/scheduler-worker`) with zero external message broker (Kafka/RabbitMQ) overhead in MVP.
   - Monotonic appointment `version` ordering prevents client-side out-of-order race conditions. Includes dual live demo screens (`/demo` for Customer & Dealership Board).
3. **Advanced Workshop Lifecycle & Atomic Slot Swap:**
   - Strict `AppointmentStateMachine` governs full lifecycle transitions (`approve`, `reject`, `check_in`, `start`, `complete`, `no_show`, `expire`, `cancel`).
   - Staff operations support Early-Arrival Rescheduling (`POST /v1/staff/appointments/:id/reschedule` overriding lead time) and qualification-checked Technician Reassignment.
   - Atomic Slot Swap (`POST /v1/staff/appointments/swap`) uses a transient `SWAPPING` state to cleanly exchange two appointments under GiST exclusion constraints without cascade rescheduling.
4. **Unified Request Execution Context & Deep Observability (`AsyncLocalStorage`):**
   - **`AsyncLocalStorage` (`RequestContextService`)** serves as the central context kernel across the asynchronous call tree, propagating `correlationId`, `actorSub`, `actorType`, `tenantId`, `dealershipId`, `roles`, and `language` without parameter pollution.
   - **Automated Audit Trailing:** Powers `AuditColumnsSubscriber` and `BaseAuditEntity` to automatically inject actor code/name into `created_by`, `updated_by`, and `cancelled_by` during entity creation and modification.
   - **Distributed Logging & Tracing:** Automatically injects `correlation_id` into every **Pino** structured JSON log line, response header (`X-Correlation-ID`), and unified JSON response envelope.
   - **Execution Profiling with PII Masking:** The **`@LogSpan()`** method decorator measures execution duration and emits span logs, while `SensitiveDataMasker` automatically redacts passwords, client secrets, tokens, emails, phone numbers, VINs, and customer names.
5. **High-Performance Redis 7 Hash Caching & Scalability:**
   - Master data catalogs (dealerships, service types, technicians, bays) are cached in **Redis 7** using **Hash structures** (`HSET`, `HGET`, `HGETALL`, `HDEL`) partitioned by domain namespace, eliminating database thrashing on high-volume availability queries.
6. **Slot-Grid Alignment & Enforced Domain Boundaries:**
   - Service durations and turnover buffers are standardized to eliminate dead time on a 30-minute grid: `(duration_minutes + buffer_minutes) % slot_minutes == 0`.
   - Architectural boundaries are strictly enforced via **`eslint-plugin-boundaries`**: `@app/workshop` cannot import internal entities/services from `@app/crm` or `@app/organization`, communicating exclusively via `@app/contracts`.

---

## 2. Prerequisites

- **Docker** & **Docker Compose** (Compose v2 supported)
- Alternatively, for local bare-metal execution:
  - **Node.js:** `>= 22.0.0 LTS`
  - **npm:** `>= 10.0.0`
  - **PostgreSQL:** `>= 18.0` (with `btree_gist` extension enabled)

---

## 3. Quick Start with Docker Compose

### Step 1: Prepare Environment Configuration
Copy the sample environment file to create your local `.env`:
```bash
cp .env.example .env
```

### Step 2: Launch the Services
Start PostgreSQL 18, `scheduler-api`, and `scheduler-worker`:
```bash
docker compose up -d
```

### Step 3: Initialize Database (On-Demand)

Database setup is split into three modular scripts under `docker/postgres/`:
- **`01-init.sql`:** Enables the `btree_gist` extension and provisions the `scheduler_test` database.
- **`02-schema.sql` (Pure DDL):** Creates relational tables, base audit columns, PostgreSQL 18 GiST exclusion constraints (`no_bay_overlap`, `no_technician_overlap`, `no_vehicle_overlap`), and composite indexes.
- **`03-seed.sql` (Pure DML):** Populates operational configuration for Central Dealership (`Asia/Ho_Chi_Minh`, 08:00–18:00, 30m grid, 15m buffer), 4 technical skills, 3 standardized service types, 10 active service bays, 10 technicians with skill matrices, seed customer with 2 vehicles, and staff members.

#### Running Database Scripts

Scripts can be executed via the **Bash CLI helper** (`./scripts/db.sh`) or cross-platform **NPM scripts** (`scripts/run-sql.js`):

```bash
# Option A: Full initialization & seed in one command (runs 01-init -> 02-schema -> 03-seed)
./scripts/db.sh reset
# (or using npm: npm run db:reset)

# Option B: Run step-by-step
./scripts/db.sh init          # or: npm run db:init (extensions & scheduler_test database)
./scripts/db.sh schema        # or: npm run db:schema (DDL tables, constraints & indexes)
./scripts/db.sh seed          # or: npm run db:seed (DML reference seed data)
./scripts/db.sh test-schema   # or: npm run db:test-schema (provision test database)
./scripts/db.sh psql          # Open interactive psql console
```
*(The script runner automatically detects the running Docker container `scheduler-postgres`, local `psql`, or falls back to Node.js)*.

### Step 4: Verify Service Health
- **API Health Check (Liveness):**
  ```bash
  curl http://localhost:3000/health/live
  ```
- **Database & Services Readiness:**
  ```bash
  curl http://localhost:3000/health/ready
  ```
- **Interactive Swagger / OpenAPI UI:**  
  Open in your browser: [http://localhost:3000/docs/api](http://localhost:3000/docs/api)

---

## 4. CLI Commands & Scripts

| Command | Description |
| :--- | :--- |
| `npm run db:reset` / `./scripts/db.sh reset` | Full setup: run `01-init.sql`, `02-schema.sql`, and `03-seed.sql` |
| `npm run db:init` / `./scripts/db.sh init` | Apply `01-init.sql` (enable `btree_gist` and create `scheduler_test`) |
| `npm run db:schema` / `./scripts/db.sh schema` | Apply table DDL, GiST exclusion constraints, and performance indexes (`02-schema.sql`) |
| `npm run db:seed` / `./scripts/db.sh seed` | Populate reference seed data (`03-seed.sql`) |
| `npm run db:test-schema` / `./scripts/db.sh test-schema` | Apply init, schema & seeds to dedicated test database (`scheduler_test`) |
| `./scripts/db.sh psql` | Open an interactive `psql` shell against the active database |
| `npm run start:dev` | Start `scheduler-api` in development watch mode (hot-reload) |
| `npm run start:worker:dev` | Start `scheduler-worker` in development watch mode |
| `npm run build` | Compile TypeScript for all applications and domain libraries into `dist/` |
| `npm run lint` | Check code style and module boundaries with ESLint (`eslint-plugin-boundaries`) |
| `npm run test` | Run the full test suite using Jest |
| `npm run test:unit` | Run unit tests for domain libraries under `libs/` |
| `npm run test:e2e` | Run integration / end-to-end API tests |
| `npm run test:concurrency` | Run multi-connection concurrent booking tests |
| `npm run sso:keys` | Generate RSA key pairs for the minimal Mock OIDC Provider |
| `npm run sso:issue-token -- <email>` | Generate a pre-issued RS256 JWT token to bypass login in tests |

---

## 5. Unified Response Envelope

All API endpoints produce a consistent JSON envelope:

### Successful Response (`200 OK` / `201 Created`):
```json
{
  "statusCode": 200,
  "errorCode": null,
  "data": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "reference_code": "APT-20261029-A1B2",
    "status": "CONFIRMED"
  },
  "message": "OK",
  "meta": {
    "correlation_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
  }
}
```

### Business Error Response (`409 Conflict`):
```json
{
  "statusCode": 409,
  "errorCode": "SLOT_UNAVAILABLE",
  "data": {
    "reason": "NO_QUALIFIED_TECHNICIAN",
    "alternatives": []
  },
  "message": "Dealership is fully booked for the requested period",
  "meta": {
    "correlation_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
  }
}
```

---

## 6. Project Documentation & Specifications

All core architectural specifications, daily assessment plans, sprint stories, and QA verification artifacts are maintained under `docs/` and repository root:

| Document / Artifact | Location | Description |
| :--- | :--- | :--- |
| **System Design Document** | [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md) | Comprehensive technical architecture specification (v5 — NestJS Monorepo). |
| **Bản Thiết Kế Hệ Thống (Tiếng Việt)** | [`SYSTEM_DESIGN_VI.md`](./SYSTEM_DESIGN_VI.md) | Detailed Vietnamese explanatory guide aligned 1-to-1 with the English design document. |
| **GenAI Design Collaboration** | [`docs/plan_and_report/GENAI_DESIGN_COLLABORATION.md`](./docs/plan_and_report/GENAI_DESIGN_COLLABORATION.md) | The 17-step iterative design dialogue, critique, and architectural evolution history. |
| **Assessment Plan** | [`docs/plan_and_report/ASSESSMENT_PLAN.md`](./docs/plan_and_report/ASSESSMENT_PLAN.md) | Daily roadmap, milestone decomposition, and phased delivery scope. |
| **Daily Execution Report** | [`docs/plan_and_report/DAILY_REPORT.md`](./docs/plan_and_report/DAILY_REPORT.md) | Daily execution logs, bugs resolved, and rule updates across AI sessions. |
| **User Stories & Specs** | [`docs/stories/`](./docs/stories/) | Granular sprint stories with acceptance criteria, domain mapping, and QA test specs. |
| **Comprehensive Master QA Test Cases (Excel)** | [`docs/test/The Unified Service Scheduler — Comprehensive Master API TestCases.xlsx`](./docs/test/The%20Unified%20Service%20Scheduler%20%E2%80%94%20Comprehensive%20Master%20API%20TestCases.xlsx) | Standardized 2-sheet QA test matrix (Specification & Live Docker Execution Evidence) covering all 28 API test cases across 8 functional modules. |
| **Comprehensive Master Postman Collection** | [`docs/test/The Unified Service Scheduler — Comprehensive Master API Collection (All Endpoints).postman_collection.json`](./docs/test/The%20Unified%20Service%20Scheduler%20%E2%80%94%20Comprehensive%20Master%20API%20Collection%20(All%20Endpoints).postman_collection.json) | Complete runnable API test collection covering all 28 endpoints with automated assertion scripts and environment variable chaining. |

---

## 7. AI Collaboration Narrative

### 7.1 High-Level Guiding Strategy & SDLC Framework

My primary strategy for working with AI: I never delegate an entire project end-to-end to an autonomous agent. Instead, I first thoroughly read, analyze, and comprehend the business domain and operational requirements myself before engaging the AI. Once I form an architectural vision and problem-solving strategy, I direct the AI to elaborate, challenge, and flesh out the specific technical requirements.

To structure this collaboration systematically, I employed **Google Antigravity** orchestrated by the **BMad Method**—an agentic software engineering framework offering specialized role-based skills (Architect, Developer, QA, Reviewer) tailored to standard Software Development Life Cycle (SDLC) phases. I customized these agent skills with strict project rules, coding conventions, and architectural directives.

Rather than attempting a monolithic implementation, I adopted an **incremental milestone decomposition strategy**:
1. Requirements were broken down progressively from core fundamentals (baseline data models, entity relationships, booking serialization) to advanced capabilities (multi-service items, SSE streaming, atomic slot swaps, Redis caching).
2. The entire project timeline was mapped into explicit daily milestones documented in [`docs/plan_and_report/ASSESSMENT_PLAN.md`](./docs/plan_and_report/ASSESSMENT_PLAN.md).
3. Each working day focused strictly on a defined functional boundary, locking in and verifying outcomes before progressing to the next day's objectives.

### 7.2 Phase-by-Phase Verification & Refinement Process

Within each daily iteration, work was further partitioned into distinct SDLC phases. To prevent hallucinations and enforce architectural alignment, **I mandated that agents produce detailed technical specifications and user-story artifacts before touching the codebase**. This allowed me to inspect the agent's intent, verify alignment with my architectural standards, and amend discrepancies upfront. The agent was strictly bound to execute according to the approved specification.

```text
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│ 1. Architecture Design │ ───> │  2. Story & Spec Prep  │ ───> │  3. Safe Implementation│
│ (SYSTEM_DESIGN.md)     │      │  (User Stories & ACs)  │      │  (Intent Confirmation) │
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
                                                                             │
┌────────────────────────┐      ┌────────────────────────┐                   ▼
│ 5. Knowledge Compaction│ <─── │ 4. Quinn QA Protocol   │ <─────────────────┘
│ (Daily Reports & Rules)│      │ (Live Docker & Postman)│
└────────────────────────┘      └────────────────────────┘
```

#### 1. Analysis & Architecture Design (`SYSTEM_DESIGN.md`)
I directed the Architect agent to synthesize requirements into a comprehensive technical design document. I actively participated in drafting, reviewing, and stress-testing the architecture.

#### 2. Sprint Planning & Story Specification (Pre-Execution Gate)
For each day's milestone, the agent ingested `SYSTEM_DESIGN.md` and `ASSESSMENT_PLAN.md` to draft actionable User Stories ([`docs/stories/`](./docs/stories/)) detailing exact technical scope, affected modules, and acceptance criteria. I personally reviewed and refined these stories, adjusted data contracts, edge-case criteria, and business logic before implementation.

#### 3. Implementation & Intent Confirmation
During coding, the developer agent operated strictly within the boundaries of the approved story and system design. Prior to making file modifications, the agent was required to declare its planned implementation steps for my approval. I reviewed code diffs line-by-line to verify domain encapsulation.
#### 4. Comprehensive QA & Live Testing
Following implementation, quality assurance was executed through the structured:
- **Structured Test Case Catalog:** The agent generated and updated a comprehensive Excel test case matrix ([`docs/test/The Unified Service Scheduler — Comprehensive Master API TestCases.xlsx`](./docs/test/The%20Unified%20Service%20Scheduler%20%E2%80%94%20Comprehensive%20Master%20API%20TestCases.xlsx)), which I reviewed against the story's acceptance criteria and system specifications.
- **Master API Collection:** The agent maintained a synchronized Master Postman collection ([`docs/test/The Unified Service Scheduler — Comprehensive Master API Collection (All Endpoints).postman_collection.json`](./docs/test/The%20Unified%20Service%20Scheduler%20%E2%80%94%20Comprehensive%20Master%20API%20Collection%20(All%20Endpoints).postman_collection.json)) covering all 28 API endpoints across positive flows, negative validations, edge cases, lifecycle transitions, and real-time event streams.
- **Automated Test Execution:** Automated Jest suites (unit tests, repository tests, concurrency tests with `Promise.all`) were executed, ensuring clean compilation and zero app crashes.
- **Personal Live-Environment Verification:** In addition to automated agent runs, I launched the system in a clean local Docker environment, personally executed live API requests via cURL and Postman, inspected database states, and verified response payloads. Whenever an anomaly occurred, I captured screenshots into the test evidence, documented root causes, instructed the agent to implement targeted fixes, and re-verified the fix through the same pipeline.

#### 5. Adversarial Code Review & Daily Knowledge Compaction
- **Adversarial Review:** An independent reviewer agent performed adversarial code audits across all modified files and test suites, highlighting edge cases, missing validation bounds, or convention drifts.
- **Knowledge Compaction:** At the conclusion of each day's work, the agent summarized completed milestones, root causes of bugs encountered, and established operational rules into a structured daily report ([`docs/plan_and_report/DAILY_REPORT.md`](./docs/plan_and_report/DAILY_REPORT.md)). These learnings were persisted into agent rules to ensure subsequent sessions maintained full project context.

### 7.3 Ensuring Final Code Quality & Core Philosophy
From my experience with AI coding agents, the most important factor for a stable, production-ready system is breaking tasks down into detailed, step-by-step pieces.
* **The Risks of Unsupervised AI Delegation:** Delegating an entire end-to-end project to an AI agent without intermediate human checkpoints is fundamentally flawed. When an agent attempts to implement a massive scope autonomously, architectural drift accumulates, subtle business logic bugs go unnoticed, code reviews become unmanageable, and the engineer loses visibility into what was actually built.
* **The Power of Step-by-Step Validation:** By breaking the problem into small pieces and reviewing the work at every milestone—Design $\to$ Spec $\to$ Code $\to$ Live Docker Test $\to$ Review—I kept full control and understanding of the codebase. This human-in-the-loop workflow ensures the final code strictly meets business requirements, security standards.

---

## 8. Testing Guide: Excel Test Matrices & Postman Collections

All structured test specifications, executable Postman API collections, and verified test execution evidence are centralized under [`docs/test/`](./docs/test/).

### 8.1 Test Artifacts Overview (`docs/test/`)

| Test Suite / Artifact | Location | Purpose & Scope |
| :--- | :--- | :--- |
| **Comprehensive Master QA Test Cases (Excel)** | [`docs/test/The Unified Service Scheduler — Comprehensive Master API TestCases.xlsx`](./docs/test/The%20Unified%20Service%20Scheduler%20%E2%80%94%20Comprehensive%20Master%20API%20TestCases.xlsx) | Standardized 2-sheet QA test matrix (Specification & Live Docker Execution Evidence) covering 28 test cases (`TC_MST_001` - `TC_MST_028`) across 8 modules: Auth, Health, Dealerships, Catalog, CRM, Customer Booking, Staff Lifecycle Operations, and Real-Time SSE Streams. |
| **Comprehensive Master Postman Collection** | [`docs/test/The Unified Service Scheduler — Comprehensive Master API Collection (All Endpoints).postman_collection.json`](./docs/test/The%20Unified%20Service%20Scheduler%20%E2%80%94%20Comprehensive%20Master%20API%20Collection%20(All%20Endpoints).postman_collection.json) | Complete runnable API test collection covering all 28 endpoints with automated Chai test assertion scripts and dynamic environment variable chaining (`bearer_token`, `appointmentId`, `targetDate`). |

---

### 8.2 Structure & Interpretation of Excel Test Matrix

The Excel workbook ([`The Unified Service Scheduler — Comprehensive Master API TestCases.xlsx`](./docs/test/The%20Unified%20Service%20Scheduler%20%E2%80%94%20Comprehensive%20Master%20API%20TestCases.xlsx)) adheres to an audit-ready 2-sheet structure:

1. **Sheet 1: `Test Cases` (Specification Sheet — 14 Columns):**
   - **Test Case ID:** e.g., `TC_MST_001`, `TC_MST_013`, `TC_MST_026`.
   - **Category / Domain:** Authentication, Health, Dealerships, Service Catalog, CRM, Appointments, Staff Operations, Real-Time Streams.
   - **Test Objective & Description:** Specific business rule, concurrency guard, or boundary condition under test.
   - **Preconditions:** Necessary system state (e.g., database seeded, specific technician skills assigned, active booking exists).
   - **Step-by-Step Actions:** Exact API calls and query parameters to execute.
   - **Test Data / Payload:** JSON request body, HTTP headers (e.g., `Idempotency-Key`, `Authorization`), and URL parameters.
   - **Expected Result:** HTTP status code (200, 201, 400, 409), business error code, and required response payload structure.
   - **Priority:** `P0 (Critical / Blocker)` vs `P1 (High)`.
   - **Status:** Execution outcome (`PASSED`).

2. **Sheet 2: `Execution Evidence` (Verification Sheet — 10 Columns):**
   - Contains captured **cURL command lines**, exact HTTP response status codes, measured latency (ms), full response JSON payloads, and verified QA notes validating actual behavior on the live local Docker environment.

---

### 8.3 Postman Collection Setup & Execution Flow

#### Step 1: Start the Local Backend Environment
Ensure the Docker containers are running and the database is initialized:
```bash
docker compose up -d
./scripts/db.sh reset
```

#### Step 2: Import Collection into Postman
1. Open the Postman Desktop App (or Postman Web).
2. Click **Import** (top left).
3. Drag & drop or select the JSON collection file:
   - `docs/test/The Unified Service Scheduler — Comprehensive Master API Collection (All Endpoints).postman_collection.json`

#### Step 3: Configure Collection / Environment Variables
The collection comes pre-configured with default collection variables. You can customize them or assign them in a Postman Environment:

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `baseUrl` | `http://localhost:3000` | Target API gateway URL |
| `tenantId` | `1` | Default tenant ID |
| `dealershipId` | `1` | Central Dealership ID (seed data) |
| `targetDate` | `2026-11-04` | Target date for availability queries |
| `bearer_token` | *(Auto-populated)* | Auth token captured automatically from Step 0 |

#### Step 4: Recommended Execution Sequence
When running collections manually or via the Postman Collection Runner, execute requests in sequential order:

1. **Folder 1 — Authentication & Token:**
   - Run `POST /v1/auth/token` with customer or staff credentials.
   - The test script automatically saves the returned JWT into the `{{bearer_token}}` variable.
2. **Folder 2 & 3 — Health Checks & Dealerships:**
   - Run `GET /health/live` and `GET /health/ready` to verify system health.
   - Query `GET /v1/dealerships` and `GET /v1/dealerships/:id/available-slots`.
3. **Folder 4 & 5 — Service Catalog & CRM:**
   - Retrieve service types and customer vehicles (`GET /v1/me/vehicles`).
4. **Folder 6 — Customer Appointments:**
   - Query availability (`GET /v1/appointments/availability`).
   - Create booking (`POST /v1/appointments`) with `Idempotency-Key` (saves `{{appointmentId}}`).
   - Query appointment details (`GET /v1/appointments/:id`) and update notes (`PATCH /v1/appointments/:id`).
5. **Folder 7 — Staff Operations & Lifecycle:**
   - Execute lifecycle transitions (`approve`, `check-in`, `start`, `complete`).
   - Test operational flexibility: Technician Reassignment (`POST /v1/staff/appointments/:id/reassign`), Early-Arrival Reschedule (`POST /v1/staff/appointments/:id/reschedule`), and Atomic Slot Swap (`POST /v1/staff/appointments/swap`).
6. **Folder 8 — Real-Time Event Streams (SSE):**
   - Connect to customer stream (`GET /v1/appointments/stream`) and dealership live board (`GET /v1/staff/appointments/stream`).

---