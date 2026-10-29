# Tài liệu Thiết kế Hệ thống — Unified Service Scheduler (Scenario A) — Bản Tiếng Việt (v4 — NestJS Monorepo)

> 📌 Bản diễn giải Tiếng Việt của `SYSTEM_DESIGN.md` (v4 — Kiến trúc **NestJS Monorepo `apps/` + `libs/`**, TypeScript 5+, Node.js 22+ LTS, TypeORM, PostgreSQL 18, Pino). Số mục tương ứng 1–1 với bản Tiếng Anh để user tiện đối chiếu khi quay video và phỏng vấn.

---

## 1. Bài toán & Phạm vi

Đại lý đang đặt lịch bảo dưỡng thủ công. Hệ thống backend cho phép **khách hàng đã có tài khoản** đặt lịch cho xe của mình tại đại lý và thời điểm họ chọn, đảm bảo theo thời gian thực rằng có **đồng thời** 1 `ServiceBay` trống và 1 `Technician` **đủ chuyên môn** trống trong suốt thời gian dịch vụ, và tạo bản ghi lịch hẹn xác nhận liên kết khách hàng, xe, kỹ thuật viên, khoang dịch vụ.

### 1.1 Actors
| Actor | Đăng nhập | Trong phạm vi MVP | Ngoài phạm vi |
| :--- | :--- | :--- | :--- |
| **Customer** | Token SSO | Xem xe của mình, xem dealership & service type, xem slot trống, tùy chọn chọn technician, tạo / sửa / hủy lịch, xem lịch sử | Tự đăng ký, khách vãng lai, gợi ý dealership gần nhất |
| **Dealership Staff** | Token SSO (gắn 1 dealership) | Xem lịch của dealership mình, approve / reject, đổi technician / bay (`reassign`), **hoán đổi vị trí 2 lịch hẹn (`swap`)**, check-in, start, complete, no-show | Quản lý bay, technician, ca làm; quản trị nhiều dealership |
| **Technician** | Không | Được hệ thống tự gán (best-fit) hoặc do customer / staff chọn nếu còn trống | App cho technician |
| **Service Bay** | Không | Được hệ thống tự gán hoặc do staff chọn | Màn hình quản lý bay |
| **System** | — | Worker job (`apps/scheduler-worker`) tự chuyển các lịch `PENDING` chưa duyệt khi tới mốc `start_at − cancellation_cutoff` sang `EXPIRED` | — |

### 1.2 Mức ưu tiên
- **P0 (Core requirements):** truy vấn availability (1 câu SQL), đặt lịch tuần tự hóa theo dealership với cấp phát bay + technician đủ chuyên môn, bản ghi lịch hẹn `CONFIRMED` (chế độ auto-confirm), xác thực token, kiểm thử concurrency bằng `Promise.all` (Supertest).
- **P1 (Build for the future):** luồng duyệt (`requires_approval`), phân quyền staff theo dealership, đổi technician/bay (`reassign`), **hoán đổi slot (`swap`)**, state machine, worker job expire `PENDING`, giới hạn số lịch active mỗi khách, idempotency chống race, optimistic locking, response envelope, structured log với Pino + `AsyncLocalStorage` + `@LogSpan()` decorator (log đầy đủ cả response thành công & lỗi + masking), mock OIDC tối giản (`jose`), `@nestjs/swagger` OpenAPI, `eslint-plugin-boundaries`.
- **P2 (Chỉ thiết kế):** tự xếp lại lịch khi overrun lớn, auto no-show, transactional outbox + event bus (Kafka / RabbitMQ), Row-Level Security, waitlist, API quản lý ca nghỉ / đóng bay, SSO thật, tách microservices vật lý.

---

## 2. Giả định (Assumptions)

### 2.1 Phạm vi & Actors
- **S1–S5:** Chỉ khách đã có account + xe (seed); khách tự chọn dealership; mọi dealership xử lý mọi loại xe; staff thuộc đúng 1 dealership; hiện single-tenant nhưng mọi bảng nghiệp vụ có `tenant_id`.

### 2.2 Tài nguyên
- **R1–R4:** Mỗi dealership cố định **10 service bays + 10 technicians**; 1 xe ↔ 1 technician ↔ 1 bay; không làm song song 2 xe; mỗi `ServiceType` yêu cầu 1 `Skill`, technician có thể có nhiều skill.
- **R5 (Best-fit Technician Selection):** Khi khách không chỉ định technician, hệ thống chọn technician đủ skill đang trống theo thứ tự **ít skill nhất trước**, sau đó đến **ít lịch trong ngày nhất**. Bay chọn theo ít lịch trong ngày nhất.
- **R6 (Ca nghỉ / Đóng khoang):** Tạo sẵn bảng `technician_unavailabilities` và `bay_closures` (mặc định rỗng) và đưa sẵn điều kiện loại trừ vào câu SQL availability / allocation.

### 2.3 Quy tắc đặt lịch & Chuẩn hóa Lưới Slot (Cấu hình tại `workshop_settings` của từng dealership)
- **B1 (Thời lượng dịch vụ mặc định bắt buộc):** Mỗi `ServiceType` định nghĩa sẵn `duration_minutes` (Flat-Rate Standard Labor Time) áp dụng ngay khi khách chọn (`end_at = start_at + duration_minutes`).
- **B2 (Thời gian đệm — Turnover Buffer):** Tài nguyên bị chiếm trong `[start_at, end_at + buffer)` (mặc định `buffer = 15'`).
- **B3 (Chuẩn hóa Lưới Slot — Zero Slot Fragmentation):** Để triệt tiêu "thời gian chết" giữa các ca trên lưới `slot_minutes = 30'` mà vẫn giữ nguyên `buffer = 15'`, thời lượng các gói `ServiceType` được chuẩn hóa sao cho **`(duration_minutes + buffer_minutes)` luôn là bội số của `30 phút`**:
  - `OIL_CHANGE` (*Thay dầu nhanh*): `45'` + `15' buffer` = **60'** (2 slots)
  - `BRAKE_SERVICE` (*Bảo dưỡng phanh*): `75'` + `15' buffer` = **90'** (3 slots)
  - `EV_DIAGNOSTIC` (*Chẩn đoán pin cao áp EV*): `105'` + `15' buffer` = **120'** (4 slots)
  - `MAJOR_SERVICE` (*Bảo dưỡng tổng quát định kỳ*): `165'` + `15' buffer` = **180'** (6 slots)
- **B4–B8:** Khoảng nửa mở `[start, end)`; giờ bắt đầu theo lưới 30 phút trong giờ mở cửa xưởng (`08:00–18:00`), chỉ yêu cầu **`end_at ≤ closes_at`** (buffer được tràn qua giờ đóng cửa); `lead_time = 120'`, `horizon = 30 ngày`; 1 xe không có 2 lịch active trùng giờ; mỗi khách tối đa `max_active_per_customer = 3` lịch active.
- **B9 (Cờ `requires_approval`):** `false` → đặt xong là **`CONFIRMED` ngay**; `true` → **`PENDING`** chờ staff duyệt. Cả 2 chế độ đều giữ tài nguyên ngay lúc đặt. (Seed Dealership A = `false`, Dealership B = `true`).

### 2.4 Quy tắc vòng đời & chỉnh sửa
- **L1–L5:** Customer sửa `start_at`, `service_type_id`, `vehicle_id`, `technician_id`, `notes`; Staff `reassign` đổi `technician_id / service_bay_id`; Hủy mềm `CANCELLED`; Worker job chuyển `PENDING` quá hạn tại mốc `now ≥ start_at − cancellation_cutoff` sang `EXPIRED`.
- **L6–L7 (Vận hành & Hoàn thành sớm):** Chuyển sang `COMPLETED` sớm hơn `end_at` giải phóng ngay lập tức cả `ServiceBay` và `Technician` cho phần thời gian còn dư.
- **L8 (Khách tới sớm & Hoán đổi Slot — Quy tắc 3 Kịch bản):** Nếu Customer 2 (đặt `10:00–11:00` với `Technician 1`) mang xe tới lúc `08:00` khi Customer 1 (đặt `08:00–09:00` với `Technician 1` / `Bay 1`) chưa tới:
  1. **Kịch bản A — Đẩy lên sớm bằng tài nguyên trống khác (khi chưa hết `grace_minutes` của Customer 1):** Chỉ được đẩy lịch của Customer 2 lên `08:00–09:00` nếu kiểm tra còn trống **CẢ `Technician` khác đủ chuyên môn LẪN `ServiceBay` khác** tại khung `08:00–09:00` (đề phòng hết Bay).
  2. **Kịch bản B — Sau khi hết Grace Period (`08:15`):** Staff đánh `NO_SHOW` cho Customer 1 (giải phóng `Bay 1` và `Technician 1`) rồi đẩy Customer 2 lên slot `08:00`.
  3. **Kịch bản C — Hoán đổi Slot nguyên tử (`POST /v1/staff/appointments/swap`):** Nếu Customer 1 báo tới trễ lúc `10:00` và đồng ý đổi chỗ với Customer 2, staff gọi API hoán đổi 2 lịch hẹn trong 1 ACID transaction (dùng bước trung gian `status = 'SWAPPING'` bên trong khóa `pg_advisory_xact_lock`).
- **L9:** Các trạng thái chiếm tài nguyên: `PENDING, CONFIRMED, CHECKED_IN, IN_PROGRESS`.

---

## 3. Phân rã Module theo DMS trên nền NestJS Monorepo (`apps/` + `libs/`)

Cấu trúc **NestJS Monorepo** tách biệt rõ **Đơn vị triển khai vật lý (`apps/`)** và **Ranh giới Domain Logic (`libs/`)**:
- **`apps/scheduler-api`:** HTTP REST API Server chính (stateless, scale ngang nhiều pod).
- **`apps/scheduler-worker`:** Background Cronjob Worker (chạy **1 replica duy nhất** kết hợp `pg_try_advisory_xact_lock` cho job `ExpirePendingAppointmentsCron`, tránh lỗi chạy trùng cron khi scale nhiều pod API).
- **`libs/workshop` (`@app/workshop`):** Bounded context cốt lõi (`Settings`, `ServiceCatalog`, `Resource`, `Appointment`).
- **`libs/crm` (`@app/crm`):** Customer & Vehicle lifecycle domain (ranh giới PII / GDPR).
- **`libs/organization` (`@app/organization`):** Tenant, Dealership directory & Staff domain.
- **`libs/sso-mock` (`@app/sso-mock`):** Minimal Mock OIDC Provider (chỉ bật ở môi trường local/test).
- **`libs/contracts` (`@app/contracts`):** Chứa các DI Interface Tokens + DTOs giao tiếp liên-module (`CRM_DIRECTORY_CONTRACT`, `ORGANIZATION_DIRECTORY_CONTRACT`).
- **`libs/common` (`@app/common`):** Tầng hạ tầng dùng chung: `AsyncLocalStorage` request context, Pino logger, `@LogSpan()` decorator, `ResponseEnvelopeInterceptor`, `GlobalExceptionFilter`, `OidcJwtAuthGuard`, `IdempotencyInterceptor`, `AuditColumnsSubscriber`.

### 3.1 Kỷ luật ranh giới được ép bằng công cụ
- **Public Contracts (`@app/contracts`):** Các module trong `libs/` chỉ giao tiếp qua DI token và DTO trong `@app/contracts`.
- **Lint Rules trong CI (`eslint-plugin-boundaries`):** Cấm `@app/workshop` import trực tiếp entity/service/repository nội bộ của `@app/crm` hoặc `@app/organization`.
- **Display Snapshots:** Lưu sẵn `customer_name`, `vehicle_plate`, `vehicle_label` trên bảng `appointments`.

---

## 4. Kiến trúc & Lộ trình Tiến hóa Microservices (Phased Strangler Extraction)

Nhờ cấu trúc `apps/` + `libs/` của NestJS Monorepo, việc tách microservice ở các giai đoạn sau chỉ là **tạo thêm file bootstrap `apps/<service>/src/main.ts` mà không phải di chuyển code nghiệp vụ trong `libs/`**:
- **Stage 1 (MVP — Modular Monolith):** `apps/scheduler-api` nạp `@app/workshop`, `@app/crm`, `@app/organization`; `apps/scheduler-worker` chạy cronjob.
- **Stage 2 (First Extraction — Tách `apps/workshop-service` trước):** Khi tải đặt lịch tăng cao, tách `@app/workshop` thành service riêng; phần `apps/core-service` vẫn đóng gói chung cả `@app/crm` và `@app/organization` để tránh tách vụn quá sớm.
- **Stage 3 (Domain Growth — Tách `apps/crm-service`):** Khi nghiệp vụ CRM mở rộng lớn (như Scenario C — Sales Lead Management), tách tiếp `@app/crm` thành service độc lập.

---

## 5. Data Model & Ràng buộc Toàn vẹn (PostgreSQL 18 + TypeORM)

- Giữ nguyên toàn bộ thiết kế bảng PostgreSQL 18: `workshop_settings`, `appointments` (có snapshots `customer_name`, `vehicle_plate`, `vehicle_label` và đầy đủ audit columns `created_at`, `updated_at`, `created_by`, `updated_by`, `cancelled_by` được tự động điền bởi `AuditColumnsSubscriber` đọc `actorSub` từ `AsyncLocalStorage`), `appointment_events`, `technician_unavailabilities`, `bay_closures`, `idempotency_keys`.
- Giữ nguyên cột sinh `period tstzrange` và 3 ràng buộc `EXCLUDE USING gist` (`no_bay_overlap`, `no_technician_overlap`, `no_vehicle_overlap`).

---

## 6, 7 & 8. Luồng Dữ liệu, Concurrency & Quy tắc Connection Pool trong Node.js

1. **Quy tắc sống còn với Node.js Connection Pool (`EntityManager` Pinning):**
   - Khác với PHP (1 connection cố định/request), Node.js `pg` dùng Connection Pool.
   - Do đó, trong `CreateAppointmentUseCase`, `UpdateAppointmentUseCase`, `ReassignAppointmentUseCase` và `SwapAppointmentsUseCase`, toàn bộ các lệnh `SET LOCAL lock_timeout = '2s'`, `SELECT pg_advisory_xact_lock($1, $2)`, các truy vấn kiểm tra Bay/Technician trống và lệnh `INSERT / UPDATE` **bắt buộc phải thực thi qua cùng một đối tượng `manager: EntityManager` bên trong `dataSource.transaction(async (manager) => { ... })`** để đảm bảo nằm trên đúng 1 kết nối TCP vật lý tới PostgreSQL!
2. **Atomic Slot Swap (`POST /v1/staff/appointments/swap`):**
   - Khóa advisory theo dealership + khóa 2 dòng appointment theo thứ tự ID tăng dần (chống deadlock) + chuyển tạm dòng 1 sang `status = 'SWAPPING'` để dịch chuyển dòng 2 và dòng 1 qua Partial GiST Exclusion Constraint an toàn tuyệt đối.

---

## 9, 10 & 11. API Envelope, Mock OIDC (`jose`) & Observability (`Pino` + `AsyncLocalStorage` + `@LogSpan()`)

- **Response Envelope thống nhất:** `ResponseEnvelopeInterceptor` và `GlobalExceptionFilter` chuẩn hóa mọi kết quả trả về theo `{ statusCode, errorCode, data, message, meta }`.
- **Mock OIDC (`@app/sso-mock` + thư viện `jose`):**
  - Lệnh `npm run sso:keys` sinh cặp khóa RSA; `npm run sso:issue-token -- <email>` in sẵn token để bypass login.
  - `OidcJwtAuthGuard` verify chữ ký RS256 qua JWKS cache (kiểm tra chặt `exp` với dung sai 0s, `iss`, `aud`).
- **Observability chuẩn Node.js hiện đại:**
  - Dùng **`AsyncLocalStorage` (`node:async_hooks`)** lưu `correlationId` và thông tin user xuyên suốt chuỗi `async/await` của request, tự động gắn `correlation_id` vào **mọi dòng log của Pino**.
  - `LoggingInterceptor` ghi 2 dòng `REQUEST_START` và `REQUEST_END` kèm **đầy đủ `response` cho cả thành công và lỗi** (đã qua bộ lọc che PII/secrets).
  - **Decorator `@LogSpan()`:** Gắn trực tiếp lên các hàm UseCase/Service để tự động log `class, function, input, output` cực kỳ gọn và sạch.

---

## 12, 13, 14 & 15. Multi-tenancy, Kiểm thử (`Jest` + `Supertest`), Công nghệ & GenAI Collaboration

- **Kiểm thử Concurrency với `Promise.all`:** Trong Node.js, bài test concurrency dùng `Promise.all` bắn đồng thời 20+ HTTP requests qua `Supertest` tới NestJS server đang kết nối PostgreSQL thật (kiểm tra cả đặt trùng giờ lẫn đặt khác giờ cùng lúc).
- **Kiểm soát kiến trúc tự động:** Dùng `eslint-plugin-boundaries` trong `npm run lint` để chặn mọi import trái phép giữa các thư viện trong `libs/`.
- **Mục 15 (GenAI Collaboration):** Ghi nhận đầy đủ 15 vòng phản biện và tiến hóa kiến trúc (bao gồm quyết định chuyển sang NestJS Monorepo, xử lý `AsyncLocalStorage`, `EntityManager` connection pinning và tách `apps/scheduler-worker` 1 replica).
