# Performance check — 2026-10-07

Implemented: login returns server identity without a second HTTP identity read;
protected identity reads join Session/User without caching permissions;
refresh returns existing locked rows instead of reading them again;
outbox insert deduplicates in one statement; page modules load on demand;
admin logout immediately shows pending state and prevents duplicate clicks.
Session issuance and refresh's dependent writes are now single atomic SQL
statements. Dashboard counters are one parameterized aggregate snapshot.
The local persistent API explicitly uses the configured session-pooler URL
and a conservative two-connection pool. Default deployments keep DATABASE_URL.

## Verified work

- 198 tests passed; 14 database integration tests skipped without a disposable
  TEST_DATABASE_URL. Typecheck, lint and production builds passed.
- Real DB: refresh rotates atomically; replay of its old cookie revokes only
  the test session and invalidates its access token. Duplicate outbox insert
  preserves the first event ID and payload.
- Real DB fault injection: unique conflicts roll back issuance and rotation,
  leaving no orphan session or consumed old cookie. Concurrent refresh using
  one cookie succeeds only once and replay revokes the test session.
- Dashboard aggregates match the previous Prisma counters for a single-day,
  broad and empty-order period, including exact transaction value strings.
- Chrome: all eight admin screens return 200; a fresh
  admin request in the old tab after USER login clears private UI without
  replaying the denied operation under USER.

## Measurements and remaining issue

SQL statement counts include transaction statements. Query count reduction
is reliable; elapsed time is not yet stable across runs.

| API operation | Before statements | After statements |
| --- | ---: | ---: |
| Login + required identity request | 21 | 2 |
| Authenticated bootstrap | 17 | 7 |
| Dashboard including queues | 56 | 4 |
| Admin products | 19 | 3 |
| Logout | 17 | 6 |

Latest sequential API comparison (`baseline.json` vs `optimized-complete.json`):

| Operation | Before | After |
| --- | ---: | ---: |
| Login and required identity | 7.19 s | 1.59 s (no second identity request) |
| Authenticated bootstrap | 8.49 s | 4.37 s |
| Dashboard data and queues | 6.96 s | 1.19 s |
| Admin products | 4.99 s | 1.16 s |
| Admin categories | 3.87 s | 0.86 s |
| Admin reports | 3.09 s | 0.86 s |
| Logout commit | 5.05 s | 2.56 s |

The first final Chrome run measured navigation across all admin screens at
1.05–1.82 seconds, login through dashboard at 6.31 seconds, dashboard reload
at 5.54 seconds and logout at 3.19 seconds. A second run with warm connections
(`browser-final.json`) measured navigation at 1.02–1.53 seconds, login through
dashboard at 3.93 seconds, reload at 4.43 seconds, logout at 2.10 seconds and
USER login through the home shell at 2.18 seconds. These browser measurements
include page-module loading and rendering; API-stage timings do not. They
are observed development timings, not a promise of a fixed latency or SLA.

Initially warm SELECT 1 measured about 1.4 seconds on the transaction pooler
and 0.28 seconds on the session pooler. During an intermediate check, new connections
to **both** endpoints failed after about five seconds, independently of any
application query. This establishes a connection-path issue but does not
identify whether its source is network, pool capacity or provider availability.
Subsequent diagnostics resolved all three pooler IPs and opened TCP to both
ports successfully in 247–299 ms. Both Prisma connections then worked again;
warm session SELECT 1 measured 208–285 ms. Protocol tracing confirmed that
transaction-mode SELECT 1 uses BEGIN/DEALLOCATE/SELECT/COMMIT, while the selected
session connection needs only SELECT. Connection variability remains an
external latency factor; do not weaken session checks or retry mutations to
mask it. Session-pooler mode is appropriate for this persistent API; see
[Supabase's connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

Raw sanitized reports: `.artifacts/performance/baseline.json`, `final.json`,
`small-pool.json`, `verified.json`, `browser.json`, `connections.json`,
`connections-current.json`, `connections-recheck.json`, `connections-protocol.json`,
`optimized-complete.json`, `dashboard-parity.json`, `browser-final.json`, and
`security.json`. Reports are development-only
and contain no passwords, tokens or connection strings. See
`backend-runbook.md` for reproduction commands.

The existing Supabase DB was retained. No database was reset, migrated,
relocated or reseeded. Further infrastructure changes or a separate local
development DB are optional follow-up decisions, not changes made here.

## Code-only follow-up — 2026-10-08

The user explicitly selected **keep Supabase** and **keep jobs inside the API**.
No existing account, listing, order, database connection setting or bucket policy
was deleted, migrated or reseeded. Test migrations/fixtures ran only inside
random `remarket_verify_<32 hex>` schemas, which were removed afterwards.

Implemented:

- Removed the runtime mock adapter, its 19 source files, demo banner/accounts
  and emulator switches. Normal seed creates missing reference categories/provinces
  only. Synthetic fixtures remain test-only and cannot seed the application's schema.
- Public product search combines categories, filters, count/page, favorites and
  seller reputation into one parameterized SQL snapshot. No permission/category
  state is cached; blocked listings, locked sellers and inactive ancestor categories
  disappear on the next read. Hidden reviews do not contribute to ratings.
- Jobs, outbox delivery and realtime relay use a separate bounded Prisma client.
  The local HTTP pool remains 2; background defaults to 1, giving a combined budget
  of 3 per API process. `RUN_JOBS=auto` retains its original outside-test behavior.
- Bootstrap retains its transaction and User → Session → AuthToken row-lock order,
  combining locked reads into one SQL statement. No unlocked identity fast path,
  auth cache, token-validation removal or mutation retry was introduced.
- Authorized image URLs contain an opaque resource capability with a bounded
  signature/cache lifetime. Signed reads require no DB access; unsigned legacy
  reads retain the original resource policy. Favorites/chat without a fresh full
  public eligibility check retain legacy reads rather than minting public grants.
  Order/owner/admin image capabilities remain private, including order snapshots
  after a listing is hidden.
- New uploads produce 480px/card and 1600px/detail WebP files. Local legacy files
  generate derivatives lazily with coalesced, bounded work. Supabase legacy files
  fall back to originals; there is no bulk storage backfill. Reserved example-host
  images are omitted from responses/rendering without modifying stored data.

### Measurements

Same configured Supabase session connection, local HTTP pool 2; public benchmark
is read-only, without background jobs. Three sequential samples include a first
query/startup sample. Warm values below use the last two. Network/load differs
between runs, so observed times are not an SLA.

| Operation | Before | Code-only after |
| --- | --- | --- |
| Public products, SQL/request | 5 | 1 |
| Keyword products, SQL/request | 6 | 1 |
| Public products, warm | 958–1,607 ms | 283–285 ms |
| Keyword products, warm | 1,283–1,595 ms | 284–287 ms |
| Five concurrent products, all responses | 3,212–4,487 ms | 298–852 ms, warm pool |
| Authenticated bootstrap, SQL including transaction statements | 7 in prior report | 4 |
| Main startup JS, gzip | 150.16 kB with runtime mock | 144.30 kB |

The first parallel after-batch still had a 3,272 ms response while the second
connection opened (other responses 284–1,110 ms). A new connection still costs
seconds; the next parallel batch with both connections warm completed in
298–852 ms. Warm `SELECT 1`/readiness remains 279–282 ms versus process-only
liveness 2–3 ms. Keeping a remote DB means this network floor cannot be removed
by code changes alone; existing connection limits were not raised to conceal it.

Authenticated bootstrap measured 2,104 ms on the isolated seeded schema.
The earlier 4,370 ms result used a different run/data context; statement reduction
is reproducible, but this is not a strictly controlled latency comparison.

A generated 2000×1200 JPEG fixture measured original 955,335 bytes versus card
WebP 58,920 bytes (~94% smaller) and detail WebP 400,108 bytes. Local signed reads
used **zero SQL**. Card generation plus first response took 47 ms; subsequent
responses 5–6 ms. Detail first response took 195 ms; subsequent responses 7–12 ms.
These are local HTTP fixture measurements, not remote Supabase Storage/CDN timings.
The original fixture and its derivatives were cleaned up after measurement.

### Verification

- Typecheck, lint, production build and whitespace checks passed.
- 225 unit/UI/contract tests passed; the normal run skips the 19 DB integrations.
  All 19 DB integrations passed separately in an isolated schema; the expanded
  search test additionally verifies hidden/unhidden review aggregates and completed
  order counts, parameter escaping, paging totals and immediate moderation visibility.
- Real PostgreSQL fault injection passed: issuance/rotation rollback, concurrent
  refresh winner/replay revocation and durable outbox deduplication.
- 45 desktop/mobile browser checks passed through the real HTTP adapter, including
  upload → approval → checkout → delivery → review, live chat/read receipt and private
  order snapshot decoding after hiding the listing. No uncaught browser exceptions
  or 5xx responses. All test schemas and test uploads were removed.
- Image policy tests cover zero-query private/public reads, expiry/object/signature
  tampering, private-to-public scope changes, WebP dimensions, provider deadline cache,
  legacy derivative fallback, derivative cleanup and no public grants for unchecked
  saved/chat rows. Pool tests verify two independent clients and explicit 2+1 limits.

Sanitized reports: `.artifacts/performance/public-before.json`,
`public-query-after.json`, `public-code-final.json`, `supabase-code-final.json`,
`images-code-final.json`, `security.json` and `.artifacts/member-smoke/results.json`.
Reproduction commands and bounded cache/revocation limitations are documented in
`docs/backend-runbook.md`. No production worker-mode change is required.
