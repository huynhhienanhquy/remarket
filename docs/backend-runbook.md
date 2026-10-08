# ReMarket backend runbook

## Admin email verification

User submits their own email from `/verify-email` and returns home; only an
ACTIVE admin can approve the existing request at `/admin/email-verifications`.
This is manual admin attestation, not automatic proof of mailbox ownership.
Legacy email links submit the same request and cannot bypass admin approval.
Existing verified accounts remain verified; no pending requests are backfilled.

Migration `20261008000000_admin_email_verification` adds a nullable request
timestamp, an index and two notification enum values without deleting data.
Run `pnpm --filter @remarket/api prisma:deploy` followed by `prisma:generate`
using the canonical schema in `apps/api/prisma`, then restart the API/worker.
Do not use database reset or seed on the application's database.

Requests and approvals use user-row locks, durable notifications, audit and
outbox in one transaction. Retries do not create duplicate approvals. Approval
changes only email verification, never role, password or account lock state.
The web refreshes capabilities via Socket.IO, with a 15-second visible/online
REST fallback for unverified users. Queue badges/list also poll every 15 seconds.

Safe regression command from repo root:
`node apps/api/scripts/verify-isolated.mjs --browser --email-only`.
It migrates and tests a uniquely owned temporary schema, runs Chrome/live API
against private test ports, then removes only its test schema/profile/uploads.

## Runtime baseline

- Node.js 22, pnpm 11.9, PostgreSQL 16.
- API: `apps/api`; web: `apps/web`; shared contracts: `packages/shared`.
- Copy `.env.example` to `.env` and replace every sample secret. Production boot fails until the JWT key, web origins/public URL, SMTP settings and Supabase Storage settings are complete.
- Development defaults to `STORAGE_DRIVER=local`. Production requires `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, a server-only service-role key and a private `STORAGE_BUCKET`.

The Prisma datasource uses `DATABASE_URL` for application traffic and `DIRECT_URL` for migration traffic by default. A persistent API may explicitly set `DATABASE_USE_DIRECT_URL=true` to reuse its verified direct/session-pooler connection; `DIRECT_URL` must point to the same database. `DATABASE_CONNECTION_LIMIT` defaults to 5 for the HTTP pool (an explicit URL `connection_limit` takes precedence). Jobs/outbox/realtime use a separate client with `BACKGROUND_DATABASE_CONNECTION_LIMIT=1`; this overrides the inherited URL's limit. Optional `BACKGROUND_DATABASE_URL` must point to the same logical database/schema, otherwise it defaults to the selected API URL. Budget the sum of HTTP and background limits across API instances and any dedicated worker against the provider's limit. The current local HTTP limit stays 2, so the API's combined budget is 3. Keep the default transaction-pooler connection for serverless deployments. Use separate test, staging and production databases. Never run a reset against staging or production.

## First setup

All accounts use `/login`. Login returns the authenticated `user` with the access
token; the web app uses this server identity without an additional `/auth/me`
request. Refresh and legacy email verification return the same identity/token shape. Deploy API and web changes together. It routes `ADMIN/ACTIVE` to `/admin`, `USER/ACTIVE` to the marketplace (or a
permitted internal return target), and locked accounts to restricted routes.
Admin APIs independently enforce role and account state.

Initial cookie discovery uses `POST /auth/bootstrap`: a guest/expired session
returns 200 with null user/token, whereas database failures remain errors.
Parallel bootstrap calls share one in-flight discovery. Protected 401/socket
recovery shares one actual `/auth/refresh` rotation per tab. Bootstrap
validates the existing cookie without consuming it, setting a replacement or
extending its lifetime; interrupted navigations cannot lose the session between
database rotation and receipt of Set-Cookie. Explicit `/auth/refresh` still
rotates atomically and retains strict 401 and replay-revocation semantics.

Login, verification, reset, logout, bootstrap and refresh use the same browser
Web Lock and local queue. Late responses are checked again after JSON parsing;
credential actions invalidate earlier in-flight discoveries and private work.
BroadcastChannel sends only an opaque sender id and a cookie-change hint (never
tokens or identity), ignores its own tab, and causes other tabs to discard stale
memory/cache and discover the current server identity. Focus/online/visibility
revalidation is the fallback when messaging is unavailable. Web Locks require a
secure context (HTTPS or localhost); browsers without that API serialize only
within one tab, so target-browser multi-tab verification is required.

Login rechecks the password hash and identity under a User lock after bcrypt.
Logout-all uses User -> Session -> AuthToken, like refresh and password reset.
Current-session logout is idempotent and can revoke its cookie session after
access JWT expiry; a mismatched live bearer/cookie returns SESSION_CHANGED.
Password reset clears frontend memory and private caches on success only. A
reset-link token is removed from the address bar and retained only in memory.
Auth/protected responses use Cache-Control: no-store. Refresh reuse revokes only
the affected device/session; logout-all/reset intentionally revoke every device.

Restored identities and `/auth/me` update the React session immediately. A user,
role, status or email-verification change clears private query caches; old
responses and mutations are not replayed in the new account context. Admin
`FORBIDDEN`/`ACCOUNT_LOCKED` responses share one identity recheck without retrying
the denied operation. Private UI is hidden during that check, and a server
failure keeps it hidden behind the retry panel rather than treating it as guest.
An unchanged ADMIN remains on the original error state without a refetch loop.

For a real-browser regression check with dedicated test accounts and
running API/web, use `node scripts/smoke-session-recovery.mjs` (Chrome must be
installed; `CHROME_BIN` can select its path). It creates a separate temporary
browser profile, verifies the admin API pages, then switches to USER in a second
tab and checks recovery of the stale admin tab. It changes no roles/listings;
test-session login/logout is the only application write. Screenshots are written
to `.artifacts/session-recovery`, and timings to `.artifacts/performance/browser.json`.

For integration plus multi-tab Chrome checks without touching app records, run
`node apps/api/scripts/verify-isolated.mjs --auth-browser` from the repo root.
It owns a fresh remarket_verify_* schema, ephemeral accounts/server ports/browser
profile, and removes that schema after completion. No application user password
or role is changed.

## Performance checks

Routes load their page modules on demand. Prisma 5.22 uses the `relationJoins`
preview feature to combine related session/user and list DTO reads, rather than
many network round trips. Run `prisma:generate` after changing the generator;
this feature requires no database migration. Identity is still re-read from the
database for every protected request: there is no role, status or revocation
cache. Bootstrap returns rows from its existing User → Session → AuthToken
locks instead of fetching them again, preserving the global lock order and
replay detection without rotating during discovery. Explicit refresh retains
atomic rotation. Logout immediately displays its pending state
and rejects duplicate clicks while the server commits revocation.

Dashboard counters use one parameterized aggregate statement with the same
inclusive Vietnam date bounds, deleted-product exclusion and exact decimal
transaction value. Queues still use normal Prisma relation DTO reads. Run the
read-only parity check below to compare against the previous aggregates for
single-day, broad and empty-order date ranges.

Session issuance combines its Session/AuthToken inserts into one atomic SQL
statement. Refresh keeps the User → Session → AuthToken lock order and validation
checks, then combines only the dependent writes into one statement inside the
existing transaction. The security check injects unique conflicts into its own
test session to verify rollback and exercises concurrent old-cookie refreshes.

From the repository root, set BENCHMARK_ADMIN_EMAIL/BENCHMARK_ADMIN_PASSWORD for the API benchmark and SMOKE_ADMIN_EMAIL/SMOKE_ADMIN_PASSWORD plus SMOKE_USER_EMAIL/SMOKE_USER_PASSWORD for browser recovery. Use dedicated test accounts:

```text
pnpm --filter @remarket/api exec tsx scripts/benchmark-performance.ts connections
pnpm --filter @remarket/api exec tsx scripts/benchmark-performance.ts verified
pnpm --filter @remarket/api exec tsx scripts/benchmark-performance.ts security
pnpm --filter @remarket/api exec tsx scripts/verify-dashboard-metrics.ts
node scripts/smoke-session-recovery.mjs
```

The first command only runs `SELECT 1` against configured connections. The API
benchmark uses the real app without background jobs and logs sanitized timings
and SQL statement counts (including transaction statements), never credentials
or tokens. Login/logout creates or revokes only its own test session. The security
mode replays its own rotated cookie and confirms session/access revocation. JSON
reports are under `.artifacts/performance`. Latency varies with the remote DB and
connection warm-up; page data timing is separate from authenticated bootstrap,
and a full browser reload includes both. Do not run the destructive integration
suite on the operational DB; use a disposable `TEST_DATABASE_URL` instead.

Additional code-only checks (no operator credentials required):

```text
pnpm --filter @remarket/api exec tsx scripts/benchmark-public.ts public-code-final
pnpm --filter @remarket/api exec tsx scripts/benchmark-images.ts
node apps/api/scripts/verify-isolated.mjs --browser-only --benchmark
node apps/api/scripts/verify-isolated.mjs --search-only
```

The public benchmark only reads existing tables, uses the configured HTTP pool,
and measures both the initial and warm parallel batch. The image benchmark uses
and cleans up its own filesystem fixture, without writing application tables.
The isolated harness creates a random test schema, migrates/seeds only that schema,
uses random test credentials and cleans up its own namespace/uploads. `--benchmark`
also measures bootstrap and verifies transactional refresh/replay fault cases.
Never substitute the application's schema for the isolated namespace.

Run timing checks sequentially, without a concurrent build or another DB
benchmark. Optional labels preserve separate browser reports, for example
`node scripts/smoke-session-recovery.mjs browser-final`. The smoke covers all
eight admin screens and USER login. Caches may legitimately serve a fresh list
without a request; its cross-tab recovery probe selects an uncached role filter
to verify the server rejects the old session before any private work is replayed.

Remote database latency can exceed Prisma's default five-second interactive
transaction limit. `DATABASE_TRANSACTION_TIMEOUT_MS` defaults to 30000 and
`DATABASE_TRANSACTION_MAX_WAIT_MS` to 10000; tune them for the deployment.
Transaction failures still roll back. Product version checks remain mandatory;
do not automatically replay moderation on 409.

```text
pnpm install --frozen-lockfile
pnpm --filter @remarket/api prisma:generate
pnpm --filter @remarket/api prisma:preflight
pnpm --filter @remarket/api prisma:deploy
pnpm --filter @remarket/api seed
pnpm --filter @remarket/api postman:generate
```

The preflight is read-only and checks existing rows against the foreign keys,
unique indexes and check constraints introduced by the repair migration. It
also runs safely before the baseline exists and after the repair migration has
already been applied. Stop the deployment and repair any reported rows before
`prisma:deploy`.

The normal seed only inserts missing categories and provinces; it preserves existing operator edits. It never creates users, products, orders or sample activity. Create the first administrator with `admin:create` below. Browser test fixtures live under `apps/api/tests/fixtures`, require NODE_ENV=test and an isolated `remarket_verify_*` namespace, and use a temporary random password generated by the harness.

Durable outbox enqueue uses `createMany({ skipDuplicates: true })` for a single
insert. The database's unique dedupe key keeps the first payload and delivery
state unchanged on replay. Enqueue failures still propagate and roll back the
surrounding business transaction; no event is published before commit.

## First administrator (operator-only)

On a migrated database with no admin, run from the repository root:

```text
pnpm --filter @remarket/api admin:create --email admin@example.com --name "Tên quản trị viên" --confirm-create-first-admin
```

The operator must have database access and an interactive terminal. The command
loads the root `.env`, asks for a new password twice with input hidden, and
never accepts passwords as command-line arguments. It creates a verified,
active ADMIN and an `admin.bootstrap` audit entry in one serializable
transaction with a shared PostgreSQL advisory lock. It refuses if any ADMIN
already exists or the email belongs to an existing user; it cannot promote an
account. `--help` does not connect to the database. There is no public admin
registration endpoint; registration/profile payloads reject `role` and `status`.

## Admin dashboard and list semantics

Dashboard transaction value is the sum of `totalAmount` for COMPLETED orders
by `completedAt`, not platform revenue. New users are counted by `joinedAt`.
Product totals include every lifecycle status, exclude deleted listings, and
show blocked listings separately (blocking is a flag, not a lifecycle status).
Unresolved support tickets are OPEN or IN_PROGRESS; pending reports are PENDING.

All admin date filters accept valid `YYYY-MM-DD` days, inclusive in Vietnam
time (UTC+07). User/product/review dates filter creation; ticket dates filter
last update; report dates filter submission. Their actor filters use audit
actions for users/products/reviews, the report handler or ticket assignee.
Admin categories use `/admin/categories` (paged root groups, preserving the
whole two-level subtree) and `/admin/categories/tree` (full editor tree), both
including inactive categories. Category date/actor filters match audit events
because Category does not have creation timestamps. Public `/categories`
continues to omit inactive categories. Mutations refresh affected filtered
lists, dashboard and audit caches.

## Development

Run both services with `pnpm dev`, or use `pnpm dev:api` and `pnpm dev:web` separately.
The API loads `apps/api/.env`; Vite loads `apps/web/.env`. Only public `VITE_*`
values belong in the web environment. The canonical Prisma 5.22 schema and
migrations are under `apps/api/prisma`, not the legacy root Prisma files.

`RUN_JOBS=auto` starts background jobs in the API outside tests. To run a dedicated worker, set `RUN_JOBS=false` on the API process and run `pnpm --filter @remarket/api worker` separately. Do not run both modes unintentionally; DB leases make outbox delivery safe, but duplicate schedulers waste capacity.

Maintenance jobs use `WORKER_INTERVAL_MS` (60 seconds by default). Durable email/realtime events have a separate `OUTBOX_INTERVAL_MS` pump (one second by default), so notifications are not delayed by the maintenance cadence. Each API instance relays processed outbox rows from PostgreSQL to the Socket.IO connections it owns.

In non-production environments, verification/reset tokens are printed to the API console. In production, encrypted email jobs are written to the outbox and delivered through SMTP by the worker.

## Verification and production build

```text
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm -r build
```

The API build emits runnable JavaScript (including the shared workspace code) under `apps/api/dist`. Start it with:

```text
pnpm --filter @remarket/api start
pnpm --filter @remarket/api start:worker
```

The PostgreSQL integration suite runs only when `TEST_DATABASE_URL` is present. It must point to a disposable test database.

Alternatively, `node apps/api/scripts/verify-isolated.mjs` creates a new random
`remarket_verify_*` schema on the configured direct connection, verifies the
selected namespace, deploys migrations, runs integration tests, then removes
only that test schema. The database role must have schema creation privileges.
It never resets or seeds existing application tables.

Add `--browser` for integration plus live Chrome/adapter smoke, or use
`--browser-only` to run just migrations, isolated test fixtures and browser checks.
The smoke uses private ports 5320/5321 and separate Chrome contexts for buyer,
seller and admin. It refuses to reuse existing servers. It verifies responsive
pages and the live upload-to-review lifecycle; screenshots/results are written
under `.artifacts/member-smoke`. The harness stops its services and cleans its
test schema/uploads on exit. `CHROME_BIN` can select the Chrome executable.

`docs/openapi.yaml` is the source for `docs/remarket.postman_collection.json`. Regenerate the collection after contract changes; the API contract test verifies every request name and every local OpenAPI reference.

## Deployment order

1. Back up the database and record the current release revision.
2. Build and publish immutable API/web artifacts.
3. Run `prisma migrate deploy` once as a controlled release step.
4. Start the API with `RUN_JOBS=false`, then start one worker process.
5. Check `/health/live`, `/health/ready` and `/health/worker`.
6. Run the live smoke flow: login, product read, checkout test account, order transition and notification.
7. Roll back application artifacts on failure. Do not automatically reverse a committed data migration; use a reviewed forward fix or the tested restore procedure.

Set `TRUST_PROXY_HOPS` to the exact number of trusted reverse-proxy hops between the client and Express (`1` for the common single-ingress topology, `0` for direct local traffic). Do not use an unbounded `trust proxy` setting: client-controlled forwarding headers would weaken IP-based throttling.

## Health and operations

- `/health/live`: process-only probe; never queries the database.
- `/health/ready`: database probe with `DATABASE_HEALTH_TIMEOUT_MS` (default 10 seconds); non-2xx removes the instance from traffic.
- `/health/worker`: shared database heartbeat plus counts for expired orders, pending/dead outbox rows and orphan uploads. It returns 503 with `status: "degraded"` until a worker has reported successfully, and again when the last success is older than the greater of three worker intervals or three minutes.

Alert on sustained 5xx rates, readiness failures, worker heartbeat age, `outbox_dead_letter > 0`, expired orders pending, database pool exhaustion and storage growth. Outbox events stop automatically after ten attempts and remain in the database for manual inspection/retry.

Graceful shutdown stops job polling, closes Socket.IO and HTTP, then disconnects Prisma. Give the process at least ten seconds of termination grace.

## Backup and restore

- Take a daily PostgreSQL backup and retain at least seven days.
- Back up the private image store independently; a database backup does not contain image bytes.
- Restore into an isolated environment at least once before go-live and on a recurring schedule.
- Validate row counts, a completed order with snapshots, an attached upload, login/refresh, and worker/outbox processing after restore.
- Initial targets from the project specification are RPO ≤ 24 hours and RTO ≤ 4 hours; record measured results rather than assuming them.

## Current storage topology

Both storage drivers retain a private backing store. Resource visibility is
checked before issuing an opaque, time-limited image capability:

- `local` stores private files under `apps/api/uploads` and is intended for development or a single persistent-volume instance.
- `supabase` writes to a private bucket with the server-only service-role key. The API redirects valid image capabilities to provider-signed URLs using their remaining lifetime, cached only for the same object/deadline.

Signed reads verify the object, signature, visibility scope and expiry locally,
without per-image session/metadata queries. Unsigned legacy URLs retain the DB
authorization checks. Public capabilities have bounded public cache headers;
owner/order/admin previews remain private. The TTL defaults to 300 seconds and
is rounded down to a minute for reuse, so a newly issued URL lives 240–300 seconds.
A previously issued URL or cached image can remain readable until that expiry
after moderation/session changes; do not promise immediate revocation or CDN purge.
Changing the signing key invalidates outstanding API capabilities.

New uploads include 480px/card and 1600px/detail WebP derivatives, with no upscaling.
Old local uploads generate derivatives lazily, with duplicate work coalesced and
bounded transform concurrency; original bytes remain unchanged. Old Supabase
uploads without derivatives fall back to originals; this code does not bulk
backfill or modify existing storage objects. Deletion/compensation covers all
three files. Frontend retries an original once then shows a stable placeholder;
reserved `example.com/org/net` URLs are omitted without modifying stored rows.

Orphan metadata is claimed under a database row lock. The same transaction removes the metadata and creates a `storage.delete` outbox event; physical deletion is retried by the worker. Before go-live, create the private bucket, keep anon access disabled, and smoke-test upload, authorized/unauthorized reads, order-snapshot access and deletion with the real Supabase project.
