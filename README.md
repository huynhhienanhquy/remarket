# ReMarket

React/TypeScript web, Express API và Prisma 5.22/PostgreSQL trong một pnpm monorepo.

## Chạy local

Yêu cầu Node.js 22 và pnpm 11.9. Cấu hình backend trong `apps/api/.env` theo
`.env.example`, gồm database và signing key riêng. Cấu hình frontend trong
`apps/web/.env` chỉ với các giá trị công khai:

```dotenv
VITE_API_MODE=live
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
Không chạy seed trên production. Schema/migrations được hỗ trợ nằm trong
`apps/api/prisma`; các file Prisma cũ ở root không phải nguồn migration của API.

## Kiểm tra

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
node apps/api/scripts/verify-isolated.mjs
node apps/api/scripts/verify-isolated.mjs --browser-only
```

Lệnh `verify-isolated` cần quyền tạo schema trên PostgreSQL và tự dọn schema
kiểm thử riêng; không reset các bảng hiện có. Browser smoke cần Chrome, dùng
cổng riêng 5320/5321. Xem [backend runbook](docs/backend-runbook.md) để cấu hình
worker, production email/storage, tài khoản admin và vận hành.

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
API. Production cần SMTP và Supabase private storage hợp lệ; không đưa secret
vào frontend hay commit `.env`.
