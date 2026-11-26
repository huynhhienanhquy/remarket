# Audit tải dữ liệu ReMarket ngày 19/11/2026

Web dùng React/Vite và React Router, mobile dùng Expo, cả hai dùng TanStack Query và API client chung. Express đọc PostgreSQL qua Prisma. Khảo sát callsite tải dữ liệu trên web và mobile, các route đọc và ghi của API, rồi đo các GET thường dùng theo nhóm khách, thành viên và quản trị viên trước khi chọn điểm tối ưu.

## Điểm nghẽn và cách xử lý

| Luồng | Quan sát | Thay đổi |
| --- | --- | --- |
| Giỏ hàng | Đọc danh mục, các dòng giỏ, tổng số và uy tín người bán qua nhiều lượt SQL. Prisma nạp đầy đủ hồ sơ người bán và mọi ảnh của sản phẩm. | Đọc một snapshot cho tối đa 50 dòng, tổng số đầy đủ, ảnh đầu tiên, danh mục hợp lệ và uy tín. POST kiểm tra sản phẩm với projection hẹp và trả snapshot giỏ mới sau khi ghi. |
| Thông báo | Trang dữ liệu, tổng theo bộ lọc và tổng chưa đọc cần ba câu SQL sau xác thực. | Gộp vào một snapshot gồm cả dữ liệu và metadata. Kiểm thử thứ tự chưa đọc trước, lọc theo loại, tổng số và trang vượt phạm vi. |
| Mua ngay trên web và mobile | Mỗi màn hình lưu riêng cùng một chi tiết sản phẩm, khiến luồng chuyển từ chi tiết sang mua ngay gọi lại GET dù kết quả còn mới. | Hai màn hình dùng chung khóa TanStack Query và cùng ánh xạ dữ liệu sang giỏ một món. Dữ liệu quá hạn hoặc bị vô hiệu hóa được kiểm tra lại khi vào checkout. Cache tuân theo vòng đời phiên hiện có và checkout kiểm tra giá, phí cùng trạng thái sản phẩm ở server. |
| Khu vực ở checkout web | Form và tóm tắt đơn phải đợi danh sách tỉnh thành. | Hiển thị form và tóm tắt khi có dữ liệu hàng hóa. Ô khu vực hiển thị trạng thái tải và bật khi có danh sách. |
| Danh mục trên web | Header và footer đăng ký tải danh mục ngay cả khi trang chi tiết không có thanh danh mục và footer ở ngoài vùng nhìn. | Header tải trên trang có thanh danh mục. Footer chi tiết chỉ tải khi vào vùng nhìn, dùng cùng cache danh mục 5 phút. |

### Các luồng đã rà soát

- Khám phá và tìm kiếm dùng route lazy trên web, phân trang và lọc ở API. Các lookup danh mục và tỉnh thành dùng cache riêng. Danh sách sản phẩm và các snapshot chi tiết, tin của tôi, hồ sơ người bán và yêu thích đã đọc theo projection tại PostgreSQL.
- Session bootstrap chạy trước các query cần xác định người xem. Client chung quản lý retry phiên và hủy được query web khi điều hướng. API tiếp tục kiểm tra phiên mỗi request cần xác thực. Catalog, giỏ, tồn kho và thông báo tuân theo cơ chế invalidation của từng luồng.
- Chat tải lịch sử theo cursor và có đường cập nhật qua Socket.IO kèm polling khi mất kết nối trên web. Hỗ trợ, thông báo và hàng đợi quản trị tiếp tục dùng polling theo màn hình. Badge tổng hợp dùng endpoint riêng để tránh tải danh sách đầy đủ.
- Các danh sách chính được giới hạn hoặc phân trang. Trên web, route và mã AI được tải động. Checkout là đường render phụ thuộc dữ liệu độc lập đã được kiểm tra trong đợt này.

## Benchmark API

Supertest gọi Express cục bộ, nối cùng PostgreSQL/Supabase qua adapter `pg`, transaction pooler cổng 6543, pool 2 và tắt background jobs. Lệnh chạy GET/SELECT với các phiên đã hoạt động. Hai lượt có cùng số bản ghi và kích thước response. Loại mẫu đầu của từng endpoint rồi lấy median của năm mẫu còn lại, gồm cả ngoại lệ 2.896 ms ở Giỏ hàng trước thay đổi.

| Endpoint | SQL/request trước → sau | Median HTTP trước → sau | Median tổng thời gian câu SQL theo Prisma | Response body |
| --- | ---: | ---: | ---: | ---: |
| `GET /cart`, giỏ 3 món | 5 → 2 | 907 → 526 ms (−42%) | 1.271 → 519 ms | 3.357 byte ở cả hai lượt |
| `GET /notifications`, 36 thông báo | 4 → 2 | 580 → 392 ms (−32%) | 984 → 387 ms | 9.280 byte ở cả hai lượt |

Một câu SQL trong mỗi request sau tối ưu là xác thực phiên. Tổng thời gian theo Prisma gồm độ trễ kết nối, có thể vượt HTTP elapsed khi câu SQL chạy song song. `SELECT 1` sau khi warm pool mất 187–221 ms qua HTTP ở hai lượt đo, trong khi PostgreSQL báo 0,023–0,056 ms thực thi. Baseline khảo sát rộng ghi nhận `GET /orders` ở 880 ms và `GET /admin/dashboard` ở 835 ms, cùng 4 câu SQL và mỗi endpoint có một mẫu.

```powershell
pnpm --filter @remarket/api exec tsx scripts/benchmark-navigation.ts audit-nov-target-after --cart-notifications --pg-adapter --transaction-url --warm-pool
```

Số liệu gốc nằm trong `.artifacts/performance/audit-nov-before.json` và `.artifacts/performance/audit-nov-target-{before,after}.json` cùng các file `-details.json`.

## Benchmark trình duyệt

Chrome headless chạy hai build Vite production trên localhost, tắt browser cache, dùng cùng fixture có phiên thành viên và độ trễ HTTP cố định. Mỗi build có một lượt warm-up và năm lượt đo xen kẽ. Lượt chạy mở chi tiết sản phẩm rồi nhấn **Mua ngay**. Số request và byte lấy từ Resource Timing qua lúc danh sách khu vực đã tải.

| Median | Trước | Sau |
| --- | ---: | ---: |
| TTFB của document | 5 ms | 5 ms |
| LCP trước thao tác đầu | 192 ms | 184 ms |
| Từ mở trang đến khi hiện tên sản phẩm | 619 ms | 620 ms |
| Từ nhấn Mua ngay đến khi hiện form | 745 ms | 41 ms |
| Từ nhấn Mua ngay đến khi thấy tùy chọn khu vực | 745 ms | 744 ms |
| Độ trễ click theo Event Timing | 24 ms | 24 ms |
| Tổng request HTTP theo Resource Timing | 32 | 31 |
| Tổng byte truyền theo Resource Timing | 665.993 | 665.240 |
| API request và byte truyền | 7 / 4.886 | 6 / 3.565 |

Mức cải thiện quan sát được tập trung vào thời điểm form sẵn sàng và số request. Kết quả LCP/TTFB dùng cho đối chiếu cục bộ. Cần dữ liệu người dùng thực để đánh giá INP production, và cần một lượt đo riêng trên thiết bị Expo. Chi tiết phép đo nằm trong `.artifacts/performance/audit-nov-checkout-browser.json`, với runner `audit-nov-checkout-browser.mjs` cùng thư mục.

## Kiểm chứng

- Lint, typecheck toàn monorepo, build Express, Vite production và Expo export iOS/Android đều thành công.
- Suite mặc định sau khi giới hạn worker chạy qua 315 test API, 291 test web, 42 test mobile và 41 test ở hai package dùng chung. Suite API mặc định bỏ qua 65 ca cần PostgreSQL. Hai lượt PostgreSQL dưới đây chạy riêng 17 ca liên quan.
- 17 test web trực tiếp cho tải dữ liệu và checkout. Kiểm tra chia sẻ cache còn mới, chờ revalidate khi quá hạn, footer danh mục, form sẵn sàng trong khi tỉnh thành đang tải, giá/phí và idempotency.
- 17 test PostgreSQL trong hai schema kiểm thử riêng đã được dọn. Các ca liên quan kiểm tra ảnh đại diện sản phẩm trong giỏ, dữ liệu tin bị chặn, giỏ rỗng, giới hạn 50 món khi thêm đồng thời, thứ tự và phân trang thông báo, khóa và thu hồi phiên.

## File thay đổi

| Nhóm | File |
| --- | --- |
| API | `apps/api/src/routes/cart.ts`, `apps/api/src/routes/notifications.ts`, `apps/api/src/shared/cart-reads.ts`, `apps/api/src/shared/product-reads.ts`, `apps/api/src/services/category-policy.ts` |
| Web | `apps/web/src/components/Footer/Footer.tsx`, `apps/web/src/layouts/MarketplaceShell/MarketplaceShell.tsx`, `apps/web/src/pages/CheckoutPage/CheckoutPage.tsx`, `apps/web/src/pages/CheckoutPage/hooks/useCheckout.ts` |
| Mobile | `apps/mobile/src/app/products/[id].tsx`, `apps/mobile/src/features/checkout-screen.tsx`, `apps/mobile/src/services/marketplace.ts` |
| Shared | `packages/shared/src/checkout.ts`, `packages/shared/src/index.ts` |
| Benchmark và hồi quy | `apps/api/scripts/benchmark-navigation.ts`, `apps/api/tests/integration/navigation.test.ts`, `apps/web/src/config/route/__tests__/PageDataLoading.test.tsx` |

## Việc còn lại

- Mở rộng mẫu đo cho Đơn hàng và Dashboard quản trị. Với Đơn hàng, cần xem riêng chi phí tải quan hệ, tổng số và uy tín đối tác sau khi lấy trang dữ liệu.
- Đo p95 ở môi trường deploy để tách độ trễ mạng API–database, thời gian SQL và thời gian khởi động. Dùng dữ liệu có nhiều thông báo để kiểm tra kế hoạch thực thi trước khi cân nhắc index.
- Build web vẫn báo một số chunk phụ thuộc AI lớn. Cần đo lần mở AI đầu tiên trước khi chọn cách chia chunk tiếp theo.
