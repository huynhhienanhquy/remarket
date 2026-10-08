# Đối chiếu Admin với detail-project

Nguồn yêu cầu: mục 12 của `detail-project.md`, liên quan mục 9–11 về
kiểm duyệt/giao dịch/hỗ trợ và mục 16, 18 về bảo mật/vận hành.

| Yêu cầu | Triển khai |
|---|---|
| Dashboard | Tổng user; user mới theo kỳ; đủ 6 trạng thái product; số đơn COMPLETED và tổng totalAmount theo completedAt; report PENDING; ticket OPEN/IN_PROGRESS. Tin đã xóa không được tính; cờ bị chặn hiển thị riêng. |
| Tiền và thời gian | Giá trị giao dịch không được gọi là doanh thu. MoneyString/BigInt giữ độ chính xác. Khoảng ngày bao gồm hết ngày theo UTC+07; ngày không tồn tại hoặc khoảng đảo ngược bị từ chối. |
| User | Tìm tên/email, xem chi tiết độc lập với trang danh sách, khóa/mở khóa; server chặn tự khóa/khóa admin và thu hồi phiên khi khóa user. |
| Product | Các trạng thái giao dịch và cờ bị chặn có bộ lọc riêng; duyệt/từ chối/chặn/gỡ chặn gửi expected_version. Xung đột phiên bản buộc tải lại trước khi thao tác. |
| Category | Tạo/sửa/vô hiệu/kích hoạt lại, giữ cây tối đa hai cấp. API admin riêng bao gồm INACTIVE; phân trang theo nhóm gốc, giữ cha/con để quản lý. Public tree không hiển thị danh mục vô hiệu. |
| Review/report | Ẩn review kèm lý do; xử lý/từ chối report kèm kết luận, chỉ xử lý report PENDING. |
| Ticket | Phân công, phản hồi, kết luận và chuyển trạng thái hợp lệ; CLOSED không mở lại. Có snapshot đơn để hỗ trợ hủy đặc biệt theo điều kiện và expected_version. |
| Bộ lọc | Các danh sách có phân trang, trạng thái/visibility, ngày và người xử lý/phân công. User/product/review dùng lịch sử audit để lọc actor; category dùng ngày thao tác audit, vì bảng category không có timestamp tạo. |
| Audit | Luồng API ghi audit cùng transaction cho khóa/mở khóa, duyệt/từ chối/chặn/gỡ chặn, category, review, report, ticket và hủy đơn đặc biệt. Danh sách và audit cache được tải lại sau thao tác. |
| Chống nâng quyền | Register/profile dùng strict whitelist, từ chối role/status. Admin API đòi phiên đăng nhập còn hiệu lực và role ADMIN/ACTIVE từ database, không tin role do client gửi. |
| Admin đầu tiên | Lệnh admin:create yêu cầu quyền database, cờ xác nhận, terminal tương tác và mật khẩu ẩn nhập hai lần. Chỉ tạo mới khi chưa có ADMIN, không nâng quyền email đã tồn tại; có audit và khóa advisory trong transaction. Không có endpoint tự đăng ký admin. |

Hợp đồng web, API, shared DTO, OpenAPI và Postman đã đồng bộ.
Hướng dẫn lệnh vận hành và ý nghĩa bộ lọc nằm trong `backend-runbook.md`.

## Xác minh

- Typecheck, lint và build toàn workspace thành công.
- Shared: 17 test; web: 42 test; API unit/HTTP/contract: 57 test thành công.
- Kiểm thử UI có tương tác kích hoạt lại danh mục vô hiệu và xác minh danh sách
  được cập nhật theo bộ lọc sau thao tác.
- Kiểm thử HTTP dùng router/middleware thật với persistence cô lập; không ghi
  database vận hành. Bao gồm thống kê, bộ lọc, audit category, phân quyền và
  từ chối payload nâng quyền.
- Lệnh `admin:create --help` chạy thành công; chưa tạo tài khoản thật.
- 14 test tích hợp PostgreSQL được bỏ qua do chưa có TEST_DATABASE_URL.
  Kết quả unit/mock không chứng minh race/rollback trên PostgreSQL thật; cần
  chạy integration trên database test dùng một lần trước triển khai.
- Build web có cảnh báo bundle lớn hơn 500 kB; không làm build thất bại.
