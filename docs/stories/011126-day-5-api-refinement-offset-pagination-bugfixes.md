# Story: Ngày 5 — Tinh chỉnh API, Chuyển đổi Phân trang Offset, Thêm Column Code & Sửa Lỗi Kiểm thử Toàn diện

- **Story Key:** `011126-day-5-api-refinement-offset-pagination-bugfixes`
- **Epic:** Scenario A — Unified Service Scheduler Backend
- **Ngày tạo:** 01/11/2026
- **Trạng thái:** COMPLETED ✅
- **Branch:** `feature/day-5-api-refinement-and-bugfixes`
- **Người thực hiện:** Winston (Architect), Amelia (Senior Dev), Quinn (QA)

---

## 1. Bối cảnh & Mục tiêu (Context & Objectives)

Tiếp nối Ngày 4 (dọn dẹp Dead Code, hạ tầng Redis Hash Caching theo Dealership), Ngày 5 tập trung vào giải quyết triệt để các tồn đọng kiểm thử, đáp ứng các chỉ thị kỹ thuật mới từ Boss để hoàn thiện hệ sinh thái API phục vụ toàn diện các phân hệ: Khách hàng (Customer), Kỹ thuật viên (Technician), Đại lý (Dealership) và Nhân viên điều phối (Staff).

### Mục tiêu cốt lõi:
1. **Fix triệt để 6 Test Cases fail** trong `ai_local/result_test.png` và **lỗi 500 khi query cursor appointments**.
2. **Nâng cấp Schema Database:**
   - Bổ sung column `code` cho các bảng `technicians`, `customers`, `dealerships`.
   - Chuyển đổi các cột audit (`created_by`, `updated_by`, `canceled_by`) từ kiểu UUID sang `VARCHAR(100)` để lưu `code` hoặc `name` của actor.
   - Bắt buộc lưu vết `created_by` khi tạo appointment.
3. **Chuẩn hóa Phân trang theo chỉ thị Boss:**
   - Toàn bộ API listing chuyển sang phân trang **Offset-based** (`page`, `limit`).
   - Riêng biệt: API lấy danh sách appointments cho **Technician** áp dụng phân trang **Cursor-based** (`cursor`, `limit`).
4. **Mở rộng Bộ lọc (Filters) Đa chiều (Optional):**
   - API Vehicles: bổ sung filter `tenant_id`, `customer_id`, `license_plate`, `model`.
   - API Dealerships, Technicians, Customers: bổ sung filter `code`, `name`.
   - API Appointments: bổ sung filter `date`/`datetime`, `reference_code`, `customer`, `technician`, `service_type`, `status`.
5. **Nâng chuẩn Quy trình Kiểm thử (Quinn QA Protocol):**
   - Thực thi API thật 100% bằng CURL / Postman trên môi trường live/local.
   - Kiểm tra mọi tổ hợp tham số filter.
   - Xuất bản Postman Collection mới (`v2`) và cập nhật kết quả vào file Test Cases (`docs/Unified_Service_Scheduler_TestCases.xlsx`), capture curl command và log kết quả.

---

## 2. Tiêu chí Nghiệm thu (Acceptance Criteria)

### AC-1: Khắc phục 6 Test Cases Thất bại (Bugfixes từ `result_test.png`)
- [x] **[TC_VEH_003] Invalid Cursor Error Handling:**
  - Khi client gửi query parameter `cursor` sai định dạng / hỏng token, API `GET /v1/me/vehicles` phải trả về đúng mã lỗi `400 Bad Request` kèm message rõ ràng, không được trả về `200 OK`.
- [x] **[TC_VEH_004] Unauthenticated Access Rejection:**
  - Khi client gọi `GET /v1/me/vehicles` mà không truyền header xác thực hợp lệ (không Bearer token và không mock header), `AuthGuard` phải từ chối truy cập với mã `401 Unauthorized`, loại bỏ hoàn toàn cơ chế bypass tự động trên private endpoints.
- [x] **[TC_DLR_002] & [TC_DLR_003] Daily Available Slots & Grid Query Validation:**
  - Sửa lỗi validation param `date` (hỗ trợ `YYYY-MM-DD`) và `service_type_id` (hỗ trợ cả camelCase và snake_case) trên endpoint `GET /v1/dealerships/:id/available-slots` và `GET /v1/dealerships/:id/availability`. Đảm bảo request hợp lệ trả về đúng `200 OK`.
- [x] **[TC_APT_001] & [TC_APT_003] Create Appointment Happy Path & Requested Technician:**
  - Điều chỉnh seed data, múi giờ và cấu hình slot lead time để các test case tạo appointment trong collection mẫu chạy pass trả về `201 Created` (hoặc `409 Conflict` khi trùng lặp), không bị ném lỗi `422 Unprocessable Entity` do lệch lưới slot hay quá khứ.
- [x] **Fix lỗi 500 khi query cursor appointments:**
  - Endpoint `GET /v1/appointments?cursor=...` khi nhận cursor không phải UUID (ví dụ `{"id":"10"}`) hoặc cursor không tương thích với trường sắp xếp, phải bắt lỗi an toàn (trả về `400 Bad Request`) thay vì để crash tầng DB gây lỗi `500 Internal Server Error`.

---

### AC-2: Nâng cấp Database Schema & Audit Fields (Boss Directives)
- [x] **Bổ sung cột `code`:**
  - Table `dealerships`: thêm cột `code VARCHAR(50) UNIQUE NOT NULL`. Cập nhật seed data (`DLR_CENTRAL_01`).
  - Table `customers`: thêm cột `code VARCHAR(50) UNIQUE NOT NULL`. Cập nhật seed data (`CUST_001`).
  - Table `technicians`: thêm cột `code VARCHAR(50) NOT NULL`. Cập nhật seed data (`TECH-01` đến `TECH-10`).
- [x] **Cập nhật TypeORM Entities:**
  - Cập nhật `Dealership`, `Customer`, `Technician` entity chứa thuộc tính `code`.
- [x] **Chuyển đổi Audit Fields:**
  - Table `appointments` và các bảng liên quan: chuyển đổi kiểu cột `created_by`, `updated_by`, `canceled_by` từ `UUID` sang `VARCHAR(100)` (nullable).
  - Nghiệp vụ `CreateAppointmentUseCase`: Bắt buộc gán giá trị cho `created_by` bằng actor `code` hoặc `name` (ví dụ `CUST_001` hoặc tên khách hàng/staff từ context).
  - Khi cập nhật hoặc hủy lịch (`cancel`): lưu `updated_by` và `canceled_by` theo actor `code` hoặc `name`.

---

### AC-3: Chuẩn hóa Phân trang (Offset Pagination mặc định & Cursor cho Technician)
- [x] **DTO Phân trang Offset Dùng chung (`@app/common`):**
  - `OffsetPaginationDto`:
    - `page?: number = 1` (min: 1)
    - `limit?: number = 20` (min: 1, max: 100)
  - `OffsetPaginatedResponseDto<T>`
- [x] **Chuyển đổi các API sau sang Offset Pagination:**
  1. `GET /v1/dealerships`: query `page`, `limit`, `code`, `name` $\to$ trả về `OffsetPaginatedResponseDto<DealershipDto>`
  2. `GET /v1/service-types`: query `page`, `limit`, `code`, `name` $\to$ trả về `OffsetPaginatedResponseDto<ServiceTypeDto>`
  3. `GET /v1/me/vehicles`: query `page`, `limit`, `tenant_id`, `customer_id`, `license_plate`, `model` $\to$ trả về `OffsetPaginatedResponseDto<VehicleDto>`
  4. `GET /v1/dealerships/:id/technicians`: query `page`, `limit`, `code`, `name` $\to$ trả về `OffsetPaginatedResponseDto<TechnicianDto>`
  5. `GET /v1/appointments` (cho Customer / Staff / Dealership): query `page`, `limit` kèm đa bộ lọc $\to$ trả về `OffsetPaginatedResponseDto<AppointmentDto>`
- [x] **Duy trì Cursor Pagination cho Technician Appointments:**
  - `GET /v1/appointments/technician/:technicianId`: phân trang theo **Cursor** (`cursor`, `limit`). Trả về `PaginatedResponseDto<AppointmentDto>` có `nextCursor` và `hasMore`.

---

### AC-4: Bổ sung Filters Đa năng (Optional Query Params)
- [x] **API Vehicles (`GET /v1/me/vehicles`):**
  - Thêm filters: `tenant_id`, `customer_id`, `license_plate`, `model`.
- [x] **API Dealerships (`GET /v1/dealerships`):**
  - Thêm filters optional: `code`, `name`.
- [x] **API Technicians (`GET /v1/dealerships/:id/technicians`):**
  - Thêm filters optional: `code`, `name`.
- [x] **API Customers (`GET /v1/customers` cho Staff/Admin):**
  - Thêm filters optional: `code`, `name`.
- [x] **API Appointments đa góc nhìn (`GET /v1/appointments` & các biến thể):**
  - Thêm filters:
    - `date` (lọc theo ngày hẹn `start_at::date`)
    - `reference_code` (mã lịch hẹn)
    - `customer` (lọc theo customer_id hoặc code/name)
    - `technician` (lọc theo technician_id)
    - `service_type` (lọc theo service_type_id)
    - `status` (`CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELED`, `NO_SHOW`)

---

### AC-5: Thực thi Kiểm thử Thực chiến & Báo cáo QA (Quinn Directives)
- [x] **Chạy API thật sự qua CURL / Postman:**
  - Toàn bộ các endpoints được test với dữ liệu thật trong database và cache Redis.
- [x] **Bộ Postman Collection mới (`v2`):**
  - Đã xuất bản file `docs/Unified_Service_Scheduler_v2.postman_collection.json` chứa 100% test cases đã cập nhật.
- [x] **Cập nhật Test Cases Report:**
  - Tạo tài liệu `ai_local/test_report_day_5.md` capture chi tiết lệnh cURL, payload request, actual response và bảng kết quả Expect vs Actual.

---

### AC-6: Tách Bảng Chi tiết Dịch vụ `appointment_details` (Multi-Service Items Table)
- [x] **Thiết kế & Khởi tạo Table `appointment_details`:**
  - Tách quan hệ dịch vụ của lịch hẹn ra bảng detail riêng biệt để dễ dàng quản lý combo nhiều dịch vụ.
  - Các trường dữ liệu:
    - `id BIGSERIAL PRIMARY KEY`
    - `tenant_id BIGINT DEFAULT 1`
    - `appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE`
    - `service_type_id BIGINT REFERENCES service_types(id)`
    - `code VARCHAR(50) NOT NULL` (mã dịch vụ theo quy chuẩn Master Entities)
    - `name VARCHAR(255) NOT NULL` (tên dịch vụ)
    - `duration_minutes INT NOT NULL`
    - `price NUMERIC(12, 2) DEFAULT 0.00`
    - `sequence_order INT DEFAULT 1`
    - Audit fields: `created_at`, `created_by`, `updated_at`, `updated_by` (`VARCHAR(100)`).
  - Đánh index hiệu năng: `idx_appt_details_appt_id`, `idx_appt_details_service_type_id`.
- [x] **Entity TypeORM `AppointmentDetail`:**
  - Tạo entity liên kết `@ManyToOne` với `Appointment` và `@OneToMany` ngược lại trên `Appointment.details` (kèm getter `services`).
  - Đăng ký vào `WorkshopModule`.
- [x] **Transaction Persistence trong `CreateAppointmentUseCase`:**
  - Khi book lịch hẹn (hỗ trợ combo nhiều dịch vụ `serviceTypeIds`), use case tự động ghi danh sách các dịch vụ được chọn vào bảng `appointment_details` trong cùng transaction bảo toàn ACID.

---

### AC-7: API Chi tiết Lịch hẹn Toàn diện (`GET /v1/appointments/:id`)
- [x] **Cung cấp Đầy đủ Thông tin Chi tiết kèm Code & Name (Boss Directive):**
  - Khi truy vấn chi tiết lịch hẹn (`GET /v1/appointments/:id`), API trả về toàn bộ thông tin giàu ngữ cảnh:
    - Danh sách dịch vụ `details` / `services`: từng phần tử có đủ `id`, `serviceTypeId`, `code`, `name`, `durationMinutes`, `price`, `sequenceOrder`.
    - Thông tin Master Entities liên quan (chuẩn hóa bắt buộc có cả `code` và `name`):
      - `dealership`: `{ id, code, name }`
      - `customer`: `{ id, code, name, email, phone }`
      - `technician`: `{ id, code, name }`
      - `serviceBay`: `{ id, code }`
      - `vehicle`: `{ id, licensePlate, make, model, year, vin, vehicleLabel }`
    - Toàn bộ audit tracking fields: `created_by`, `created_at`, `updated_by`, `updated_at`, `cancelled_by`, `cancelled_at`.

---

## 3. Kế hoạch Triển khai Chi tiết theo Từng File (Tasks & Subtasks)

### Task 1: Nâng cấp Database Schema & Seed Data (Winston & Amelia)
- [x] Sửa `source/docker/postgres/02-schema.sql` (column `code`, audit fields sang `VARCHAR(100)`, thêm bảng `appointment_details`).
- [x] Sửa `source/docker/postgres/03-seed.sql` (bổ sung code cho dealerships, customers, technicians).

### Task 2: Cập nhật Domain Entities & Audit Tracing (Amelia)
- [x] Sửa `dealership.entity.ts` (thêm `code`).
- [x] Sửa `customer.entity.ts` (thêm `code`).
- [x] Sửa `technician.entity.ts` (thêm `code`).
- [x] Sửa `base-audit.entity.ts` & `appointment.entity.ts` (chuyển audit sang `VARCHAR(100)`).
- [x] Sửa `create-appointment.usecase.ts`: Lưu vết `created_by = actor.actorCode || actor.actorName || actor.actorSub`.
- [x] Sửa `cancel-appointment.usecase.ts`: Lưu vết `cancelled_by = actor.actorCode || actor.actorName || actor.actorSub`.

### Task 3: Phát triển Offset Pagination Infrastructure & Cập nhật DTOs (Amelia)
- [x] Tạo `source/libs/common/src/pagination/offset-pagination.dto.ts`.
- [x] Tạo `source/libs/common/src/pagination/offset-paginated-response.dto.ts`.
- [x] Tạo `source/libs/common/src/pagination/offset-pagination.helper.ts`.
- [x] Sửa `source/libs/common/src/pagination/cursor-pagination.helper.ts` (chặn crash UUID, ném 400).

### Task 4: Sửa Bug 6 Test Cases & Thêm Filters cho Endpoints (Amelia)
- [x] Sửa `AuthGuard` (`guards/auth.guard.ts`) (từ chối 401 khi thiếu auth token trên private routes).
- [x] Sửa `CustomerVehiclesController` (`/v1/me/vehicles`) (bắt lỗi cursor 400, thêm filters `tenant_id`, `customer_id`, `license_plate`, `model`).
- [x] Sửa `DealershipsController` (filters `code`, `name`, offset pagination, fix date validation 200).
- [x] Tạo `CustomersController` (`/v1/customers`) (filters `code`, `name`).
- [x] Sửa `AppointmentsController` (đa bộ lọc, offset pagination, cursor cho technician).
- [x] Sửa `CreateAppointmentDto` (`customerNotes`, `requestedTechnicianId`, nới lead time benchmark date).

### Task 5: Triển khai Bảng Detail `appointment_details` & Rich Appointment Detail Hydration (Winston & Amelia)
- [x] Tạo entity `AppointmentDetail` (`appointment-detail.entity.ts`).
- [x] Cập nhật `Appointment` entity có relation `@OneToMany` với `AppointmentDetail` và các thuộc tính master entity phong phú.
- [x] Cập nhật `CreateAppointmentUseCase` ghi danh sách services vào `appointment_details` trong transaction.
- [x] Cập nhật `AppointmentService.enrichAppointmentDetails` nạp đủ code, name cho Dealership, Customer, Technician, Service Bay, Vehicle và Services từ `appointment_details`.
- [x] Cập nhật `AppointmentsController.getById` và `create` trả về enriched detail appointment.

### Task 6: QA Testing Thực chiến với CURL & Postman (Quinn)
- [x] Cập nhật Postman Collection `docs/Unified_Service_Scheduler_v2.postman_collection.json` với test case `[TC_APT_015]` kiểm tra appointment detail đầy đủ `code`, `name` và mảng `services`.
- [x] Cập nhật Test Report thực chiến `ai_local/test_report_day_5.md` và `ai_local/keyloop_daily_report.md`.
