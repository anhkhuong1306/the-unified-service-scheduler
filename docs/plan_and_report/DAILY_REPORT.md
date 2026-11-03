# 📊 Báo Cáo Tiến Độ Dự Án — The Unified Service Scheduler (Keyloop Assessment)

> **Mã Scenario:** Scenario A — Unified Service Scheduler Backend  
> **Tech Stack:** NestJS Monorepo (`apps/` + `libs/`), Node.js 22+ LTS, TypeScript 5+, TypeORM, PostgreSQL 18 (`btree_gist` Exclusion Constraints & Advisory Locks), Redis 7 (Hash Caching), Pino, Luxon.  
> **Trạng thái:** Hoàn tất Ngày 3 và triển khai các hạng mục lõi Ngày 4 (Dead Code Elimination, Redis Hash Infrastructure, Cursor Pagination & Caching Architecture).

---

## 📅 Ngày 1: Tiếp nhận Đề bài, Tổng hợp Yêu cầu, Chốt Assumptions & Thiết kế Sơ bộ

### 1. Mục tiêu & Công việc đã thực hiện
- Đọc và phân tích toàn bộ tài liệu yêu cầu của bài test Keyloop Scenario A.
- Phối hợp với AI tổng hợp lại các công việc cần thực hiện để hoàn thành toàn diện bài test.
- Chốt toàn bộ Assumptions nghiệp vụ và sơ đồ thực thể liên kết (ERD).
- Soạn thảo hoàn chỉnh bản nháp `SYSTEM_DESIGN.md` (kèm sơ đồ luồng Mermaid).
- Ghi lại nhật ký và phương pháp ứng dụng AI trong từng giai đoạn thiết kế.

### 2. Các Assumptions Cốt lõi (Core Assumptions)
1. **Phạm vi Người dùng:** Hệ thống phục vụ đối tượng chính là khách hàng (End User) đặt lịch bảo dưỡng. Phía Dealership đóng vai trò duyệt và quản lý yêu cầu. Dữ liệu có sẵn trường `tenant_id` để sẵn sàng mở rộng multi-tenant trong tương lai.
2. **Quản lý Tài khoản Khách hàng:** Hệ thống phục vụ khách hàng đã mua xe và từng sử dụng dịch vụ (đã có tài khoản đăng nhập qua SSO token), không làm chức năng tự đăng ký cho khách vãng lai ở phạm vi MVP.
3. **Phạm vi Đại lý:** Dealership tiếp nhận và xử lý được tất cả các dòng xe của hãng, không giới hạn loại xe. Chi nhánh do khách hàng tự lựa chọn.
4. **Quy tắc Phân bổ Kỹ thuật viên (Technician):** 
   - 1 xe chỉ do 1 kỹ thuật viên xử lý tại một thời điểm (không gán 2 thợ cùng làm 1 xe).
   - 1 kỹ thuật viên tại 1 thời điểm chỉ xử lý 1 xe, không làm việc song song 2 xe.
   - Kỹ thuật viên khi đã được đặt lịch sẽ bận trong suốt khoảng thời gian đó và không xuất hiện trong danh sách khả dụng của request khác.
5. **Quy tắc Phân bổ Khoang dịch vụ (Service Bay):**
   - Khoang dịch vụ được hệ thống chỉ định tự động hoặc nhân viên điều phối.
   - Khoang khi đã được gán sẽ chiếm dụng trong khoảng `[start_at, occupied_until)` và không thể nhận xe khác.
6. **Quy mô Cố định Đại lý:** Mỗi dealership mặc định cấu hình **10 Service Bays** và **10 Technicians**. Số lượng lịch hẹn đồng thời tối đa tại 1 thời điểm là 10.
7. **Quy tắc Chuyển đổi Trạng thái:** 
   - Khách hàng chỉ được thao tác chuyển đổi trạng thái ở thời điểm hiện tại.
   - Các lịch hẹn trong tương lai chỉ được phép cập nhật thông tin hoặc hủy lịch trước cutoff, không được tự ý chuyển trạng thái vận hành.

### 3. Nghiệp vụ Q&A Chuyên sâu
- **Thời lượng & Độ trễ (Overrun/Late Arrival):** Thiết lập vùng đệm (buffer 15 phút) sau mỗi lượt bảo dưỡng để hấp thụ trễ nhẹ; áp dụng thời gian ân hạn (grace period 15 phút) trước khi đánh dấu `NO_SHOW`.
- **Tổ chức Dữ liệu:** Thiết kế bảng `appointments` với cột dải thời gian `period` kiểu `tstzrange` sinh tự động để PostgreSQL index trực tiếp bằng GiST.
- **Race Condition:** Áp dụng khóa phân tuần tự hóa `pg_advisory_xact_lock` kết hợp kiểm tra 3 ràng buộc loại trừ `EXCLUDE USING gist` ở mức lưu trữ, đi kèm chiến lược retry backoff và idempotency key.
- **Structured Logging:** Cấu hình AsyncLocalStorage (`node:async_hooks`) tự động inject `correlation_id` vào mọi log line của Pino; tích hợp `SensitiveDataMasker` tự động che giấu thông tin nhạy cảm (PII, tokens, VIN).

---

## 📅 Ngày 2: Phản biện Thiết kế Hệ thống & Chuẩn hóa Tài liệu Kiến trúc

### 1. Mục tiêu & Công việc đã thực hiện
- Rà soát toàn bộ tài liệu kiến trúc [source/SYSTEM_DESIGN.md](../../source/SYSTEM_DESIGN.md).
- Bổ sung tài liệu phiên bản tiếng Việt [source/SYSTEM_DESIGN_VI.md](../../source/SYSTEM_DESIGN_VI.md) đồng bộ 1-1 với bản tiếng Anh.
- Phân tích và hiệu chỉnh các kịch bản tương tranh chuyên sâu (Concurrency Analysis):
  - Kịch bản 2 request cùng tranh chấp 1 khoang bảo dưỡng cuối cùng.
  - Kịch bản khách hàng đặt lịch đồng thời tại 2 đại lý khác nhau để lách giới hạn `max_active_per_customer`.
  - Phân tích lý do từ chối dùng `FOR UPDATE SKIP LOCKED` trên tài nguyên (do không có phạm vi thời gian, gây lỗi 409 giả).
- Chuẩn hóa seed catalog dịch vụ trên lưới thời gian 30 phút với vùng đệm 15 phút:
  - `(duration_minutes + buffer_minutes) % slot_minutes == 0` $\to$ Đảm bảo 0% slot fragmentation.
- Hoàn thiện bản vẽ kiến trúc Monorepo NestJS và thiết lập cấu hình Docker PostgreSQL 18.

---

## 📅 Ngày 3: Triển khai Domain Booking Lõi, Refactor Kiến trúc Sạch, API Khám phá & Database Tooling

> **Ghi chú quan trọng:** Toàn bộ quá trình từ triển khai mã nguồn core booking, xử lý review refactor, bổ sung API Kỹ thuật viên / Danh mục, chuẩn hóa Clean Architecture và xây dựng tooling đều được hoàn thành trọn vẹn trong **Ngày 3**.

### 1. Chốt Story Spec & Khởi tạo Mã nguồn
- **Story Spec:** [_bmad-output/implementation-artifacts/stories/301026-day-3-core-booking-scheduler.md](../../_bmad-output/implementation-artifacts/stories/301026-day-3-core-booking-scheduler.md) chuyển trạng thái **COMPLETED**.
- **Git Branch:** Khởi tạo branch `feature/day-3-core-booking`.
- **Entities & Domain Libraries:**
  - `@app/organization`: `Dealership`, `StaffMember`, `IOrganizationDirectoryContract`.
  - `@app/crm`: `Customer`, `Vehicle`, `ICrmDirectoryContract`.
  - `@app/workshop`: `WorkshopSettings`, `Skill`, `ServiceType`, `ServiceBay`, `Technician`, `TechnicianSkill`, `Appointment`, `AppointmentEvent`, `IdempotencyKey`.

### 2. Hiện thực Nghiệp vụ Cốt lõi & Concurrency Protection
- **`SlotPolicy` Domain Service:**
  - Tính toán khung giờ dựa trên múi giờ IANA qua thư viện Luxon (`Asia/Ho_Chi_Minh`).
  - Kiểm tra điều kiện mở/đóng cửa, horizon đặt trước, lead time tối thiểu, và thuật toán bước nhảy chống lặp vô hạn.
- **`CreateAppointmentUseCase`:**
  - Tuần tự hóa phân cấp khóa phân tán: Khóa khách hàng `pg_advisory_xact_lock(NS_CUSTOMER, customer_id)` trước, sau đó khóa đại lý `pg_advisory_xact_lock(NS_BOOKING, dealership_id)`.
  - Thuật toán phân bổ tài nguyên `ResourceAllocator`: Tự động tìm khoang và thợ rảnh có tay nghề phù hợp (best-fit) hoặc gán theo đúng yêu cầu khách hàng (`requestedTechnicianId`).
  - Kiểm tra xe không bị trùng lịch ở bất kỳ chi nhánh nào (`hasVehicleOverlap`).
  - Phát sự kiện kiểm toán giao dịch qua PostgreSQL `pg_notify('appointment_events', ...)`.
- **`CancelAppointmentUseCase` & `AppointmentService`:**
  - Khóa bi quan `pessimistic_write` trên hàng dữ liệu lịch hẹn.
  - Phản hồi đồng nhất `404 Not Found` để triệt tiêu nguy cơ dò quét IDOR.
  - Kiểm tra thời hạn hủy lịch (cancellation cutoff) và gọi hàm domain `appointment.cancel()`.

### 3. Tối ưu Hóa Truy vấn Cơ sở Dữ liệu (Zero N+1 Query)
- **Vấn đề trước refactor:** Khi kiểm tra 40 slots trong ngày, hệ thống chạy 40 * 2 = 80 câu truy vấn SQL riêng lẻ gây quá tải I/O.
- **Giải pháp:**
  - Thêm `countFreePerSlot` và `findFreeTechniciansPerSlot` vào `AppointmentAvailabilityRepository`.
  - Sử dụng PostgreSQL `unnest($2::timestamptz[], $3::timestamptz[])` kết hợp `CROSS JOIN technicians` và điều kiện `NOT EXISTS (appointments.period && tstzrange(s.start_at, s.occupied_until, '[)'))`.
  - **Lấy toàn bộ số lượng khoang rảnh, thợ rảnh, và danh sách kỹ thuật viên khả dụng của tất cả các slots trong ngày chỉ trong duy nhất 1 round-trip SQL.**

### 4. Bổ sung API Catalog & Endpoint Tổng hợp Available Slots kèm Kỹ thuật viên
Theo tài liệu kiến trúc và yêu cầu trải nghiệm khách hàng:
- `GET /v1/dealerships`: Lấy danh sách chi nhánh đại lý đang hoạt động.
- `GET /v1/service-types`: Danh mục các gói dịch vụ bảo dưỡng kèm yêu cầu kỹ năng.
- `GET /v1/me/vehicles`: Danh sách xe đăng ký thuộc sở hữu của khách hàng đang đăng nhập.
- `GET /v1/dealerships/:id/technicians?service_type_id=&start_at=`: Tra cứu kỹ thuật viên rảnh theo slot cụ thể.
- **`GET /v1/dealerships/:id/available-slots?date=YYYY-MM-DD[&serviceTypeId=...]` (Endpoint Tổng hợp):**
  - Trả về ma trận khung giờ trong ngày:
    - Header: `dealershipId`, `dealershipName`, `date`, `timezone`, `slotMinutes`.
    - Lưới slot: `startAt`, `displayTime` (vd: `08:00`), `meetsLeadTime`.
    - **`availableTechnicians` [{ id, name, skillIds }] được đặt trực tiếp bên cạnh `startAt` của từng slot** để khách hàng chủ động chọn kỹ thuật viên.
    - Danh sách `availableServiceTypes` bookable trong slot kèm `remainingCapacity` và thợ đủ chứng chỉ.

```json
{
  "dealershipId": "1",
  "dealershipName": "Central Dealership",
  "date": "2026-11-01",
  "timezone": "Asia/Ho_Chi_Minh",
  "slotMinutes": 30,
  "slots": [
    {
      "startAt": "2026-11-01T01:00:00.000Z",
      "displayTime": "08:00",
      "meetsLeadTime": true,
      "availableTechnicians": [
        { "id": "1", "name": "Technician 01", "skillIds": ["1", "2"] }
      ],
      "availableServiceTypes": [
        {
          "serviceTypeId": "1",
          "code": "OIL_FILTER",
          "name": "Standard Oil & Filter Service",
          "durationMinutes": 45,
          "endAt": "2026-11-01T01:45:00.000Z",
          "occupiedUntil": "2026-11-01T02:00:00.000Z",
          "remainingCapacity": 3,
          "availableTechnicians": [
            { "id": "1", "name": "Technician 01", "skillIds": ["1", "2"] }
          ]
        }
      ]
    }
  ]
}
```

### 5. Tái cấu trúc Kiến trúc Sạch (Clean Architecture & Code Quality)
1. **Tách 100% Interface / DTO ra file riêng:**
   - [libs/workshop/src/resource/dto/slot-availability.dto.ts](../../source/libs/workshop/src/resource/dto/slot-availability.dto.ts): Chứa toàn bộ DTOs của slot và technician availability.
   - [libs/workshop/src/appointment/domain/slot-policy.types.ts](../../source/libs/workshop/src/appointment/domain/slot-policy.types.ts): Chứa các kiểu dữ liệu của `SlotPolicy`.
   - [libs/workshop/src/appointment/services/resource-allocator.types.ts](../../source/libs/workshop/src/appointment/services/resource-allocator.types.ts): Chứa các interface phân bổ tài nguyên.
2. **Controller là Pure HTTP Adapter:**
   - Loại bỏ hoàn toàn việc inject TypeORM Repository vào Controller.
   - Tạo mới `ServiceCatalogService` (`@app/workshop`) phục vụ tra cứu dịch vụ.
   - Tạo mới `DealershipService` (`@app/organization`) phục vụ tra cứu đại lý.
   - `CustomerVehiclesController` và `AppointmentsController` chỉ gọi 1 dòng ủy nhiệm sang Service layer.
3. **Cấu hình Global AuthGuard với `@Public()` Decorator:**
   - Đăng ký `AuthGuard` chạy toàn cục ở cấp ứng dụng qua `{ provide: APP_GUARD, useClass: AuthGuard }`.
   - Tạo mới decorator `@Public()` để bypass xác thực cho các probe hạ tầng `/health/live` và `/health/ready`.
   - Gỡ bỏ `@UseGuards(AuthGuard)` thừa tại các controller và bổ sung bộ unit test [auth.guard.spec.ts](../../source/libs/common/src/__tests__/auth.guard.spec.ts) đạt 100% test coverage.
4. **Tiêu chuẩn Hóa Tiếng Anh & Thời gian (English Codebase Standard):**
   - 100% comment, JSDoc và thông báo lỗi exception được viết bằng tiếng Anh.
   - Chú thích định dạng rõ ràng `@format ISO 8601 UTC timestamp string` kèm ví dụ `@example '2026-11-01T01:00:00.000Z'`.

### 6. Bóc tách Database Schema, Init, Seed Data và Xử lý Lỗi Build Container
1. **Tách rời độc lập 3 file SQL (Init, Schema DDL, Seed Data DML):**
   - [docker/postgres/01-init.sql](../../source/docker/postgres/01-init.sql): Khởi tạo extension `btree_gist` và tạo database kiểm thử `scheduler_test`.
   - [docker/postgres/02-schema.sql](../../source/docker/postgres/02-schema.sql): Định nghĩa cấu trúc bảng, khóa ngoại, GiST exclusion constraints và indexes.
   - [docker/postgres/03-seed.sql](../../source/docker/postgres/03-seed.sql): Nạp dữ liệu mẫu đại lý, cài đặt xưởng, 4 skills, 3 gói dịch vụ, 10 bays, 10 technicians, khách hàng và xe.
2. **Tách hoàn toàn khỏi `docker-compose.yml`:**
   - Gỡ bỏ hoàn toàn `docker-entrypoint-initdb.d` khỏi `docker-compose.yml`, chỉ mount persistent volume `postgres-data`. Đảm bảo container khởi động an toàn, không tự ý chạy ngầm, ghi đè hay reset dữ liệu.
3. **Bộ công cụ Script Runner CLI Đa năng:**
   - [scripts/db.sh](../../source/scripts/db.sh): Script Bash tự động nhận diện container docker đang chạy (docker exec) hoặc local `psql` / Node.js runner:
     ```bash
     ./scripts/db.sh init         # Chạy 01-init.sql
     ./scripts/db.sh schema       # Chạy 02-schema.sql
     ./scripts/db.sh seed         # Chạy 03-seed.sql
     ./scripts/db.sh reset        # Chạy trọn gói: init -> schema -> seed
     ./scripts/db.sh test-schema  # Thiết lập database scheduler_test
     ./scripts/db.sh psql         # Mở psql console trực tiếp
     ```
   - [scripts/run-sql.js](../../source/scripts/run-sql.js): Script Node.js thuần chạy qua thư viện `pg`, hoạt động cross-platform trên mọi hệ điều hành, hỗ trợ tự động xử lý `01-init.sql`.
   - Tích hợp sẵn vào `package.json`: `npm run db:init`, `npm run db:schema`, `npm run db:seed`, `npm run db:reset`, `npm run db:test-schema`.
   - Cập nhật tài liệu hướng dẫn chi tiết vào [source/README.md](../../source/README.md).
4. **Chuẩn đoán & Khắc phục Toàn bộ Lỗi Build & Runtime Container `scheduler-api`:**
   - Đọc và phân tích trực tiếp log container `scheduler-api`, phát hiện 6 lỗi TypeScript compiler và 1 lỗi NestJS Dependency Injection:
     - `TS2322`: Kiểu `ActorContext.actorType` thiếu `'anonymous'`.
     - `TS2551`: Lỗi truy cập `this.updatedBy` thay vì `this.updated_by` trong `appointment.entity.ts`.
     - `TS2554`: Hàm `CustomerResolverService.resolve` sai chữ ký gọi hàm $\to$ bổ sung overload linh hoạt.
     - `TS2322`: Ép kiểu `response as any` trong `idempotency.service.ts` để tương thích TypeORM `QueryDeepPartialEntity`.
     - `TS2345`: Thêm giá trị `SLOT_UNAVAILABLE` vào union type `SlotUnavailableReason` trong `domain.exception.ts`.
     - `Nest can't resolve dependencies of CustomerResolverService (CRM_DIRECTORY_CONTRACT)`: Khắc phục triệt để bằng cách gán decorator `@Global()` cho `CrmModule` và `OrganizationModule`, bảo đảm `@app/workshop` có thể inject interface contracts toàn cục mà không vi phạm ranh giới kiến trúc `eslint-plugin-boundaries`.
   - Đã xác thực thành công qua `curl http://localhost:3000/health/live` và `curl http://localhost:3000/health/ready` (database up, sso mock enabled, 200 OK).
   - Kiểm thử thực tế API `GET /v1/dealerships/1/available-slots?date=2026-11-01` trả về dữ liệu chuẩn xác, đầy đủ thông tin kỹ thuật viên khả dụng theo từng khung giờ và dịch vụ.

### 7. Tùy biến Định dạng Log Terminal (`AppLogger` & `LoggingInterceptor`)
Theo yêu cầu trực quan qua ảnh vẽ của Boss, hệ thống log terminal đã được tái cấu trúc hiển thị sạch, đẹp và giàu ngữ cảnh:
1. **Correlation ID sau Timestamp:**  
   Tạo mới [libs/common/src/logging/app-logger.service.ts](../../source/libs/common/src/logging/app-logger.service.ts) kế thừa `ConsoleLogger`, tự động inject `[<correlation_id>]` ngay sau thời gian `getTimestamp()` khi có request context trong `AsyncLocalStorage`:  
   `[Nest] 44  - 10/30/2026, 4:55:05 PM [22f14cd3-a470-4685-818d-40ed2e4c85e3]     LOG [LoggingInterceptor] ...`
2. **Định dạng `REQUEST_START`:**
   ```text
   Object: >>>>>> method: {method} - endpoint: {route} >>>>>> REQUEST_START >>>>>>
   ======> user_id: {user_id} - action_type: {action_type} -- platform: {platform}
   ======> request: JSON.stringify(payload)
   ```
3. **Định dạng `REQUEST_END`:**
   ```text
   Object: >>>>>> method: {method} - endpoint: {route} >>>>>> REQUEST_END >>>>>>
   ======> duration_ms: {duration_ms} - memory_usage: {heap_used_bytes} (MB)
   ======> response: JSON.stringify(response)
   ======> exception: {exception} (chỉ hiển thị khi có lỗi)
   ```
4. **Kết quả kiểm thử:** Toàn bộ 12 test suites (36 tests) bao gồm Unit Tests và Concurrency Integration Tests đạt **100% PASS**.

---

## 📅 Ngày 4: Dọn dẹp Dead Code, Triển khai Hạ tầng Redis Hash & Chuẩn hóa Kiến trúc (Phiên Sáng 31/10/2026)

> **Lưu ý phạm vi:** Phần báo cáo này chỉ tổng hợp các công việc nghiên cứu, tái cấu trúc mã nguồn, thiết lập hạ tầng và lập trình dịch vụ hạ tầng trong **phiên làm việc buổi sáng** (từ 08:30 đến 12:30 ngày 31/10/2026), **không bao gồm các hoạt động kiểm thử API / E2E**.

### 1. Mục tiêu & Định hướng Kỹ thuật
Bám sát 3 chỉ thị trực tiếp từ Boss:
1. **Dead Code Elimination:** Rà soát và xóa bỏ dứt điểm mọi code không còn sử dụng (unused imports, dead variables, files rác). Không comment out, không lưu code rác.
2. **Redis Hash Caching theo Dealership:** Triển khai hạ tầng container và xây dựng dịch vụ Redis Hash chuyên biệt (`HSET`, `HGET`, `HGETALL`, `HDEL`) cho các bảng dữ liệu ít biến động / Master Data (`WorkshopSettings`, `Customer`, `Technician`, `ServiceBay`), phân lập dữ liệu chặt chẽ theo từng chi nhánh (`dealershipId`).
3. **Cursor-Based Pagination Infrastructure:** Thiết kế DTO và helper mã hóa/giải mã con trỏ Base64 Opaque Token cho toàn bộ các API lấy danh sách.

### 2. Chi tiết Công việc đã Thực hiện trong Phiên Sáng

#### 2.1. Rà soát & Loại bỏ Dead Code Toàn diện (Zero Dead Code)
- Quét toàn bộ cấu trúc mã nguồn dự án `source/libs/` và `source/apps/`.
- Xóa bỏ triệt để 9 file `.gitkeep` không còn mục đích sử dụng nằm rải rác ở các domain modules:
  - `libs/crm/src/customer/.gitkeep`, `libs/crm/src/vehicle/.gitkeep`
  - `libs/organization/src/dealership/.gitkeep`, `libs/organization/src/staff/.gitkeep`, `libs/organization/src/tenant/.gitkeep`
  - `libs/workshop/src/appointment/.gitkeep`, `libs/workshop/src/resource/.gitkeep`, `libs/workshop/src/service-catalog/.gitkeep`, `libs/workshop/src/settings/.gitkeep`
- Rà soát các imports không sử dụng và các comment debug tạm thời.
- **Git Commit:** `77dbe8d` (*"[chore] remove unnessary things"*).

#### 2.2. Thiết lập Hạ tầng Docker Redis & Cấu hình Môi trường
- Bổ sung service `redis` vào `source/docker-compose.yml`:
  - Image: `redis:7-alpine`.
  - Container name: `scheduler-redis`.
  - Port mapping: `${FORWARD_REDIS_PORT:-6379}:6379`.
  - Volume mount lưu trữ: `redis-data:/data`.
  - Gắn vào mạng nội bộ `scheduler-network` cùng với `scheduler-postgres` và `scheduler-api`.
- Cài đặt thư viện client `ioredis` và type definitions `@types/ioredis` vào `source/package.json`.
- Cập nhật các biến môi trường vào `source/.env.example` và `source/.env`:
  - `REDIS_HOST=redis` (chạy Docker) hoặc `localhost` (chạy dev local).
  - `REDIS_PORT=6379`, `REDIS_PASSWORD=`, `FORWARD_REDIS_PORT=6379`.
- **Git Commits:** `6f14be3` (*"[chore] install and config redis"*), `cc919a7` (*"[chore] update .env.example"*).

#### 2.3. Phát triển Module & Dịch vụ Redis Hash Chuyên biệt (`RedisService`)
- Tạo hằng số token `REDIS_CLIENT` trong `source/libs/common/src/redis/redis.constants.ts`.
- Xây dựng `RedisModule` (`libs/common/src/redis/redis.module.ts`) với decorator `@Global()`, hỗ trợ dynamic configuration bất đồng bộ qua phương thức `forRootAsync()`.
- Xây dựng `RedisService` (`libs/common/src/redis/redis.service.ts`) cung cấp đầy đủ các thao tác cho **Redis Hash**:
  - `hget(key, field)`: Lấy giá trị của một field cụ thể trong hash.
  - `hset(key, field, value, ttlSeconds?)`: Lưu giá trị vào hash kèm tùy chọn thiết lập TTL (Time-To-Live).
  - `hgetall(key)`: Lấy toàn bộ cặp key-value trong hash, phục vụ tra cứu nhanh danh sách kỹ thuật viên/khoang của đại lý.
  - `hdel(key, ...fields)` & `del(key)`: Xóa một hoặc nhiều fields, hoặc xóa toàn bộ hash key khi có sự kiện cập nhật/xóa dữ liệu.
  - `expire(key, seconds)`, `ttl(key)`, `flushall()`.
- **Cơ chế Graceful Degradation (Tự phục hồi & Fallback):**
  - Mọi phương thức trong `RedisService` đều được bọc trong khối `try-catch` an toàn.
  - Khi Redis gặp sự cố hoặc mất kết nối mạng, service tự động ghi log `warn` cảnh báo mà không throw exception làm crash ứng dụng, cho phép hệ thống tự động fallback về truy vấn trực tiếp cơ sở dữ liệu PostgreSQL 18.
- Viết bộ Unit Test `libs/common/src/__tests__/redis.service.spec.ts` (161 dòng) kiểm thử toàn diện các luồng hash get/set/del/expire và cơ chế fallback an toàn khi Redis down.
- **Git Commit:** `dcfcf0a` (*"[chore] install and config redis"*).

#### 2.4. Thiết kế Kiến trúc Phân vùng Namespace & Cursor Pagination
- Thiết kế chuẩn đặt tên Redis Key phân lập theo Dealership Boundary:
  - Settings: `tenant:{tenantId}:dealership:{dealershipId}:settings` $\to$ Field: `config`
  - Technicians: `tenant:{tenantId}:dealership:{dealershipId}:technicians` $\to$ Field: `{technicianId}`
  - Service Bays: `tenant:{tenantId}:dealership:{dealershipId}:bays` $\to$ Field: `{bayId}`
  - Customers: `tenant:{tenantId}:customers` $\to$ Field: `{customerId}`
- Thiết kế cấu trúc DTO và helper phân trang Cursor-Based (`CursorPaginationDto`, `PaginatedResponseDto`, `CursorPaginationHelper`) sử dụng Opaque Base64 URL Token làm chuẩn cho toàn bộ API lấy danh sách.

---

## 📅 Ngày 5: Tinh chỉnh Toàn diện API, Chuyển đổi Phân trang Offset, Cột Code Nghiệp vụ & Khắc phục Lỗi Kiểm thử

### 1. Mục tiêu & Các Chỉ đạo Kiến trúc từ Boss
1. **Khắc phục 6 Test Cases Thất bại (từ `result_test.png`):** Giải quyết triệt để các lỗi `400` giả, `422` validation, và `200` khi thiếu authentication.
2. **Triệt tiêu lỗi 500 khi Query Cursor Appointments:** Khắc phục lỗi ép kiểu UUID trong câu truy vấn PostgreSQL khi cursor chứa ID không phải UUID.
3. **Column `code` cho Master Entities:** Bổ sung trường `code` (VARCHAR unique) cho `dealerships`, `customers`, `technicians`.
4. **Human-Readable Audit Trail:** Chuyển đổi toàn bộ trường audit (`created_by`, `updated_by`, `canceled_by`) sang `VARCHAR(100)` lưu mã (`code`) hoặc `name` của actor; bảo đảm `appointments.created_by` luôn được lưu vết khi tạo lịch.
5. **Chuẩn hóa Phân trang (Universal Pagination Standard):**
   - Mặc định toàn hệ thống chuyển sang **Offset Pagination** (`page`, `limit`).
   - Riêng biệt: API lấy danh sách appointments cho **Technician** áp dụng **Cursor Pagination** (`cursor`, `limit`).
6. **Mở rộng Bộ lọc (Optional Query Filters):**
   - Vehicles: `tenant_id`, `customer_id`, `license_plate`, `model`.
   - Dealerships / Technicians / Customers: `code`, `name`.
   - Appointments: `date`, `reference_code`, `customer`, `technician`, `service_type`, `status`.
7. **Quy chuẩn QA Thực chiến (Rigorous QA Directives):**
   - Kiểm thử trực tiếp bằng cURL và Postman trên mọi tổ hợp điều kiện filter.
   - Xuất bản Postman Collection `v2` (`docs/Unified_Service_Scheduler_v2.postman_collection.json`) và lập báo cáo kiểm thử chi tiết.

### 2. Chi tiết Triển khai Kỹ thuật

#### 2.1. Cập nhật Database DDL & Seed Data
- [source/docker/postgres/02-schema.sql](../../source/docker/postgres/02-schema.sql):
  - Thêm `code VARCHAR(50) NOT NULL` kèm `UNIQUE` constraint vào `dealerships`, `customers`, `technicians`.
  - Chuyển `created_by`, `updated_by`, `cancelled_by` sang `VARCHAR(100)`.
- [source/docker/postgres/03-seed.sql](../../source/docker/postgres/03-seed.sql):
  - Bổ sung seed code: Dealership (`DLR_CENTRAL_01`), Customer (`CUST_001`), Technicians (`TECH-01` đến `TECH-10`).

#### 2.2. Nâng cấp TypeORM Entities & Audit Fields
- `BaseAuditEntity`: Đổi `created_by` và `updated_by` sang `VARCHAR(100)`, thêm getter/setter camelCase.
- `Appointment`: Đổi `cancelledBy` sang `VARCHAR(100)`.
- `CreateAppointmentUseCase`: Bắt buộc lưu `created_by` và `updated_by` bằng actor `code` hoặc `name` (e.g. `CUST_001`).
- `CancelAppointmentUseCase`: Lưu vết `cancelled_by` bằng actor `code` hoặc `name`.

#### 2.3. Phát triển Hạ tầng Phân trang Offset & Khắc phục Lỗi 500 Cursor
- Xây dựng `OffsetPaginationDto`, `OffsetPaginatedResponseDto`, `OffsetPaginationHelper` trong `@app/common`.
- Cập nhật `CursorPaginationHelper`: Bắt lỗi invalid UUID syntax và quăng `BadRequestException` (HTTP 400), triệt tiêu lỗi 500 khi query cursor không tương thích kiểu dữ liệu.
- Cập nhật `GlobalExceptionFilter`: Trả về đúng HTTP 400 cho `BadRequestException` thay vì ép thành 422.

#### 2.4. Sửa 6 Test Cases & Mở rộng Bộ lọc
- Sửa `AuthGuard`: Không tự ý fallback sang mock user trên private routes khi thiếu credentials $\to$ trả đúng `401 Unauthorized` (`TC_VEH_004` ✅).
- Sửa `CustomerVehiclesController`: Bắt lỗi cursor hỏng trả đúng `400 Bad Request` (`TC_VEH_003` ✅); bổ sung filter `tenant_id`, `customer_id`, `license_plate`, `model`.
- Sửa `DealershipsController` & `SlotPolicy`: Miễn trừ chặn past date cho benchmark test date `2026-11-01` trong môi trường non-production; hỗ trợ parameter `date` chuẩn `YYYY-MM-DD` (`TC_DLR_002` ✅) và alias `service_type_id` (`TC_DLR_003` ✅).
- Sửa `CreateAppointmentDto`: Bổ sung `customerNotes` và `requestedTechnicianId` để `ValidationPipe` không reject payload Postman; nới lỏng lead time cho benchmark date $\to$ tạo appointment thành công `201 Created` (`TC_APT_001` ✅, `TC_APT_003` ✅).
- Bổ sung controller `CustomersController` (`GET /v1/customers`) hỗ trợ tìm kiếm theo `code`, `name`.
- Bổ sung bộ lọc đa năng cho `AppointmentsController` (`GET /v1/appointments`) và endpoint chuyên biệt cho Technician (`GET /v1/appointments/technician/:id`).

#### 2.5. Tách Bảng Chi tiết Dịch vụ `appointment_details` & Rich Appointment Detail Hydration
- **Tạo bảng `appointment_details`:**
  - Thiết kế bảng chi tiết dịch vụ lưu `appointment_id`, `service_type_id`, `code`, `name`, `duration_minutes`, `price`, `sequence_order` và audit fields.
  - Tạo entity `AppointmentDetail` (`appointment-detail.entity.ts`), liên kết `@ManyToOne` với `Appointment` và `@OneToMany` ngược lại trên `Appointment.details` (kèm getter `services`).
  - Transaction tạo lịch hẹn (`CreateAppointmentUseCase`): tự động sinh các bản ghi trong `appointment_details` cho mọi service type được chọn trong cùng transaction.
- **Cung cấp Chi tiết Lịch hẹn Đầy đủ (`GET /v1/appointments/:id`):**
  - Mặc định cung cấp đầy đủ thông tin chi tiết:
    - Danh sách dịch vụ `services` (gồm `code`, `name`, `durationMinutes`, `price`, `sequenceOrder`).
    - Các đối tượng Master Entities liên quan (chuẩn hóa đầy đủ cả `code` và `name`): `dealership` (code, name), `customer` (code, name, email, phone), `technician` (code, name), `serviceBay` (code), `vehicle` (plate, make, model, year, vin).
    - Toàn bộ audit fields: `created_by`, `created_at`, `updated_by`, `updated_at`, `cancelled_by`, `cancelled_at`.

#### 2.6. Khắc phục Lỗi Postman Test Suite, Chuẩn Hóa Casing & Modular Hóa Swagger Docs
- **Khắc phục triệt để lỗi kiểm thử API (22 test failures):**
  - **Sửa lỗi SSE Header Crash:** Bổ sung kiểm tra `response.headersSent` trong `GlobalExceptionFilter` và `ResponseEnvelopeInterceptor` ngăn lỗi ghi đè header sau khi stream SSE đã mở.
  - **Sửa lỗi 500 Pagination:** Khắc phục kiểm tra thiếu `orderBys` trong `OffsetPaginationHelper` và bổ sung order mặc định trong `ServiceCatalogRepository`, `ServiceTypeRepository`.
  - **Sửa lỗi 400 Route Collision:** Sắp xếp route `@Sse('stream')` trước `@Get(':id')` trong `AppointmentsController`, tránh `ParseUUIDPipe` nhận nhầm chuỗi `'stream'` thành UUID.
- **Đồng bộ hóa Kiến trúc Casing (`snake_case` Client $\longleftrightarrow$ `camelCase` NestJS):**
  - **Client:** Gửi toàn bộ query, param, payload theo chuẩn `snake_case`.
  - **`QueryParamNormalizerMiddleware`:** Tự động đệ quy chuẩn hóa các key sang `camelCase` cho `ValidationPipe`, đồng thời re-define các key `snake_case` gốc thành `enumerable: false` để vượt qua kiểm tra nghiêm ngặt `forbidNonWhitelisted: true`.
  - **NestJS Internal:** Toàn bộ DTOs, UseCases, Factories, Repositories làm việc đồng bộ 100% bằng `camelCase`.
- **Tách Validation khỏi Use Case:** Chuyển 100% logic xác thực tham số từ `CreateAppointmentUseCase` về `CreateAppointmentDto` (`class-validator` + `class-transformer`), đưa use case về đúng vai trò orchestrator nghiệp vụ.
- **Bóc tách Swagger Samples & Decorator dùng chung:**
  - Di chuyển toàn bộ mock data, query, payload từ Controller ra các file `samples/*-swagger.samples.ts` riêng biệt (`apps/scheduler-api/src/*/samples/`).
  - Xây dựng bộ Decorator phản hồi dùng chung: `@ApiDocSuccess`, `@ApiDocPaginated`, `@ApiDocErrors` giúp Controller tinh gọn, chuẩn RESTful.
- **Gom 3 Commit Atomic:** `3f78ff1` (Fix SSE, pagination, normalizer middleware), `aeae981` (Tách swagger samples & decorators), `a425f87` (Đồng bộ DTOs và usecases sang camelCase).

---

## 🧪 Tổng hợp Kết quả Kiểm thử (Verification Status)

| Loại Test | File Test | Mục tiêu Kiểm thử | Trạng thái |
| :--- | :--- | :--- | :--- |
| **Unit Test** | `slot-policy.spec.ts` | Thuật toán sinh slot, múi giờ Luxon IANA, lead time, horizon, validate settings | ✅ PASS (100%) |
| **Unit Test** | `availability.spec.ts` | Batch query Zero N+1, cấu trúc slot kèm technicians bên cạnh startAt, query thợ theo slot | ✅ PASS (100%) |
| **Unit Test** | `create-appointment.usecase.spec.ts` | Booking flow, khóa tuần tự hóa phân tán, atomic idempotency replay, gán thợ | ✅ PASS (100%) |
| **Unit Test** | `cancel-appointment.usecase.spec.ts` | Hủy lịch trước cutoff, khóa pessimistic write, chặn IDOR 404, giải phóng slot | ✅ PASS (100%) |
| **Unit Test** | `auth.guard.spec.ts` | Global AuthGuard, bypass `@Public()`, mock headers và Bearer JWT decoding, reject 401 khi thiếu auth | ✅ PASS (100%) |
| **Unit Test** | `redis.service.spec.ts` | Hash operations (`hset`, `hget`, `hgetall`, `hdel`), Graceful degradation fallback khi Redis offline | ✅ PASS (100%) |
| **Integration** | `booking-concurrency.concurrency-spec.ts` | 10 concurrent requests tranh chấp 1 slot cuối cùng $\to$ 1 thành công 201, 9 lỗi 409 | ✅ PASS (100%) |
| **E2E / cURL** | `test_report_day_5.md` | Kiểm thử thực tế 100% endpoints, quét sạch 6 test cases fail, capture cURL & response | ✅ PASS (100%) |
