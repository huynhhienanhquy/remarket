# Review ReMarket — 10/10/2026

> Đây là kết quả review trên baseline trước sửa; line numbers và harness mô phỏng thuộc baseline đó. Các thay đổi và kiểm chứng mới nằm trong [báo cáo cập nhật](project-remediation-2026-10-10.md). Lỗi dependency ban đầu đã xác định là EPERM do sandbox đọc pnpm hardlinks, không phải package thực sự bị thiếu.

## Phạm vi và kết luận

Rà soát cấu trúc monorepo, dependency/scripts/CI, API và quyền truy cập, checkout/order, auth/session, chat/realtime, worker/outbox, upload/storage, schema/migrations, frontend hooks/pages/UI dùng chung và hợp đồng DTO/OpenAPI. Kiểm kê runtime TypeScript có **219 file, 26.991 dòng vật lý**: API 63 file/12.123 dòng, web 147 file/13.342 dòng, shared 9 file/1.526 dòng. Không tính tests vào số này; đây không phải số dòng logic hoặc tỷ lệ duplicate.

Project có nền tảng hợp lý: DTO dùng chung, route lazy loading, token access trong memory, refresh cookie HttpOnly, kiểm tra session tại backend, checkout Serializable/idempotency, khóa/version khi chuyển trạng thái, outbox và tests cho nhiều race condition. Vấn đề lớn nhất ở baseline là **một số edge case vận hành chưa được test và policy nghiệp vụ lặp nhiều nơi**. Các kiểm tra chuẩn lúc review bị chặn bởi quyền sandbox đọc pnpm hardlinks; kiểm chứng sau đó xác định dependencies vẫn hoạt động khi chạy ngoài sandbox.

Review này không sửa runtime, không cài lại dependency, không chạy migration/seed hay thao tác database hiện tại. Các kết quả dưới đây tách mô phỏng source với kiểm chứng production. Không coi báo cáo test của những ngày trước là kết quả của lượt review này.

## Lỗi cần sửa

### F01 — P1: SMTP chưa có timeout trong giai đoạn kết nối, có thể giữ cả outbox pump

- Vị trí: `apps/api/src/services/email.ts:145–153`, `:163–167`; `apps/api/src/jobs/runner.ts:251–279`; `apps/api/src/outbox/outbox.ts:69–78`.
- `sendEmail()` chờ `connect`/`secureConnect` trước khi gọi `socket.setTimeout(15_000, ...)`. Kết nối ban đầu còn ở ngoài `try/finally`. Nếu TCP/TLS handshake không kết thúc và không phát lỗi sớm, deadline 15 giây của ứng dụng chưa được bật.
- Outbox xử lý tuần tự và `await publish()`. Một email chờ kết nối sẽ giữ `outboxRunning=true`, khiến các lần pump sau trong process đó không chạy. `runJobsOnce()` cũng có thể bị giữ khi chờ `drainOutbox()`.
- Sửa: đặt deadline bao trùm từ lúc tạo socket, xử lý cả handshake, và đảm bảo cleanup ở mọi nhánh. Thêm kiểm thử SMTP giả lập không phát `connect`/`secureConnect`.
- Bằng chứng: phân tích đường thực thi; chưa thử SMTP thật. Mức ảnh hưởng phụ thuộc lỗi mạng và cấu hình production.

### F02 — P2: mở chi tiết ở trang admin >1 làm mất trang đang xem

- Vị trí: `apps/web/src/hooks/useAdminParams.ts:21`; `pages/AdminProductsPage/AdminProductsPage.tsx:64`; `pages/AdminReportsPage/AdminReportsPage.tsx:38`; `pages/AdminReviewsPage/AdminReviewsPage.tsx:37`.
- `apply({ selected: id })` luôn xóa `page` nếu patch không có trường `page`. Các trang sản phẩm/report/review tìm đối tượng được chọn chỉ trong kết quả danh sách hiện tại.
- Tái hiện: ở trang 3, bấm một row → URL mất `page=3` → query chuyển về trang 1 → row được chọn không còn trong `items` → drawer không mở. Trang user/support có query chi tiết riêng nên vẫn mở được nhưng danh sách cũng bị nhảy trang.
- Sửa: chỉ reset trang khi bộ lọc thực sự đổi; `selected` và trạng thái drawer không được reset trang. Có thể bổ sung query chi tiết riêng nếu cần hỗ trợ link trực tiếp.
- Đã mô phỏng từ hàm source: `page=3&status=PENDING` trở thành `status=PENDING&selected=product-on-page-3`.

### F03 — P2: Drawer và ConfirmDialog tranh nhau bàn phím

- Vị trí: `apps/web/src/components/common/Dialog/Dialog.tsx:48–103`; `components/common/Drawer/Drawer.tsx:43`; ví dụ thực tế `pages/AdminProductsPage/AdminProductsPage.tsx:122,134`.
- Mỗi lớp mở đều đăng ký `keydown` trên `document`, không có stack/topmost modal. Drawer và hộp xác nhận là hai panel riêng. Drawer coi focus trong ConfirmDialog là focus bên ngoài, chặn Tab và kéo focus về drawer; listener của ConfirmDialog lại kéo focus về nó.
- Mô phỏng xác nhận: Tab từ control đầu trong ConfirmDialog bị chặn và vẫn ở control đầu; Escape gọi callback đóng của **cả hai lớp**.
- `previousOverflow` riêng cho từng lớp cũng khó đảm bảo scroll lock nếu hai lớp bị đóng cùng lúc hoặc theo thứ tự khác nhau.
- Sửa: modal stack dùng chung, chỉ lớp trên cùng xử lý bàn phím/focus; scroll lock theo số lớp đang mở. Thêm test Drawer + ConfirmDialog, Tab/Shift+Tab/Escape và focus restoration.

### F04 — P2: job reminder có thể lặp cùng 50 đơn và bỏ đói phần còn lại

- Vị trí: `apps/api/src/jobs/runner.ts:148–173`.
- Query lấy tối đa 50 đơn `CONFIRMED` quá 72 giờ nhưng không loại đơn đã có reminder và không có cursor. `skipDuplicates` chỉ ngăn notification trùng; nó không làm các đơn đã nhắc biến mất khỏi tập được chọn.
- Khi 50 đơn đầu tiếp tục ở `CONFIRMED`, một kế hoạch query ổn định có thể chọn lại chúng mãi. Đơn thứ 51 trở đi không được nhắc dù job vẫn báo thành công.
- Mô phỏng 51 đơn, 3 vòng: `[50, 0, 0]`, chỉ 50 notification, đơn thứ 51 không có reminder. Test integration hiện có kiểm tra dedupe đồng thời trên một đơn (`tests/integration/database.test.ts:623`), chưa bao phủ vượt batch size.
- Sửa: lọc bằng trạng thái đã nhắc/NOT EXISTS hoặc duyệt hết bằng cursor ổn định; giữ notification + outbox cùng transaction.

### F05 — P2: cursor realtime có thể bỏ qua event commit muộn

- Vị trí: `apps/api/src/realtime/relay.ts:21,39–52`; `apps/api/src/outbox/outbox.ts:78`.
- Relay chỉ đọc `(processedAt, id)` lớn hơn watermark rồi tiến watermark vĩnh viễn. `processedAt` do worker gán bằng đồng hồ ứng dụng trước khi DB update hoàn tất, không phải thứ tự commit.
- Với nhiều worker hoặc update commit lệch thứ tự: event B timestamp mới hơn đã commit, relay tiến qua B; event A timestamp cũ hơn commit sau → A không bao giờ thỏa điều kiện đọc nữa. Đồng hồ giữa process lệch cũng gây vấn đề tương tự; khởi tạo watermark bằng `new Date()` làm phụ thuộc đồng hồ ngay lúc startup.
- Mô phỏng source relay: phát `order.updated` tại timestamp 2000; sau đó commit `session.revoked` timestamp 1000; poll tiếp theo không phát event revocation.
- Đây là mất tín hiệu realtime, không phải mất notification/order trong DB. REST vẫn xác thực session; socket còn cơ chế expiry và kiểm tra DB khi nhận action. Tuy nhiên UI và ngắt socket có thể bị chậm đến fallback/expiry.
- Sửa: cơ chế delivery/cursor có xử lý late commit. Nếu dùng cửa sổ đọc chồng lấn + dedupe thì phải định nghĩa giới hạn trễ và trường hợp vượt giới hạn; không chỉ đổi sang ID tăng dần rồi giả định ID bằng thứ tự commit.
- Chưa kiểm chứng bằng nhiều worker PostgreSQL thật.

### F06 — P2: thứ tự khóa Product/Order bị đảo giữa moderation và hủy đơn

- Vị trí: `apps/api/src/services/admin-moderation.ts:19,44`; `apps/api/src/routes/orders.ts:362,339`.
- `blockProduct()` giữ Product trước rồi chờ Order. Luồng user `cancel` giữ Order trước rồi giải phóng reserved product bằng update Product.
- Hai thao tác cùng một đơn/sản phẩm có thể tạo vòng chờ: admin giữ Product/chờ Order; user giữ Order/chờ Product. Một transaction bị DB hủy và request cần retry. Checkout có retry giới hạn, hai luồng này không có retry tương đương.
- Sửa: quy ước khóa thống nhất cho orchestration giữa User/Order/Product/Category, khóa row theo ID ổn định và recheck sau khóa. Thêm integration test ép hai transaction interleave tại điểm này.
- Bằng chứng: đường khóa trong source; chưa tái hiện deadlock trên DB. Đây là rủi ro concurrency có đường thực thi cụ thể, không kết luận mất dữ liệu vì transaction rollback.

### F07 — P2: nhiều notification có DB row nhưng không có event realtime

- Vị trí: `apps/api/src/routes/adminProducts.ts:176,236`; `routes/adminReports.ts:194,247`; `jobs/runner.ts:157`; phía web `hooks/useUnreadCounts.ts:8–14`.
- Duyệt/từ chối tin, xử lý/từ chối report và reminder tạo notification nhưng không enqueue event tương ứng. Realtime relay chỉ nhìn OutboxEvent; các luồng này không tự tạo event notification.
- Badge notification phía web có `staleTime` nhưng không có polling interval. User đang giữ tab mở có thể không thấy thông báo mới cho đến refetch/focus hoặc một event khác. Dữ liệu notification vẫn tồn tại trong DB.
- Sửa: helper tạo notification và enqueue event trong cùng transaction; với batch dedupe chỉ phát event cho những notification mới tạo. Dùng lại helper cho tất cả nguồn notification.
- Bằng chứng: đối chiếu producer → outbox → relay → query invalidation; chưa test browser end-to-end.

### F08 — P2: cleanup limiter Socket.IO bị bypass bởi return sớm

- Vị trí: `apps/api/src/realtime/server.ts:35–55`.
- Nhánh user mới hoặc window đã hết hạn `set(...)` rồi `return`. Cleanup chỉ chạy khi tăng count trong window hiện có. Nếu mỗi user chỉ gửi một tin, hoặc gửi cách nhau hơn một phút, cleanup không được gọi.
- Mô phỏng: tạo 10.002 user, tiến đồng hồ 2 phút, một user mới gửi → Map giữ 10.003 entry, gồm 10.002 entry đã hết hạn. Map có thể tăng theo user trong suốt vòng đời process.
- Sửa: cleanup trước các nhánh return hoặc dùng store có TTL/scheduler; thêm test hết hạn cho traffic mỗi user một tin. Quota REST và socket cũng đang có store riêng nên việc dùng luân phiên hai transport không dùng chung giới hạn 30 tin/phút.

## Duplicate và hướng gom code

| Nhóm | Vị trí điển hình | Nhận xét / cách xử lý |
|---|---|---|
| Kiểm tra danh mục hoạt động/cấp cuối | `routes/checkout.ts:184`, `routes/orders.ts:121`, `jobs/runner.ts:48`, `routes/adminOrders.ts:24`, `routes/cart.ts:46`, `shared/viewer.ts:101`, `services/admin-moderation.ts:86` | `categoryChainActive` ở checkout/order lặp nguyên logic. Những nơi khác viết lại bằng parent include hoặc index in-memory. Gom policy thuần và các loader nhận transaction client; giữ chiến lược batch/lock phù hợp từng use case. API hiện giới hạn hai cấp nên khác biệt parent-vs-chain chưa đủ để khẳng định lỗi dữ liệu hiện tại. |
| Hủy đơn và giải phóng reservation | `routes/orders.ts:319`, `jobs/runner.ts:72`, `services/admin-moderation.ts:37,199`, `routes/adminOrders.ts:98` | Lặp eligibility, update status/version, clear reservation, history, notification/outbox. Nên có service cancellation/release chung nhận lý do, actor và delivery outcome. Phải giữ khác biệt sau giao hàng: không tự đưa sản phẩm về ACTIVE. Đây là nhóm nên refactor trước. |
| Quyền participant của chat | `routes/chat.ts:117` và `services/chat-service.ts:17` | Hai helper có cùng query, điều kiện và thông báo lỗi. Route có thể gọi service helper chung. |
| Validation form sản phẩm | `pages/ProductFormPage/hooks/useProductForm.ts:103` và `packages/shared/src/validation.ts:119–166` | Form hardcode 5/150/20/5000/1200/8 và giới hạn tiền dù shared đã có helpers/constants. Đã lệch chi tiết: shared bắt usage months là số nguyên, form chỉ kiểm tra khoảng. Dùng shared validators và thêm kiểm tra theo state của form. |
| Tính tiền và phí ship | `apps/api/src/shared/money.ts:63`, `packages/shared/src/money.ts:94`, `routes/checkout.ts:430`, `pages/CheckoutPage/hooks/useCheckout.ts:109,131` | `sumMoney` và `addVnd` cùng cộng BigInt; max ship được viết lại dù có `orderShippingFee`. `normalizeMoney` khác `normalizeVndInput` ở validation/canonicalization. Giữ adapter lỗi backend nhưng gom phép toán/limits thuần vào shared. |
| Rate limit | `middleware/rate-limit.ts`, `routes/uploads.ts:53`, `routes/auth.ts:248`, `realtime/server.ts:35` | Có nhiều Map/window/cleanup tự viết và quota chia theo transport. Nên thống nhất store/key/TTL, rồi giữ policy khác nhau cho từng action. Shared store cần thiết khi scale ngang; chưa cần thêm hệ thống phân tán chỉ để refactor local. |
| UI mật khẩu và menu dismiss | Login/Register/ResetPassword password controls; `MarketplaceHeader/components/AccountMenu.tsx:24` và `CategoryBar.tsx:15` | Toggle password/aria/buttons và outside-click/Escape lặp. Có thể tách PasswordInput và hook dismiss nhỏ; ưu tiên thấp hơn duplicate nghiệp vụ. |
| Admin page orchestration | AdminProducts/Reports/Reviews/Users và `hooks/useAdminParams.ts` | Query URL, chọn row, cache patch, invalidation và confirm lặp nhiều. Shared helper reset trang đã lan lỗi F02 tới nhiều màn. Gom selection/filter semantics và mutation invalidation; tránh một generic page component quá nhiều cấu hình. |
| Index cùng cột | `prisma/schema.prisma:127,169`; `:226,228`; `:391,429` | User.email, Category.slug, Order.code có cả unique index và index thường trên cùng cột; baseline migration cũng tạo cả hai. Đây là duplicate schema thật, tăng storage/write cost. Kiểm tra usage rồi bỏ index thường bằng migration mới; giữ unique constraint, không sửa lịch sử migration đã deploy. |

Quét clone theo 10 dòng có nội dung sau khi chuẩn hóa whitespace cũng tìm nhiều đoạn `return { ... }` trong hook giống destructuring ở page. Đó là giao diện hook hợp lệ, **không phải hai implementation** và không nên gom chỉ vì giống text. Tương tự, HTTP/background Prisma client được tách có chủ đích để chia pool; ApiImage/MarketplaceImage là các lớp CORS/variant/fallback; web/shared API types phần lớn là interface adapter/import DTO. Không nên xóa các nhóm này như file duplicate.

## Điểm chưa tốt về cấu trúc, hiệu năng và kiểm thử

- **Module backend quá nhiều trách nhiệm:** dto-mappers 955 dòng, auth 915, products 890, orders 785, checkout 656. Route đang chứa validation, policy, SQL locks, orchestration và DTO response. Nên chia theo domain/service, không chỉ chia file theo số dòng. Mapper cũng đang chứa action policy như `orderAllowedActions`/`productCapabilities`, cần tách khỏi mapping thuần.
- **Frontend đã tách hook nhưng view còn lớn:** OrderDetail 491 dòng, ProductDetail 378 dòng. Hook trả nhiều state setters/raw mutations, một số form vẫn dùng fetch thủ công qua API thay vì query lifecycle chung. Có thể chia các section và trả handler theo intent; tránh tạo thêm state library.
- **Contract còn được mô tả thủ công ở nhiều chỗ:** shared DTO, Zod backend, web adapter/input types và OpenAPI. Ví dụ `AuthApi.resendVerification()` khai báo `retry_after?: string` (`types/api.ts:95`) nhưng API trả số (`routes/auth.ts:683`); checkout PRICE_CHANGED cast mong `current_price/cart_price` trong khi backend trả `price`, và còn nhánh `sellers`. UI hiện chỉ hiển thị cảnh báo chung nên chưa có lỗi render từ các field đó. Transport `parseEnvelope()` cast generic, không xác thực shape runtime. Contract tests kiểm tra tài liệu/method/path nhiều hơn validate response thực.
- **API lint hiện là typecheck:** `apps/api/package.json` dùng `tsc` cho cả lint và phần typecheck. Nó không áp dụng ESLint/no-unused/style như web/shared. Có helper chưa có call site runtime: `textQuery`, `emptyMeta`, auth middleware `viewerOf`, và phần lớn nhóm `money/parseMoney/assertMax/assertPositive` trong backend money. Đây là ứng viên rà tiếp, không tự động xóa public exports hoặc code chỉ dùng test.
- **N+1 ở checkout và query dư:** checkout đã khóa chain bằng recursive SQL nhưng lại `count/findUnique` từng category/ancestor để kiểm tra; tối đa 50 items làm tăng số round trip trong transaction remote DB. `/account/products` chạy `authMiddleware` ở mount rồi lại `optionalAuth` trong router, reload session hai lần. `deliverAuthEmail()` dùng HTTP Prisma client dù được worker gọi và runbook mô tả background pool riêng.
- **Một số tập đọc chưa có giới hạn phù hợp:** cart trả toàn bộ cart và relations sau mỗi add/remove; checkout fetch detail từng sản phẩm bằng Promise.all; admin audit filter đọc mọi entity ID rồi tạo IN-list. Khi dữ liệu lớn cần batch/cap/join thực sự và đo query plan; chưa có benchmark mới trong review để kết luận latency cụ thể.
- **Retention chưa được triển khai trong jobs:** session/auth token cũ và OutboxEvent đã processed tiếp tục tích lũy. Relay chạy thường xuyên nhưng schema chưa có index đúng cặp `(processedAt,id)` cho thứ tự đọc. Cần đo EXPLAIN trước khi thêm index và định nghĩa retention không làm mất replay/dedupe/audit cần giữ.
- **Test thiếu các tình huống đã phát hiện:** admin page >1 mở drawer; modal lồng nhau; reminder vượt 50; SMTP handshake treo; outbox late commit giữa process; block vs cancel interleaving; limiter expired entries. CI có PostgreSQL/test/typecheck/lint/build là điểm tốt, nhưng workflow hiện không có browser smoke. Những báo cáo browser cũ không thay thế regression test tự động.
- **UX chưa thống nhất:** ImageUpload dùng `alert`, ProductForm dùng `window.confirm`, trong khi project đã có Toast/ConfirmDialog; sao chép mã đơn không xử lý clipboard rejection. Ưu tiên thấp, có thể sửa cùng đợt gom UI.

## Kiểm chứng lượt này

| Lệnh | Kết quả thực tế |
|---|---|
| `pnpm -r test -- --maxWorkers=1 --no-file-parallelism` với TEST_DATABASE_URL trống, GOMAXPROCS=1 | Exit 1 ngay ở shared: Vite không tìm được `picomatch/index.js`; không có test suite nào được xác nhận pass. |
| `pnpm typecheck` | Exit 1 ở pnpm wrapper, tsc exit 2: thiếu type definition `node`. |
| `pnpm lint` | Exit 1 ở pnpm wrapper, ESLint exit 2: không tìm được `fast-deep-equal`. |
| `node .artifacts/project-review/reproduce.cjs` | Exit 0. Năm nhóm assertion xác nhận reminder starvation, admin pagination reset, expired limiter entries, keyboard conflict của modal và relay late commit. |
| `git status --short` trước review | Workspace sạch. |

Harness mô phỏng trích hàm trực tiếp bằng TypeScript AST, transpile rồi dùng mock DB/DOM/clock trong VM. Nó không gọi API, SMTP, browser hay database thật. Kết quả là bằng chứng logic source cho các đầu vào mô phỏng, không phải integration/E2E pass. Kiểm chứng tiếp theo cho thấy dependency graph không thiếu package: sandbox trả EPERM với một số pnpm hardlinks; các checks chạy được ngoài sandbox.

Chưa chạy build, PostgreSQL integration hoặc browser E2E trong lượt này. Việc test/lint/typecheck dừng ở dependency là vấn đề môi trường đang có, chưa đủ để kết luận source compile lỗi. Cần khôi phục dependencies theo lockfile rồi chạy lại checks trước khi triển khai các bản sửa.

## Thứ tự xử lý đề xuất

1. Khôi phục dependency installation theo lockfile, xác nhận test/typecheck/lint hoạt động.
2. Sửa F01, F02, F03, F04 và đưa regression tests tương ứng vào suite chính.
3. Sửa F05/F06 bằng test concurrency PostgreSQL tách biệt; sửa F07/F08.
4. Gom category eligibility và reservation/cancellation service; thống nhất notification + outbox helper và validators tiền/sản phẩm.
5. Xử lý index dư, retention và query batch sau khi đo staging; chia domain modules lớn và bổ sung browser regression vào CI.

Ưu tiên giảm duplicate ở **policy và transaction nghiệp vụ** trước duplicate markup. Refactor các nhóm này cần chứng minh giữ nguyên authorization, lock order, rollback, idempotency, snapshot và hành vi sau giao hàng.
