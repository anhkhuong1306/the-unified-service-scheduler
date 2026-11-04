# Story: Dealership Isolation & Schedule Mutation Invariants (Strict Multi-Tenancy & Temporal Guardrails)

- **Story Key:** `041126-dealership-isolation-and-schedule-mutation-invariants`
- **Epic:** Scenario A — Unified Service Scheduler Backend (DMS Core Governance)
- **Ngày tạo:** 04/11/2026
- **Trạng thái:** READY_FOR_DEV 📋
- **Branch mục tiêu:** `feature/day-6-finalize-document`
- **Tác giả:** Winston (System Architect), Amelia (Senior Dev), Quinn (QA Lead)

---

## 1. Bối cảnh & Mục tiêu (Context & Objectives)

Trong quá trình đánh giá và rà soát các luồng vận hành thực tế của phân hệ Workshop Management, nhóm kiến trúc và QA đã phát hiện 4 vấn đề trọng yếu liên quan đến **Data Governance (Phân quyền dữ liệu theo đại lý)**, **Temporal Validation (Bảo vệ thời gian)**, **State Machine Guardrails (Bảo vệ tính toàn vẹn trạng thái xưởng)** và **Audit Contract (Tham số lý do thay đổi lịch)**:

### 🎯 4 Vấn đề cần xử lý triệt để:
1. **API Reschedule thiếu tham số `reason`:**
   - DTO `RescheduleAppointmentDto` hiện tại chỉ có `notes` mà không có trường `reason` để ghi nhận nguyên nhân khách đến sớm / dời lịch.
   - Cần bổ sung `reason?: string` vào DTO, tài liệu OpenAPI Swagger, và lưu vết vào `appointment_events` changes log.
2. **Lỗ hổng Cross-Dealership Staff Mutation:**
   - Staff thuộc Dealership 2 (`Pham Thi Staff South`) hiện có thể thao tác (duyệt, từ chối, check-in, dời lịch, đổi thợ, swap) trên các lịch hẹn thuộc Dealership 1 do controller chưa kiểm tra đối chiếu `staff.dealership_id` với `appointment.dealership_id`.
   - Cần chặn đứng ngay lập tức với mã lỗi `403 Forbidden` (`ForbiddenDomainException`).
3. **Chặn chỉnh sửa lịch hẹn trong quá khứ (Temporal Invariants):**
   - Không cho phép thực hiện `reassign`, `reschedule`, hay `swap` đối với các lịch hẹn đã diễn ra trong quá khứ (`start_at <= NOW()`).
   - Với thao tác `reschedule`, chặn dời slot tới một mốc thời gian trong quá khứ (`new_start_at <= NOW()`). Báo lỗi `400 Bad Request`.
4. **Giới hạn trạng thái cho Reassign, Reschedule, Swap (State Machine Preconditions):**
   - Chỉ cho phép `reassign`, `reschedule`, và `swap` khi lịch hẹn đang ở trạng thái **`PENDING`** hoặc **`CONFIRMED`**.
   - Tuyệt đối cấm khi xe đã vào xưởng tiếp nhận (`CHECKED_IN`) hoặc kỹ thuật viên đang tiến hành sửa chữa (`IN_PROGRESS`), cũng như các trạng thái kết thúc (`COMPLETED`, `CANCELLED`, `NO_SHOW`, `EXPIRED`). Báo lỗi `409 Conflict`.

---

## 2. Tiêu chí Chấp nhận (Acceptance Criteria - AC)

### AC 1: Bổ sung `reason` vào API Reschedule
- [ ] `RescheduleAppointmentDto` có trường `reason?: string` (kèm decorator `@IsOptional()`, `@IsString()`, `@Trim()`, `@ApiPropertyOptional`).
- [ ] Swagger UI hiển thị rõ ràng trường `reason`.
- [ ] UseCase `RescheduleAppointmentUseCase` lưu `reason` vào ghi chú hoặc metadata sự kiện `appointment_events`.

### AC 2: Cô lập Dữ liệu Đại lý (Dealership Boundary Isolation)
- [ ] `StaffAppointmentsController` tra cứu thông tin `StaffMember` từ `actorSub` qua `StaffRepository.findByIdentitySubject(...)`.
- [ ] Trích xuất `dealershipId` của nhân viên và gán vào `ActorContext`.
- [ ] Toàn bộ các Use Case nhân viên (`TransitionAppointmentStatusUseCase`, `ReassignAppointmentUseCase`, `RescheduleAppointmentUseCase`, `SwapAppointmentsUseCase`) kiểm tra:
  ```typescript
  if (actor.actorType === 'staff' && String(appointment.dealershipId) !== String(actor.dealershipId)) {
    throw new ForbiddenDomainException('Staff member cannot modify appointments belonging to another dealership');
  }
  ```
- [ ] Với `SwapAppointmentsUseCase`, bắt buộc cả 2 lịch hẹn phải thuộc chính đại lý của nhân viên (`apptA.dealershipId === apptB.dealershipId === actor.dealershipId`). Nếu vi phạm quăng `403 Forbidden`.

### AC 3: Chặn thao tác trong Quá khứ (Past Appointment Guardrail)
- [ ] Trong `ReassignAppointmentUseCase`: Nếu `new Date(appointment.startAt) <= new Date()`, quăng `DomainException(ErrorCode.VALIDATION_FAILED, 'Cannot modify an appointment that is already in the past', null, 400)`.
- [ ] Trong `RescheduleAppointmentUseCase`:
  - Nếu `new Date(appointment.startAt) <= new Date()`, quăng lỗi `400`.
  - Nếu `dto.startAt` có giá trị và `new Date(dto.startAt) <= new Date()`, quăng `DomainException(ErrorCode.VALIDATION_FAILED, 'New appointment start time cannot be in the past', null, 400)`.
- [ ] Trong `SwapAppointmentsUseCase`: Nếu `new Date(apptA.startAt) <= new Date()` hoặc `new Date(apptB.startAt) <= new Date()`, quăng lỗi `400`.

### AC 4: Ràng buộc Trạng thái nghiêm ngặt (`PENDING` | `CONFIRMED`)
- [ ] Trong `ReassignAppointmentUseCase`: Thay thế kiểm tra `ACTIVE_STATUSES` bằng:
  ```typescript
  const MODIFIABLE_STATUSES = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];
  if (!MODIFIABLE_STATUSES.includes(appointment.status)) {
    throw new InvalidStateTransitionException(
      `Cannot reassign appointment in ${appointment.status} status. Only PENDING or CONFIRMED appointments can be modified.`
    );
  }
  ```
- [ ] Trong `RescheduleAppointmentUseCase`: Bắt buộc `appointment.status` phải là `PENDING` hoặc `CONFIRMED`. Nếu là `CHECKED_IN`, `IN_PROGRESS`... quăng `409 Conflict`.
- [ ] Trong `SwapAppointmentsUseCase`: Cả 2 lịch hẹn `apptA` và `apptB` đều phải ở trạng thái `PENDING` hoặc `CONFIRMED`.

---

## 3. Thiết kế Kỹ thuật (Technical Design & Code Mapping)

### 3.1. Files Cần Sửa Đổi:
1. `libs/workshop/src/appointment/dto/reschedule-appointment.dto.ts`
   - Bổ sung property `reason?: string`.
2. `apps/scheduler-api/src/appointments/staff-appointments.controller.ts`
   - Inject `StaffRepository` (hoặc `StaffService`).
   - Cập nhật hàm `getActorContext()` để async load `StaffMember` từ `actorSub` và trả về `dealershipId`.
3. `libs/workshop/src/appointment/types/actor-context.interface.ts`
   - Đảm bảo `ActorContext` có trường `dealershipId?: string`.
4. `libs/workshop/src/appointment/usecases/transition-appointment-status.usecase.ts`
   - Kiểm tra `appointment.dealershipId === actor.dealershipId`.
5. `libs/workshop/src/appointment/usecases/reassign-appointment.usecase.ts`
   - Kiểm tra `dealershipId`, quá khứ (`startAt <= now()`), và status $\in$ `[PENDING, CONFIRMED]`.
6. `libs/workshop/src/appointment/usecases/reschedule-appointment.usecase.ts`
   - Kiểm tra `dealershipId`, quá khứ (cả slot cũ và slot mới), status $\in$ `[PENDING, CONFIRMED]`, và map `reason`.
7. `libs/workshop/src/appointment/usecases/swap-appointments.usecase.ts`
   - Kiểm tra `dealershipId` của cả 2 lịch với `actor.dealershipId`, kiểm tra quá khứ, và status $\in$ `[PENDING, CONFIRMED]`.

---

## 4. Kế hoạch Kiểm thử QA (Quinn Test Matrix)

| Test Case ID | Tên Kịch Bản | Dữ Liệu Input | Kỳ Vọng (Expected Result) |
| :--- | :--- | :--- | :--- |
| **TC_SEC_01** | Cross-dealership approve | Staff DLR 2 gọi approve APT 3 (DLR 1) | **403 Forbidden** |
| **TC_SEC_02** | Cross-dealership reassign | Staff DLR 2 gọi reassign APT 3 (DLR 1) | **403 Forbidden** |
| **TC_SEC_03** | Cross-dealership reschedule | Staff DLR 2 gọi reschedule APT 3 (DLR 1) | **403 Forbidden** |
| **TC_SEC_04** | Cross-dealership swap | Staff DLR 2 gọi swap APT 3 và APT 4 (DLR 1) | **403 Forbidden** |
| **TC_TIME_01** | Modify past appointment | Reassign / Reschedule APT 7 (`2026-11-01` in past) | **400 Bad Request** (`Cannot modify past appointment`) |
| **TC_TIME_02** | Reschedule to past | Reschedule APT 3 với `start_at` là hôm qua | **400 Bad Request** (`New start time cannot be in past`) |
| **TC_STAT_01** | Reassign CHECKED_IN | Reassign APT 5 (`CHECKED_IN`) | **409 Conflict** (`Only PENDING or CONFIRMED`) |
| **TC_STAT_02** | Reschedule IN_PROGRESS | Reschedule APT 6 (`IN_PROGRESS`) | **409 Conflict** (`Only PENDING or CONFIRMED`) |
| **TC_STAT_03** | Swap CHECKED_IN with CONFIRMED | Swap APT 3 (`CONFIRMED`) với APT 5 (`CHECKED_IN`) | **409 Conflict** |
| **TC_REASON_01** | Reschedule with reason | `{"start_at": "...", "reason": "Khách xin đổi ca sớm"}` | **200 OK**, reason lưu vào `appointment_events` |

---

## 5. Định nghĩa Hoàn thành (Definition of Done - DoD)
- [ ] Toàn bộ 4 tiêu chí chấp nhận (AC 1 $\to$ AC 4) được cài đặt đầy đủ.
- [ ] Không có breaking change trên các API hiện có.
- [ ] Unit tests và integration tests pass 100%.
- [ ] Postman Collection và Test Cases Excel được cập nhật bổ sung các case trên.
