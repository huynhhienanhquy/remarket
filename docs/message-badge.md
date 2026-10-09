# Badge tin nhắn chưa đọc — 09/10/2026

Icon Tin nhắn trong header desktop và thanh điều hướng mobile hiển thị số
tin nhận chưa đọc. Badge dùng cùng kiểu đỏ với Thông báo; 0 thì ẩn, trên 99
hiển thị `99+`, nhãn truy cập vẫn chứa số đầy đủ.

`GET /api/v1/conversations/unread-count` đếm tin có `readAt=null`, người gửi
khác người xem và hội thoại có người xem là buyer/seller. Đếm toàn bộ hội
thoại, không cộng riêng trang inbox đầu tiên; không tính tin tự gửi hay
tin riêng của người khác. Endpoint giữ auth và quy tắc tài khoản ACTIVE của
chat; guest nhận 401, tài khoản khóa nhận 403. Không sửa database schema.
Contract frontend, OpenAPI và Postman được cập nhật.

`useUnreadMessageCount` chia sẻ cache theo người xem giữa header/mobile.
Sự kiện `message:created`, `conversation:read` và reconnect đã invalidate
nhóm `chat` ở RealtimeProvider; không tăng số theo sự kiện nên nhận trùng
không làm sai badge. Sau REST mark-read, invalidate thêm tổng số chưa đọc
để badge giảm ngay cả khi socket chưa kết nối. Polling 30 giây bổ sung,
không poll tab ẩn/offline. Guest/tài khoản khóa không gọi API đếm chat.

## Kiểm chứng

- `pnpm --filter @remarket/web test -- src/components/MarketplaceHeader/MarketplaceHeader.test.tsx --maxWorkers=1 --no-file-parallelism`
  — 5 tests pass: số thật/cache dùng chung, 99+ và nhãn đầy đủ, realtime
  nhận/đọc và sự kiện trùng, lỗi API không bịa badge, guest/tài khoản khóa.
- `pnpm --filter @remarket/api test -- tests/unit/chat-access.test.ts tests/contract/openapi.test.ts`
  — 18 tests pass, gồm 12 chat-access và 6 OpenAPI.
- `pnpm -r typecheck`, `pnpm -r lint` — exit 0.
- `pnpm --filter @remarket/web exec tsc -p tsconfig.json --noEmit`
  — exit 0, không diagnostic.
- `pnpm --filter @remarket/api exec tsc -p tsconfig.test.json --noEmit`
  — exit 0, không diagnostic (bao gồm fixture mới).
- `pnpm -r build` — exit 0; web 269 modules.
- `pnpm -r test -- --maxWorkers=1 --no-file-parallelism` với
  `TEST_DATABASE_URL` rỗng — shared 17, API 152, web 198: **367 tests pass**,
  23 integration tests cần database riêng được bỏ qua ở lượt này.
- `node --check scripts/smoke-member-flows.mjs` — exit 0.
- `pnpm --filter @remarket/api test -- tests/contract/openapi.test.ts`
  sau cập nhật Postman — 6 tests pass.

Browser verification chạy bằng
`node apps/api/scripts/verify-isolated.mjs --browser-only --chat-badge-only`.
Runner tạo schema UUID riêng, áp dụng migrations và seed 22 hội thoại
cho tài khoản người bán, với tin chưa đọc ở trang thứ hai, tin tự gửi và
tin riêng không liên quan. Trình duyệt dùng các tài khoản tách phiên để
kiểm tra badge ở home, gửi tin từ UI, nhận sự kiện WebSocket thật và đọc
từng hội thoại. Kết quả và giới hạn của lượt chạy được ghi dưới đây.

Các bước browser đã xác nhận trên API/database thật:

- Seller có 22 hội thoại; trang đầu có 0 tin chưa đọc nhưng API tổng trả 2.
  Buyer có 1; admin không tham gia các hội thoại trả 0. Tin tự gửi và tin
  riêng của người khác không được cộng vào tổng.
- Badge desktop 1440px và mobile 360px hiển thị 2. Buyer gửi hai tin từ UI,
  seller ở trang chủ nhận `message:created` qua WebSocket thật và badge tăng
  2 → 4 không reload. Số của người gửi vẫn là 1.
- Khi đưa tab seller ra trước và mở hội thoại, API tổng giảm về 1; quay
  lại trang chủ hiển thị badge 1. Gửi phản hồi không tăng tổng của seller.
- Đã xem ảnh `chat-badge-initial-desktop.png`,
  `chat-badge-initial-mobile.png` trong `.artifacts/member-smoke/`.

Lượt browser chưa hoàn tất bước xác nhận đọc hết/reload: Supabase mất kết
nối (`P1001`) và pool timeout trong lúc mở hội thoại cuối. Không báo toàn bộ
browser smoke pass hoặc 0 response 5xx. Ẩn badge khi số trở về 0 được xác
nhận trong test frontend realtime ở trên. Schema của lượt kiểm thử bị ngắt
đã được xóa bằng script chỉ cho phép đúng namespace UUID do runner tạo;
script chẩn đoán tạm cũng được dọn.

Runner từng gặp advisory lock toàn database khi migrate. Lượt browser cuối
đặt `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1` riêng trong tiến trình kiểm thử:
runner xác nhận namespace UUID chưa tồn tại trước khi tạo/migrate, nên
migrations không dùng chung schema với ứng dụng hoặc lượt khác. Không đổi
cấu hình migration runtime. Profile Chrome tạm dùng retry khi dọn để xử lý
Windows giữ file sau khi Chrome đóng. Harness đưa tab ra trước khi kiểm tra
đã đọc, phù hợp quy tắc chỉ đánh dấu tin trong tab hiển thị.

`git -c core.safecrlf=false diff --check` — exit 0.

Chưa triển khai production hoặc commit/push.
