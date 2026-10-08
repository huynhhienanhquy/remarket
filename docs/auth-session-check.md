# Authentication/session check — 2026-10-08

Scope: register/login, cookie discovery/refresh, identity/route guards, current-
session logout, logout-all, email verification, password recovery/reset,
realtime reauthentication and cross-tab identity changes. Existing Supabase
database, storage, account roles and passwords are unchanged. No migration or
new package is required; Prisma remains 5.22.

## Findings and changes

| Finding | Correction | Regression evidence |
| --- | --- | --- |
| Protected 401/socket recovery used non-consuming bootstrap, bypassing refresh rotation | Bootstrap remains non-consuming; recovery calls actual refresh and reads its current identity | Parallel-401 HTTP tests; two-tab Chrome rotation check; DB refresh/replay test |
| Late credential/discovery/streamed responses could overwrite a newer intent/context | Cookie-action queue, credential epoch and checks before applying identity and after JSON parsing | Late bootstrap, login/logout and streamed private-response tests |
| Old validation failures could hide a new login or turn transient refresh failure into logout | Cancel obsolete validation without an error panel; only a terminal protected retry clears identity | Real-provider validation/login race and 401/503 recovery tests |
| Cookie actions were not all serialized across tabs | Same Web Lock for bootstrap, refresh, login, verify, reset and logout | Lock-name test; simultaneous two-tab recovery in Chrome |
| Other tabs retained old admin identity until an API failure | Token-free BroadcastChannel hint; clear stale memory/cache, then server discovery; focus/online/visibility fallback | Sender isolation/failure tests; Chrome logout/login account switch with no forbidden admin replay |
| Login could create a session from a pre-reset password/permission snapshot | Recheck password hash and live identity under the User lock before atomic session issuance | Password-race and locked-identity HTTP tests |
| Logout-all lacked the global auth lock order | User -> Session -> AuthToken for revocation | Lock-order test; concurrent refresh/logout-all DB test |
| Current-session logout depended on a live JWT | Trusted-Origin cookie logout is idempotent; mismatched bearer/cookie is rejected without writes | Expired-access/idempotent/mismatch HTTP and DB tests |
| Refresh reuse disconnected other devices via user-wide socket payload | Emit only affected session_ids; expired consumed credentials are not replay evidence | Payload/expiry unit tests; unaffected-device DB test |
| Reset left frontend access in memory and token in address bar | Clear identity/access/cache on success, remove URL token, hide/reset password inputs; preserve session on failure | Reset UI/HTTP tests; concurrent one-time reset DB test |
| Successful one-time email verification depended on a redundant me request | Apply the identity returned by verification directly; do not report failure merely because a subsequent identity fetch fails | Legacy verification UI test asserts no me round-trip |
| Private auth responses lacked explicit cache policy; malformed identity could be accepted | no-store for auth/protected responses, stricter Origin/JWT claims, reject malformed/unsupported login identities | Cache/Origin/Secure-cookie/JWT/malformed-response tests |

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`: passed.
- Standard test suites: 270 passed (132 API, 121 web, 17 shared); web was rerun
  after the final validation-race and redundant-verification-fetch fixes.
- `node apps/api/scripts/verify-isolated.mjs --auth-browser`: all 23 PostgreSQL
  integration tests passed, followed by Chrome login/reload, eight admin screens,
  foreign-tab logout/user switch and simultaneous two-tab refresh checks.
- Temporary schema `remarket_verify_65d5c0d57580473bbe93532d64678769` was removed;
  browser and test servers closed. Screenshots/timings stay in ignored .artifacts.
- `--auth-only` reran all four auth DB cases on the final API, including a matched
  cookie/bearer logout-all racing refresh; all passed and its temporary schema
  `remarket_verify_84c5c678518341bb977b593ed0857d8a` was removed.

## Deployment and limits

Deploy API and web together: login/refresh/verify responses include user plus
access_token. No production migration/data cleanup is needed. A secure context
(HTTPS or localhost) is required for Web Locks; without it only same-tab cookie
actions are serialized. Cross-tab runtime verification was on Chrome, not a
cross-browser certification. Messaging failure uses focus/online checks. Existing
SameSite=Lax assumes a same-site app/API deployment; different-site cookie setup
requires separate browser verification. This is a code/regression review, not an
independent penetration test.

References used for session/cache and browser coordination guidance:
[OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
and [MDN Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).
