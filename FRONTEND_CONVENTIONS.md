# Frontend screen conventions (ui-spec)

Read `ui-spec.md` and `detail-project.md` in the repo root before writing any
screen. This file only records the conventions already established in code so
new screens match them.

## Where things live

- `apps/web/src/components/ui/**` — the shared kit (Button, FormField, Input,
  Textarea, Select, Radio, Checkbox, MoneyInput, SearchInput, StatusBadge,
  ProductCard, UserSummary, SectionCard, Tabs, Pagination, EmptyState,
  InlineAlert, Dialog (+ConfirmDialog), Drawer, Skeleton, ImageViewer,
  OrderTimeline, DataTable, Toast, icons). **Do not edit these files** — if you
  need a variant, compose them in your own screen or in
  `components/features/`.
- `apps/web/src/components/features/**` — cross-screen modals
  (`ReportDialog.tsx` exists; add `ReviewDialog.tsx` here when needed).
- `apps/web/src/lib/api/index.ts` — `api` is the single data entry point.
  Never call `fetch` directly from a screen; use the HTTP API adapter.
- `apps/web/src/lib/errors.ts` — `ApiError`, `isApiError`, `errorTitle`.
- `apps/web/src/lib/queryClient.ts` — `queryKeys` for every query. Reuse the
  existing keys; add one only for a genuinely new entity.
- `apps/web/src/app/SessionProvider.tsx` — `useSession()` →
  `{ viewer, status, refresh, login, register, logout, expire }`.
- `apps/web/src/app/guards.tsx` — `loginPathFor(pathname, search)` returns the
  internal-only login URL with `returnTo`. Always use it for "login then come
  back" flows; never build `returnTo` by hand.
- `apps/web/src/app/shells/ShellContext.tsx` — `useShellTitle(title)` sets the
  compact mobile header title for deep task pages.

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

- Private pages are already wrapped by `RequireAuth` in `app/router.tsx`; a
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
- Icons: import from `../components/ui` (24px viewBox, 20px default). Give
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
