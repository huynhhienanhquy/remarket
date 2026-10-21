# Đồng bộ UI mobile với web mobile-first

Ngày: 21/10/2026.

Nguồn đối chiếu là giao diện đang được triển khai trong `apps/web/src`, đặc
biệt HomePage, MarketplaceHeader, MobileBottomNav, ProductCard, AuthShell,
AccountShell và bộ token trong `tailwind.config.js` cùng `styles/typography.css`.
App tiếp tục dùng React Native/Expo và API hiện có.

## Thay đổi

- **Trang chủ:** tách khỏi tìm kiếm; cùng hero và hai CTA với web, tối đa sáu
  danh mục thật trong lưới ba cột, 10 sản phẩm mới nhất, khối hướng dẫn ba bước
  và footer hỗ trợ. Skeleton và lỗi được hiển thị riêng theo section.
- **Tìm kiếm:** route `/products` nằm trong tab layout nhưng ẩn khỏi thanh tab.
  Nhận từ khóa/danh mục từ trang chủ. Thanh tìm kiếm cố định; bộ lọc và sắp xếp
  nằm cùng hàng. Các điều kiện đã áp dụng có nhãn xóa riêng. Sheet giữ nháp,
  chỉ cập nhật kết quả khi áp dụng; nút đặt lại/áp dụng nằm cố định dưới cùng.
- **Shell:** logo cùng dạng chữ R trên nền teal như web; header khám phá và
  header gọn cho tác vụ; thanh tab 64px cộng safe area, icon nét 20px và nền
  active nhẹ. Form đăng tin ẩn thanh tab để dành chỗ cho hành động của form.
- **Sản phẩm:** ảnh card/gallery 4:3, tiêu đề hai dòng, giá màu chữ chính,
  condition và dòng khu vực/thời gian. Tim tròn trắng, màu đỏ khi đã lưu;
  trạng thái giữ chỗ/đã bán có badge. Tin bị ẩn/hạn chế dùng placeholder.
  Lưới đo chiều rộng vùng chứa để chia cột, thay vì chỉ suy ra từ màn hình.
- **Auth:** logo, tiêu đề, form rộng tối đa 420px và link về khám phá; ô mật
  khẩu có nút hiện/ẩn tại chỗ, đăng ký dùng checkbox có trạng thái truy cập.
- **Tài khoản:** heading card cùng mô tả cho yêu thích, tài khoản, đơn hàng,
  thông báo, tin đăng, báo cáo và hỗ trợ. Danh sách hội thoại có avatar dự
  phòng, thời gian và badge chưa đọc; empty state dùng icon đơn sắc.
- **Form/giao dịch:** nhóm thông tin đăng tin thành các card; nút lưu và nút
  đặt hàng cùng tổng tiền nằm trong footer có safe area. Bong bóng chat và
  ô soạn tin gọn hơn. Payload, quyền và cơ chế chống gửi đơn trùng được giữ.
- **Quản trị:** menu mở bằng sheet từ header, dùng chung cấu hình điều hướng
  với dashboard; màn danh sách dùng heading card thống nhất.

Các component chính nằm trong `apps/mobile/src/components/ui.tsx`,
`MarketplaceHeader.tsx`, `AuthScreen.tsx`, `Sheet.tsx` và `SelectField.tsx`.
Không thêm thư viện vào dependency của app cho thay đổi UI này.

## Kiểm tra

- `pnpm --filter @remarket/mobile typecheck`.
- `pnpm --filter @remarket/mobile lint`.
- `pnpm --filter @remarket/mobile test`: 6 file, 26 test thành công.
- `pnpm --filter @remarket/mobile build`: export Hermes bundle Android và iOS.
- Harness React Native Web trong `.artifacts/mobile-ui-preview` render chính
  các component của app với fixture kiểm thử và adapter thay thế module native.
  Kiểm tra trang chủ, tìm kiếm, yêu thích, hội thoại, tài khoản, đăng nhập và
  form đăng tin tại 360px, 390px, 768px: không tràn ngang hay control vượt mép.
- Kiểm tra bộ lọc sau khi animation kết thúc: footer nằm trong viewport; khoảng
  giá sai giữ sheet mở và báo lỗi; đóng sheet bỏ nháp; áp dụng/xóa nhãn lọc
  cập nhật trạng thái. Kiểm tra hiện/ẩn mật khẩu giữ nguyên nội dung, checkbox
  đăng ký, favorite của guest giữ return route và footer mua hàng/checkout tại
  360px, 390px. Không có lỗi JavaScript trong các lượt kiểm tra này.

Harness và fixture chỉ nằm trong thư mục kiểm thử được gitignore; không được
bundle vào app. Kiểm tra trình duyệt xác nhận bố cục và tương tác component,
không thay thế kiểm tra bàn phím, safe area và điều hướng trên thiết bị thật.
Chưa chạy APK/IPA trên thiết bị Android/iOS trong lần cập nhật này.
