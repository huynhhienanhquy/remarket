# ReMarket – Đặc tả UI/UX để triển khai frontend

Phiên bản: 1.0  
Ngày: 05/10/2026  
Tài liệu nghiệp vụ: [detail-project.md](./detail-project.md) phiên bản 2.0.

## 1. Cách sử dụng đặc tả

Tài liệu này quy định giao diện React + TypeScript + Vite + Tailwind CSS cho ReMarket. Đọc cùng detail-project.md trước khi code. Nghiệp vụ, quyền, validation, trạng thái, phí và thanh toán theo detail-project.md; tài liệu này định nghĩa cách trình bày và tương tác tương ứng.

Các lựa chọn màu sắc, bố cục, component và câu chữ dưới đây là thiết kế đề xuất thống nhất cho MVP. Chỉ xây light mode. Giao diện tiếng Việt; enum và code bằng tiếng Anh. Không tự thêm ví, thanh toán online, mã giảm giá, hàng nhiều số lượng, nhắn ảnh, chat admin tự do, biểu đồ hay thống kê không có dữ liệu.

Không gọi API mới do tự suy đoán. Mục 25 ghi rõ dữ liệu response cần có để UI hoạt động; đó là yêu cầu contract frontend/backend cần hiện thực, không phải xác nhận API đã tồn tại. Khi backend chưa sẵn sàng, dùng adapter mock có cùng shape và các trạng thái xác định; không trộn mock và dữ liệu thật trong cùng phiên.

## 2. Định hướng thị giác

Cảm giác mong muốn: marketplace đồ cũ gần gũi, rõ giá, dễ tìm, giúp người dùng tập trung vào món đồ và người bán. Không sử dụng gradient trang trí, glassmorphism, bóng đổ dày hoặc banner chiếm cả màn hình.

Màu xanh lá đậm cho thương hiệu và hành động chính; nền trắng ngà nhẹ; màu cam đất chỉ dành cho điểm nhấn phụ. Ảnh thật của sản phẩm là yếu tố thị giác chính. Dùng cùng một bộ icon nét, kích thước 20px, stroke nhất quán; không dùng emoji làm icon điều hướng.

Logo MVP là chữ ReMarket với biểu tượng hai mũi tên vòng đơn giản bằng SVG. Chữ Re dùng màu text, Market dùng brand. SVG logo là tài sản code, không phải ảnh raster được sinh ngẫu nhiên.

### 2.1. Token bắt buộc

| Token | Giá trị | Sử dụng |
|---|---|---|
| color.page | #F7F8F5 | Nền ứng dụng |
| color.surface | #FFFFFF | Card, form, header |
| color.surface-subtle | #F0F3EE | Vùng phụ, ảnh chưa tải |
| color.text | #17251D | Tiêu đề/nội dung |
| color.text-muted | #56645B | Metadata |
| color.brand | #17633F | CTA chính, link |
| color.brand-hover | #104C30 | Hover CTA |
| color.brand-soft | #E8F3EC | Selected row, badge tích cực |
| color.border | #DDE4DC | Viền card, divider |
| color.input-border | #829087 | Biên input tương tác |
| color.accent | #B45309 | Điểm nhấn, cảnh báo |
| color.warning-bg | #FFF4DA | Background cảnh báo |
| color.danger | #B42318 | Error, destructive |
| color.danger-bg | #FEF0EE | Background lỗi |
| color.info | #245EA8 | Badge đang xử lý |
| color.info-bg | #ECF3FF | Background thông tin |
| color.focus | #245EA8 | Focus ring |

Font Be Vietnam Pro nếu có font được cấp phép đi kèm; fallback system-ui, sans-serif. Không phụ thuộc mạng ngoài để nội dung mới hiển thị được.

| Kiểu chữ | Desktop | Mobile | Weight |
|---|---|---|---|
| Hero | 40/48px | 28/36px | 700 |
| H1 | 30/40px | 24/32px | 700 |
| H2 | 24/32px | 20/28px | 600 |
| H3 | 18/28px | 18/28px | 600 |
| Body | 16/24px | 16/24px | 400 |
| Label/card title | 14/20px | 14/20px | 500 |
| Metadata | 12/18px | 12/18px | 400 |
| Giá card | 18/26px | 16/24px | 700 |
| Giá detail | 32/40px | 28/36px | 700 |

Khoảng cách dùng bội số 4: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px. Border radius: input/button 8px, card 12px, modal 16px, pill 999px. Card mặc định có viền 1px và không shadow; chỉ dropdown/modal và card hover dùng shadow nhẹ.

Z-index: nội dung 0, sticky section 10, header 20, mobile action bar 30, overlay 40, dialog/drawer 50, toast 60. Không tăng z-index rời rạc trên từng page.

Animation 150–200ms opacity/translate tối đa 4px; không parallax. prefers-reduced-motion loại bỏ movement và shimmer.

### 2.2. Breakpoint và kích thước

- Mobile: dưới 640px; kiểm thử tối thiểu 360px.
- Tablet: 640–1023px.
- Desktop: từ 1024px.
- Wide desktop: từ 1280px.
- Public container: max-width 1280px, nằm giữa; padding ngang 16px mobile, 24px tablet, 32px desktop.
- Khoảng dọc giữa section: 32px mobile, 48px desktop.
- Product grid không sidebar: 2 cột mobile, 3 tablet, 4 desktop, 5 wide; gap 12px mobile, 20px còn lại.
- Search grid với sidebar: 2 mobile, 3 tablet, 3 desktop, 4 wide.
- Input/select cao tối thiểu 44px; textarea tối thiểu 120px. Nút có chữ cao 44px; CTA lớn 48px.
- Icon button vùng bấm tối thiểu 44×44px, kể cả icon bên trong chỉ 20px.
- Không có scroll ngang toàn trang. Bảng admin có vùng scroll ngang riêng nếu cần.
- Fixed bottom bar phải cộng env(safe-area-inset-bottom); nội dung có padding-bottom bằng tổng chiều cao bar và 16px.

## 3. App shell và điều hướng

### 3.1. MarketplaceShell

Desktop header cao 80px, nền trắng, viền dưới, sticky top 0. Trong container: logo rộng khoảng 160px → search flex với max-width 520px → icon Tin nhắn/Thông báo/Giỏ hàng → tài khoản → nút xanh “Đăng bán”. Search placeholder “Bạn đang tìm món đồ gì?”, icon tìm và Enter để submit.

Guest thấy “Đăng nhập”, nút “Đăng bán”, Giỏ hàng; không hiện icon tin nhắn/thông báo chưa có quyền. Đăng bán hoặc giỏ chuyển login có returnTo nội bộ an toàn. User đã login có avatar menu: Hồ sơ, Tin đăng của tôi, Đơn mua, Đơn bán, Yêu thích, Hỗ trợ, Đăng xuất. Admin thêm “Trang quản trị”.

Hàng danh mục dưới header cao 44px, không sticky: “Tất cả danh mục”, Điện tử, Thời trang, Nội thất, Sách, Xe cộ khi API có dữ liệu. Chỉ dùng category_id thật; mục không có dữ liệu không tạo link giả. Dropdown cây danh mục không quá hai cấp.

Badge số chưa đọc tối đa “99+”, có aria-label đầy đủ; chỉ hiển thị số thật. MVP có thể bỏ badge chat nếu API chưa cung cấp unread count; không dùng số ngẫu nhiên.

Mobile header gồm hàng logo + icon giỏ + thông báo cao 56px và hàng search 48px trên trang khám phá. Những trang tác vụ sâu dùng header gọn 56px với Quay lại + tiêu đề; không lặp search.

Mobile bottom navigation cao 64px + safe area: Khám phá, Yêu thích, Đăng bán, Tin nhắn, Tài khoản. Mỗi tab gồm icon và label 11–12px. Tab active có text/icon xanh và nền xanh nhạt nhỏ; không dùng nút tròn nổi che nội dung. Trang product detail, checkout, form đăng tin, chat detail và order detail thay bottom nav bằng action/composer riêng khi cần.

Footer chỉ xuất hiện trên trang khám phá và profile công khai: logo, mô tả một câu, link danh mục, “Trung tâm hỗ trợ”. Không render link điều khoản/chính sách trống; chỉ thêm khi có nội dung và route thực. Chat/checkout/admin không có footer marketing.

### 3.2. AccountShell

Dùng header marketplace và container. Desktop có sidebar 220px, gap 32px, content còn lại. Sidebar nhóm:

- Tài khoản: Hồ sơ cá nhân.
- Mua sắm: Yêu thích, Giỏ hàng, Đơn mua.
- Bán hàng: Tin đăng của tôi, Đơn bán.
- Giao tiếp: Tin nhắn, Thông báo, Hỗ trợ.

Mục active nền brand-soft, text brand, font 600. Không thêm menu dashboard cá nhân nếu không có đặc tả dữ liệu.

Mobile sidebar chuyển thành menu tài khoản ở /account; các page con có tiêu đề và nút Quay lại. Không nhét toàn bộ menu thành dãy tab ngang quá dài.

### 3.3. AuthShell

Desktop hai cột 45%/55% trên nền page. Cột trái brand-soft với logo, câu “Món đồ cũ. Giá trị mới.” và ba dòng lợi ích tĩnh; không có số người dùng giả. Cột phải form max-width 420px. Mobile bỏ cột minh họa, logo trên form, padding 24px/16px. Footer nhỏ “Quay lại khám phá”.

### 3.4. AdminShell

Sidebar trái 240px, header 64px, main padding 24px. Sidebar: Tổng quan, Người dùng, Sản phẩm, Danh mục, Báo cáo, Đánh giá, Hỗ trợ, Nhật ký. Bottom sidebar có “Về marketplace” và Đăng xuất.

Tablet/mobile dùng sidebar drawer mở từ nút menu. DataTable không biến mọi cột thành font nhỏ: ưu tiên tên/trạng thái/thao tác và chuyển field phụ vào drawer. Header admin luôn nêu khu vực quản trị để tránh nhầm với tài khoản mua bán.

## 4. Component dùng lại và hành vi chung

| Component | Cấu tạo / quy tắc |
|---|---|
| Button | primary, secondary outline, ghost, danger; loading giữ nguyên chiều rộng, disabled chống submit kép |
| FormField | label thật, dấu bắt buộc, input, helper, error dưới field; aria-describedby liên kết helper/error |
| SearchInput | icon, clear, submit; không có autocomplete/hot keywords giả |
| MoneyInput | nhập chữ số VND, format khi blur; raw value là chuỗi số nguyên, không float |
| Select/Combobox | label và lựa chọn có keyboard; province/category có tìm trong tập dữ liệu thật |
| Checkbox/Radio | trạng thái focus/checked/disabled, click label được; không thay native semantics bằng div |
| StatusBadge | text + nền/màu phù hợp; trạng thái không chỉ biểu đạt bằng màu |
| ProductCard | ảnh, favorite, tiêu đề, giá, condition, khu vực/ngày đăng |
| UserSummary | avatar, tên, rating/null, số đơn bán hoàn tất; không tự tạo huy hiệu uy tín |
| SectionCard | header optional, body 20–24px desktop/16px mobile, footer actions |
| Tabs | selected theo URL hoặc state; không làm mất filter khi quay lại |
| Pagination | Trước/số trang/Sau, total; page hiện tại aria-current |
| EmptyState | icon đơn sắc, tiêu đề, một câu mô tả, tối đa một primary CTA |
| InlineAlert | icon, title, body, optional action; error vẫn tồn tại đến khi xử lý |
| ConfirmDialog | title, tác động, field lý do nếu cần, Hủy + action; destructive dùng danger |
| Drawer | desktop rộng 480–640px; mobile toàn màn hình, title/close và footer sticky |
| Skeleton | giữ đúng kích thước layout cuối; không thay bằng spinner toàn trang nếu đã có dữ liệu |
| ImageViewer | modal ảnh contain, Prev/Next, counter, Escape, thumbnail chọn ảnh |
| OrderTimeline | các bước/actor/thời gian; không bịa tiến độ hoặc timestamp |
| Toast | mobile dưới header; desktop góc trên phải; success tự đóng sau 4 giây, lỗi quan trọng giữ inline |
| DataTable | header, sortable có chỉ báo, skeleton, empty/error, pagination, row actions |
| ReportDialog / ReviewDialog | dùng lại trên màn hình có quyền; nội dung chi tiết mục 19 |

Dialog/drawer khóa scroll nền, trap focus, trả focus về trigger khi đóng. Escape đóng trừ lúc mutation đang ở pha không được ngắt; đóng overlay không có nghĩa hủy request đã gửi. Khi form dirty, đóng/điều hướng phải xác nhận bỏ dữ liệu. Sau lỗi submit focus error summary hoặc field sai đầu tiên.

Link dùng để điều hướng, button dùng để thao tác. Không lồng button yêu thích bên trong thẻ a bao toàn card; có link ảnh/tiêu đề và button sibling riêng.

## 5. Quy ước hiển thị trạng thái

| Nhóm | Enum | Label UI | Màu |
|---|---|---|---|
| Product | PENDING | Chờ duyệt | warning |
| Product | ACTIVE | Đang bán | brand |
| Product | REJECTED | Bị từ chối | danger |
| Product | RESERVED | Đang được giữ | info |
| Product | SOLD | Đã bán | neutral |
| Product | INACTIVE | Đã ẩn | neutral |
| Product | is_blocked=true | Bị hạn chế | danger; badge bổ sung, không thay status |
| Order | PENDING | Chờ người bán xác nhận | warning |
| Order | CONFIRMED | Đã xác nhận | info |
| Order | SHIPPING | Đang giao | info |
| Order | DELIVERED | Đã ghi nhận giao hàng | info |
| Order | COMPLETED | Hoàn tất | brand |
| Order | CANCELLED | Đã hủy | neutral |
| Report | PENDING / RESOLVED / REJECTED | Chờ xử lý / Đã xử lý / Không chấp nhận | warning/brand/neutral |
| Ticket | OPEN / IN_PROGRESS / RESOLVED / CLOSED | Mới gửi / Đang xử lý / Đã giải quyết / Đã đóng | warning/info/brand/neutral |
| User | ACTIVE / LOCKED | Hoạt động / Bị khóa | brand/danger |

Condition: LIKE_NEW → Như mới; GOOD → Tốt; FAIR → Khá; HEAVILY_USED → Đã sử dụng nhiều. Delivery: COD → Giao hàng, trả tiền mặt; MEETUP → Gặp trực tiếp; BOTH chỉ trên tin đăng → Cả hai hình thức.

Tiền: 1.100.000 ₫, không số thập phân. Rating: 4,8/5 và số review; NULL → “Chưa có đánh giá”, không vẽ 5 sao giả. Ngày ở metadata có thể “2 giờ trước”; title/accessibility và chi tiết dùng dd/MM/yyyy HH:mm theo Asia/Ho_Chi_Minh.

ID order/ticket rút gọn 8 ký tự đầu khi trình bày và có sao chép đầy đủ. Không dùng ID ngắn trong API hoặc so sánh định danh.

## 6. Danh sách màn hình

| ID | Route | Shell | Mục mô tả |
|---|---|---|---|
| UI-01 | / | Marketplace | 7 |
| UI-02 | /products | Marketplace | 8 |
| UI-03 | /products/:id | Marketplace | 9 |
| UI-04 | /users/:id | Marketplace | 10 |
| UI-05 | /login | Auth | 11 |
| UI-06 | /register | Auth | 11 |
| UI-07 | /verify-email | Auth | 11 |
| UI-08 | /forgot-password | Auth | 11 |
| UI-09 | /reset-password | Auth | 11 |
| UI-10 | /account | Account | 12 |
| UI-11 | /account/products | Account | 13 |
| UI-12 | /account/products/new, /account/products/:id/edit | Account | 14 |
| UI-13 | /favorites | Account | 15 |
| UI-14 | /cart | Marketplace | 15 |
| UI-15 | /checkout | Marketplace gọn | 16 |
| UI-16 | /orders, /sales | Account | 17 |
| UI-17 | /orders/:id, /sales/:id | Account | 18 |
| UI-18 | /messages, /messages/:id | Chat | 20 |
| UI-19 | /notifications | Account | 21 |
| UI-20 | /support, /support/new, /support/:id | Account | 22 |
| UI-21 | /admin | Admin | 23.1 |
| UI-22 | /admin/users | Admin | 23.2 |
| UI-23 | /admin/products | Admin | 23.3 |
| UI-24 | /admin/categories | Admin | 23.4 |
| UI-25 | /admin/reports | Admin | 23.5 |
| UI-26 | /admin/reviews | Admin | 23.6 |
| UI-27 | /admin/support | Admin | 23.7 |
| UI-28 | /admin/audit | Admin | 23.8 |
| UI-29 | /403, /404, trạng thái tài khoản/phiên | Theo ngữ cảnh | 24 |

Modal không tạo route riêng: review, report, xác nhận hủy/ẩn/xóa/khóa, gallery và chọn danh mục. Admin detail dùng drawer với query selected=<uuid>; không tự tạo endpoint chỉ vì mở drawer.

## 7. UI-01 – Trang chủ

Thứ tự nội dung từ trên xuống:

1. Header + category navigation.
2. Hero nền brand-soft, radius 16px, cao theo nội dung khoảng 220–260px desktop. Trái 60% có eyebrow “MUA BÁN ĐỒ ĐÃ QUA SỬ DỤNG”, H1 “Món đồ cũ. Giá trị mới.”, mô tả “Tìm món bạn cần, nhường món bạn không còn dùng.” và hai CTA “Khám phá sản phẩm” → /products, “Đăng bán ngay” → form hoặc login. Phải là nội dung tĩnh, không carousel.
3. Phải 40% là khối minh họa SVG/code đơn giản ba thẻ đồ dùng; ảnh minh họa không ngụ ý sản phẩm còn hàng. Mobile bỏ minh họa, giữ CTA rộng vừa nội dung, xếp dọc nếu thiếu chỗ.
4. “Khám phá theo danh mục”: tối đa 6 category cha API, mỗi tile icon + tên. Mobile 3 cột, desktop 6 cột; click → /products?category_id=... Không hiện số lượng nếu API chưa có.
5. “Mới đăng gần đây” + “Xem tất cả”: 10 card từ GET /products?sort=newest&page_size=10. Mobile 2 cột. Không endless scroll trên home.
6. Khối hướng dẫn ba bước: “Đăng tin”, “Trao đổi”, “Giao nhận”; giải thích ngắn không tuyên bố bảo đảm thanh toán.
7. Footer.

Home loading: giữ hero tĩnh, skeleton category và 10 product card. Không có sản phẩm: “Chưa có tin đăng nào” + “Đăng món đồ đầu tiên”. Category lỗi chỉ lỗi tại section; list lỗi có “Tải lại”, không làm mất toàn trang.

### ProductCard chuẩn

Ảnh tỷ lệ 4:3, object-fit cover, background surface-subtle. Favorite icon nền trắng ở góc phải trên. Body padding 12px; title tối đa 2 dòng và giữ chiều cao 40px; giá ngay dưới; condition text/pill nhỏ; dòng cuối khu vực bên trái và thời gian bên phải, ellipsis nếu cần.

Không có giá gạch ngang, % giảm hoặc “freeship” tự tạo. Không hiện nút mua ngay trên card; ảnh/tên mở detail, tim chỉ đổi favorite. RESERVED/SOLD trong danh sách riêng có overlay nhẹ và badge nhưng vẫn đọc được, không khiến nội dung không tương phản.

## 8. UI-02 – Danh sách và tìm kiếm

Desktop bố cục sidebar filter 240px + gap 24px + grid flex. Phía trên: breadcrumb “Trang chủ / Sản phẩm”, H1 “Khám phá sản phẩm” hoặc “Kết quả cho ‘bàn phím’”, tổng kết quả và sort select. Active filter chips ngay dưới, cuối hàng có “Xóa bộ lọc”.

Filter theo thứ tự: Danh mục, Khoảng giá (Từ/Đến + “Áp dụng”), Tình trạng (multi hoặc single theo OpenAPI chốt; MVP chọn single), Khu vực (single), Giao nhận (single). Chọn “Giao hàng” phải match COD hoặc BOTH ở sản phẩm; “Gặp trực tiếp” match MEETUP hoặc BOTH.

Desktop chọn filter đơn cập nhật ngay; price chỉ cập nhật khi Áp dụng hoặc Enter để tránh query trên từng chữ số. Keyword chỉ submit Enter/nút tìm. Mỗi lần thay filter reset page=1. URL lưu q, category_id, min_price, max_price, condition, province_code, delivery_method, sort, page; tên q phải chốt trong OpenAPI theo mục 25.

Mobile bỏ sidebar. Thanh “Bộ lọc (n)” + “Sắp xếp” dưới title; filter mở bottom sheet tối đa 90dvh, nội dung scroll, footer “Đặt lại” + “Áp dụng”. Lựa chọn trong sheet là draft; chỉ khi Áp dụng mới sửa URL/query. Đóng sheet bỏ thay đổi chưa áp dụng.

Grid và phân trang dưới cùng. Khi refetch giữ list cũ, hiển thị chỉ báo nhỏ “Đang cập nhật” và aria-busy; không đổi thứ tự do response query cũ đến trễ. Quay lại từ detail khôi phục URL và vị trí scroll.

Empty filtered: “Không tìm thấy món đồ phù hợp”, mô tả đổi từ khóa/bộ lọc, CTA “Xóa bộ lọc”. Không xóa keyword khi chỉ xóa filter; có nút clear keyword riêng.

## 9. UI-03 – Chi tiết sản phẩm

Desktop breadcrumb → layout 7/5 cột gap 32px. Trái gallery: ảnh chính tỷ lệ 4:3 object-fit contain, background surface-subtle, hàng thumbnail 64×64px scroll ngang khi cần. Click ảnh mở ImageViewer. Thumbnail đầu không bị crop hỏng dữ liệu; active có outline brand.

Phải: condition + trạng thái → H1 title → giá lớn → khu vực/thời gian → thông số category, usage_months nếu có, giao nhận, phí ship → actions. Action chính “Mua ngay”, phụ “Thêm vào giỏ”, full-width “Chat với người bán”; hàng text actions Yêu thích và Báo cáo. Nút cart thành công toast “Đã thêm vào giỏ hàng” có link /cart.

Seller card ngay dưới: avatar 48px, tên link, rating hoặc chưa có, số đơn hoàn tất và ngày tham gia. Không hiển thị email/điện thoại/địa chỉ riêng hoặc badge “Đã xác minh danh tính”.

Bên dưới gallery là “Mô tả sản phẩm”, giữ xuống dòng văn bản thuần. Không có tab “Thông số kỹ thuật” trống hay thông tin tự sinh từ tiêu đề.

Mobile xếp gallery → title/giá → metadata → seller → mô tả. Bottom sticky cao tối thiểu 72px: Chat button outline 44px, icon cart 44px có label accessibility, “Mua ngay” flex. Yêu thích và báo cáo nằm trong nội dung; không nhét thêm vào bar.

| Tình huống | UI/actions |
|---|---|
| Guest + ACTIVE | Xem đầy đủ dữ liệu công khai; thao tác bảo vệ chuyển login rồi quay lại; không tự tạo đơn sau login |
| User đủ quyền + ACTIVE | Mua/chat/cart/favorite/report theo quyền |
| Chủ tin | “Chỉnh sửa tin” khi được sửa + “Quản lý tin”; không mua/chat/tự report |
| RESERVED | Banner “Sản phẩm đang được giữ cho một giao dịch”; bỏ mua/cart; không mở chat mới |
| SOLD | Badge “Đã bán”; bỏ mua/cart; có “Xem sản phẩm khác” |
| PENDING/REJECTED/INACTIVE | Chỉ owner qua màn quản lý; public hiển thị unavailable theo API |
| Blocked/deleted | Public placeholder “Tin đăng không còn khả dụng”, không giữ ảnh/nội dung nhạy cảm trong UI cache |
| Unverified/LOCKED | Banner đúng tình trạng; actions hạn chế theo mục 24 |

Với conversation đã tồn tại, có thể mở lại từ inbox; chỉ hiện “Tiếp tục trò chuyện” trên detail nếu API trả ID đã xác thực, không cố POST tạo conversation cho RESERVED/SOLD.

## 10. UI-04 – Hồ sơ người bán công khai

Header card không ảnh bìa: avatar 80px, tên, tỉnh/thành, ngày tham gia, rating và số đơn bán hoàn tất. Góc phải “Báo cáo người dùng” trong menu; không hiện nếu chính chủ.

Hai tab “Đang bán” và “Đánh giá”, đồng bộ query tab=products/reviews. Grid sản phẩm như mục 7. Review list gồm avatar reviewer nếu API cho phép công khai, tên hiển thị, sao, ngày, comment; không hiện thông tin order riêng tư. Không có nút review từ profile.

Empty: “Người bán chưa có tin đang bán” hoặc “Chưa có đánh giá”. Không có follow, gọi điện, chat không gắn sản phẩm hoặc huy hiệu uy tín ngoài phạm vi.

## 11. UI-05 đến UI-09 – Authentication

Mọi form có title, câu mô tả, label và submit rõ. Validate blur và submit; không báo đỏ ngay khi user vừa gõ ký tự đầu. Password có nút hiện/ẩn với aria-label đổi tương ứng.

| Màn hình | Field và bố cục | Thành công / lỗi |
|---|---|---|
| Login | Một trang /login cho mọi role: Email, Mật khẩu; link “Quên mật khẩu?”; nút “Đăng nhập”; link đăng ký | Role/status từ API: ADMIN ACTIVE → /admin, USER ACTIVE → /, LOCKED → /orders; giữ returnTo nội bộ phù hợp quyền; lỗi chung “Email hoặc mật khẩu không đúng”; không checkbox Remember me giả |
| Register | Họ tên, Email, Số điện thoại, Mật khẩu, Nhập lại mật khẩu; helper ≥12 ký tự và giới hạn byte theo backend; “Tạo tài khoản” | Trạng thái “Kiểm tra email để xác minh tài khoản”; nếu API không cấp phiên, hiện “Đăng nhập để gửi lại email” |
| Verify email | Có token: panel xác minh với nút “Xác minh email” để tránh tiêu thụ token bằng preview link; không token: hướng dẫn mở email và resend nếu login | Thành công “Email đã được xác minh”; hết hạn/không hợp lệ có hướng dẫn gửi lại; token không xuất hiện trong nội dung/log |
| Forgot password | Email; “Gửi liên kết đặt lại” | Luôn “Nếu email có trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.” |
| Reset password | Mật khẩu mới, Nhập lại; token từ link | Thành công dẫn login với “Mật khẩu đã được cập nhật”; token lỗi có link quên mật khẩu |

Không có lựa chọn role trên form; frontend dùng tài khoản API trả về sau xác thực.
Admin chỉ giữ returnTo trong /admin; user không được chuyển vào /admin.
Tài khoản LOCKED chỉ giữ returnTo thuộc khu vực được phép. ReturnTo ngoài hệ
thống, đường dẫn không an toàn hoặc quay lại màn đăng nhập bị loại bỏ.
Phiên đã đăng nhập mở màn auth cũng dùng cùng chính sách điều hướng.
Các guard route và API vẫn kiểm tra quyền; chuyển hướng không thay thế phân quyền.

Trạng thái pending nút không đổi width. Resend cooldown lấy Retry-After hoặc thời điểm server cho phép, không tự hứa “60 giây” khi quota thực là 3 lần/giờ. Mật khẩu không lưu local/session storage và không đi vào URL. Sau tiếp nhận token, xóa token khỏi address bar bằng history replace khi flow đã có token trong memory; không gửi vào analytics/referrer.

## 12. UI-10 – Hồ sơ cá nhân

H1 “Hồ sơ cá nhân”. Card avatar trên đầu: ảnh 80px, nút “Đổi ảnh”, hướng dẫn định dạng/kích thước; preview ảnh mới và trạng thái upload rõ.

Form desktop 2 cột: Họ tên | Số điện thoại; Email readonly + label xác minh | Khu vực; Địa chỉ mặc định full-width. Mobile 1 cột. Footer “Hủy thay đổi” + “Lưu thay đổi”; disabled khi không dirty hoặc đang upload/save. Lỗi từ API map dưới field.

Card “Bảo mật tài khoản”: email verification, link “Đặt lại mật khẩu” dùng flow quên mật khẩu, “Đăng xuất tất cả thiết bị” có confirm. Không tạo màn đổi password yêu cầu current_password khi API không có.

Mobile /account có menu điều hướng mục 3.2 ở sau profile hoặc phần accordion “Quản lý tài khoản”; không khiến form quá khó tìm. User LOCKED thấy panel hạn chế thay cho form chỉnh sửa.

## 13. UI-11 – Tin đăng của tôi

H1 + nút “Đăng tin mới”. Tabs: Tất cả, Chờ duyệt, Đang bán, Bị từ chối, Đang được giữ, Đã bán, Đã ẩn. Không hiển thị tổng từng tab nếu response không có counts; tránh gọi nhiều API chỉ để tạo số.

Desktop list row: thumbnail 88×66px → title/category/giá → badge/thời gian → action. Mobile card dọc, ảnh 80px bên trái, menu dấu ba chấm bên phải. Tin bị chặn thêm banner “Bị hạn chế” và lý do, không thay mất nhãn RESERVED/SOLD.

| Status | Thao tác của seller |
|---|---|
| PENDING | Xem, sửa, ẩn, xóa mềm |
| ACTIVE | Xem, sửa và gửi duyệt lại, ẩn, xóa mềm |
| REJECTED | Xem lý do, sửa, gửi duyệt lại, ẩn, xóa mềm |
| INACTIVE | Xem, sửa, gửi duyệt lại, xóa mềm |
| RESERVED / SOLD | Chỉ xem; link đơn bán nếu API cho phép trả đúng ID |
| is_blocked | Chỉ xem lý do và “Liên hệ hỗ trợ”; không gửi duyệt lại cho đến khi được gỡ chặn |

Confirm ẩn: “Ẩn tin đăng?” + “Người mua sẽ không thể tìm hoặc đặt món đồ này.” Confirm xóa: “Xóa tin khỏi danh sách?” + “Tin sẽ ngừng hiển thị. Lịch sử giao dịch vẫn được lưu.” Không nói xóa dữ liệu vĩnh viễn.

Empty theo tab; lỗi VERSION_CONFLICT hiển thị “Tin đăng đã thay đổi. Tải lại để xem thông tin mới nhất”, không ghi đè tự động.

## 14. UI-12 – Đăng và sửa sản phẩm

Một form theo section, không wizard nhiều route. Desktop content 8/12 và preview card 4/12 sticky dưới header; mobile preview trong nút “Xem trước”, không hiển thị hai bản form.

Section 1 “Hình ảnh”: dropzone, nút “Chọn ảnh”, grid thumbnail 4 cột desktop/3 mobile, counter n/8. Mỗi tile có progress, retry khi lỗi, xóa, nút đặt ảnh đầu. Hỗ trợ kéo sắp xếp và nút “Sang trái/Sang phải” để dùng bàn phím. Nhãn “Ảnh đại diện” trên ảnh index 0. Upload lỗi không làm mất ảnh đã thành công.

Section 2 “Thông tin món đồ”: Tên 5–150; danh mục cha và con; condition radio cards; số tháng sử dụng optional; mô tả textarea 20–5.000 có counter. Danh mục chọn phải là lá active. Không tự điền condition hoặc thời gian đã dùng từ tên.

Section 3 “Giá và giao nhận”: MoneyInput giá, province combobox, radio COD/MEETUP/BOTH. COD/BOTH hiện phí ship không âm; MEETUP ẩn field và gửi 0. Helper “Nếu người mua đặt nhiều món của bạn, đơn áp dụng mức phí cao nhất trong các món.”

Section 4 “Kiểm tra trước khi gửi”: tóm tắt số ảnh, giá, khu vực; text “Tin sẽ hiển thị sau khi được duyệt.” Không checkbox chính sách chưa có nội dung.

Footer sticky trong vùng trang: “Hủy” và “Gửi duyệt”. Edit ACTIVE dùng label “Lưu và gửi duyệt lại” và alert “Tin tạm ngừng hiển thị trong khi chờ duyệt lại.” Edit PENDING dùng “Lưu thay đổi”; REJECTED/INACTIVE có “Lưu thay đổi” và “Gửi duyệt lại” theo service contract, không thông báo gửi duyệt thành công trước khi submit action hoàn tất.

Nút submit chỉ bật khi hợp lệ, có 1–8 ảnh upload xong; duplicate submit chặn trong UI. Mutation thành công dẫn /account/products theo đúng status, toast “Đã gửi tin để duyệt”. Không có “Lưu nháp” phía server vì chưa có DRAFT.

Form giữ input trong memory qua lỗi/network/reauth trong cùng tab; khi rời trang có cảnh báo. Không tự lưu địa chỉ/phone/password vào localStorage. File object không tồn tại sau reload; phải giải thích nếu cần chọn lại.

## 15. UI-13/UI-14 – Yêu thích và giỏ hàng

### 15.1. Yêu thích

H1 “Sản phẩm yêu thích”, grid chuẩn. Bỏ tim optimistic được nếu rollback khi lỗi. Tin SOLD/RESERVED còn hiển thị với badge; blocked/deleted thay placeholder “Tin đăng không còn khả dụng” và nút “Bỏ lưu”, không dùng tên/ảnh từ cache cũ.

Empty “Bạn chưa lưu món đồ nào” + “Khám phá sản phẩm”. Phân trang theo dữ liệu server.

### 15.2. Giỏ hàng

Desktop 8/4 cột: trái seller groups, phải sticky summary 320–360px. H1 “Giỏ hàng”, checkbox chọn tất cả món khả dụng. Mỗi seller group có checkbox trạng thái checked/indeterminate, avatar + tên và product rows.

Row: checkbox → ảnh 80×60 → tên/condition/trạng thái → giá → xóa. Hiện “Số lượng: 1” tĩnh, không có stepper. Món hết khả dụng disable checkbox và nêu lý do; xóa vẫn dùng được.

Summary: “Đã chọn n sản phẩm”, “Tiền hàng”, “Phí giao nhận được xác định ở bước tiếp theo”, CTA “Tiếp tục đặt hàng”. Không gọi tiền hàng là tổng cuối khi chưa có phí. Thêm note “Sản phẩm chỉ được giữ sau khi đặt hàng thành công.”

Mobile summary gọn ở bottom action bar: số món, tiền hàng, nút tiếp tục; seller groups vẫn scroll trên. Không đồng thời bottom nav.

Checkout selection truyền bằng product IDs trong app state; có thể lưu riêng IDs trong sessionStorage để reload, không lưu thông tin cá nhân hoặc toàn bộ product snapshot. Không chọn món nào → CTA disabled và helper. Không có cart → empty + khám phá.

## 16. UI-15 – Checkout

Header gọn logo, “Đặt hàng”, link “Quay lại giỏ hàng”; bỏ category nav/footer. Desktop 8/4 cột, mobile 1 cột, summary dưới seller groups và sticky CTA.

Trên đầu note “Mỗi người bán sẽ nhận một đơn riêng. Bạn thanh toán tiền mặt khi giao nhận.”

Mỗi seller có một SectionCard:

- Header avatar/tên + số món.
- Danh sách ảnh 56px, tên, condition, giá từng món.
- Radio phương thức: chỉ các lựa chọn chung cho tất cả món trong nhóm; một lựa chọn thì vẫn hiển thị rõ nhưng không phải giả radio có thể đổi.
- Tên người nhận, số điện thoại; COD: “Địa chỉ nhận hàng”; MEETUP: “Địa điểm gặp đã thống nhất”.
- Có thể điền từ profile sau khi user kiểm tra. Nút “Dùng thông tin này cho các đơn giao hàng còn lại” là thao tác có chủ ý, không âm thầm ghi đè từng seller hoặc điểm gặp.
- Dòng tiền hàng, phí giao nhận, tổng của seller. COD dùng max fee trong nhóm, MEETUP = 0.

Không có phương thức chung: alert trong seller card “Các món này chưa có hình thức giao nhận chung”, nút “Điều chỉnh sản phẩm” về giỏ; chặn toàn checkout đến khi hợp lệ.

Summary phải có tiền hàng toàn bộ, phí toàn bộ, tổng cuối và số đơn sẽ tạo. CTA “Đặt n đơn hàng”. Bên dưới “Chưa có tiền được thu qua ReMarket”. Không logo thẻ ngân hàng, QR chuyển khoản hoặc badge bảo đảm hoàn tiền.

### Trạng thái gửi và kết quả

- Submitting: nút spinner “Đang tạo đơn…”, giữ layout, chặn submit lặp. Chỉ một Idempotency-Key cho cùng ý định/payload đang gửi.
- Network timeout/không rõ kết quả: panel “Chưa xác nhận được kết quả đặt hàng”, giữ key và payload trong memory, “Kiểm tra lại” gửi lại cùng key/payload. Không tự tạo key mới. Nếu reload mất payload, hướng dẫn kiểm tra /orders trước khi đặt lại; không lưu PII chỉ để giữ retry.
- PRICE_CHANGED: làm nổi bật giá/phí cũ → mới, cập nhật tổng, CTA “Xác nhận giá mới và đặt hàng”; người dùng phải chủ động xác nhận payload mới. Chỉ tạo key mới sau kết quả xung đột xác định, không sau timeout.
- PRODUCT_NOT_AVAILABLE: đánh dấu món lỗi; nói “Chưa có đơn nào được tạo trong lần đặt này” chỉ khi server xác nhận rollback; “Quay lại giỏ hàng”. Không tự loại món rồi đặt phần còn lại.
- IDEMPOTENCY_CONFLICT: giải thích yêu cầu đã khác lần gửi trước và cho kiểm tra đơn; không vòng retry vô hạn.
- Thành công: thay nội dung checkout bằng panel success, danh sách từng order gồm seller, mã đơn, tổng, “Xem đơn hàng”; CTA “Xem tất cả đơn mua” và “Tiếp tục khám phá”. Không dùng “Thanh toán thành công”.
- Từ response mới hiển thị hạn seller xác nhận và countdown; không chạy timer giữ hàng khi buyer còn điền checkout.
- Không có product IDs sau reload/direct URL: “Chưa chọn sản phẩm để đặt hàng” + “Về giỏ hàng”.

Success state không cần route mới; order detail là địa chỉ bền vững. Back/reload không tự gửi lại đơn.

## 17. UI-16 – Danh sách đơn mua và đơn bán

Dùng cùng component OrderList với role cố định theo route; title “Đơn mua” hoặc “Đơn bán”. Link đổi vai trò rõ ràng; không suy ra role chỉ từ trạng thái.

Tabs: Tất cả, Chờ xác nhận, Đã xác nhận, Đang giao, Đã giao, Hoàn tất, Đã hủy. Query status/page đồng bộ URL. Order card có header mã + ngày + badge, counterparty, tối đa hai món snapshot và “Xem thêm n món”, footer tổng tiền + “Xem chi tiết”.

PENDING hiển thị thời hạn còn lại từ expires_at, khi qua hạn ghi “Đã quá hạn xác nhận, đang cập nhật” và refetch, không tự đổi database status. Cần chú ý tab label “Đã giao” tương ứng DELIVERED nhưng detail luôn nói rõ ai ghi nhận.

Desktop có thể hiển thị CTA chính của vai trò, dùng chung ActionPolicy với detail. Mobile list chỉ “Xem chi tiết” để hạn chế hủy/giao nhầm. Empty theo bộ lọc có CTA khám phá cho buyer, đăng bán cho seller.

## 18. UI-17 – Chi tiết đơn

Header: Quay lại, H1 “Đơn #xxxxxxxx”, badge, thời gian tạo, copy ID. Desktop main 8/12 và summary/actions 4/12; mobile một cột. Nội dung theo thứ tự:

1. Status callout: mô tả bước hiện tại, hạn nếu PENDING, cancellation reason nếu CANCELLED.
2. Timeline trạng thái thật; COD: Đặt hàng → Xác nhận → Đang giao → Đã ghi nhận giao hàng → Hoàn tất. MEETUP bỏ Đang giao. CANCELLED là nhánh kết thúc, không tô các bước chưa xảy ra.
3. Counterparty và snapshot items (ảnh/tên/condition/giá). Link product là phụ; snapshot vẫn đọc được khi tin bị ẩn/xóa.
4. Card giao nhận: phương thức, tên, điện thoại, địa chỉ/điểm gặp; carrier/tracking nếu có. Không fake live tracking map.
5. Summary tiền hàng/phí/tổng và “Thanh toán tiền mặt trực tiếp với người bán”.
6. Lịch sử actor/thời gian/lý do; thông tin ticket chỉ hiện mức người xem được phép.
7. Action panel theo bảng; support luôn có khi quyền cho phép, link tạo ticket prefill order ID.

| Trạng thái | Buyer | Seller |
|---|---|---|
| PENDING | Hủy đơn, Liên hệ hỗ trợ | Xác nhận đơn, Từ chối/Hủy đơn, Hỗ trợ |
| CONFIRMED + COD | Hủy đơn, Hỗ trợ | Đã gửi hàng, Hủy đơn, Hỗ trợ |
| CONFIRMED + MEETUP | Xác nhận đã nhận tại điểm gặp, Hủy đơn, Hỗ trợ | Hủy đơn, Hỗ trợ; không có Đã gửi hàng |
| SHIPPING | Tôi đã nhận hàng, Báo vấn đề | Ghi nhận đã giao, Hỗ trợ |
| DELIVERED | Xác nhận hoàn tất nếu không bị chặn, Báo vấn đề | Chờ người mua xác nhận, Hỗ trợ |
| COMPLETED | Đánh giá nếu đủ điều kiện, xem review đã gửi, Hỗ trợ | Chỉ xem, Hỗ trợ |
| CANCELLED | Xem lý do, Khám phá sản phẩm | Xem lý do, Về tin đăng |

Bảng áp dụng cho tài khoản đủ quyền; account LOCKED chỉ xem và support, điều kiện API luôn ưu tiên. Quyền bị chặn có helper “Đơn đang được hỗ trợ xử lý”, không lộ ticket của bên kia.

“Tôi đã nhận hàng” chỉ chuyển DELIVERED, không tự gộp sang COMPLETED. Dialog hoàn tất có hai checkbox không chọn sẵn: “Tôi đã nhận và kiểm tra hàng”, “Tôi đã thanh toán cho người bán”; nút “Xác nhận hoàn tất” chỉ bật khi cả hai true.

Hủy đơn mở dialog reason bắt buộc và nêu hủy toàn bộ món trong đơn. Đã gửi hàng có carrier/tracking optional. Seller ghi nhận đã giao có confirm “Thông tin này do bạn cung cấp; người mua vẫn cần xác nhận hoàn tất.”

Chat ở order detail chỉ mở conversation đã tồn tại, do đơn có thể đã RESERVED nên không tạo conversation mới trái quy tắc. Nếu nhiều conversation theo món, chọn món trước khi mở. Không có conversation thì ẩn shortcut, vẫn có support.

Mobile action panel có một primary sticky và overflow secondary, không che timeline. API 409/VERSION_CONFLICT → refetch và giải thích, không optimistically đánh dấu hoàn tất/hủy.

## 19. Review và report dialogs

### ReviewDialog

Chỉ mở từ order COMPLETED đủ điều kiện. Header “Đánh giá người bán”, UserSummary và mã order; radio group 5 mức sao với text Rất tệ/Tệ/Bình thường/Tốt/Rất tốt. Không chọn mặc định 5 sao. Comment optional 1.000 ký tự, counter.

Footer Hủy + “Gửi đánh giá”, helper “Mỗi đơn chỉ được đánh giá một lần. Đánh giá đã gửi không thể chỉnh sửa.” Hết 30 ngày hoặc đã đánh giá: hiển thị trạng thái read-only trong order, không có nút gửi. Rating là số nguyên; một lần click sao chọn đến số đó.

### ReportDialog

Header “Báo cáo tin đăng” hoặc “Báo cáo người dùng”, target summary tối thiểu. Select/radio lý do theo enum, description max 2.000 ký tự; OTHER bắt buộc mô tả. Footer “Gửi báo cáo”; thành công có mã report và text “Báo cáo đã được gửi để xem xét”, không khẳng định target vi phạm.

Báo cáo trùng pending → inline “Bạn đã có báo cáo đang chờ xử lý cho đối tượng này.” Không phát lại request tự động. Danh tính reporter không xuất hiện ở UI của người bị báo cáo.

## 20. UI-18 – Tin nhắn

Desktop container max 1280px, chiều cao viewport trừ header/padding; trái conversation list 320px, phải chat flex. Không footer. Tablet danh sách 280px. Mobile /messages là list, /messages/:id là toàn khung chat với nút Quay lại, không render hai cột.

Conversation row cao khoảng 88px: avatar counterparty 44px, tên, thời gian, last_message một dòng, thumbnail/tên sản phẩm, unread indicator từ API. Không hiện “online”, “đang nhập…” hoặc last seen vì chưa có presence contract. Conversation list dùng pagination/load more theo API, không giả search toàn bộ khi chỉ có một trang.

Chat header cao 64px: avatar + tên, menu xem hồ sơ. Bên dưới product context strip: thumbnail 48px, title, price nếu được phép, status; blocked/deleted dùng placeholder phù hợp.

Message area nền page: received trái nền trắng, sent phải nền brand-soft, max-width 72% desktop/85% mobile, bo 12px, giữ line break và wrap chuỗi dài. Date separators giữa ngày. Mỗi nhóm có timestamp; tin mình có “Đang gửi”, “Đã gửi”, “Đã xem” hoặc “Gửi thất bại · Thử lại”. “Đã gửi” chỉ sau ACK/persist, “Đã xem” chỉ dựa read_at, không từ việc mở socket.

Composer bottom: textarea auto-grow 1–5 dòng + nút gửi 44px; placeholder “Nhập tin nhắn…”, counter khi gần giới hạn. Enter gửi, Shift+Enter xuống dòng trên desktop; không gửi khi IME composition chưa kết thúc; mobile Enter xuống dòng và dùng nút gửi. Chỉ text, không có paperclip/camera/microphone.

Khi nhận tin và user ở cuối → scroll xuống; nếu đang đọc phía trên → chip “n tin nhắn mới”, không giật scroll. Tải tin cũ ở đầu giữ anchor. Chỉ gửi read khi tab đang hiển thị, conversation active và tin nhận đã được nhìn thấy trong viewport.

Mất socket có banner “Đang kết nối lại”; REST fallback dùng cùng client_message_id, không tạo bản sao. Khi token hết hạn/access bị từ chối thì dừng retry và áp dụng session flow. Tin blocked/deleted làm composer disabled với lý do; tài khoản LOCKED không được đọc inbox theo quyền hạn chế, chuyển panel hỗ trợ.

## 21. UI-19 – Thông báo

H1 “Thông báo”, tabs Tất cả/Chưa đọc và action “Đánh dấu tất cả đã đọc”. List row gồm icon loại sự kiện, title, nội dung 1–2 dòng, thời gian, chấm chưa đọc. Unread nền brand-soft rất nhẹ, title 600; read nền trắng.

Click notification: đánh dấu read và điều hướng đến reference đã được whitelist/mapping; không lấy URL tùy ý từ content. Nếu tài nguyên không còn truy cập được, hiện thông báo cùng link danh sách liên quan, không lộ nội dung cached.

Product moderation → /account/products; order → /orders/:id hoặc /sales/:id theo role thật; message → /messages/:id; support → /support/:id. Report result không cần route mới: mở panel nội dung kết quả và đọc lại /me/reports nếu cần.

Đánh dấu tất cả xác nhận theo cutoff server; notification mới sau thao tác vẫn unread. Empty “Bạn chưa có thông báo”; unread empty “Bạn đã đọc hết thông báo”.

## 22. UI-20 – Hỗ trợ

### Danh sách /support

H1 “Trung tâm hỗ trợ”, CTA “Tạo yêu cầu hỗ trợ”, tabs theo status. Ticket row: ID, subject, type, order liên quan nếu có, status, updated_at. Mobile card; chọn mở detail.

### Tạo ticket /support/new

Form max-width 760px: Loại yêu cầu, Tiêu đề 5–150, Order picker nếu ORDER_PROBLEM, nội dung 1–5.000. Picker chỉ các đơn user tham gia, hiển thị ID/counterparty/status; lấy GET /orders theo từng vai trò cần thiết, không cho chọn UUID bất kỳ không được xác minh.

Từ order detail prefill order_id và type nhưng vẫn validate quyền. Type PRODUCT cho mô tả sản phẩm trong text vì schema chưa có product_id; không tạo field backend mới âm thầm. Không attachment upload.

CTA “Gửi yêu cầu”, success mở /support/:id. Tài khoản chưa xác minh chỉ hỗ trợ tài khoản; LOCKED dùng support theo quyền mục 3 của detail-project.

### Ticket detail /support/:id

Header ID/subject/status, metadata type/created/order. Thread message bubble phân biệt “Bạn” và “Hỗ trợ ReMarket”, timestamp; composer text 5.000 ký tự, “Gửi phản hồi”.

RESOLVED có box kết luận, “Đóng yêu cầu” và “Vẫn cần hỗ trợ”; thao tác thứ hai yêu cầu phản hồi và mở lại OPEN theo service. CLOSED ẩn composer, hiện “Yêu cầu đã đóng” + “Tạo yêu cầu mới”. Không có nút tự đóng OPEN/IN_PROGRESS cho user.

## 23. UI-21 đến UI-28 – Quản trị

Mọi màn quản trị có H1, mô tả ngắn, toolbar filter và vùng kết quả. Drawer xem detail có title, trạng thái, nội dung scroll và footer actions. Không có bulk approve/lock trong MVP; mỗi action phải xem rõ đối tượng và lý do.

### 23.1. Tổng quan

Filter khoảng ngày, mặc định 30 ngày gần nhất. Sáu KPI: Tổng user, User mới trong kỳ, Tin chờ duyệt, Đơn hoàn tất trong kỳ, Giá trị giao dịch hoàn tất trong kỳ, Báo cáo chờ xử lý. Ghi rõ metric nào là tổng hiện tại, metric nào theo kỳ.

Hai queue “Tin chờ duyệt” và “Yêu cầu hỗ trợ mới”, tối đa 5 item + Xem tất cả. Dùng API danh sách tương ứng. Không tự thêm chart đường tăng trưởng vì contract chưa có time-series. Số rỗng hiển thị 0, lỗi hiển thị “Chưa tải được” thay vì 0.

### 23.2. Người dùng

Toolbar tìm theo tên/email, status, ngày tham gia. Table: Người dùng (avatar/tên/email), Vai trò, Trạng thái, Ngày tham gia, Thao tác. Email chỉ trong vùng admin được API cho phép.

Drawer detail: hồ sơ cần thiết, status/lock reason, created_at, thao tác Khóa/Mở khóa. Không có password hoặc sửa role. Khóa bắt buộc reason và cảnh báo tác động “Các đơn chưa giao liên quan có thể bị hủy theo quy tắc hệ thống; đơn đã giao cần xử lý hỗ trợ”. Chỉ nêu số đơn cụ thể nếu server trả impact count; không tự đoán.

Khóa/mở khóa pending disable action. Thành công cập nhật row từ server; không tự xóa lịch sử user.

### 23.3. Sản phẩm và kiểm duyệt

Tabs Chờ duyệt/Đang bán/Bị từ chối/Bị hạn chế/Tất cả; filter category/seller/ngày. Table: ảnh, title/giá, seller, category, status + blocked badge, thời gian, “Xem xét”.

Drawer trên desktop có thể rộng 760px: gallery bên trái 45%, thông tin và mô tả bên phải; mobile xếp dọc. Hiển thị version đang xem và thời điểm cập nhật trong metadata nhỏ dành cho admin.

PENDING: footer “Từ chối” + “Duyệt tin”. Reject dialog reason bắt buộc. Block/unblock theo quyền, lý do khi block; tin RESERVED/SOLD không được mất trạng thái giao dịch sau thao tác. VERSION_CONFLICT buộc tải bản mới và review lại, không tự approve version mới.

### 23.4. Danh mục

Cây hai cấp bên trái desktop 300px, form editor bên phải. Mobile list cây và drawer form. Row icon expand, tên, status, menu sửa/vô hiệu. CTA “Thêm danh mục”; chọn cha optional nhưng không cho cấp >2 hoặc chọn chính mình.

Form name/slug/parent/status. Disable category có confirm giải thích ảnh hưởng tin công khai và đơn chờ xác nhận theo đặc tả; không nút xóa vĩnh viễn. Slug có thể gợi ý từ tên nhưng người dùng được sửa trước submit. Phản hồi lỗi duplicate ngay dưới slug.

### 23.5. Báo cáo

Tabs Pending/Resolved/Rejected bằng tiếng Việt; filter loại target, reason, ngày. Table: mã report, target, reason, người gửi theo quyền admin, status, created_at.

Drawer gồm nội dung report, target link/preview, lịch sử xử lý nếu có và kết luận. “Không chấp nhận” cần resolution_note. “Xử lý báo cáo” cho chọn hành động phù hợp target: chặn tin, cảnh báo, khóa user, hoặc chỉ ghi kết luận.

Không hiển thị nút “Cảnh báo” hoạt động khi chưa có contract gửi cảnh báo qua resolve. Mục 25 yêu cầu chốt payload action. Nếu backend chỉ hỗ trợ các action riêng, UI chạy và hiển thị kết quả từng bước, không báo “Đã xử lý” trước khi resolve thành công; lỗi giữa chừng giữ panel nêu bước đã hoàn tất để tránh lặp khóa/chặn.

### 23.6. Đánh giá

Table: rating, excerpt, reviewer, seller, order ID, ngày, visibility. Drawer toàn comment, metadata và “Ẩn đánh giá” bắt buộc reason. Không cho admin sửa số sao/nội dung hoặc thêm nút khôi phục khi chưa có API.

### 23.7. Hỗ trợ

Table: ticket ID/subject, user, type/order, status, assigned admin, updated_at. Filters status/type/admin/ngày. Drawer thread rộng tối đa 900px: conversation chiếm phần chính, sidebar metadata/actions 260px; mobile stacked.

Actions: nhận xử lý/assign, OPEN → IN_PROGRESS, RESOLVED kèm kết luận, CLOSED kèm reason khi admin đóng; gửi phản hồi dùng endpoint support chung. Không hiển thị chat riêng Buyer–Seller.

Nếu ticket ORDER_PROBLEM, panel order có snapshot/status/history và nút “Hủy đơn qua hỗ trợ” chỉ khi hợp lệ; SHIPPING/DELIVERED mở dialog yêu cầu kết luận về hàng đã trả/chưa giao và thỏa thuận tiền, ticket_id. Nút phải nói “Hủy đơn”, không “Hoàn tiền” vì hệ thống không chuyển tiền.

### 23.8. Nhật ký

Filters action, actor, entity_type, entity_id, khoảng ngày. Table thời gian, actor, action, đối tượng, reason; drawer metadata đã được server lọc. Không có sửa/xóa audit hoặc export dữ liệu hàng loạt. Không hiển thị raw token, mật khẩu, chat hoặc PII ngoài quyền.

## 24. Loading, error, offline và giới hạn tài khoản

| Tình huống | Hành vi bắt buộc |
|---|---|
| Initial session check | Skeleton shell nhẹ; không nháy UI Guest rồi redirect trước khi refresh kết thúc |
| 401 | Một refresh được chia sẻ giữa request; thất bại thì xóa cache riêng tư, điều hướng login/reauth, không lặp vô hạn |
| Guest mở private route | Login + returnTo nội bộ; không render dữ liệu riêng trước guard |
| Chưa xác minh | Banner “Xác minh email để đăng bán, mua hàng và nhắn tin”; CTA xác minh/resend theo quyền |
| LOCKED | Panel “Tài khoản đang bị hạn chế”; chỉ Đơn của tôi, Yêu cầu hỗ trợ, Đăng xuất; mutation khác ẩn/chặn |
| 403 | “Bạn không có quyền thực hiện thao tác này”, link về trang phù hợp |
| 404 | “Không tìm thấy trang hoặc nội dung này”, về khám phá; không tiết lộ đối tượng riêng có tồn tại |
| 409 | Thông báo nghiệp vụ cụ thể, refetch resource; giữ input an toàn, không blind retry mutation |
| 422 | Map field errors, giữ form, focus lỗi đầu tiên |
| 429 | Thông báo thử lại theo Retry-After; không spam retry |
| 500 | Inline “Có lỗi xảy ra. Vui lòng thử lại.” + request ID có thể sao chép, không stack trace |
| Offline | Banner “Bạn đang ngoại tuyến”, giữ màn có dữ liệu, mutation disabled nếu chưa gửi; không hiển thị success giả |
| Lỗi ảnh | Placeholder tỷ lệ cố định; URL hết hạn refetch resource một lần, không loop tải vô hạn |
| Lỗi section | Giữ phần còn dùng được, retry đúng section |
| Mutation thành công | Cập nhật/invalidate đúng query, success toast và aria-live polite |
| Session đổi user/logout | Hủy subscription/socket và xóa cache riêng tư để không lộ dữ liệu người trước |

Reauth giữ form memory nếu còn trong app, nhưng không tự gửi lại đơn/đánh giá/report sau login. Với private data bị thu hồi quyền, không tiếp tục hiển thị cache trong nền.

## 25. API/view model để AI nối UI đúng dữ liệu

Không expose ORM model trực tiếp. Frontend dùng DTO theo context; các field bên dưới là response requirements bổ sung cần chốt trong OpenAPI khi triển khai, không yêu cầu tạo thêm bảng chỉ để phục vụ UI.

| DTO | Dữ liệu tối thiểu |
|---|---|
| SessionUser | id, full_name, avatar_url, role, status, email_verified_at, thông tin riêng cho /me |
| ProductListItem | id, title, price string, image_url, condition, province_code/label, published_at, status, is_favorited khi đúng context |
| ProductDetail | ListItem + description, images[] sorted, category path, usage_months, delivery_method, shipping_fee string, seller summary, viewer capabilities |
| OwnProduct | ProductDetail theo quyền + version, rejection_reason, block_reason, is_blocked, allowed_actions |
| SellerSummary | id, name/avatar, province, joined_at, rating nullable, review_count, completed_sales_count |
| CartView | groups theo seller, item current price/availability/reason, chọn ở client; không tổng phí giả |
| OrderListItem | id, role đối với viewer, counterparty, status, delivery_method, item snapshots, total_amount, created_at, expires_at |
| OrderDetail | ListItem + version, đầy đủ snapshots/giao nhận/tổng, status_history, allowed_actions, completion_block_reason an toàn, review eligibility/own review, conversation links nếu tồn tại |
| ConversationListItem | id, counterparty, product preview hợp lệ, last_message, unread_count nếu hỗ trợ, updated_at |
| Message | id, client_message_id, sender_id, content, created_at, read_at |
| Notification | id, type/title/content, read_at, created_at, reference_type/id và viewer role nếu cần |
| SupportTicketDetail | header/status/type/order ref được phép, messages paginated, resolution_note, allowed_actions; không lộ ticket khác |
| AdminProduct/Report/Review | Detail fields đủ cho drawer, version/actions; list có thể kèm detail hoặc API detail được khai báo rõ |

capabilities/allowed_actions giúp UI bật nút chính xác, nhưng không thay thế backend authorization. Đây là trường được tính theo viewer, status và quy tắc; không tin input cùng tên từ client.

Những điểm contract phải làm rõ, không để AI đoán:

1. Keyword dùng q; filter delivery_method trên list diễn giải COD/MEETUP có bao gồm BOTH; filter status/tab của các list.
2. GET /orders/:id trả history, safe completion block và review eligibility; không gọi endpoint /history hoặc /eligibility tự đặt.
3. PATCH product INACTIVE/REJECTED giữ status khi chỉ “Lưu thay đổi”; /submit mới gửi PENDING. ACTIVE edit chuyển PENDING theo nghiệp vụ.
4. Admin detail product/report/review/ticket lấy từ response list đủ dữ liệu hoặc bổ sung GET detail có kiểm tra quyền trong OpenAPI trước khi gọi. Public product endpoint không được dùng để vượt quyền xem tin chờ duyệt.
5. Report resolve cần định nghĩa resolution_note/action và nguyên tử hoặc cơ chế phản hồi từng bước; cảnh báo user chỉ hiện khi service hỗ trợ.
6. Support POST messages trên RESOLVED của chủ ticket mở lại OPEN; PATCH admin status/assignment và close lý do cần body chính thức.
7. POST /products nhận image storage paths và sort_order; PATCH phải định nghĩa rõ thay thế danh sách ảnh hay cập nhật từng phần.
8. Category/province labels: API category thật và tập địa lý có phiên bản; không hardcode mã tỉnh không tồn tại. Tập địa lý tĩnh có thể nằm trong shared asset nếu không có API.
9. List conversations/support messages/admin audit có pagination rõ; không giả local filtering đại diện toàn database.
10. capabilities, counts, ảnh đã ký và summary cần được trả/batch hợp lý để tránh N+1 request trên grid. Trường chưa có thì bỏ phần tùy chọn, không điền số giả.

Ảnh dùng URL thật từ API. File chứa storage_path không tự ghép thành public URL. Tiền giữ string hoặc BigInt cho phép tính VND; khi format phải tránh ép Number ngoài phạm vi an toàn. Dữ liệu order luôn từ snapshot chứ không fetch products.price để thay giá lịch sử.

## 26. Hướng dẫn tổ chức frontend

Cấu trúc đề xuất dưới apps/web/src:

    app/            Router, providers, guards, layouts
    components/ui/  Button, Field, Dialog, Drawer, Tabs, DataTable...
    components/     ProductCard, UserSummary, OrderTimeline...
    features/auth/
    features/products/
    features/cart/
    features/checkout/
    features/orders/
    features/chat/
    features/reviews/
    features/reports/
    features/notifications/
    features/support/
    features/admin/
    lib/            API client, socket, money/date, errors
    styles/         Tokens và global styles
    mocks/          DTO fixtures và adapter theo môi trường
    tests/          Test hành vi và E2E

Mỗi feature có page/component/service/type cần thiết; tránh một file page chứa toàn bộ API, validation và layout. Chọn một cơ chế query cache/form/router phù hợp dự án khi triển khai; không cài nhiều thư viện làm cùng việc.

Server state đi qua query layer; query keys gồm viewer/context và filter. Local UI state dành cho modal, selection, input. Filter có thể chia sẻ nằm trong URL. Cache riêng tư được clear khi session đổi. HTTP client xử lý JSON envelope, request_id, auth refresh và abort query lỗi thời.

Dùng một ánh xạ enum → label/tone, một lớp quyền UI dùng chung giữa list/detail, một format tiền/ngày. Form validate cùng giới hạn backend. Error boundary ở route và feature phù hợp.

Optimistic chỉ cho thao tác dễ rollback như favorite/read notification. Product moderation, checkout và order transitions phải chờ response server. Socket events invalidate/refetch hoặc merge theo ID/version; không tự suy ra transition tiếp theo.

## 27. Fixture và checklist nghiệm thu UI

Fixture dev phải có ít nhất: product đủ 6 status, blocked product, seller chưa có review, product title dài, 8 ảnh, description dài, empty lists, order mỗi status cho COD/MEETUP, nhiều seller, giá vừa đổi, unavailable cart item, open order ticket, expired session, unverified/locked account.

Có thể dùng món mẫu: Keychron K2 V2 1.100.000 ₫ tại Đà Nẵng, Sony WH-1000XM4 2.500.000 ₫ tại Hà Nội, bàn gỗ 650.000 ₫ tại TP.HCM. Gắn nhãn môi trường demo; fixture phải nhất quán totals/seller/status, không giả dữ liệu live. Ảnh chưa có dùng placeholder có label rõ, không tải ngẫu nhiên ảnh sai món.

| Kiểm tra | Kết quả phải đạt |
|---|---|
| Route coverage | Tất cả UI-01…UI-29 tồn tại hoặc trạng thái inline đúng đặc tả; không nút/link chết |
| Viewport | 360×800, 768×1024, 1440×900 không tràn trang/cắt CTA; admin table scroll trong vùng riêng |
| Visual | Dùng đúng token, font hierarchy, spacing/grid; card không nhảy khi ảnh tải |
| Keyboard | Search, filter, menu, modal, rating, gallery và upload reorder thao tác được |
| Focus/accessibility | Label, focus ring, alt, status text, aria-live; kiểm tra contrast chữ thường ≥4,5:1, chữ lớn/biên điều khiển cần thiết ≥3:1 |
| Forms | Validation đúng, field error có vị trí, giữ dữ liệu khi lỗi, không submit kép |
| Auth | Guest returnTo đúng; locked/unverified đúng quyền; không tự chạy mutation sau login |
| Product | Owner không mua/chat chính mình; RESERVED/SOLD không mua; blocked không lộ cache |
| Checkout | Fee=max từng seller, không quantity/coupon/card; price conflict cần xác nhận; timeout giữ idempotency |
| Orders | Buyer/seller/MEETUP/COD/ticket mở có CTA đúng; DELIVERED không bị coi là COMPLETED |
| Chat | Text-only, pending/failed/retry/dedupe, scroll giữ anchor, không read khi tab ẩn |
| Admin | Reason/version conflict rõ; không chỉnh mật khẩu, không chat riêng, không giả nút refund |
| Failure states | Mỗi page có loading, empty, partial error/offline phù hợp |
| Data | Không lộ PII, số liệu giả, endpoint không khai báo hoặc URL storage tự ghép |
| Production | Build/typecheck qua; routes trực tiếp hoạt động khi refresh trên hosting; asset/font tải đúng |

Chụp và đối chiếu ít nhất home, search mobile filter, product detail mobile, product form, multi-seller checkout, order detail hai vai trò, chat và admin review drawer. Test hành vi thực, không chỉ snapshot so chữ. Ghi rõ màn nào đang dùng mock và màn nào đã nối backend.

## 28. Prompt bàn giao cho AI coding

Có thể dùng nguyên yêu cầu sau khi bắt đầu xây dựng:

> Đọc toàn bộ detail-project.md và ui-spec.md trong workspace. Xây frontend ReMarket bằng React + TypeScript + Vite + Tailwind CSS theo nghiệp vụ và UI đã mô tả. Kiểm tra source/instructions hiện có trước khi chỉnh sửa. Dùng ui-spec.md cho token, shell, responsive, route UI-01 đến UI-29, component và tương tác; dùng detail-project.md cho auth, quyền, API, validation, đơn hàng và phạm vi MVP. Không tự thêm thanh toán online, chat ảnh, quantity, dữ liệu giả như thật hoặc endpoint chưa có contract. Nếu backend chưa có, tạo mock adapter rõ ràng với DTO nhất quán và các tình huống ở mục 27; liệt kê contract còn cần hoàn thiện theo mục 25. Triển khai theo thứ tự: tokens/components/layouts → khám phá/detail → auth/profile/tin đăng → cart/checkout/orders → chat/notification/support/review/report → admin. Kiểm thử desktop/mobile, các lỗi và quyền theo từng màn; báo cáo phần đã hoàn thành, kết quả kiểm tra và giới hạn tích hợp thực tế.

Bản đặc tả này là tài liệu thiết kế và triển khai; chưa có giao diện hay kết quả kiểm thử frontend được tạo trong lần viết tài liệu.
