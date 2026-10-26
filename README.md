# ReMarket

React/TypeScript web, Express API và Prisma 5.22/PostgreSQL trong một pnpm monorepo.

## Demo trên Render Free

Một service phục vụ cả web, API và Socket.IO trên cùng URL. Xem
[hướng dẫn deploy demo](docs/render-demo.md); cấu hình nằm trong `render.yaml`.
Demo tắt gửi email, xác minh tài khoản vẫn qua admin. Database và ảnh dùng Supabase.

Nếu tách frontend sang Vercel và giữ backend trên Render, xem
[hướng dẫn Vercel + Render](docs/vercel-demo.md). Cấu hình frontend nằm trong
`vercel.json`; API đi qua proxy để giữ phiên đăng nhập, chat kết nối đến Render.

## Chạy local

App Expo cho Android/iOS nằm trong `apps/mobile`. Xem [hướng dẫn mobile](apps/mobile/README.md)
và [báo cáo cập nhật Expo](docs/expo-mobile-implementation-2026-10-14.md). Web và app
dùng chung API, DTO và endpoint client; mobile có cả khu vực quản trị. Chạy `pnpm dev:mobile`
với development client sau khi cấu hình API/socket URL trên thiết bị.

Yêu cầu Node.js 22 và pnpm 11.9. Cấu hình backend trong `apps/api/.env` theo
`.env.example`, gồm database và signing key riêng. Cấu hình frontend trong
`apps/web/.env` chỉ với các giá trị công khai:

```dotenv
VITE_API_BASE_URL=/api/v1
VITE_SOCKET_URL=
```

Web dev proxy mặc định chuyển REST và Socket.IO đến API cổng 3000. Có thể đổi
backend đích bằng biến môi trường `VITE_DEV_API_TARGET` khi chạy Vite.

```sh
pnpm install --frozen-lockfile
pnpm --filter @remarket/api prisma:generate
pnpm --filter @remarket/api prisma:preflight
pnpm --filter @remarket/api prisma:deploy
pnpm dev
```

Web: http://localhost:5173. API: http://localhost:3000.
Có thể chạy riêng `pnpm dev:web` hoặc `pnpm dev:api`.
Frontend luôn gọi API thật; không có chế độ mock hoặc tài khoản demo.
Lệnh `pnpm --filter @remarket/api seed` chỉ tạo danh mục và tỉnh thành còn thiếu,
không tạo người dùng, sản phẩm hay giao dịch. Tạo admin bằng `admin:create`.
Schema/migrations nằm trong `apps/api/prisma`. Chạy các lệnh Prisma qua
`pnpm --filter @remarket/api` để dùng đúng schema và phiên bản của API.

## Ảnh dùng chung giữa nhiều máy

Local và production mặc định dùng `STORAGE_DRIVER=supabase`. Ảnh gốc và các bản
WebP được lưu trong bucket Supabase **private**; PostgreSQL chỉ lưu metadata cho
ảnh mới. API kiểm tra quyền rồi cấp signed URL ngắn hạn để đọc ảnh.

Cấu hình trong `apps/api/.env` trên mỗi máy:

```dotenv
STORAGE_DRIVER=supabase
SUPABASE_URL=https://mokuyrnkgsmqicvokrsq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-cua-project>
STORAGE_BUCKET=remarket-private
```

Key chỉ đặt ở backend, không đặt trong biến `VITE_` hoặc `EXPO_PUBLIC_`.
Để chuyển ảnh cũ từ bảng `StorageObject` hoặc `apps/api/uploads` sang bucket,
dừng API/worker đang dùng driver cũ, rồi chạy trên từng máy còn giữ ảnh local:

```sh
pnpm --filter @remarket/api storage:sync --dry-run
pnpm --filter @remarket/api storage:sync
```

Lệnh kiểm tra bucket private, giữ nguyên file local và byte trong database, bỏ qua
object đã có và bổ sung WebP còn thiếu. `--dry-run` chỉ kiểm tra, không upload.
Ảnh thiếu hoặc lỗi khiến lệnh trả exit code 1; ảnh chỉ còn trên máy khác cần đồng
bộ từ máy đó hoặc upload lại. Khởi động lại API/worker sau khi đồng bộ thành công.
Driver `database` vẫn hỗ trợ dữ liệu cũ khi chọn rõ; `local` dành cho một máy API.
Xem thêm [backend runbook](docs/backend-runbook.md).

## Tin nhắn hệ thống từ admin

Admin có thể mở **Người dùng → chọn người dùng → Nhắn tin hệ thống** để liên hệ
với tài khoản đang hoạt động. Người nhận thấy tên **Hệ thống ReMarket** trong hộp
thư, nội dung tin và thông báo, và có thể trả lời trong cùng hội thoại. Mỗi cặp
admin/người dùng có một kênh riêng; chat mua bán giữ nguyên. Lịch sử audit ghi
đúng admin thực hiện. Chạy migration `20261024000000_system_conversations` và
`prisma:generate` trước khi khởi động API/worker mới. Kiểm thử PostgreSQL an toàn:
`node apps/api/scripts/verify-isolated.mjs --system-chat-only`.

## Đăng nhập nhiều tài khoản trên cùng trình duyệt

Mỗi tab có phiên riêng: mở các tab mới và đăng nhập admin, người mua hoặc
người bán qua `/login`. Reload giữ tài khoản của tab đó. Đăng nhập/đăng xuất
ở một tab không thay đổi các tab khác. Access token chỉ ở memory; refresh
token vẫn nằm trong cookie HttpOnly. `sessionStorage` chỉ giữ UUID chọn cookie,
không chứa token hay thông tin tài khoản. Client cũ không gửi `X-Session-Scope`
vẫn dùng cookie chung cũ; tab mới của web không tự nhận phiên cũ này.

Backend và web phải được cập nhật cùng nhau vì API cần nhận header
`X-Session-Scope`. Đăng xuất tất cả và đặt lại mật khẩu vẫn thu hồi toàn bộ
phiên của **tài khoản đó**. Nếu trình duyệt chặn sessionStorage, đăng nhập vẫn
hoạt động trên trang hiện tại nhưng không giữ được phiên qua reload.

Kiểm thử ba tài khoản trong một Chrome profile, dùng schema PostgreSQL tạm:
`node apps/api/scripts/verify-isolated.mjs --browser-only --auth-browser`.

## Kiểm tra

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
node apps/api/scripts/verify-isolated.mjs
node apps/api/scripts/verify-isolated.mjs --browser-only
node apps/api/scripts/verify-isolated.mjs --browser-only --benchmark
```

Lệnh `verify-isolated` cần quyền tạo schema trên PostgreSQL và tự dọn schema
kiểm thử riêng; không reset các bảng hiện có. Browser smoke cần Chrome, dùng
cổng riêng 5320/5321. Xem [backend runbook](docs/backend-runbook.md) để cấu hình
worker, production email/storage, tài khoản admin và vận hành.

## Hiệu năng với Supabase

Giữ nguyên DB và dữ liệu hiện có. Danh sách sản phẩm dùng một query snapshot,
không cache quyền hoặc trạng thái kiểm duyệt. Job/outbox/realtime vẫn chạy trong
API với `RUN_JOBS=auto`, nhưng dùng pool riêng (`BACKGROUND_DATABASE_CONNECTION_LIMIT=1`),
không tranh pool request. Tổng ngân sách connection cần cộng cả hai pool và các
instance; không tự tăng giới hạn HTTP hiện có.

Ảnh đã được kiểm tra quyền dùng URL ký có thời hạn, không query DB lại cho từng
ảnh. Upload mới sinh WebP card 480px/detail 1600px; ảnh local cũ sinh biến thể khi
đọc lần đầu. Bucket Supabase vẫn private; ảnh Supabase cũ chưa có thumbnail sẽ
fallback ảnh gốc. URL `example.com/org/net` được bỏ khỏi hiển thị, không sửa DB.
Xem [báo cáo hiệu năng](docs/performance-check.md) và các giới hạn cache/độ trễ mạng.

Kiểm tra chuyển trang mới nhất: [đo độ trễ ngày 21/10/2026](docs/navigation-performance-2026-10-21.md).
Với ảnh lưu trong PostgreSQL, API cache byte ảnh tối đa 32 MiB/60 giây và gộp
các lượt đọc trùng; mỗi request vẫn kiểm tra quyền/chữ ký trước khi dùng cache.
Header web/mobile dùng chung một API số đếm thay vì tải cả giỏ hàng và gọi từng
badge riêng. API chuẩn bị tối đa hai connection HTTP trước khi nhận request,
trong giới hạn pool hiện có. Cập nhật backend trước hoặc đồng thời với web/mobile.

Với localhost dùng Supabase transaction pool (port 6543), có thể bật
`DATABASE_DRIVER_ADAPTER=pg` và `DATABASE_USE_DIRECT_URL=false` trong
`apps/api/.env`. Adapter chính thức được pin cùng Prisma 5.22, giữ nguyên giới
hạn connection và xác minh TLS bằng CA Supabase đi kèm. Không cần nâng Prisma
hoặc chạy migration cho cập nhật hiệu năng này. Khởi động lại `pnpm dev` sau
khi đổi cấu hình; đặt `DATABASE_DRIVER_ADAPTER=native` để dùng lại engine cũ.
Schema kiểm thử riêng vẫn dùng session/direct URL để bảo đảm `search_path`.

## Xác minh email qua admin

User đăng nhập, mở `/verify-email` và gửi yêu cầu cho email của chính mình.
Gửi thành công sẽ về trang chủ. Admin nhận thông báo và badge hàng chờ;
vào **Xác minh email** tại `/admin/email-verifications` để đồng ý xác nhận.
Chỉ sau khi admin duyệt, email mới được đánh dấu đã xác minh. Quyền user tự
cập nhật qua realtime hoặc kiểm tra phiên dự phòng, không cần đăng nhập lại.

Link email cũ vẫn được nhận nhưng chỉ gửi yêu cầu, không tự xác minh.
Migration bổ sung giữ nguyên tài khoản đã xác minh và dữ liệu hiện có.
Kiểm thử PostgreSQL/browser tách biệt cho luồng này:
`node apps/api/scripts/verify-isolated.mjs --browser --email-only`.

Link email cũ/đặt lại mật khẩu ở môi trường development được in tại console
API. Production cần SMTP (trừ demo đặt `EMAIL_ENABLED=false`) và Supabase private storage hợp lệ; không đưa secret
vào frontend hay commit `.env`.
