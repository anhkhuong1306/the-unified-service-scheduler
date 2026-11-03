# Story: Triển khai Domain Booking Lõi, Quản lý Tài nguyên Dealership & Concurrency Protection (Day 3)

- **Story Key:** `301026-day-3-core-booking-scheduler`
- **Epic:** Scenario A — Unified Service Scheduler Backend
- **Ngày tạo:** 30/10/2026
- **Trạng thái:** COMPLETED ✅
- **Người thực hiện:** Amelia (Senior Dev) & Winston (Architect) & Quinn (QA)

---

## 1. Bối cảnh & Mục tiêu

Sau khi hoàn tất hạ tầng Docker PostgreSQL 18 và khung NestJS Monorepo ở Ngày 2, Ngày 3 tập trung hiện thực hóa toàn bộ logic nghiệp vụ cốt lõi (**P0 Core Requirements**) theo tài liệu [source/SYSTEM_DESIGN.md](../../source/SYSTEM_DESIGN.md):
1. Cho phép khách hàng hiện hữu tra cứu các khung giờ khả dụng (availability) theo grid chuẩn 30 phút.
2. Cung cấp API tổng hợp (`GET /v1/dealerships/:id/available-slots`) hiển thị toàn bộ slots trong ngày, danh mục dịch vụ bookable, và **danh sách kỹ thuật viên rảnh (`availableTechnicians`) trực tiếp bên cạnh `startAt`** để khách hàng chủ động chọn kỹ thuật viên.
3. Đặt lịch dịch vụ bảo dưỡng (`POST /v1/appointments`) có gán tự động Service Bay và Kỹ thuật viên (Technician) hoặc nhận kỹ thuật viên do khách hàng yêu cầu.
4. Bảo đảm an toàn dữ liệu và loại trừ tuyệt đối hiện tượng double-booking thông qua 2 tầng bảo vệ:
   - **Tầng ứng dụng (Application Level):** Khóa giao dịch phân tuần tự hóa `SELECT pg_advisory_xact_lock(NS_BOOKING, dealership_id)` kết hợp khóa khách hàng `NS_CUSTOMER`.
   - **Tầng lưu trữ (Database Level):** Ba ràng buộc loại trừ `EXCLUDE USING gist` trên dải thời gian `tstzrange(start_at, occupied_until, '[)')`.
5. Cung cấp các API khám phá danh mục: danh sách đại lý (`/v1/dealerships`), danh mục dịch vụ (`/v1/service-types`), phương tiện của khách hàng (`/v1/me/vehicles`), lịch sử hẹn và hủy lịch hẹn an toàn trước cutoff.
6. Áp dụng Clean Architecture: Tách riêng 100% Interface / DTO ra file độc lập; biến Controller thành Pure HTTP Adapter không phụ thuộc trực tiếp vào TypeORM Repository; kích hoạt `AuthGuard` toàn cục qua `APP_GUARD` với decorator `@Public()`.
7. Bộ kiểm thử tự động (Unit & Concurrency Integration Tests) bảo đảm hệ thống xử lý đúng race condition khi nhiều yêu cầu cùng tranh chấp tài nguyên cuối cùng.
8. Bóc tách độc lập Database Schema DDL và Seed Data DML; cung cấp bộ công cụ script runner CLI (`db.sh`, `run-sql.js`, npm scripts), tách rời khỏi `docker-compose.yml`.

---

## 2. Tiêu chí nghiệm thu (Acceptance Criteria)

### AC-1: Data Models & Migrations (`btree_gist` Exclusion Constraints)
- [x] Khởi tạo TypeORM entities trong các libraries:
  - `@app/organization`: `Dealership`, `StaffMember`.
  - `@app/crm`: `Customer`, `Vehicle`.
  - `@app/workshop`: `WorkshopSettings`, `ServiceType`, `Skill`, `Technician`, `TechnicianSkill`, `ServiceBay`, `Appointment`, `AppointmentEvent`, `IdempotencyKey`.
- [x] Migration kích hoạt extension `btree_gist` trên PostgreSQL 18 trong `01-init-db.sql`.
- [x] Cột `period` trên bảng `appointments` được sinh tự động: `tstzrange(start_at, occupied_until, '[)') STORED`.
- [x] Thiết lập 3 ràng buộc `EXCLUDE USING gist`:
  - `no_bay_overlap`: `(service_bay_id WITH =, period WITH &&)` với status hợp lệ (`PENDING`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`).
  - `no_technician_overlap`: `(technician_id WITH =, period WITH &&)` với status hợp lệ.
  - `no_vehicle_overlap`: `(vehicle_id WITH =, period WITH &&)` với status hợp lệ.
- [x] Bổ sung 8 CHECK constraints bảo vệ dữ liệu trong `WorkshopSettings` (`ck_ws_slot`, `ck_ws_buffer`, `ck_ws_grace`, `ck_ws_lead`, `ck_ws_horizon`, `ck_ws_cutoff`, `ck_ws_max`, `ck_ws_hours`).

### AC-2: Seed Data chuẩn theo Assumption
- [x] Tách riêng file `docker/postgres/03-seed.sql` độc lập khỏi Schema DDL (`02-schema.sql`).
- [x] Tạo seed data cho 1 Dealership mẫu (`Central Dealership`) kèm cấu hình:
  - Giờ mở cửa: 08:00 – 18:00, timezone `Asia/Ho_Chi_Minh`.
  - `slot_minutes: 30`, `buffer_minutes: 15`, `requires_approval: false`, `max_active_per_customer: 3`.
- [x] Cố định **10 Service Bays** (`BAY-01` đến `BAY-10`).
- [x] Cố định **10 Technicians** (`Technician 01` đến `Technician 10`) với bảng phân bổ chứng chỉ kỹ năng (`GENERAL_SERVICE`, `BRAKE`, `ENGINE`, `DIAGNOSTICS`).
- [x] Tạo các loại dịch vụ chuẩn hóa bội số lưới 30 phút (`Standard Oil & Filter` 45m+15m, `Full Brake Service` 75m+15m, `Major Inspection` 105m+15m).
- [x] Tạo dữ liệu khách hàng mẫu (`Nguyen Van A`), 2 phương tiện đăng ký sẵn và nhân viên đại lý.

### AC-3: Tra cứu Khung giờ Khả dụng & Kỹ thuật viên (Zero N+1)
- [x] Triển khai `SlotPolicy` với tính toán múi giờ chuẩn IANA qua Luxon, kiểm tra lead time, horizonDays, giờ mở/đóng cửa và chống lặp vô hạn.
- [x] Endpoint `GET /v1/dealerships/:id/available-slots?date=YYYY-MM-DD[&serviceTypeId=...]`:
  - Header: `dealershipId`, `dealershipName`, `date`, `timezone`, `slotMinutes`.
  - Mảng slots: `startAt`, `displayTime` (vd: `08:00`), `meetsLeadTime`.
  - **`availableTechnicians`** xuất hiện trực tiếp bên cạnh `startAt` của từng slot.
  - Mảng `availableServiceTypes` với `durationMinutes`, `endAt`, `occupiedUntil`, `remainingCapacity`, và danh sách kỹ thuật viên có chứng chỉ tương ứng.
- [x] Endpoint `GET /v1/dealerships/:id/technicians?service_type_id=&start_at=`: Tra cứu kỹ thuật viên rảnh theo slot cụ thể.
- [x] Tối ưu hóa truy vấn:
  - Bổ sung `countFreePerSlot` và `findFreeTechniciansPerSlot` trong `AppointmentAvailabilityRepository`.
  - Sử dụng PostgreSQL `unnest` kết hợp `CROSS JOIN technicians` và `NOT EXISTS appointment overlap` trong **duy nhất 1 câu SQL** (Zero N+1 queries).

### AC-4: Serialized Booking UseCase & Idempotency
- [x] Endpoint `POST /v1/appointments` hỗ trợ header `Idempotency-Key`:
  - Atomic idempotency lease và replay response trực tiếp bên trong transaction qua `INSERT ... ON CONFLICT DO UPDATE ... RETURNING 1`.
  - Thứ tự khóa phân tán: `pg_advisory_xact_lock(NS_CUSTOMER, customer_id)` trước, tiếp đến `pg_advisory_xact_lock(NS_BOOKING, dealership_id)`.
  - Kiểm tra điều kiện thời gian qua `SlotPolicy` đồng bộ 100% với availability query.
  - Kiểm tra xe không có lịch trùng lặp ở bất kỳ đâu (`hasVehicleOverlap`).
  - Hỗ trợ gán kỹ thuật viên tự động (best-fit) hoặc theo yêu cầu cụ thể của khách hàng (`requestedTechnicianId`).
  - Tạo mã tham chiếu ngẫu nhiên an toàn qua `ReferenceCodeGenerator` với cơ chế retry khi va chạm mã `23505`.
  - Ghi nhận sự kiện kiểm toán `AppointmentEvent` và phát tín hiệu `pg_notify('appointment_events', ...)`.
- [x] Báo lỗi rõ ràng: `409 SLOT_UNAVAILABLE` (`NO_FREE_BAY` hoặc `NO_QUALIFIED_TECHNICIAN`), `409 VEHICLE_ALREADY_BOOKED`, `409 ACTIVE_APPOINTMENT_LIMIT_REACHED`.

### AC-5: Quản lý Lịch hẹn Khách hàng & Catalog Endpoints
- [x] Endpoint `GET /v1/dealerships`: Danh sách đại lý hoạt động.
- [x] Endpoint `GET /v1/service-types`: Danh mục các gói dịch vụ bảo dưỡng.
- [x] Endpoint `GET /v1/me/vehicles`: Danh sách phương tiện của khách hàng đăng nhập.
- [x] Endpoint `GET /v1/appointments`: Trả về danh sách lịch hẹn của khách hàng qua `appointmentService.listMyAppointments`.
- [x] Endpoint `DELETE /v1/appointments/:id`:
  - Khóa bi quan `pessimistic_write` trên hàng lịch hẹn.
  - Ngăn chặn dò quét IDOR bằng phản hồi đồng nhất `404 Not Found`.
  - Bắt buộc kiểm tra cutoff hủy lịch từ `WorkshopSettings`.
  - Gọi phương thức domain `appointment.cancel()`, chuyển trạng thái `CANCELLED` và giải phóng tài nguyên.

### AC-6: Clean Architecture & Global Auth
- [x] Tách 100% Interface / DTO ra file riêng trong thư mục `dto/` và `types/`:
  - `libs/workshop/src/resource/dto/slot-availability.dto.ts`
  - `libs/workshop/src/appointment/domain/slot-policy.types.ts`
  - `libs/workshop/src/appointment/services/resource-allocator.types.ts`
- [x] Controller đóng vai trò Pure HTTP Adapter:
  - Tuyệt đối không inject TypeORM Repository vào Controller.
  - Tạo `ServiceCatalogService` quản lý dịch vụ bảo dưỡng.
  - Tạo `DealershipService` quản lý đại lý.
  - `CustomerVehiclesController` và `AppointmentsController` chỉ gọi ủy nhiệm sang Service layer.
- [x] `AuthGuard` chạy Global thông qua provider `{ provide: APP_GUARD, useClass: AuthGuard }`.
- [x] Tạo decorator `@Public()` cho phép bypass xác thực trên các endpoint hạ tầng `/health/live` và `/health/ready`.
- [x] Toàn bộ code comments, JSDoc và thông báo lỗi bằng 100% tiếng Anh kèm ví dụ định dạng thời gian ISO 8601 UTC.

### AC-7: Database Tooling & Container Stability
- [x] Bóc tách độc lập `docker/postgres/01-init.sql` (Extensions & Test DB), `docker/postgres/02-schema.sql` (DDL) và `docker/postgres/03-seed.sql` (DML).
- [x] Gỡ bỏ hoàn toàn `docker-entrypoint-initdb.d` khỏi `docker-compose.yml`, mount duy nhất persistent volume `postgres-data`. Toàn bộ database scripts được chạy on-demand bằng công cụ quản lý.
- [x] Xây dựng script Bash `scripts/db.sh` hỗ trợ các lệnh: `init`, `schema`, `seed`, `reset`, `test-schema`, `psql`.
- [x] Xây dựng script Node.js `scripts/run-sql.js` dùng thư viện `pg` chạy độc lập cross-platform, tự động nhận diện và xử lý an toàn `01-init.sql`.
- [x] Thêm các npm scripts vào `package.json`: `db:init`, `db:schema`, `db:seed`, `db:reset`, `db:test-schema`.
- [x] Khắc phục toàn bộ lỗi build và NestJS DI runtime trong container `scheduler-api`:
  - Chuẩn hóa kiểu dữ liệu `ActorContext` và `AppointmentEvent` chấp nhận `'anonymous'`.
  - Khắc phục thuộc tính audit `this.updated_by`.
  - Quá tải hàm `resolve(actorOrSub, tenantId?)` trong `CustomerResolverService`.
  - Bổ sung `@Global()` decorator cho `CrmModule` và `OrganizationModule` để export hợp lệ `CRM_DIRECTORY_CONTRACT` và `ORGANIZATION_DIRECTORY_CONTRACT` mà không vi phạm quy tắc `eslint-plugin-boundaries`.
  - Kiểm tra probe `/health/live` và `/health/ready` đạt 200 OK.
- [x] Cập nhật tài liệu hướng dẫn đầy đủ trong `README.md`.

### AC-8: Custom Terminal Log Formatting
- [x] Tạo `AppLogger` kế thừa `ConsoleLogger`, tự động inject `[<correlation_id>]` ngay sau timestamp trong mọi request context.
- [x] Tùy biến `LoggingInterceptor` hiển thị log trực quan:
  - `REQUEST_START`: `Object: >>>>>> method: {method} - endpoint: {route} >>>>>> REQUEST_START >>>>>>`, `======> user_id: {user_id} - action_type: {action_type} -- platform: {platform}`, `======> request: JSON.stringify(payload)`.
  - `REQUEST_END`: `Object: >>>>>> method: {method} - endpoint: {route} >>>>>> REQUEST_END >>>>>>`, `======> duration_ms: {duration_ms} - memory_usage: {heap_used_bytes} (MB)`, `======> response: JSON.stringify(response)`, `======> exception: {exception}` (chỉ hiện khi có lỗi).
- [x] 100% test suites (12/12) bao gồm unit tests và concurrency tests pass.

---

## 3. Kết quả Kiểm thử Tự động (Verification)

1. **Unit Tests:**
   - `libs/workshop/src/appointment/domain/__tests__/slot-policy.spec.ts`: Đạt 100% pass kiểm thử timezone Luxon, lead time, horizon, và validate settings.
   - `libs/workshop/src/resource/__tests__/availability.spec.ts`: Đạt 100% pass kiểm thử batch query đếm slot, available technicians bên cạnh startAt, và query technicians theo slot.
   - `libs/workshop/src/appointment/__tests__/create-appointment.usecase.spec.ts`: Đạt 100% pass kiểm thử booking flow, advisory locks, idempotency atomic replay, và conflict handling.
   - `libs/workshop/src/appointment/__tests__/cancel-appointment.usecase.spec.ts`: Đạt 100% pass kiểm thử hủy lịch, cutoff check, và pessimistic write lock.
   - `libs/common/src/__tests__/auth.guard.spec.ts`: Đạt 100% pass kiểm thử Global AuthGuard, `@Public()` bypass, mock headers, và Bearer JWT decoding.

2. **Concurrency Integration Spec:**
   - `apps/scheduler-api/test/booking-concurrency.concurrency-spec.ts`: Mô phỏng 10 concurrent requests tranh chấp tài nguyên cuối cùng, đảm bảo chỉ 1 request thành công `201 Created` và 9 requests nhận `409 Conflict`, không xảy ra hiện tượng double-booking.
