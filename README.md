# The Unified Service Scheduler — Backend (Scenario A)

> An intelligent, DMS-aligned (Dealer Management System) workshop service appointment scheduling backend built with **NestJS Monorepo (`apps/` + `libs/`)**, **Node.js 22+ LTS**, **TypeScript 5+**, **TypeORM**, and **PostgreSQL 18** (`btree_gist` Exclusion Constraints & Advisory Locks).

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
   - Resource allocation is strictly serialized per dealership using **`SELECT pg_advisory_xact_lock(NS_BOOKING, dealership_id)`** inside a single, dedicated `EntityManager` transaction.
   - Double-booking is 100% prevented at the database storage level via three **`EXCLUDE USING gist`** constraints (`no_bay_overlap`, `no_technician_overlap`, `no_vehicle_overlap`) on `tstzrange(start_at, occupied_until, '[)')`.
2. **Slot-Grid Alignment (Zero Slot Fragmentation):**
   - Service durations and turnover buffers are standardized to eliminate dead time on a 30-minute grid: `(duration_minutes + buffer_minutes) % slot_minutes == 0`.
3. **Observability & Sensitive Data Redaction:**
   - **`AsyncLocalStorage` (`node:async_hooks`)** automatically injects `correlation_id` into every **Pino** structured JSON log line.
   - Built-in `SensitiveDataMasker` automatically redacts passwords, client secrets, tokens, email addresses, phone numbers, VINs (retaining last 4 characters), and customer snapshot names.
   - The TypeScript method decorator **`@LogSpan()`** automatically instruments UseCase/Service executions with duration measurements and input/output span logs.
4. **Enforced Domain Boundaries:**
   - Enforced by **`eslint-plugin-boundaries`**: `@app/workshop` can only communicate with other domains through `@app/contracts` and `@app/common`, prohibiting direct internal imports from `@app/crm` or `@app/organization`.

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

### Step 3: Verify Service Health
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

## 6. Detailed System Design Documentation
- [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) — Comprehensive technical architecture specification (v4).
- [SYSTEM_DESIGN_VI.md](./SYSTEM_DESIGN_VI.md) — Detailed Vietnamese explanatory guide aligned 1-to-1 with the English design document.
