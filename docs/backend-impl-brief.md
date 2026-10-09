# ReMarket backend — implementation brief (internal)

Reference order when anything conflicts (`docs/backend-detail.md` §1):

1. `detail-project.md` — permissions, security, transactions, lifecycle.
2. `packages/shared/src/dto.ts` — response shapes.
3. `apps/web/src/services/httpAdapter.ts` + `services/endpoints/` — URL + method actually called.
4. `apps/web/src/tests/` — UI behaviour verified through the HTTP adapter.

## Non-negotiable rules

- **Never spread a Prisma model** into a response. Always go through a mapper in
  `src/shared/dto-mappers.ts`.
- DTO keys are `snake_case`; Prisma fields are `camelCase`.
- Money is a decimal **string** of VND integers (`product.price.toString()`),
  dates are ISO 8601 (`toISOString()`).
- Every response uses `ok(...)` / `okList(...)` — never `res.json({success...})`.
- Validation with `zod` `.strict()`; input trimmed; no mass assignment (whitelist fields).
- Vietnamese user-facing messages, UTF-8, no mojibake.
- No `any`; `verbatimModuleSyntax` is on → type-only imports need `import type`.
- All Prisma/service imports keep the `.js` extension (`../shared/errors.js`).

## Building blocks

### Envelope — `src/shared/api-response.ts`

```ts
ok(res, data, status?)            // { success, data, meta:{request_id} }
okList(res, items, pageMeta)      // { success, data:{ items, meta }, meta }
```

### Pagination — `src/shared/pagination.ts`

```ts
parsePaging(req.query)  // -> { page, page_size }  default 20, max 100
pageMeta(paging, total) // -> { page, page_size, total, total_pages }
offsetOf(paging)        // -> skip offset
```

### Errors — `src/shared/errors.ts` (all throw an `AppError`)

`validationError(msg, fields?)`, `unauthorized`, `forbidden`, `emailNotVerified`,
`accountLocked`, `notFound`, `productNotAvailable`, `priceChanged`,
`versionConflict`, `invalidTransition`, `orderExpired`, `reviewNotAllowed`,
`idempotencyConflict`, `retryLater`.

### Handlers — `src/middleware/errorHandler.ts`

```ts
router.get("/", asyncHandler(async (req, res) => { ... }));   // rejects go to errorHandler
throw new AppError(code, message, status, details?);
```

### Auth — `src/middleware/auth.ts`

| Middleware | Meaning |
|---|---|
| `authMiddleware` | mounted in `app.ts`; sets `req.user` + `req.sessionId`, 401 otherwise. LOCKED users pass. |
| `optionalAuth` | sets `req.user` when present, never rejects. |
| `requireRole("ADMIN")` | already applied to `/admin` in `app.ts`. |
| `requireActive` | blocks LOCKED accounts — use on marketplace mutations. |
| `requireVerified` | blocks LOCKED **and** unverified email — use on buy/chat/checkout. |

`req.user: { id, email, fullName, role, status, emailVerifiedAt }`.

### Mappers — `src/shared/dto-mappers.ts`

`toSessionUser`, `toSellerSummary`, `toPublicProfile`, `toAdminUserItem`,
`toCategoryNode`, `toProductListItem`, `toProductDetail`, `toOwnProduct`,
`toAdminProductItem`, `productCapabilities`, `ownProductActions`,
`toOrderListItem`, `toOrderDetail`, `orderAllowedActions`, `orderRole`,
`toConversationListItem`, `toMessage`, `toReview`, `toAdminReviewItem`,
`toReportRecord`, `toAdminReportItem`, `toNotification`,
`toSupportTicketListItem`, `toSupportTicketDetail`, `supportAllowedActions`,
`toAuditLogItem`, `iso`, `isoRequired`.

### Seller reputation — `src/shared/seller-aggregates.ts`

`loadSellerAggregates(ids)` / `loadSellerAggregate(id)` →
`{ rating: number|null, review_count, completed_sales_count }`.
**Batch** these per page — never call per row.

### Viewer/category helpers — `src/shared/viewer.ts`

```ts
viewerFrom(req)                 // base viewer fields for ViewerContext
buildProductContext(products, req)  // favourites + reputation for a whole page
loadCategoryChain(categoryId)   // { path, exists, active, isLeaf }
activeCategoryIds()             // Set of ids whose whole ancestor chain is ACTIVE
```

### Money — `src/shared/money.ts`

`money(decimal)`, `parseMoney(raw, label)`, `assertPositive`, `assertMax`,
`cmpMoney`, `sumMoney`, `MAX_PRODUCT_PRICE`, `MAX_SHIPPING_FEE`.

### Tokens — `src/shared/tokens.ts`

`signAccessToken(userId, sessionId)`, `verifyAccessToken`, `newRefreshToken`,
`newEmailToken`, `sha256`.

### Shared validation — `@remarket/shared`

`validateProductTitle`, `validateDescription`, `validatePriceInput`,
`validateUsageMonths`, `validateShippingFeeFor`, `validateReviewComment`,
`validateChatMessage`, `validateSupportSubject`, `validateSupportMessage`,
`validateReportDescription`, `validateFullName`, `validateEmail`,
`validatePhone`, `validatePassword`, `validatePasswordConfirm`, `utf8ByteLength`,
plus `PRODUCT_LIMITS`, `AUTH_LIMITS`, `REVIEW_LIMITS`, `REPORT_LIMITS`,
`CHAT_LIMITS`, `SUPPORT_LIMITS`, `MONEY_LIMITS`, `provinceLabel`, `API_ERROR_CODES`.

Each validator returns `string | null` (the message) — turn non-null into
`validationError(message, { field: message })`.

## Envelope shape expected by the frontend

```jsonc
// single resource
{ "success": true, "data": { ... }, "meta": { "request_id": "uuid" } }
// list  (ApiAdapter reads data.items / data.meta)
{ "success": true, "data": { "items": [], "meta": { "page":1,"page_size":20,"total":0,"total_pages":1 } },
  "meta": { "request_id": "uuid" } }
// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...",
    "details": { "fields": { "title": "..." } } },
  "meta": { "request_id": "uuid" } }
```

`apps/web/src/services/http.ts` unwraps `body.data`, so anything wrapped twice
breaks the UI.

## Endpoint list owned by each router

Mounted in `src/app.ts` under `/api/v1`:

| Mount | Router file |
|---|---|
| `/auth` | `routes/auth.ts` |
| `/categories` | `routes/categories.ts` |
| `/provinces` | `routes/provinces.ts` |
| `/products` and `/account/products` | `routes/products.ts` |
| `/users` | `routes/profiles.ts` |
| `/uploads` | `routes/uploads.ts` |
| `/favorites` | `routes/favorites.ts` |
| `/cart` | `routes/cart.ts` |
| `/checkout` | `routes/checkout.ts` |
| `/orders` (incl. `POST /:orderId/reviews`) | `routes/orders.ts` |
| `/conversations` | `routes/chat.ts` |
| `/reports` | `routes/reports.ts` |
| `/notifications` | `routes/notifications.ts` |
| `/support` | `routes/support.ts` |
| `/admin` | `routes/admin.ts` + `routes/admin*.ts` |

Note `routes/products.ts` is mounted **twice**: paths beginning `/account/...`
must be stripped before matching (handle `/account/products` explicitly and
delegate `mine` handling), or expose a dedicated `mine` handler keyed on the
mounted prefix. Simplest: export `productsRouter` for `/products` and a separate
`accountProductsRouter` for `/account/products` from the same file.
