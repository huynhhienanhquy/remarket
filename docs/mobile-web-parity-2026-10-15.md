# Mobile đồng bộ với web — 15/10/2026

## Phạm vi cập nhật

Ứng dụng Expo native cho Android/iOS được phát triển từ giao diện web hiện tại,
bao gồm cả khu vực quản trị. Sử dụng API, DTO, validation và quy tắc quyền thật
của ReMarket; không thêm mock runtime hoặc thay đổi database trong đợt này.

Màu lấy từ `apps/web/tailwind.config.js`: nền `#F5F7FA`, chữ `#18313B`,
thương hiệu `#0F766E`, nền chọn `#E8F6F3`, viền `#E1E8EE`; card 12px,
điều khiển 8px, vùng bấm ít nhất 44px. Cấu trúc tài khoản theo nhóm trên web.

## Đối chiếu chức năng

| Nhóm web | Mobile | Nội dung |
|---|---|---|
| Trang chủ / tìm kiếm | Tab Khám phá | Hero, danh mục thật và danh mục con, lưới hai cột điện thoại/ba cột tablet, tìm kiếm, tỉnh thành, giá, tình trạng, giao nhận, sắp xếp, phân trang, kéo để tải lại. |
| Chi tiết tin đăng | `/products/[id]` | Gallery, ảnh toàn màn hình, thumbnail, giá, tình trạng, thời gian sử dụng, phí, danh mục, hồ sơ người bán, thanh mua ngay/chat/giỏ cố định; quản lý tin riêng theo capabilities. |
| Hồ sơ công khai | `/users/[id]` | Avatar, ngày tham gia, khu vực, số giao dịch, điểm và số đánh giá thật; tab sản phẩm/đánh giá, phân trang độc lập. |
| Đăng nhập/đăng ký/khôi phục | `/login`, `/register`, `/reset-password`, `/verify-email` | Native session/SecureStore hiện có, validation dùng chung, xác nhận mật khẩu mới, login return path có kiểm tra, định tuyến theo vai trò/trạng thái. |
| Hồ sơ và cài đặt | Tab Tài khoản | Hồ sơ trong bảng trượt, avatar, tên, điện thoại, tỉnh thành, địa chỉ; thông báo, đổi mật khẩu qua email, đăng xuất/tất cả thiết bị, chặn/bỏ chặn, xóa tài khoản. |
| Tin đăng của tôi | `/my-products`, tab Đăng bán, `/edit-product/[id]` | Bộ lọc trạng thái, hành động theo allowed_actions, upload/chụp ảnh; đổi thứ tự và chọn ảnh đại diện; MEETUP đặt phí 0; xử lý xung đột phiên bản. |
| Yêu thích | Tab Yêu thích | Lưới ảnh, lưu/bỏ lưu trên card, kể cả bỏ tin đã bị ẩn mà không hiển thị nội dung tin. |
| Giỏ / checkout / mua ngay | `/cart`, `/checkout?product_id=…` | Chọn một phần giỏ, nhóm seller, phương thức chung, phí COD cao nhất mỗi seller, MEETUP miễn phí, thông tin giao nhận, validation; mua ngay chỉ món đang xem. |
| Đơn mua/bán | `/orders`, `/orders/[id]` | Chọn vai trò, lọc trạng thái, snapshot, tiền hàng/phí/tổng, hạn xác nhận, vận đơn, timeline/lý do; thao tác version; xác nhận nhận hàng/thanh toán; đánh giá sau hoàn tất, chat/hỗ trợ. |
| Chat | Tab Tin nhắn, `/messages/[id]` | Badge thật, avatar/preview, lịch sử phân trang, danh sách đảo để bắt đầu ở tin mới, giữ vị trí khi tải lịch sử; retry ID cũ và read receipts theo vùng hiển thị; liên kết hồ sơ/sản phẩm. |
| Thông báo | `/notifications` | Tất cả/chưa đọc, ngày giờ, đánh dấu đọc/tất cả, liên kết đối tượng và phân trang theo tổng thật. |
| Hỗ trợ / báo cáo | `/support/*`, `/reports` | Lọc ticket, tạo/chọn đơn/phản hồi/đóng theo quyền; hiển thị kết luận/người xử lý; báo cáo với lý do và mô tả do người dùng nhập, xem kết quả báo cáo. |
| Admin tổng quan | `/admin` | Khoảng ngày, số liệu thật, trạng thái sản phẩm, hàng chờ tin/ticket, menu quản trị. |
| Admin người dùng / email | `/admin/users`, `/admin/email-verifications` | Tìm kiếm/lọc, chi tiết người dùng, khóa có lý do/mở khóa, duyệt email. |
| Admin sản phẩm | `/admin/products` | Lọc trạng thái/danh mục/người bán/người xử lý/ngày; gallery và nội dung, duyệt/từ chối/hạn chế/gỡ hạn chế với version đang xem. |
| Admin danh mục | `/admin/categories` | Cây hai cấp, tìm kiếm/lọc, tạo/sửa/chuyển cha, kích hoạt/vô hiệu hóa. |
| Admin báo cáo / đánh giá | `/admin/reports`, `/admin/reviews` | Lọc, kết luận chấp nhận/từ chối, hành động kèm theo; lọc sao/hiển thị/nội dung và ẩn đánh giá có lý do. |
| Admin hỗ trợ | `/admin/support` | Phân công, nhận xử lý, phản hồi, tiến trình, kết luận/đóng; đơn liên quan và timeline; hủy đơn với version, kết quả giao hàng/thỏa thuận thanh toán khi cần. |
| Admin audit | `/admin/audit` | Hành động, đối tượng, người thực hiện, lý do, metadata và bộ lọc ID/ngày; chỉ đọc. |

## Các điểm bảo toàn nghiệp vụ

- Mua ngay không thêm các món khác trong giỏ vào payload. Checkout chỉ lấy món
  khả dụng được chọn và lấy giá/fee từ response hiện tại, không dùng float.
- `CheckoutIntent.current` giữ payload/key sau phản hồi không rõ, kể cả khi giỏ
  được refetch và món đã chuyển trạng thái. Thử lại gửi đúng yêu cầu cũ; khi có
  lỗi nghiệp vụ chắc chắn, làm mới giá/khả dụng và yêu cầu bấm xác nhận lại.
  Intent hiện nằm trong bộ nhớ của màn checkout; chưa phục hồi qua việc tắt app.
- Khóa tài khoản đưa app về khu vực hạn chế. Admin layout chỉ mount chức năng
  với ADMIN/ACTIVE. Server vẫn kiểm tra quyền từng request. Policy denial cập
  nhật lại identity, không tự gửi lại mutation bị từ chối.
- Web/mobile cùng dùng `adminEndpoints` từ `@remarket/api-client`. Mọi thao tác
  quản trị giữ nguyên API thật, reason, expected_version và xác nhận người dùng.
- Tất cả dữ liệu riêng vẫn được clear theo thế hệ native session. Link quay lại
  chỉ chấp nhận route và tham số được cho phép, không nhận URL ngoài hoặc token.
- Ảnh fallback gắn với URI gốc để không hiển thị nhầm ảnh sau khi chuyển gallery.

## Kiểm tra tự động

Đồng bộ các bản vá SDK 57 theo Expo Doctor: Expo 57.0.29, Router 57.0.27,
Constants 57.0.22, Linking 57.0.13, Notifications 57.0.23 và Metro runtime
57.0.17. Khai báo rõ peer React DOM 19.2.3, Worklets 0.10.1 và Metro config
0.86.3 để tránh pnpm tự chọn phiên bản native không tương thích.

Nếu đã cài development client cũ, cần build/cài lại client sau cập nhật native
dependencies. Expo Go vẫn cần phiên bản hỗ trợ SDK 57 như README.

Các lệnh chạy từ `D:\remarket`:

| Lệnh | Kết quả |
|---|---|
| `pnpm --filter @remarket/mobile typecheck` | Exit 0. |
| `pnpm --filter @remarket/mobile lint` | Exit 0, không lỗi/cảnh báo lint. |
| `pnpm --filter @remarket/mobile test` | 6 file, 26 test qua. |
| `pnpm --filter @remarket/api-client typecheck` | Exit 0. |
| `pnpm --filter @remarket/api-client lint` | Exit 0. |
| `pnpm --filter @remarket/api-client test` | 3 file, 18 test qua. |
| `pnpm --filter @remarket/web exec tsc -p tsconfig.json --noEmit` | Exit 0, không output. |
| `pnpm --filter @remarket/web test` | 38 file, 211 test qua, bao gồm admin qua shared adapter. |
| `pnpm --filter @remarket/mobile build` | Export Hermes Android/iOS thành công; không phải APK/IPA. |
| `node node_modules/expo-doctor/bin/expo-doctor.js` trong `apps/mobile` | 21/21 kiểm tra qua, không vấn đề. |

Ở lượt kiểm tra cuối, chạy trực tiếp binary Node tương ứng trong
`apps/mobile` để tránh pnpm 11 tự chạy lại install song song trước mỗi script:

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run
node node_modules/expo/bin/cli export --platform all
node node_modules/expo-doctor/bin/expo-doctor.js
```

Web được xác nhận lại bằng `node node_modules/vitest/vitest.mjs run --maxWorkers=2
--reporter=dot` trong `apps/web`: 211/211 test qua. Một lượt chạy nhiều worker
song song Metro gặp timeout ở AccountNavigation; lượt chạy giới hạn worker qua
toàn bộ suite, không tăng timeout hoặc sửa test để bỏ qua lỗi.

Test mới kiểm tra giới hạn/khoảng giá, đổi thứ tự ảnh không mất storage path,
checkout nhiều seller/chọn một phần/phương thức không tương thích/thông tin nhận
hàng, giữ key/payload sau retry, redirect an toàn theo vai trò, version và bằng
chứng hủy đơn quản trị, policy denial không lặp mutation.

## Kiểm tra thiết bị còn cần thực hiện

Máy hiện không có Android device kết nối hoặc AVD được cấu hình (`adb devices`
và `emulator -list-avds` trả rỗng). Chưa xác nhận bằng thao tác native hoặc ảnh
chụp thực tế trên thiết bị. Không coi export/unit test là kiểm thử E2E native.

Khi chạy `pnpm dev:mobile:go`, kiểm tra lần lượt:

1. Khám phá tại 360px và tablet; safe area, font lớn, bộ lọc có tìm kiếm.
2. Gallery, chuyển ảnh, mở/đóng toàn màn hình, thanh mua hàng khi mô tả dài.
3. Mua ngay khi giỏ đã có món khác; COD/MEETUP nhiều seller; đổi giá hoặc mất
   mạng sau submit, thử lại không tạo checkout mới.
4. Upload/chụp/đổi thứ tự ảnh, sửa tin có xung đột phiên bản; xác minh email.
5. Buyer/seller chuyển đơn, nhận đủ hàng/thanh toán và review chọn sao rõ ràng.
6. Chat khi có bàn phím, tải lịch sử giữ vị trí, đọc đúng tin đang nhìn, reconnect.
7. Các bảng trượt lồng nhau trên iOS/Android và xác nhận destructive action.
8. Admin đầy đủ các khu vực; tài khoản USER/LOCKED và admin bị đổi quyền.

Push FCM/APNs, native email links và APK/IPA vẫn theo cấu hình EAS/development
build trong [README mobile](../apps/mobile/README.md). Đợt này không deploy API,
không chạy migration hay kiểm thử trên database dùng chung.
