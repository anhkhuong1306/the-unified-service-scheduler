# KỊCH BẢN QUAY VIDEO THUYẾT TRÌNH (VIDEO SUBMISSION SCRIPT)
## Keyloop Technical Assessment — Scenario A: The Unified Service Scheduler

> 📌 **Thông tin chung:**
> - **Thời lượng chuẩn:** 7 – 8 phút (nằm trọn trong giới hạn 5 – 10 phút của đề bài).
> - **Ứng viên:** Senior Backend Engineer.
> - **Đề tài:** Scenario A — The Unified Service Scheduler (Domain: Ownership).
> - **Công cụ ghi hình khuyên dùng:** Loom hoặc OBS Studio (bật camera góc màn hình, độ phân giải 1080p).
> - **Nguyên tắc ghi hình:** Nói chuyện tự nhiên, gần gũi như đang trao đổi kỹ thuật với đồng nghiệp; quay màn hình thực tế (Markdown tài liệu có sơ đồ Mermaid + IDE Code + Terminal + Swagger + Live Board SSE).

---

## 📋 CHECKLIST CHUẨN BỊ 5 PHÚT TRƯỚC KHI BẤM NÚT QUAY

- [ ] **1. Môi trường ứng dụng:** Khởi động Docker Compose: `cd source && docker compose up -d`. Đảm bảo Postgres 18 và NestJS App đều đang `healthy`.
- [ ] **2. Tab trình duyệt 1:** Mở file [`SYSTEM_DESIGN.md`](../SYSTEM_DESIGN.md) (chế độ Markdown Preview hiển thị sơ đồ Mermaid đẹp mắt).
- [ ] **3. Tab trình duyệt 2:** Mở file [`docs/GENAI_DESIGN_COLLABORATION.md`](./GENAI_DESIGN_COLLABORATION.md) (hoặc Mục 7 file `README.md`).
- [ ] **4. Tab trình duyệt 3:** Mở Swagger UI tại `http://localhost:3000/api-docs`.
- [ ] **5. Tab trình duyệt 4:** Mở màn hình Live Board thời gian thực tại `http://localhost:3000/demo`.
- [ ] **6. Cửa sổ Terminal:** Mở sẵn trong thư mục `source`, gõ sẵn lệnh `npm run test:unit` (chưa bấm Enter).
- [ ] **7. Cửa sổ Postman:** Mở sẵn collection `Core_Basic_Business_Logic.postman_collection.json`.
- [ ] **8. Không gian & Thiết bị:** Đeo tai nghe có mic để lọc âm; tắt toàn bộ ứng dụng chat (Zalo, Slack, Telegram) để tránh pop-up.

---

## ⏱️ BẢNG PHÂN BỔ THỜI LƯỢNG (TIMELINE CHI TIẾT)

| Phân đoạn | Thời lượng | Thao tác màn hình chính | Nội dung trọng tâm |
| :--- | :--- | :--- | :--- |
| **Phần 1** | **0:00 – 1:00** (1') | Webcam + Trang bìa `README.md` | Giới thiệu bản thân, vị trí, lý do chọn Scenario A |
| **Phần 2** | **1:00 – 4:45** (3'45s) | Tab `SYSTEM_DESIGN.md` | **Đi qua 7 mục của System Design (giải thích dễ hiểu)** |
| **Phần 3** | **4:45 – 6:00** (1'15s) | Tab `GENAI_DESIGN_COLLABORATION.md` | Cách làm việc với AI (Human-in-the-loop) |
| **Phần 4** | **6:00 – 7:30** (1'30s) | Terminal + Swagger + Tab `/demo` | Live Demo (Chạy test, gọi API, SSE Board, chặn trùng lịch) |
| **Phần 5** | **7:30 – 8:30** (1') | Webcam trực diện + Code GiST | Khó khăn thực tế, bài học rút ra & Lời cảm ơn |

---

# 🎙️ KỊCH BẢN LỜI THOẠI CHI TIẾT (NGÔN NGỮ TỰ NHIÊN, DỄ HIỂU)

---

### PHẦN 1: GIỚI THIỆU BẢN THÂN & BÀI TOÁN (0:00 – 1:00)
* **Thao tác màn hình:** Bật webcam góc màn hình, hiển thị trang đầu của file `README.md`.
* **Lời thoại:**
> *"Xin chào đội ngũ kỹ thuật và tuyển dụng của Keyloop! Mình là [Họ và Tên của bạn]. Hôm nay mình rất vui được chia sẻ về bài làm của mình trong đợt Keyloop Technical Assessment này.
>
> Trong 4 đề bài, mình chọn **Scenario A: The Unified Service Scheduler** — xây dựng hệ thống đặt lịch bảo dưỡng xe cho đại lý ô tô, thay thế cho cách ghi chép và xếp lịch thủ công.
>
> Điểm thú vị của việc đặt lịch sửa xe là không phải cứ chọn giờ trống là xong, mà nó phụ thuộc vào **2 điều kiện cùng lúc**: lúc khách mang xe đến, xưởng phải vừa còn **Khoang sửa xe (Service Bay)** trống, lại vừa phải có **Kỹ thuật viên (Technician)** có đúng tay nghề đang rảnh trong suốt khoảng thời gian làm dịch vụ đó.
>
> Ngay sau đây, mình xin đi vào phần Thiết kế hệ thống và cách mình giải quyết bài toán này."*

---

### PHẦN 2: SYSTEM DESIGN & IMPLEMENTATION HIGHLIGHTS (1:00 – 4:45)
*(Thao tác màn hình: Chuyển sang tab `SYSTEM_DESIGN.md`, vừa nói vừa cuộn chuột qua từng mục từ 1 đến 7).*

---

#### 📍 Mục 1: Bài toán & Phạm vi (Problem Statement & Scope)
* **Thao tác:** Cuộn tới bảng `Actors` và danh sách ưu tiên trong Mục 1.
* **Lời thoại:**
> *"Đầu tiên ở **Mục 1 — Bài toán và Phạm vi**: Hệ thống của mình xoay quanh 3 nhóm chính:
> 1. **Khách hàng (Customer):** Đăng nhập, xem xe của mình, tìm giờ trống theo thời gian thực, có thể tự chọn thợ quen rồi đặt, sửa hoặc hủy lịch.
> 2. **Nhân viên xưởng (Staff):** Xem lịch của cả đại lý, duyệt lịch, hỗ trợ khách đến sớm, đổi thợ hoặc đổi ca giữa các xe.
> 3. **Hệ thống chạy ngầm (Worker):** Tự động hủy các lịch chờ duyệt nếu đã sát giờ hẹn mà chưa được xử lý, để trả lại khoang và thợ cho khách khác.
>
> Tất cả các yêu cầu cốt lõi của đề bài đều đã được mình hoàn thiện đầy đủ."*

---

#### 📍 Mục 2: Giả định & Quy tắc chia giờ (Assumptions & Invariants)
* **Thao tác:** Cuộn tới Mục 2.3 và 2.4 (Quy tắc lưới slot và 3 nguyên tắc).
* **Lời thoại:**
> *"Sang **Mục 2 — Các giả định và quy tắc chia lịch**:
> - Mỗi đại lý có sẵn 10 khoang và 10 thợ. Một khách có thể đặt làm nhiều dịch vụ cùng lúc, và người thợ được xếp bắt buộc phải có đủ kỹ năng để làm hết các dịch vụ đó.
> - **Cách mình tối ưu để lịch không bị vụn:** Giữa mỗi xe luôn cần 15 phút dọn khoang (`buffer`). Để lịch làm việc khớp đẹp vào từng ô 30 phút và không bị dư ra những khoảng thời gian chết 15 phút lẻ tẻ, mình thiết kế các gói dịch vụ sao cho **thời gian sửa cộng với 15 phút dọn khoang luôn tròn bội số của 30 phút** (ví dụ: Thay dầu 45 phút + 15 phút dọn khoang là vừa tròn 60 phút).
> - Và hệ thống luôn giữ 3 nguyên tắc cứng: 1 khoang chỉ nhận 1 xe, 1 thợ chỉ sửa 1 xe tại một thời điểm, và 1 xe không thể đặt 2 lịch trùng giờ nhau."*

---

#### 📍 Mục 3 & 4: Tại sao chọn Node.js + NestJS Monorepo (thay vì PHP hay Microservices)?
* **Thao tác:** Dừng ở cây thư mục `apps/`, `libs/` (Mục 3) và sơ đồ kiến trúc (Mục 4).
* **Lời thoại:**
> *"Ở **Mục 3 và Mục 4 — Công nghệ và Kiến trúc hệ thống**, mình chọn nền tảng **Node.js + NestJS (TypeScript)** và tổ chức theo mô hình **Monorepo** (`apps/` và `libs/`).
>
> ❓ **Câu hỏi đầu tiên: Tại sao mình lại chọn Node.js + NestJS mà không chọn PHP?**
> - **Thứ nhất là tối ưu tài nguyên khi xử lý đồng thời (Concurrency) và chịu tải lớn:** Với PHP truyền thống (PHP-FPM), mỗi khi có 1 người dùng gửi request vào, server phải tạo một tiến trình (worker) riêng và nạp lại từ đầu bộ nhớ. Nếu có hàng ngàn người cùng vào xem giờ và đặt lịch một lúc, PHP sẽ tốn rất nhiều RAM và CPU. Ngược lại, **Node.js** chạy trên 1 tiến trình duy nhất với cơ chế **Event-Loop bất đồng bộ (Non-blocking I/O)**: toàn bộ ứng dụng và **Database Connection Pool** chỉ khởi tạo đúng 1 lần trong RAM; trong lúc chờ Database kiểm tra khóa hay trả dữ liệu, Node.js không hề đứng đợi chết mà quay sang xử lý ngay cho hàng ngàn request khác. Nhờ vậy, Node.js tiết kiệm RAM và CPU hơn hẳn khi gặp tải đột biến.
> - **Thứ hai là giữ kết nối Real-time cực nhẹ:** Hệ thống của mình có bảng theo dõi lịch trực tiếp qua **Server-Sent Events (SSE)** và lắng nghe sự kiện **`LISTEN/NOTIFY`** từ PostgreSQL. Node.js giữ hàng ngàn kết nối mở liên tục rất nhẹ nhàng, không làm nghẽn worker như mô hình chạy xong rồi tắt của PHP.
> - **Thứ ba là an toàn kiểu dữ liệu:** Kết hợp **NestJS và TypeScript** giúp mình kiểm soát lỗi kiểu dữ liệu ngay từ lúc viết code, rất phù hợp cho bài toán nhiều quy tắc nghiệp vụ của đại lý ô tô.
>
> ❓ **Câu hỏi thứ hai: Tại sao lại chọn cấu trúc NestJS Monorepo mà không làm Microservices ngay hay viết Monolith 1 cục bình thường?**
> - Nếu dựng **Microservices** ngay từ đầu cho bản MVP thì sẽ quá cồng kềnh, tốn công quản lý mạng không cần thiết; nhưng nếu viết **Monolith 1 cục** thì code rất dễ gọi chéo lung tung.
> - **NestJS Monorepo giúp lấy được ưu điểm của cả hai:**
>   + **Ở `apps/`:** Tách riêng `scheduler-api` (có thể nhân bản nhiều server để chịu tải) và `scheduler-worker` (chạy đúng 1 bản để quét lịch quá hạn, không bị chạy trùng).
>   + **Ở `libs/`:** Chia sẵn các module `workshop`, `crm`, `organization` và dùng ESLint chặn không cho gọi chéo nội bộ của nhau mà phải đi qua `@app/contracts`. Nhờ vậy hiện tại chạy rất gọn, mà tương lai muốn tách ra Microservices cũng cực kỳ nhanh."*

---

#### 📍 Mục 5: Thiết kế Database & Tại sao dùng Btree GiST (Data Model)
* **Thao tác:** Dừng lại ở sơ đồ ERD và đoạn khai báo `EXCLUDE USING gist` trong Mục 5.
* **Lời thoại:**
> *"Sang **Mục 5 — Thiết kế Database**: Mọi bảng chính đều có mã định danh `code` và lưu vết người tạo, người sửa rõ ràng.
>
> ❓ **Điểm quan trọng nhất ở phần này là: Tại sao mình lại chọn dùng `Btree GiST Exclude Constraint` của PostgreSQL để chống trùng lịch?**
> - **Thứ nhất:** Nếu mình chỉ kiểm tra trùng lịch bằng câu lệnh `SELECT` trong code, thì khi có 2 khách hàng cùng bấm đặt lịch vào đúng một giây trên 2 server khác nhau, cả 2 bên đều thấy khoang đang trống và cùng lưu vào database. Kết quả là bị **Double-Booking (2 xe đè lên nhau)**.
> - **Thứ hai:** Khóa `UNIQUE` bình thường của database chỉ chặn được khi 2 giá trị giống hệt nhau (ví dụ trùng đúng 8h00). Nó không thể phát hiện được **2 khoảng thời gian bị gối đầu lên nhau** (ví dụ một xe từ 8h00 đến 9h00, xe kia từ 8h30 đến 9h30).
> - **Giải pháp Btree GiST:** Tính năng `btree_gist` của PostgreSQL giúp mình kết hợp cả việc kiểm tra trùng ID (cùng khoang, cùng thợ, hoặc cùng xe) lẫn kiểm tra **hai khoảng thời gian có đè lên nhau hay không (`tstzrange`)**. 
> Nhờ có lớp khóa này ngay dưới đáy database, dù trên code hay mạng có xảy ra lỗi gì đi nữa, PostgreSQL cũng sẽ tự động chặn đứng việc xếp trùng lịch, đảm bảo dữ liệu chuẩn xác 100%."*

---

#### 📍 Mục 6: Vòng đời của một Lịch hẹn (Appointment Lifecycle)
* **Thao tác:** Mở biểu đồ `stateDiagram-v2` trong Mục 6.
* **Lời thoại:**
> *"Ở **Mục 6 — Vòng đời lịch hẹn**:
> - Mình dùng một State Machine để quản lý chặt chẽ các bước chuyển trạng thái của lịch hẹn: từ lúc Chờ duyệt (`PENDING`), Đã xác nhận (`CONFIRMED`), Khách đến xưởng (`CHECKED_IN`), Đang sửa (`IN_PROGRESS`) cho đến khi Hoàn tất (`COMPLETED`).
> - **Điểm đặc biệt:** Để hỗ trợ nhân viên xưởng đổi chéo ca làm việc giữa 2 xe (`Slot Swap`) mà không bị database báo lỗi đụng độ giờ của GiST, mình đã thêm một trạng thái trung gian ngắn là **`SWAPPING`**. Nhờ đó việc đổi chỗ 2 xe diễn ra mượt mà ngay trong một giao dịch."*

---

#### 📍 Mục 7: Luồng xử lý & Chống xung đột khi đặt lịch (Data Flows & Concurrency)
* **Thao tác:** Mở Sequence Diagram trong Mục 7.
* **Lời thoại:**
> *"Cuối cùng là **Mục 7 — Luồng dữ liệu khi tìm giờ và đặt lịch**:
> 1. **Khi khách tìm giờ trống (`availability`):** Thay vì chạy vòng lặp nhiều lần, mình chỉ dùng đúng 1 câu lệnh SQL kết hợp hàm `generate_series` để tính toán toàn bộ các khung giờ trống trong ngày chỉ trong vài mili-giây.
> 2. **Khi khách bấm đặt lịch (`POST /v1/appointments`):** Hệ thống đi qua 3 bước bảo vệ:
>    - Đầu tiên là kiểm tra `Idempotency-Key` để nếu khách sốt ruột bấm đúp 2 lần thì hệ thống cũng chỉ tạo 1 lịch duy nhất.
>    - Tiếp theo là dùng **khóa `Advisory Lock` theo thứ tự: khóa theo Khách hàng trước rồi mới khóa theo Đại lý sau**. Cách xếp hàng tuần tự này giúp kiểm soát giới hạn tối đa 3 lịch của khách và tránh hoàn toàn lỗi các tiến trình chờ nhau gây treo hệ thống (Deadlock).
>    - Cuối cùng, ngay khi lưu lịch thành công, PostgreSQL phát tín hiệu qua `LISTEN/NOTIFY` để đẩy thông tin mới lên màn hình theo dõi của xưởng ngay lập tức."*

---

### PHẦN 3: CÂU CHUYỆN LÀM VIỆC CÙNG AI (4:45 – 6:00)
* **Thao tác màn hình:** Chuyển sang Tab 2 — mở file `docs/GENAI_DESIGN_COLLABORATION.md` (hoặc Mục 7 file `source/README.md`).
* **Lời thoại:**
> *"Tiếp theo, mình xin chia sẻ ngắn gọn về cách mình kết hợp với AI để làm dự án này.
> 
> Nguyên tắc làm việc của mình rất rõ ràng: **Mình không bao giờ quăng cả đề bài cho AI tự làm từ đầu đến cuối**. Bởi vì nếu để AI tự chạy một mạch, code sinh ra sẽ rất dễ đi lệch kiến trúc, bỏ sót các trường hợp xung đột dữ liệu và bản thân mình cũng không kiểm soát được chất lượng.
>
> Thay vào đó, mình đóng vai trò là người thiết kế chính (sẽ ra lệnh, sẽ ra quyết định, kiểm tra, điều chỉnh) và kết hợp với đó mình sử dụng công cụ **Google Antigravity** kết hợp bộ khung **BMad** theo quy trình 5 bước có con người kiểm soát chặt chẽ:
> 1. **Thiết kế (Design):** Mình đọc kỹ đề bài, lên ý tưởng rồi cùng AI thảo luận, phản biện qua lại (mình có ghi lại chi tiết trong file `GENAI_DESIGN_COLLABORATION.md`) để chốt phương án tối ưu nhất.
> 2. **Chia nhỏ yêu cầu (Spec):** Trước khi code mỗi tính năng, mình yêu cầu AI viết rõ User Story và các điều kiện nghiệm thu trong thư mục `docs/stories/`, mình duyệt xong mới bắt đầu làm.
> 3. **Lập trình (Implement):** AI chỉ viết code trong phạm vi story đã chốt, và mình trực tiếp kiểm tra từng đoạn code thay đổi.
> 4. **Kiểm thử thực tế (Live QA):** Ngoài việc chạy test tự động, mình bật Docker lên, tự tay bắn request bằng Postman và cURL để kiểm tra database và bắt lỗi thực tế.
> 5. **Đúc kết (Compaction):** Cuối mỗi ngày, những lỗi phát sinh đều được ghi chú lại thành quy tắc để AI không lặp lại ở những phần sau."*

---

### PHẦN 4: LIVE DEMO ỨNG DỤNG THỰC TẾ (6:00 – 7:30)
* **Thao tác màn hình:** Chuyển đổi giữa Terminal, Swagger và Tab trình duyệt `/demo`.

#### 1. Chạy Automated Tests (15 giây):
* **Thao tác:** Mở Terminal, bấm Enter chạy lệnh `npm run test:unit`.
* **Lời thoại:** *"Bây giờ mình xin demo trực tiếp hệ thống. Đầu tiên là chạy 20 bộ unit test kiểm tra toàn bộ logic nghiệp vụ cốt lõi: từ tính toán slot, kiểm tra kỹ năng thợ cho đến State Machine. Tất cả đều pass 100%."*

#### 2. Demo Swagger & Cấu trúc Response chuẩn (20 giây):
* **Thao tác:** Mở Tab Swagger UI `http://localhost:3000/api-docs`, bấm `POST /v1/customer/appointments`.
* **Lời thoại:** *"Đây là trang tài liệu API Swagger. Mọi dữ liệu trả về đều đi theo một khung JSON thống nhất có kèm `correlation_id` để dễ dàng truy vết log khi cần debug."*

#### 3. Demo Bảng theo dõi Real-Time SSE (30 giây):
* **Thao tác:** Chuyển sang Tab `http://localhost:3000/demo`. Sang Postman bấm Send tạo một lịch hẹn mới. Quay lại màn hình demo, lịch mới nhảy lên ngay lập tức.
* **Lời thoại:** *"Còn đây là màn hình Live Board theo dõi lịch hẹn theo thời gian thực. Khi mình bấm đặt một lịch hẹn mới bên Postman, ngay khi database vừa lưu xong, lịch hẹn sẽ tự động nhảy lên màn hình của cả Khách hàng lẫn Nhân viên xưởng ngay lập tức thông qua Server-Sent Events mà không cần tải lại trang."*

#### 4. Demo Chặn trùng lịch (25 giây):
* **Thao tác:** Trong Postman, gửi tiếp một request đặt trùng khung giờ và thợ vừa rồi.
* **Lời thoại:** *"Và nếu mình cố tình gửi thêm một yêu cầu đặt trùng vào khung giờ của người thợ vừa rồi, hệ thống sẽ chặn lại ngay và trả về lỗi `409 Conflict — SLOT_UNAVAILABLE` rất rõ ràng, đảm bảo không bao giờ bị xếp chồng lịch."*

---

### PHẦN 5: BÀI HỌC, THÁCH THỨC & KẾT LUẬN (7:30 – 8:30)
* **Thao tác màn hình:** Quay trở lại webcam toàn màn hình (hoặc mở lướt qua đoạn code xử lý khóa `pg_advisory_xact_lock` trong repo).
* **Lời thoại:**
> *"Nhìn lại cả quá trình làm bài test, mình thấy **thách thức lớn nhất và cũng là bài học thực tế nhất** nằm ở chỗ: **Làm sao vừa giải quyết được mớ business logic phức tạp, lại vừa đảm bảo không bao giờ bị trùng lịch khi có nhiều người đặt cùng lúc.**
>
> Ban đầu nhìn đề bài thì thấy việc đặt lịch khá quen thuộc. Nhưng khi bắt tay vào làm thực tế cho xưởng dịch vụ ô tô thì mới thấy các quy tắc nghiệp vụ rất dễ bị chồng chéo:
> - Một xe có thể làm nhiều dịch vụ liên tục, và kỹ thuật viên được chọn bắt buộc phải có **đủ tất cả các kỹ năng** tương ứng;
> - **Làm sao để lịch làm việc không bị phân mảnh và tận dụng được tối đa thời gian của xưởng** giữa thời lượng sửa chữa và 15 phút dọn khoang;
> - Rồi đến những tình huống thực tế như khách mang xe đến sớm muốn đẩy giờ lên, đổi thợ khác, hoặc nhân viên cần đổi chéo ca giữa 2 khách hàng.
>
> **Nhưng điểm hóc búa nhất là lúc xử lý nhiều người đặt cùng một thời điểm:**
> - Nếu chỉ dùng câu lệnh kiểm tra thông thường trên code, khi có nhiều khách cùng bấm đặt lịch vào đúng một giây, hệ thống rất dễ bị xung đột dữ liệu dẫn đến **hai xe bị xếp trùng một khoang hoặc trùng một thợ**.
> - Để xử lý triệt để, mình dùng tính năng **`EXCLUDE USING gist` của PostgreSQL** để chặn trùng lịch ngay từ tầng database. Nhưng cơ chế này lại rất khắt khe: khi nhân viên muốn hoán đổi ca cho nhau hoặc dời lịch khách đến sớm, chỉ cần các khung giờ tạm thời chạm nhau một chút là database sẽ báo lỗi ngay lập tức.
>
> **Cách mình giải quyết vấn đề này là chia việc bảo vệ thành nhiều lớp:**
> - Ở tầng ứng dụng, mình dùng cơ chế **khóa phân cấp (Advisory Lock)** để xếp hàng xử lý lần lượt theo từng khách hàng và từng đại lý, tránh việc các giao dịch tự khóa lẫn nhau gây treo hệ thống (Deadlock);
> - Với trường hợp đổi ca, mình tạo ra một trạng thái trung gian ngắn là **`SWAPPING`** để việc hoán đổi diễn ra an toàn mà không vi phạm quy tắc của database;
> - Còn ràng buộc **GiST** ở tầng dưới cùng đóng vai trò như chiếc lưới bảo hiểm cuối cùng, đảm bảo dữ liệu trong database luôn sạch 100%.
>
> **Bài học rút ra của mình là:** Với những bài toán nghiệp vụ phức tạp và dễ xung đột dữ liệu thế này, mình không thể phó mặc hoàn toàn cho AI được. AI hỗ trợ viết code rất nhanh, nhưng chính mình phải là người nắm chắc logic, chủ động thiết kế cơ chế khóa và tự tay kiểm thử trên môi trường thực tế thì hệ thống mới chạy mượt mà và ổn định được.
>
> Toàn bộ tài liệu thiết kế, mã nguồn, 20 bộ test và kịch bản Postman mình đều đã chuẩn bị sẵn trong repo. Rất cảm ơn đội ngũ Keyloop đã dành thời gian theo dõi, và mình rất mong sớm có dịp trao đổi thêm cùng mọi người trong buổi phỏng vấn tiếp theo. Xin cảm ơn!"*

---

## 🎯 CÁC MẸO NHỎ KHI GHI HÌNH
1. **Giữ giọng nói tự nhiên:** Hãy tưởng tượng anh đang ngồi cạnh một đồng nghiệp và kể lại cách anh đã xây dựng hệ thống này — không cần đọc thuộc lòng từng chữ, chỉ cần nắm ý chính.
2. **Thao tác chuột:** Khi nhắc đến mục nào thì cuộn màn hình đến sơ đồ của mục đó để người xem vừa nghe vừa nhìn thấy hình minh họa.
3. **Nếu lỡ nói vấp:** Cứ bình tĩnh dừng lại 1–2 giây rồi nói lại câu đó, sau khi quay xong có thể cắt đoạn vấp đi rất nhanh.
