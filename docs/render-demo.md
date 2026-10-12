# Deploy demo ReMarket trên Render Free

Một Render Free Web Service chạy Express, web React đã build và Socket.IO.
Web/API cùng origin nên cookie HttpOnly/SameSite hoạt động với URL miễn phí
`https://<service>.onrender.com`. Không cần Vercel hoặc domain riêng.

Database và ảnh nằm trên Supabase. Demo dùng `NODE_ENV=production`, HTTPS,
cookie Secure, JWT riêng và bucket private. Chỉ gửi email được tắt bằng
`EMAIL_ENABLED=false`; đăng ký/đăng nhập và yêu cầu admin xác minh vẫn hoạt động.
Quên mật khẩu/gửi lại email xác minh báo không khả dụng. Không in token ra log,
không tạo email token hoặc mail mới; email cũ đang chờ trong outbox được bỏ qua.

## 1. Chuẩn bị Supabase

Nếu đã có database dùng cho demo, giữ database đó và backup trước khi deploy.
Nếu tạo mới, tạo Supabase project và bucket **private** `remarket-private`.
Không bật public bucket. Lấy URL project và service-role key cho backend.

Lấy hai connection string PostgreSQL từ mục Connect:

- `DATABASE_URL`: session pooler có IPv4, cổng 5432, phù hợp API chạy liên tục.
- `DIRECT_URL`: kết nối dùng cho migrations, cùng database/schema. Có thể dùng
  cùng session pooler nếu endpoint direct chỉ hỗ trợ IPv6. Không dùng transaction
  pooler cổng 6543 cho migrations. URL-encode ký tự đặc biệt trong password.

Chọn API và DB cùng/gần region nếu được. Pool demo mặc định 2 HTTP + 1 background.
Không gửi connection string hoặc service-role key vào web, commit hay log.

Ảnh đang nằm trong PostgreSQL (`StorageObject`) hoặc `apps/api/uploads` cần
copy sang bucket trước khi chuyển sang driver Supabase, giữ nguyên `storagePath`
và các biến thể `.card.webp`/`.detail.webp`. `storage:sync` hiện chỉ local → database;
đổi biến môi trường không tự chuyển ảnh. Có thể upload lại ảnh cho demo mới.

## 2. Đưa cấu hình lên GitHub và tạo Render service

Push phiên bản đã kiểm tra gồm `render.yaml` lên repository.
Trên Render chọn **New → Blueprint**, kết nối repo và chọn branch chứa cấu hình.
Kiểm tra service plan là **Free**, region Singapore, không có database/worker
Render trả phí trong blueprint.

Render yêu cầu điền 4 biến `sync: false`:

| Biến | Giá trị |
| --- | --- |
| `DATABASE_URL` | PostgreSQL session pooler cho API |
| `DIRECT_URL` | PostgreSQL cùng DB, dùng migrations |
| `SUPABASE_URL` | URL project, ví dụ `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key, chỉ backend |

JWT được Render sinh riêng. `PUBLIC_WEB_URL` và `WEB_ORIGINS` mặc định lấy từ
`RENDER_EXTERNAL_URL`. Nếu dùng custom domain, đặt rõ hai biến này theo URL mới.
Không copy nguyên `.env` local lên Render vì URL localhost/Vite có thể ghi đè
cấu hình. `PORT` do Render cấp; API đọc biến đó.

Blueprint pin Node 22 và pnpm 11.9.0 qua Corepack/packageManager, cài cả build
dependencies. `dotenv` thuộc runtime dependencies. Vite dùng `/api/v1`, socket
cùng origin và `VITE_EMAIL_ENABLED=false`; server phục vụ `apps/web/dist`.

Các lệnh (chạy từ root repo, Root Directory để trống):

```sh
# Build Command
corepack pnpm@11.9.0 install --frozen-lockfile --prod=false && node scripts/build-demo.mjs

# Start Command
cd apps/api && node node_modules/tsx/dist/cli.mjs scripts/preflight-migration.ts && node node_modules/prisma/build/index.js migrate deploy && exec node dist/apps/api/src/index.js
```

Free không có pre-deploy command/shell, nên preflight và migrations chạy lúc
khởi động trước API. Lặp lại khi restart là bình thường. Preflight fail sẽ dừng
startup để sửa dữ liệu; không reset DB. Khi cập nhật DB đang có API/worker cũ,
stop phiên bản cũ trước khi áp dụng release migrations theo backend runbook.
Auto-deploy tắt để mỗi lần deploy là thao tác **Manual Deploy** có chủ đích.

## 3. Dữ liệu và admin

Nếu DB đã có admin/danh mục, dùng nguyên dữ liệu. Với DB demo hoàn toàn mới,
migrate và khởi tạo từ terminal local đã cấu hình connection tới DB demo:

```sh
pnpm --filter @remarket/api prisma:generate
pnpm --filter @remarket/api prisma:preflight
pnpm --filter @remarket/api prisma:deploy
pnpm --filter @remarket/api seed
pnpm --filter @remarket/api admin:create --email <email-cua-ban> --name "Admin demo" --confirm-create-first-admin
```

Seed chỉ tạo danh mục/tỉnh thành. Lệnh admin nhập password ẩn tại terminal,
không nhận password qua tham số và từ chối nếu đã có admin. `admin:create` đọc
root `.env`; Prisma đọc env của API. Đặt đúng DB demo cho cả hai trước khi chạy.
Người mua/bán tự đăng ký, gửi yêu cầu tại `/verify-email`, admin duyệt tại
`/admin/email-verifications`. Không có tài khoản/mật khẩu demo cài sẵn.

## 4. Kiểm tra trước buổi demo

- `/health/live` và `/health/ready` trả 200; `/health/worker` có thể 503 lúc vừa
  khởi động, rồi phải healthy sau vòng worker đầu tiên.
- Trang chủ, mở thẳng/reload `/login` hoặc `/admin` không 404.
- Đăng nhập và reload giữ phiên; thử admin/người mua/người bán ở các tab riêng.
- Đăng sản phẩm/upload ảnh, admin duyệt, đọc ảnh từ Supabase private.
- Chat realtime, thông báo và tạo/chuyển trạng thái đơn bằng tài khoản test.
- Quên mật khẩu báo rõ demo không gửi email.

Mở website vài phút trước khi trình bày. Render Free ngủ sau 15 phút không có
traffic, cold start khoảng 1 phút; jobs cũng tạm dừng khi server ngủ.
File local không bền vững. Supabase Free có hạn mức và pause khi không hoạt động.
Không dùng Render Postgres Free để giữ dữ liệu dài hạn vì hết hạn sau 30 ngày.

Tham khảo: [Render Free](https://render.com/docs/free),
[Blueprint](https://render.com/docs/blueprint-spec),
[Render environment](https://render.com/docs/environment-variables),
[Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Supabase pricing](https://supabase.com/pricing).
