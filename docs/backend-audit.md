# Backend audit against `detail-project.md` and `docs/backend-detail.md`

Audit date: 2026-10-07.

## Implemented and repaired

| Area | Current state |
|---|---|
| Contract/foundation | Standard success/error envelopes with request IDs and correlated sanitized logging, strict JSON/query validation, strict JSON limit, CORS allowlist, contextual rate limits, liveness/readiness/worker health, graceful shutdown. OpenAPI covers all 77 operations with field-level request/success DTOs, the shared error-code enum and a contract-tested per-operation machine-error matrix; the generated Postman collection is contract-tested against it. |
| Prisma/data integrity | Invalid Order–Conversation relation removed; reservation, upload, refresh-token history, worker heartbeat and outbox models added; uniqueness, checks, foreign keys and query indexes are in versioned migrations. |
| Auth/security | Short JWT plus database session validation, atomic refresh rotation/reuse revocation, one-time email tokens, trusted Origin checks, configurable issuer/audience/bcrypt cost, logout/reset session and socket revocation. Registration, token creation and production email enqueue are atomic; concurrent duplicate registration maps to a field-level 422 instead of leaking a database error. The refresh cookie is scoped to `/api/v1/auth`. |
| Email | Production email is queued transactionally in the outbox; the raw token is AES-GCM encrypted with a key derived from the server signing secret; worker delivery supports SMTP TLS/STARTTLS and retries. |
| Marketplace | Product/category/versioned-province validation, active-leaf-category rules, ownership/account locks, private upload metadata, real image decode/re-encode, 5 MB/20 MP limits, upload attachment ownership, favorites/cart and public visibility. Blocked/deleted saved items remain removable but redact title, price and image. Public profile/review/avatar access excludes locked or unverified accounts. |
| Checkout/orders | Serializable idempotent multi-seller checkout, user/category/product locking, server totals, snapshots, conditional reservation, state machine/history, expiry worker and support-ticket completion guard. Order-linked ticket mutations use the shared `Order -> SupportTicket` lock order so resolving/reopening a ticket is linearizable with completion. |
| Moderation | User lock and product block use one shared transactional orchestration from direct admin endpoints and report resolution; affected pre-delivery orders cancel, later orders escalate to support, sessions revoke and actions audit. |
| Trust/realtime | Participant-scoped REST/Socket.IO chat, message idempotency/read semantics, reviews, reports, notifications, user/admin support-ticket workflows and outbox-backed realtime events. Processed outbox events are relayed from PostgreSQL to every API instance. |
| Upload/storage | Orders snapshot `storage_path`; buyer/seller retain snapshot access after a listing is hidden/deleted. Local private disk and Supabase private-bucket drivers are implemented. Authorized Supabase reads redirect to five-minute signed URLs. Orphan metadata is row-locked and object deletion is retried through the outbox. |
| Delivery artifacts | Runnable API build, field-level OpenAPI surface, generated 77-request Postman collection, CI with PostgreSQL, canonical-data demo seed, `.env.example`, and this runbook. |

## Verification obtained locally

- Prisma schema validation and full Prisma Client generation pass.
- Monorepo typecheck, lint, unit/contract tests and production builds pass.
- Current local result: shared 17/17, web 17/17 and API 36/36 non-database tests pass; fourteen PostgreSQL integration tests are explicitly skipped without `TEST_DATABASE_URL`.
- Built API artifact boots; `/health/live` returns 200 and `/health/ready` returns a structured 503 `NOT_READY` response when PostgreSQL is unavailable.
- On 2026-10-07, the migration preflight passed against the supplied Supabase PostgreSQL database, both pending repair migrations were applied, and `prisma migrate status` confirmed all three migrations are current.
- The built API artifact was then started against that database; `/health/live` and `/health/ready` both returned 200. No seed or destructive integration test was run against the supplied database.
- PostgreSQL integration tests are present for refresh replay, concurrent duplicate registration, double checkout, idempotency replay/conflict, multi-seller rollback, checkout-vs-account-lock, confirm-vs-expire, complete-vs-ticket resolution, concurrent report decisions, private-resource IDOR, message dedupe/cursor stability, notification retry dedupe, saved-item privacy and durable orphan cleanup.

## Still requires external or follow-up evidence

| Item | Why it is not closed by local evidence |
|---|---|
| PostgreSQL integration run | The supplied Supabase database is now migrated and passes runtime readiness, but it was not identified as disposable. The fourteen destructive integration tests still require a separate `TEST_DATABASE_URL`; CI is configured with PostgreSQL 16 and runs `migrate deploy` plus the suite. |
| Live adapter response contract | Every live frontend HTTP method/path is now statically checked against OpenAPI and the mock-adapter tests pass, but the adapter has not yet been exercised against a real API test server with response-schema validation. |
| Full live E2E | Guest → register/verify → listing/moderation → checkout → delivery/completion → review has not been automated against a deployed stack. |
| Supabase provider proof | The private-bucket adapter and five-minute signed URL flow are implemented, but real project credentials, bucket policy and upload/read/delete smoke tests are external to the repository. |
| SMTP provider proof | SMTP TLS/STARTTLS code exists, but a real provider credential and delivery test are external to the repository. |
| Production boot configuration | Production validation correctly rejects startup until `WEB_ORIGINS`, SMTP credentials, Supabase Storage credentials and a deployed `PUBLIC_WEB_URL` are supplied. Database readiness alone is not a deployable production configuration. |
| Production operations | Least-privilege DB role/RLS, staging deployment, alert routing, load test, backup retention and a measured restore drill require actual infrastructure. |
| Distributed throttling | HTTP and Socket.IO rate limits are in-memory per process. A shared store is still needed before horizontally scaling production. |
| Frontend bundle budget | Production web build succeeds but reports a ~554 kB JavaScript chunk; route-level code splitting remains a performance improvement. |

These remaining items must not be described as verified until their CI/staging/provider evidence exists.

## Project gaps outside the rebuilt backend

The repository can build, but the product is not yet feature-complete. The following routed web pages currently render only an empty `<div />`:

- Account: account profile, favorites and notifications.
- Chat: conversation list and conversation detail.
- Support: ticket list, new ticket and ticket detail.

The admin routes are now implemented and aligned with the canonical contract, including moderation version checks, support order snapshots/cancellation, filters and audit views.

The web application also has no Socket.IO client integration, so it cannot consume the backend's realtime chat, notification and session-revocation events without polling or a reload. These are frontend implementation gaps, not evidence that the corresponding backend endpoints are missing.

The product form also hardcodes its own province list and still submits the stale `VN-65` code for Hồ Chí Minh, while the canonical shared/API dataset uses `VN-52`. The live form should consume `GET /api/v1/provinces` like search and checkout already do.
