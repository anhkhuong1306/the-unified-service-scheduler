# Story: Ngày 5 — Advanced Scheduling, Appointment Lifecycle State Machine, Atomic Swap & Real-Time SSE Stream

- **Story Key:** `011126-day-5-advanced-scheduling-lifecycle-concurrency`
- **Epic:** Scenario A — Unified Service Scheduler Backend (Keyloop Assessment v5)
- **Ngày tạo:** 01/11/2026
- **Trạng thái:** DRAFT / IN_REVIEW 📋
- **Branch mục tiêu:** `feature/day-5-api-refinement-and-bugfixes` (hoặc `feature/day-5-advanced-scheduling`)
- **Tác giả:** Winston (Architect), Amelia (Senior Dev), Quinn (QA)

---

## 1. Bối cảnh & Mục tiêu (Context & Objectives)

Theo lộ trình **Ngày 5** trong tài liệu `docs/KEYLOOP_ASSESSMENT_PLAN.md` (Mục 5.1 & 5.2) và tài liệu thiết kế hệ thống `source/SYSTEM_DESIGN.md`:
Sau khi đã hoàn thiện phần Core Booking (Tạo & Hủy lịch hẹn, tối ưu N+1 SQL, phân trang Offset/Cursor, bảo mật 401 Zero Trust, đóng gói Repositories và i18n), hệ thống cần hoàn tất toàn bộ các tính năng vận hành nâng cao của phân hệ **Workshop Management**:

### 🎯 Các Mục tiêu Cốt lõi:
1. **Chỉnh sửa Lịch hẹn Khách hàng (`UpdateAppointmentUseCase`):**
   - Cho phép khách hàng sửa `startAt`, `serviceTypeIds`, `vehicleId`, `technicianId`, `notes`.
   - Kiểm tra đồng thời khoang bảo dưỡng (Bay) và kỹ thuật viên (Technician) rảnh.
   - Kiểm tra thời hạn Cutoff và bảo vệ chống ghi đè đồng thời bằng **Optimistic Locking (`version` / Header `If-Match`)** kết hợp **Advisory Lock**.
2. **Điều phối Kỹ thuật viên & Khoang bởi Nhân viên (`ReassignAppointmentUseCase`):**
   - Nhân viên điều phối (Staff) đổi thợ phụ trách hoặc đổi khoang sửa chữa cho lịch hẹn nếu thợ/khoang mới còn trống và thợ có đủ kỹ năng đáp ứng tất cả dịch vụ trong lịch hẹn.
3. **Tiếp nhận Khách đến sớm & Đổi giờ (`RescheduleAppointmentUseCase`):**
   - Endpoint: `POST /v1/staff/appointments/:id/reschedule`.
   - Xử lý kịch bản khách mang xe đến sớm hơn giờ hẹn (Early Arrival Scenarios A & B), cho phép nhân viên dời giờ lên sớm mà **miễn trừ điều kiện Lead Time tối thiểu**, kiểm tra khoang và thợ rảnh tại khung giờ mới.
4. **Hoán đổi Lịch hẹn Nguyên tử (`SwapAppointmentsUseCase`):**
   - Endpoint: `POST /v1/staff/appointments/swap`.
   - Nhân viên hoán đổi 2 lịch hẹn trong cùng đại lý (ví dụ: đổi giờ giữa 2 khách hàng khi một khách cần ưu tiên).
   - Đảm bảo tính nguyên tử tuyệt đối (Atomic Swap) dưới transaction và advisory lock để không bao giờ bị vi phạm GiST exclusion constraints giữa chừng.
5. **State Machine Vận hành Toàn diện (Appointment State Machine):**
   - Đầy đủ các bước chuyển trạng thái nghiệp vụ chuẩn xưởng:
     - `PENDING` $\to$ `CONFIRMED` (`POST /v1/staff/appointments/:id/approve`)
     - `PENDING` $\to$ `REJECTED` (`POST /v1/staff/appointments/:id/reject`)
     - `CONFIRMED` $\to$ `CHECKED_IN` (`POST /v1/staff/appointments/:id/check-in`)
     - `CHECKED_IN` $\to$ `IN_SERVICE` (`POST /v1/staff/appointments/:id/start`)
     - `IN_SERVICE` $\to$ `COMPLETED` (`POST /v1/staff/appointments/:id/complete`)
     - `CONFIRMED` / `PENDING` $\to$ `NO_SHOW` (`POST /v1/staff/appointments/:id/no-show` khi quá 15 phút grace period)
   - Kiểm soát nghiêm ngặt bằng State Machine, quăng `InvalidStateTransitionException` (HTTP 409) nếu vi phạm quy trình.
6. **Real-Time Server-Sent Events (Post-Commit SSE Stream):**
   - Endpoint Customer: `GET /v1/appointments/stream` (`@Sse()`).
   - Endpoint Staff / Dealership Board: `GET /v1/staff/appointments/stream?technician_id=` (`@Sse()`).
   - Tận dụng PostgreSQL `LISTEN / NOTIFY` (`appointment_events`), nhận diện `version` và payload sự kiện để broadcast ra client qua RxJS Observable mà không cần cài thêm message broker nặng nề như Redis Streams/RabbitMQ.
7. **Background Worker Tự động Hết hạn (`apps/scheduler-worker`):**
   - Cronjob `ExpirePendingAppointmentsCron`: Quét các lịch `PENDING` chạm mốc `start_at - cancellation_cutoff_minutes` mà chưa được Staff duyệt $\to$ tự động chuyển sang `EXPIRED`, bắn event audit.
   - Bảo vệ phân tán qua `pg_try_advisory_xact_lock` để an toàn khi scale worker.
8. **Bộ Kiểm thử Nghiêm ngặt (Quinn Protocol):**
   - Unit tests cho từng Use Case mới.
   - Concurrency tests (`Promise.all`) kiểm tra race condition cho Slot Swap và Reassign.
   - Cập nhật Postman Collection v2 và file Excel Test Cases.

---

## 2. Thiết kế Kỹ thuật Chi tiết (Technical Specification)

### 2.1. Cấu trúc Thư mục & Phân lớp (Architecture & Clean Folder Mapping)

```text
source/
├── apps/
│   ├── scheduler-api/src/
│   │   ├── appointments/
│   │   │   ├── appointments.controller.ts        # Customer endpoints (GET, POST, PATCH, DELETE, SSE)
│   │   │   ├── staff-appointments.controller.ts  # Staff endpoints (approve, reject, check-in, start, complete, no-show, reschedule, reassign, swap, SSE)
│   │   │   └── dto/
│   │   │       ├── update-appointment.dto.ts
│   │   │       ├── reassign-appointment.dto.ts
│   │   │       ├── reschedule-appointment.dto.ts
│   │   │       └── swap-appointments.dto.ts
│   └── scheduler-worker/src/
│       └── cron/
│           └── expire-pending-appointments.cron.ts # Bật cronjob quét PENDING appointments
└── libs/
    └── workshop/src/
        └── appointment/
            ├── state-machine/
            │   └── appointment.state-machine.ts   # Quản lý ma trận chuyển trạng thái hợp lệ
            ├── services/
            │   └── appointment-stream.service.ts  # SSE broadcaster lắng nghe PG LISTEN 'appointment_events'
            ├── usecases/
            │   ├── update-appointment.usecase.ts
            │   ├── reassign-appointment.usecase.ts
            │   ├── reschedule-appointment.usecase.ts
            │   ├── swap-appointments.usecase.ts
            │   └── transition-appointment-status.usecase.ts
            └── repositories/
                └── appointment.repository.ts      # Bổ sung các queries atomic swap, lock find, worker expire
```

---

### 2.2. Chi tiết Nghiệp vụ Từng Tính năng (Deep Dive)

#### A. Chỉnh sửa Lịch hẹn Khách hàng (`UpdateAppointmentUseCase`)
- **Route:** `PATCH /v1/appointments/:id`
- **Quyền:** Customer sở hữu lịch hẹn (kiểm tra `customerId == actor.customerId`, trả `404` nếu IDOR).
- **Trạng thái cho phép sửa:** Chỉ khi ở trạng thái `PENDING` hoặc `CONFIRMED`.
- **Ràng buộc Cutoff:** Phải thực hiện trước thời điểm `start_at - cancellation_cutoff_minutes`.
- **Concurrency & Concurrency Control:**
  - Optimistic locking: Kiểm tra `version` (từ header `If-Match` hoặc payload). Nếu version trong DB đã tăng do staff vừa thao tác $\to$ báo `409 CONFLICT` ("Appointment was modified by another transaction").
  - Pessimistic Advisory Lock: `pg_advisory_xact_lock(NS_BOOKING, dealership_id)`.
  - Nếu đổi `startAt` hoặc `serviceTypeIds`:
    - Tính toán lại thời lượng dịch vụ và lưới slot qua `AppointmentSlotValidator`.
    - Kiểm tra xe không bị trùng lịch mới (`hasVehicleOverlap`).
    - Kiểm tra và tái phân bổ Bay & Technician mới phù hợp.
    - Cập nhật lại các bản ghi trong `appointment_details`.
  - Tăng `version = version + 1`, cập nhật `updated_by` = actor code/name.
  - Bắn sự kiện `APPOINTMENT_UPDATED` qua `pg_notify`.

#### B. Điều phối Kỹ thuật viên & Khoang bởi Nhân viên (`ReassignAppointmentUseCase`)
- **Route:** `POST /v1/staff/appointments/:id/reassign`
- **Body:** `{ technicianId?: string, serviceBayId?: string, reason?: string }`
- **Quyền:** `staff` hoặc `system`.
- **Kiểm tra nghiệp vụ:**
  - Nếu đổi thợ (`technicianId`): Thợ mới bắt buộc phải sở hữu **toàn bộ kỹ năng** yêu cầu bởi các `serviceTypeIds` của lịch hẹn, và thợ không bị trùng lịch trong khoảng `[start_at, occupied_until)`.
  - Nếu đổi khoang (`serviceBayId`): Khoang mới phải đang hoạt động (`is_active = true`) và không bị trùng lịch trong khoảng `[start_at, occupied_until)`.
  - Lưu vết kiểm toán: ghi nhận vào `appointment_events` với type `REASSIGNED`.

#### C. Tiếp nhận Khách đến sớm & Đổi giờ (`RescheduleAppointmentUseCase`)
- **Route:** `POST /v1/staff/appointments/:id/reschedule`
- **Body:** `{ newStartAt: string, requestedTechnicianId?: string, notes?: string }`
- **Mục đích:** Xử lý khách tới sớm (Early Arrival — Kịch bản A & B trong đề bài).
- **Đặc quyền Staff:** Được phép **bỏ qua ràng buộc Lead Time tối thiểu** (vì khách đã có mặt tại xưởng), nhưng **bắt buộc vẫn phải tuân thủ**:
  1. Nằm trong giờ mở cửa của đại lý (`opens_at` $\le$ `newStartAt`, `occupied_until` $\le$ `closes_at`).
  2. Chuẩn hóa theo lưới thời gian 30 phút (`displayTime` hợp lệ).
  3. Cả Khoang dịch vụ và Kỹ thuật viên đều đang trống trong khung giờ mới.
  4. Xe không bị xung đột lịch khác.

#### D. Hoán đổi Lịch hẹn Nguyên tử (`SwapAppointmentsUseCase`)
- **Route:** `POST /v1/staff/appointments/swap`
- **Body:** `{ appointmentIdA: string, appointmentIdB: string, reason?: string }`
- **Nguyên tắc Swap Nghiêm ngặt (Strict Swap Boundary — Chỉ đạo từ Boss):**
  - **KHÔNG áp dụng cascade rescheduling (không đẩy lùi dây chuyền các lịch hẹn khác):** Swap chỉ được phép xảy ra khi hai lịch hẹn hoán đổi vị trí cho nhau một cách sạch sẽ, không làm xáo trộn hay đẩy lùi bất kỳ lịch hẹn nào khác của khách hàng trong xưởng.
  - **Kiểm tra Overlap do Chênh lệch Thời lượng (Duration Mismatch Overlap Guard):**
    - Ví dụ: Lịch A (08:00 - 09:00, thời lượng 1h) và Lịch B (09:00 - 11:00, thời lượng 2h).
    - Nếu hoán đổi B lên 08:00, B sẽ chiếm khung giờ `[08:00 - 10:00)`. Lúc này nếu A chuyển sang 09:00 thì A và B sẽ bị đè lấn nhau trong khoảng `[09:00 - 10:00)`, hoặc B đè lên các lịch hẹn khác đã có sẵn lúc 09:00 trên khoang/thợ đó.
    - **Expected Outcome:** **BẮT BUỘC TỪ CHỐI SWAP (REJECT)** và trả về mã lỗi `409 Conflict` (hoặc `400 Bad Request`) kèm thông báo rõ ràng: *"Cannot swap appointments: Duration mismatch causes slot overlap with appointment or existing schedule"*.
  - **Quy tắc Kiểm tra Tính Khả thi (Feasibility Checks):**
    1. Hai lịch hẹn cùng thuộc 1 `dealership_id` và đang ở trạng thái active (`PENDING` hoặc `CONFIRMED`).
    2. Tính toán dải thời gian mới: `newPeriodA = [startAt_B, startAt_B + duration_A]`, `newPeriodB = [startAt_A, startAt_A + duration_B]`.
    3. `newPeriodA` và `newPeriodB` không được giao nhau nếu có dùng chung tài nguyên (Bay hoặc Thợ).
    4. Cả hai dải thời gian mới phải hoàn toàn trống trên Khoang và Kỹ thuật viên tương ứng, không đè lên bất kỳ lịch hẹn nào khác trong DB.
    5. Kỹ thuật viên phải có đủ kỹ năng đáp ứng tất cả dịch vụ của lịch hẹn mới nhận.
- **Thách thức Kỹ thuật GiST & Giải pháp Winston:** 
  - Nếu cập nhật trực tiếp `A.period = B.period` trước, PostgreSQL sẽ quăng lỗi ngay lập tức vì vi phạm ràng buộc loại trừ `EXCLUDE USING gist (service_bay_id WITH =, period WITH &&)`.
  - **Giải pháp:** Chạy trong 1 transaction duy nhất với `pg_advisory_xact_lock(NS_BOOKING, dealership_id)`.
  - Sử dụng **kỹ thuật hoán đổi 3 bước (Temporary Shift)**:
    - Bước 1: Cập nhật lịch A sang trạng thái tạm `SWAPPING` và dời tạm thời dải thời gian ra vùng an toàn không trùng lặp (hoặc hoán đổi metadata).
    - Bước 2: Cập nhật lịch B nhận slot & khoang/thợ của lịch A.
    - Bước 3: Cập nhật lịch A nhận slot & khoang/thợ cũ của lịch B, đưa trạng thái trở lại bình thường.
  - Tăng version của cả 2 lịch hẹn và bắn 2 event `APPOINTMENT_SWAPPED`.

#### E. State Machine Vận hành Xưởng (`AppointmentStateMachine`)
Bảng ma trận chuyển trạng thái hợp lệ:

| Trạng thái hiện tại | Thao tác kích hoạt | Trạng thái kế tiếp | Ai được phép thực hiện? |
| :--- | :--- | :--- | :--- |
| `PENDING` | `approve` | `CONFIRMED` | Staff / Admin |
| `PENDING` | `reject` | `REJECTED` | Staff / Admin |
| `CONFIRMED` | `check-in` | `CHECKED_IN` | Staff / Receptionist |
| `CHECKED_IN` | `start` | `IN_SERVICE` | Staff / Technician |
| `IN_SERVICE` | `complete` | `COMPLETED` | Staff / Technician |
| `PENDING` / `CONFIRMED` | `no-show` | `NO_SHOW` | Staff (quá 15p grace period) |
| `PENDING` | `expire` | `EXPIRED` | Worker Cron |
| `PENDING` / `CONFIRMED` | `cancel` | `CANCELLED` | Customer / Staff |

- Mọi thao tác trái với bảng trên $\to$ `InvalidStateTransitionException: Cannot transition appointment from {current} to {target}` (HTTP 409).
- Khi chuyển sang `COMPLETED`, `CANCELLED`, `REJECTED`, `EXPIRED`, `NO_SHOW`, tài nguyên Bay & Technician tự động được giải phóng cho các khung giờ kế tiếp.

#### F. Real-Time SSE Post-Commit Stream (`AppointmentStreamService`)
- Lắng nghe sự kiện qua client PostgreSQL độc lập: `LISTEN appointment_events`.
- Khi có `NOTIFY appointment_events, payload`:
  - Phân loại sự kiện (`CREATED`, `UPDATED`, `RESCHEDULED`, `REASSIGNED`, `SWAPPED`, `STATUS_CHANGED`, `CANCELLED`).
  - Lọc theo phân quyền:
    - Stream Customer: chỉ đẩy các events có `customerId == actor.customerId`.
    - Stream Staff: đẩy toàn bộ events trong `dealershipId` hoặc theo `technicianId` được subscribe.
- Dùng NestJS `@Sse()` trả về `Observable<MessageEvent>` chuẩn HTML5 EventSource.

#### G. Background Cron Worker (`apps/scheduler-worker`)
- Sử dụng `@nestjs/schedule` với cron expression `*/5 * * * *` (mỗi 5 phút).
- Acquire `pg_try_advisory_xact_lock(NS_WORKER, 1)`:
  - Nếu pod khác đang chạy $\to$ skip ngay lập tức (đảm bảo single-runner).
  - Tìm tất cả `Appointment` có `status = 'PENDING'` và `start_at - cancellation_cutoff_minutes <= NOW()`.
  - Update hàng loạt `status = 'EXPIRED'`, `updated_by = 'system_cron'`, ghi `appointment_events` và `pg_notify`.

---

## 3. Tiêu chí Nghiệm thu Kiểm thử (Acceptance Criteria & Test Plan - Quinn QA)

### AC-1: Chỉnh sửa Lịch hẹn Khách hàng
- [ ] Khách hàng sửa ghi chú hoặc đổi thợ rảnh thành công $\to$ HTTP 200, thông tin cập nhật, `version` tăng lên.
- [ ] Khách hàng sửa lịch sau khi đã quá cutoff $\to$ HTTP 409 `CANCELLATION_CUTOFF_EXCEEDED`.
- [ ] Gửi request cập nhật với `version` cũ hơn version hiện tại trong DB $\to$ HTTP 409 `CONCURRENT_MODIFICATION_CONFLICT`.
- [ ] Khách hàng A sửa lịch của khách hàng B $\to$ HTTP 404 `RESOURCE_NOT_FOUND` (chống dò IDOR).

### AC-2: Phân công lại & Tiếp nhận Khách đến sớm (Staff)
- [ ] Staff đổi thợ mới cho lịch hẹn $\to$ hệ thống kiểm tra thợ mới đủ kỹ năng và đang rảnh $\to$ HTTP 200, ghi log audit `REASSIGNED`.
- [ ] Staff gán thợ không đủ kỹ năng yêu cầu $\to$ HTTP 400 `TECHNICIAN_SKILL_MISMATCH`.
- [ ] Staff tiếp nhận khách đến sớm, dời lịch hẹn lên trước 1 tiếng (bỏ qua lead time) $\to$ HTTP 200, lịch hẹn được cập nhật khung giờ mới thành công.

### AC-3: Hoán đổi Lịch hẹn Nguyên tử (Atomic Slot Swap)
- [ ] Staff hoán đổi Lịch A (08:00 - Bay 1 - Thợ 1, 1h) và Lịch B (09:00 - Bay 2 - Thợ 2, 1h) $\to$ cả 2 lịch đổi chỗ nguyên tử $\to$ HTTP 200, không bị lỗi GiST exclusion constraint.
- [ ] **[Edge Case từ Boss]** Từ chối Swap khi chênh lệch thời lượng gây overlap: Lịch A (08:00 - 09:00, 1h) và Lịch B (09:00 - 11:00, 2h). Nếu đổi B lên 08:00 (chiếm 08:00 - 10:00) $\to$ đè lấn lên A hoặc lịch kế tiếp $\to$ **Reject HTTP 409 Conflict**, message giải thích rõ lý do, không cascade đẩy lùi lịch khác.
- [ ] Hoán đổi 2 lịch thuộc 2 đại lý khác nhau $\to$ HTTP 400 `DEALERSHIP_MISMATCH`.
- [ ] Hoán đổi khi 1 trong 2 lịch đã hoàn thành (`COMPLETED`) hoặc đã hủy (`CANCELLED`) $\to$ HTTP 409 `INVALID_STATE_FOR_SWAP`.

### AC-4: State Machine Lifecycle
- [ ] Duyệt tuần tự: `PENDING` $\to$ `CONFIRMED` $\to$ `CHECKED_IN` $\to$ `IN_SERVICE` $\to$ `COMPLETED` $\to$ mỗi bước đều thành công HTTP 200 với audit timestamp và actor tương ứng.
- [ ] Nhảy cóc trạng thái (ví dụ `PENDING` nhảy thẳng lên `IN_SERVICE`) $\to$ HTTP 409 `INVALID_STATE_TRANSITION`.
- [ ] Đánh dấu `NO_SHOW` khi khách không tới $\to$ HTTP 200, giải phóng tài nguyên.

### AC-5: Real-Time SSE Stream & Concurrency Suite
- [ ] Kết nối `GET /v1/appointments/stream` nhận được sự kiện `keep-alive` và nhận event tương ứng ngay khi tạo/sửa/hủy lịch hẹn.
- [ ] Concurrency test: Bắn song song 2 request đồng thời hoán đổi (swap) và hủy (cancel) cùng 1 lịch hẹn $\to$ hệ thống tuần tự hóa an toàn qua advisory lock, 1 request thành công và 1 request nhận 409/404, DB luôn nhất quán.

---

## 4. Kế hoạch Triển khai (Execution Steps)

1. **Step 1:** Xây dựng `AppointmentStateMachine` và các DTOs (`update`, `reassign`, `reschedule`, `swap`).
2. **Step 2:** Mở rộng `AppointmentRepository` với các hàm query phục vụ atomic swap, status transition và optimistic locking.
3. **Step 3:** Hiện thực các Use Cases (`UpdateAppointmentUseCase`, `ReassignAppointmentUseCase`, `RescheduleAppointmentUseCase`, `SwapAppointmentsUseCase`, `TransitionAppointmentStatusUseCase`).
4. **Step 4:** Xây dựng `StaffAppointmentsController` và bổ sung method `update`, `stream` vào `AppointmentsController`.
5. **Step 5:** Xây dựng `AppointmentStreamService` (SSE qua PG `LISTEN/NOTIFY`).
6. **Step 6:** Cấu hình `ExpirePendingAppointmentsCron` trong `apps/scheduler-worker`.
7. **Step 7:** Viết bộ Unit Test & Concurrency Integration Test bao phủ 100% các luồng mới.
8. **Step 8:** Cập nhật Postman Collection v2 và file Excel Test Cases.
