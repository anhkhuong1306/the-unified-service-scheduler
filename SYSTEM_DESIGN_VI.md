# Tài liệu Thiết kế Hệ thống — Unified Service Scheduler (Scenario A) — Bản Tiếng Việt (v5 — NestJS Monorepo)

> 📌 Bản diễn giải Tiếng Việt của `SYSTEM_DESIGN.md` (v5 — Kiến trúc **NestJS Monorepo `apps/` + `libs/`**, TypeScript 5+, Node.js 22+ LTS, TypeORM, PostgreSQL 18, Pino). Đã hiệu chỉnh toàn diện theo review concurrency mới nhất. Số mục tương ứng 1–1 với bản Tiếng Anh để user tiện đối chiếu khi quay video và phỏng vấn.

---

## 1. Bài toán & Phạm vi

Đại lý đang đặt lịch bảo dưỡng thủ công. Hệ thống backend cho phép **khách hàng đã có tài khoản** đặt lịch cho xe của mình tại đại lý và thời điểm họ chọn, đảm bảo theo thời gian thực rằng có **đồng thời** 1 `ServiceBay` trống và 1 `Technician` **đủ chuyên môn** trống trong suốt thời gian dịch vụ, và tạo bản ghi lịch hẹn xác nhận liên kết khách hàng, xe, kỹ thuật viên, khoang dịch vụ.

### 1.1 Actors
| Actor | Đăng nhập | Trong phạm vi MVP | Ngoài phạm vi |
| :--- | :--- | :--- | :--- |
| **Customer** | Token SSO | Xem xe của mình, xem dealership & service type, xem slot trống, tùy chọn chọn technician, tạo / sửa / hủy lịch, xem lịch sử, nhận luồng SSE real-time | Tự đăng ký, khách vãng lai, gợi ý dealership gần nhất |
| **Dealership Staff** | Token SSO (gắn 1 dealership) | Xem lịch của dealership mình, approve / reject, đổi technician / bay (`reassign`), **dời lịch khách tới sớm (`reschedule`)**, **hoán đổi vị trí 2 lịch hẹn (`swap`)**, check-in, start, complete, no-show, bảng SSE real-time | Quản lý bay, technician, ca làm; quản trị nhiều dealership |
| **Technician** | Không | Được hệ thống tự gán (best-fit) hoặc do customer / staff chọn nếu còn trống; xem lịch làm việc trực tiếp qua SSE Board | App đăng nhập riêng cho technician |
| **Service Bay** | Không | Được hệ thống tự gán hoặc do staff chọn | Màn hình quản lý bay |
| **System** | — | Worker job (`apps/scheduler-worker`) tự chuyển các lịch `PENDING` chưa duyệt khi tới mốc `start_at − cancellation_cutoff` sang `EXPIRED` | — |

### 1.2 Mức ưu tiên
- **P0 (Core requirements):** truy vấn availability (1 câu SQL), đặt lịch tuần tự hóa theo dealership với cấp phát bay + technician đủ chuyên môn, bản ghi lịch hẹn `CONFIRMED` (chế độ auto-confirm), xác thực token, kiểm thử concurrency bằng `Promise.all` (Supertest).
- **P1 (Build for the future):** luồng duyệt (`requires_approval`), phân quyền staff theo dealership, đổi technician/bay (`reassign`), **dời lịch khách tới sớm (`reschedule`)**, **hoán đổi slot (`swap`)**, state machine, worker job expire `PENDING`, **bảo vệ giới hạn active appointment bằng Customer Advisory Lock (chống race xuyên dealership — Case 6)**, **idempotency hoàn tất atomic trong transaction kèm lease 60s (chống crash kẹt — Case 11)**, **Real-Time SSE đồng bộ qua PostgreSQL `LISTEN / NOTIFY` và event `version` (Case 12)**, optimistic locking, response envelope, structured log với Pino + `AsyncLocalStorage` + `@LogSpan()` decorator, mock OIDC tối giản (`jose`), `@nestjs/swagger` OpenAPI, `eslint-plugin-boundaries`.
- **P2 (Chỉ thiết kế):** tự xếp lại lịch khi overrun lớn, auto no-show, transactional outbox + event bus (Kafka / RabbitMQ), Row-Level Security, waitlist, API quản lý ca nghỉ / đóng bay, SSO thật, tách microservices vật lý.

---

## 2. Giả định (Assumptions) & Invariants Kiến trúc

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
- **B4–B8:** Khoảng nửa mở `[start, end)`; giờ bắt đầu theo lưới 30 phút trong giờ mở cửa xưởng (`08:00–18:00`), chỉ yêu cầu **`end_at ≤ closes_at`** (buffer được tràn qua giờ đóng cửa); `lead_time = 120'`, `horizon = 30 ngày`; 1 xe không có 2 lịch active trùng giờ; mỗi khách tối đa `max_active_per_customer = 3` lịch active trên toàn hệ thống (được bảo vệ bằng `NS_CUSTOMER` lock).
- **B9 (Cờ `requires_approval`):** `false` → đặt xong là **`CONFIRMED` ngay**; `true` → **`PENDING`** chờ staff duyệt. Cả 2 chế độ đều giữ tài nguyên ngay lúc đặt. (Seed Dealership A = `false`, Dealership B = `true`).

### 2.4 Quy tắc vòng đời, chỉnh sửa & 3 Invariants Cốt lõi
- **L1–L5:** Customer sửa `start_at`, `service_type_id`, `vehicle_id`, `technician_id`, `notes`; Staff `reassign` đổi `technician_id / service_bay_id`; Staff `reschedule` dời `start_at` cho khách tới sớm (override `lead_time`); Hủy mềm `CANCELLED`; Worker job chuyển `PENDING` quá hạn tại mốc `now ≥ start_at − cancellation_cutoff` sang `EXPIRED`.
- **L6–L7 (Vận hành & Hoàn thành sớm):** Chuyển sang `COMPLETED` sớm hơn `end_at` giải phóng ngay lập tức cả `ServiceBay` và `Technician` cho phần thời gian còn dư.
- **L8 (Khách tới sớm & Hoán đổi Slot — Quy tắc 3 Kịch bản):** Nếu Customer 2 (đặt `10:00–11:00` với `Technician 1`) mang xe tới lúc `08:00` khi Customer 1 (đặt `08:00–09:00` với `Technician 1` / `Bay 1`) chưa tới:
  1. **Kịch bản A — Đẩy lên sớm bằng tài nguyên trống khác (khi chưa hết `grace_minutes` của Customer 1):** Staff gọi `POST /v1/staff/appointments/{id}/reschedule`. Hệ thống kiểm tra còn trống **CẢ `Technician` khác đủ chuyên môn LẪN `ServiceBay` khác** tại khung `08:00–09:00` (đề phòng hết Bay).
  2. **Kịch bản B — Sau khi hết Grace Period (`08:15`):** Staff đánh `NO_SHOW` cho Customer 1 (giải phóng `Bay 1` và `Technician 1`) rồi gọi staff `reschedule` để đẩy Customer 2 lên slot `08:00`.
  3. **Kịch bản C — Hoán đổi Slot nguyên tử (`POST /v1/staff/appointments/swap`):** Nếu Customer 1 báo tới trễ lúc `10:00` và đồng ý đổi chỗ với Customer 2, staff gọi API hoán đổi 2 lịch hẹn trong 1 ACID transaction (dùng bước trung gian `status = 'SWAPPING'` bên trong khóa `pg_advisory_xact_lock`).
- **L9 (Trạng thái chiếm tài nguyên):** `PENDING, CONFIRMED, CHECKED_IN, IN_PROGRESS`. (`'SWAPPING'` là trạng thái tạm thời trong transaction, không bao giờ commit ra ngoài).

#### 3 Invariants Kiến trúc Bắt buộc
1. **Lock Hierarchy Invariant (Chống Deadlock):** Mọi transaction cần nhiều lock đều phải xin theo thứ tự:
   $$\text{Customer Advisory Lock} \longrightarrow \text{Dealership Advisory Lock} \longrightarrow \text{Row Locks (FOR UPDATE theo id ASC)}$$
2. **Lock Invariant:** Mọi thao tác **tăng thêm hoặc dịch chuyển occupancy** (`create`, customer `edit`, staff `reassign`, staff `reschedule`, staff `swap`) BẮT BUỘC phải lấy `pg_advisory_xact_lock(NS_BOOKING::int4, dealership_id::int4)`. Các thao tác **chỉ giải phóng hoặc giữ nguyên khoảng thời gian** (`approve`, `reject`, `cancel`, `check-in`, `start`, `complete`, `no-show`, worker `expire`) KHÔNG lấy dealership lock, chỉ dùng row-level optimistic lock (`version`).
3. **Version Invariant:** **Mọi** thao tác ghi bảng `appointments` đều phải tăng `version = version + 1`.

---

## 3. Phân rã Module theo DMS trên nền NestJS Monorepo (`apps/` + `libs/`)

Cấu trúc **NestJS Monorepo** tách biệt rõ **Đơn vị triển khai vật lý (`apps/`)** và **Ranh giới Domain Logic (`libs/`)**:
- **`apps/scheduler-api`:** HTTP REST API Server chính (stateless, scale ngang nhiều pod).
- **`apps/scheduler-worker`:** Background Cronjob Worker (chạy **1 replica duy nhất** kết hợp `pg_try_advisory_xact_lock` cho job `ExpirePendingAppointmentsCron`, tránh lỗi chạy trùng cron khi scale nhiều pod API).
- **`libs/workshop` (`@app/workshop`):** Bounded context cốt lõi (`Settings` bao gồm cả `timezone`, `ServiceCatalog`, `Resource`, `Appointment`). Booking hot-path nằm hoàn toàn trong `@app/workshop`, **zero runtime reads** sang `@app/organization`.
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

- Bảng `workshop_settings`: sao chép sẵn `timezone` từ dealership để `@app/workshop` độc lập tuyệt đối khi tính slot.
- Bảng `idempotency_keys`: có cột `locked_until` (lease 60s cho trạng thái `IN_PROGRESS`). Chuyển sang `COMPLETED` cùng transaction với `appointments`.
- Bảng `appointments`: có snapshots `customer_name`, `vehicle_plate`, `vehicle_label` và đầy đủ audit columns `created_at`, `updated_at`, `created_by`, `updated_by`, `cancelled_by` (tự động qua `AuditColumnsSubscriber`). Cột `version` (optimistic lock).
- Giữ nguyên cột sinh `period tstzrange` và 3 ràng buộc `EXCLUDE USING gist` (`no_bay_overlap`, `no_technician_overlap`, `no_vehicle_overlap`).

---

## 6, 7 & 8. Luồng Dữ liệu, Concurrency & Xử lý Triệt để 11 Điểm Review

1. **Khóa 2 Cấp Ngăn Chặn Vượt Hạn Mức Active Xuyên Dealership (Fix Case 6):**
   - Đặt lịch tại `CreateAppointmentUseCase`: Xin `pg_advisory_xact_lock(NS_CUSTOMER::int4, customerId::int4)` TRƯỚC, rồi mới xin `pg_advisory_xact_lock(NS_BOOKING::int4, dealershipId::int4)`. Đếm số lịch active trên toàn hệ thống dưới khóa customer này đảm bảo không bao giờ bị vượt `max_active_per_customer = 3`.
2. **Ép Kiểu Tham Số Advisory Lock (`::int4`):**
   - Hàm 2 tham số `pg_advisory_xact_lock(int4, int4)` nhận số 32-bit. Toàn bộ code đều ép kiểu tường minh `::int4`.
3. **Idempotency An Toàn Tuyệt Đối Trước Crash (Fix Case 11):**
   - Insert `IN_PROGRESS` kèm lease ngắn 60s (`locked_until = now() + 60s`).
   - Cập nhật kết quả `COMPLETED` **ngay bên trong database transaction** tạo lịch hẹn.
4. **Real-Time SSE Đồng Bộ Xuyên Process/Pod Bằng PostgreSQL `LISTEN / NOTIFY` (Fix Case 12):**
   - Bên trong transaction, gọi `SELECT pg_notify('appointment_events', payload)`.
   - `NOTIFY` chỉ được PostgreSQL giao **ngay khi `COMMIT` thành công**, tự động hủy nếu `ROLLBACK`.
   - `apps/scheduler-worker` (cron expire) và các pod `apps/scheduler-api` đều dùng chung kênh này, giúp event đến tất cả SSE client mà không cần cài thêm Redis/RabbitMQ.
   - Event mang theo `version` để client bỏ qua các gói tin cũ nếu đến lệch thứ tự (`payload.version <= local.version`).
5. **Cấu Hình Pool Connection Chống Nghẽn (Fix Case 13):**
   - Cấu hình TypeORM `extra: { max: 25, connectionTimeoutMillis: 3000 }` để 20+ request chờ lock không làm cạn pool (mặc định của `pg` là 10). Mọi câu lệnh trong transaction đều chạy qua `manager: EntityManager` duy nhất.
6. **Quy Tắc Retry & Tính Lại Giờ Sau Khi Giữ Lock:**
   - Retry lỗi `55P03` / `40P01` bọc **toàn bộ transaction** từ bên ngoài.
   - Mốc thời gian (`now`) để kiểm tra `lead_time`, `cancellation_cutoff` được tính **sau khi đã lấy được lock**.
7. **Bổ Sung Endpoint Dời Lịch Cho Khách Tới Sớm (`reschedule`):**
   - Bổ sung `POST /v1/staff/appointments/{id}/reschedule` cho staff dời `start_at` của khách tới sớm (Kịch bản A & B), override `lead_time`, kiểm tra cả Bay và Technician trống.
8. **Đánh Giá Lý Do `409` Rõ Ràng (Case 2):**
   - Kiểm tra `NO_FREE_BAY` trước, sau đó đến `NO_QUALIFIED_TECHNICIAN`, và trả về số lượng chi tiết (`free_bays`, `free_technicians`) trong payload.

### 8.1 Ứng Phó Tải Đột Biến 10.000 Requests Cùng Lúc (10k RPS) & Mô Hình Lọc 3 Tầng (Defense-in-Depth)

Ràng buộc toàn vẹn của PostgreSQL (`EXCLUDE USING gist`) và Advisory Lock chỉ là **"phanh an toàn"** chứ **không phải "bộ giảm xóc"**. Nếu 10.000 requests cùng lúc ập vào thẳng database:
- **Nghẽn Pool & Tràn Bộ Nhớ:** 10.000 requests tranh chấp 25 connections khiến 9.975 requests kẹt trong RAM Node.js, gây timeout 3s (`500/503`) và sụt giảm Event Loop.
- **Nghẽn Khóa Advisory:** Mỗi giao dịch mất 5ms $\to$ 1.000 requests mất 5 giây, dẫn tới hàng ngàn requests bị hủy bởi `lock_timeout = '2s'` (`55P03`).
- **Lãng Phí Tài Nguyên:** Một đại lý 10 khoang chỉ có tối đa ~200 lượt khám/ngày. Bắt DB gánh 10.000 transactions để từ chối 9.800 requests là cực kỳ tốn kém.

**Chiến lược Phân tầng Bảo vệ (Lọc 98% trước khi chạm Database):**
1. **Tầng 1 (Gateway / Edge):** Rate limiting theo IP/User (Token Bucket qua Redis) + kiểm tra `Idempotency-Key` sớm tại Redis (`SET NX EX 60`), trả ngay `409` trong 0.5ms nếu trùng lặp mà không tốn kết nối DB.
2. **Tầng 2 (Application Layer — Fast-Reject hoặc Queue Leveling):**
   - *Hướng A (Fast-Reject qua Redis Atomic Counter):* Giữ số lượng slot trống trong RAM Redis (`remaining_capacity`). Dùng Redis Lua script `DECR` nguyên tử để từ chối ngay 9.800 request hết chỗ trong < 1ms với `409 SLOT_UNAVAILABLE`. Chỉ những request trừ thành công mới được mở transaction xuống PostgreSQL.
   - *Hướng B (Hàng đợi Bất đồng bộ qua RabbitMQ):* Trả ngay `202 Accepted` kèm `job_id`, đẩy message vào hàng đợi. Worker phía sau rút ra xử lý tuần tự (50–100 booking/giây) vào PostgreSQL êm ả, đẩy kết quả về màn hình khách qua luồng SSE (`/v1/appointments/stream`).
3. **Tầng 3 (Tối ưu Database Core):**
   - Băm khóa Advisory theo ngày `hash(dealership_id, date)` thay vì khóa toàn bộ đại lý $\to$ booking khác ngày chạy song song 100%.
   - Đặt **PgBouncer** phía trước PostgreSQL để gom hàng ngàn kết nối ứng dụng thành 30–50 kết nối thực tới database.

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

- **Kiểm thử Concurrency Toàn diện với `Promise.all`:**
  1. 20+ request đặt trùng slot cùng dealership $\to$ số `201` $\le$ capacity, không trùng lặp, còn lại nhận `409`.
  2. Các request đặt khác slot cùng lúc $\to$ đều thành công (không có false `409`).
  3. **Kiểm thử Case 6 (Chống vượt hạn mức active):** 1 khách hàng có sẵn 2 lịch active, bắn đồng thời đặt lịch ở Dealership A và Dealership B $\to$ đúng 1 request thành công, request còn lại nhận `409 ACTIVE_APPOINTMENT_LIMIT_REACHED` nhờ khóa `NS_CUSTOMER`.
- **Kiểm soát kiến trúc tự động:** Dùng `eslint-plugin-boundaries` trong `npm run lint` để chặn mọi import trái phép giữa các thư viện trong `libs/`.
- **Mục 15 (GenAI Collaboration):** Ghi nhận đầy đủ 17 vòng phản biện và hoàn thiện thiết kế (bao gồm đợt rà soát concurrency chuyên sâu 11 điểm kỹ thuật).
