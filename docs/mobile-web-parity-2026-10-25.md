# Đồng bộ app với web mobile — 25/10/2026

Nguồn đối chiếu: mã nguồn web đang có trong workspace (`apps/web/src`), gồm
MobileBottomNav, MobileHeaderActions, AccountLinks, Footer và các trang Giỏ hàng,
Đặt hàng, Đơn mua/bán, Thông báo. App vẫn là Expo/React Native dùng API thật.

## Những phần cập nhật

- Thanh điều hướng dùng đúng năm mục: **Khám phá, Yêu thích, Đăng bán, Tài khoản,
  Menu**. Đặt ở root để dùng cả trên các danh sách tài khoản, giỏ hàng, hỗ trợ
  và hồ sơ người bán. Chi tiết sản phẩm/đơn/chat, form tin và checkout dành
  không gian cho hành động riêng. Thanh điều hướng ẩn khi bàn phím mở.
- Menu mở bảng trượt với nhóm Tài khoản, Mua sắm, Bán hàng, Giao tiếp và lối
  vào quản trị theo vai trò. Tài khoản bị khóa vẫn mở được cả đơn mua và đơn
  bán, thông báo và hỗ trợ. Khách được chuyển đến đăng nhập với đích quay lại.
- Header khám phá và header gọn cùng ba tiện ích theo thứ tự **Tin nhắn,
  Thông báo, Giỏ hàng**, dùng chung số đếm. Nút quay lại dùng lịch sử native
  và có đích dự phòng khi mở link trực tiếp. Footer khám phá, tìm kiếm, hồ sơ
  công khai và sản phẩm có mô tả, hỗ trợ và danh mục thật như web.
- Giỏ hàng có màn riêng: nhóm người bán, ảnh/thông tin món đồ, tình trạng
  không khả dụng, chọn/bỏ chọn, xóa, tạm tính và nút sang đặt hàng. Tổng chưa
  cộng phí giao nhận trước khi người mua chọn phương thức.
- Checkout nhận `items` từ giỏ, kiểm tra tối đa 50 UUID và chỉ gửi các món đã
  chọn còn khả dụng. Tham số sai không được hiểu thành mua cả giỏ. Đăng nhập
  giữ lại danh sách chọn; mua ngay tiếp tục chỉ lấy `product_id` đang xem.
  Phần thay đổi giỏ nằm ở màn giỏ, phần giao nhận và xác nhận nằm ở checkout.
- Giữ nguyên payload/idempotency key khi chưa rõ kết quả đặt hàng, phí COD
  cao nhất theo seller, MEETUP miễn phí và kiểm tra lại giá/khả dụng từ API.
  Các thao tác đặt hàng, xóa giỏ, đánh dấu thông báo bị vô hiệu khi ngoại tuyến.
- Đơn mua/bán lấy vai trò từ route thay vì giữ vai trò cũ khi mở lại từ Menu.
  Bộ lọc và trang được đặt lại khi đổi vai trò. Card đơn có ảnh snapshot, đối
  tác, giá, giao nhận, trạng thái và thời gian; trạng thái trống theo từng vai
  trò/bộ lọc. Chi tiết đơn nhóm ảnh/tình trạng snapshot, số tiền và giao nhận.
- Thông báo dùng card bấm được, icon và dấu chưa đọc. Đích mở bao gồm xác minh
  email cho admin, tài khoản, tin đăng của tôi, báo cáo, hỗ trợ và tin nhắn hệ
  thống. Push chờ phục hồi phiên trước khi xác định đích theo vai trò. Thông
  báo không có đích hợp lệ vẫn đọc được toàn bộ trong bảng trượt.
- Tin đăng của tôi dùng empty state và phân trang chung; nút xóa khóa trong
  lúc xử lý. Bảng trượt có thể đóng bằng vùng nền hoặc nút đóng. Safe area
  của footer giỏ hàng tránh cộng lặp với thanh điều hướng.

## Đối chiếu các luồng hiện có

Các luồng dưới đã có mã native và tiếp tục dùng endpoint/DTO dùng chung. Bảng
này là đối chiếu mã nguồn, không khẳng định đã chạy E2E thiết bị cho mọi luồng.

| Web | App |
|---|---|
| Trang chủ, tìm kiếm, chi tiết, người bán | `/`, `/products`, `/products/[id]`, `/users/[id]` |
| Đăng nhập, đăng ký, quên/reset mật khẩu, xác minh email | `/login`, `/register`, `/reset-password` (chế độ gửi email hoặc có token), `/verify-email` |
| Hồ sơ, avatar, bảo mật, xóa tài khoản | `/account`, các bảng hồ sơ/cài đặt/xóa tài khoản |
| Yêu thích, giỏ, checkout/mua ngay | `/favorites`, `/cart`, `/checkout?items=…`, `/checkout?product_id=…` |
| Đăng/sửa/gửi duyệt/ẩn/xóa tin và ảnh | `/my-products`, `/sell`, `/edit-product/[id]` |
| Đơn mua/bán, hành động, timeline, review | `/orders?role=buyer`, `/orders?role=seller`, `/orders/[id]` theo vai trò DTO |
| Hộp thư, chat realtime, retry, đã đọc | `/messages`, `/messages/[id]` |
| Thông báo, hỗ trợ, báo cáo | `/notifications`, `/support/*`, `/reports` |
| Quản trị, người dùng và tin của người dùng, tin nhắn hệ thống | `/admin`, `/admin/users`, các bảng chi tiết và hành động hiện có |
| Xác minh email, kiểm duyệt, danh mục, báo cáo, review, hỗ trợ, audit | Các route tương ứng dưới `/admin/*` |

## Kiểm tra

| Lệnh | Kết quả |
|---|---|
| `pnpm --filter @remarket/mobile typecheck` | Exit 0, không lỗi TypeScript |
| `pnpm --filter @remarket/mobile lint` | Exit 0, không lỗi/cảnh báo lint |
| `pnpm --filter @remarket/mobile test` | 8 file, 33 test qua |
| `pnpm --filter @remarket/web exec tsc -p tsconfig.json --noEmit` | Exit 0, không output |
| `pnpm --filter @remarket/mobile build` | Export Hermes Android/iOS thành công |

Các lần kiểm tra đầu trong sandbox báo thiếu thư viện TypeScript/picomatch.
Nguyên nhân là quyền đọc dependency; chạy các lệnh với quyền phù hợp đã qua,
không cần thay phiên bản dependency.

Harness React Native Web trong `.artifacts/mobile-ui-preview` dùng chính các
component app với fixture/adapter chỉ dành cho kiểm thử. Kiểm tra tại **360,
390, 768px** cho trang chủ, tìm kiếm, yêu thích, hộp thư, tài khoản, giỏ, đơn và
thông báo: không tràn ngang hoặc control vượt mép, không lỗi JavaScript. Kiểm
tra Menu chuyển cả hai vai trò trên cùng màn đơn, giỏ chỉ chuyển món đã chọn,
checkout ẩn thanh điều hướng và footer trong viewport, đích quay lại của khách.
Kiểm tra thêm bộ lọc, hiện/ẩn mật khẩu, checkbox đăng ký và favorite của khách
tại 360/390px. Ảnh render nằm cùng thư mục harness; không bundle fixture vào app.

Chưa kiểm tra APK/IPA, bàn phím/safe area trên thiết bị thật hoặc push FCM/APNs.
Máy chạy kiểm tra không tìm thấy `adb`/`emulator` trong PATH. Export bundle
không tạo APK/IPA. Cách chạy Expo Go/development build nằm trong README mobile.
