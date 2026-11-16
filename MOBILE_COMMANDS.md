# Lệnh chạy ReMarket Mobile

Dùng Node.js 22.13 trở lên và pnpm 11.9 theo cấu hình dự án.

## Chạy nhanh từ thư mục hiện tại

| Bạn đang ở | Expo Go | Development build |
| --- | --- | --- |
| `D:\remarket` | `pnpm run dev:mobile:go` | `pnpm run dev:mobile` |
| `D:\remarket\apps\mobile` | `pnpm run go` | `pnpm run dev` |

`dev:mobile:go` và `dev:mobile` là script của repo gốc. Nếu đang ở `apps/mobile` và muốn gọi script gốc, dùng `pnpm -w run dev:mobile:go`. Khi gặp `Command "expo:dev" not found`, chọn lệnh tương ứng trong bảng.

## 1. Cài và cấu hình lần đầu

```powershell
Set-Location D:\remarket
pnpm install --frozen-lockfile
if (-not (Test-Path apps/mobile/.env)) {
  Copy-Item apps/mobile/.env.example apps/mobile/.env
}
ipconfig
```

File mẫu dùng API HTTPS cùng backend với web. Với cấu hình này, điện thoại tải dữ liệu qua internet.

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://remarket-vytf.onrender.com/api/v1
EXPO_PUBLIC_SOCKET_URL=https://remarket-vytf.onrender.com
```

Khi dùng API HTTPS, chuyển sang bước 3. Nếu muốn chạy API local, thay bằng `http://<IP-LAN>:3000/api/v1` và socket `http://<IP-LAN>:3000`. Điện thoại cần ở cùng Wi-Fi và truy cập được máy tính. Android Emulator mặc định trên cùng máy có thể dùng `10.0.2.2`. Sau khi sửa `.env`, khởi động lại Metro.

## 2. Chạy API local trong terminal 1

Cấu hình `apps/api/.env` theo [hướng dẫn thiết lập backend](README.md). Với database local mới hoặc còn thiếu migration, kiểm tra đúng database đích trước khi chạy ba lệnh Prisma.

```powershell
Set-Location D:\remarket
pnpm --filter @remarket/api prisma:generate
pnpm --filter @remarket/api prisma:preflight
pnpm --filter @remarket/api prisma:deploy
pnpm dev:api
```

Kiểm tra kết nối từ điện thoại bằng cách mở `http://<IP-LAN>:3000/health/live` trên trình duyệt.

## 3. Chạy app trong terminal 2

### Xem UI nhanh bằng Expo Go

```powershell
Set-Location D:\remarket\apps\mobile
pnpm run go
```

Dùng Expo Go tương thích với SDK 58 của dự án rồi quét QR bằng Expo Go trên Android hoặc Camera trên iPhone.

#### Expo Go báo `The request timed out`

1. Trên điện thoại, mở `http://<IP-LAN>:8081/status` bằng trình duyệt. Khi kết nối được Metro, trang sẽ hiện `packager-status:running`. Dùng đúng cổng Metro in trong terminal nếu khác `8081`.
2. Nếu trình duyệt cũng timeout, thử kết nối cả hai thiết bị vào cùng Wi-Fi gia đình. Trên iPhone, bật quyền **Mạng cục bộ** cho Expo Go. Sau khi đổi mạng, cập nhật IP API trong `apps/mobile/.env`, khởi động lại Metro và quét QR mới.
3. Nếu mạng chặn kết nối LAN, dùng `pnpm run go:tunnel` từ `apps/mobile` rồi quét QR mới. Tunnel cấp URL công khai cho Metro. Nếu iPhone không truy cập được API LAN, dùng URL API staging HTTPS mà iPhone truy cập được. Xem [tài liệu Expo CLI về tunnel](https://docs.expo.dev/more/expo-cli/#tunneling).

Trên iPhone thật, đăng nhập Expo Go bằng cùng tài khoản với Expo CLI. Dùng `pnpm exec expo whoami` để đối chiếu. Xem [hướng dẫn đăng nhập Expo Go](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/).

#### Chạy qua tunnel

Đăng nhập Expo CLI và Expo Go bằng cùng tài khoản. SDK 58 sử dụng tunnel của Expo theo mặc định.

```powershell
Set-Location D:\remarket\apps\mobile
pnpm exec expo whoami
# Nếu chưa đăng nhập
pnpm exec expo login
pnpm run go:tunnel
```

Sau khi Metro báo tunnel đã sẵn sàng, quét mã QR mới.

#### Expo Go báo project dùng SDK 57

Dừng Metro đang chạy bằng `Ctrl+C`. Cài dependency từ thư mục gốc rồi khởi động lại.

```powershell
Set-Location D:\remarket
pnpm install --frozen-lockfile
Set-Location apps/mobile
pnpm run go:tunnel --clear
```

Project hiện dùng SDK 58. Quét QR của Metro mới để tải đúng phiên bản.

### Chạy development build

Nếu development build đã được cài trên thiết bị, chạy Metro rồi mở app ReMarket.

```powershell
Set-Location D:\remarket\apps\mobile
pnpm run dev
```

Để build và cài development build tại máy, chọn lệnh tương ứng. Android cần Android SDK và thiết bị hoặc emulator. iOS cần macOS và Xcode.

```powershell
pnpm --filter @remarket/mobile android
# Trên macOS
pnpm --filter @remarket/mobile ios
```

## Kiểm tra và xuất bundle

```powershell
Set-Location D:\remarket
pnpm --filter @remarket/mobile typecheck
pnpm --filter @remarket/mobile lint
pnpm --filter @remarket/mobile test
pnpm build:mobile
```

`pnpm build:mobile` xuất bundle Android/iOS. Xem [hướng dẫn mobile](apps/mobile/README.md#development-build) để thiết lập EAS và tạo bản cài đặt.
