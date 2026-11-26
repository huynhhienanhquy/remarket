# Rà soát và dọn code — 17/11/2026

Phạm vi gồm API, web, mobile Expo, shared, api-client, tests, scripts và cấu
hình workspace. Sau dọn có 505 file JS/TS trong các thư mục ứng dụng/package/script,
không tính dependencies, uploads và output build. Các thay đổi có sẵn trong
working tree được giữ lại.

## Code không dùng

- Xóa `HeroArt.tsx` và `FormRow.tsx`: không còn import hoặc entry point sử dụng.
- Xóa ba script chẩn đoán tạm `check-session.ts`, `check-user.ts`, `dbstate.cjs`:
  không có lệnh package, tài liệu vận hành, CI hoặc script khác gọi đến. Các CLI
  benchmark/diagnostic đang dùng và script tạo schema kiểm thử được giữ.
- Xóa helper `fieldMessages.ts` sau khi chuyển ba form auth sang `apiFieldErrors`.
  Hàm dùng chung chấp nhận cả lỗi đã normalize và `details.fields`, bỏ giá trị
  không phải chuỗi, chuỗi rỗng và mảng.
- Bỏ `CompactHeader` web không có consumer, alias `UploadsApi` riêng của web,
  alias `codes` và nhánh đăng ký không thể chạy: contract trả về
  `pending_verification: true`, nên đăng ký luôn chuyển đến xác minh email.
- Thu hẹp **57 export/type export** không có consumer bên ngoài module. Các
  hàm, schema và type còn dùng nội bộ vẫn tồn tại dưới dạng khai báo local.
  Bỏ default export Prisma trùng với named export.
- Bỏ dependency trực tiếp `expo-device` và `@prisma/engines`. Prisma CLI vẫn
  giữ engine 5.22 qua dependency của chính nó. Lockfile không nâng phiên bản
  package còn lại; `ua-parser-js` cũng được gỡ vì chỉ được `expo-device` dùng.

Các icon không được import riêng vẫn có trong registry `Icon name=...`; chỉ
bỏ named export thừa của chúng. Các route Expo, API/worker, CLI, fixture gọi
qua child process và DTO/generated contracts được đối chiếu như điểm vào.

## Phần trùng lặp đã gộp

| Khu vực | Implementation dùng chung |
| --- | --- |
| Login/register/reset password | `useValidatedField`: draft, touched, blur và submit validation |
| Password controls ở ba form auth | `PasswordField`: label/helper/error/ref và liên kết accessibility |
| Lỗi field của mọi form web | `apiFieldErrors` |
| Ba guard private trên web | Một hook chờ phiên và chuyển đến login; policy mỗi guard giữ nguyên |
| Bảy danh sách quản trị API | `adminListFields` và `moderationListFields`; schema vẫn strict |
| Bộ lọc trên sáu trang admin mobile | `AdminFilter`: lựa chọn “Tất cả” và reset trang; search/advanced filters cũng tự reset trang |
| Tạo/di chuyển danh mục | Đọc parent có lock và kiểm tra parent nhận danh mục con |
| Cập nhật profile/avatar | Một helper lock và đọc lại trạng thái tài khoản trước khi ghi |
| Handshake/revalidation realtime | Một mapper `SocketIdentity`, giữ giới hạn expiry token/session |

Không bỏ kiểm tra trạng thái trước/sau transaction: đọc lại sau lock chống
race với kiểm duyệt/khóa tài khoản. Các handler sản phẩm có thứ tự lỗi và quy
tắc chuyển trạng thái riêng, nên vẫn giữ các bước kiểm tra tại đúng thời điểm.

## Phân tích tĩnh và cách chạy lại

`knip.jsonc` khai báo các CLI và fixture được gọi động, cùng ngoại lệ hẹp cho
dependency được plugin suy diễn từ cấu hình Expo/Vitest nhưng chưa tích hợp.
Không ignore thư mục source. Bật `noUnusedLocals` và `noUnusedParameters` cho
toàn bộ workspace, kể cả mobile dùng tsconfig Expo riêng.

```sh
pnpm dlx knip@6.45.1 --include-entry-exports
pnpm typecheck
pnpm lint
pnpm --filter @remarket/api contracts:check
git -c core.safecrlf=false diff --check
```

Knip cuối trả về `issues: []`. Lượt rà soát duplicate dùng jscpd 5.4.3 trên
source API/web/mobile/packages/scripts; bỏ dependencies, output, uploads,
tests và code/dataset sinh tự động. Với ngưỡng 12 dòng/100 token, báo cáo ban
đầu có ba clone. Quét bổ sung bỏ comment, đổi tên biến/literal và so cấu trúc
hàm được dùng để tìm các nhóm cần gộp nêu trên.

```sh
pnpm dlx jscpd@5.4.3 apps packages scripts --ignore '**/node_modules/**,**/dist/**,**/uploads/**,**/*.test.*,**/response-contracts.ts,**/provinces.ts,**/prisma/**' --min-lines 12 --min-tokens 100 --reporters json --output .artifacts/cleanup/duplicates-final --silent
```

Với cùng ngưỡng này, lượt cuối có **0 clone** trong 357 file được công cụ đọc.

Ở ngưỡng nhỏ hơn 8 dòng/65 token, lượt cuối còn tám đoạn báo giống nhau:
ba nhóm import, bốn khung JSX sử dụng component/filter/card chung và một
khung transaction sản phẩm cần kiểm tra lại trạng thái. Đây là kết quả phân
loại thủ công sau khi đọc source, không phải tuyên bố mọi dòng code đều khác
nhau. Không tạo barrel hoặc abstraction riêng chỉ để giấu các đoạn import
và lời gọi component khỏi công cụ.

Báo cáo local nằm trong `.artifacts/cleanup/`: `knip-configured-before.json`,
`knip-final.json`, `duplicates-before/`, `duplicates-after/`,
`structural-before/`, `exact-final/`. Công cụ được chạy tạm qua `pnpm dlx`,
không thêm dependency tooling vào ứng dụng.

## Kiểm chứng

- **668 test thường pass**: shared 23, api-client 18, API 312, mobile 36, web 279.
  Lệnh: `pnpm -r test --testTimeout=15000`. Timeout 15 giây dành cho lượt chạy
  kiểm tra, không đổi timeout trong cấu hình Vitest. 65 test PostgreSQL được
  chạy riêng bằng schema tạm thay vì dùng database ứng dụng.
- **65/65 test tích hợp PostgreSQL pass** ở 14 file qua
  `node apps/api/scripts/verify-isolated.mjs --driver-pg`, bao gồm auth,
  checkout đồng thời, kiểm duyệt, danh mục, ảnh, chat/realtime, mobile và AI.
  Schema kiểm thử tạm đã được dọn. Tổng cộng **733 test pass** khi cộng hai lượt kiểm tra.
- Test bổ sung kiểm tra touched field, xác nhận theo mật khẩu vừa sửa, focus
  field lỗi, nút hiện mật khẩu và payload lỗi field không hợp lệ.
- Typecheck, lint, response-contract check và whitespace check pass.
- Build API/web và export mobile Android/iOS pass qua `pnpm build`.
- `pnpm install --frozen-lockfile --ignore-scripts --config.confirmModulesPurge=false`
  thành công sau khi đồng bộ dependencies. Không chạy lifecycle scripts khi dọn.

Build web vẫn có các chunk dependency AI lớn. Không deploy hoặc đo hiệu năng
trên thiết bị thật trong đợt dọn code này.
