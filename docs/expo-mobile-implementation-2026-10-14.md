# Cập nhật app Expo — 14/10/2026

Triển khai theo [plan mobile](expo-mobile-plan-2026-10-14.md). Source có app Expo
Android/iOS trong `apps/mobile`, package `api-client` dùng chung và backend support
cho native session, push, block và xóa tài khoản. Admin tiếp tục dùng web.

## Các thay đổi

| Mục plan | Thay đổi thực tế |
|---|---|
| M01 auth | `/auth/mobile/*` dùng refresh credential qua JSON, không nhận Origin/cookie browser; Session.transport WEB/MOBILE ngăn trao đổi nhầm refresh token. Dùng chung auth routes/services, giữ rotation/replay/revocation và cookie HttpOnly của web. |
| M02 client | Endpoint groups/types và ApiError chuyển sang `packages/api-client`; web vẫn giữ transport/browser session riêng. Native transport kiểm tra response contracts, generation, single refresh và URL API tuyệt đối. |
| M03 push | Registration gắn user/session/installation; delivery claim, ticket/receipt, backoff, revoked-session/invalid-token và block checks. Inbox/realtime không tiêu thụ delivery push. Payload tối thiểu. |
| M04 ảnh | Picker/camera, JPEG conversion/resize, cap 5 MB, FormData native; preview renewal API chỉ cho owner. Image không gửi JWT qua CDN redirects. |
| M05 controls | Block/unblock, chat guard chung cho REST/socket; deletion có password/confirmation, active-order/support guard, purge/anonymization, outbox xóa ảnh, revoke session và tombstone guards. Web có `/delete-account`. |
| M06 lifecycle | AppState/NetInfo, offline notice, reconnect/refetch, read receipt theo focus/visible rows, deep links và return route allowlist. |

App có 22 route screens (không tính layouts), gồm catalog/search/detail/profile,
favorites/cart, seller form/my listings, orders/sales/reviews, chat, account/auth,
notifications, blocks và support. Dữ liệu/API là thật. Checkout retry giữ request
cũ khi kết quả chưa rõ; tin nhắn retry giữ client ID.

Hai migration additive:

- `20261014140000_native_sessions`: Session.transport và check constraint; rows cũ mặc định WEB.
- `20261014141000_mobile_devices_and_controls`: User.deletedAt, UserBlock, PushRegistration và PushDelivery.

Đã generate Prisma Client 5.22.0. Migration được kiểm tra trên schema DB test riêng;
database ứng dụng hiện tại chưa được migrate trong lượt triển khai này.

## Kiểm chứng

- 445 unit/contract/UI tests thành công: API 196, shared 20, web 211 (210 tests
  của suite hiện có và 1 test trang xóa tài khoản), API client 14, mobile 4.
  Typecheck/lint các package và generated contracts check đều thành công.
- 35 PostgreSQL integration tests thành công, kiểm tra native/web refresh separation, replay, user block,
  push ticket/receipt/revocation và deletion, cùng các regressions nghiệp vụ hiện có.
- Browser smoke thành công với 50 kiểm tra responsive và luồng thực, gồm chat
  qua WebSocket; không có uncaught exception hoặc response 5xx.
- Production API/web build và Expo Android/iOS export thành công; Hermes bundle
  cuối cùng khoảng 3,4 MB Android và 3,1 MB iOS.
- Expo Doctor qua 21/21 kiểm tra dependency/config. Android prebuild đã sinh native project
  trong thư mục ignored; iOS native build/simulator chưa chạy trên Windows.

Số liệu cuối cùng và log kiểm tra nằm trong `.artifacts/mobile-*.log`; log/artifact
không được commit. Không coi bundle export là xác nhận đã build/cài APK/IPA hoặc
đã kiểm thử camera, SecureStore, APNs/FCM trên thiết bị thật.

Supabase có các lần P1001 với client test độc lập. Đã kiểm tra migrations và toàn
bộ integration bằng PostgreSQL 16 local tạm, chỉ bind localhost; schema test tự dọn
và server được dừng sau lượt kiểm tra. Không reset hay seed dữ liệu ứng dụng.

Browser smoke trước đó kiểm tra DOM rồi lập tức assert frame, có thể chạy trước
message event khi notification event đã refetch REST history. Harness nay chờ có
giới hạn cho đúng message frame, vẫn giữ assertion rằng dữ liệu tới qua WebSocket.

## Để chạy và phát hành beta

1. Kiểm tra env/database đích, deploy hai migrations và API/worker mới trước app.
2. Cấu hình mobile API/socket URL, EAS project, Android/iOS app IDs và credentials.
3. Build development/preview bằng EAS, cài và QA hai thiết bị thật: cold/resume,
   SecureStore failure, ảnh iPhone/Android, mạng yếu, quyền notification và push.
4. Bật push backend sau khi credentials đã hoạt động; kiểm tra receipt/errors.
5. Hoàn thiện privacy/terms/support/retention, verified domain links và store metadata
   theo cấu hình vận hành trước production submission.

[Hướng dẫn app](../apps/mobile/README.md) có các lệnh chạy, cấu hình và giới hạn.
