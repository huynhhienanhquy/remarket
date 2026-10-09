# Frontend screen conventions (ui-spec)

Read `ui-spec.md` and `detail-project.md` in the repo root before writing any
screen. This file only records the conventions already established in code so
new screens match them.

## Where things live

- `apps/web/src/App.tsx` and `main.tsx` — Vite/React entry points. Keep them
  at the source root.
- `apps/web/src/assets/**` — static visual assets. The existing inline SVG
  hero illustration lives in `images/illustrations/HeroArt.tsx`; preserve its
  SVG markup and accessibility. Add fonts/images only when the app uses them.
- `apps/web/src/components/common/<ComponentName>/<ComponentName>.tsx` — the
  shared UI kit, with existing tests beside each component. `common/index.ts`
  exposes the kit's unchanged public exports. Keep the behavior and markup
  unchanged during structural refactors; compose variants in a screen or
  reusable feature rather than duplicating primitives.
- `apps/web/src/components/<FeatureName>/**` — reusable composites such as
  `AccountPageHeader`, `ConversationList`, `MarketplaceHeader`, `ReportDialog`,
  `Logo`, `Footer`, `MobileBottomNav` and `SessionExpiryWatcher`.
  Shared admin table/toolbar UI lives in `components/admin/<ComponentName>/`.
- `apps/web/src/config/**` — environment and query-client settings;
  `config/route/` owns the router, guards and account/admin navigation config.
- `apps/web/src/constants/queryKeys.ts` — immutable query keys; preserve their
  values. They are also re-exported from `config/queryClient.ts`.
- `apps/web/src/contexts/**` — session, realtime and shell React providers.
  Provider order and lifecycle remain unchanged. Provider tests live in
  `contexts/__tests__/`.
- `apps/web/src/data/**` — static application data, such as auth benefit copy.
  HTTP test fixtures remain in `tests/`; runtime data comes from the API.
- `apps/web/src/helpers/**` — application/domain helpers: API error titles,
  auth field-message parsing and admin error formatting.
- `apps/web/src/hooks/**` — shared custom hooks: browser connectivity,
  unread counts and admin URL parameters. Keep single-page hooks local.
- `apps/web/src/layouts/<LayoutName>/<LayoutName>.tsx` — composed root and
  route shells, with navigation tests next to the owning shell. The router
  mounts `RootLayout` inside routing so toast links and session expiry work.
- `apps/web/src/pages/<PageName>/<PageName>.tsx` — route screens. Put a screen's
  tests alongside it. Keep components used by only that screen in `sections/`,
  such as `SearchPage/sections/FilterPanel.tsx` and
  `ProductFormPage/sections/ProductImageUpload.tsx`. Single-screen helpers stay
  local, for example `AdminDashboardPage/dateRange.ts`.
- `pages/<PageName>/hooks/use*.ts` — route-local data, form state,
  validation, mutations and lifecycle work for large screens. The route or its
  existing child component calls the hook once, unconditionally, before the
  original loading/error/render branches. Hooks return data and handlers, never
  rendered JSX. Preserve effect dependencies, callback order, retry identifiers
  and the parent component's keys when extracting logic.
- `apps/web/src/services/api.ts` — `api` is the single data entry point.
  Never call `fetch` directly from a screen; use the HTTP API adapter.
- `apps/web/src/services/endpoints/**` — typed HTTP endpoint implementations
  grouped into auth, catalog, commerce, communication and admin. `httpAdapter.ts`
  assembles those objects; `http.ts` continues to own transport/session behavior,
  and `types/api.ts` defines the frontend API contract. Service tests belong in
  `services/__tests__/`.
- `apps/web/src/stores/**` — existing session identity/revision/listeners and
  per-tab scope. Keep tokens, cookie coordination and HTTP transport in
  `services/http.ts`; retain the current memory/storage behavior.
- `apps/web/src/types/api.ts` — frontend-specific interfaces. Shared DTOs,
  enums and validation remain in `packages/shared`; do not duplicate them.
- `apps/web/src/utils/**` — pure generic helpers. `urlPage.ts` is the strict
  pagination parser; `adminParams.ts` retains admin's different parsing rules.
- `apps/web/src/contexts/SessionContext.tsx` — `useSession()` →
  `{ viewer, status, refresh, login, register, logout, expire }`.
- `apps/web/src/config/route/guards.tsx` — `loginPathFor(pathname, search)` returns the
  internal-only login URL with `returnTo`. Always use it for "login then come
  back" flows; never build `returnTo` by hand.
- `apps/web/src/contexts/ShellContext.tsx` — `useShellTitle(title)` sets the
  compact mobile header title for deep task pages.
- `apps/web/src/styles/**` — global styles and typography.
- `apps/web/src/tests/**` — common test setup, HTTP fixtures and tests spanning
  multiple route areas. Test-only data must stay out of runtime modules.
  `renderMemberPage.tsx` provides the shared route/session harness for adjacent
  page tests. Existing HTTP workflow cases stay alongside their owning page.

These placements implement the user's requested standard `src/` layout and
responsibility mapping. The explicit structural refactor supersedes the
previous `app/`, `lib/`, `components/ui/`, `components/features/` and route-area
placements. Every standard folder contains existing application code; do not
add empty subfolders, fake assets, duplicated DTOs or a new state library.

## Stack rules

- React function components + hooks. React Query v5 (`useQuery`, `useMutation`,
  `keepPreviousData`). react-router-dom v7 (`Link`, `useNavigate`,
  `useSearchParams`, `useParams`).
- TypeScript strict — no `any`, no `as` casts of API data.
- Vietnamese UI copy. No emoji.

## Data + state rules (ui-spec 1, 24, 25)

- Only fields present on the DTOs in `packages/shared/src/dto.ts` may render.
  If the field isn't on the type, it doesn't exist — do not invent it.
- Money is a decimal **string**; format with `formatVnd()` from
  `@remarket/shared`. Never `Number(price).toLocaleString`.
- Dates: `formatDate`, `formatDateTime`, `formatRelative` from
  `@remarket/shared`. Relative labels only in metadata; use `<time dateTime>`
  for the machine-readable value.
- Every screen implements: loading (skeleton matching final layout), empty
  (`EmptyState`), error (`InlineAlert` with a "Tải lại" action), success toast,
  field errors from `ApiError.fields`, and offline/network via
  `error.isNetwork`.
- Mutations: `loading` on the submit Button, `disabled` to block double
  submit. On success invalidate the affected query keys.
- Never fabricate counts, ratings, badges or timestamps.

## Routing + guards

- Private pages are already wrapped by `RequireAuth` in `config/route/router.tsx`; a
  page can assume `viewer` exists (use `useSession()!.viewer`).
- Guest actions inside a private flow still need `loginPathFor(...)`.
- Locked accounts: only orders/support/notifications routes are reachable
  (handled by the guard). Show the account-state banner from ui-spec 24 where
  the spec asks for it.

## Styling

- Tokens from `tailwind.config.js`: `page`, `surface`, `surface-subtle`, `ink`,
  `muted`, `brand`, `brand-hover`, `brand-soft`, `line`, `input-line`, `accent`,
  `warning-bg`, `danger`, `danger-bg`, `info`, `info-bg`, `focus`; radii
  `rounded-control|card|modal`; z-index `section|header|action-bar|overlay|
  dialog|toast`.
- Typography: `t-hero`, `t-h1`, `t-h2`, `t-h3`, `t-body`, `t-label`, `t-meta`,
  `t-price-card`, `t-price-detail` from `src/styles/typography.css`.
  **`t-*` classes are unlayered CSS, so a `font-*` utility will NOT override
  their weight** — use `text-sm text-base` + `font-semibold` instead of
  `t-label font-semibold` when you need a heavier weight.
- Layout: `.rm-container` (max 1280px, responsive padding), `.rm-section`
  (vertical rhythm), `.rm-safe-bottom` (fixed bottom bars), `.rm-skeleton`.
- Breakpoints: `sm` 640, `lg` 1024, `xl` 1280. Touch targets ≥44px
  (`min-h-[44px]`, `h-11 w-11`).
- Icons: import from `@/components/common` (24px viewBox, 20px default). Give
  icon-only buttons an `aria-label`.
- Light mode only.

## API environment

Every screen uses the real HTTP API configured by `VITE_API_BASE_URL`.
There is no demo mode or fixture fallback. Test responses belong only in test
files; browser-test seed data is restricted to an isolated test schema.

## Before you report done

Run from `D:\remarket`:

```
pnpm --filter @remarket/web exec tsc -p tsconfig.json --noEmit
```

It must be silent (exit 0). Also run `pnpm --filter @remarket/web test` if you
added tests. Report exactly which commands you ran and their output.
