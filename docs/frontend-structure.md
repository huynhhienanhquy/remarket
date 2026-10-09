# Frontend structure

Refactor ngày 09/10/2026 theo cấu trúc `src/` và bảng trách nhiệm người dùng
chỉ định. Giữ nguyên logic, JSX, điều hướng, API, state, side effect và thay
đổi có sẵn trong workspace. Quy ước lâu dài tại
[FRONTEND_CONVENTIONS.md](../FRONTEND_CONVENTIONS.md).

## Cấu trúc thực tế

```text
apps/web/src/
├── App.tsx
├── main.tsx
├── assets/images/illustrations/HeroArt.tsx
├── components/
│   ├── common/<ComponentName>/<ComponentName>.tsx và tests hiện có
│   │   └── index.ts
│   ├── AccountPageHeader/, ConversationList/, ReportDialog/
│   ├── MarketplaceHeader/MarketplaceHeader.tsx, components/
│   ├── SessionExpiryWatcher/, Logo/, Footer/, MobileBottomNav/
│   └── admin/<ComponentName>/<ComponentName>.tsx
├── config/
│   ├── environment.ts, queryClient.ts
│   └── route/router.tsx, guards.tsx, navigation configs, __tests__/
├── constants/queryKeys.ts
├── contexts/SessionContext.tsx, RealtimeContext.tsx, ShellContext.tsx, __tests__/
├── data/authBenefits.ts
├── helpers/errors.ts, adminErrors.ts, fieldMessages.ts
├── hooks/useConnectivity.ts, useUnreadCounts.ts, useUnreadMessageCount.ts, useAdminParams.ts
├── layouts/
│   ├── RootLayout/RootLayout.tsx
│   ├── AccountShell/AccountShell.tsx, AccountNavigation.test.tsx
│   ├── AdminShell/AdminShell.tsx, AdminNavigation.test.tsx
│   └── AuthShell/, ChatShell/, MarketplaceShell/
├── pages/<PageName>/
│   ├── <PageName>.tsx và tests hiện có
│   ├── sections/ khi có UI riêng
│   └── hooks/ và helpers/config riêng khi cần
├── services/api.ts, http.ts, httpAdapter.ts, endpoints/, __tests__/
├── stores/sessionStore.ts, sessionScope.ts
├── styles/globals.css, typography.css
├── tests/setup.ts, test-data.ts, http-context.ts, renderMemberPage.tsx
│   └── admin-pages.test.tsx, email-verification.test.tsx
├── types/api.ts
└── utils/urlPage.ts, adminParams.ts
```

32 trang nằm trực tiếp dưới `pages/<PageName>/`. 172/180 file nguồn được
chuyển; 660 import/export/dynamic import/mock cập nhật theo module đích đã
resolve từ mã gốc. Tách thêm `RootLayout` và dữ liệu tĩnh `BENEFITS`, giữ
nguyên thân khai báo. Không còn tầng route-area, `app/`, `lib/`,
`components/ui/` hoặc `components/features/`.

## Ánh xạ trách nhiệm

| Trách nhiệm | Nơi chứa mã hiện tại |
|---|---|
| Tài nguyên hình ảnh | `assets/images/illustrations/HeroArt.tsx`: SVG inline hiện có |
| UI primitive dùng chung | `components/common/<ComponentName>/` |
| Component nghiệp vụ dùng lại | `components/<FeatureName>/`, `components/admin/` |
| Environment, query client, route/navigation config | `config/`, `config/route/` |
| Giá trị query key bất biến | `constants/queryKeys.ts` |
| Global React providers | `contexts/` |
| Dữ liệu tĩnh | `data/authBenefits.ts` |
| Helper phụ thuộc nghiệp vụ | `helpers/` |
| Hook dùng chung | `hooks/` |
| Shell/layout | `layouts/<LayoutName>/` |
| Route screen và phần riêng | `pages/<PageName>/`, `sections/`, `hooks/` |
| HTTP transport và typed endpoint | `services/`, `services/endpoints/` |
| Session identity/revision/listeners và scope theo tab | `stores/` |
| Global CSS | `styles/` |
| Interface frontend dùng chung | `types/api.ts` |
| Hàm thuần xử lý URL | `utils/` |

Các tên UserCard, ThemeContext, cartStore, font/avatar, form configs và stories
trong mẫu minh họa trách nhiệm. Không thêm chức năng, tài nguyên giả, thư mục
rỗng hoặc dependency. Artwork giữ nguyên React SVG để không đổi markup/ARIA.
Design tokens vẫn dùng Tailwind; shared DTO/enum/validation vẫn dùng
`packages/shared`. Store dùng cơ chế session hiện có, không đổi sang Zustand.

## Đối chiếu hành vi

Snapshot trước lượt chuyển thư mục được đối chiếu độc lập với mã hiện tại:
178 module TypeScript, 711 top-level statement và từng dependency binding
có AST giống nhau sau khi quy đường dẫn về module gốc. Hai khai báo được
tách có thân và dependencies giống trước refactor. Hai stylesheet giữ
nguyên từng byte, chỉ đổi `index.css` thành `globals.css` và cập nhật import.

Kiểm tra cấu trúc xác nhận cả 15 thư mục trách nhiệm có mã thực tế, đủ 32
trang với entry point tương ứng, common component cùng thư mục với tests,
và không còn file nguồn ở cấu trúc cũ. Không bỏ assertion/test workflow nào.

Hai script smoke member/session chỉ đổi URL import thành `/src/services/*`
và `/src/stores/sessionStore.ts`, được đối chiếu riêng với bản chụp từng
script. Tài liệu frontend/UI/backend cập nhật tham chiếu đường dẫn mới.

Đã đọc toàn bộ 25 rules. Yêu cầu trực tiếp của người dùng ưu tiên hơn
convention thư mục cũ và convention đã được cập nhật tương ứng. Rules về
state/accessibility/security được dùng để giữ invariant đang có. Backend,
database, dependency, deployment và hành vi sản phẩm không thuộc refactor.

## Kiểm chứng

- Baseline: `pnpm --filter @remarket/web test` — 32 file / 178 test pass.
- `node .artifacts/verify-web-standard-layout.cjs` — pass đối chiếu AST,
  imports, CSS, cấu trúc và thay đổi path của smoke scripts.
- Sau chuyển file: `pnpm --filter @remarket/web test -- --pool=threads
  --maxWorkers=1 --no-file-parallelism` — 32 file / 178 test pass.
- Test tập trung qua Vitest trực tiếp: route guards 36 test; contexts,
  services và layouts 66 test; tất cả pass.
- `pnpm --filter @remarket/web typecheck` — app và cấu hình Vite pass,
  không có diagnostic.
- `pnpm --filter @remarket/web lint` — `eslint .`, không có diagnostic.
- `pnpm --filter @remarket/web build` — 266 modules transformed,
  built in 9.10s. CSS vẫn là `index-BcmPmpbF.css`, 38.86 kB.
- `git -c core.safecrlf=false diff --check` — không có output.

Các lượt test đầu sau chuyển file gặp Node/esbuild out-of-memory lúc máy
gần hết virtual memory, trước khi thực thi test. Sau khi tài nguyên khả dụng
tăng, chạy trực tiếp và chạy lại toàn bộ test với một worker đều pass.
Giới hạn worker/bộ nhớ chỉ áp dụng trong shell kiểm tra, không thay cấu hình
test hoặc mã ứng dụng để né lỗi.

Snapshot/script đối chiếu trong `.artifacts/` đã được xóa trong lượt cleanup
ngày 09/10/2026; kết quả đối chiếu phía trên ghi nhận lượt refactor đã hoàn tất.
Tests, typecheck, lint và build vẫn chạy qua các lệnh pnpm của workspace.
Xem [báo cáo cleanup](project-cleanup.md) để biết kết quả kiểm tra sau khi xóa.
Chưa chạy browser smoke/E2E trên API hoặc screen reader trực tiếp trong lượt
refactor này.
