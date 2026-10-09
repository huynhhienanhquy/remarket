# Đánh giá người bán sau hoàn tất đơn hàng — 09/10/2026

Nút đánh giá trước đây chỉ gọi `console.log`, không mở form hoặc gửi request.
Trang chi tiết đơn hàng nay mở ReviewDialog và gửi qua API hiện có
`POST /api/v1/orders/:orderId/reviews`; không thêm endpoint, dependency hoặc
thay đổi schema và quy tắc backend.

## Hành vi

- Chỉ buyer của đơn COMPLETED có quyền `review`, chưa gửi đánh giá và còn đủ
  điều kiện từ API mới thấy nút gửi. Tài khoản bị khóa/chưa xác minh email
  được giải thích lý do; đơn hết thời hạn hiển thị lý do API.
- Chọn một trong 1–5 sao, không chọn sẵn. Radio dùng bàn phím và label thật.
  Nhận xét tùy chọn, tối đa 1.000 ký tự với counter; dùng validation shared.
- Gửi một request; khóa thao tác khi đang gửi, không tự retry mutation.
  Validation và lỗi mạng giữ lại nội dung; lỗi field được liên kết với input.
  Đóng form đã nhập cần xác nhận bỏ nội dung.
- Sau API xác nhận thành công, ghi review vào cache đơn hàng, đóng form và
  thông báo thành công. Invalidate orders, profiles, products, admin reviews
  và notifications. Đơn hiển thị số sao, nhận xét và thời điểm đã gửi; không
  có thao tác sửa hoặc gửi lại; gợi ý bước tiếp theo cũng bỏ hành động review.
  Conflict eligibility refetch trạng thái API.

Mã riêng của màn hình nằm trong `pages/OrderDetailPage/hooks/useOrderReview.ts`
và `sections/ReviewDialog.tsx`, dùng Dialog/Radio/FormField/Textarea/UserSummary
và Toast hiện có. Giữ nguyên các thay đổi khác trong workspace.

## Kiểm chứng

- Toàn bộ frontend: `pnpm --filter @remarket/web test -- --maxWorkers=1 --no-file-parallelism`
  — 32 files, 191 tests pass.
- Hồi quy trang đơn: `pnpm --filter @remarket/web test -- src/pages/OrderDetailPage/OrderDetailPage.test.tsx --maxWorkers=1 --no-file-parallelism`
  — 16 tests pass: hoàn tất → đánh giá, thiếu sao, comment optional, pending,
  lỗi mạng/retry, field errors, eligibility conflict, role/account restrictions,
  keyboard và bỏ draft.
- `pnpm --filter @remarket/web exec tsc -p tsconfig.json --noEmit`
  — exit 0, không diagnostic.
- `pnpm --filter @remarket/web lint` — exit 0, không diagnostic.
- `pnpm --filter @remarket/web build` — pass, 268 modules.
- `pnpm --filter @remarket/api test -- tests/contract/openapi.test.ts`
  — 6 tests pass; `node --check scripts/smoke-member-flows.mjs` pass.

Browser smoke dùng `node apps/api/scripts/verify-isolated.mjs --browser-only --lifecycle-only`:
runner tạo schema PostgreSQL UUID riêng, migrate/seed ở schema đó, khởi động
API/Vite cổng riêng và tự dọn schema/uploads sau khi kết thúc.
Script được cập nhật để hoàn tất và gửi đánh giá qua UI, kiểm tra trạng thái
sau reload và rating/count/reviews trên profile thật. Assertion refresh cookie
cũ cũng được cập nhật để kiểm tra đúng cookie HttpOnly của scope tab hiện tại;
assertion dashboard dùng nhãn thực tế “Tổng người dùng”. Giữ nguyên kiểm tra
cookie HttpOnly, quyền và kiểm tra trang quản trị; không sửa runtime các luồng này.
Browser đã xác nhận POST reviews trả 201, số sao/nhận xét lưu đúng trong
GET order detail, `can_review=false` sau khi gửi; reload giữ trạng thái và
không còn nút gửi. Review xuất hiện trong tab đánh giá của profile, rating
5/5 và review_count tăng đúng một so với baseline fixture. Chọn sao bằng
phím mũi tên thực trong Chrome pass. Đã xem screenshots mobile 360px và
desktop 1440px; snapshots mới trong `.artifacts/member-smoke/` được Git ignore.

Lượt browser smoke cuối **exit 0: 26 responsive checks pass**, không có uncaught
browser exceptions hoặc response 5xx. Runner đã xóa upload thử nghiệm và schema
PostgreSQL tạm. Kết quả máy đọc tại `.artifacts/member-smoke/results-lifecycle.json`.
`git -c core.safecrlf=false diff --check` pass.

Chưa chạy screen reader trực tiếp hoặc triển khai production. Chưa commit/push.

## Bổ sung quyền xem cho người bán — 09/10/2026

Người bán mở **Đơn bán → Chi tiết đơn hàng** để xem đánh giá của người mua:
tên người đánh giá, số sao, nhận xét và ngày gửi. Đơn hoàn tất chưa có đánh
giá hiển thị “Người mua chưa đánh giá đơn hàng này.” Người bán chỉ có quyền
xem; không được tạo, sửa hoặc gửi lại đánh giá.

API chi tiết đơn hàng trả review hiện có cho cả buyer và seller của đơn,
dùng tên/avatar công khai của buyer đã được tải cùng đơn. Giữ nguyên quyền
gửi và kiểm tra người tham gia: người ngoài nhận 404; seller gửi review nhận
403. Không thêm truy vấn, endpoint hoặc thay đổi schema database. DTO shared
và OpenAPI ghi rõ quyền xem/gửi này.

Kiểm chứng bổ sung:

- Test API đi qua Express, auth và route thật, mock lớp database: seller
  (kể cả tài khoản khóa) đọc được review, buyer vẫn đọc được, đơn chưa có
  review, người ngoài bị chặn và seller không được gửi: 6 tests pass.
- Trang đơn: 18 tests pass, gồm seller chỉ xem, không có form/nút gửi và
  trạng thái chưa được đánh giá.
- Toàn bộ workspace: shared 17, API 148, web 193 — **358 tests pass**;
  23 tests integration cần database riêng được bỏ qua ở lượt unit tests.
- `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r build` đều pass.
- `node --check scripts/smoke-member-flows.mjs` pass.

Browser smoke bổ sung mở chi tiết đơn ở tài khoản seller sau khi buyer gửi:
kiểm tra cùng review ID/nội dung, `can_review=false`, không có quyền hoặc
nút gửi review. Lượt `node apps/api/scripts/verify-isolated.mjs --browser-only
--lifecycle-only` đã pass **27 responsive checks**, không có uncaught browser
exceptions hoặc response 5xx. Kết quả tại
`.artifacts/member-smoke/results-lifecycle.json`; screenshot trang đơn bán
mobile tại `.artifacts/member-smoke/seller-order-review-mobile.png`.

Lượt đầu treo ở Prisma migration; đã dừng đúng tiến trình migration của lượt
test đó, runner dọn schema tạm thành công. Lượt chạy lại áp dụng đủ bốn
migrations, seed dữ liệu riêng và kiểm tra trình duyệt thành công (exit 0).
Runner đã xóa upload thử nghiệm và schema tạm. `git -c core.safecrlf=false
diff --check` pass.
