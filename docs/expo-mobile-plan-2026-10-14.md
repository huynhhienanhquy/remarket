# Rà soát ReMarket và kế hoạch app Expo — 14/10/2026

## Kết luận và phạm vi

ReMarket có nền tảng phù hợp để thêm app Expo vào monorepo hiện tại. Đề xuất thêm `apps/mobile`, dùng lại Express API, PostgreSQL, storage và Socket.IO. Android và iOS được phát triển, kiểm thử và phát hành beta cùng đợt theo lựa chọn của người dùng.

Phạm vi bản đầu: người mua và người bán; admin tiếp tục xử lý trên web. Đây là giả định lập kế hoạch, có thể điều chỉnh. Giữ nghiệp vụ COD/gặp trực tiếp, quy trình duyệt tin và xác minh email qua admin đang có.

Ưu tiên đầu tiên là làm cho đăng nhập, khôi phục phiên và upload hoạt động trên **development build của cả hai nền tảng**. Sau khi vượt mốc này mới triển khai toàn bộ màn hình.

Tài liệu này dựa trên source hiện tại, commit `0450855`, tài liệu vận hành và các kiểm tra chạy trong lượt rà soát này. Chưa tạo app Expo, chạy migration hay xác minh hệ thống đang deploy. Các phần ghi “đề xuất” là công việc sắp làm, không phải tính năng đã có.

## 1. Hiện trạng đã kiểm tra

| Thành phần | Hiện trạng | Ý nghĩa đối với app |
|---|---|---|
| Workspace | pnpm 11.9, `apps/*`, `packages/*`, TypeScript | Thêm `apps/mobile` vào cấu trúc sẵn có |
| Web | React 19, Vite, React Router, TanStack Query 5 | Tham khảo luồng và UI; màn hình native cần viết riêng |
| API | Express 4, `/api/v1`, Prisma 5.22/PostgreSQL | Có thể dùng chung backend; chưa có lý do nâng Prisma để làm mobile |
| Shared | DTO, enum, policy, validation, tiền, nhãn, tỉnh thành, response validators | Nguồn tái sử dụng chính cho app |
| Nghiệp vụ | Catalog/search, favorites, cart, checkout, orders/reviews, seller listings, chat, notifications, reports, support, admin | Không cần xây lại backend marketplace |
| Auth | Access JWT trong memory, refresh cookie HttpOnly, rotation/revocation, bootstrap không consume token | Cần thêm transport native dùng token lưu an toàn trên thiết bị |
| Giao dịch | Checkout có idempotency; cập nhật có version và allowed actions/capabilities | App phải giữ đúng cách retry và quyền từ server |
| Realtime | Socket.IO nhận JWT trong `handshake.auth.token`; notification/outbox/relay | Dùng lại khi foreground, bổ sung push khi background |
| Upload | Multipart `file` + `purpose`; JPG/PNG/WebP, tối đa 5 MB và 20 MP; có biến thể ảnh | Cần chuyển đổi/nén ảnh điện thoại và xử lý URL ký hết hạn |
| CI | PostgreSQL, contracts check, typecheck/lint/tests/build, browser smoke | Mở rộng thêm native checks và beta builds |

Nguồn chính: [package root](../package.json), [workspace](../pnpm-workspace.yaml), [shared exports](../packages/shared/src/index.ts), [web routes](../apps/web/src/config/route/router.tsx), [API mounts](../apps/api/src/app.ts), [CI](../.github/workflows/ci.yml).

### Kiểm chứng trong lượt này

| Kiểm tra | Kết quả |
|---|---|
| API unit + contract | 30 files, **184 tests pass** |
| Shared | 3 files, **20 tests pass** |
| Web | 37 files, **210 tests pass** |
| Typecheck | Shared; API runtime/test; web runtime/Vite config: pass |
| ESLint | API src/tests/scripts, web, shared: pass |
| Generated response contracts | `generate-response-contracts.mjs --check`: pass |
| Build | API production build và Vite production build: pass |

Tổng: **414 tests pass**. Web build có cảnh báo entry chunk khoảng 530 KB minified; đây là cảnh báo tối ưu web, không phải lỗi build hay trở ngại trực tiếp của Expo.

Các lệnh qua wrapper `pnpm` ban đầu tự đi vào bước kiểm tra/cài dependency và gặp `EACCES` khi truy cập npm registry. Đã dừng các lần gọi đó và chạy công cụ hiện có qua `node_modules/.bin` cùng các Node scripts; kết quả trên là kết quả của cách chạy trực tiếp. Không sửa cấu hình package manager để né policy.

Không chạy PostgreSQL integration hoặc browser smoke trong lượt này. Báo cáo 10/10 có kiểm chứng trước đó nhưng không thay thế kiểm chứng hiện tại; trạng thái migration và deployment thực tế còn phải kiểm tra trên staging trước khi bắt đầu mobile.

## 2. Những khoảng trống cần xử lý

### M01 — P0: Auth hiện tại chưa dùng trực tiếp cho native production

`requireTrustedOrigin()` từ chối request không có `Origin` khi production. Login, bootstrap, refresh, logout và một số luồng tài khoản gọi middleware này. Refresh credential chỉ được đọc từ cookie; login/refresh không trả refresh token trong JSON.

Nguồn: [auth cookies](../apps/api/src/services/auth-cookies.ts), [auth routes](../apps/api/src/routes/auth.ts), [session issuance](../apps/api/src/services/session-issuance.ts), [auth lifecycle regression](../apps/api/tests/unit/auth-lifecycle.test.ts).

**Đề xuất:** thêm API native riêng và tách phần xác thực/rotation khỏi xử lý cookie. Web giữ transport cookie và trusted-Origin hiện tại. Mobile dùng refresh token qua body của các endpoint native, lưu trong SecureStore; access token giữ memory. Không giải quyết bằng cách tắt kiểm tra Origin hay giả lập Origin của web.

Phải kiểm tra đủ login, bootstrap, refresh, logout, logout-all, yêu cầu xác minh email và link xác minh/reset mật khẩu; không chỉ sửa login rồi để các luồng còn lại phụ thuộc cookie.

### M02 — P1: API client và hooks còn phụ thuộc trình duyệt

`http.ts` dùng `window.location`, `navigator.locks`, `BroadcastChannel` và session scope theo tab. Upload nhận `File`; nhiều hooks dùng React Router, chat read receipt dùng `document.visibilityState`/DOM scroll. Các phần này không thể import nguyên vào Expo.

Nguồn: [HTTP transport](../apps/web/src/services/http.ts), [API types](../apps/web/src/types/api.ts), [catalog endpoints](../apps/web/src/services/endpoints/catalog.ts), [chat hook](../apps/web/src/pages/ConversationPage/hooks/useChatThread.ts).

**Đề xuất:** `packages/api-client` chứa endpoint builders, types và xử lý envelope/error không phụ thuộc platform. Inject transport và auth adapter từ web/mobile. DTO và policy thuần tiếp tục ở shared. Hooks điều hướng, đọc trạng thái màn hình và UI ở từng app; chỉ tách query logic dùng chung khi thực sự có hai consumer.

### M03 — P1: Có notification trong app, chưa có push delivery

Schema chưa có device/push registration; notification service hiện tạo notification row và outbox cho realtime. Socket không đủ để bảo đảm thông báo khi app bị suspend hoặc đóng.

Nguồn: [schema](../apps/api/prisma/schema.prisma), [notification service](../apps/api/src/services/notifications.ts), [realtime server](../apps/api/src/realtime/server.ts).

**Đề xuất:** device registration API, push delivery job tách khỏi realtime delivery, xử lý tickets/receipts, retry/backoff và vô hiệu token lỗi. Không đánh dấu một outbox event đã xử lý chỉ vì một trong hai kênh thành công. Push payload chỉ chứa dữ liệu tối thiểu và ID điều hướng; app tải nội dung qua REST sau khi kiểm tra quyền.

### M04 — P1: Ảnh iPhone và URL ảnh cần adapter native

API từ chối định dạng ngoài JPG/PNG/WebP và ảnh quá 20 MP. App cần chuyển HEIC/HEIF hoặc asset không tương thích sang JPEG, resize/nén trước upload; kiểm tra kích thước byte sau xử lý và thử ảnh thật trên iPhone/Android.

Native FormData dùng asset URI/name/MIME thay cho web `File`. Base URL phải tuyệt đối, upload không tự đặt multipart boundary. URL `/api/v1/uploads/...` phải resolve theo API origin, không theo web proxy; khi URL ký hết hạn cần refetch metadata một lần với giới hạn retry. Giữ kiểm tra quyền trên server và xóa cache ảnh riêng khi đổi tài khoản.

Nguồn: [uploads](../apps/api/src/routes/uploads.ts), [image URLs](../apps/api/src/shared/image-url.ts), [web HTTP URL handling](../apps/web/src/services/http.ts).

### M05 — P1 trước phát hành store: Xóa tài khoản và chặn người dùng

Đã có report user/product và admin khóa tài khoản. Chưa tìm thấy API tự yêu cầu xóa tài khoản hoặc quan hệ user block trong schema/routes/OpenAPI. Admin khóa một user và một user chặn người khác là hai hành vi khác nhau.

**Đề xuất:** bổ sung account deletion và block/unblock trước bản production. Với deletion, rà soát quan hệ order/audit/chat/upload trước khi thiết kế: thu hồi phiên và push registrations, xóa dữ liệu thuộc phạm vi yêu cầu; xác định và công bố phần phải giữ lại theo nghĩa vụ áp dụng. Không gọi `user.delete()` trực tiếp dựa trên cascade hiện tại. Với block, kiểm tra ở cả REST send và Socket.IO send, không chỉ ẩn nút trên app; định nghĩa rõ ảnh hưởng tới thread, push, tin đăng và đơn đang có. Giữ luồng hỗ trợ/xử lý tranh chấp cho đơn hiện hữu.

Apple yêu cầu app có tạo tài khoản cho phép bắt đầu xóa tài khoản trong app. Google Play yêu cầu đường yêu cầu xóa trong app và một web resource phù hợp. Marketplace có nội dung người dùng và chat cần report/block và quy trình xử lý nội dung. Nguồn: [Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/), [Google Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en), [Google Play UGC](https://support.google.com/googleplay/android-developer/answer/9876937/).

### M06 — P1: Lifecycle và môi trường triển khai

Web đang dùng focus/visibility và sự kiện online/offline của browser. Native cần `AppState`, connectivity adapter, đồng bộ lại query và socket sau resume; read receipt chỉ gửi khi thread có focus, app active và tin đã hiển thị.

App gọi trực tiếp REST/socket host, không đi qua Vercel proxy. `localhost` trên điện thoại là chính điện thoại; development dùng host LAN hoặc staging HTTPS, cấu hình riêng cho simulator/emulator. Backend phải chạy ổn định cùng worker khi test beta/push. Runbook demo hiện mô tả Render Free có thể ngủ; cần kiểm tra hosting beta thực tế trước khi dùng làm acceptance environment. Quota hiện process-local cần shared store nếu tăng API replicas.

## 3. Kiến trúc đề xuất

```text
apps/
  api/                       Express, business rules, Prisma, jobs, push delivery
  web/                       Marketplace web + admin hiện tại
  mobile/                    Expo + React Native + Expo Router
    src/app/                 Route files và layout
    src/features/            auth, catalog, listings, commerce, chat, account
    src/components/          UI native dùng chung trong app
    src/services/            native transport, token store, realtime, linking
    src/config/              environment và query setup
packages/
  shared/                    DTO, enum, validation, money, pure policy
  api-client/                Đề xuất mới: endpoint mapping, errors, contracts
```

- Chọn Expo SDK stable tại lúc khởi tạo; khóa phiên bản bằng lockfile. React/React Native và Expo modules đi theo ma trận tương thích SDK, cài bằng `expo install`, kiểm tra `expo-doctor`. React 19.1 của web không quyết định version React của app.
- Expo Router cho tabs/stack/deep link; React Native UI dùng StyleSheet và tokens từ web spec. Bản đầu ưu tiên UI ít dependency, chưa cần thêm một bộ component lớn hoặc chia sẻ DOM components.
- TanStack Query 5 quản lý dữ liệu server. Session giữ trong provider/service; form/draft là local state. Chưa cần thêm Redux/Zustand chỉ vì có app thứ ba.
- SecureStore cho refresh credential; không lưu access token/password trong AsyncStorage. SecureStore có thể lỗi: chưa nhận phiên là đã lưu thành công cho tới khi ghi token hoàn tất. Không xóa token vì lỗi mạng/5xx.
- `expo-image` cho ảnh; `expo-image-picker` và `expo-image-manipulator` cho chọn/chuyển/nén ảnh; `expo-notifications` cho push; `expo-linking`/Router cho link; connectivity adapter dựa trên NetInfo.
- Dùng development builds và EAS profiles `development`, `preview`, `production`; cấu hình `eas.json`/app config nằm trong `apps/mobile`. Hai nền tảng phải có preview build từ giai đoạn nền tảng. Push kiểm thử trên development build với credentials FCM/APNs.
- Expo hỗ trợ pnpm workspaces và cấu hình monorepo bằng `expo/metro-config`. Giữ config mặc định trước, chỉ tùy chỉnh khi có lỗi đã tái hiện. Smoke-test Metro với shared package đang export `.ts` và import nội bộ đuôi `.js`, BigInt/Intl, đồng thời kiểm tra chỉ một bản React/native module trong bundle.
- `EXPO_PUBLIC_API_BASE_URL` và `EXPO_PUBLIC_SOCKET_URL` chỉ chứa cấu hình công khai. Không đưa JWT signing key, DB URL, SMTP hoặc Supabase service key vào app. Mỗi môi trường có API URL, app ID và update channel riêng.

Nguồn Expo: [monorepos](https://docs.expo.dev/guides/monorepos/), [Router authentication](https://docs.expo.dev/router/advanced/authentication/), [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [EAS Build](https://docs.expo.dev/build/introduction/), [push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/). Đây là lựa chọn kiến trúc cho ReMarket dựa trên tài liệu, chưa phải kết quả build Expo của project.

## 4. Thiết kế auth và API bổ sung

### Native session contract đề xuất

| Endpoint mới dưới `/api/v1` | Input/output chính |
|---|---|
| `POST /auth/mobile/login` | Email/password → access token, refresh token, user, TTL |
| `POST /auth/mobile/bootstrap` | Refresh token → access token/user; kiểm tra credential mà không consume |
| `POST /auth/mobile/refresh` | Refresh token → cặp token mới + user; rotation atomic |
| `POST /auth/mobile/logout` | Refresh credential hợp lệ → revoke đúng session, không cần access token còn hạn |

Tên/path ở bảng là đề xuất. Logout-all và các thao tác tài khoản có thể dùng chung service hoặc thêm native route khi middleware browser hiện tại không phù hợp. Forgot/reset/verify cũng phải được kiểm tra toàn bộ trước khi chốt contract.

1. Tách service login/bootstrap/refresh/revoke; giữ lock order User → Session → AuthToken và hash-only persistence hiện có.
2. Đề xuất đánh dấu transport của session (`WEB`/`MOBILE`, web là default cho dữ liệu cũ), kiểm tra đúng loại ở refresh/bootstrap. Mobile routes không nhận cookie làm credential và không tạo Set-Cookie. Không coi header client hoặc device ID là bằng chứng xác thực.
3. Client dùng một promise refresh chung cho REST/socket/resume; lưu refresh token mới trước khi release các request chờ. Dùng generation counter để response cũ sau logout không khôi phục phiên.
4. Bootstrap không rotate giúp giảm mất phiên khi startup bị hủy. Với refresh đã commit nhưng response bị mất, credential cũ có thể bị xem là replay; không auto retry vô hạn. Bản đầu cần hành vi đăng nhập lại rõ ràng. Nếu muốn recovery idempotent, phải thiết kế/test riêng cơ chế đó trước khi thay đổi replay policy.
5. Logout xóa credential và cache riêng tư, disconnect socket, hủy request cũ; revoke server session khi có thể. Logout offline phải bảo đảm trên thiết bị không còn phiên và vô hiệu push registration bằng session revocation khi server xử lý; không tuyên bố đã revoke server khi request chưa thành công.
6. API errors và contracts cho native được cập nhật ở OpenAPI, regenerate response validators/Postman và kiểm tra web regression.

### Push contract đề xuất

Device registration gắn user, session, installation ID, platform, Expo push token, environment, permission state, timestamps; API upsert/unregister authenticated. Kiểm tra quyền sở hữu registration. Đăng nhập tài khoản khác phải thay association cũ, không tiếp tục gửi private push cho tài khoản trước đó.

Worker chỉ gửi tới session/account còn hợp lệ, dùng delivery key theo notification/device để dedupe logic. Gửi push qua mạng không bảo đảm exactly-once; app dùng notification ID khi reconcile. Lưu tickets, đọc receipts, retry các lỗi tạm thời có backoff và disable `DeviceNotRegistered`. Revoke/logout/account lock/deletion phải vô hiệu registrations tương ứng. Người dùng từ chối permission vẫn dùng app và notification inbox bình thường.

Tách payload realtime và push; không gửi JWT, signed image URL hay toàn bộ nội dung chat riêng trong push mặc định. Link từ push là yêu cầu điều hướng, không cấp quyền xem entity. Nguồn: [Expo push delivery](https://docs.expo.dev/push-notifications/sending-notifications/).

## 5. Phạm vi màn hình bản đầu

Navigation đề xuất: **Khám phá — Yêu thích — Đăng tin — Tin nhắn — Tài khoản**. Giỏ hàng ở header/stack; đơn mua/bán và notification inbox từ Tài khoản/badge. Search là một màn hình trong Khám phá. Nút Đăng tin dẫn guest/unverified qua đúng auth/verification flow.

| Nhóm | Nội dung bản đầu |
|---|---|
| Auth/account | Register, login/logout, session restore, forgot/reset password, yêu cầu xác minh qua admin, profile/avatar, deletion |
| Khám phá | Home, categories, search/filter/sort/pagination, detail/gallery, public seller profile/reviews |
| Người mua | Favorites, cart, checkout COD/MEETUP, order list/detail/actions, review |
| Người bán | My listings, create/edit/upload/submit/hide/remove theo capabilities; sales list/detail/actions |
| Giao tiếp | Inbox/thread, history pagination, send/retry/read receipts, badge, foreground realtime, background push |
| Hỗ trợ | Notification inbox, report user/product, block/unblock, support list/create/thread |

Để sau bản đầu: social login, thanh toán online, bản đồ/GPS, chat media/audio, offline gửi đơn, admin native. Mất mạng vẫn giữ draft form và phản hồi retry; không xếp hàng checkout/order actions tự động khi offline. Có thể lưu draft đăng tin cục bộ, tách theo user và dọn khi logout; chưa persist toàn bộ private query cache.

Không tự thay đổi quy trình xác minh email bằng admin. App phải thể hiện pending/rejected/verified và cập nhật quyền khi admin duyệt; đăng ký hiện trả `pending_verification`, không tự coi là phiên đăng nhập.

## 6. Roadmap và điều kiện nghiệm thu

Ước lượng dưới đây là **ngày công phát triển**, chưa phải cam kết lịch. Giả định backend hiện tại và staging hoạt động, design bám web hiện có, phạm vi đúng bảng trên. Tổng dự kiến 50–74 ngày công; một dev toàn thời gian khoảng 10–15 tuần, hai dev phụ trách mobile/backend khoảng 7–10 tuần tùy phụ thuộc. Thời gian xét duyệt store và chờ tài khoản/credentials tính riêng. Chốt lại estimate sau mốc nền tảng/auth.

| Giai đoạn | Công việc và đầu ra | Nghiệm thu | Ngày công |
|---|---|---|---|
| 0. Baseline + Expo foundation | Staging/migration check, `apps/mobile`, SDK/Metro, shared smoke, theme/navigation, env, EAS profiles | Android **và iOS** build cài được, gọi catalog thật, render shared DTO/tiền | 4–6 |
| 1. Native auth + API client | Auth services/routes, session transport migration nếu chọn, SecureStore, refresh queue, errors/contracts, web adapter regression | Login/restart/resume/expired token/logout/revocation trên hai OS; web auth vẫn pass | 7–10 |
| 2. Catalog + account | Home/search/detail/gallery/seller/favorites, profile, verification/reset deep links | Guest browse; authenticated mutations; admin verify cập nhật quyền; link cold/warm start | 6–8 |
| 3. Seller + upload | Draft/create/edit/submit/hide/remove, camera/library, convert/compress, signed URL refresh | Upload ảnh thật trên iPhone/Android, admin duyệt web và app thấy trạng thái; không mất draft khi refetch | 6–8 |
| 4. Commerce | Cart, checkout, orders/sales/actions/reviews | Retry cùng idempotency key; giá/trạng thái đổi xử lý đúng; hai client tranh món chỉ một đơn thắng | 7–10 |
| 5. Chat + notifications | Thread/history/send/read, AppState/NetInfo, push registration/worker/receipts/deep links | Hai thiết bị nhắn; resume refetch; không trùng tin; push active/background/terminated và permission denied | 8–12 |
| 6. Support + store prerequisites | Reports/support, block service + UI, deletion service + UI/web deletion resource, privacy/support pages | Chặn có hiệu lực ở REST/socket/push; deletion theo policy; reviewer có thể kiểm tra đầy đủ | 6–10 |
| 7. QA + beta/release | Native tests/E2E, thiết bị thật, performance/accessibility, internal Android + TestFlight, store metadata | Release checklist pass cả hai OS và web/API regression pass | 6–10 |

Chuỗi phụ thuộc: **0 → 1 → 2 → 3/4 → 5 → 7**. Phần backend block/deletion/push schema có thể chuẩn bị sớm trong 1–4 khi có dev thứ hai; không để toàn bộ store prerequisites tới cuối dự án. Mỗi giai đoạn có preview cho cả Android/iOS, không chỉ chạy Expo Go trên một máy.

Ba mốc review sản phẩm: (A) auth + browse + upload; (B) mua/bán trọn luồng; (C) chat/push/support và beta. Chỉ mở rộng phạm vi sau khi tiêu chí mốc hiện tại đạt.

## 7. Kế hoạch kiểm thử và phát hành

- Regression API/web/shared và generated contracts sau khi tách client/auth. Migration mới additive, test database riêng; kiểm tra rollout API/worker trước khi dùng dữ liệu thật.
- Native auth: một refresh cho nhiều request song song; 401 cũ không rotate lại token mới; 403 quyền không tự logout; network/5xx giữ credential; account lock/reset/logout-all thu hồi đúng phiên; lỗi SecureStore và response đến muộn sau logout.
- Commerce: timeout sau checkout commit, retry giữ key với cùng payload; đổi payload dùng key mới; sold/hidden/moderated item, expected version conflict, mua từ nhiều sellers, tiền VND và COD/MEETUP khớp backend. Không tính lại quyền hoặc reservation trên app.
- Upload: permission denied, ảnh HEIC/HEIF, ảnh 48 MP, ảnh lỗi, >5 MB, orientation, background/timeout, private image sau logout và URL hết hạn.
- Chat: cursor/history, tin ngoài thứ tự/duplicate, REST retry với cùng `client_message_id`, focus/read receipt, network switch, expired socket JWT, foreground/background/relaunch, blocked user và badges tính lại từ server.
- Push/link: cold/warm start, guest phải login rồi quay lại đúng entity; entity bị ẩn/hủy hoặc không có quyền; chuyển user; token invalid; credentials khác môi trường. REST là nguồn dữ liệu chuẩn sau push/reconnect.
- Native component tests bằng React Native Testing Library và test runner tương thích SDK; kiểm tra auth/link/cart state có ý nghĩa. E2E dự kiến dùng Maestro trên Android và iOS ở runner thích hợp, chốt sau foundation. Browser smoke hiện tại tiếp tục chạy cho web.
- CI chạy mobile typecheck/lint/tests, `expo-doctor` và bundle export cho hai platforms. Native preview build riêng trên PR/mốc quan trọng theo ngân sách; JS bundle pass chưa đủ kết luận native build pass.
- EAS chạy iOS cloud build; Windows hiện tại không cung cấp iOS Simulator/local Xcode. Cần iPhone thật cho push và Mac/macOS runner khi chạy simulator E2E. Chuẩn bị Apple/Google developer accounts, APNs/FCM và tài khoản reviewer có quyền kiểm tra luồng duyệt/xác minh.
- Release: staging HTTPS ổn định; app IDs/icons/splash/permission copy; privacy policy/support/terms/deletion resource; store declarations và screenshots; crash reporting không ghi token/PII; beta hai nền tảng. Chỉ cấu hình EAS Update khi có runtimeVersion/channel và chính sách rollback rõ, native dependency/config thay đổi phải build binary mới.

## 8. Backlog để bắt đầu triển khai

1. `MOB-001`: chốt SDK stable và tạo Expo workspace; chạy shared/Metro smoke trên Android+iOS; thêm dev scripts mà không khiến lệnh build demo kéo mobile vào.
2. `API-001`: tách auth service, định nghĩa native contract và session transport, thêm regression test trước khi thay route web.
3. `MOB-002`: native session manager + SecureStore + bootstrap/refresh queue + lifecycle; kiểm tra production-like Origin policy.
4. `SHARED-001`: thêm api-client platform-neutral, chuyển web adapter theo từng domain, giữ URL resolver và FormData theo platform.
5. `MOB-003`: catalog slice: login → home/search → product detail → favorite; EAS preview hai OS.
6. `MOB-004`: picker/convert/upload slice và listing create/submit; test iPhone/Android thật cùng admin web.
7. `API-002`: thiết kế push registrations/delivery state; `API-003`: block/deletion policy và migrations, triển khai theo roadmap.

Mốc triển khai đầu tiên nên hoàn thành **MOB-001 + API-001 + MOB-002**, kèm catalog smoke. Sau đó đánh giá lại estimate dựa trên build thật và độ phức tạp của auth, thay vì bắt đầu bằng nhiều màn hình chưa có phiên native ổn định.
