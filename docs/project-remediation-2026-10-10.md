# Cập nhật sau review — 10/10/2026

Phạm vi: các lỗi F01–F08, duplicate, cấu trúc, query, retention, contract, kiểm thử và UX trong [báo cáo review](project-review-2026-10-10.md). Thay đổi nằm trong workspace; chưa commit, push hoặc triển khai vào database ứng dụng.

## Lỗi đã sửa

| Mục | Thay đổi | Regression |
|---|---|---|
| F01 | SMTP có deadline từ lúc tạo socket, cả TCP/TLS/STARTTLS; cleanup reader/socket ở mọi nhánh. Idle/handshake 15 giây, toàn lần gửi 60 giây. Worker email dùng background pool. | Fake sockets không phát connect/secureConnect, cả STARTTLS upgrade. |
| F02 | Chỉ reset page khi filter thực sự thay đổi; selection và drawer giữ page. | Hook URL và trang AdminProducts ở page 3. |
| F03 | Modal stack dùng chung; chỉ panel trên cùng xử lý Tab/Escape; scroll lock và focus restoration theo stack. | Drawer + ConfirmDialog, đóng lớp dưới trước lớp trên. |
| F04 | Reminder loại đơn đã có dedupe key bằng NOT EXISTS; sắp confirmedAt/id, dùng index userId/dedupeKey. Notification/outbox của cả batch được ghi trong một transaction. | 51 đơn được xử lý qua các vòng 50/1/0, mỗi notification mới có một event. Regression cuối chạy khoảng 13 giây trên DB remote. |
| F05 | Relay dùng sequence do worker cấp dưới advisory transaction lock giữ đến commit; bootstrap trước server listen. | PostgreSQL ép worker A dừng trước commit, B chờ; relay thật nhận cả A/B theo thứ tự. |
| F06 | Moderation khóa User → Order → Product; order action khóa Product theo ID trước Category. Recheck sau khóa. | Buyer cancel giữ Order trong khi blockProduct chờ; cả hai hoàn tất. |
| F07 | Mọi producer dùng notification service tạo DB row và outbox trong cùng transaction; batch chỉ phát event cho rows mới. Bỏ event trùng ở review và yêu cầu xác minh email. | Unit rollback/dedupe; integration reminder; browser luồng thực. |
| F08 | Một RateQuota có cleanup trước mọi nhánh; REST/socket chat dùng cùng quota 30/phút. Upload/resend/global limiter dùng cùng implementation với policy riêng. | 10.002 user đã hết hạn được dọn; gọi chính REST middleware và Socket.IO guard để kiểm tra tổng quota. |

## Gom duplicate và chia trách nhiệm

- `category-policy`: policy thuần và batch loader ancestor/leaf, tùy chọn khóa ổn định; dùng ở checkout, confirm, cart, reservations, listing và moderation.
- `order-cancellation` + `reservations`: chung update/version, history, notification/outbox và giải phóng reservation cho user, admin, moderation, expiry worker. Hủy sau giao nhận không tự đưa listing về ACTIVE.
- `order-actions`, `checkout-service`/`checkout-input`, `auth-cookies`, `email-tokens`, `product-input`/`product-assets`: tách orchestration/validation/credential/storage khỏi HTTP route.
- `entity-policy`: tách capabilities/allowed actions khỏi DTO mapping; các re-export cũ giữ compatibility.
- Chat dùng một participant guard. ProductForm dùng shared validators/limits, kiểm tra usage months là số nguyên. Money và phí ship dùng phép toán shared.
- PasswordInput và useDismiss gom UI lặp. Admin cache patch/invalidation dùng helper chung. OrderDetail tách nội dung/giao nhận/dialog; ProductDetail tách gallery; modal hooks trả handler theo intent.
- Bỏ helper không có consumer và dependency `express-rate-limit`; API lint chạy ESLint thật, gồm src/tests/scripts.

## Query, contract, retention và UX

Checkout kiểm tra category theo batch thay cho query từng item/ancestor. Account products bỏ lớp optionalAuth dư. Checkout web lấy phương thức/phí ship từ cart, không fetch detail từng sản phẩm. Cart giới hạn 50 rows/response và tối đa 50 additions; kiểm tra quota dưới User lock. Giỏ cũ vượt giới hạn vẫn giữ dữ liệu, UI giải thích cách xem các món còn lại. Test đồng thời tại giới hạn kiểm tra chỉ một addition thắng và validate response API thực.

Admin audit filter dùng relation `some` có index thay cho đọc tất cả entity IDs vào IN-list. Audit giữ entityId/metadata kể cả khi target bị xóa; nullable FK chỉ phục vụ query và được backfill cho target còn tồn tại.

OpenAPI được dùng để generate response validators shared; transport kiểm tra required fields, kiểu, enum, nullable, cấu trúc và bounds trước khi đưa success response vào cache. Validator cho phép additive fields để hỗ trợ rollout; không kiểm tra format URI/date hoặc additionalProperties. CI kiểm tra generated file không stale. Resend retry_after là số; PRICE_CHANGED dùng đúng fields items.price/sellers. Cart DTO/OpenAPI bổ sung delivery_method/shipping_fee; Postman được regenerate. Fixtures trả success cũng được sửa theo contract thực.

Retention chạy theo batch 500: xóa AuthToken/Session đã hết hạn hơn 7 ngày; session có token còn trong khoảng giữ lại được bảo vệ. Outbox processed hơn 30 ngày được xóa payload sau khi lưu permanent dedupe tombstone. Pending/dead-letter, audit, CheckoutRequest và notification không bị xóa. Tombstone là chủ đích để retry cũ không tạo lại side effect; chưa giới hạn thời gian replay của CheckoutRequest.

ProductForm edit dùng query lifecycle, chỉ hydrate một lần theo ID để giữ draft khi refetch. ImageUpload dùng toast, xóa tin dùng ConfirmDialog, clipboard failure có phản hồi. CI có Chrome smoke với database schema cô lập và artifact khi thất bại.

## Kiểm chứng và query plan

- Typecheck, ESLint, production build và contracts:check đã chạy thành công. Shared: 20 tests; API unit/contract: 159 tests; frontend: 203 tests, đều pass. API typecheck/lint/build được chạy lại sau thay đổi batch reminder cuối.
- Integration full run có 27/28 tests pass; test 51 reminders vượt timeout 120 giây trên DB remote. Sau khi gom batch vào một transaction, chạy lại toàn bộ 5 reliability regressions: 5/5 pass, gồm reminder, thứ tự khóa moderation/cancel, thứ tự commit relay, retention/dedupe và cart concurrent limit. Như vậy cả 28 integration cases đã có kết quả pass qua full run và targeted rerun; chưa chạy lại toàn bộ suite trong một lượt sau thay đổi cuối.
- Browser smoke: 50 kiểm tra màn hình responsive và luồng thực pass, không có uncaught JavaScript exception hoặc HTTP 5xx. Bao gồm upload/duyệt tin, favorites/cart, checkout/giao hàng/hoàn tất/review, ảnh snapshot sau khi tin bị ẩn, admin drawer, quyền user bị khóa, chat hai session và read receipt.
- Log kiểm chứng ở `.artifacts/project-review/`; integration/browser chỉ dùng schema `remarket_verify_<UUID>` mới tạo, kiểm tra ownership/search_path trước khi migrate và tự dọn schema/uploads/profile. Không reset/seed database ứng dụng.
- EXPLAIN ANALYZE trên 20.000 events giả lập: relay dùng `OutboxEvent_relaySequence_key`, đọc 100 rows ~0,111 ms. Retention 500 rows dùng index processedAt/nextAttemptAt và incremental sort ~0,834 ms. Candidate index processedAt/id ~0,711 ms, chưa có bằng chứng đủ để thêm một index retention nữa. Đây là thời gian server của fixture, không phải benchmark production hoặc latency toàn HTTP.
- Lỗi “missing node/picomatch/fast-deep-equal” lúc review được xác định là EPERM khi sandbox đọc pnpm hardlinks. Cùng dependencies chạy được ngoài sandbox; không nâng Prisma major để xử lý lỗi này.

## Triển khai

Ba migration mới trong `apps/api/prisma/migrations`:

1. `20261010090000_reliable_relay_and_redundant_indexes`: sequence relay, backfill processed rows, unique index; bỏ ba index thường trùng unique constraint.
2. `20261010100000_outbox_retention_keys`: tombstone dedupe và backfill.
3. `20261010110000_moderation_audit_relations`: nullable audit target relations, backfill/index.

Triển khai đồng bộ API/worker: dừng bản cũ, chạy `pnpm --filter @remarket/api prisma:deploy`, generate client/build bản mới rồi khởi động API/worker. Không chạy worker cũ cạnh worker mới: worker cũ không cấp relaySequence và không kiểm tra tombstone. Migration mới chỉ được áp trên schema test trong lượt này.

Harness dùng tùy chọn [Prisma advisory locking](https://docs.prisma.io/docs/orm/v6/reference/environment-variables-reference) riêng cho child migration sau khi xác minh schema mới thuộc một owner; deployment bình thường giữ lock. Không đưa tùy chọn này vào env production.

Quota hiện là process-local. Nếu triển khai nhiều API replicas, cần shared quota store để giới hạn theo user trên toàn cụm. Backend đã chia HTTP/background pool có chủ đích; các lớp image/adapter và giao diện hook được giữ lại vì có trách nhiệm riêng.
