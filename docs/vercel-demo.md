# Frontend Vercel, backend Render cho demo

Frontend React/Vite chạy trên Vercel. Express, Socket.IO, jobs và migrations
tiếp tục chạy trên Render tại `https://remarket-vytf.onrender.com`.
Database và ảnh vẫn dùng Supabase.

## 1. Import repository trên Vercel

Chọn repository `huynhhienanhquy/remarket`, branch `main`, plan Hobby.
Giữ **Root Directory = `./`** để build truy cập được workspace `packages/shared`.
Application Preset là **Vite**, Node.js **22.x**.

File `vercel.json` ở root cấu hình sẵn:

| Setting | Giá trị |
| --- | --- |
| Install Command | `corepack pnpm@11.9.0 install --frozen-lockfile --prod=false` |
| Build Command | `cd apps/web && node node_modules/vite/bin/vite.js build` |
| Output Directory | `apps/web/dist` |

Chỉ build frontend; không dùng root `pnpm build` hoặc `build:demo` trên Vercel.
Không chạy API/migrations trong Vercel build.

Thêm ba biến công khai vào Environment Variables trước khi Deploy:

```dotenv
VITE_API_BASE_URL=/api/v1
VITE_SOCKET_URL=https://remarket-vytf.onrender.com
VITE_EMAIL_ENABLED=false
```

`VITE_*` được nhúng vào bundle lúc build. Sau khi đổi biến, redeploy frontend.
Các biến database, JWT, Supabase service-role và SMTP chỉ đặt ở Render.

## 2. Cho phép domain Vercel trên Render

Sau lần deploy đầu tiên, copy production domain thực tế từ Vercel → Domains.
Không đoán domain từ tên project vì tên có thể đã được dùng.

Trong Render → service → Environment, cập nhật và restart/redeploy backend:

```dotenv
SERVE_WEB=false
WEB_ORIGINS=https://<production-domain-thuc-te>.vercel.app
PUBLIC_WEB_URL=https://<production-domain-thuc-te>.vercel.app
EMAIL_ENABLED=false
COOKIE_SECURE=true
```

Thay placeholder bằng domain thực tế, không thêm dấu `/` cuối URL.
Các biến database, storage, jobs và JWT giữ giá trị đã cấu hình cho backend.
Render có thể giữ nguyên build/start command trong `docs/render-demo.md`;
`SERVE_WEB=false` chỉ tắt việc Express phục vụ frontend đã build.

Nếu cần thử preview deployment, thêm chính xác origin của preview vào
`WEB_ORIGINS`, phân cách bằng dấu phẩy. Không dùng wildcard `*.vercel.app`.

## 3. API proxy và chat

`vercel.json` chuyển `/api/:path*` sang cùng đường dẫn trên Render trước khi
fallback về `index.html`. Trình duyệt gọi API qua domain Vercel, giữ cookie
HttpOnly/Secure/SameSite=Lax và cơ chế phiên riêng mỗi tab. Backend vẫn kiểm tra
Origin của frontend, nên bước allowlist trên Render là bắt buộc.

Tắt cache cho API proxy để không cache dữ liệu đăng nhập hoặc dữ liệu riêng.
Các đường dẫn ảnh `/api/v1/uploads/...` cũng đi qua proxy.
SPA fallback cho phép mở thẳng/reload `/login`, `/admin`, trang sản phẩm.

Socket.IO kết nối trực tiếp đến Render theo `VITE_SOCKET_URL`, xác thực bằng
access token trong memory. Không chuyển `/socket.io` sang SPA hoặc API proxy.
Backend phải cho phép origin Vercel để Socket.IO polling hoạt động.

Nếu đổi backend URL, cập nhật cả destination trong `vercel.json` lẫn
`VITE_SOCKET_URL` trên Vercel, rồi push/redeploy.

## 4. Kiểm tra demo

- Render `/health/ready` trả 200 trước khi kiểm tra frontend.
- Mở thẳng/reload `/login`, `/admin` trên production domain Vercel.
- Network: API gọi domain Vercel `/api/v1/...`, không gọi localhost.
- Đăng nhập rồi reload giữ phiên; đăng xuất và các tab tài khoản vẫn độc lập.
- Upload/xem ảnh, chat realtime, thông báo và admin duyệt hoạt động.
- Quên mật khẩu báo demo không gửi email.

Frontend Vercel tải được khi Render ngủ, nhưng API/chat vẫn phải chờ Render
khởi động lại. Mở backend trước buổi demo.

Tham khảo: [Vite trên Vercel](https://vercel.com/docs/frameworks/frontend/vite),
[API proxy/rewrites](https://vercel.com/docs/routing/rewrites),
[Monorepo](https://vercel.com/docs/monorepos).
