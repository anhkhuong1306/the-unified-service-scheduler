# Báo Cáo Nghiệp Vụ & Kiểm Thử — Advanced Scheduling & Lifecycle Operations (Ngày 5)

- **Nhánh Git:** `feature/day-5-advanced-scheduling-and-lifecycle`
- **Bộ Kiểm Thử:** Postman Collection v2 (`docs/Unified_Service_Scheduler_v2.postman_collection.json`)
- **Tác giả:** Winston (Architect), Amelia (Senior Dev), Quinn (QA)

---

## 1. Danh Sách Endpoint Mới Triển Khai

| STT | Phương thức | Đường dẫn API | Actor | Mục đích Nghiệp vụ |
| :---: | :---: | :--- | :--- | :--- |
| 1 | `PATCH` | `/v1/appointments/:id` | Customer | Cập nhật ghi chú, đổi giờ, đổi xe hoặc thợ kèm khóa lạc quan `version` / `If-Match` |
| 2 | `GET` | `/v1/appointments/stream` | Customer | Lắng nghe Server-Sent Events (SSE) theo thời gian thực cho lịch hẹn của bản thân |
| 3 | `POST` | `/v1/staff/appointments/:id/approve` | Staff | Duyệt lịch hẹn từ trạng thái `PENDING` sang `CONFIRMED` |
| 4 | `POST` | `/v1/staff/appointments/:id/reject` | Staff | Từ chối lịch hẹn từ trạng thái `PENDING` sang `REJECTED` |
| 5 | `POST` | `/v1/staff/appointments/:id/check-in` | Staff | Tiếp nhận xe khách hàng tại xưởng, chuyển `CONFIRMED` sang `CHECKED_IN` |
| 6 | `POST` | `/v1/staff/appointments/:id/start` | Staff / Tech | Bắt đầu bảo dưỡng, chuyển `CHECKED_IN` sang `IN_PROGRESS` |
| 7 | `POST` | `/v1/staff/appointments/:id/complete` | Staff / Tech | Hoàn thành dịch vụ, chuyển `IN_PROGRESS` sang `COMPLETED`, giải phóng Khoang |
| 8 | `POST` | `/v1/staff/appointments/:id/no-show` | Staff | Đánh dấu khách vắng mặt sau 15 phút grace period, chuyển sang `NO_SHOW` |
| 9 | `POST` | `/v1/staff/appointments/:id/reassign` | Staff | Điều phối lại thợ hoặc khoang bảo dưỡng (kiểm tra đầy đủ kỹ năng & slot trống) |
| 10 | `POST` | `/v1/staff/appointments/:id/reschedule`| Staff | Dời giờ sớm cho khách đến sớm (Early Arrival), miễn trừ ràng buộc Lead Time |
| 11 | `POST` | `/v1/staff/appointments/swap` | Staff | Hoán đổi nguyên tử 2 lịch hẹn (chặn chênh lệch thời lượng gây overlap - Chỉ đạo Boss) |
| 12 | `GET` | `/v1/staff/appointments/stream` | Staff | Lắng nghe Server-Sent Events (SSE) toàn xưởng hoặc theo Kỹ thuật viên |

---

## 2. Các Kịch Bản Kiểm Thử Trọng Điểm & Lệnh cURL

### 2.1. [TC_APT_016] Khách hàng Cập nhật Lịch hẹn & Khóa Lạc quan
```bash
curl -X PATCH http://localhost:3000/v1/appointments/{id} \
  -H "Content-Type: application/json" \
  -H "x-user-sub: a1111111-1111-1111-1111-111111111111" \
  -H "x-actor-type: customer" \
  -H "If-Match: \"1\"" \
  -d '{
    "notes": "Kiểm tra thêm lọc gió điều hòa",
    "version": 1
  }'
```
* **Kỳ vọng:** `200 OK`, `version: 2`, `notes` được cập nhật, phát sự kiện `APPOINTMENT_UPDATED`.

---

### 2.2. [TC_STAFF_008] Tiếp nhận Khách đến sớm & Đổi giờ (Bypass Lead-Time)
```bash
curl -X POST http://localhost:3000/v1/staff/appointments/{id}/reschedule \
  -H "Content-Type: application/json" \
  -H "x-user-sub: staff-001" \
  -H "x-actor-type: staff" \
  -d '{
    "newStartAt": "2026-11-01T01:00:00.000Z",
    "notes": "Khách hàng mang xe đến sớm 30 phút"
  }'
```
* **Kỳ vọng:** `200 OK`, hệ thống bỏ qua kiểm tra lead time tối thiểu, xác thực khoang & thợ rảnh, cập nhật giờ mới thành công.

---

### 2.3. [TC_STAFF_010] Từ chối Swap khi Chênh lệch Thời lượng Gây Overlap (Boss Invariant)
```bash
curl -X POST http://localhost:3000/v1/staff/appointments/swap \
  -H "Content-Type: application/json" \
  -H "x-user-sub: staff-001" \
  -H "x-actor-type: staff" \
  -d '{
    "appointmentIdA": "{appt_1h_duration_id}",
    "appointmentIdB": "{appt_2h_duration_id}"
  }'
```
* **Kỳ vọng:** `409 Conflict`, message: `"Cannot swap appointments: Duration mismatch causes slot overlap between the two appointments"`, không cascade đẩy lùi lịch hẹn của người khác, DB giữ nguyên trạng thái.

---

### 2.4. [TC_SSE_001] & [TC_SSE_002] Server-Sent Events (SSE) Real-Time Stream
```bash
curl -N -H "Accept: text/event-stream" \
  -H "x-user-sub: a1111111-1111-1111-1111-111111111111" \
  -H "x-actor-type: customer" \
  http://localhost:3000/v1/appointments/stream
```
* **Kỳ vọng:** Nhận event `ping` giữ kết nối mỗi 15s và nhận ngay event `{ eventType: "APPOINTMENT_CREATED" | "APPOINTMENT_UPDATED" | "APPOINTMENT_STATUS_CHANGED" }` ngay khi có thay đổi liên quan đến lịch hẹn của khách hàng.
