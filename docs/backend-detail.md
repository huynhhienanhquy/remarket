# ReMarket - Backend implementation detail

Phiên bản: 1.0  
Cập nhật: 05/10/2026  
Phạm vi: Backend REST API, worker, realtime, database và tích hợp với frontend hiện tại.

## 1. Mục tiêu và nguồn dữ liệu chuẩn

Backend phải phục vụ đầy đủ các luồng trong `detail-project.md` và trả đúng DTO mà frontend đang khai báo tại:

- `packages/shared/src/dto.ts`
- `packages/shared/src/enums.ts`
- `apps/web/src/lib/api/contract.ts`
- `apps/web/src/lib/api/httpAdapter.ts`
- Các rule đã được mô phỏng trong `apps/web/src/mocks/adapter-*.ts`

Thứ tự ưu tiên khi có khác biệt:

1. Quyền, bảo mật, transaction và vòng đời nghiệp vụ: `detail-project.md`.
2. Shape dữ liệu frontend cần: DTO trong `packages/shared`.
3. URL/phương thức mà frontend live adapter đang gọi: `httpAdapter.ts`.
4. Hành vi UI đang demo: mock adapter.

Không trả trực tiếp Prisma model. Mọi response phải đi qua mapper theo context để tránh lộ `passwordHash`, token, PII hoặc field nội bộ.

## 2. Hiện trạng và quyết định tích hợp

`apps/api` hiện là scaffold, chưa phải backend có thể dùng production. Các nhóm sai lệch chính:

- Prisma schema và route đang tham chiếu nhiều field không tồn tại như `User.name`, `provinceLabel`, `rating`, `completedSalesCount`, `Order.counterparty` và `Product.imageUrl`.
- Auth trả sai contract: login đang trả user thay vì `{ access_token }`; chưa có refresh rotation; verify/reset đang là logic demo.
- Một số URL không khớp frontend: category tree, province, own product, cart, chat, support, review và order action.
- Checkout chưa chạy trong một transaction, chưa giữ hàng bằng conditional update, chưa lưu payload hash và không replay kết quả idempotent.
- Product chưa có `deletedAt`/`reservedOrderId`, route delete đang hard delete.
- DTO dùng cả camelCase và snake_case; list metadata lúc nằm ở envelope, lúc nằm trong `data`.
- Upload endpoint đang đọc JSON trong khi frontend gửi `multipart/form-data`.
- Chưa có worker hết hạn đơn, outbox, Socket.IO, OpenAPI, seed và integration test.

Quyết định cho phase tích hợp đầu tiên:

- Giữ `/api/v1` làm prefix.
- Backend phục vụ đúng URL của frontend adapter hiện tại; các URL trong đặc tả khác adapter chỉ được thêm dưới dạng alias nếu thật sự cần.
- Với list, trả `data: { items, meta }` vì đây là shape `ApiAdapter` đang sử dụng.
- `Idempotency-Key` là HTTP header chuẩn. Trong giai đoạn chuyển tiếp có thể đọc thêm query `idempotency_key`, nhưng frontend phải được đổi sang header trước khi release.
- Tất cả key DTO gửi cho frontend dùng `snake_case`; Prisma model dùng `camelCase` nội bộ.

## 3. Kiến trúc backend

```text
HTTP / Socket.IO
       |
middleware: request-id -> security -> CORS -> parser -> rate limit -> auth
       |
controller/router (HTTP only, no business transaction)
       |
service (authorization, state machine, transaction, outbox)
       |
repository/query + mapper
       |
Prisma -> PostgreSQL

worker -> outbox / expired orders / reminders / orphan uploads
storage service -> Supabase Storage signed URLs
mail service -> verification/reset/support notifications
```

Nguyên tắc:

- Router chỉ parse input, gọi service và tạo HTTP response.
- Service là nơi duy nhất được chuyển trạng thái product/order/ticket/report.
- Query đọc và mapper có thể dùng lại giữa REST và Socket.IO.
- Transaction chỉ chứa thao tác database; không gửi email, gọi storage hoặc emit socket bên trong transaction.
- Email, notification và socket được kích hoạt từ outbox sau khi transaction commit.

### 3.1. Cấu trúc thư mục đề xuất

```text
apps/api/src/
  app.ts                    # tạo Express app, không listen
  index.ts                  # bootstrap HTTP + Socket.IO + graceful shutdown
  config/
    env.ts                  # Zod parse env, fail-fast
    constants.ts
  middleware/
    request-id.ts
    auth.ts
    origin-csrf.ts
    rate-limit.ts
    error-handler.ts
  modules/
    auth/
    users/
    categories/
    products/
    uploads/
    favorites/
    cart/
    checkout/
    orders/
    chat/
    reviews/
    reports/
    notifications/
    support/
    admin/
  services/
    storage.service.ts
    mail.service.ts
    outbox.service.ts
  realtime/
    socket.ts
    authorization.ts
  workers/
    runner.ts
    expire-orders.job.ts
    order-reminder.job.ts
    outbox.job.ts
    orphan-upload.job.ts
  shared/
    api-response.ts
    pagination.ts
    money.ts
    dto-mappers.ts
    errors.ts
```

Mỗi module nên có `*.schema.ts`, `*.service.ts`, `*.repository.ts`, `*.mapper.ts`, `*.router.ts` và test tương ứng. Không bắt buộc tạo repository wrapper cho một query đơn giản; mục tiêu là không trộn transaction nghiệp vụ vào router.

## 4. Request lifecycle và response envelope

Mỗi request:

1. Sinh hoặc nhận `X-Request-Id`; chỉ chấp nhận giá trị hợp lệ, nếu không sinh UUID mới.
2. Áp dụng Helmet, CORS allowlist, giới hạn body JSON 64 KB.
3. Áp dụng rate limit theo endpoint và identity phù hợp.
4. Parse/validate query, params, body bằng Zod với `.strict()`.
5. Xác thực access JWT nếu endpoint cần hoặc có optional auth.
6. Tải session và user từ DB; không dùng `role`/`status` trong JWT làm nguồn quyền cuối cùng.
7. Gọi service và mapper.
8. Trả envelope thống nhất.

Success:

```json
{
  "success": true,
  "data": {},
  "meta": { "request_id": "uuid" }
}
```

List dùng shape tương thích frontend:

```json
{
  "success": true,
  "data": {
    "items": [],
    "meta": { "page": 1, "page_size": 20, "total": 0, "total_pages": 0 }
  },
  "meta": { "request_id": "uuid" }
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dữ liệu chưa hợp lệ.",
    "details": { "fields": { "title": "Tiêu đề cần ít nhất 5 ký tự." } }
  },
  "meta": { "request_id": "uuid" }
}
```

Không trả stack trace, Prisma error, SQL, secret, token hoặc thông tin nhận diện không cần thiết.

## 5. Authentication và session

### 5.1. Access token

- JWT sống 15 phút.
- Claim tối thiểu: `sub`, `session_id`, `iat`, `exp`, `iss`, `aud`.
- Chỉ chấp nhận thuật toán cấu hình, issuer và audience chính xác.
- Không nhúng PII vào token.
- Mỗi request protected kiểm tra session chưa revoked/hết hạn và trạng thái user hiện tại.

### 5.2. Refresh token

- Chuỗi random tối thiểu 256 bit, không phải JWT.
- Cookie HttpOnly; `Secure` ở staging/production; `SameSite=Lax` khi web/API cùng site.
- DB chỉ lưu SHA-256 hash của token.
- Mỗi refresh chạy transaction: khóa token/session, đánh dấu token cũ đã dùng, tạo token mới.
- Reuse token cũ còn hạn thu hồi toàn bộ session.
- Cookie endpoint kiểm tra `Origin` trong allowlist. Nếu triển khai cross-site, bổ sung CSRF token thay vì chỉ dựa vào SameSite.

### 5.3. Email token và password

- VERIFY_EMAIL sống 24 giờ; RESET_PASSWORD sống 15 phút.
- Token một lần, DB chỉ lưu hash.
- Resend verification vô hiệu token cũ cùng purpose.
- Password 12 ký tự trở lên và tối đa 72 byte UTF-8 trước bcrypt.
- Reset password thu hồi mọi session; không tự xác minh email.
- Forgot password luôn trả cùng response dù email tồn tại hay không.

### 5.4. Endpoint auth theo frontend

| Method | Path | Kết quả chính |
|---|---|---|
| POST | `/auth/register` | `{ pending_verification: true, email }` |
| POST | `/auth/login` | `{ access_token }`, đồng thời set refresh cookie |
| POST | `/auth/refresh` | rotate cookie, trả `{ access_token }` |
| GET | `/auth/me` | `SessionUser` |
| POST | `/auth/logout` | revoke session hiện tại, clear cookie |
| POST | `/auth/logout-all` | revoke mọi session, clear cookie |
| POST | `/auth/verify-email` | `{ access_token }` để frontend tải lại `/auth/me` |
| POST | `/auth/resend-verification` | `{ retry_after? }` |
| POST | `/auth/forgot-password` | `{ accepted: true }` |
| POST | `/auth/reset-password` | `{ accepted: true }` |
| PATCH | `/auth/profile` | `SessionUser` |
| PATCH | `/auth/avatar` | `SessionUser` |

Frontend hiện gửi `storage_path` ở avatar; backend không được nhận URL tùy ý làm avatar. Service phải kiểm tra upload thuộc user, đúng purpose và đã hoàn tất.

## 6. Authorization matrix

| Resource | Read | Mutate |
|---|---|---|
| Public product/profile | Guest; chỉ dữ liệu public | Không |
| Own profile/product | Chính chủ | Chính chủ, theo trạng thái |
| Favorite/cart | Chính chủ | Chính chủ ACTIVE; thêm/mua cần verified |
| Order | Buyer, seller; admin chỉ trong luồng quản trị/hỗ trợ | Theo role và state machine |
| Conversation/message | Đúng hai participant | Participant ACTIVE |
| Review | Public nếu chưa ẩn | Buyer của order đủ điều kiện |
| Report | Reporter xem report của mình; admin xử lý | Reporter tạo; admin resolve/reject |
| Support ticket | Chủ ticket và admin | Theo status/allowed action |
| Admin resource | Admin ACTIVE | Admin ACTIVE, mọi hành động nhạy cảm có audit |

Tài khoản `LOCKED` vẫn được đăng nhập vào chế độ hạn chế để xem order, notification, support, gửi support và logout. Vì vậy auth middleware không được trả 401 cho mọi user LOCKED; route policy quyết định quyền cụ thể.

## 7. Database model và constraint

Schema đích gồm 22 bảng trong `detail-project.md`: `users`, `auth_sessions`, `auth_tokens`, `categories`, `products`, `product_images`, `favorites`, `carts`, `cart_items`, `conversations`, `messages`, `checkout_requests`, `orders`, `order_items`, `order_status_history`, `reviews`, `reports`, `notifications`, `support_tickets`, `support_messages`, `audit_logs`, `outbox_events`.

### 7.1. Các sửa đổi bắt buộc so với schema hiện tại

- Thay `Session.token` bằng `auth_sessions` + `auth_tokens`; không lưu access JWT/refresh plaintext.
- `users` có `createdAt`, `updatedAt`; không lưu các field tổng hợp `rating`, `reviewCount`, `completedSalesCount`.
- Rating/review count/completed sales được aggregate từ `reviews` và `orders`.
- `categories.slug` unique toàn cục; category tối đa hai cấp được kiểm tra trong service.
- `products` thêm `reservedOrderId`, `deletedAt`, `reviewedBy`, `reviewedAt`; bỏ các timestamp order không thuộc product.
- `product_images` lưu `storagePath`; signed URL chỉ được tạo khi map DTO.
- Dùng bảng `carts` và unique `cart_items(cartId, productId)`; quantity cố định 1.
- Unique message là `(conversationId, senderId, clientMessageId)`, không unique toàn cục `clientMessageId`.
- `checkout_requests` lưu `buyerId`, `idempotencyKey`, `requestHash`; quan hệ order thay cho mảng UUID.
- `orders` chứa trực tiếp snapshot giao nhận theo đặc tả hoặc một bảng delivery 1-1, nhưng API mapper phải giữ cùng DTO. Chọn một cách duy nhất; đề xuất lưu trực tiếp trong `orders` để transaction gọn hơn.
- `order_status_history` lưu `actorId` và `actorType`, không chỉ `actorName`; tên hiển thị được snapshot hoặc join an toàn.
- `reviews` thêm `hiddenBy`; không cần `productId` vì order items đã giữ quan hệ nguồn.
- `reports` dùng hai FK nullable riêng và CHECK đúng một target; không dùng `targetType/targetId/targetLabel` làm dữ liệu chính.
- Notification unique `(userId, dedupeKey)`, không unique dedupe key toàn hệ thống.
- Thêm `outbox_events` phục vụ notification/email/socket bền vững.

### 7.2. Constraint SQL ngoài Prisma

- Money không âm; product price `> 0` và `<= 1_000_000_000`; shipping fee `<= 10_000_000`.
- `orders.totalAmount = subtotal + shippingFee`, currency luôn `VND`.
- `products.status = RESERVED` khi và chỉ khi `reservedOrderId IS NOT NULL`.
- `rating BETWEEN 1 AND 5`, `usageMonths >= 0`, `version > 0`, `sortOrder BETWEEN 0 AND 7`.
- `buyerId <> sellerId`, `reviewerId <> reviewedUserId`.
- Partial unique report PENDING theo reporter + target.
- Partial/index phục vụ expired order, outbox claim, unread notification và các list phổ biến.

Mọi migration phải versioned. Không sửa migration đã chạy ở production; khi dự án chưa có DB dùng được, tạo một baseline mới rõ ràng trước khi chia sẻ môi trường.

## 8. DTO mapper

Mapper là lớp bắt buộc. Các mapper chính:

- `toSessionUser(user)`
- `toSellerSummary(user, aggregates)`
- `toProductListItem(product, viewerContext)`
- `toProductDetail(product, viewerContext)`
- `toOwnProduct(product)`
- `toCartView(cart)`
- `toOrderListItem(order, viewerId)`
- `toOrderDetail(order, viewerId, ticket/review/conversation context)`
- `toConversationListItem(conversation, viewerId)`
- `toSupportTicketDetail(ticket, viewer)`
- `toAdmin*Item(...)`

Quy tắc chung:

- Decimal/BigInt tiền luôn `.toString()`.
- Date luôn ISO 8601.
- Không spread Prisma model vào response.
- `SellerSummary.name` lấy từ `User.fullName`.
- `province_label` lấy từ shared province dataset hoặc bảng geography đã versioned.
- `image_url` là signed URL ngắn hạn từ `storagePath`; không nối URL thủ công.
- Favorite/cart riêng vẫn có thể trả placeholder cho product đã block/delete; không lộ title, price và ảnh của nội dung bị ẩn.

## 9. Product, category, favorite và cart

### 9.1. Public visibility

Một product có thể xuất hiện ở search khi:

- `status = ACTIVE`
- `deletedAt IS NULL`
- `isBlocked = false`
- seller `ACTIVE` và đã verify email
- category là leaf ACTIVE và mọi ancestor ACTIVE

Detail public có thể hiển thị `RESERVED`/`SOLD`; product bị block/delete hoặc chưa duyệt trả 404 cho người không phải owner/admin.

### 9.2. Search

- `q` tối đa 100 ký tự; tìm title, description và category name, không phân biệt hoa thường.
- Chọn category cha bao gồm category con.
- Filter `COD` hoặc `MEETUP` phải bao gồm product `BOTH`; filter `BOTH` chỉ trả `BOTH`.
- Validate `min_price <= max_price`.
- Sort ổn định:
  - newest: `publishedAt DESC, id DESC`
  - price asc: `price ASC, id ASC`
  - price desc: `price DESC, id ASC`
- Page mặc định 20, tối đa 100.

### 9.3. Product state machine

| Action | From | To | Ghi chú |
|---|---|---|---|
| create | - | PENDING | 1-8 ảnh, leaf category |
| edit | ACTIVE | PENDING | tăng version; giữ `publishedAt` lần đầu |
| edit | PENDING/REJECTED/INACTIVE | giữ nguyên | tăng version |
| submit | REJECTED/INACTIVE | PENDING | clear rejection reason |
| hide | PENDING/REJECTED/ACTIVE | INACTIVE | không cho RESERVED/SOLD |
| soft delete | PENDING/REJECTED/ACTIVE/INACTIVE | INACTIVE | set `deletedAt` |
| approve | PENDING | ACTIVE | admin, đúng expected version |
| reject | PENDING | REJECTED | admin, reason bắt buộc |
| reserve | ACTIVE | RESERVED | chỉ checkout service |
| complete order | RESERVED | SOLD | chỉ order service |

`allowed_actions` và `capabilities` được tính từ cùng policy dùng trong service, nhưng service vẫn kiểm tra lại quyền khi mutation.

### 9.4. API theo frontend

| Method | Path |
|---|---|
| GET | `/categories` |
| GET | `/provinces` |
| GET | `/products` |
| GET | `/products/:id` |
| GET | `/account/products` |
| POST | `/products` |
| PATCH | `/products/:id` |
| POST | `/products/:id/submit` |
| POST | `/products/:id/hide` |
| DELETE | `/products/:id` |
| GET | `/favorites` |
| PUT | `/favorites/:productId` |
| DELETE | `/favorites/:productId` |
| GET | `/cart` |
| POST | `/cart/items` |
| DELETE | `/cart/items/:productId` |

Cart add/remove trả lại `CartView` để frontend cập nhật cache ngay. Add idempotent và không tăng quantity.

## 10. Checkout transaction

`POST /checkout` nhận body `CheckoutPayload` và `Idempotency-Key` header.

### 10.1. Chuẩn hóa payload

- Sort items theo `product_id`; cấm trùng product.
- Sort deliveries theo `seller_id`; mỗi seller đúng một delivery.
- Trim text nhưng không thay đổi semantic data.
- Hash JSON canonical bằng SHA-256.

### 10.2. Transaction ở isolation Serializable

1. Tìm/create `checkout_request` bằng `(buyerId, idempotencyKey)`.
2. Nếu đã `SUCCEEDED` và hash giống nhau, trả lại đúng nhóm order cũ.
3. Nếu key cũ nhưng hash khác, trả `IDEMPOTENCY_CONFLICT`.
4. Tải buyer và toàn bộ product theo thứ tự UUID ổn định.
5. Kiểm tra đủ product, không trùng, không tự mua, public purchasable, seller/category hợp lệ.
6. So `expected_price`; gom toàn bộ thay đổi và trả `PRICE_CHANGED` trước khi tạo order.
7. Suy ra seller từ product và kiểm tra deliveries khớp chính xác tập seller.
8. Kiểm tra delivery method; COD/BOTH tính phí bằng `max(product.shippingFee)`, MEETUP bằng 0.
9. So `expected_shipping_fee` theo từng seller.
10. Tạo một order PENDING/seller cùng order item snapshot và history.
11. Reserve từng product bằng `updateMany` có điều kiện `id`, `status=ACTIVE`, `version`, `reservedOrderId=null`, `deletedAt=null`, `isBlocked=false`; count phải bằng 1.
12. Gán `status=RESERVED`, `reservedOrderId=order.id`, tăng version.
13. Xóa đúng cart item của buyer.
14. Tạo outbox event `ORDER_CREATED` cho từng seller.
15. Mark checkout request `SUCCEEDED` và commit.

Nếu bất kỳ bước nào lỗi, rollback toàn bộ seller. Với conflict serialization/unique race, retry transaction giới hạn; nếu chưa xác định kết quả trả `RETRY_LATER` và client dùng lại cùng key.

Không dùng giá client để tính tiền. Snapshot lấy từ DB tại thời điểm transaction.

## 11. Order service

Frontend gọi:

- `GET /orders?role=buyer|seller&status=&page=`
- `GET /orders/:id`
- `POST /orders/:id/actions` với `{ action, expected_version, ... }`

Backend có thể triển khai service riêng cho từng action, router action chỉ dispatch từ allowlist.

### 11.1. Transition

| Action | Actor | From -> To | Điều kiện bổ sung |
|---|---|---|---|
| confirm | seller | PENDING -> CONFIRMED | trước expiresAt; reservation còn đúng |
| cancel | buyer/seller | PENDING/CONFIRMED -> CANCELLED | reason bắt buộc |
| ship | seller | CONFIRMED -> SHIPPING | chỉ COD |
| deliver | buyer | SHIPPING -> DELIVERED | COD; buyer xác nhận đã nhận |
| deliver | buyer | CONFIRMED -> DELIVERED | chỉ MEETUP |
| deliver | seller | SHIPPING -> DELIVERED | chỉ khi có xác nhận buyer theo contract |
| complete | buyer | DELIVERED -> COMPLETED | nhận + trả tiền; không có ticket mở |

Mỗi transition là một transaction:

- Conditional update order theo `id + expectedVersion + currentStatus`.
- Update timestamp/version.
- Update product khi cancel/complete.
- Insert status history.
- Insert outbox event.

Cancel chỉ release product có `reservedOrderId = order.id`. Product về ACTIVE nếu seller/category/product còn đủ điều kiện, ngược lại INACTIVE. Cancel sau giao chỉ qua admin support và luôn đưa product về INACTIVE.

### 11.2. Order detail

`OrderDetail` phải trả:

- Snapshot item, không đọc lại title/price hiện tại của product.
- Counterparty summary theo viewer role.
- Delivery/PII chỉ cho participant hoặc admin support có quyền.
- `allowed_actions` tính theo role/status/account/ticket/expiry.
- `completion_block_reason` là message an toàn.
- Review state và existing review.
- Conversation id nếu conversation của một item + đúng buyer/seller tồn tại.

## 12. Worker và outbox

### 12.1. Expire pending orders

Chạy ít nhất mỗi phút:

- Claim order `PENDING` có `expiresAt <= now` theo batch.
- Conditional update để chỉ một worker thắng.
- Chuyển CANCELLED với reason `SELLER_TIMEOUT`.
- Release reservation đúng order.
- Ghi history + outbox cùng transaction.

Seller confirm luôn kiểm tra `expiresAt` trực tiếp; không phụ thuộc worker chạy đúng lúc.

### 12.2. Outbox processing

- Claim bằng `FOR UPDATE SKIP LOCKED` hoặc cơ chế lease tương đương.
- Mỗi handler idempotent theo `dedupeKey`.
- Retry exponential backoff, tối đa 10 lần tự động.
- Socket/email lỗi không rollback nghiệp vụ đã commit.
- Sau ngưỡng retry, giữ row và cảnh báo vận hành.

### 12.3. Job khác

- Nhắc order CONFIRMED quá 72 giờ, mỗi order chỉ một notification.
- Dọn upload chưa gắn sau 24 giờ.
- Heartbeat worker và metric số order hết hạn chưa xử lý.

## 13. Chat và realtime

REST theo frontend:

| Method | Path |
|---|---|
| GET | `/conversations` |
| POST | `/conversations` |
| GET | `/conversations/:id/messages` |
| POST | `/conversations/:id/messages` |
| POST | `/conversations/:id/read` |

Quy tắc:

- Chỉ tạo conversation trên product ACTIVE, seller suy ra từ product, cấm self-chat.
- Unique `(productId, buyerId, sellerId)`.
- Message 1-2.000 ký tự; unique `(conversationId, senderId, clientMessageId)`.
- Khi retry cùng client id, trả message đã tồn tại.
- Cursor là opaque base64 chứa `{ createdAt, id }`; sort ổn định theo `(createdAt, id)`.
- Read chỉ cập nhật message của đối phương, từ đầu đến `lastMessageId` thuộc đúng conversation.
- User LOCKED không gửi/join mới nhưng vẫn xem lịch sử theo quyền.

Socket.IO:

- Handshake bằng access token, map server-side vào room `user:{id}`.
- Join `conversation:{id}` sau khi kiểm tra membership.
- Client events: `conversation:join`, `message:send`, `conversation:read`.
- Server events: `message:created`, `conversation:read`, `notification:created`, `order:updated`.
- Socket handler gọi cùng chat/order service với REST.

## 14. Review, report, notification và support

### 14.1. Review

- `POST /orders/:orderId/reviews`.
- Buyer, order COMPLETED, trong 30 ngày, unique order.
- Rating integer 1-5; comment tối đa 1.000.
- Public list: `GET /users/:id/reviews`.
- Review hidden không tham gia rating aggregate.

### 14.2. Report

- `POST /reports`, `GET /reports/mine`.
- Target phải tồn tại; cấm tự report hoặc report product của chính mình.
- `OTHER` bắt buộc description.
- Chỉ một PENDING report/reporter/target.
- Resolve/reject và action liên quan chạy nguyên tử, có audit và notification.

### 14.3. Notification

- `GET /notifications`, `GET /notifications/unread-count`.
- `POST /notifications/:id/read`, `POST /notifications/read-all`.
- Mark read idempotent và luôn scope theo user.
- Read-all ghi một `cutoff=now` và chỉ update notification `createdAt <= cutoff`.
- Mutation trả `{ unread, updated? }` đúng frontend contract.

### 14.4. Support

Frontend gọi:

- `GET /support/tickets`
- `GET /support/tickets/:id`
- `POST /support/tickets`
- `POST /support/tickets/:id/messages`
- `POST /support/tickets/:id/close`

Rule:

- ORDER_PROBLEM bắt buộc order và requester là participant.
- User reply vào RESOLVED chuyển lại OPEN trong cùng transaction.
- CLOSED không mở lại.
- Ticket OPEN/IN_PROGRESS gắn order chặn complete.
- Chủ ticket không tự thấy identity/admin metadata không cần thiết.
- Admin list/detail/reply/assign/status dùng `/admin/support-tickets` theo contract nghiệp vụ.

## 15. Admin

Tất cả endpoint dưới `/admin` yêu cầu user ADMIN ACTIVE và ghi audit cho mutation nhạy cảm.

| Module | Endpoint chính |
|---|---|
| Dashboard | `GET /admin/dashboard?from&to` |
| User | `GET /admin/users`, `POST /admin/users/:id/lock`, `POST /admin/users/:id/unlock` |
| Product | `GET /admin/products`, approve/reject/block/unblock |
| Category | `POST /admin/categories`, `PATCH /admin/categories/:id` |
| Report | `GET /admin/reports`, resolve/reject |
| Review | `GET /admin/reviews`, `POST /admin/reviews/:id/hide` |
| Support | `GET /admin/support-tickets`, `PATCH /admin/support-tickets/:id` |
| Audit | `GET /admin/audit-logs` |

Yêu cầu riêng:

- Approve/reject dùng expected version và chỉ áp dụng PENDING.
- Approve không đổi `publishedAt` nếu product đã từng được publish.
- Unblock không tự ACTIVE; product chưa bán về/giữ INACTIVE hoặc PENDING theo policy.
- Lock user revoke session và xử lý order/product bị ảnh hưởng trong một orchestration có transaction/audit.
- Category không được vòng, không quá hai cấp, leaf/ancestor rule phải kiểm tra khi product submit/approve/checkout.
- Dashboard gọi tổng giá trị order hoàn tất là “giá trị giao dịch”, không phải doanh thu.

## 16. Upload và storage

`POST /uploads` nhận `multipart/form-data` gồm `file` và `purpose=product|avatar`.

Pipeline:

1. Rate limit và quota theo user.
2. Giới hạn 5 MB trước/đang stream.
3. Kiểm tra magic bytes JPG/PNG/WebP, không tin extension/MIME header.
4. Decode ảnh, giới hạn 20 megapixel, strip metadata.
5. Lưu private path `users/{userId}/{purpose}/{uuid}.{ext}`.
6. Tạo row upload tạm hoặc metadata tương đương để kiểm tra ownership/attachment.
7. Trả `{ storage_path, url }`; DTO frontend hiện chỉ yêu cầu `url`, cần bổ sung `storage_path` vào contract trước khi live.

Không chấp nhận client gửi URL ngoài làm product/avatar chính thức. Signed URL TTL mặc định 5 phút.

## 17. Validation và lỗi nghiệp vụ

Mọi input dùng Zod strict và giới hạn từ shared validation. Mã lỗi tối thiểu:

- `VALIDATION_ERROR` (422)
- `UNAUTHORIZED` (401)
- `FORBIDDEN`, `EMAIL_NOT_VERIFIED`, `ACCOUNT_LOCKED` (403)
- `NOT_FOUND` (404)
- `PRODUCT_NOT_AVAILABLE`, `PRICE_CHANGED`, `INVALID_ORDER_TRANSITION`, `ORDER_EXPIRED`, `VERSION_CONFLICT`, `REVIEW_NOT_ALLOWED`, `IDEMPOTENCY_CONFLICT`, `RETRY_LATER` (409)
- `RATE_LIMITED` (429)
- `INTERNAL` (500)

Private resource có thể trả 404 thay vì 403 để tránh ID enumeration. Prisma `P2002` không mặc định map thành validation cho mọi trường; service phải map theo context. Prisma `P2025` map `NOT_FOUND` nếu không phải conditional concurrency update; conditional update count 0 thường là conflict.

## 18. Security baseline

- Env bắt buộc được parse lúc boot; không có JWT secret fallback.
- CORS là allowlist nhiều origin, không dùng wildcard với credentials.
- JSON 64 KB; multipart quota riêng.
- Rate limit riêng: login, email token, chat, report, upload, checkout.
- Log redact authorization, cookie, password, token, email đầy đủ, phone, address và message content.
- Mọi query private scope bằng owner/participant trong cùng query khi có thể.
- Không cho mass assignment; luôn map field whitelist.
- Render text thuần; API không lưu HTML từ title/description/message.
- Graceful shutdown ngừng nhận request/job, đóng Socket.IO và Prisma.
- `/health/live` không chạm DB; `/health/ready` kiểm tra DB bằng query nhẹ có timeout.

## 19. OpenAPI

Tạo `docs/openapi.yaml` trước khi nối live frontend. Mỗi operation cần:

- auth/role/ownership;
- path/query/header/body schema;
- success DTO/envelope;
- error codes cụ thể;
- pagination/cursor;
- examples tiếng Việt;
- idempotency và version semantics.

OpenAPI phải mô tả đúng endpoint frontend đang gọi. Contract test sẽ parse OpenAPI và kiểm tra adapter method có operation tương ứng.

## 20. Test strategy

### Unit

- Product/order/ticket state machine.
- Capability/allowed action policy.
- Money/shipping calculation và canonical payload hash.
- Validation/password byte length/category tree.
- DTO mapper không lộ field nội bộ.

### Integration với PostgreSQL thật

- Auth token rotation/reuse/revoke.
- Ownership/IDOR trên mọi resource private.
- Hai checkout cùng product: đúng một thành công.
- Multi-seller checkout rollback toàn bộ khi một product lỗi.
- Cùng idempotency key: replay cùng payload, conflict payload khác.
- Confirm vs expire race.
- Complete vs open ticket race.
- Message dedupe và cursor ổn định.
- Report partial unique và notification dedupe.

### Contract

- Gọi API và validate response bằng schema dùng chung/OpenAPI.
- Chạy frontend adapter contract test cho cả mock và live test server.
- Kiểm tra mọi amount là string và mọi date là ISO timezone.

### E2E

Guest -> register -> verify -> seller đăng tin -> admin approve -> buyer cart/checkout -> seller confirm/ship -> buyer deliver/complete -> review.

## 21. Thứ tự triển khai

### Phase 0 - Chốt contract

- Sửa các URL/shape khác nhau giữa `detail-project.md`, DTO và `httpAdapter.ts`.
- Tạo OpenAPI và test response mapper.
- Quyết định upload DTO có `storage_path`.

### Phase 1 - Nền tảng

- Chuẩn hóa Prisma schema/migration.
- Config/env, request ID, error envelope, pagination.
- Auth session/token rotation, role policy, health endpoints.
- Seed dev có admin/user/category/province.

### Phase 2 - Marketplace

- Category/province/profile.
- Product CRUD/moderation/search.
- Upload private, favorite, cart.

### Phase 3 - Giao dịch

- Checkout transaction/idempotency/reservation.
- Order list/detail/state machine.
- Expiry worker, outbox, notification.

### Phase 4 - Giao tiếp và trust

- Chat REST + Socket.IO.
- Review, report, support.
- Admin đầy đủ và audit.

### Phase 5 - Hardening

- Integration/race/E2E/load test.
- Backup/restore drill, metrics, alert, deployment docs.

## 22. Definition of done cho backend MVP

- Prisma validate/generate, TypeScript build, lint và test đều pass.
- Mọi method trong `ApiAdapter` có endpoint live và response đúng DTO.
- Không route nào spread raw Prisma user/order/product vào response.
- Checkout/order transition được chứng minh bằng integration test concurrency.
- Auth refresh rotation và reuse detection có test.
- OpenAPI khớp implementation.
- Worker/outbox idempotent và có health/metric.
- Upload private có validation file thực.
- Seed tạo được luồng demo đầy đủ nhưng không có secret production cố định.
- Frontend chạy `VITE_API_MODE=live` hoàn thành E2E chính mà không dùng fixture.
