# Giảm số lượt đọc database khi chuyển trang — 24/10/2026

Đã gộp phần đọc dữ liệu của trang chi tiết sản phẩm, Tin đăng của tôi và danh
sách sản phẩm người bán thành một SQL snapshot. Với tài khoản đăng nhập, mỗi
request còn một query xác thực phiên và một query nội dung. Không cache session,
quyền, danh mục, trạng thái kiểm duyệt hoặc đánh giá.

## Kết quả đo

HTTP local qua Supertest, PostgreSQL/Supabase hiện đang cấu hình tại Sydney,
adapter pg, transaction pooler 6543, HTTP pool 2, jobs tắt. Pool được mở trước
khi đo. Một vòng đầu cho từng query shape, tiếp theo ba vòng warm; bảng lấy
median của ba vòng warm. Hai lượt trước/sau chạy nối tiếp trên cùng database,
không có frontend cache. Benchmark chỉ GET/SELECT, dùng các session hiện còn
hiệu lực; không đăng nhập, rotate cookie hoặc tạo dữ liệu trong database ứng dụng.

| Luồng API | SQL trước → sau | Median trước → sau | Giảm |
| --- | --- | --- | --- |
| Khách: chi tiết sản phẩm | 3 → 1 | 507 → 264 ms | 48% |
| Khách: sản phẩm người bán | 5 → 1 | 764 → 265 ms | 65% |
| Thành viên: chi tiết sản phẩm | 5 → 2 | 888 → 537 ms | 40% |
| Thành viên: Tin đăng của tôi | 6 → 2 | 839 → 517 ms | 38% |
| Thành viên: sản phẩm người bán | 7 → 2 | 1.014 → 520 ms | 49% |

SELECT 1 warm trước sửa: 249–264 ms, sau sửa: 255–270 ms. Execution time của
SELECT 1 trên server khoảng 0,02 ms. Các số này củng cố việc giảm lượt chờ
mạng giúp giảm độ trễ API; không có nghĩa mọi query server đều nhanh khi dữ
liệu tăng. Lần đầu query own-products sau sửa mất 933 ms; ba lượt warm là
532 / 515 / 517 ms. Cold connection và query shape đầu vẫn có chi phí riêng.

Raw reports local nằm trong `.artifacts/performance/product-reads-{before,after}.json`
và các file `-details.json`. Số liệu là API elapsed time, không bao gồm tải mã,
render UI, byte ảnh hoặc toàn bộ thao tác chuyển trang trên trình duyệt. Không
suy ra p95, khả năng chịu tải hay tốc độ production từ ba mẫu local.

## Thay đổi

- `apps/api/src/shared/product-reads.ts` lấy page/count, metadata ảnh, seller
  summary, danh mục từ root đến leaf, favorites và reputation trong cùng SQL.
  Chỉ enrich các sản phẩm của page; không lấy byte ảnh hoặc thông tin riêng
  của người bán. Giá/ship giữ kiểu numeric qua driver, không chuyển qua JSON
  number. Enum trả về dạng text để tránh thêm lượt lấy metadata của driver.
- Ba endpoint dùng cùng projection và DTO mapper hiện có. Tin đăng của tôi
  vẫn gồm các trạng thái riêng tư, blocked và soft-deleted, có filter status,
  total và thứ tự createdAt/id như trước. Trang vượt giới hạn vẫn giữ total.
- Trang người bán chỉ trả ACTIVE/RESERVED/SOLD đủ điều kiện; owner không còn
  hợp lệ vẫn trả 404 dù page rỗng. Public detail kiểm tra owner/admin và trạng
  thái hiển thị như trước. Danh mục có thêm con hoặc ancestor bị tắt có hiệu lực
  ngay ở request tiếp theo.
- Tách kiểu `ProductDetailRow` chỉ chứa các seller fields mapper cần. Giữ
  `ProductRow` đầy đủ cho những luồng cũ. Không đổi response contract, schema,
  connection limit, adapter, cấu hình local hay vị trí database trong đợt này.

## Kiểm chứng và tái lập

- API: 305 unit/contract test pass; 54 DB test skip ở lượt mặc định trước khi
  thêm suite mới. Typecheck, lint và build API pass sau thay đổi cuối.
- Suite PostgreSQL mới kiểm tra một SQL/projection, Date/Decimal, thứ tự ảnh,
  category path, reputation, favorites, PII, scope, private image metadata,
  pagination, blocked/deleted listing, owner/admin, khóa user và thu hồi session.
- PostgreSQL: 8/8 test pass trên schema ngẫu nhiên riêng do verifier tạo;
  schema đã được dọn. Gồm cả regression navigation, public search và image
  availability.

```sh
pnpm --filter @remarket/api exec tsx scripts/benchmark-navigation.ts product-reads-after --product-reads --warm-pool
node apps/api/scripts/verify-isolated.mjs --product-reads-only --driver-pg
pnpm --filter @remarket/api typecheck
pnpm --filter @remarket/api lint
pnpm --filter @remarket/api build
```

Database vẫn cần khoảng 250 ms cho một round trip từ máy local; request thành
viên hiện cần hai lượt đọc nối tiếp. API process chạy bản build cũ cần khởi
động lại để nhận mã mới; không cần migration cho thay đổi này.
