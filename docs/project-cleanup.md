# Project cleanup

## 26/10/2026

Quét 575 file được Git quản lý (492 file JavaScript/TypeScript), đối chiếu
import/export, entry point, cấu hình, dependency và nội dung trùng lặp trên
web, API, mobile, shared và api-client.

- Gỡ 4 module endpoint web cũ: `admin`, `catalog`, `commerce`, `communication`.
  Web và mobile tiếp tục dùng implementation duy nhất trong `packages/api-client`.
- Gỡ hook `useUnreadMessageCount` không còn người gọi và `ShellContext` không
  còn consumer; bỏ wrapper tương ứng trong `RootLayout`.
- Gỡ helper không được dùng ở web/API và các policy mua hàng/phiên cũ trong
  shared. Giữ policy đang dùng, guards và quyền do API trả về.
- Gỡ `eslint-plugin-react-refresh`: rule duy nhất đã bị tắt. Lockfile được
  cập nhật bằng pnpm 11.9, không đổi phiên bản dependency còn lại.
- Sinh lại response contract theo OpenAPI: bỏ `tracking_code` dư trong
  `OrderActionInput`; trường này vẫn có trong thông tin giao hàng trả về.
  Lệnh `contracts:check` chấp nhận cả CRLF và LF trên Windows/Linux.
- Cập nhật các tài liệu còn trỏ đến module đã gỡ.

Dọn **14.230 file, 422.076.269 bytes (~402,5 MiB dữ liệu logic)** trong cache
pnpm không hoạt động tại project, hai thư mục dependency tạm và sáu profile
Chrome kiểm thử cũ. Đã xác minh đường dẫn nằm trong workspace, không có
reparse point và không có tiến trình sử dụng các profile. Store đang dùng
`D:/.pnpm-store/v11`, dependencies hoạt động, `.env`, uploads, database,
migrations, tài liệu gốc và ảnh/báo cáo kiểm thử được giữ.

Hai route Expo `sell.tsx` và `edit-product/[id].tsx` cùng re-export một form
là entry point cần thiết, nên giữ cả hai. Sau dọn, import graph chỉ còn ba
module runtime không có import đến là các entry point API, worker và web.
Các type/domain contract và UI kit dùng chung vẫn được giữ.

| Kiểm chứng sau dọn | Kết quả |
|---|---|
| `pnpm typecheck` | Cả 5 package pass |
| `pnpm lint` | Cả 5 package pass |
| `pnpm test -- --maxWorkers=1 --no-file-parallelism` | **641 pass**, 58 integration tests skip do chưa cấu hình `TEST_DATABASE_URL` |
| `pnpm build` | API, web, Android/iOS export pass |
| `pnpm --filter @remarket/api contracts:check` | Pass |
| OpenAPI contract tests / shared tests sau sinh lại contract | 6 / 23 pass |
| `pnpm install --offline --frozen-lockfile --ignore-scripts` | Pass |
| `git -c core.safecrlf=false diff --check` | Pass |

Không chạy database integration hoặc browser E2E trong lượt này. Vite vẫn
cảnh báo main chunk lớn hơn 500 kB; một số test React có cảnh báo `act()`
đã xuất hiện ở lượt chạy nền. Log và manifest cache đã xóa nằm trong
`.artifacts/cleanup-2026-10-26/`. Chưa commit hoặc push.

## 09/10/2026 (lịch sử)

Đã audit workspace, source graph của web/API/shared, scripts, CI, cấu hình
package manager và Prisma trước khi xóa danh sách được người dùng xác nhận.
Không xóa mã runtime hoặc thay đổi chức năng ứng dụng.

### Dữ liệu đã dọn

- Lockfile/metadata npm dư: `package-lock.json`, `node_modules/.package-lock.json`;
  workspace sử dụng pnpm và giữ nguyên `pnpm-lock.yaml`.
- Prisma scaffold cũ tại root: `prisma7.config.ts`, `prisma/`; giữ schema và
  migrations đang dùng tại `apps/api/prisma` với Prisma 5.22.
- `.artifacts/`: workspace kiểm chứng tạm, snapshots và kết quả browser cũ.
  Các scripts smoke hiện có vẫn được giữ và có thể tạo lại artifacts.
- `.pnpm-store/` trong workspace không còn dùng. Store đang dùng tại
  `D:/.pnpm-store/v11` được giữ nguyên.
- Bốn engine cũ trong `apps/api/.prisma/` và bản engine `.tmp27416` chưa hoàn tất;
  giữ client và engine hoạt động trong pnpm virtual store.
- Cache `.cache`, `.vite`, `.vite-temp` trong danh sách audit và output
  `apps/api/dist/`, `apps/web/dist/`. Đã dọn lại output/cache sau khi kiểm chứng.

Tổng lần dọn chính: **14.749 files, 415.218.202 bytes (~396 MiB)** dữ liệu logic.
Ước tính bytes không có hardlink khác là 186.738.129 (~178 MiB); dung lượng
đĩa thực tế thu hồi có thể khác do hardlink, compression và filesystem.
Danh sách từng đường dẫn, lý do và số liệu tại
[project-cleanup.json](project-cleanup.json).

### Dữ liệu được giữ

Đối chiếu sau lần dọn chính xác nhận SHA-256 của **14.134 files** giữ lại không
đổi và **1.343 junctions** dependencies vẫn trỏ đúng đích. Source, tests,
dependencies hoạt động, `.env`, uploads, schema/migrations, tài liệu,
scripts, CI và bộ rules/skills được giữ.

Source graph không phát hiện module runtime thừa để xóa. Fixture
`apps/api/tests/fixtures/browser-seed.ts` được giữ vì script kiểm thử gọi động.
Các exports/UI primitives dùng chung được giữ theo contract và UI spec.

Một test contract còn đọc đường dẫn frontend cũ sau refactor:
`apps/api/tests/contract/openapi.test.ts` nay đọc các modules trong
`apps/web/src/services/` để kiểm tra HTTP method/path. Giữ nguyên assertions;
không sửa logic runtime. README và báo cáo cấu trúc được cập nhật đường dẫn.

### Kiểm chứng

| Lệnh | Kết quả |
|---|---|
| `pnpm -r test -- --maxWorkers=1 --no-file-parallelism` | Shared 17, API 142, web 178: **337 pass**; 23 tests PostgreSQL skip |
| `pnpm -r typecheck` | Shared, API và web pass |
| `pnpm -r lint` | Shared, API và web pass |
| `pnpm -r build` | API và web pass; web 266 modules |
| `pnpm --filter @remarket/api exec prisma validate --schema prisma/schema.prisma` | Schema hợp lệ sau cleanup |
| `git -c core.safecrlf=false diff --check` | Pass |

Tests chạy với `TEST_DATABASE_URL` trống và `GOMAXPROCS=1` trong shell kiểm
chứng; không đổi cấu hình ứng dụng. Không chạy tests cần PostgreSQL hoặc
browser E2E trong lượt cleanup. Typecheck/lint pass trước khi xóa; toàn bộ
tests, build và Prisma validate pass sau khi xóa.

Output `dist/` đã được dọn sau build; tạo lại bằng `pnpm build` trước khi dùng
production start. Cache sẽ được công cụ tạo lại khi cần. Các thay đổi có sẵn
trong workspace được giữ; chưa commit hoặc push.
