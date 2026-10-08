# Rà soát và sửa project ReMarket — 08/10/2026

## Phạm vi

Rà soát monorepo React/Vite, Express, Prisma 5.22/PostgreSQL, shared DTO,
mock/live adapter, Socket.IO, hợp đồng API và hướng dẫn chạy. Giữ nguyên phiên
bản Prisma và UI kit hiện có; các màn hình mới dùng lại component và quy ước
của project. Hướng dẫn Prisma được áp dụng cho khóa/transaction và kiểm tra
database, không dùng để nâng cấp ORM ngoài phạm vi yêu cầu.

## Những lỗi chính đã sửa

- Hoàn thiện 8 route trước đây trống: hồ sơ, yêu thích, thông báo, danh sách
  hội thoại, hội thoại, danh sách hỗ trợ, tạo hỗ trợ và chi tiết hỗ trợ.
- Kết nối chat realtime; khôi phục kết nối, tải lịch sử/cursor, gửi lại với cùng
  mã chống trùng, trạng thái gửi/đã xem và REST polling dự phòng. Chỉ đánh dấu
  các tin đã hiển thị khi tab đang được xem.
- Thêm API chi tiết hội thoại theo quyền participant. Tài khoản bị khóa không
  được đọc chat; tin đăng bị chặn/xóa không nhận tin mới. Sửa read cutoff khi
  nhiều tin có cùng timestamp và trả đúng số tin chưa đọc còn lại.
- Sửa mất phiên khi full reload bị ngắt giữa cập nhật refresh token và nhận
  cookie mới. Bootstrap chỉ xác thực cookie hiện có; explicit refresh vẫn
  xoay token atomically và thu hồi phiên khi phát hiện replay.
- Sửa checkout gửi field ngoài hợp đồng strict khiến API trả 422. Form hiện
  gửi đúng payload, tính phí và phương thức theo sản phẩm của từng người bán,
  giữ idempotency key khi retry cùng dữ liệu. “Mua ngay” chỉ chọn món đang xem.
- Sửa raw PostgreSQL serialization/deadlock bị trả INTERNAL/500; checkout
  nhận diện conflict và retry có giới hạn, API trả 409 khi cần thử lại.
- Sửa foreign key khi tạo tin có ảnh: xác thực/khóa upload trước, tạo product,
  rồi gắn asset trong cùng transaction. Ảnh của người khác bị từ chối và không
  tạo listing dở dang. Order snapshot dùng URL ảnh riêng có chữ ký ngắn hạn.
- Form tin đăng dùng upload thật và province chuẩn từ API, bỏ mã VN-65 sai
  của Hồ Chí Minh. Hành động quản lý tin theo `allowed_actions` từ server;
  hiển thị lỗi/thành công bằng toast đang được mount.
- Giỏ hàng/yêu thích cho phép xóa món không còn khả dụng nhưng không lộ nội
  dung bị ẩn. Link thông báo và chi tiết đơn dùng đúng vai trò mua/bán.
- Bổ sung loading/error/empty/offline, chống submit trùng, chặn hành động lúc
  chưa khôi phục phiên; sửa navigation và bố cục mobile tài khoản.
- Support cho phép tài khoản bị khóa gửi yêu cầu ACCOUNT, unverified không
  tạo ORDER_PROBLEM. Mở lại ticket đã giải quyết xóa kết luận cũ trong mock.
- `pnpm dev` chạy cả API và web; proxy hỗ trợ Socket.IO. Cập nhật README,
  runbook, OpenAPI và Postman (78 operations).

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| Shared unit tests | 17/17 đạt |
| Web unit/component/adapter tests | 112/112 đạt |
| API unit/contract tests | 92/92 đạt |
| PostgreSQL integration | 15/15 đạt |
| Typecheck, lint, production build | Đạt cả monorepo |
| Main web JS chunk | 476.53 kB; gzip 149.65 kB |
| Chrome live smoke | 45 kiểm tra khác nhau đạt qua hai vòng; không uncaught exception hay HTTP 5xx |

Tổng cộng 236 test đạt khi kết hợp suite thường và suite PostgreSQL tách biệt.
`pnpm test` chủ động skip 15 DB test nếu không có `TEST_DATABASE_URL`.

15 DB test gồm: đăng ký đồng thời, replay refresh/repeated bootstrap,
checkout đồng thời/idempotency/rollback nhiều người bán, upload ownership và
rollback, checkout đối đầu khóa tài khoản, confirm đối đầu expiry, complete
đối đầu ticket resolution, report/notification dedupe, chat dedupe/cursor,
IDOR tài nguyên riêng, saved-item privacy và orphan cleanup.

Browser smoke dùng Chrome headless với profile/context riêng cho buyer,
seller, admin và locked user. Các bước sửa hồ sơ, tạo/trả lời hỗ trợ, gửi chat,
checkout và xác nhận đơn thao tác qua UI. Upload/tạo tin, duyệt tin, một số
bước giao nhận/hoàn tất và review gọi live adapter trong trình duyệt, không
giả lập backend. Kiểm tra viewport desktop/mobile, WebSocket event thật,
read receipt, 8 màn quản trị, drawer review, không tràn ngang, không có lỗi
JavaScript chưa xử lý hoặc HTTP 5xx. Screenshot và JSON được ghi dưới
`.artifacts/member-smoke` (được gitignore): `results.json` ghi 44 kiểm tra của
vòng đầy đủ, `results-lifecycle.json` ghi 22 kiểm tra của vòng bổ sung ảnh thật,
gồm snapshot sau khi listing bị chặn. Hai vòng có 45 nhãn kiểm tra khác nhau.

## An toàn dữ liệu và chạy lại

Không reset, seed hay chạy destructive integration trên bảng ứng dụng hiện
có. Harness tạo namespace `remarket_verify_<random UUID>` mới, kiểm tra schema
được chọn, áp dụng migration/seed chỉ trong namespace đó và dọn đúng namespace
cùng các upload do lần chạy tạo ra. Web/API kiểm thử dùng cổng 5321/5320,
không chiếm hay dừng server của người dùng.

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
node apps/api/scripts/verify-isolated.mjs
node apps/api/scripts/verify-isolated.mjs --browser-only
pnpm dev
```

## Bổ sung: admin duyệt xác minh email

Triển khai theo chấp thuận trực tiếp của người dùng ngày 08/10/2026:

- `/verify-email` chỉ gửi yêu cầu cho email của chính tài khoản đang đăng nhập;
  gửi thành công luôn về `/`, không chuyển thẳng vào checkout/đăng bán.
- ACTIVE admin nhận notification bền vững và badge số yêu cầu thật, duyệt tại
  `/admin/email-verifications`, có confirm và lịch sử đã duyệt.
- Link VERIFY_EMAIL cũ chỉ tạo yêu cầu/session sau khi chứng minh token;
  không tự đặt `emailVerifiedAt`. User/locked admin không được duyệt.
- Duyệt chỉ đổi trạng thái xác minh email, không đổi role/password/lock state.
  Request/approval khóa User rows; notification, audit và outbox cùng transaction.
  Gửi/duyệt đồng thời vẫn chỉ tạo một yêu cầu, một lần duyệt và một notification.
- Socket `email.verified` cập nhật phiên; REST polling 15 giây khi tab visible
  và online dự phòng. Network failure không xóa viewer, không chạy chồng request.
- Shared DTO, mock/live adapter, labels, OpenAPI và Postman đồng bộ 82 operations.
- Migration `20261008000000_admin_email_verification` chỉ thêm cột nullable,
  index và enum notification. Không backfill, reset, seed hay xóa tài khoản.
  Preflight trên database đang cấu hình đạt; `prisma:deploy` đã áp dụng đúng
  migration bổ sung vào `public`. `prisma migrate status`: schema up to date.
- Áp dụng hướng dẫn `.agents/skills/prisma-client-api/SKILL.md` cho query/
  transaction; giữ nguyên Prisma 5.22, không nâng cấp ORM.

Kiểm tra cuối: Shared 17, API unit/contract 92, Web 122, PostgreSQL 18,
tổng **249 test đạt**. Typecheck, lint và production build toàn monorepo đạt.
`pnpm --filter @remarket/web exec tsc -p tsconfig.json --noEmit` exit 0,
không có output lỗi. `pnpm --filter @remarket/web test`: 122 passed.

Chrome/live API kiểm tra 10 bước riêng cho luồng xác minh, desktop/mobile;
không uncaught exception, HTTP 5xx hay tràn ngang toàn trang. Thao tác gửi và
duyệt qua UI; nhận frame WebSocket thật và cập nhật phiên không reload.
Retry approve gọi live adapter xác nhận notification không trùng.
Ảnh/result tại `.artifacts/member-smoke/email-*.png` và `results-email.json`.
18 DB test chạy trong schema `remarket_verify_4f3cff3a64fb45c8aaa96f73a0d3cb58`,
đã dọn schema sau test; không sửa các bảng `public` trong regression.

## Giới hạn production còn lại

SMTP delivery thực, Supabase private-bucket upload/read/delete với credential
production, flow guest → email thật → xác minh trên deployed stack, tải đồng
thời lớn, nhiều instance, backup/restore và alert routing vẫn cần môi trường
staging/production. Bộ smoke không schema-validate mọi response của mọi API.
Rate limit hiện là bộ nhớ từng process; cần shared store trước khi scale ngang.
Không coi việc build/test local thành công là bằng chứng đã sẵn sàng go-live.
