# Tối ưu tải dữ liệu — 17/11/2026

Đợt cập nhật này tập trung vào danh sách Yêu thích dùng chung cho web/mobile
và các request phụ khi mở trang tìm sản phẩm trên app Expo.

## Thay đổi

- `GET /favorites` dùng một SQL snapshot cho trang dữ liệu, tổng số, ảnh,
  người bán, điểm đánh giá và trạng thái đã lưu. Middleware vẫn đọc phiên
  đăng nhập mới trên mỗi request. Không cache quyền hoặc trạng thái kiểm duyệt.
- Dùng lại `readProducts` với scope `favorites`: lọc theo người lưu, sắp xếp
  theo thời điểm lưu giảm dần, thêm product ID làm thứ tự phụ ổn định. Tổng số
  vẫn có khi trang vượt phạm vi; tin bị chặn/xóa vẫn là placeholder để bỏ lưu.
- Mapper nhận projection chỉ gồm các trường cần thiết; không cần đọc email,
  mật khẩu, điện thoại hay địa chỉ của người bán. Cách cấp quyền URL ảnh của
  tin đã lưu được giữ nguyên.
- Web cập nhật lại cache Yêu thích và Sản phẩm đồng thời sau khi bỏ lưu.
- Mobile đăng ký tải sản phẩm trước các lookup. Chỉ tải tỉnh thành khi mở
  bộ lọc hoặc đã áp dụng lọc khu vực. Danh mục/tỉnh thành dùng `staleTime`
  5 phút, tương tự web, thay vì tải lại khi quay lại trang sau 30 giây.

## Phép đo API

Hai lượt chạy trên cùng Supabase đang cấu hình, adapter `pg`, transaction
pooler 6543, HTTP pool 2, background jobs tắt. Chỉ GET/SELECT, dùng session
thành viên còn hiệu lực, không đăng nhập lại hay ghi dữ liệu ứng dụng.
Mỗi lượt warm pool rồi gọi bốn request; bảng dùng ba request cuối.

| Chỉ số `GET /favorites?page_size=12` | Trước | Sau |
| --- | --- | --- |
| SQL/request, gồm kiểm tra phiên | 5 | 2 |
| Thời gian ba mẫu (ms) | 618 / 717 / 726 | 597 / 552 / 579 |
| Median (ms) | 717 | 579 |

Số SQL giảm 60%; median mẫu giảm khoảng 19%. Độ trễ mạng/provider khác nhau
giữa các lượt nên đây không phải SLA hoặc kết quả load test. `SELECT 1`
trong các lượt này vẫn mất khoảng 207–314 ms qua HTTP. Chưa đo thời gian
thao tác trên thiết bị mobile hay service đã deploy.

Chạy lại từ thư mục gốc:

```sh
pnpm --filter @remarket/api exec tsx scripts/benchmark-navigation.ts favorites-check --favorites --warm-pool
```

Lệnh cần có session USER đang hoạt động, không in token, ID hoặc response
body. Báo cáo local: `.artifacts/performance/favorites-before.json` và
`favorites-after.json`, kèm các file `*-details.json`.

## Kiểm chứng

Regression PostgreSQL bổ sung kiểm tra phân trang, thứ tự lưu kể cả timestamp
trùng, tin bị chặn/xóa, ảnh chưa được cấp public capability, không lộ PII,
đánh giá vừa bị ẩn, tài khoản bị khóa và danh sách của người dùng khác.
Các scope detail/own/seller cũng được chạy lại vì dùng chung reader.

Kết quả: 312 test API, 12 test tích hợp PostgreSQL, 276 test web và 36 test mobile đã qua;
typecheck/lint toàn monorepo và build API/web thành công. Build web còn cảnh
báo chunk lớn trong các dependency AI. Test API runtime AI từng vượt timeout
mặc định 5 giây; lần kiểm tra API dùng `--testTimeout=15000`, không sửa timeout
trong cấu hình dự án.

```sh
node apps/api/scripts/verify-isolated.mjs --product-reads-only --driver-pg
pnpm typecheck
pnpm lint
pnpm --filter @remarket/api exec vitest run --testTimeout=15000
```

`verify-isolated` tạo schema ngẫu nhiên riêng, chạy migrations/fixtures trong
schema đó rồi tự dọn. Bản cập nhật không cần migration hoặc đổi connection
limit, bucket, dữ liệu hay cấu hình deployment hiện có.
