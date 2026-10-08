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
