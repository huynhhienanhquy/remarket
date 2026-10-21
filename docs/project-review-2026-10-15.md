# Review toàn project — 15/10/2026

Phạm vi là workspace hiện tại trên nhánh `main`, gồm cả các thay đổi chưa commit và file mới. Đã rà API Express, Prisma schema/migrations, web, mobile Expo, shared/API client, auth/session, upload/storage, realtime, checkout/order, moderation/support, worker/outbox/push, cấu hình build/deploy và CI. Đây là review source kèm các checks bên dưới; không thay đổi code nghiệp vụ hoặc truy cập database đang dùng.

## Các vấn đề cần sửa

Tìm thấy **9 vấn đề P2**. P2 là lỗi cần xử lý trong đợt sửa tiếp theo; thứ tự bên dưới ưu tiên quyền riêng tư và tính đúng của nghiệp vụ. Mỗi mục phân biệt bằng chứng source/mô phỏng với kiểm chứng trên hệ thống thật.

### F01 — P2: Xóa tài khoản bỏ sót tên thật trong lịch sử đơn

- Vị trí: [routes/mobile.ts:238](D:/remarket/apps/api/src/routes/mobile.ts:238), đoạn 238–245; [dto-mappers.ts:381](D:/remarket/apps/api/src/shared/dto-mappers.ts:381).
- Người dùng hoàn tất/hủy đơn rồi xóa tài khoản. Luồng xóa đổi `User.fullName` và ẩn tên người nhận, nhưng không cập nhật `OrderStatusHistory.actorName`. Đối tác vẫn lấy được tên thật qua `GET /orders/:id → status_history[].actor_name`.
- Tên được sao chép khi ghi transition tại `services/order-actions.ts:75–83` và `services/order-cancellation.ts:32`; mapper trả snapshot nguyên trạng. Điều này trái với thông báo `/delete-account` rằng tham chiếu giao dịch được giữ dưới tên tài khoản đã xóa.
- Sửa: ẩn snapshot `actorName` theo `actorId` trong cùng transaction xóa; rà các bản sao tên khác theo chính sách giữ dữ liệu của sản phẩm.
- Kiểm chứng: đối chiếu đường ghi → xóa → DTO đọc; chưa chạy E2E xóa tài khoản.

### F02 — P2: Request hỗ trợ đang chạy có thể ghi nội dung sau khi xóa tài khoản

- Vị trí: [routes/support.ts:203](D:/remarket/apps/api/src/routes/support.ts:203), đoạn 203–214; nhánh trả lời cũng bị tại dòng 273–281.
- Request tạo ticket loại `ACCOUNT` đã qua auth có thể chạy transaction sau transaction xóa tài khoản. Nếu đợi khóa User, FK vẫn thành công sau khi xóa commit vì User được giữ làm tombstone. Request tiếp tục tạo ticket `OPEN` và message nguyên bản dù luồng xóa đã kiểm tra không còn ticket mở và đã scrub dữ liệu.
- Route hỗ trợ không khóa User hoặc kiểm tra mới `deletedAt` trong transaction. Việc auth đã hợp lệ trước đó không bảo vệ các write thực hiện sau khi tài khoản bị xóa. Reply vào ticket `RESOLVED` có thể mở lại ticket với nội dung mới theo cùng cách.
- Sửa: khóa User và kiểm tra mới `deletedAt` trước các khóa Order/SupportTicket. Vẫn cho phép user `LOCKED` chưa xóa sử dụng hỗ trợ, đúng chủ đích hiện tại.
- Kiểm chứng: phân tích thứ tự auth/transaction/khóa và FK; chưa tái hiện interleaving trên PostgreSQL.

### F03 — P2: Sự cố kiểm duyệt mới tái sử dụng ticket đã đóng

- Vị trí: [admin-moderation.ts:60](D:/remarket/apps/api/src/services/admin-moderation.ts:60), đoạn 60–70; nhánh khóa user tương tự tại dòng 168–178.
- Ticket hệ thống dùng code cố định `SYS-${order.code}-PRODUCT` hoặc `...-LOCK`, với `update: {}`. Sau khi xử lý/đóng sự cố đầu tiên, nếu đơn còn `SHIPPING`/`DELIVERED`, việc chặn lại sản phẩm, chặn món khác trong cùng đơn hoặc khóa lại tài khoản sẽ giữ ticket ở trạng thái cũ.
- Sự cố mới không tạo ticket đang mở. `hasOpenOrderTicket()` trả 0 và buyer có thể hoàn tất đơn mà sự cố mới chưa được xử lý; nhánh hoàn tất chỉ chặn theo ticket mở và reservation.
- Sửa: tạo ticket theo từng sự cố/product/version; nếu chọn mở lại thì phải tuân thủ quy tắc trạng thái, xóa kết luận/timestamps cũ và ghi nhận sự cố mới.
- Kiểm chứng: thực thi chính `blockProduct()` sau transpile với mock có ticket `CLOSED`: `productBlocked=true`, `ticketStatusAfterFreshBlock="CLOSED"`, `openBlockingTickets=0`. Không dùng DB thật.

### F04 — P2: Buyer mất nút hủy đơn gặp mặt đã xác nhận

- Vị trí: [entity-policy.ts:109](D:/remarket/apps/api/src/services/entity-policy.ts:109), đoạn 109–112.
- Nhánh `CONFIRMED` thêm `deliver` cho `MEETUP`, còn `cancel` nằm trong `else`. Vì cả web và mobile dựa vào `allowed_actions`, buyer không hủy được đơn gặp mặt đã xác nhận qua giao diện.
- Mutation service vẫn cho phép buyer hủy từ `CONFIRMED` tại `order-actions.ts:191–194`; bảng hành động `ui-spec.md:428` cũng yêu cầu cả hai hành động.
- Sửa: thêm `cancel` cho mọi đơn buyer ở `CONFIRMED`, rồi bổ sung `deliver` nếu là `MEETUP`.
- Kiểm chứng: chạy policy hiện tại với buyer ACTIVE, đơn CONFIRMED/MEETUP trả `["deliver","support","chat"]`.

### F05 — P2: Danh mục bị vô hiệu khiến đơn không xác nhận được nhưng vẫn giữ hàng

- Vị trí: [order-actions.ts:170](D:/remarket/apps/api/src/services/order-actions.ts:170), đoạn 170–176; [adminCategories.ts:284](D:/remarket/apps/api/src/routes/adminCategories.ts:284).
- Admin vô hiệu danh mục của một món trong đơn `PENDING`. Route category chỉ cập nhật danh mục; khi seller xác nhận đơn, service phát hiện category không hợp lệ rồi throw `PRODUCT_NOT_AVAILABLE`.
- Không có nhánh hủy/giải phóng reservation. Cả đơn, gồm các món thuộc danh mục còn hợp lệ, tiếp tục bị giữ đến khi user tự hủy hoặc worker xử lý timeout. `detail-project.md:149` yêu cầu đơn PENDING không còn category hợp lệ được hủy và giải phóng hàng.
- Sửa: xử lý cancellation bền vững cho đơn PENDING bị ảnh hưởng, giữ đúng thứ tự khóa và thông báo. Không hủy rồi throw trong cùng transaction vì sẽ rollback cancellation. Đơn đã CONFIRMED tiếp tục theo đặc tả.
- Kiểm chứng: đối chiếu route category → confirm → cancellation/worker; chưa chạy tình huống trên DB thật.

### F06 — P2: Mobile mở giỏ cũ ngay sau khi thêm món

- Vị trí: [products/[id].tsx:92](D:/remarket/apps/mobile/src/app/products/[id].tsx:92), đoạn 92–94.
- Mở giỏ, quay lại sản phẩm và thêm món khác trong 30 giây. `api.cart.add()` trả giỏ mới nhưng bị bỏ kết quả; không cập nhật/invalidate query `['cart', user.id]` trước khi điều hướng.
- Query mặc định còn fresh trong 30 giây (`session-context.tsx:22`), nên mở lại giỏ không tự fetch. API cart cũng không phát sự kiện realtime để cập nhật nó. Món vừa thêm không xuất hiện cho đến lần refetch tiếp theo.
- Sửa: `setQueryData` bằng CartView trả về hoặc invalidate/refetch giỏ trước điều hướng.
- Kiểm chứng: source và mô phỏng QueryObserver của thư viện đang cài; remount query còn fresh giữ `calls=1`, `isStale=false`. Chưa chạy trên điện thoại.

### F07 — P2: Mobile không nhận sự kiện đã đọc hội thoại

- Vị trí: [messages/[id].tsx:51](D:/remarket/apps/mobile/src/app/messages/[id].tsx:51), đoạn 51–56; socket được quản lý tại [session-context.tsx:77](D:/remarket/apps/mobile/src/services/session-context.tsx:77).
- Mobile tải chat qua REST và chỉ nghe socket chung. Toàn bộ mobile không emit `conversation:join`, trong khi server chỉ phát `conversation:read` vào room `conversation:<id>` (`realtime/server.ts:238–240`).
- Người gửi đang mở chat không nhận event khi đối phương đọc; `read_at`/nhãn “Đã đọc” chỉ đổi khi có sự kiện khác gây invalidate hoặc app resume. Nhận tin mới qua room user vẫn hoạt động nên lỗi dễ bị bỏ qua.
- Sửa: join/leave room theo hội thoại đang mở, đồng thời join lại sau reconnect hoặc đổi access token.
- Kiểm chứng: kiểm tra toàn bộ call site mobile và routing event phía server; chưa chạy hai thiết bị.

### F08 — P2: Tin nhắn sai validation khóa ô soạn trên mobile

- Vị trí: [messages/[id].tsx:185](D:/remarket/apps/mobile/src/app/messages/[id].tsx:185), đoạn 185–194; hàm gửi tại dòng 94–100.
- Dán hơn 2.000 ký tự rồi gửi. Composer không dùng shared validator hoặc giới hạn độ dài; server từ chối. Hàm gửi đã đặt `failed`, chỉ xóa biến này khi request thành công.
- Nhánh `failed` thay ô nhập bằng nút “Thử gửi lại” với payload cũ. Người dùng không sửa/bỏ nội dung được và mọi lần retry tiếp tục lỗi; phải rời màn hình để gửi tin khác.
- Sửa: giữ khả năng sửa/bỏ bản nháp khi validation bị từ chối; chỉ tái sử dụng payload/client ID cho lỗi có thể retry. Dùng validator dùng chung trước request.
- Kiểm chứng: đối chiếu state/render và giới hạn server `chat-service.ts:52–54`; chưa chạy native UI.

### F09 — P2: Batch outbox chậm hết lease trước khi gửi, gây gửi trùng

- Vị trí: [outbox.ts:82](D:/remarket/apps/api/src/outbox/outbox.ts:82), đoạn 82–88; lease 5 phút tại dòng 43.
- Worker claim tối đa 50 row cùng lúc nhưng publish tuần tự. Chỉ 6 email mất 55 giây/email đã vượt lease 5 phút; timeout email hiện cho phép tới 60 giây. Khi có worker khác, các row còn chờ bị claim lại.
- Worker đầu vẫn publish những row đó mà không gia hạn/recheck ownership. Điều kiện `lockId` chỉ được kiểm tra khi ghi processed, sau side effect, nên không ngăn email đã gửi trùng.
- Sửa: claim theo từng công việc hoặc gia hạn/reclaim lease trước publish; cân đối batch với thời gian xử lý và giữ cơ chế retry an toàn.
- Kiểm chứng: [reproduce-outbox.cjs](D:/remarket/.artifacts/project-review-2026-10-15/reproduce-outbox.cjs) transpile source hiện tại và chạy hai worker mock với đồng hồ giả. **12 event dẫn tới 19 lượt publish**, 7 event gửi hai lần. Không kết nối SMTP, mạng hoặc DB; đây là mô phỏng thuật toán lease.

## Kết quả kiểm tra

Các lệnh pnpm được chạy với `--config.verify-deps-before-run=false` để dùng dependencies đã cài mà không kích hoạt auto-install/purge. Sandbox ban đầu không đọc được một số pnpm dependency; các checks thực tế hoàn tất khi chạy ngoài sandbox.

| Kiểm tra | Kết quả |
|---|---|
| Typecheck toàn workspace | PASS: shared, API client, API source/tests, web/config, mobile |
| Lint toàn workspace | PASS |
| API response contracts `--check` | PASS |
| Shared tests | 20 PASS |
| API client tests | 14 PASS |
| API unit/contract tests | 196 PASS; 35 PostgreSQL integration SKIPPED |
| Mobile tests | 4 PASS |
| Web tests chạy lại tuần tự | 211 PASS |
| Tổng test đã pass | **445** |
| Build toàn workspace | PASS: API, web, Expo export Android/iOS, shared/client |
| Mô phỏng outbox | Tái hiện gửi trùng; assertion PASS |

Lượt test web đầu tiên khi các checks chạy đồng thời có 3 timeout ở điều hướng tài khoản. Chạy lại với `--maxWorkers=1 --no-file-parallelism` pass 211/211. Đây là dấu hiệu test nhạy timing/tải máy; chưa có bằng chứng lỗi route sản phẩm. JSON kết quả lần chạy lại nằm tại [web-tests.json](D:/remarket/.artifacts/project-review-2026-10-15/web-tests.json).

Build web cảnh báo entry chunk 536,56 kB minified (156,92 kB gzip). Đây là mục có thể tối ưu sau khi sửa lỗi chức năng; chưa có benchmark mới để kết luận ảnh hưởng latency cụ thể.

## Giới hạn và thứ tự xử lý

Không chạy PostgreSQL integration, browser E2E, Expo trên thiết bị, native APK/IPA, SMTP thật, Supabase Storage thật hoặc push FCM/APNs. Expo export thành công xác nhận bundle JS/Hermes, chưa xác nhận native binary. Không dùng database chia sẻ làm môi trường review và không thay đổi các chỉnh sửa đang có của người dùng.

Ưu tiên sửa F01–F03 trước vì ảnh hưởng quyền riêng tư và việc xử lý sự cố giao dịch; tiếp theo F04–F05 và F06–F08. Sửa F09 trước khi vận hành nhiều worker hoặc xử lý hàng đợi email chậm. Bổ sung regression tests cho đúng các tình huống đã nêu, đặc biệt interleaving xóa tài khoản/hỗ trợ và lifecycle ticket kiểm duyệt. Mobile hiện chỉ có 4 test logic và chưa bao phủ UI/cache/socket của F06–F08.
