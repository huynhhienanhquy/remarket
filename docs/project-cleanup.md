# Project cleanup — 09/10/2026

Đã audit workspace, source graph của web/API/shared, scripts, CI, cấu hình
package manager và Prisma trước khi xóa danh sách được người dùng xác nhận.
Không xóa mã runtime hoặc thay đổi chức năng ứng dụng.

## Dữ liệu đã dọn

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

## Dữ liệu được giữ

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

## Kiểm chứng

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
