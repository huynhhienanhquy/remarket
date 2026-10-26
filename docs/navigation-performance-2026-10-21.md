# Kiểm tra độ trễ chuyển trang — 21/10/2026

Sau cập nhật, bài đo nhóm API trang sản phẩm kèm header có median giảm từ
1.786 ms xuống 767 ms (khoảng 57%). Chi tiết thay đổi và phép so sánh nằm ở
phần cập nhật cuối báo cáo; số đo chẩn đoán ban đầu được giữ lại bên dưới.

## Kết luận từ phép đo

Độ trễ kết nối từ API local đến PostgreSQL/Supabase là nguyên nhân chính trong
môi trường đang cấu hình. Nhiều lượt đọc cho một trang và đọc byte ảnh qua cùng
pool hai connection làm độ trễ đó cộng dồn. Đã sửa việc đọc ảnh lặp lại; độ trễ
kết nối ban đầu và các lượt đọc dữ liệu nghiệp vụ vẫn còn.

| Phép đo | Kết quả quan sát |
| --- | --- |
| API liveness, không đọc DB | 2–3 ms khi đã warm |
| `SELECT 1`, đã có connection | 195–267 ms qua HTTP local |
| `SELECT 1`, thời gian execution trên PostgreSQL | 0,022–0,047 ms |
| Mở connection và request đầu | 1,78–3,30 giây; một lần thất bại sau 5 giây |
| Query danh sách sản phẩm, execution trên PostgreSQL | 1,163 ms; planning 1,543 ms |
| Query lấy các sản phẩm của user, execution trên PostgreSQL | 0,071 ms; planning 0,154 ms |
| Trang sản phẩm thành viên + ba request badge header chạy đồng thời | 10 SQL, hoàn tất sau 1,56 giây, chưa tính ảnh |
| Danh sách quản trị | Thường 3 SQL/request, khoảng 0,76–1,76 giây trong một lượt đo |

Các execution time cuối bảng lấy bằng `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`
của SELECT thật được Prisma phát ra. Phép đo này cho thấy hai query mẫu xử lý
nhanh trên bộ dữ liệu hiện tại; không chứng minh mọi query sẽ nhanh khi dữ liệu
tăng. Các khoảng thời gian mạng lấy từ nhiều lượt chạy, không phải percentile
của một bài load test. Một request sản phẩm của user từng tăng đến 17,8 giây;
chưa có bằng chứng đủ để quy riêng lần tăng đó cho provider, mạng hay pooler.

## Rà soát luồng tải

- Web dùng React Router `Link` và lazy page modules. Chuyển trang thông thường
  không reload cả document hoặc tạo lại Prisma client. `App` giữ một QueryClient,
  SessionProvider và RealtimeProvider phía trên router.
- React Query mặc định giữ dữ liệu fresh 30 giây; tìm kiếm dùng 10 giây, badge
  15 giây. Khi mở trang chưa có cache hoặc quay lại sau thời gian này, request
  mới là hành vi hiện tại. Realtime còn invalidates nhiều nhóm dữ liệu khi kết
  nối lại hoặc nhận sự kiện.
- API dùng Prisma singleton. Runtime local dùng session pooler cổng 5432,
  `pgbouncer=false`, HTTP pool 2; background pool riêng 1. Benchmark tắt jobs,
  vì vậy các độ trễ đo được không cần có background job mới xuất hiện.
- Mỗi request có đăng nhập đọc Session/User mới từ DB. Các list quản trị thường
  đọc thêm page và count. Với độ trễ mỗi lượt DB như trên, chỉ 2–3 lượt đọc và
  chờ pool cũng đã có thể mất hơn một giây.
- Trước cập nhật, header gọi ba API riêng: message count, notification count và **toàn bộ
  giỏ hàng** để lấy `total_items`. Cart còn kiểm tra category và tải quan hệ.
  Các request này chia sẻ pool với dữ liệu chính của trang.
- Profile có các bước owner → category → page/count → context; own products
  còn dựng category/context. Các helper reputation/favorites đã batch theo
  trang, nhưng vẫn tạo thêm các lượt đọc phụ thuộc.
- `STORAGE_DRIVER=database` đang bật ở local: signed URL tránh query quyền và
  metadata ảnh, nhưng trước sửa **mỗi lần đọc byte ảnh vẫn query StorageObject**.
  Ảnh và dữ liệu trang dùng chung HTTP pool. URL ảnh có chữ ký theo mốc phút,
  nên cache trình duyệt không luôn dùng lại được khi URL đổi.
- Web production entry hiện khoảng 536,56 kB minified / 156,88 kB gzip, còn
  cảnh báo chunk trên 500 kB. Đây là chi phí lần tải app đầu, chưa được xác nhận
  là nguyên nhân chính của thời gian chờ DB khi chuyển trang.
- Mobile dùng chung API và cũng có React Query/cache/badge requests. Đã chạy
  test, typecheck và export Android/iOS; chưa đo thao tác trên thiết bị thật.

Đã gọi GET thật cho catalogue/detail/profile, cart, favorites, orders, own
products, notifications, conversations, support và chín API quản trị bằng phiên
còn hiệu lực. Báo cáo không lưu token, response body hoặc thông tin tài khoản.
Không đo browser end-to-end của lần kiểm tra này, hoặc service Render đang
deploy. Render Free nằm trong cấu hình repo; cold start của service đó chưa
được đo và không được dùng làm kết luận cho lần kiểm tra local.

## Thay đổi đã áp dụng

`src/services/database-image-cache.ts` và `storage.ts`:

- Cache byte ảnh theo storage path, tối đa 32 MiB và 128 entry, TTL 60 giây.
- Gộp request cùng object đang đọc thành một lần đọc DB; lỗi đọc không cache.
- Cache kết quả thiếu derivative tối đa 5 giây để tránh đọc lại ảnh biến thể
  không tồn tại trên từng card.
- Loại cache khi upload/import/delete; đọc đang chạy trước invalidation không
  được ghi lại cache cũ sau đó.
- Request vẫn kiểm tra chữ ký, object, visibility và expiry trước khi đọc cache.
  Không cache identity, role, trạng thái listing hoặc quyền xem ảnh.

| Đọc lại cùng sáu ảnh qua HTTP, không dùng browser cache | Trước | Sau |
| --- | --- | --- |
| Độ trễ mỗi ảnh | 259–339 ms | 5–10 ms |
| Tổng SQL của lượt đọc lại | 6 | 0 |
| Bốn request cùng ảnh sau lượt đầu | 2.870 ms, 2 SQL | 22 ms, 0 SQL |

Lần đọc ảnh đầu hoặc sau eviction/TTL vẫn cần DB và có thể mất vài giây nếu
kết nối chậm. Cache thuộc từng API process; upload/delete ở process khác hoặc
thay đổi trực tiếp DB có thể còn byte cũ trong process này tối đa 60 giây.
Chữ ký ảnh vẫn có giới hạn thời gian riêng như trước.

## Kiểm chứng bản sửa ảnh và tái lập

- `pnpm test`: 491 test pass, 46 DB integration test skip trong lượt mặc định.
- `node apps/api/scripts/verify-isolated.mjs --storage-only`: 2 integration test
  pass trên schema PostgreSQL ngẫu nhiên riêng; schema đã được dọn. Kiểm tra
  upload, đọc original/derivative, legacy import và xóa ảnh đã cache.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: pass toàn monorepo, gồm API, web
  và export Android/iOS. Web có cảnh báo kích thước bundle nêu trên.

Chạy từ thư mục gốc; các lệnh benchmark chỉ dùng GET/SELECT với database đã
cấu hình, không login, rotate cookie hay tạo fixture:

```sh
pnpm --filter @remarket/api exec tsx scripts/benchmark-navigation.ts navigation-pages
pnpm --filter @remarket/api exec tsx scripts/benchmark-navigation.ts navigation-images --images
pnpm --filter @remarket/api exec tsx scripts/benchmark-navigation.ts navigation-plans --plans
pnpm --filter @remarket/api exec tsx scripts/benchmark-public.ts navigation-public
```

API authenticated được benchmark bằng token chỉ tồn tại trong process, tham
chiếu phiên đang có hiệu lực. Không có phiên phù hợp thì bỏ qua role đó. Probe
ảnh chọn object đã có trong StorageObject, không tạo ảnh hoặc sửa dữ liệu.
SQL/query duration do Prisma ghi nhận có thể bao gồm thời gian mạng; tổng query
duration của các query chạy song song không phải elapsed time của request.

Raw reports local nằm trong `.artifacts/performance/`: `navigation-before.json`,
`navigation-pages-before.json`, `navigation-images-before.json`,
`navigation-images-after.json`, `navigation-plans.json`. Lần chạy script mới còn
lưu `*-details.json` chứa cấu hình đã lọc, server execution time và batch timing.

Để giảm tiếp độ trễ dữ liệu trang, các điểm còn lại là số lượt API/SQL của badge
header, các bước query phụ thuộc và đường kết nối API–database. Chưa thay đổi
region, connection limit, nơi lưu ảnh hoặc hợp đồng API trong bản sửa này.

## Cập nhật giảm độ trễ tiếp theo cùng ngày

Đã xử lý thêm số lượt đọc khi điều hướng:

- Thêm `GET /notifications/navigation-counts`: một SQL snapshot trả về ba số
  đếm notification/message/cart sau một lần kiểm tra session. Không join hoặc
  dựng toàn bộ giỏ hàng. Tài khoản LOCKED chỉ nhận số thông báo; message/cart
  bằng 0. API cũ vẫn được giữ cho các client đang sử dụng.
- Web và app Expo dùng chung request/cache số đếm giữa header và thanh điều
  hướng. Query key có viewer ID; thay tài khoản vẫn xóa cache. Cart mutations,
  đọc thông báo/tin nhắn và realtime cập nhật lại số đếm.
- API mở tối đa hai connection HTTP trước `listen`, đồng thời với bootstrap
  realtime relay. Không tăng connection limit. Chi phí mở connection được đưa
  vào startup; đây không phải giảm thời gian TLS/mạng của provider.
- Profile đọc user/reputation và owner/category song song. Order detail đọc
  open-ticket/reputation song song. Context cho danh sách rỗng không truy vấn
  favorites/reputation.
- Đồng bộ DTO, OpenAPI, response validator và Postman cho endpoint mới.
- Khung chat đăng ký lại xử lý scroll/read khi thông tin cuộc trò chuyện đã
  tải xong, kể cả khi history trả về trước và số tin nhắn không đổi. Tránh bỏ
  lỡ việc đánh dấu đã đọc do khung nội dung chưa mount; có regression test
  chủ động trì hoãn response detail để tái hiện thứ tự này.

So sánh xen kẽ luồng cũ/mới trong cùng process, cùng DB, pool HTTP 2, không jobs
và không dùng frontend cache; ba mẫu warm sau một vòng mở query shapes:

| Trang sản phẩm thành viên kèm header, chưa tính ảnh | Luồng cũ | Luồng mới |
| --- | --- | --- |
| HTTP request mỗi lượt | 4 | 2 |
| SQL ghi nhận mỗi lượt | 10 | 4, 4, 5 |
| Thời gian hoàn tất, ba mẫu | 1.786 / 1.944 / 1.536 ms | 560 / 767 / 854 ms |
| Median | 1.786 ms | 767 ms |

Median của bài đo này giảm khoảng 57%. Đây là elapsed time của nhóm API qua
HTTP local, không phải thời gian chuyển trang end-to-end trên browser. Không
suy ra mọi trang hoặc môi trường deploy đều giảm cùng tỷ lệ. Một lượt mới ghi
nhận thêm một SQL so với số lượt đọc nghiệp vụ dự kiến là 4; bảng giữ nguyên số
đo thay vì bỏ mẫu đó. Warmup ở startup mất 4.294 ms trong lượt đo; ba readiness
request sau warmup còn 254–276 ms.

Raw comparison: `.artifacts/performance/navigation-compact-comparison-details.json`.
Tái lập bằng:

```sh
pnpm --filter @remarket/api exec tsx scripts/benchmark-navigation.ts navigation-compact-comparison --compare-navigation --warm-pool
node apps/api/scripts/verify-isolated.mjs --navigation-only
node apps/api/scripts/verify-isolated.mjs --browser-only --chat-badge-only
```

Integration PostgreSQL mới kiểm tra parity với các endpoint cũ, scope người
dùng, incoming/outgoing/read/private messages, thay đổi giỏ hàng, tài khoản khóa,
session bị thu hồi và visibility profile/category sau thay đổi. Test dùng schema
riêng và tự dọn. Deploy API mới trước hoặc đồng thời với web/mobile mới vì header
bắt đầu gọi endpoint bổ sung; không cần migration ứng dụng cho bản cập nhật này.

Kiểm chứng cập nhật: 493 unit/UI/contract test theo các workspace đã pass (web
213, API 216, mobile 26, shared 20, api-client 18); 48 DB integration test skip
trong lượt mặc định. Hai integration test navigation/profile đã pass riêng trên
PostgreSQL và schema đã dọn. Typecheck, lint, build API/web và export Android/iOS
pass. Một lượt test web chạy cùng build có UI timeout; toàn bộ 38 file test web
đã chạy lại với `--maxWorkers=2` và pass, gồm test race/read mới.

Chrome/API thật: 9 kiểm tra responsive pass, gồm badge ngoài trang inbox,
WebSocket message, loại trừ tin outgoing/private, đánh dấu đã đọc từng thread
và xóa badge sau reload; không có uncaught exception hoặc response 5xx. Report:
`.artifacts/member-smoke/results-chat-badge.json`. Smoke verifier chờ sự kiện
WebSocket riêng vì notification có thể cập nhật count trước khi outbox phát
message event tiếp theo. Sau bài chạy cuối, cleanup gặp lỗi mở connection
P1001; đã dọn riêng đúng schema vừa tạo và xác nhận namespace không còn tồn tại.

## Kiểm tra lại lần mở đầu trên localhost

Người dùng xác nhận vấn đề còn lại xảy ra trên localhost. Bài đo navigation ở
trên là API warm; không bao gồm tải mã Vite hay khôi phục phiên sau reload.

Đã sửa thêm ba nguyên nhân:

- Bootstrap một phiên hợp lệ trước đây đọc candidate rồi mở interactive
  transaction, lấy khóa và commit: 4 lượt SQL. Nay một statement PostgreSQL
  tìm credential và khóa theo đúng thứ tự User → Session → AuthToken, trả về
  trạng thái hiện tại. Đây là implicit transaction, không cache quyền/session
  và không xoay hoặc gia hạn cookie. Credential nghi replay/mismatch vẫn được
  kiểm tra lại trong explicit transaction trước khi thu hồi và ghi outbox.
- Trang public và các query danh mục ở shell/footer chờ bootstrap xác định
  danh tính trước khi lấy dữ liệu. Tránh lấy dưới guest rồi bị xóa cache và tải
  lại dưới tài khoản thật. Layout và mã trang vẫn tải trong lúc bootstrap chạy.
- Lần kết nối realtime đầu giữ kết quả vừa fetch trong lần mount hiện tại,
  chỉ revalidate cache cũ chưa được cập nhật. Reconnect và các sự kiện nghiệp
  vụ vẫn invalidate bình thường. Vite biên dịch trước entry, Home và Search
  trong lúc dev server khởi động để giảm import waterfall cho người mở đầu.

Đo read-only trên cùng database Supabase, pool HTTP 2, jobs tắt. Chỉ lấy khóa
đọc trạng thái các session hiện có, không login/rotate hay sửa dữ liệu ứng dụng:

| Đọc trạng thái bootstrap | Cũ | Mới |
| --- | --- | --- |
| SQL mỗi lượt | 4 | 1 |
| Lần đầu query shape | 3.030 ms | 503 ms |
| Ba mẫu warm | 1.012 / 1.048 / 1.141 ms | 266 / 262 / 329 ms |
| Median warm | 1.048 ms | 266 ms |

Đây là phép đo phần đọc database của bootstrap, không phải toàn bộ trang. Mẫu
đầu chịu thêm mở connection/prepare và không suy ra cold connection biến mất.
Raw: `.artifacts/performance/bootstrap-first-load-details.json`.

Chrome mới, viewport 1440×1024, guest, HTTP cache tắt, API và Vite khởi động
riêng trên port 5390/5391. Hai lượt dưới đây đều đã có bản sửa bootstrap/query;
khác biệt là bật Vite warmup. API đã listen trước khi bắt đầu đồng hồ navigation:

| Trang chủ mở lần đầu | Chưa warmup Vite | Có warmup Vite |
| --- | --- | --- |
| Bắt đầu gọi API từ navigation | 2.550 ms | 723 ms |
| Dữ liệu trang sẵn sàng | 4.294 ms | 2.579 ms |
| Ảnh trong viewport tải xong | 5.837 ms | 4.536 ms |

Mỗi lượt chỉ có một bootstrap, một categories và một products request. Không
có lỗi UI hoặc ảnh hỏng. Mở trực tiếp `/products` tiếp theo trong browser cùng
profile, nhưng vẫn tắt HTTP cache: dữ liệu 4.238 → 3.595 ms. Đây là hai mẫu
local, không phải median hoặc cam kết tốc độ cho mọi máy/trang; lượt sản phẩm
còn chịu ảnh đang tải, pool nhỏ và prepare query mới. Raw đầy đủ gồm thời gian
startup riêng và resource timing tại
`.artifacts/performance/first-load-vite-{before,after}-browser.json`.

Giới hạn còn lại: DB vẫn ở xa máy local; ảnh database miss cache vẫn lấy bytes
qua cùng pool HTTP. Lần khởi động API vẫn cần mở kết nối (bài đo pool khoảng
4,27 giây), nên mở browser khi API chưa listen vẫn phải chờ startup. Warmup
chuyển phần biên dịch sang startup, không biến Vite dev thành production build.
Không tăng pool, đổi region hoặc dời storage trong đợt sửa này.

Kiểm chứng: 218 test web và 224 test API pass; 50 DB integration test skip ở
lượt API mặc định. Chạy riêng 6 test auth lifecycle trên schema PostgreSQL tách
biệt và đã dọn schema. Trong đó có bootstrap lặp lại không consume cookie,
concurrent refresh/logout, đổi role/status trong transaction và credential bị
consume trong lúc bootstrap chờ khóa. Typecheck/lint API và web, build API và
web pass. Test UI mới kiểm tra tránh guest fetch và cập nhật khi socket reconnect.

Tái lập:

```sh
pnpm --filter @remarket/api exec tsx scripts/benchmark-navigation.ts bootstrap-first-load --bootstrap --warm-pool
node scripts/benchmark-first-load.mjs first-load
node apps/api/scripts/verify-isolated.mjs --auth-only
```

Sau khi cập nhật, khởi động lại `pnpm dev` để API và Vite nhận cấu hình mới,
đợi dòng `ReMarket API listening`, rồi reload trang để kiểm tra lần khôi phục
phiên đầu. Browser benchmark dùng guest mới; tốc độ bootstrap thành viên được
đo riêng ở bảng trên, không gộp hai phép đo thành một kết quả end-to-end.

## Tối ưu tiếp sau phản hồi vẫn chậm

Đã xác minh thêm ba nguyên nhân bằng database và Chrome thật:

- Native engine Prisma 5.22 với `pgbouncer=true` gửi `BEGIN`, `DEALLOCATE`,
  `SELECT`, `COMMIT` cho một query. Đo SELECT 1 warm trên transaction pool:
  1.254–1.307 ms. Session pool nhanh hơn nhưng có lúc trả `EMAXCONNSESSION`,
  giới hạn 15 client; không tăng pool hoặc ngắt session của người dùng khác.
- Raw query trả enum PostgreSQL khiến client phải lấy metadata type ở lần
  đầu. Probe cùng connection: enum native 1.354 ms, cast text 511 ms; các lượt
  sau đều khoảng 252–254 ms. Query catalogue, category và refresh locks nay
  cast output enum sang text; filter vẫn so sánh enum trong database.
- Cả 10 ảnh được trang chủ live tham chiếu lúc kiểm tra đều trả 404. Browser
  thử variant rồi ảnh gốc, tạo thêm request và chiếm pool dù cuối cùng chỉ có
  placeholder. Các số “ảnh tải xong” ở phần trước thực chất có thể gồm ảnh lỗi
  đã bị component thay bằng placeholder; không được hiểu là ảnh thật đã decode.

Thay đổi đã áp dụng:

- Thêm tùy chọn `DATABASE_DRIVER_ADAPTER=pg`, dùng `@prisma/adapter-pg@5.22.0`
  và `pg@8.23.1`. Giữ Prisma 5.22 và giới hạn HTTP 2 + background 1. Adapter
  gửi query không đặt tên nên tránh compatibility wrapper của native engine.
  Bootstrap/refresh, transaction và các kiểm tra quyền không bị cache.
- Đã bật adapter pg cho `apps/api/.env` local và chọn transaction URL sẵn có
  (`DATABASE_USE_DIRECT_URL=false`). Mặc định trong mã vẫn là `native` để môi
  trường khác chỉ đổi khi chủ động cấu hình. Không deploy hoặc sửa remote env.
- CA Supabase công khai nằm trong `apps/api/certs/`, fingerprint đã đối chiếu.
  Driver vẫn xác minh certificate/hostname, không dùng `rejectUnauthorized:false`.
  Non-public schema qua session/direct được set và kiểm tra trước khi query;
  shared transaction URL với schema khác public bị từ chối để tránh nhầm bảng.
  Nguồn: [Supabase SSL](https://supabase.com/docs/guides/platform/ssl-enforcement),
  [adapter source đúng phiên bản](https://github.com/prisma/prisma/blob/5.22.0/packages/adapter-pg/src/pg.ts).
- Pool có lifecycle riêng: idle timeout 60 giây, bounded max, đóng pool khi
  shutdown và bỏ client đã đóng khỏi global dev cache. Giữ pool job/relay riêng.
- Variant ảnh được chọn cùng original fallback trong một SQL, gộp các request
  đến gần nhau thành nhóm tối đa 4 sau 5 ms. Chỉ một query ảnh batch chạy cùng
  lúc để không chiếm hết pool. Hàng đợi tối đa 128; cache byte vẫn 32 MiB/60s,
  invalidation bao gồm variant đang dùng fallback khi ghi/xóa object. Chữ ký,
  visibility và expiry vẫn kiểm tra trước mỗi lần đọc byte/cache.
- Catalogue kiểm tra existence StorageObject trong chính query đang lấy trang,
  không lấy BLOB vào JSON. Nếu không có bytes thì kiểm tra file legacy đọc được
  ở máy local; nếu cả hai đều thiếu, trả `image_url:null` để render placeholder
  ngay. Không xóa metadata/ảnh, không cache availability; file phục hồi xuất hiện
  lại ở lần lấy catalogue tiếp theo. Ảnh có bytes vẫn giữ gateway và decode thật.
- Search đăng ký query danh sách trước các query bộ lọc để ưu tiên nội dung.

Kết quả đo local:

| Bài đo | Kết quả |
| --- | --- |
| pg adapter, SELECT 1 warm | 252 / 252 / 255 ms; 1 SQL/lượt |
| Mở pool pg trước listen | khoảng 2,0–2,1 giây trong probe |
| Burst 8 ảnh thật, cold byte cache | 2 SQL, 2.851 ms, 110.008 bytes |
| Cùng 8 ảnh, cache byte warm | 0 SQL, 13 ms |
| Native đường đọc cũ cùng 8 ảnh | 8 SQL, 7.121 ms; khác thời điểm mạng |

Không suy ra phần trăm từ burst cũ/mới vì mạng/provider biến động. Probe batch
8 ban đầu mất 5.130 ms, nên đã giảm nhóm xuống 4 để hạn chế head-of-line wait.
Raw: `image-burst-legacy-details.json`, `image-burst-pg-details.json`,
`image-burst-final-details.json`, `enum-first-query-details.json` trong
`.artifacts/performance/`. Script `benchmark-pg-adapter.ts` còn đối chiếu bytes
pg trực tiếp với bytes trả qua Prisma và xác minh Date/Decimal/enum/rollback.

Chrome profile mới, HTTP cache tắt, API đã listen; Vite dev, viewport 1440×1024:

| Trạng thái | Trang | Dữ liệu sẵn sàng | Ảnh/placeholder sẵn sàng |
| --- | --- | --- | --- |
| Guest, dữ liệu live hiện có | `/` | 1.546 ms | 1.552 ms, 10 placeholder |
| Guest, dữ liệu live hiện có | `/products` | 1.110 ms | 1.116 ms, 12 placeholder |
| Thành viên, fixture có 4 ảnh thật | `/` | 1.660 ms | 1.990 ms, 4 ảnh HTTP 200 |
| Thành viên, fixture có 4 ảnh thật | `/products` | 1.871 ms | 1.877 ms, 4 ảnh HTTP 200 |

Live guest không tạo dữ liệu; fixture member chỉ tạo trong schema do harness
sở hữu và đã dọn. Member được login trước phép đo rồi full navigation để buộc
bootstrap từ httpOnly cookie. Mỗi trang chỉ 1 bootstrap + 1 products request;
access token đã khôi phục, không placeholder thay ảnh thật, không uncaught JS
exception hoặc 5xx. Raw `first-load-final-browser.json` và
`first-load-member-browser.json`. Đây là mẫu local, không median/p95. Phần
startup được ghi riêng; `/products` là navigation tiếp theo trong cùng profile.

Kiểm chứng cho đợt này: 240 unit/contract API pass, 218 test web đã pass toàn bộ
ở lần trước; sau thay đổi thứ tự Search, 4 test Search/InitialLoad pass riêng.
Typecheck/lint/build API và web pass. Suite PostgreSQL adapter pg ban đầu pass
49/50; test relay còn lại tự giữ cả hai connection rồi đợi query thứ ba trên
cùng pool. Đã sửa observer/relay test dùng pool background giống production,
không tăng pool để làm test qua. Lượt performance riêng pass 9/9, gồm test relay
đó, shared storage, search và test image availability mới. Tổng cộng cả 51 ca
PostgreSQL hiện có đã được kiểm chứng qua các lượt này; không tuyên bố một lượt
full suite 51/51. Các schema đều được dọn sau từng lượt.

Tái lập:

```sh
pnpm --filter @remarket/api exec tsx scripts/benchmark-pg-adapter.ts
pnpm --filter @remarket/api exec tsx scripts/benchmark-navigation.ts image-burst-final --image-burst --warm-pool
node scripts/benchmark-first-load.mjs first-load-final
node apps/api/scripts/verify-isolated.mjs --driver-pg
node apps/api/scripts/verify-isolated.mjs --performance-only --driver-pg
node apps/api/scripts/verify-isolated.mjs --first-load --driver-pg
```

Giới hạn: tốc độ vẫn phụ thuộc mạng đến Supabase Sydney; cold API vẫn phải TLS
connect trước listen. Driver adapter Prisma 5 là preview đã bật sẵn trong schema;
không nâng ORM trong lần này. Bật native lại bằng env nếu cần rollback. Vite dev
vẫn phục vụ khoảng 96–99 module nguồn, production chunk chính còn khoảng 537 kB
(157 kB gzip); không dùng các con số localhost như cam kết production.
