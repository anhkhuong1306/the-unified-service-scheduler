# Kế Hoạch Thực Hiện Keyloop Technical Assessment (v5 — NestJS Monorepo)

**Vị trí:** Backend Engineer  
**Đề bài:** Scenario A — The Unified Service Scheduler (Domain: Ownership)  
**Kiến trúc:** **NestJS Monorepo (`apps/` + `libs/`)** chia theo phân hệ **DMS**, kiểm soát ranh giới bằng **`@app/contracts` + `eslint-plugin-boundaries`**  
**Tech Stack:** Node.js 22+ LTS, TypeScript 5+, NestJS, TypeORM, PostgreSQL 18 (Docker Compose), Minimal Mock OIDC SSO (`jose` RS256 JWT + JWKS), Pino + `AsyncLocalStorage`, Jest + Supertest, `@nestjs/swagger`  
**Tiến độ Tổng thể:** **6/7 Ngày Hoàn thành (90%) — Sẵn sàng Rà soát & Quay Video Nộp bài**

---

## 1. Điểm nhấn Kiến trúc v5 (NestJS Monorepo + Rà soát Concurrency Chuyên sâu)

1. **Cấu trúc NestJS Monorepo (`apps/` + `libs/`) Sẵn sàng Tách Microservices:**
   - `apps/scheduler-api`: HTTP REST API Server (stateless, scale ngang nhiều pod).
   - `apps/scheduler-worker`: Background Cronjob Worker (chạy **1 replica duy nhất** + `pg_try_advisory_xact_lock` cho `@Cron` job `ExpirePendingAppointmentsCron`).
   - `libs/workshop` (`@app/workshop`), `libs/crm` (`@app/crm`), `libs/organization` (`@app/organization`), `libs/sso-mock` (`@app/sso-mock`), `libs/contracts` (`@app/contracts`), `libs/common` (`@app/common`).
2. **Xử lý Concurrency Chuẩn Node.js Connection Pool & PostgreSQL 18:**
   - **Khóa 2 cấp chống vượt hạn mức active (Case 6):** Lấy `pg_advisory_xact_lock(NS_CUSTOMER::int4, customer_id::int4)` TRƯỚC, rồi mới lấy `pg_advisory_xact_lock(NS_BOOKING::int4, dealership_id::int4)`.
   - **Idempotency an toàn trước crash (Case 11):** Lease 60s cho trạng thái `IN_PROGRESS` + cập nhật `COMPLETED` nguyên tử ngay bên trong database transaction.
   - **Real-Time SSE đồng bộ xuyên Process/Pod qua PostgreSQL `LISTEN / NOTIFY` (Case 12):** Giao event chuẩn post-commit kèm `version`, không cần Redis/RabbitMQ.
   - Mọi thao tác transactional chạy trên **cùng 1 `EntityManager`** với pool cấu hình `extra: { max: 25 }` (Case 13).
   - Hỗ trợ đầy đủ: Chuẩn hóa lưới slot (`(duration + 15') % 30' == 0`), chọn thợ **Best-fit**, cho phép Customer & Staff sửa `vehicle / technician` nếu còn trống, xử lý khách tới sớm (endpoint `reschedule` override lead time) và **Atomic Slot Swap (`POST /v1/staff/appointments/swap`)**.
3. **Observability Hiện đại với `AsyncLocalStorage`, `Pino` & Decorator `@LogSpan()`:**
   - `AsyncLocalStorage` (`node:async_hooks`) giữ `correlationId` và `actorSub` xuyên suốt chuỗi bất đồng bộ của từng request: tự động gắn `correlation_id` vào mọi dòng log Pino và tự động điền `created_by / updated_by` qua TypeORM `AuditColumnsSubscriber`.
   - `LoggingInterceptor` ghi `REQUEST_START` và `REQUEST_END` kèm **đầy đủ `response` cho cả thành công và lỗi** (đã che PII/secrets).
   - Decorator `@LogSpan()` tự động ghi Span log tối giản (`class, function, input, output`).

---

## 2. Lộ trình 7 Ngày (Master Checklist v5 — NestJS Monorepo)

### ✅ Ngày 1: System Design, Review & Chốt Kiến Trúc NestJS Monorepo (ĐÃ HOÀN THÀNH)
- [x] Phân tích đề bài, phản biện đa chiều (BMAD Architect & Analyst) và chốt toàn bộ Assumptions, Slot-Grid Alignment, Early Arrival / Atomic Slot Swap, Concurrency, Logging, Auth, DMS Monorepo Modules.
- [x] Hoàn thành bản chính thức `source/SYSTEM_DESIGN.md` (v5 — Tiếng Anh) và bản đối chiếu `source/SYSTEM_DESIGN_VI.md` (v5 — Tiếng Việt).

---

### ✅ Ngày 2: Dựng Khung NestJS Monorepo, Docker PostgreSQL 18 & `@app/common` (ĐÃ HOÀN THÀNH)
- [x] **2.1. Khởi tạo Git & Docker Compose:**
  - Khởi tạo Git repo trong `source/`, tạo nhánh làm việc theo quy ước `feature/ai/...`.
  - Tạo `docker-compose.yml` với Node.js 22+ LTS (`ENV TZ=UTC` + `tzdata`) và **PostgreSQL 18** (bật sẵn extension `btree_gist`).
- [x] **2.2. Khởi tạo NestJS Monorepo (`nest-cli.json`, `tsconfig.json`) & `@app/common`:**
  - Tạo cấu trúc `apps/scheduler-api`, `apps/scheduler-worker` và `libs/common`, `libs/contracts`, `libs/workshop`, `libs/crm`, `libs/organization`, `libs/sso-mock`.
  - Xây dựng `AsyncLocalStorage` context (`RequestContextService`) + `CorrelationIdMiddleware`.
  - Xây dựng `ResponseEnvelopeInterceptor` & `GlobalExceptionFilter` chuẩn `{ statusCode, errorCode, data, message, meta }`.
  - Xây dựng `LoggingInterceptor` (Pino JSON log + PII redaction + log đầy đủ response cả thành công lẫn lỗi + `duration_ms`) và decorator `@LogSpan()`.
  - Xây dựng TypeORM `AuditColumnsSubscriber` (`created_by`, `updated_by`, `cancelled_by`).

---

### ✅ Ngày 3: Minimal Mock OIDC (`@app/sso-mock`) + `@app/organization` + `@app/crm` (ĐÃ HOÀN THÀNH)
- [x] **3.1. `@app/sso-mock` (Thư viện `jose` chuẩn OIDC):**
  - Bảng `sso_clients` (`client_id`, `client_secret`), `sso_users`.
  - Script CLI `npm run sso:keys` (sinh cặp khóa RSA) & `npm run sso:issue-token -- <email>` (tạo sẵn token bypass login).
  - Endpoints: `GET /.well-known/openid-configuration`, `GET /oauth/jwks`, `POST /oauth/token` (`grant_type = password`).
  - `OidcJwtAuthGuard` + `@CurrentActor()` decorator ở `@app/common` verify JWT RS256 qua JWKS.
- [x] **3.2. `@app/organization` & `@app/crm` + `@app/contracts`:**
  - Entities & Migrations cho `tenants`, `dealerships`, `staff_members`, `customers`, `vehicles` (có `license_plate`).
  - Định nghĩa DI tokens & DTOs trong `@app/contracts` (`CRM_DIRECTORY_CONTRACT`, `ORGANIZATION_DIRECTORY_CONTRACT`).
  - Cấu hình `eslint-plugin-boundaries` kiểm soát chặt ranh giới import giữa các thư viện trong `libs/`.

---

### ✅ Ngày 4: Core Workshop Engine (`@app/workshop`) — Availability & Booking (ĐÃ HOÀN THÀNH)
- [x] **4.1. Schema `@app/workshop` & GiST Exclusion Constraints:**
  - Entities & Migrations cho `workshop_settings` (có `timezone`), `skills`, `service_types`, `service_bays`, `technicians`, `technician_skills`, `technician_unavailabilities`, `bay_closures`, `appointments` (kèm snapshot + audit columns + `period tstzrange`), `appointment_events`, `idempotency_keys` (`UNIQUE(subject, key)`, cột `locked_until` lease 60s).
  - Cài đặt 3 ràng buộc `EXCLUDE USING gist` (`no_bay_overlap`, `no_technician_overlap`, `no_vehicle_overlap`).
- [x] **4.2. Availability (1 SQL Query) & Transactional Booking (Customer + Dealership Advisory Locks):**
  - `GetDealershipAvailabilityUseCase`: 1 câu SQL với `generate_series` tính toán toàn bộ slot trong ngày (`end_at ≤ closes_at`, trừ lịch nghỉ/đóng khoang).
  - `GetAvailableTechniciansUseCase`: Trả danh sách technician đủ chuyên môn và đang trống tại khung giờ khách chọn.
  - `IdempotencyInterceptor`: `INSERT` trước trạng thái `IN_PROGRESS` kèm lease 60s (`locked_until = now() + 60s`).
  - `CreateAppointmentUseCase`: Chạy trên 1 `EntityManager` trong `dataSource.transaction()`, xin khóa theo thứ tự `pg_advisory_xact_lock(NS_CUSTOMER::int4, customerId::int4)` rồi `pg_advisory_xact_lock(NS_BOOKING::int4, dealershipId::int4)`. Kiểm tra `max_active_per_customer` xuyên đại lý, chọn Bay + Technician (best-fit hoặc theo chỉ định), cập nhật `idempotency_keys` sang `COMPLETED` cùng transaction, gọi `pg_notify('appointment_events', payload)` và commit.
- [x] **4.3. Database Seeder:**
  - Seed 2 Dealerships (Dealership A: `requires_approval = false`; Dealership B: `requires_approval = true`), mỗi đại lý 10 Bays + 10 Technicians đa dạng kỹ năng, 4 gói `ServiceType` chuẩn lưới 30 phút (`45'+15'`, `75'+15'`, `105'+15'`, `165'+15'`), Customers, Vehicles, Staff và in sẵn danh sách Token mẫu.

---

### ✅ Ngày 5: Edit / Reassign / Reschedule / Swap, State Machine, Worker & Kiểm thử Concurrency (ĐÃ HOÀN THÀNH)
- [x] **5.1. Chỉnh sửa Lịch hẹn, Reassign, Staff Reschedule, Atomic Slot Swap & State Machine:**
  - `UpdateAppointmentUseCase` (Customer): Cho phép sửa `start_at`, `service_type_id`, `vehicle_id`, `technician_id`, `notes` (kiểm tra đồng thời **cả Bay và Technician** trống dưới advisory lock + optimistic lock `If-Match`).
  - `ReassignAppointmentUseCase` (Staff): Cho phép đổi `technician_id` / `service_bay_id` nếu còn trống.
  - `RescheduleAppointmentUseCase` (`POST /v1/staff/appointments/{id}/reschedule` — Staff): Dời giờ cho khách tới sớm (Kịch bản A & B), override lead time, kiểm tra cả Bay và Technician trống.
  - `SwapAppointmentsUseCase` (`POST /v1/staff/appointments/swap` — Staff): Hoán đổi nguyên tử vị trí 2 lịch hẹn trong cùng đại lý (dùng bước trung gian `SWAPPING` dưới `pg_advisory_xact_lock`).
  - `AppointmentStateMachine` & các API của Staff (`approve`, `reject`, `check-in`, `start`, `complete`, `no-show`) + Customer `cancel` (hủy mềm, lưu `cancelled_by`).
  - **Real-Time Post-Commit SSE (`AppointmentStreamService` qua PostgreSQL `LISTEN / NOTIFY`):**
    - `GET /v1/appointments/stream` (`@Sse()`): Đẩy real-time cho màn hình Customer.
    - `GET /v1/staff/appointments/stream?technician_id=` (`@Sse()`): Đẩy real-time cho màn hình Dealership & Technician Board.
    - Hỗ trợ đồng bộ xuyên process (`apps/scheduler-worker`) và multi-pod không cần Redis, kèm kiểm tra `version` chống event cũ đến lệch thứ tự.
  - `ExpirePendingAppointmentsCron` trong `apps/scheduler-worker`: Chuyển các lịch `PENDING` tới mốc `start_at − cancellation_cutoff` sang `EXPIRED` và bắn `pg_notify`.
- [x] **5.2. Bộ Kiểm thử Toàn diện (Jest Unit, E2E & `Promise.all` Concurrency Suite):**
  - Unit & E2E Tests bao phủ toàn bộ luồng nghiệp vụ.
  - **Concurrent HTTP Booking Suite (`Promise.all` + Supertest)** trên PostgreSQL thật:
    1. Bắn song song 20+ requests vào cùng khung giờ: số `201` $\le$ capacity, còn lại nhận `409`.
    2. Bắn song song vào các khung giờ khác nhau: đều thành công (không có false `409`).
    3. **Case 6 Concurrency Spec:** 1 khách hàng có sẵn 2 lịch active, bắn đồng thời đặt lịch tại Dealership A và Dealership B $\to$ đúng 1 request thành công, 1 request nhận `409 ACTIVE_APPOINTMENT_LIMIT_REACHED` (chứng minh khóa `NS_CUSTOMER` triệt tiêu race condition xuyên đại lý).

---

### ✅ Ngày 6: OpenAPI Docs, Live Demo Screens, README, QA Matrices & Postman Collections (ĐÃ HOÀN THÀNH)
- [x] **6.1. Tích hợp `@nestjs/swagger` (`/docs/api`), Real-Time SSE Streams (`/v1/appointments/stream` & `/v1/staff/appointments/stream`) & `@nestjs/terminus` Health Checks (`/health/live`, `/health/ready`).**
- [x] **6.2. Viết `source/README.md` kèm bộ `cURL` mẫu và mục AI Collaboration Narrative (17 vòng phản biện).**
- [x] **6.3. Bộ QA Test Matrices (Excel) & Executable Postman Collections (`docs/test/`):**
  - Xây dựng file Excel test matrix chuẩn 2 sheet (Spec & Live Docker Execution Evidence): `The Unified Service Scheduler — Comprehensive Master API TestCases.xlsx` (28 TC bao phủ toàn bộ 8 module hệ thống).
  - Đồng bộ runnable Postman collection tự động assertion và dynamic variable chaining: `The Unified Service Scheduler — Comprehensive Master API Collection (All Endpoints).postman_collection.json`.

---

### 🎬 Ngày 7: Rà soát Cuối cùng & Quay Video Presentation (ĐANG TIẾN HÀNH / SẴN SÀNG)
- [ ] **7.1. Chạy thử toàn bộ từ trạng thái sạch (`docker compose down -v && docker compose up -d` & `./scripts/db.sh reset`).**
- [ ] **7.2. Quay Video 5–10 phút theo kịch bản và nộp bài.**
