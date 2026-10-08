# Backend audit against `detail-project.md` and `docs/backend-detail.md`

Audit updated: 2026-10-08. See `docs/project-audit-2026-10-08.md` for the full-project repair summary.

## Implemented and repaired

| Area | Current state |
|---|---|
| Contract/foundation | Standard success/error envelopes with request IDs and correlated sanitized logging, strict JSON/query validation, strict JSON limit, CORS allowlist, contextual rate limits, liveness/readiness/worker health, graceful shutdown. OpenAPI covers all 78 operations with field-level request/success DTOs, the shared error-code enum and a contract-tested per-operation machine-error matrix; the generated Postman collection is contract-tested against it. |
| Prisma/data integrity | Invalid Order–Conversation relation removed; reservation, upload, refresh-token history, worker heartbeat and outbox models added; uniqueness, checks, foreign keys and query indexes are in versioned migrations. |
| Auth/security | Short JWT plus database session validation, atomic explicit refresh rotation/reuse revocation, one-time email tokens, trusted Origin checks, configurable issuer/audience/bcrypt cost, logout/reset session and socket revocation. Bootstrap validates without rotating the cookie so canceled navigation cannot consume it. Registration, token creation and production email enqueue are atomic; concurrent duplicate registration maps to a field-level 422 instead of leaking a database error. The refresh cookie is scoped to `/api/v1/auth`. |
| Email | Production email is queued transactionally in the outbox; the raw token is AES-GCM encrypted with a key derived from the server signing secret; worker delivery supports SMTP TLS/STARTTLS and retries. |
| Marketplace | Product/category/versioned-province validation, active-leaf-category rules, ownership/account locks, private upload metadata, real image decode/re-encode, 5 MB/20 MP limits, upload attachment ownership, favorites/cart and public visibility. Blocked/deleted saved items remain removable but redact title, price and image. Public profile/review/avatar access excludes locked or unverified accounts. |
| Checkout/orders | Serializable idempotent multi-seller checkout, user/category/product locking, server totals, snapshots, conditional reservation, state machine/history, expiry worker and support-ticket completion guard. Order-linked ticket mutations use the shared `Order -> SupportTicket` lock order so resolving/reopening a ticket is linearizable with completion. |
| Moderation | User lock and product block use one shared transactional orchestration from direct admin endpoints and report resolution; affected pre-delivery orders cancel, later orders escalate to support, sessions revoke and actions audit. |
| Trust/realtime | Participant-scoped REST/Socket.IO chat, message idempotency/read semantics, reviews, reports, notifications, user/admin support-ticket workflows and outbox-backed realtime events. Processed outbox events are relayed from PostgreSQL to every API instance. |
| Upload/storage | Orders snapshot `storage_path`; buyer/seller retain snapshot access after a listing is hidden/deleted. Local private disk and Supabase private-bucket drivers are implemented. Authorized Supabase reads redirect to five-minute signed URLs. Orphan metadata is row-locked and object deletion is retried through the outbox. |
| Delivery artifacts | Runnable API build, field-level OpenAPI surface, generated 78-request Postman collection, CI with PostgreSQL, canonical-data demo seed, `.env.example`, runbook, isolated-schema regression harness and live-browser smoke. |

## Verification obtained locally

- Prisma schema validation and full Prisma Client generation pass.
- Monorepo typecheck, lint, unit/contract tests and production builds pass.
- Current result: shared 17/17, web 112/112 and API 92/92 non-database tests pass. All fifteen PostgreSQL integration tests also pass using the isolated-schema harness. Normal `pnpm test` deliberately skips these destructive DB tests without `TEST_DATABASE_URL`.
- Built API artifact boots; `/health/live` returns 200 and `/health/ready` returns a structured 503 `NOT_READY` response when PostgreSQL is unavailable.
- On 2026-10-07, the migration preflight passed against the supplied Supabase PostgreSQL database, both pending repair migrations were applied, and `prisma migrate status` confirmed all three migrations are current.
- The built API artifact was then started against that database; `/health/live` and `/health/ready` both returned 200. No seed or destructive integration test was run against the supplied database.
- On 2026-10-08, all fifteen integration tests passed on a new disposable PostgreSQL schema: refresh replay/repeated bootstrap, concurrent registration, double checkout, image attachment/unauthorized reuse rollback, idempotency replay/conflict, multi-seller rollback, checkout-vs-account-lock, confirm-vs-expire, complete-vs-ticket resolution, concurrent report decisions, private-resource IDOR, message dedupe/cursor stability, notification retry dedupe, saved-item privacy and durable orphan cleanup. Only the generated test schema was removed afterward; existing application tables were not reset or seeded.
- Raw PostgreSQL serialization/deadlock errors now map to retryable 409 responses rather than leaking INTERNAL/500; checkout retries recognize Prisma raw-query conflicts as well as P2034.
- Upload ownership is validated under locks, the product is created before attaching assets, and unauthorized reuse leaves no partial listing. Private order snapshot images carry short-lived API signatures for authorized participants.
- The full live Chrome smoke passed 44 checks, including two-account WebSocket delivery/read receipts and the upload-to-review lifecycle. A second 22-check lifecycle run explicitly verified decoded upload images and a signed completed-order snapshot after the listing was blocked. The two reports contain 45 distinct checks, no uncaught browser exceptions and no HTTP 5xx responses.

## Still requires external or follow-up evidence

| Item | Why it is not closed by local evidence |
|---|---|
| Exhaustive live response validation | Method/path compatibility is contract-tested and principal adapter operations are exercised against the real API, but every response of every endpoint has not been schema-validated in a deployed environment. |
| Deployed guest/email E2E | Registration/verification/reset are covered by repository tests; a deployed guest → real email delivery → verification flow still needs provider/staging evidence. |
| Supabase provider proof | The private-bucket adapter and five-minute signed URL flow are implemented, but real project credentials, bucket policy and upload/read/delete smoke tests are external to the repository. |
| SMTP provider proof | SMTP TLS/STARTTLS code exists, but a real provider credential and delivery test are external to the repository. |
| Production boot configuration | Production validation correctly rejects startup until `WEB_ORIGINS`, SMTP credentials, Supabase Storage credentials and a deployed `PUBLIC_WEB_URL` are supplied. Database readiness alone is not a deployable production configuration. |
| Production operations | Least-privilege DB role/RLS, staging deployment, alert routing, load test, backup retention and a measured restore drill require actual infrastructure. |
| Distributed throttling | HTTP and Socket.IO rate limits are in-memory per process. A shared store is still needed before horizontally scaling production. |
| Production performance | Route-level code splitting is implemented. The main production JavaScript chunk is about 476.53 kB (149.65 kB gzip); real-device/staging load and performance budgets still need measurement. |

These remaining items must not be described as verified until their CI/staging/provider evidence exists.

## Frontend repairs completed

The eight previously blank account/chat/support routes are implemented. Socket.IO client integration now refreshes chat, read receipts, notifications, orders and support data with REST polling fallback. Conversation detail is participant-scoped and locked accounts cannot read chat. Blocked/deleted listings disable new messages while retaining permitted history.

Product forms use canonical API provinces (`VN-52` for Hồ Chí Minh) and real upload APIs. Product actions follow server capabilities and expose mutation failures. Checkout sends the strict canonical payload, derives allowed delivery methods and server shipping fees, and preserves the idempotency key on a network retry. Buy-now selects only the viewed item. Guests are asked to log in before cart changes; product actions wait for session readiness and reject duplicate/offline submissions.

Unavailable saved/cart items remain removable without exposing private listing content. Notification order links and order detail derive the actual participant role. Account navigation, loading/error/empty feedback and mobile layouts have been repaired without modifying the established UI kit.
