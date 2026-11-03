# GenAI Collaboration in the Design Phase — The Unified Service Scheduler

> **Document Context:** This document captures the complete architectural dialogue, iterative design decisions, and collaborative critique between the Human Lead Engineer and Google Antigravity (supported by the BMad Method framework) during the system design phase of The Unified Service Scheduler (Scenario A).
>
> 📖 **Parent Design Document:** [`../SYSTEM_DESIGN.md`](../SYSTEM_DESIGN.md)

---

## 1. Overview of AI-Human Collaboration Strategy

Google Antigravity was leveraged as an interactive design partner and technical sounding board throughout the architecture phase. Rather than accepting autonomous AI generation, every proposal was systematically critiqued, stress-tested against real-world dealership operations, and refined through multi-agent review sessions (Lead Architect, Developer, QA, and Adversarial Reviewer).

The iterative dialogue evolved across 17 major architectural milestones, moving from initial high-level abstractions to rigorous database-enforced concurrency guarantees.

---

## 2. Iterative Design History & Architectural Evolution

| # | Initial AI Proposal | Human Critique & Correction | Final Architecture Outcome |
| :---: | :--- | :--- | :--- |
| **1** | AI design covered only customer-facing booking requests. | Lead pointed out implicit DMS actors (service advisors, workshop managers, technicians, physical bays) and provided foundational business assumptions. | Formalized comprehensive Actor Model, Staff operations, and explicit MVP Scope boundaries. |
| **2** | Initial workflow deferred technician and bay allocation to manager approval time. | Lead & AI identified that approval-time allocation breaks real-time booking guarantees and causes race conditions when multiple customers target the same slot. | Enforced atomic resource reservation at initial booking time across all workflows. |
| **3** | Initial framework exploration suggested distributed microservices. | Evaluated operational complexity against MVP deadlines; microservices introduce distributed transactions and network overhead. | Adopted NestJS Modular Monolith (`apps/` + `libs/`) with clear domain boundaries for future extraction. |
| **4** | AI suggested separate Dealership and Scheduling services with local CQRS projections. | Lead proposed domain alignment with automotive DMS standards: Bays, Technicians, and Appointments belong to the Workshop domain. | Consolidated Workshop domain into `@app/workshop`; single PostgreSQL transaction eliminates eventual consistency lags. |
| **5** | AI proposed raw RFC 7807 problem details error responses. | Lead required a unified response envelope across all endpoints for frontend consistency: `{statusCode, errorCode, data, message, meta}`. | Implemented `ResponseEnvelopeInterceptor` and `GlobalExceptionFilter` in `@app/common`. |
| **6** | AI proposed framework-coupled session authentication. | Lead required standard SSO identity delegation via OIDC client credentials and RS256 JWT tokens. | Designed lightweight SSO mock (`v1/auth/token`) emulating OIDC token endpoint and JWKS verification for local validation. |
| **7** | Initial discussion considered hard-deleting cancelled appointments. | AI demonstrated that soft-cancelling frees resource slots while preserving immutable audit trails and SLA reporting. | Adopted soft-cancellation (`status = 'CANCELLED'`, audit fields `cancelled_at`, `cancelled_by`, `cancel_reason`). |
| **8** | AI suggested verbose unstructured logging with response bodies logged only upon error. | Lead mandated structured JSON logs, framework timestamps, `@LogSpan()` decorators, correlation IDs on every line, and full request/response bodies with PII redaction. | Implemented `LoggingInterceptor`, `AsyncLocalStorage` request context kernel, and `@LogSpan()` method decorators. |
| **9** | AI proposed row-level locking (`SELECT ... FOR UPDATE SKIP LOCKED`) on technician and bay tables. | Adversarial design review demonstrated that row locks are not time-scoped, causing false `409` conflicts for non-overlapping future bookings. | Introduced per-dealership PostgreSQL advisory locks (`pg_advisory_xact_lock`) paired with `btree_gist` temporal exclusion constraints. |
| **10** | Booking rules scattered across dealership entities; pending bookings could hold slots indefinitely. | Multi-agent review consolidated scheduling parameters into a dedicated entity and addressed orphan bookings. | Created `workshop_settings`, auto-confirm default, background expiry worker job, and customer active booking limits. |
| **11** | Vehicle was immutable after booking; technicians were strictly system-assigned. | Lead required flexibility for customers and staff to modify vehicles or request preferred qualified technicians when free. | Added customer edit and staff reassignment flows with dynamic qualification checks and audit tracking (`created_by`, `updated_by`). |
| **12** | Review suggested merging CRM and Organization into a single "Master Data Service". | Evaluated domain boundaries: merging Customer/Vehicle (high-churn PII) with Tenant/Dealership (low-churn org hierarchy) creates a "God Service" anti-pattern. | Maintained `@app/crm` and `@app/organization` as isolated libraries with typed interfaces in `@app/contracts`. |
| **13** | Arbitrary service durations created dead time on a 30-minute grid (e.g., 60m service + 15m buffer = 75m). | Identified that non-grid-aligned durations cause slot fragmentation (dead time between bookings). | Enforced **Slot-Grid Alignment Rule**: `(duration_minutes + buffer_minutes) % slot_minutes == 0`, standardizing service durations to 45m, 75m, 105m, 165m. |
| **14** | Handled only normal booking; early customer arrival and slot swapping were undefined. | Lead required handling 3 real-world scenarios: early arrival with free resources, arrival after grace period, and customer-agreed slot trading. | Designed 3-scenario early arrival policy and `POST /v1/staff/appointments/swap` utilizing a 3-step transient `'SWAPPING'` state. |
| **15** | Architectural stack transitioned to NestJS Monorepo (`apps/` + `libs/`). | Evaluated Node.js event-loop characteristics and TypeORM connection pooling. | Introduced `AsyncLocalStorage` context isolation, transactional `EntityManager` connection pinning, and a single-replica `apps/scheduler-worker`. |
| **16** | System supported availability lookups, but lacked real-time push to staff boards and customer views. | Lead required real-time visibility for workshop dispatchers and customers without external message brokers. | Built Post-Commit PostgreSQL `LISTEN / NOTIFY` bridge coupled to NestJS `@Sse()` stream endpoints and live dual-view demo screens (`/demo`). |
| **17** | Adversarial concurrency audit identified 7 critical race conditions and edge cases. | Validated findings through adversarial review: customer-level advisory locks, `int4` parameter casting, 60s idempotency lease, and connection pool sizing. | Implemented hierarchical lock ordering (`Customer -> Dealership -> Row`), explicit connection pool configuration (`max: 25`), and strict Lock & Version invariants. |

---

## 3. Key Takeaways

1. **Human-in-the-Loop Supremacy:** Autonomous AI generation without rigorous domain verification leads to subtle concurrency bugs and architectural drift. Active human guidance ensured production-grade reliability.
2. **Step-by-Step Granularity:** Breaking complex problems into isolated, verifiable milestones allowed deep technical rigor at each step.
3. **Adversarial Pressure Testing:** Using secondary reviewer agents to critique architectural decisions uncovered critical edge cases (such as time-unscoped row locks and slot fragmentation) early in the design cycle.
