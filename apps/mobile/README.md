# ReMarket mobile

App Expo SDK 57 / React Native 0.86.3 cho Android và iOS, dùng API ReMarket thật.
Có đầy đủ khu vực người dùng và quản trị. Không chứa mock account, dữ liệu demo hoặc database key.

Giao diện native đồng bộ với web mobile-first: trang chủ có hero hai CTA,
danh mục ba cột và 10 tin mới; trang `/products` riêng cho tìm kiếm, sắp xếp
và bộ lọc dạng bảng trượt. Card và gallery dùng ảnh 4:3, lưới hai cột trên
điện thoại; header, thanh tab, form đăng nhập, các màn tài khoản và menu quản
trị dùng cùng màu teal, typography và cách phân nhóm với web. Thanh mua hàng
và nút lưu tin cố định có safe area.
Xem [thay đổi UI và kiểm tra ngày 21/10](../../docs/mobile-ui-parity-2026-10-21.md).
Xem [đối chiếu chức năng và kết quả kiểm tra](../../docs/mobile-web-parity-2026-10-15.md).

## Chạy development

### Test bằng Expo Go

Sau khi cấu hình API và `apps/mobile/.env` theo hướng dẫn dưới, chạy từ root:

```sh
pnpm dev:api
# Terminal thứ hai:
pnpm dev:mobile:go
```

Điện thoại và máy tính dùng cùng Wi-Fi, URL API dùng IP LAN của máy tính thay
vì localhost. Quét QR bằng Expo Go (Android) hoặc camera iPhone. Expo Go phải
hỗ trợ SDK 57 của project; nếu báo SDK mismatch, cài bản phù hợp từ expo.dev/go.
Push native được tắt riêng khi chạy Expo Go; hộp thông báo REST và chat vẫn hoạt động.
Remote push và custom-scheme email links cần development build để kiểm thử đầy đủ.

API local phải được migrate theo phiên bản source trước khi thử đăng nhập. Nếu
server báo Prisma `P2022` với `User.deletedAt` hoặc `Session.transport`, kiểm tra
database đích rồi chạy `pnpm --filter @remarket/api prisma:deploy`; không dùng
`migrate reset` để sửa lỗi này.

### Development build

Yêu cầu Node 22.13 trở lên và pnpm 11.9. Từ root monorepo:

```sh
pnpm install --frozen-lockfile
pnpm --filter @remarket/api prisma:generate
pnpm --filter @remarket/api prisma:deploy
pnpm dev
```

Trước khi chạy `prisma:deploy`, kiểm tra database đích trong `apps/api/.env`.
Hai migration 14/10 thêm transport cho Session, marker tài khoản đã xóa và các
bảng user block/push. Nên triển khai trên staging trước database đang dùng chung.

Sao chép `apps/mobile/.env.example` thành `apps/mobile/.env`, thay IP mẫu bằng IP
LAN của máy chạy API hoặc URL staging HTTPS. Điện thoại cần truy cập được API đó;
`localhost` trên điện thoại là chính điện thoại. Cấu hình socket dùng API host,
không đi qua proxy web. Các giá trị `EXPO_PUBLIC_*` đều công khai trong binary.

Mở terminal thứ hai từ root:

```sh
pnpm dev:mobile
```

Lệnh này phục vụ development client. Để tạo client bằng EAS:

```sh
cd apps/mobile
pnpm dlx eas-cli login
pnpm dlx eas-cli init
cd ../..
pnpm --filter @remarket/mobile build:development
```

Lấy project ID từ EAS init và cấu hình `EXPO_PUBLIC_EAS_PROJECT_ID`
trong môi trường mobile/EAS. Cài binary
development lên thiết bị rồi mở Metro. Build iOS cho thiết bị thật cần tài khoản
Apple và signing credentials phù hợp. Windows có thể phục vụ Metro và dùng cloud
build; chạy iOS Simulator/local Xcode cần macOS.

Nếu đã có Android SDK hoặc đang dùng macOS với Xcode, có thể chạy local:

```sh
pnpm --filter @remarket/mobile android
pnpm --filter @remarket/mobile ios
```

## Chức năng

- Khám phá, tìm kiếm, danh mục, tỉnh thành, tình trạng, khoảng giá và sắp xếp.
- Chi tiết/gallery, hồ sơ người bán, yêu thích và giỏ hàng.
- Đăng ký/login, SecureStore session, khôi phục khi mở lại/resume, logout/all devices,
  cập nhật hồ sơ/avatar, yêu cầu admin xác minh email, quên/reset mật khẩu.
- Đăng/sửa/gửi duyệt/ẩn/xóa tin theo allowed actions; chọn/chụp/chuyển ảnh JPEG,
  resize trước upload; làm mới preview có kiểm tra chủ sở hữu khi URL hết hạn.
- Checkout nhiều người bán, COD/gặp mặt, giữ nguyên payload/key khi kết quả chưa rõ;
  đơn mua/bán, hành động có version, timeline và review.
- Chat text, pagination, retry cùng client message ID, read receipts theo phần đang
  hiển thị; Socket.IO foreground và đồng bộ REST khi resume/reconnect.
- Notification inbox/push, support tickets, báo cáo, block/unblock và account deletion.
- Mua ngay riêng món đang xem; lọc giao nhận, trạng thái đơn/tin/ticket và thông báo
  chưa đọc; đổi thứ tự/ảnh đại diện tin đăng; phân trang đánh giá người bán.
- Quản trị: tổng quan theo khoảng ngày; người dùng/khóa/mở khóa; xác minh email;
  duyệt/từ chối/hạn chế tin có version; tạo/sửa/kích hoạt danh mục; xử lý báo cáo;
  ẩn đánh giá; phân công/phản hồi/giải quyết ticket; hủy đơn qua hỗ trợ với bằng
  chứng giao nhận/thỏa thuận thanh toán; tra cứu nhật ký và bộ lọc nâng cao.

Admin đăng nhập cùng màn hình, được chuyển đến `/admin`. Menu Tài khoản cũng có
Trang quản trị. Layout chỉ mở với ADMIN/ACTIVE; server vẫn xác thực từng request.
Web và mobile dùng chung `adminEndpoints` trong `@remarket/api-client`.

Link app: `remarket://products/<UUID>`, `remarket://orders/<UUID>`,
`remarket://messages/<UUID>`, `remarket://reset-password?token=...`,
`remarket://verify-email?token=...`. Link đến nội dung riêng yêu cầu login rồi quay
về route được cho phép; link không cấp quyền truy cập. Email từ luồng mobile có
link HTTPS dự phòng và link mở app. Xác minh email vẫn phải được admin duyệt.

## Push

Remote push cần development build, EAS project ID và credentials FCM/APNs.
App xin permission khi người dùng bấm bật thông báo. Khi đã được cho phép, app có
thể đăng ký token ở lần mở sau; lựa chọn tắt được giữ riêng theo user trên thiết bị.

Backend bật `MOBILE_PUSH_ENABLED=true` và chạy worker. `EXPO_PUSH_ACCESS_TOKEN`
nếu dùng thuộc backend; không đưa vào app. Delivery có bảng riêng với claim/lease,
ticket/receipt, backoff và xử lý DeviceNotRegistered, không phụ thuộc việc event
realtime đã processed. Worker kiểm tra session/account và block trước khi gửi.
Payload chỉ chứa notification/reference IDs và thông báo chung, không có nội dung
chat hay JWT. Cửa sổ tạo push là 24 giờ và chỉ cho notification sau lúc đăng ký;
inbox REST vẫn giữ các notification trước đó.

Đăng xuất offline xóa credential trên thiết bị nhưng có thể chưa revoke server
session. App thông báo giới hạn này; khi kết nối lại, có thể đăng nhập tài khoản
cũ và dùng logout-all. Backend từ chối gắn push token còn thuộc phiên khác đang
hoạt động để tránh đổi quyền sở hữu chỉ dựa trên token hoặc installation ID.

## Xóa tài khoản

User nhập lại mật khẩu và xác nhận thao tác. Đơn chưa kết thúc hoặc ticket đang
mở phải được xử lý trước. Backend xóa/anonymize hồ sơ và nội dung trực tiếp, thu
hồi phiên/token/push, xếp job xóa ảnh và giữ các tham chiếu giao dịch dưới user
tombstone. Tài khoản admin cần xử lý chuyển quyền riêng. User đã xóa không thể
được mở khóa hay dùng phiên còn sót lại để truy cập.

Web resource dùng chung: `/delete-account`. Trước phát hành store, cần công bố
privacy/terms/support và chính sách lưu các tham chiếu giao dịch/audit phù hợp với
vận hành thực tế; cấu hình verified App Links/Universal Links theo domain của dự án
nếu thay custom scheme cho các link nhạy cảm.

## Kiểm tra và build

```sh
pnpm --filter @remarket/mobile typecheck
pnpm --filter @remarket/mobile lint
pnpm --filter @remarket/mobile test
pnpm --filter @remarket/mobile doctor
pnpm build:mobile
pnpm --filter @remarket/mobile build:preview
```

`build:mobile` export JS/Hermes bundles Android/iOS; nó không tạo APK/IPA.
Preview/production nên dùng staging/production HTTPS. Production config từ chối
API không phải HTTPS. `eas.json` có development/preview/production profiles;
chưa bật EAS Update. Bundle IDs mặc định `com.remarket.app` cần xác nhận theo
tài khoản phát hành trước store build.

Native folders do Expo prebuild tạo và được gitignore. EAS tái tạo từ app config.
Metro chỉ tùy chỉnh resolve `.js` → `.ts` trong hai source package của workspace;
giữ Node-compatible imports cho API build và cấu hình monorepo mặc định còn lại.

## Khi web đăng nhập được nhưng mobile không được

Đối chiếu API của web đang mở với `EXPO_PUBLIC_API_BASE_URL`, không chỉ địa chỉ
frontend. Web Vercel có thể proxy đến Render trong khi app vẫn gọi API LAN.
Hai server phải dùng đúng database và phiên bản migration; API phục vụ mobile
cần có `/api/v1/auth/mobile/*`. Nếu endpoint trả 404, triển khai backend hỗ trợ
mobile trước khi đổi URL app sang server đó. Sau khi đổi `.env`, khởi động lại
Metro và reload app. Không trim hoặc đổi hoa/thường mật khẩu để tránh lỗi nhập liệu;
dùng nút hiện mật khẩu trên màn đăng nhập để kiểm tra ký tự.

pnpm dev:mobile:go