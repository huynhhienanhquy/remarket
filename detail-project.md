# ReMarket – Website mua bán đồ cũ trực tuyến

Phiên bản đặc tả: 2.0  
Cập nhật: 05/10/2026  
Trạng thái: đặc tả triển khai đề xuất; chưa phản ánh một hệ thống đã được xây dựng hoặc kiểm thử.

Tài liệu giao diện: [ui-spec.md](./ui-spec.md) — design tokens, bố cục desktop/mobile, màn hình UI-01 đến UI-29, component, trạng thái tương tác và hướng dẫn bàn giao cho AI coding. Nghiệp vụ lấy tài liệu này làm chuẩn; phần trình bày lấy ui-spec.md làm chuẩn. Các yêu cầu DTO/API phục vụ giao diện được liệt kê riêng ở mục 25 của ui-spec.md để chốt trước khi tích hợp.

## 1. Tổng quan và phạm vi

ReMarket là marketplace C2C, cho phép một tài khoản vừa mua vừa bán sản phẩm đã qua sử dụng. Mỗi tin đăng đại diện cho một món đồ duy nhất, số lượng luôn bằng 1. Admin kiểm duyệt tin đăng, quản lý tài khoản, danh mục, báo cáo và yêu cầu hỗ trợ.

Mục tiêu là hỗ trợ toàn bộ hành trình: đăng tin → kiểm duyệt → tìm kiếm → trao đổi → đặt hàng → giao nhận → xác nhận hoàn tất → đánh giá.

### 1.1. Chức năng MVP

- Đăng ký, xác minh email, đăng nhập, làm mới phiên, đăng xuất, quên/đặt lại mật khẩu.
- Hồ sơ cá nhân và hồ sơ người bán công khai.
- Đăng, sửa, ẩn và duyệt sản phẩm; quản lý ảnh.
- Tìm kiếm, lọc, sắp xếp, phân trang.
- Yêu thích, giỏ hàng, mua ngay, checkout nhiều người bán.
- Chat văn bản Buyer–Seller, lịch sử tin nhắn, trạng thái đã đọc.
- Quản lý đơn mua/đơn bán, hủy đơn, giữ hàng, hết hạn chờ xác nhận.
- Đánh giá người bán sau giao dịch.
- Báo cáo vi phạm, thông báo trong ứng dụng, support ticket văn bản.
- Admin dashboard, quản lý tài khoản/danh mục, kiểm duyệt và nhật ký thao tác.

### 1.2. Ngoài phạm vi MVP

Thanh toán online, ví/escrow, hoàn tiền tự động, tích hợp hãng vận chuyển, đấu giá, mã giảm giá, sản phẩm có nhiều tồn kho, chat ảnh/file/voice/video, social login, ứng dụng mobile riêng và hệ gợi ý nâng cao.

### 1.3. Các quyết định mặc định của bản đặc tả

Các lựa chọn dưới đây là đề xuất để việc triển khai có một quy tắc thống nhất; thay đổi chúng phải cập nhật đồng bộ nghiệp vụ, schema, API và test.

| Hạng mục | Quyết định |
|---|---|
| Tên chính thức | ReMarket |
| Authentication | Backend tự quản lý JWT + bcrypt; không sử dụng Supabase Auth |
| Phương thức thanh toán | Tiền mặt khi giao hàng (COD) hoặc khi gặp trực tiếp |
| Vận chuyển | Seller tự tổ chức; chưa tích hợp API hãng vận chuyển |
| Phí ship | Phí cố định trên tin đăng; một đơn COD lấy phí cao nhất trong các món của đơn |
| Giữ hàng | Ngay khi tạo đơn thành công; không giữ khi chỉ thêm vào giỏ |
| Chờ seller xác nhận | 24 giờ kể từ khi tạo đơn, cấu hình tại server |
| Hoàn tất đơn | Buyer xác nhận; không tự hoàn tất theo thời gian |
| Checkout nhiều seller | Một order cho mỗi seller; toàn bộ checkout thành công hoặc rollback |
| Đánh giá | Buyer đánh giá seller một lần cho mỗi order hoàn tất, trong 30 ngày |
| Support | Ticket trong ứng dụng; admin không tham gia chat riêng Buyer–Seller |

## 2. Công nghệ và kiến trúc

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| Frontend | React + TypeScript + Vite | SPA cho Guest, User và Admin |
| Styling | Tailwind CSS | Giao diện responsive |
| Backend | Node.js + Express.js + TypeScript | REST API, xác thực, phân quyền và nghiệp vụ |
| Authentication | JWT + bcrypt | Access token, refresh session và hash mật khẩu |
| Database | Supabase PostgreSQL | Database quan hệ |
| ORM | Prisma | Truy vấn, transaction và migration |
| Storage | Supabase Storage | Avatar và ảnh sản phẩm |
| Realtime | Socket.IO | Chuyển tin nhắn và thông báo trực tiếp |
| API contract | OpenAPI + Postman | Định nghĩa, kiểm tra và chia sẻ API |
| Version control | Git + GitHub | Source code và review |
| Frontend deploy | Vercel | Phục vụ frontend |
| Backend/worker deploy | Render hoặc Railway | API, Socket.IO, tác vụ nền |
| Email | SMTP hoặc dịch vụ transactional email | Xác minh email và đặt lại mật khẩu |

Luồng truy cập: React gọi Express qua HTTPS; Express dùng Prisma truy cập PostgreSQL và giao tiếp Supabase Storage qua thông tin xác thực phía server. Frontend không truy cập trực tiếp các bảng nghiệp vụ qua Supabase Data API.

Socket.IO dùng chung service nghiệp vụ và cơ chế phân quyền với REST. Database là nguồn dữ liệu chính; socket chỉ phục vụ truyền sự kiện.

Đề xuất monorepo:

    apps/web        React application
    apps/api        Express API, Socket.IO, worker
    packages/shared DTO, validation và enum dùng chung
    prisma          Schema, migrations, seed
    docs            OpenAPI, hướng dẫn và tài liệu vận hành

Controller xử lý HTTP; service kiểm tra quyền và nghiệp vụ; lớp truy cập dữ liệu dùng Prisma. Không đặt transaction nghiệp vụ trong component frontend hoặc socket handler riêng biệt.

Module backend: auth, users, categories, products, uploads, search, favorites, cart, chat, orders, reviews, reports, notifications, support, admin và jobs/outbox. Các module gọi chung service khi dùng cùng nghiệp vụ, không sao chép logic phân quyền/trạng thái.

## 3. Actor và quyền truy cập

| Actor | Quyền |
|---|---|
| Guest | Xem tin công khai, tìm kiếm/lọc, xem profile công khai, đăng ký/đăng nhập |
| User chưa xác minh email | Xem/sửa hồ sơ riêng, xác minh email, dùng hỗ trợ tài khoản |
| User ACTIVE và đã xác minh | Đăng bán, yêu thích, giỏ hàng, mua hàng, chat, review, report, support |
| User LOCKED | Chỉ đăng nhập vào chế độ hạn chế để xem đơn/ticket của mình, gửi hỗ trợ và đăng xuất |
| Admin ACTIVE | Kiểm duyệt, quản lý, giải quyết report/ticket và xem audit theo quyền server |

Buyer và Seller là vai trò theo giao dịch, không phải hai loại tài khoản. Không cho phép tự mua hoặc tự mở conversation với chính mình.

Mọi API phải kiểm tra quyền sở hữu đối tượng: seller_id, buyer_id, conversation participant, ticket owner hoặc quyền admin phù hợp. Biết UUID không đồng nghĩa có quyền truy cập.

Admin không được xem mật khẩu/hash trong response, tự đặt mật khẩu của user hay đọc tùy ý chat Buyer–Seller. MVP xử lý bằng chứng người dùng cung cấp qua ticket văn bản.

## 4. Authentication và phiên đăng nhập

### 4.1. Đăng ký và xác minh email

Input gồm full_name, email, password, confirm_password, phone. Xác nhận mật khẩu chỉ là input, không lưu database.

Email được trim và chuẩn hóa chữ thường, duy nhất trong users. Mật khẩu tối thiểu 12 ký tự; với bcrypt phải từ chối mật khẩu vượt 72 byte UTF-8 thay vì cắt ngầm. Work factor được cấu hình và đo trên môi trường chạy. Không lưu plaintext, không ghi mật khẩu/token vào log.

Server tạo users với role=USER, status=ACTIVE và email_verified_at=NULL. Link xác minh dùng token ngẫu nhiên một lần, chỉ lưu hash, hết hạn sau 24 giờ. Gửi lại bị rate limit và vô hiệu token cũ cùng mục đích.

### 4.2. Đăng nhập và refresh

- Đăng nhập bằng email/password; lỗi thông tin đăng nhập dùng thông báo chung.
- Access JWT sống 15 phút, chứa sub, session_id, iat, exp, issuer và audience.
- Backend kiểm tra chữ ký, thuật toán cho phép, issuer/audience/expiry, trạng thái session và user trên mỗi request được bảo vệ; không tin role do client gửi.
- Access token được giữ trong memory của frontend.
- Refresh token là chuỗi ngẫu nhiên, hết hạn tối đa 7 ngày, chỉ lưu hash; đưa vào cookie HttpOnly, Secure ở production.
- Refresh xoay token nguyên tử. Dùng lại token cũ còn hạn sẽ thu hồi toàn bộ session; frontend phải điều phối một refresh tại một thời điểm.
- Các cookie endpoint phải có kiểm tra Origin và cơ chế CSRF. Ưu tiên app/API cùng site qua custom domain; nếu khác site phải cấu hình cookie/CORS phù hợp và kiểm thử trên trình duyệt mục tiêu.
- Socket handshake xác thực access JWT; khi token hết hạn, buộc xác thực lại. Mỗi thao tác socket tiếp tục kiểm tra session, trạng thái tài khoản và quyền trên đối tượng.

auth_sessions quản lý phiên thiết bị; auth_tokens lưu hash refresh token cùng lịch sử đã sử dụng để phát hiện reuse.

### 4.3. Đăng xuất và phục hồi tài khoản

Đăng xuất thu hồi session hiện tại, hủy mọi refresh token của session, ngắt socket và xóa cookie. Đăng xuất tất cả thu hồi toàn bộ session.

Quên mật khẩu luôn trả thông báo chung dù email có tồn tại hay không. Reset token một lần sống 15 phút; đặt lại mật khẩu thành công thu hồi toàn bộ phiên. Không đánh dấu email đã xác minh chỉ vì reset mật khẩu.

Khóa tài khoản thu hồi toàn bộ phiên hiện có. Nếu đăng nhập lại đúng mật khẩu, tài khoản LOCKED chỉ được dùng các endpoint hạn chế ở mục 3. Mở khóa không khôi phục phiên cũ.

Thay đổi email, xác minh số điện thoại bằng OTP và social login không thuộc MVP. Số điện thoại liên hệ được sửa theo mục 5 nhưng không được hiển thị là đã xác minh.

## 5. Hồ sơ và dữ liệu riêng tư

Profile công khai gồm tên, avatar, khu vực cấp tỉnh/thành phố, ngày tham gia, điểm đánh giá, số đơn bán hoàn tất và sản phẩm công khai.

Profile riêng có thêm email, điện thoại, địa chỉ mặc định. User được sửa full_name, avatar, phone, province_code, default_address; email, role, status và email_verified_at không được sửa qua profile API.

Địa chỉ/điện thoại giao nhận chỉ xuất hiện với buyer, seller của chính đơn hàng và admin xử lý hỗ trợ. Không trả email, địa chỉ cụ thể hoặc số điện thoại trong API profile công khai.

Rating lấy trung bình review chưa bị ẩn, làm tròn một chữ số khi hiển thị; chưa có review trả rating=NULL và review_count=0. Số giao dịch công khai là số order bán ở trạng thái COMPLETED, không phải số sản phẩm hoặc số lần chat.

## 6. Danh mục và sản phẩm

### 6.1. Danh mục

Danh mục tối đa hai cấp trong MVP, ví dụ Điện tử → Laptop. Không được tạo quan hệ cha–con vòng, chọn chính mình làm cha hoặc gắn tin mới vào danh mục bị vô hiệu.

Chỉ danh mục lá đang hoạt động, có toàn bộ tổ tiên hoạt động, mới nhận tin đăng. Vô hiệu danh mục làm ngừng hiển thị/mua mới các tin liên quan nhưng không thay đổi đơn đã tạo. Đơn PENDING bị chặn xác nhận nếu danh mục không còn hợp lệ và được hủy/giải phóng hàng; các đơn đã CONFIRMED tiếp tục được xử lý.

### 6.2. Dữ liệu sản phẩm

| Trường | Quy định |
|---|---|
| title | 5–150 ký tự sau trim |
| description | 20–5.000 ký tự, văn bản thuần |
| category_id | Danh mục lá hợp lệ |
| price | VND nguyên dương, tối đa 1.000.000.000 |
| condition | LIKE_NEW, GOOD, FAIR, HEAVILY_USED |
| usage_months | Số tháng sử dụng, tùy chọn, không âm |
| images | 1–8 ảnh, thứ tự ảnh đầu là ảnh đại diện |
| province_code | Mã khu vực trong danh mục địa lý có phiên bản |
| delivery_method | COD, MEETUP hoặc BOTH |
| shipping_fee | VND nguyên không âm, tối đa 10.000.000; MEETUP phải bằng 0 |

Ví dụ: Keychron K2 V2, giá 1.100.000 VND, tình trạng GOOD, đã dùng 12 tháng, khu vực Đà Nẵng, giao nhận BOTH.

Giá được backend kiểm tra lại khi đặt hàng. Thời điểm đăng hiển thị là published_at của lần đầu được duyệt; cập nhật nội dung không tự đẩy tin lên đầu.

### 6.3. Trạng thái sản phẩm

| Từ | Sang | Người thực hiện / điều kiện |
|---|---|---|
| Tạo mới | PENDING | Seller gửi tin đủ dữ liệu/ảnh |
| PENDING | ACTIVE | Admin duyệt, seller và category hợp lệ |
| PENDING | REJECTED | Admin từ chối, bắt buộc lý do |
| ACTIVE | PENDING | Seller sửa nội dung, giá, ảnh hoặc giao nhận; phải duyệt lại |
| REJECTED / INACTIVE | PENDING | Seller gửi duyệt lại; chưa xóa, không bị admin chặn |
| PENDING / REJECTED / ACTIVE | INACTIVE | Seller ẩn tin |
| ACTIVE | RESERVED | Backend giữ hàng nguyên tử khi tạo order |
| RESERVED | SOLD | Order COMPLETED |
| RESERVED | ACTIVE hoặc INACTIVE | Order CANCELLED, theo quy tắc giải phóng hàng |

APPROVED là hành động kiểm duyệt, không phải trạng thái lưu riêng. Sửa PENDING vẫn là PENDING và tăng version; admin phải duyệt đúng version đã xem.

RESERVED và SOLD không cho seller sửa/ẩn/xóa hoặc đăng lại. Muốn bán một món khác phải tạo tin mới. DELETE sản phẩm là soft delete: chỉ cho PENDING, REJECTED, ACTIVE, INACTIVE; đặt deleted_at và status=INACTIVE, giữ lịch sử.

Admin chặn tin bằng is_blocked=true, kèm lý do và audit. Cờ này độc lập với trạng thái mua bán để giữ nguyên RESERVED/SOLD của giao dịch. Gỡ chặn không tự đăng lại tin; tin chưa bán phải qua PENDING.

Tin công khai được mua phải đồng thời ACTIVE, chưa xóa, không bị chặn, seller ACTIVE/đã xác minh và category hợp lệ. Search chỉ trả các tin này. Detail có thể hiển thị RESERVED/SOLD cùng nhãn không khả dụng nếu không bị chặn/xóa; chủ sở hữu vẫn xem được tin riêng theo quyền.

## 7. Tìm kiếm, yêu thích và giỏ hàng

Tìm kiếm theo tên, mô tả và tên danh mục. MVP dùng truy vấn PostgreSQL không phân biệt hoa thường, hỗ trợ từ khóa tiếng Việt đúng dấu; tìm không dấu/xếp hạng độ liên quan để giai đoạn sau.

Bộ lọc: category_id (gồm danh mục con khi chọn cha), min_price, max_price, condition, province_code, delivery_method. Sắp xếp: newest, price_asc, price_desc; thêm id làm khóa phụ để thứ tự ổn định.

Phân trang page/page_size, mặc định 20, tối đa 100. Keyword tối đa 100 ký tự; kiểm tra min_price ≤ max_price; escape wildcard khi dùng tìm chuỗi ILIKE. Response có total và total_pages.

User thêm/bỏ yêu thích idempotent. Sản phẩm hết khả dụng vẫn xuất hiện trong danh sách riêng với nhãn tương ứng; tin bị chặn/xóa chỉ hiện placeholder không lộ nội dung đã ẩn.

Mỗi user có một cart, mỗi product tối đa một cart_item, quantity cố định 1. Không thêm sản phẩm của mình hoặc tin không khả dụng. Cart không giữ hàng và không khóa giá. Khi giá đổi, UI yêu cầu buyer kiểm tra lại; item hết khả dụng không được checkout. Cho phép chọn một phần cart và nhóm theo seller.

## 8. Checkout, giữ hàng và tính tiền

Mua ngay và checkout từ giỏ dùng chung service tạo đơn.

Buyer chọn sản phẩm, phương thức giao nhận cho từng seller, cung cấp tên/số điện thoại/địa chỉ hoặc địa điểm gặp. Toàn bộ sản phẩm trong cùng nhóm seller phải hỗ trợ phương thức đã chọn; nếu không có phương thức chung, buyer chọn lại các món phù hợp.

Mỗi order lưu snapshot tên, giá, tình trạng và ảnh đại diện của từng sản phẩm, cùng thông tin liên hệ/giao nhận. Sau khi tạo đơn, không cho sửa những snapshot này.

- subtotal = tổng giá các order_items, mỗi món số lượng 1.
- shipping_fee = 0 cho MEETUP; với COD lấy phí cao nhất trên các sản phẩm trong order.
- total_amount = subtotal + shipping_fee, currency=VND.
- Frontend hiển thị rõ phí từng seller trước khi xác nhận.
- Backend tự tính tiền; expected_price/expected_shipping_fee từ client chỉ dùng phát hiện thay đổi, không làm giá thanh toán.
- Giá hoặc phí khác thời điểm buyer xác nhận trả PRICE_CHANGED và tạo lại bước xác nhận; không tự tăng tiền rồi tạo đơn.

### 8.1. Transaction đặt hàng

1. Client gửi Idempotency-Key duy nhất cùng payload; key gắn buyer và hash payload chuẩn hóa.
2. Trong một transaction, tạo checkout_requests, kiểm tra user, category, quyền và toàn bộ sản phẩm.
3. Tạo một order PENDING cho mỗi seller, lưu snapshot và expires_at=created_at+24 giờ.
4. Giữ hàng bằng cập nhật có điều kiện status=ACTIVE, version đúng, reserved_order_id=NULL và các điều kiện hợp lệ; khóa hàng theo thứ tự UUID ổn định để giảm deadlock.
5. Chỉ chấp nhận khi mọi món giữ thành công; đổi chúng thành RESERVED và reserved_order_id tương ứng.
6. Lưu order_items, lịch sử, sự kiện outbox và xóa các cart_items đã mua của buyer trong cùng transaction.
7. Một sản phẩm thất bại làm rollback tất cả seller trong checkout; trả 409 PRODUCT_NOT_AVAILABLE.

Mọi thao tác cạnh tranh như xác nhận, hết hạn, khóa user, vô hiệu category và sửa tin phải dùng transaction/khóa hoặc kiểm tra version tương thích. Chỉ kiểm tra ở frontend hoặc SELECT trước UPDATE là chưa đủ.

Gửi lại cùng key/payload sau thành công trả đúng nhóm đơn cũ, kể cả đơn đã bị hủy; key với payload khác trả IDEMPOTENCY_CONFLICT. Retry sau transaction đã rollback có thể thực hiện lại. Unique constraint trên buyer_id + idempotency_key xử lý request đồng thời; nếu xung đột, đọc kết quả đã commit hoặc trả RETRY_LATER để client dùng lại cùng key.

### 8.2. Hết hạn và giải phóng hàng

Worker kiểm tra ít nhất mỗi phút, hủy PENDING đã quá expires_at với reason=SELLER_TIMEOUT. Seller xác nhận quá hạn bị từ chối ngay tại API, dù worker chưa chạy. Xác nhận và hết hạn cùng lúc chỉ một thao tác được commit.

Khi hủy, chỉ giải phóng sản phẩm có reserved_order_id đúng order đó. Tin trở về ACTIVE nếu seller/category còn hợp lệ, chưa xóa và không bị chặn; nếu không thì INACTIVE. Xóa reserved_order_id trong cùng transaction.

Đơn CONFIRMED không tự hết hạn giữ hàng. Sau 72 giờ chưa giao, tạo một thông báo nhắc và cho phép mở ticket. Không tự đánh dấu giao hàng hay hoàn tất.

## 9. Vòng đời đơn hàng và thanh toán

| Từ | Sang | Quyền và điều kiện |
|---|---|---|
| PENDING | CONFIRMED | Seller của đơn, trước expires_at; hàng và tài khoản/danh mục còn hợp lệ |
| PENDING | CANCELLED | Buyer, seller, admin có lý do; hoặc worker hết hạn |
| CONFIRMED | CANCELLED | Buyer hoặc seller trước khi giao, bắt buộc lý do; admin xử lý hỗ trợ |
| CONFIRMED | SHIPPING | Seller, chỉ COD; ghi thời điểm gửi và thông tin vận chuyển nếu có |
| SHIPPING | DELIVERED | Buyer xác nhận đã nhận; hoặc seller khai báo giao xong, ghi rõ actor |
| CONFIRMED | DELIVERED | Chỉ MEETUP, buyer xác nhận đã nhận tại điểm gặp |
| DELIVERED | COMPLETED | Chỉ buyer, xác nhận hàng và đã thanh toán; không có ticket ORDER_PROBLEM đang mở |
| SHIPPING / DELIVERED | CANCELLED | Chỉ admin qua ticket, có kết luận hàng đã trả/chưa giao thành công và ghi nhận thỏa thuận tiền nếu có |

Trạng thái đầy đủ: PENDING, CONFIRMED, SHIPPING, DELIVERED, COMPLETED, CANCELLED. COMPLETED và CANCELLED là trạng thái cuối, không mở lại trong MVP. Mọi thao tác sai trạng thái trả 409 INVALID_ORDER_TRANSITION.

DELIVERED do seller khai báo không chứng minh buyer đã nhận và không tự hoàn tất đơn. Buyer có thể mở ticket nếu không nhận hàng. Trong MVP không có xác nhận giao tự động từ hãng vận chuyển.

Hủy sau khi giao qua admin luôn đưa sản phẩm về INACTIVE để seller kiểm tra hiện trạng rồi gửi duyệt lại; không tự bán lại. Cancellation của đơn nhiều món áp dụng toàn bộ đơn; hủy/hoàn trả một phần ngoài MVP.

ReMarket không thu hoặc giữ tiền. Buyer thanh toán trực tiếp cho seller bằng tiền mặt. completed_at đồng thời ghi nhận lời xác nhận đã thanh toán của buyer, không phải chứng từ do cổng thanh toán xác thực. Hoàn tiền nếu có được hai bên thực hiện ngoài hệ thống và ghi kết quả trong ticket; admin không có nút chuyển tiền.

Khóa buyer/seller hoặc chặn product: hủy đơn PENDING/CONFIRMED bị ảnh hưởng với lý do và audit; đơn SHIPPING/DELIVERED giữ lịch sử và chuyển sang xử lý ticket. User bị khóa chỉ dùng quyền hạn chế; admin giải quyết theo các bước được phép, không tự hoàn tất thay buyer. Mở khóa cần thiết trước khi buyer xác nhận COMPLETED.

Lịch sử ghi from_status, to_status, actor, reason và thời gian. Cập nhật status, product, lịch sử và sự kiện luôn cùng transaction; không cung cấp API sửa trực tiếp status tùy ý.

## 10. Chat Buyer–Seller

Một conversation duy nhất cho (product_id, buyer_id, seller_id). Seller được suy ra từ product, không lấy tùy ý từ client. Chỉ tạo conversation mới trên tin ACTIVE hợp lệ; conversation cũ tiếp tục dùng khi tin RESERVED/SOLD để trao đổi về giao dịch.

MVP hỗ trợ text 1–2.000 ký tự, thời gian, lịch sử phân trang và đã đọc. Không sửa/xóa tin sau gửi trong MVP. Tin nhắn là văn bản, không render HTML.

Chỉ hai participant được đọc/gửi/join room. Không dùng tên room hoặc ID client cung cấp làm bằng chứng quyền. User LOCKED bị chặn chat. Tin bị chặn/xóa ngừng chat mới, nhưng participant vẫn xem lịch sử riêng.

Tin được ghi database trước khi ACK và phát sự kiện. Client gửi client_message_id; unique(conversation_id, sender_id, client_message_id) chống gửi trùng khi retry. Message được sắp theo created_at + id. Khi reconnect, lấy lại lịch sử từ API, không coi sự kiện socket là đảm bảo đã nhận đủ.

Chỉ người nhận được đánh dấu read_at cho tin của bên kia; gửi lại thao tác đọc không đổi thời điểm đã đọc đầu tiên. REST là đường gửi/đọc dự phòng, dùng cùng validation và deduplication như socket.

## 11. Đánh giá, báo cáo, thông báo và hỗ trợ

### 11.1. Đánh giá

Buyer của order COMPLETED đánh giá đúng seller của order, tối đa một review/order trong 30 ngày sau completed_at. Rating là số nguyên 1–5, comment tùy chọn tối đa 1.000 ký tự. MVP không sửa/xóa review bởi user; admin được ẩn review vi phạm với lý do/audit. Review bị ẩn không tính rating.

### 11.2. Báo cáo

User báo cáo product hoặc user khác; reason gồm COUNTERFEIT, PROHIBITED, FRAUD, SPAM, HARASSMENT, INAPPROPRIATE, OTHER. OTHER phải có mô tả. Không tự report chính mình/tin của mình.

Mỗi user chỉ có một report PENDING trên cùng đối tượng. Trạng thái PENDING → RESOLVED hoặc REJECTED, bắt buộc resolution_note, handled_by, handled_at. Đối tượng được tham chiếu bằng FK riêng cho product/user và CHECK chỉ có đúng một target.

Admin có thể ẩn tin, gửi cảnh báo trong notification, khóa tài khoản hoặc đóng report. Giải quyết report và hành động xử lý phải có audit; không trả danh tính reporter cho người bị báo cáo.

### 11.3. Thông báo

Notification bền vững trong database, hiển thị trong ứng dụng. Socket giúp cập nhật tức thời; tải trang/reconnect luôn đọc lại database.

Sự kiện: duyệt/từ chối/chặn tin, tin nhắn mới, tạo/xác nhận/hủy/giao/hoàn tất đơn, nhắc xử lý đơn, review, phản hồi ticket và kết quả report. Có read_at, đếm chưa đọc, đánh dấu một hoặc tất cả đã đọc. Đánh dấu tất cả chỉ áp dụng tới thời điểm yêu cầu.

Mỗi sự kiện có dedupe_key để worker retry không tạo trùng. Payload chỉ chứa thông tin được phép của người nhận; deep link phải kiểm tra quyền lại khi truy cập.

### 11.4. Support ticket

Loại: ACCOUNT, ORDER_PROBLEM, PRODUCT, OTHER. Tiêu đề 5–150 ký tự; message 1–5.000 ký tự. ORDER_PROBLEM bắt buộc liên kết order mà người gửi là buyer/seller.

Trạng thái OPEN → IN_PROGRESS → RESOLVED → CLOSED. Admin nhận xử lý và đánh dấu RESOLVED kèm kết luận; chủ ticket được đóng RESOLVED hoặc phản hồi để trở lại OPEN; admin cũng có thể đóng với lý do. CLOSED không mở lại, có thể tạo ticket mới.

Chủ ticket và admin được xem/trao đổi; bên giao dịch còn lại không tự có quyền đọc ticket. Ticket ORDER_PROBLEM ở OPEN/IN_PROGRESS chặn hoàn tất đơn; kiểm tra và thay đổi trạng thái ticket/order cần khóa cùng order để tránh race.

## 12. Admin

Dashboard gồm tổng user, user mới theo khoảng ngày, product theo trạng thái, số order COMPLETED, tổng giá trị order COMPLETED và report/ticket chưa xử lý. Tổng giá trị giao dịch là số liệu order, không được gọi là doanh thu nền tảng.

Admin tìm kiếm/xem/khóa/mở khóa user; duyệt/từ chối/chặn sản phẩm; tạo/sửa/vô hiệu danh mục; xử lý review/report/ticket. Danh sách quản trị có phân trang, lọc trạng thái, khoảng ngày và người xử lý.

Khóa tài khoản, chặn sản phẩm, xử lý report, thay đổi category và chuyển trạng thái đặc biệt đều phải ghi audit. API profile không được sửa role; tạo admin đầu tiên bằng lệnh quản trị có kiểm soát, không có endpoint tự đăng ký admin.

## 13. Mô hình database

### 13.1. Quy ước

Có 22 bảng nghiệp vụ/kỹ thuật ở dưới; không có bảng profiles riêng, users chứa thông tin tài khoản và hồ sơ. Các bảng nội bộ do Supabase quản lý không tính trong danh sách này.

- PK id dùng UUID, trừ favorites dùng PK ghép.
- Tất cả trường hậu tố _at dùng TIMESTAMPTZ, lưu theo UTC; giao diện mặc định Asia/Ho_Chi_Minh. from_status/to_status dùng cùng enum OrderStatus; mọi trường *_id dùng UUID.
- Trường không có dấu ? là NOT NULL; ? nghĩa nullable. id mặc định sinh UUID, created_at mặc định thời điểm hiện tại; updated_at được cập nhật khi sửa.
- Mỗi enum và độ dài field phải được phản ánh trong Prisma schema/migration.
- Tiền dùng BIGINT VND có CHECK không âm; API trả chuỗi số nguyên để tránh mất độ chính xác khi JSON/JavaScript xử lý. price còn có CHECK > 0 và giới hạn mục 6.
- Mọi trường *_id có quan hệ bên dưới phải là FK; UUID không phải FK chỉ vì tên có hậu tố _id.
- FK mặc định ON DELETE RESTRICT, ON UPDATE RESTRICT; không xóa cứng users/products/orders trong luồng ứng dụng.
- Chỉ các hàng phụ không mang lịch sử như cart_items/product_images mới được cân nhắc CASCADE khi có tác vụ dọn dữ liệu rõ ràng.
- Constraint xuyên bảng như order_items phải cùng seller, quyền review, category còn active được bảo vệ trong service transaction; không thể thay bằng CHECK tham chiếu bảng khác.

### 13.2. Danh sách bảng và trường

| # | Bảng | Trường |
|---|---|---|
| 1 | users | id, full_name VARCHAR(100), email VARCHAR(254) UNIQUE, password_hash TEXT, phone VARCHAR(20), avatar_path TEXT?, province_code VARCHAR(20)?, default_address TEXT?, role USER/ADMIN default USER, status ACTIVE/LOCKED default ACTIVE, email_verified_at?, locked_at?, lock_reason TEXT?, created_at, updated_at |
| 2 | auth_sessions | id, user_id → users, expires_at, revoked_at?, user_agent VARCHAR(500)?, created_at, updated_at |
| 3 | auth_tokens | id, user_id → users, session_id? → auth_sessions, purpose REFRESH/VERIFY_EMAIL/RESET_PASSWORD, token_hash TEXT UNIQUE, expires_at, used_at?, revoked_at?, created_at |
| 4 | categories | id, parent_id? → categories, name VARCHAR(100), slug VARCHAR(120) UNIQUE, status ACTIVE/INACTIVE default ACTIVE, created_at, updated_at |
| 5 | products | id, seller_id → users, category_id → categories, title VARCHAR(150), description TEXT, price BIGINT, condition enum mục 6, usage_months INT?, province_code VARCHAR(20), delivery_method COD/MEETUP/BOTH, shipping_fee BIGINT default 0, status enum mục 6 default PENDING, version INT default 1, is_blocked BOOL default false, block_reason TEXT?, reserved_order_id? → orders, reviewed_by? → users, reviewed_at?, rejection_reason TEXT?, published_at?, deleted_at?, created_at, updated_at |
| 6 | product_images | id, product_id → products, storage_path TEXT UNIQUE, sort_order SMALLINT, created_at |
| 7 | favorites | user_id → users, product_id → products, created_at; PK(user_id, product_id) |
| 8 | carts | id, user_id → users UNIQUE, created_at, updated_at |
| 9 | cart_items | id, cart_id → carts, product_id → products, created_at |
| 10 | conversations | id, product_id → products, buyer_id → users, seller_id → users, created_at, updated_at |
| 11 | messages | id, conversation_id → conversations, sender_id → users, client_message_id UUID, content VARCHAR(2000), read_at?, created_at |
| 12 | checkout_requests | id, buyer_id → users, idempotency_key VARCHAR(128), request_hash TEXT, created_at |
| 13 | orders | id, checkout_request_id → checkout_requests, buyer_id → users, seller_id → users, subtotal BIGINT, shipping_fee BIGINT, total_amount BIGINT, currency CHAR(3) default VND, delivery_method COD/MEETUP, recipient_name VARCHAR(100), recipient_phone VARCHAR(20), delivery_address TEXT, status enum mục 9 default PENDING, version INT default 1, expires_at, confirmed_at?, shipped_at?, delivered_at?, completed_at?, cancelled_at?, cancelled_by? → users, cancellation_reason TEXT?, carrier VARCHAR(100)?, tracking_code VARCHAR(100)?, created_at, updated_at |
| 14 | order_items | id, order_id → orders, product_id → products, title_snapshot VARCHAR(150), condition_snapshot enum mục 6, image_path_snapshot TEXT, price BIGINT, created_at |
| 15 | order_status_history | id, order_id → orders, from_status?, to_status enum mục 9, actor_id? → users, actor_type USER/ADMIN/SYSTEM, reason TEXT?, created_at |
| 16 | reviews | id, order_id → orders UNIQUE, reviewer_id → users, reviewed_user_id → users, rating SMALLINT, comment VARCHAR(1000)?, hidden_at?, hidden_by? → users, hidden_reason TEXT?, created_at |
| 17 | reports | id, reporter_id → users, reported_product_id? → products, reported_user_id? → users, reason enum mục 11, description VARCHAR(2000)?, status PENDING/RESOLVED/REJECTED default PENDING, resolution_note TEXT?, handled_by? → users, handled_at?, created_at, updated_at |
| 18 | notifications | id, user_id → users, type VARCHAR(60), title VARCHAR(150), content VARCHAR(1000), reference_type VARCHAR(30), reference_id UUID?, dedupe_key VARCHAR(200), read_at?, created_at |
| 19 | support_tickets | id, user_id → users, order_id? → orders, assigned_admin_id? → users, subject VARCHAR(150), type enum mục 11, status OPEN/IN_PROGRESS/RESOLVED/CLOSED default OPEN, resolution_note TEXT?, resolved_at?, closed_at?, created_at, updated_at |
| 20 | support_messages | id, ticket_id → support_tickets, sender_id → users, message VARCHAR(5000), created_at |
| 21 | audit_logs | id, actor_id? → users, actor_type USER/ADMIN/SYSTEM, action VARCHAR(100), entity_type VARCHAR(50), entity_id UUID?, reason TEXT?, metadata JSONB, created_at |
| 22 | outbox_events | id, event_type VARCHAR(100), aggregate_id UUID, dedupe_key VARCHAR(200) UNIQUE, payload JSONB, attempts INT default 0, next_attempt_at, processed_at?, last_error TEXT?, created_at |

notifications.reference_id, audit_logs.entity_id và outbox_events.aggregate_id là tham chiếu sự kiện đa loại, không phải FK; service phải kiểm tra loại/đối tượng và quyền. Không dùng các tham chiếu này làm nguồn dữ liệu giao dịch. orders.delivery_address lưu địa chỉ giao COD hoặc điểm gặp MEETUP.

### 13.3. Constraint và index bắt buộc

- UNIQUE(cart_id, product_id), UNIQUE(product_id, sort_order), UNIQUE(product_id, buyer_id, seller_id) trên conversations.
- UNIQUE(conversation_id, sender_id, client_message_id), UNIQUE(buyer_id, idempotency_key) trên checkout_requests.
- UNIQUE(checkout_request_id, seller_id) trên orders, UNIQUE(order_id, product_id) trên order_items.
- UNIQUE(user_id, dedupe_key) trên notifications.
- Partial unique index trên reports(reporter_id, reported_product_id) và reports(reporter_id, reported_user_id) khi status=PENDING và target tương ứng không NULL.
- CHECK trong reports: đúng một trong reported_product_id/reported_user_id khác NULL.
- CHECK rating BETWEEN 1 AND 5, buyer_id <> seller_id, reviewer_id <> reviewed_user_id, usage_months >= 0 nếu có, version > 0, sort_order BETWEEN 0 AND 7.
- CHECK orders.total_amount = subtotal + shipping_fee; currency=VND; tiền không âm, order_items.price > 0.
- CHECK products.status=RESERVED khi và chỉ khi reserved_order_id khác NULL. Cập nhật cùng một câu lệnh khi giữ/giải phóng hàng.
- CHECK auth_tokens: session_id bắt buộc cho REFRESH, NULL cho VERIFY_EMAIL/RESET_PASSWORD. Service kiểm tra token.user_id khớp session.user_id.
- Chỉ một reservation hiện tại trên mỗi product; không đặt UNIQUE(product_id) trên toàn bộ order_items vì sản phẩm có thể được đặt lại sau đơn hủy.
- Index products(status, created_at, id), products(category_id, status, price), products(province_code, status), products(seller_id, status).
- Index orders(buyer_id, created_at, id), orders(seller_id, status, created_at), orders(status, expires_at), order_items(product_id).
- Index messages(conversation_id, created_at, id), notifications(user_id, read_at, created_at), reports(status, created_at), support_tickets(user_id, status), support_tickets(order_id, status), auth_sessions(user_id, revoked_at).
- Index outbox_events(processed_at, next_attempt_at) và audit_logs(entity_type, entity_id, created_at).
- Index các FK còn lại theo truy vấn thực tế. Partial index/CHECK chưa diễn đạt được trong phiên bản Prisma chọn dùng phải nằm trong SQL migration được quản lý.

Giới hạn 8 ảnh, seller khớp với product/order, review đúng buyer/seller, snapshot bất biến và cấm vòng category phải được kiểm tra dưới transaction thích hợp. Snapshot ảnh của order phải được giữ khi dọn ảnh nguồn để lịch sử không bị hỏng.

## 14. REST API contract

Prefix: /api/v1. Request/response JSON UTF-8; thời gian ISO 8601 có timezone; ID là UUID; số tiền là chuỗi VND nguyên. API chỉ chấp nhận các field được khai báo, từ chối role/status/giá tổng do client tự chèn.

Response thành công:

    {
      "success": true,
      "data": {},
      "meta": { "request_id": "uuid" }
    }

Danh sách bổ sung page, page_size, total, total_pages trong meta. Message history dùng cursor thay cho page để tải tiếp khi có tin mới.

Response lỗi:

    {
      "success": false,
      "error": {
        "code": "PRODUCT_NOT_AVAILABLE",
        "message": "Sản phẩm không còn khả dụng.",
        "details": { "product_ids": ["uuid"] }
      },
      "meta": { "request_id": "uuid" }
    }

HTTP: 200 thành công, 201 tạo mới, 202 đã nhận yêu cầu email, 400 payload sai, 401 thiếu/hết hiệu lực xác thực, 403 thiếu quyền, 404 không tồn tại hoặc cố ý che tài nguyên riêng, 409 xung đột nghiệp vụ, 422 validation, 429 giới hạn tần suất, 500 lỗi nội bộ.

Mã lỗi tối thiểu: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, EMAIL_NOT_VERIFIED, ACCOUNT_LOCKED, NOT_FOUND, PRODUCT_NOT_AVAILABLE, PRICE_CHANGED, INVALID_ORDER_TRANSITION, ORDER_EXPIRED, VERSION_CONFLICT, REVIEW_NOT_ALLOWED, IDEMPOTENCY_CONFLICT, RETRY_LATER, RATE_LIMITED.

### 14.1. Endpoint

| Module | Method và path | Quyền / kết quả |
|---|---|---|
| Auth | POST /auth/register, /auth/login | Public, giới hạn tần suất |
| Auth | POST /auth/refresh | Cookie + CSRF/Origin, xoay refresh |
| Auth | POST /auth/verify-email, /auth/forgot-password, /auth/reset-password | Token một lần / phản hồi chung |
| Auth | POST /auth/resend-verification | User của chính email, rate limit |
| Auth | POST /auth/logout, /auth/logout-all | Session hiện tại / toàn bộ |
| Profile | GET /me; PATCH /me | Chính chủ, whitelist field mục 5 |
| Profile | GET /users/:id | DTO công khai |
| Profile | GET /users/:id/products, /users/:id/reviews | Chỉ dữ liệu công khai |
| Category | GET /categories | Cây danh mục hợp lệ |
| Product | GET /products; GET /products/:id | Quy tắc hiển thị mục 6–7 |
| Product | GET /me/products | Tin riêng của seller |
| Product | POST /products; PATCH /products/:id | Seller, validation, expected_version |
| Product | POST /products/:id/submit, /products/:id/hide; DELETE /products/:id | Seller, chuyển trạng thái/soft delete |
| Upload | POST /uploads | User, multipart file + purpose; trả storage_path và preview URL có hạn |
| Favorite | GET /favorites; PUT /favorites/:productId; DELETE /favorites/:productId | Chính chủ; thêm/bỏ idempotent |
| Cart | GET /cart; PUT /cart/items/:productId; DELETE /cart/items/:productId | Chính chủ |
| Order | POST /orders | Buyer, Idempotency-Key bắt buộc; trả checkout_request_id và orders[] |
| Order | GET /orders?role=buyer hoặc seller; GET /orders/:id | Participant; lọc trạng thái và phân trang |
| Order | POST /orders/:id/confirm, /cancel, /ship, /deliver, /complete | Theo bảng chuyển trạng thái, expected_version |
| Chat | POST /conversations; GET /conversations | Tạo hoặc lấy lại conversation; participant |
| Chat | GET /conversations/:id/messages | Participant, cursor pagination |
| Chat | POST /conversations/:id/messages | REST fallback, client_message_id |
| Chat | POST /conversations/:id/read | Đánh dấu đến last_message_id hợp lệ |
| Review | POST /orders/:id/review | Buyer đủ điều kiện |
| Report | POST /reports; GET /me/reports | User tạo/xem report của mình |
| Notification | GET /notifications; GET /notifications/unread-count | Chính chủ |
| Notification | PATCH /notifications/:id/read; POST /notifications/read-all | Chính chủ |
| Support | POST /support-tickets; GET /support-tickets; GET /support-tickets/:id | Chủ ticket/admin |
| Support | POST /support-tickets/:id/messages; POST /support-tickets/:id/close | Chủ ticket hoặc admin, theo trạng thái/quyền mục 11 |
| Admin | GET /admin/dashboard, /admin/users, /admin/users/:id | Admin |
| Admin | POST /admin/users/:id/lock, /unlock | Admin, reason khi khóa |
| Admin | GET /admin/products; POST /admin/products/:id/approve, /reject, /block, /unblock | Admin, expected_version và reason khi cần |
| Admin | POST /admin/categories; PATCH /admin/categories/:id | Admin; cập nhật/vô hiệu |
| Admin | GET /admin/reports; POST /admin/reports/:id/resolve, /reject | Admin, kết luận bắt buộc |
| Admin | GET /admin/reviews; POST /admin/reviews/:id/hide | Admin, lý do |
| Admin | GET /admin/support-tickets; PATCH /admin/support-tickets/:id | Admin, assign/chuyển trạng thái hợp lệ |
| Admin | POST /admin/orders/:id/cancel | Admin, ticket_id + lý do nếu đã giao |
| Admin | GET /admin/audit-logs | Admin, phân trang và bộ lọc |

Các route support dùng chung chỉ trả ticket đúng quyền; endpoint admin không mở quyền đọc chat. Xem order qua ticket vẫn phải kiểm tra quyền admin tại server.

### 14.2. Payload tạo đơn

    {
      "items": [
        { "product_id": "uuid", "expected_price": "1100000" }
      ],
      "deliveries": [
        {
          "seller_id": "uuid",
          "method": "COD",
          "recipient_name": "Nguyễn Văn A",
          "recipient_phone": "0900000000",
          "delivery_address": "Địa chỉ nhận hàng",
          "expected_shipping_fee": "30000"
        }
      ]
    }

Server suy ra seller từ product và kiểm tra deliveries khớp chính xác các seller được chọn. Các thao tác chuyển trạng thái nhận expected_version; cancel thêm reason, ship có carrier/tracking_code tùy chọn, complete yêu cầu buyer_confirmed_received=true và buyer_confirmed_paid=true.

Trước khi triển khai endpoint, OpenAPI phải có schema request/response, field bắt buộc, quyền, các lỗi, ví dụ và pagination tương ứng. Bảng này là contract tổng thể, không thay thế OpenAPI chi tiết.

## 15. Socket.IO và tác vụ nền

Client events: conversation:join, message:send, conversation:read. Server events: message:created, conversation:read, notification:created, order:updated. Mỗi ACK có success, data hoặc error.code; message:send dùng cùng client_message_id như REST.

Room user:{id} do server tự xác định; room conversation:{id} chỉ join sau kiểm tra membership. Không cho client chỉ định sender_id hoặc recipient list tùy ý.

Outbox được ghi cùng transaction nghiệp vụ. Worker claim sự kiện có khóa, retry tăng dần, dedupe khi xử lý, ghi processed_at khi hoàn thành. Email, notification và socket delivery không được làm rollback một đơn đã commit. Sau tối đa 10 lần lỗi, phát cảnh báo vận hành và giữ sự kiện để retry thủ công. Với socket, khách có thể nhận trùng; UI dedupe theo event/message ID.

Worker xử lý hết hạn đơn, nhắc đơn CONFIRMED quá 72 giờ, email và dọn upload mồ côi. MVP chạy một backend Socket.IO instance; nếu tăng nhiều instance cần adapter chia sẻ và kiểm thử routing/reconnect trước khi triển khai.

## 16. Bảo mật và lưu trữ ảnh

- JWT secret/key, DATABASE_URL, SMTP credential và Supabase service-role key chỉ ở server; không nằm trong biến VITE_* hoặc source control.
- Không cấp anon/authenticated truy cập trực tiếp bảng nghiệp vụ. RLS và quyền database được cấu hình deny-by-default; API dùng role database riêng với quyền tối thiểu cần thiết. RLS không thay thế kiểm tra quyền trong Express/Prisma.
- Bucket ảnh private; upload/download qua backend hoặc signed URL do backend cấp sau kiểm tra quyền. Không lưu signed URL có hạn vào database, chỉ lưu storage_path.
- API product/profile/order trả URL xem ảnh ngắn hạn theo quyền của resource; tải lại resource để làm mới URL. URL đã cấp có thể còn dùng được đến hết hạn sau khi tin bị ẩn, vì vậy TTL mặc định 5 phút và không xem thao tác ẩn là thu hồi tức thời mọi URL đã phát hành.
- JPG, PNG, WebP, tối đa 5 MB/ảnh; kiểm tra magic bytes, decode thực tế, kích thước tối đa 20 megapixel và loại metadata không cần thiết. SVG/HTML/file thực thi bị từ chối.
- Client chỉ gắn ảnh nằm trong namespace của mình, đã upload thành công và chưa gắn sai đối tượng. Product có 1–8 ảnh; avatar một ảnh. Tạo tin và liên kết ảnh phải kiểm tra đồng thời.
- Ảnh upload chưa được tham chiếu được dọn sau 24 giờ; không xóa ảnh đang dùng trong avatar, product hoặc order snapshot.
- Áp dụng HTTPS, security headers, CORS allowlist; giới hạn body JSON 64 KB và multipart theo quota. Render nội dung user như text; không đưa HTML không tin cậy vào DOM.
- Bcrypt chạy bất đồng bộ; truy vấn tham số hóa qua ORM; kiểm tra ownership chống IDOR, whitelist field chống mass assignment.
- Rate limit mặc định có cấu hình: login 10 lần/15 phút theo IP và email, forgot/resend email 3 lần/giờ theo IP và tài khoản, chat 30 tin/phút/user, report 5 lần/giờ/user, upload 20 ảnh/giờ/user, tạo đơn 10 lần/10 phút/buyer.
- Log theo request_id, ẩn token/password/email đầy đủ/địa chỉ/điện thoại; log lỗi không trả stack trace cho client.
- Không log nội dung chat trong audit; audit metadata chỉ chứa thay đổi cần thiết, không toàn bộ request.
- Chính sách nội dung phải định nghĩa hàng hóa bị cấm, spam, giả mạo và cơ chế báo cáo. Điều khoản giao dịch, quyền riêng tư và quy trình yêu cầu xóa dữ liệu cần hoàn thiện trước khi mở đăng ký công khai.

## 17. Frontend và trải nghiệm

| Nhóm | Route đề xuất |
|---|---|
| Khám phá | /, /products, /products/:id, /users/:id |
| Authentication | /login, /register, /verify-email, /forgot-password, /reset-password |
| Cá nhân | /account, /account/products, /account/products/new, /account/products/:id/edit |
| Mua hàng | /favorites, /cart, /checkout, /orders, /orders/:id |
| Bán hàng | /sales, /sales/:id |
| Giao tiếp | /messages, /messages/:id, /notifications |
| Hỗ trợ | /support, /support/new, /support/:id |
| Admin | /admin, /admin/users, /admin/products, /admin/categories, /admin/reports, /admin/reviews, /admin/support, /admin/audit |
| Lỗi | /403, /404; xử lý session hết hạn và backend không khả dụng |

Mọi danh sách có loading, empty, error, retry và pagination. Form giữ dữ liệu khi validation thất bại; nút submit chống bấm lặp nhưng server vẫn cần idempotency.

Product detail có ảnh, thông tin, seller công khai, chat, favorite, report, thêm cart/mua ngay. Chủ tin nhìn thấy quản lý tin, không có nút tự mua. CTA không khả dụng nêu rõ lý do; Guest được chuyển đến login và quay lại trang an toàn sau đăng nhập.

Checkout thể hiện nhóm seller, giá snapshot dự kiến, phí, phương thức và tổng tiền; 409 phải tải lại availability/giá và cho user xác nhận lại.

Thiết kế từ mobile 360px đến desktop; thao tác bằng bàn phím, focus hiển thị, label cho form, alt ảnh và độ tương phản phù hợp. Tiền hiển thị theo vi-VN; trạng thái UI dùng tiếng Việt, API/database dùng enum ổn định. Không lưu địa chỉ/token vào URL query.

## 18. Cấu hình, triển khai và vận hành

### 18.1. Biến môi trường

Backend: NODE_ENV, PORT, DATABASE_URL, DIRECT_DATABASE_URL nếu cấu hình migration cần kết nối riêng, JWT_SIGNING_KEY, JWT_ISSUER, JWT_AUDIENCE, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, BCRYPT_COST, WEB_ORIGINS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STORAGE_BUCKET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM, PUBLIC_WEB_URL, ORDER_CONFIRM_TIMEOUT_HOURS.

Frontend: VITE_API_BASE_URL, VITE_SOCKET_URL. Các biến VITE_* là public, không chứa secret. .env.example chỉ chứa tên và giá trị mẫu. Dev/test/staging/production dùng database, bucket và credential riêng.

### 18.2. Migration và seed

Migration versioned, không dùng thao tác reset database production. CI kiểm tra schema/migration trên database test; chạy migration qua một bước deploy kiểm soát, không để mọi replica tự chạy đồng thời.

Seed dev gồm admin, user đã/chưa xác minh, danh mục, sản phẩm ở các trạng thái, đơn mẫu và chat/review/report/ticket. Không đưa password admin cố định vào production; tạo admin bằng lệnh riêng và secret ngoài repository.

### 18.3. CI/CD và kiểm tra sức khỏe

Mỗi PR chạy lint, typecheck, test nghiệp vụ/API và build frontend/backend. Staging chạy E2E các luồng chính trước production.

GET /health/live chỉ kiểm tra process; GET /health/ready kiểm tra kết nối DB và khả năng phục vụ, không công khai credential. Worker có heartbeat; graceful shutdown ngừng nhận request/claim job và hoàn tất công việc đang xử lý.

Theo dõi lỗi 5xx, độ trễ API, connection pool, outbox thất bại, heartbeat worker, số đơn hết hạn chưa được xử lý và dung lượng storage. Log có request_id; cảnh báo phải dẫn tới người vận hành cụ thể.

Backup database hàng ngày, lưu tối thiểu 7 ngày theo cấu hình/gói dịch vụ thực tế; diễn tập restore trước go-live. Mục tiêu ban đầu RPO ≤ 24 giờ, RTO ≤ 4 giờ, phải đo và xác nhận trên hạ tầng triển khai. Có kế hoạch backup/khôi phục ảnh tương ứng, không coi backup DB là backup storage.

## 19. Kiểm thử và tiêu chí nghiệm thu

Các mục dưới đây là tiêu chí cần đạt khi triển khai, chưa phải kết quả test hiện tại.

| Nhóm | Kịch bản bắt buộc |
|---|---|
| Auth | Đăng ký/xác minh; email trùng; login sai; JWT hết hạn; refresh rotation/reuse; reset token một lần; logout thu hồi phiên |
| Phân quyền | Không sửa profile/tin của người khác; không xem đơn/chat/ticket riêng; client không tự gán ADMIN; user LOCKED bị chặn cả REST và socket |
| Sản phẩm | Dữ liệu/ảnh sai bị từ chối; tin chỉ công khai sau duyệt; sửa ACTIVE phải duyệt lại; approve bản version cũ thất bại |
| Checkout | Không tự mua; giá/phí thay đổi trả 409; group theo seller; giao nhận không tương thích bị từ chối; tổng tiền từ server |
| Cạnh tranh | Hai buyer đặt cùng món đồng thời: đúng một checkout thành công; checkout nhiều seller có một món lỗi rollback toàn bộ |
| Idempotency | Retry cùng key trả cùng đơn; cùng key khác payload thất bại; gửi đồng thời không tạo hai nhóm đơn |
| Hết hạn | Worker chạy lại không hủy/giải phóng hai lần; xác nhận đồng thời hết hạn chỉ một kết quả; không giải phóng reservation của đơn khác |
| Orders | Quyền/trạng thái theo mục 9; không chuyển COMPLETED khi ticket mở; seller khai DELIVERED không tự hoàn tất; snapshot không đổi theo product |
| Khóa/chặn | Khóa tài khoản/chặn tin đồng thời checkout không tạo đơn trái quyền; hủy đúng đơn trước giao; giữ lịch sử đơn đã giao |
| Chat | Chỉ participant được join/read/send; retry không trùng; người gửi không tự đánh dấu tin của mình đã được bên kia đọc; reconnect lấy lại tin bị lỡ |
| Review | Chỉ buyer của đơn hoàn tất, đúng seller, một lần trong 30 ngày; rating ngoài 1–5 bị từ chối; review ẩn không tính điểm |
| Report/support | Không trùng report pending; target phải tồn tại; ticket order chỉ từ participant; giải quyết có lý do/audit |
| Notification | Retry outbox không tạo trùng; chỉ chủ notification được đọc; sự kiện commit tồn tại dù socket/email lỗi |
| Storage | Sai MIME, giả extension, quá kích thước bị từ chối; không gắn file của người khác; dọn ảnh không phá snapshot order |
| UI | Mobile/desktop, loading/empty/error, keyboard navigation, mất mạng, session hết hạn và quay lại checkout an toàn |
| Vận hành | Staging deploy được; migration chạy được; health/worker/alert hoạt động; restore thử thành công |

Unit test tập trung quy tắc trạng thái, giá/phí, quyền và validation. Integration test dùng PostgreSQL test thật để kiểm tra transaction, constraint và race; mock đơn giản không đủ chứng minh chống bán trùng. E2E kiểm tra Guest → đăng ký → seller đăng tin → admin duyệt → buyer mua → seller giao → buyer hoàn tất → review.

Mục tiêu hiệu năng ban đầu: trên staging có 10.000 sản phẩm và 50 user đồng thời, p95 API danh sách/detail dưới 1 giây và tạo order dưới 2 giây, không tính cold start hay upload/email. Ghi cấu hình máy, dữ liệu và phương pháp đo; chỉ xác nhận đạt sau load test.

## 20. Thứ tự triển khai và bàn giao

1. Nền tảng: monorepo, schema/migration, validation chung, auth/session, phân quyền, seed và CI.
2. Marketplace: profile, category, upload, sản phẩm, kiểm duyệt, tìm kiếm, favorites và cart.
3. Giao dịch: checkout transaction, idempotency, giữ hàng, order state machine, worker hết hạn và lịch sử.
4. Giao tiếp: chat text, outbox, notification, review, report và support.
5. Hoàn thiện: admin dashboard, responsive/accessibility, kiểm thử cạnh tranh/E2E, deploy staging và kiểm tra vận hành.

Bàn giao gồm source code, Prisma schema/SQL migrations, seed dữ liệu tham chiếu, OpenAPI/Postman collection, .env.example, hướng dẫn chạy/deploy/backup, bộ test và kết quả kiểm thử, hướng dẫn tạo tài khoản quản trị, dữ liệu test cách ly cùng danh sách giới hạn còn lại.

Trước go-live cần chốt nhà cung cấp email, nền tảng chạy backend/worker, custom domain/cookie, cấu hình backup thực tế và văn bản chính sách. Đây là các quyết định triển khai còn mở; các tính năng ngoài MVP phải có yêu cầu bổ sung trước khi xây dựng.
