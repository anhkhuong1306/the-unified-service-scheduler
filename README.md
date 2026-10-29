# The Unified Service Scheduler — Backend (Scenario A)

> Hệ thống backend đặt lịch bảo dưỡng xe thông minh theo chuẩn phân hệ **DMS (Dealer Management System)**, xây dựng trên nền tảng **NestJS Monorepo (`apps/` + `libs/`)**, **Node.js 22+ LTS**, **TypeScript 5+**, **TypeORM** và **PostgreSQL 18** (`btree_gist` Exclusion Constraints & Advisory Locks).

---

## 1. Tổng quan Kiến trúc (Architecture Overview)

Dự án được tổ chức theo mô hình **Modular Monolith** chuẩn hóa bằng **NestJS Monorepo**, tách bạch rõ ràng giữa **đơn vị triển khai vật lý (`apps/`)** và **các miền nghiệp vụ domain (`libs/`)**:

```text
source/
├── apps/
│   ├── scheduler-api/          # REST API Server chính (stateless, scale ngang N pods)
│   └── scheduler-worker/       # Background Cronjob Worker (single replica, expiry job)
└── libs/
    ├── common/                 # (@app/common) ALS Request Context, Pino Logger, @LogSpan(), Envelope, Filters
    ├── contracts/              # (@app/contracts) Public DI tokens, DTOs & Cross-module Contracts
    ├── workshop/               # (@app/workshop) Domain cốt lõi: Settings, Service Catalog, Resource, Booking
    ├── crm/                    # (@app/crm) Quản lý vòng đời Khách hàng (Customer) & Phương tiện (Vehicle)
    ├── organization/           # (@app/organization) Danh mục Đại lý (Dealership), Chi nhánh & Nhân sự (Staff)
    └── sso-mock/               # (@app/sso-mock) Minimal Mock OIDC Provider (RS256 JWT qua jose)
```

### Các Điểm Nhấn Kỹ Thuật Chính:
1. **Concurrency & Bảo vệ Toàn vẹn Dữ liệu:**
   - Cấp phát tài nguyên tuần tự hóa bằng **`SELECT pg_advisory_xact_lock(NS_BOOKING, dealership_id)`** trong một `EntityManager` transaction duy nhất.
   - Chặn đứng 100% rủi ro double-booking ở tầng database bằng 3 ràng buộc **`EXCLUDE USING gist`** (`no_bay_overlap`, `no_technician_overlap`, `no_vehicle_overlap`) trên `tstzrange(start_at, occupied_until, '[)')`.
2. **Quy tắc Đặt Lịch Chuẩn Hóa Lưới Slot (Slot-Grid Alignment):**
   - Loại bỏ hoàn toàn thời gian chết (zero slot fragmentation) trên lưới 30 phút: `(duration_minutes + buffer_minutes) % slot_minutes == 0`.
3. **Observability & Masking Dữ liệu Nhạy Cảm:**
   - Sử dụng **`AsyncLocalStorage` (`node:async_hooks`)** tự động truyền `correlation_id` vào mọi dòng log của **Pino**.
   - Bộ lọc `SensitiveDataMasker` tự động che `password`, `token`, `email`, `phone`, `vin` (giữ 4 ký tự cuối), và `customer_name`.
   - Decorator **`@LogSpan()`** tự động đo thời gian và ghi span log cho UseCases/Services.
4. **Kiểm soát Ranh giới Module:**
   - Ép buộc bằng **`eslint-plugin-boundaries`**: `@app/workshop` chỉ được giao tiếp qua `@app/contracts` và `@app/common`, cấm import trực tiếp code nội bộ của `@app/crm` hoặc `@app/organization`.

---

## 2. Yêu cầu Môi trường (Prerequisites)

- **Docker** & **Docker Compose** (phiên bản hỗ trợ Compose v2)
- Hoặc cài đặt trực tiếp trên máy local:
  - **Node.js:** `>= 22.0.0 LTS`
  - **npm:** `>= 10.0.0`
  - **PostgreSQL:** `>= 18.0` (cần cài đặt extension `btree_gist`)

---

## 3. Khởi chạy Nhanh với Docker Compose (Quick Start)

### Bước 1: Chuẩn bị file cấu hình môi trường
Tạo file `.env` từ file mẫu `.env.example`:
```bash
cp .env.example .env
```

### Bước 2: Khởi động hệ thống
Khởi chạy toàn bộ cụm dịch vụ bao gồm PostgreSQL 18, `scheduler-api` và `scheduler-worker`:
```bash
docker compose up -d
```

### Bước 3: Kiểm tra trạng thái hoạt động
- **API Health Check (Liveness):**
  ```bash
  curl http://localhost:3000/health/live
  ```
- **Database & Services Readiness:**
  ```bash
  curl http://localhost:3000/health/ready
  ```
- **Tài liệu Swagger / OpenAPI UI:**  
  Truy cập qua trình duyệt: [http://localhost:3000/docs/api](http://localhost:3000/docs/api)

---

## 4. Các Lệnh Thao tác trong Dự án (CLI Commands)

| Lệnh | Chức năng |
| :--- | :--- |
| `npm run start:dev` | Khởi chạy `scheduler-api` ở chế độ watch (hot-reload) |
| `npm run start:worker:dev` | Khởi chạy `scheduler-worker` ở chế độ watch |
| `npm run build` | Biên dịch TypeScript toàn bộ applications và libraries ra thư mục `dist/` |
| `npm run lint` | Kiểm tra cú pháp và ranh giới module bằng ESLint (`eslint-plugin-boundaries`) |
| `npm run test` | Chạy toàn bộ test suites bằng Jest |
| `npm run test:unit` | Chạy unit tests cho các thư viện domain trong `libs/` |
| `npm run test:e2e` | Chạy integration / e2e tests cho API |
| `npm run test:concurrency` | Chạy bộ kiểm thử concurrency đa kết nối đồng thời |
| `npm run sso:keys` | Tạo cặp khóa RSA phục vụ Mock OIDC Provider |
| `npm run sso:issue-token -- <email>` | Sinh token JWT RS256 có sẵn để bypass login khi kiểm thử |

---

## 5. Cấu trúc Response Envelope Chuẩn

Mọi phản hồi từ hệ thống đều tuân thủ cấu trúc envelope thống nhất:

```json
{
  "statusCode": 200,
  "errorCode": null,
  "data": {},
  "message": "OK",
  "meta": {
    "correlation_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
  }
}
```

Trường hợp xảy ra lỗi nghiệp vụ (ví dụ: `409 Conflict`):
```json
{
  "statusCode": 409,
  "errorCode": "SLOT_UNAVAILABLE",
  "data": {
    "reason": "NO_QUALIFIED_TECHNICIAN",
    "alternatives": []
  },
  "message": "Dealership is fully booked for the requested period",
  "meta": {
    "correlation_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
  }
}
```

---

## 6. Tài liệu Thiết kế Chi tiết
- [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) (Bản tiếng Anh chuẩn kiến trúc v4)
- [SYSTEM_DESIGN_VI.md](./SYSTEM_DESIGN_VI.md) (Bản diễn giải tiếng Việt chi tiết)
