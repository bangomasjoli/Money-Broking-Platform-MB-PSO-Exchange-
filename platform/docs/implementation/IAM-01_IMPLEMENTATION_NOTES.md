# IAM-01 Authentication / MFA / Session — Implementation Notes

Module: **IAM-01 Authentication / MFA / Session**
Blueprint: `aix-platform-docs/modules/IAM-01_Authentication_MFA_Session_Blueprint_Pack_v1.2/`
Implementation status: **fully-green tested slice** (see §7-§8). This document supersedes any
stale in-code comments written under the assumption that MFA would not be built this pass (it
now is — see `lib/bootstrap.ts`).

**Gap-closing pass (this update):** closes the two findings from
`docs/IAM-01_Security_Review_Opus_v0.1.md` that were blocking final sign-off —
**S1** (RLS-vs-token-hash-lookup deploy blocker, §11 below) and **S2** (MFA-required-but-
unenrolled had no completion path, §12 below) — plus the previously-deferred password-reset
endpoints (§13). S3 (low, `last_seen_at_utc` write amplification) remains an intentionally
deferred, non-blocking follow-up (§14). Migrations `003_iam_rls_token_lookup.cjs` and
`004_iam_mfa_enrolment_session.cjs` were added on top of `002_iam_auth_session.cjs`, which is
unchanged.

---

## 1. Tech stack

- Fastify 5 + `@sinclair/typebox` for schema-validated routes (mirrors `services/fnd`).
- `pg` direct SQL (no ORM) — same convention as FND-01.
- `@node-rs/argon2` (prebuilt NAPI binaries, no native toolchain) for password hashing.
- TOTP (RFC 6238) implemented directly on `node:crypto` (HMAC-SHA1) — no new dependency.
- AES-256-GCM (node:crypto) for MFA secret envelope encryption — placeholder pending real KMS.
- `@aix/foundation` (public entry only) for context/envelope/db/outbox/audit/idempotency/
  config/no-exchange guard.

## 2. Migration

`infra/migrations/002_iam_auth_session.cjs` creates schema `iam` with the full §05.2 table
set: `user_identity`, `credential_password`, `mfa_factor`, `mfa_challenge`, `session`,
`refresh_token`, `password_reset_token`, `device_registry`, `account_lockout`,
`service_account`, `step_up_assertion`, `session_policy` (seeded per user_class),
`session_anomaly`, `mfa_reset_request`, `password_history`, `auth_event`.

This pass added two columns to `mfa_challenge` (`purpose`, `action_scope`, `session_id`) so
the same table can carry BOTH the login MFA gate (`challenge_type = 'totp'`) and step-up
challenges (`challenge_type = 'step_up'`) — its CHECK constraint already allowed both. No FK
from `mfa_challenge.session_id` to `iam.session.session_id`: that table is created later in
the same migration file and a forward FK reference would fail at `CREATE TABLE` time.

**RLS (F3(b) DB backstop):** `ENABLE + FORCE ROW LEVEL SECURITY` with a `user_id =
current_setting('aix.user_id', true)` ownership policy on `iam.session`, `iam.refresh_token`,
`iam.device_registry`, `iam.mfa_factor`. Verified end-to-end in
`tests/integration/iam-db.test.ts` (F3(b) describe block) — **and now also under the real
runtime role**, not just an isolated `SET ROLE` probe; see §11 (S1).

**Grants:** `infra/grants/iam_runtime_grants.sql` creates `role_iam_runtime` with
`SELECT/INSERT/UPDATE` on `iam.*` only, `EXECUTE` on the three S1 SECURITY DEFINER functions,
and a narrow `USAGE` + `SELECT/INSERT/UPDATE` on exactly `foundation.outbox_event` /
`foundation.idempotency_record` (the "approved foundation interface" every module needs for
`publishAudit`/`beginIdempotent` — see §11) — explicitly nothing else on `foundation.*` or any
other schema. Verified in the F3(a) test AND the new §11 role-runtime test block.

## 3. APIs implemented

All under the standard envelope (`success/data|error` + `request_id`/`correlation_id`/
`server_time_utc`), backend-validated (TypeBox, `additionalProperties: false`, and IAM's
Fastify instance overrides AJV's default `removeAdditional: true` so unknown fields are
REJECTED, not silently stripped — see `server.ts`).

**`routes/auth.ts`**
- `POST /auth/login` — Argon2id verify, no-enumeration generic failure (same code/message/
  timing-normalised via a dummy verify against a fixed hash), IAM-side rate-limit/lockout,
  MFA gating (returns `mfa_required` + `challenge_id`, or — **S2 gap-closing patch** —
  `mfa_enrolment_required` + `enrolment_session_id` if `mfa_required` is set but no active
  factor exists yet; see §12).
- `POST /auth/refresh` — rotation + reuse detection (whole token family + session revoked,
  Critical audit `iam.refresh_reuse_detected`); re-checks user/account status every call.
- `POST /auth/logout`, `POST /auth/logout-all`
- `GET /auth/sessions` — own sessions only (app-level `WHERE user_id = $1` + RLS backstop).
- `POST /auth/sessions/{id}/revoke` — cross-user attempts get `NOT_FOUND` (no existence
  disclosure).

**`routes/mfa.ts`**
- `POST /auth/mfa/enrol` — starts TOTP enrolment (authenticated); returns the raw secret +
  `otpauth://` URI ONCE.
- `POST /auth/mfa/verify` — activates the pending factor and flips `user.mfa_required`.
- `POST /auth/mfa/challenges` — re-issues an existing (expired/failed) login-MFA challenge.
- `POST /auth/mfa/challenges/{id}/verify` — unauthenticated login-continuation: verifies the
  TOTP code and, on success, issues a full session (mirrors how `/auth/refresh` completes
  `/auth/login`).
- `POST /auth/mfa/reset/request` — interim placeholder: files an `iam.mfa_reset_request` row
  (`approval_mode = 'iam01_dual_security_admin'`, `status = 'pending'`) and audits it. **Never
  auto-completes** — no approval workflow exists until IAM-02.
- **S2 gap-closing patch** — `POST /auth/mfa/enrol/start`, `POST /auth/mfa/enrol/verify`:
  unauthenticated (no bearer session exists yet), authorised solely by possessing the raw
  `enrolment_session_id` secret `POST /auth/login` returned. `start` creates a pending TOTP
  factor and returns its secret/otpauth URI ONCE (mirrors `/auth/mfa/enrol`'s shape); `verify`
  activates the factor, marks the enrolment session `used` (single-use), and issues a REAL
  full session — closing the exact gap that left the break-glass bootstrap admin unable to
  complete login. See §12.

**`routes/password-reset.ts`** (S1 review completeness item, gap-closing patch — see §13)
- `POST /auth/password-reset/request` — always returns the same generic
  `{status: "if_eligible_notification_sent"}` regardless of whether the identifier resolves;
  mints an opaque, hash-only-at-rest reset token for a resolved active user and enqueues a
  `notification.delivery` outbox placeholder (no email/SMS provider exists this pass).
- `POST /auth/password-reset/confirm` — validates the token (unexpired, single-use), enforces
  a minimum password-policy floor, updates the Argon2id hash + `password_history`, and revokes
  every existing session/refresh-token family for the user in the same transaction.

**`routes/step-up.ts`**
- `POST /auth/step-up` — starts a step-up challenge (reuses `mfa_challenge`, `challenge_type
  = 'step_up'`) for a `purpose`/`action_scope`.
- `POST /auth/step-up/verify` — verifies the TOTP code, issues a short-lived (10 min),
  purpose-bound `recent_auth_assertion` (opaque, hash-only stored in `iam.step_up_assertion`).
- `POST /internal/auth/verify-assertion` — the reusable capability downstream modules call;
  internal-guard only, hash lookup + purpose/session/expiry check, `iam.
  recent_auth_assertion_verified` audit on every call (deliberately NOT single-use — a
  short-lived assertion is expected to be checked multiple times within its freshness window).

**`routes/internal.ts`** (all under IAM's internal-identity guard)
- `POST /internal/auth/freeze-event` — suspends the user + revokes all active sessions in one
  transaction; a subsequent refresh is denied (the revoked refresh token is treated as reuse,
  which is the correct fail-closed outcome).
- `POST /internal/auth/revoke-user-sessions` — bulk revoke on demand (Security Admin /
  approved internal service, per blueprint §3.4, renamed per this task's literal route spec).
- `POST /internal/auth/service-account/validate` — baseline only: `credential_ref` is compared
  as a sha256 digest of the presented credential (never the plaintext, never logged). Real
  credential rotation/hashing scheme is a known open item.

**Deferred this pass** (tables already migrated, endpoints not built — no blueprint §2.3/2.7
DELETE-style routes either, since the task's literal route list uses `POST .../revoke`
instead): `GET /internal/auth/users/{user_id}/auth-status`, WebAuthn/security-key/recovery MFA factor
types, `iam.session_anomaly` scoring beyond basic token-binding capture, MFA-reset APPROVAL
completion (IAM-02).

## 4. FND packages reused (via `@aix/foundation` public entry only)

`AppError` / `errorEnvelope` / `successEnvelope` / FND error catalogue, `RequestContext` /
`createRequestContext` / `enterContext` / ALS, `withTransaction` / `getPool` / `initPool` /
`query`, `beginIdempotent` / `completeIdempotent`, `enqueueOutbox` (indirectly, via
`publishAudit`), `publishAudit`, `systemTime`, `loadConfig`, `assertNoExchangeRuntime`.
No import from `services/fnd/src` anywhere (F3(c), enforced by
`tests/unit/iam-import-boundary.test.ts`).

## 5. The 5 decisions, as implemented

1. **Argon2id** (`lib/password.ts`) — PHC-encoded hash string persisted as a whole
   (`credential_password.password_hash`); a fixed `DUMMY_PASSWORD_HASH` is verified against
   on every login where no user/credential resolves, to normalise failure timing.
2. **Opaque tokens, hash-only** (`lib/session.ts`) — `crypto.randomBytes(32)` tokens, only
   `sha256(token)` ever persisted; validation is hash + DB lookup, never decode. Applies to
   access tokens, refresh tokens, and step-up assertions alike.
3. **Break-glass bootstrap** (`lib/bootstrap.ts`) — env-flag gated, creates one admin only
   when `iam.user_identity` is empty, forces `must_change_password` + `mfa_required` +
   `privileged_mfa_required`. **Updated finding from this pass:** because MFA enrolment IS
   now built, the ORIGINAL "MFA endpoints are deferred so this account can never complete
   login" comment in `bootstrap.ts` is stale. The account still cannot complete login THIS
   PASS, but for a different, narrower reason — see §6 gap 1.
4. **IAM's own internal-identity guard** (`plugins/internal-identity.ts`) —
   `crypto.timingSafeEqual`, fail-closed, its own copy (not imported from `services/fnd`).
   Reused for all of `routes/internal.ts` and the internal `verify-assertion` route.
5. **IAM-side rate-limiting** (`lib/rate-limit.ts`) — `iam.account_lockout`, scoped by
   `(scope_hash, action)`; login/mfa/refresh all wired. `password-reset` thresholds are
   configured but unused (no reset endpoint built this pass — see §6). Never writes to the
   `foundation` schema.

## 6. Known gaps / deferred items

1. ~~**MFA-required-but-unenrolled login (incl. bootstrap admin) has no completion path.**~~
   **CLOSED (S2 gap-closing patch, see §12).** `POST /auth/login` now returns a purpose-scoped,
   out-of-band `enrolment_session_id` instead of a hard failure; `POST /auth/mfa/enrol/start` +
   `POST /auth/mfa/enrol/verify` complete enrolment and issue a real session. The break-glass
   bootstrap admin can complete login end-to-end for the first time.
2. **Login/refresh/MFA-verify/step-up-verify idempotency is "dedup side effects", not "replay
   the secret".** Their success response carries a one-time opaque secret that — per decision
   #2 — is never persisted in a re-derivable form. A retried request with the same
   Idempotency-Key + body is detected (`beginIdempotent`) and does NOT mint a second
   token/assertion, but the response is `{status:"duplicate_submission", reference:<non-
   secret id>}`, not the original secret. A client that loses the original response has no
   way to recover the token via retry — it must re-authenticate. This is an inherent
   consequence of "never store a re-derivable secret" (decision #2), not an oversight;
   documented at the top of `routes/auth.ts`.
3. ~~**Password reset (`/auth/password-reset/request`, `/confirm`) not built.**~~ **CLOSED**
   (gap-closing patch, see §13). `routes/password-reset.ts` implements both endpoints on the
   existing `iam.password_reset_token`/`iam.password_history` tables.
4. **WebAuthn/security-key/recovery MFA factor types** are schema-only (`iam.mfa_factor`
   columns exist: `public_key`, `credential_id_hash`, `phishing_resistant`). Only TOTP is
   implemented.
5. **`iam.session_anomaly`** table exists but nothing writes to it — anomaly detection beyond
   basic device first/last-seen capture (`upsertDevice`) is not built.
6. **MFA-reset approval workflow** cannot complete — `POST /auth/mfa/reset/request` only
   files the request (`status: 'pending'`); there is no maker-checker/dual-Security-Admin UI
   or API to approve it. Explicitly an IAM-02 handoff per the permission-rules doc.
7. **Service-account credential scheme is a baseline placeholder** — `credential_ref` is
   compared as a raw sha256 digest with no rotation/expiry enforcement beyond the `status`
   column. Real secret management is a KMS/SEC-01-adjacent open item.
8. **MFA TOTP secret encryption key is a single operator passphrase** (`IAM_MFA_SECRET_ENC_KEY`,
   SHA-256-derived AES-256 key), not a real KMS/HSM-managed key with rotation. See
   `lib/mfa-secret-crypto.ts` header comment.
9. **`iam.auth_event`** is explicitly non-authoritative index metadata (per blueprint §05.8);
   SEC-01 remains the store of record. `audit_event_ref` is an interim `corr:<id>:<event>`
   string since `publishAudit` does not return an outbox row id to callers.
10. A Fastify-level fix was needed and applied: Fastify's default AJV option
    `removeAdditional: true` silently strips fields outside a TypeBox schema instead of
    rejecting the request, even with `additionalProperties: false` set. `services/iam/src/
    server.ts` overrides this (`ajv: { customOptions: { removeAdditional: false } }`) so
    unexpected fields are genuinely rejected with `VALIDATION_ERROR`. This is IAM's own
    Fastify instance config — `services/fnd` was not touched and may have the same latent
    behaviour; worth a follow-up check there.
11. ~~**FORCE RLS ownership policy was incompatible with the by-token-hash pre-auth
    lookup — deploy-blocking under `role_iam_runtime`.**~~ **CLOSED (S1, see §11).** The
    original test suite only ever connected as the `postgres` superuser, which bypasses RLS
    unconditionally, so this never surfaced until the independent Opus review traced the code
    path by hand.
12. **S3, deferred, non-blocking:** `validateAccessToken` still touches `last_seen_at_utc` on
    every single call (now via `iam.fn_touch_session_last_seen`, for the S1 RLS reasons in
    §11 — the write-amplification/row-contention concern itself is unchanged). Throttling it
    (e.g. only UPDATE when the existing value is stale by N seconds) is a reasonable future
    optimisation but is NOT implemented this pass — the review rated it Low severity and
    explicitly non-blocking, and this task's brief says not to optimise unless trivially safe.
    A correct throttle would need to read-before-write or use a conditional `WHERE
    last_seen_at_utc < now() - interval 'N seconds'` inside `fn_touch_session_last_seen`,
    which is a one-line change when someone picks this up — flagged here so it isn't lost.

## 7. F3 closure evidence

- **F3(a)** — `tests/integration/iam-db.test.ts`, describe `"F3(a): cross-schema DB role
  isolation"`: a pooled client runs `SET ROLE role_iam_runtime`, then a query against
  `foundation.module_registry` is asserted to reject with Postgres error code `42501`
  (insufficient_privilege), while a query against `iam.user_identity` on the SAME role
  succeeds (proves the denial is a real boundary, not a broken connection). `RESET ROLE`
  before releasing the connection back to the pool.
- **F3(b)** — same file, describe `"F3(b): missing-client-scope fails closed"`:
  (i) DB backstop — as `role_iam_runtime` with NO `aix.user_id` set, `SELECT * FROM
  iam.session` returns **zero** rows (not an unscoped read of everything); with
  `aix.user_id` set to user A, only A's row is visible, never B's.
  (ii) App-level — `GET /auth/sessions` with no bearer token returns `401
  AUTH_SESSION_REQUIRED` (also covered no-DB in `tests/unit/iam-app.test.ts`), and
  `POST /auth/sessions/{id}/revoke` against another user's session returns `404 NOT_FOUND`
  (no existence disclosure), leaving the other session untouched.
  **Real bug found and fixed while proving this:** `plugins/user-session.ts`'s
  `withUserScope` called `set_config('aix.user_id', $1, true)` (transaction-LOCAL) without
  an explicit transaction wrapper. Outside a transaction every statement auto-commits its
  own implicit transaction, so the scope was cleared before the following SELECT ran — the
  RLS backstop was silently not backstopping anything (the explicit `WHERE user_id = $1` in
  the route was still correct, so no real request was ever affected, but the DB-level
  defense-in-depth layer was inert). Fixed by wrapping `set_config` + the scoped query in an
  explicit `BEGIN`/`COMMIT` inside `withUserScope`.
- **F3(c)** — `tests/unit/iam-import-boundary.test.ts`: static-scans `services/iam/src/**/
  *.ts`, asserting no import specifier contains `services/fnd/` and none subpath-imports
  `@aix/foundation/*` (bare specifier only). Written generically
  (`findModuleImportBoundaryViolations`) so later modules can reuse it; includes control
  tests proving the scanner actually fires on synthetic violations (not vacuously passing).
- **F3(a)/F3(b), re-proven under the real runtime role (S1 gap-closing patch)** —
  `tests/integration/iam-db.test.ts`, describe `"S1: end-to-end auth flow under
  role_iam_runtime (NOT superuser)"`. Everything above this point in the file (and the whole
  pre-patch suite) connects as the `postgres` superuser, which bypasses RLS unconditionally —
  the exact blind spot the Opus review flagged. This block creates a genuine `LOGIN` role
  (`iam_app_test`) that is ONLY a member of `role_iam_runtime` (no `BYPASSRLS`, not a table
  owner), points the shared `@aix/foundation` pool at it for the duration of the block, and
  drives the real HTTP routes through it. See §11 for full detail.

## 8. Tests added

- `tests/unit/iam-import-boundary.test.ts` — F3(c) + scanner self-tests.
- `tests/unit/iam-app.test.ts` — no-DB app.inject: validation/`additionalProperties`,
  Idempotency-Key fail-closed (login, refresh), bearer-session fail-closed (sessions, revoke,
  MFA enrol, step-up start), internal-identity fail-closed (freeze-event, verify-assertion,
  service-account validate — missing AND wrong token), 404 envelope + correlation echo.
- `tests/unit/iam-password.test.ts` — Argon2id hash≠plaintext, verify roundtrip, distinct
  salts, malformed-hash fail-closed, dummy-hash never matches.
- `tests/unit/iam-totp.test.ts` — RFC 6238 Appendix B vectors (3 known-answer tests),
  base32 roundtrip, drift-window accept/reject, malformed-code rejection.
- `tests/unit/iam-session-tokens.test.ts` — opaque token distinctness/hash determinism,
  lockout scope-hash determinism/non-collision, MFA secret envelope encrypt/decrypt
  roundtrip + wrong-key authenticated-decryption failure.
- `tests/integration/iam-db.test.ts` (DB-gated, `describe.skipIf(!TEST_DATABASE_URL)`):
  F3(a), F3(b) (DB + app-level), bootstrap (creation + idempotent no-op + blocked login),
  login success with coupled-audit + no-secrets-response-shape assertion, no-enumeration
  (identical error for wrong-password vs. no-such-user), lockout after threshold (denies even
  the correct password while locked), Idempotency-Key replay (no duplicate audit) + conflict
  (different body, same key → `VALIDATION_ERROR`), logout, cross-user session-revoke denial,
  refresh rotation, refresh reuse → family+session revoke with Critical audit, MFA enrol →
  verify → mfa_required on next login → wrong-code fails → correct-code completes login,
  expired-challenge fail-closed, step-up start → verify → internal verify-assertion (correct
  and wrong-purpose), internal freeze-event → immediate revocation + refresh denial,
  internal revoke-user-sessions, service-account validate (correct + wrong credential).
- **`tests/integration/iam-db.test.ts` (gap-closing pass additions)**:
  - S1 role-runtime block (§11/§7 above): login/validateAccessToken/refresh under
    `role_iam_runtime`, unscoped `SELECT * FROM iam.session`/`iam.refresh_token` → zero rows,
    owner-scoped `GET /auth/sessions` isolation between two runtime-role users, F3(a) +
    missing-scope re-proven on the runtime-role connection.
  - Bootstrap admin now completes login end-to-end (enrolment session → start → verify → full
    session), all four S2 audit events present, bootstrap path naturally disabled after
    completion (next login takes the normal MFA-challenge branch), reused enrolment session
    rejected.
  - S2 (non-bootstrap user): wrong TOTP rejected + rate-limited, expired enrolment session
    rejected, no full session issued anywhere before verification succeeds.
  - Password reset: existing-vs-non-existing identical generic response, hash-only token at
    rest, repeated-request rate limiting, valid confirm (password updated, old session
    revoked, new password works / old doesn't), weak password rejected without consuming the
    token, single-use enforcement (replay rejected), expired token rejected, audit/outbox rows
    present.

All pre-existing FND-01 tests continue to pass unmodified; all pre-existing IAM-01 tests
continue to pass (two assertions were INTENTIONALLY updated to reflect the S2 behaviour
change — the bootstrap-admin login response is no longer a hard 401, by design; see §12).

## 9. IAM-02 / SEC-01 / CFG-01 handoff seams

- **IAM-02** owns: real RBAC/permission model (replaces `is_interim_admin`), MFA-reset
  maker-checker approval completion, admin-initiated session/account-unlock actions,
  service-account lifecycle management (creation/rotation with approval). (The out-of-band
  MFA-enrolment-session mechanism previously listed here as an IAM-02 handoff is now built in
  IAM-01 itself — see §12.)
- **SEC-01** owns: the authoritative audit/hash-chain store — `iam.auth_event` is explicitly
  a non-authoritative local index only (§05.8); `audit_event_ref` is an interim string, not a
  real cross-reference.
- **CFG-01** owns: real KMS/HSM-backed key management to replace the passphrase-derived AES
  key in `lib/mfa-secret-crypto.ts`, and the licence-lock interface FND-01 already flagged as
  `not_configured`.

## 10. Next module

**IAM-02** (RBAC / permission guard / SoD), per the SDLC sequence. Out of scope for this pass
(hard rule) — confirmed nothing IAM-02-shaped was built here (no permission/role tables, no
SoD enforcement beyond the interim `is_interim_admin` marker already present before this run).
This gap-closing pass also confirmed nothing IAM-02-shaped was introduced.

---

## 11. S1 gap-closing patch — RLS vs. by-token-hash pre-auth lookup (deploy-blocking)

**Finding (Opus review):** `iam.session`/`iam.refresh_token`/`iam.mfa_factor`/
`iam.device_registry` carry `ENABLE + FORCE ROW LEVEL SECURITY` with an ownership-only policy
(`USING (user_id = current_setting('aix.user_id', true))`). `validateAccessToken()` and
`rotateRefreshToken()` (`lib/session.ts`) resolve the row BY TOKEN HASH, before the owning
user_id is known — on a connection that has not (and cannot yet) set `aix.user_id`. Under
`role_iam_runtime` (the intended non-superuser runtime role) that lookup returned **zero
rows**, i.e. authentication failed closed to "not found" on every single request. The
pre-patch test suite only ever connected as the `postgres` superuser, which bypasses RLS
unconditionally, so this was invisible until the independent review traced the code by hand.

**A second, related discovery made while proving the fix end-to-end:** the SAME problem is
not limited to the two token-hash lookups. Every other write IAM-01 makes to
`iam.session`/`iam.refresh_token`/`iam.device_registry`/`iam.mfa_factor` (session creation on
login, device upsert, MFA-factor enrol/verify, step-up factor reads, logout/session-revoke,
internal freeze/revoke-all) ALSO runs with no `aix.user_id` set, because FORCE RLS's ownership
predicate is used as both the `USING` clause (reads) and the implicit `WITH CHECK` clause
(inserts/updates) when a policy has no separate `WITH CHECK`. Under `role_iam_runtime` this
would have broken login, MFA enrolment/verify, step-up, logout, and internal freeze/revoke —
not just the two functions the review named. **A third discovery, required just to prove ANY
of this end-to-end:** `role_iam_runtime` had no grant at all on `foundation.outbox_event` /
`foundation.idempotency_record` — the two tables `@aix/foundation`'s `publishAudit` /
`beginIdempotent` write to on the CALLER's own connection/role. Without a narrow grant on
exactly those two tables, every audited/idempotent action (i.e. almost every IAM-01 write)
would fail closed with `permission denied for schema foundation` under the runtime role,
regardless of the RLS fix.

**Fix (Option A, SECURITY DEFINER functions for the pre-auth reads; `set_config` scoping for
everything else once the owner is known):**

- `infra/migrations/003_iam_rls_token_lookup.cjs` adds three `SECURITY DEFINER` functions in
  schema `iam`, each `SET search_path = iam, pg_temp` and `REVOKE ALL ... FROM PUBLIC`:
  - `iam.fn_resolve_session_by_token_hash(text)` — replaces the direct `SELECT ... FROM
    iam.session WHERE session_token_hash = $1` in `validateAccessToken`.
  - `iam.fn_resolve_refresh_by_token_hash(text)` — replaces the direct `SELECT ... FROM
    iam.refresh_token WHERE token_hash = $1` in `rotateRefreshToken`.
  - `iam.fn_touch_session_last_seen(text)` — replaces the `last_seen_at_utc` UPDATE in
    `validateAccessToken`, which runs on a bare non-transactional connection (see
    `plugins/user-session.ts`) and so cannot use the `set_config` scoping trick below. (S3,
    §6 gap 12: throttling this write is a separate, non-blocking, explicitly deferred item.)
  - These functions run with the privileges of their OWNER (whoever executes the migration —
    `postgres`, a superuser, per this repo's documented VERIFY flow). `FORCE ROW LEVEL
    SECURITY` makes RLS apply even to a table's owner, so this bypass only works because the
    owner is a superuser/`BYPASSRLS` role; a future non-superuser migration identity would
    need `ALTER FUNCTION ... OWNER TO <a BYPASSRLS role>` — flagged in the migration's header
    comment rather than silently assumed.
  - `EXECUTE` on all three is granted to `role_iam_runtime` in
    `infra/grants/iam_runtime_grants.sql`; NO broader `SELECT` was added for this pre-auth
    path beyond what the existing table-level grant already provided (which RLS still gates).
- Everywhere else, once the owning `user_id` is legitimately established (either resolved via
  one of the functions above, or already known from an authenticated `request.iamSession`),
  the fix is `await client.query("SELECT set_config('aix.user_id', $1, true)", [userId])` on
  the SAME (already-transactional) client BEFORE touching any RLS-protected table — the exact
  pattern `plugins/user-session.ts`'s `withUserScope` already used for `GET /auth/sessions`,
  now applied consistently across `lib/session.ts` (`createSession`, `rotateRefreshToken`
  post-resolve, `revokeSession`, `revokeAllSessionsForUser`, `upsertDevice`) and the route
  handlers that read `iam.mfa_factor` (`routes/auth.ts` login's MFA-factor check,
  `routes/mfa.ts` enrol/verify/challenge-verify, `routes/step-up.ts` start/verify,
  `routes/password-reset.ts` confirm). `revokeSession` and `revokeAllSessionsForUser` now
  scope internally (take/require `userId`) so every caller gets this for free.
- `infra/grants/iam_runtime_grants.sql` also adds `GRANT USAGE ON SCHEMA foundation` +
  `SELECT, INSERT, UPDATE ON foundation.outbox_event, foundation.idempotency_record` to
  `role_iam_runtime` — the narrow "approved foundation interface" every module needs for the
  transaction-coupled audit/idempotency contract. `foundation.module_registry` and every other
  foundation-internal table remain ungranted; F3(a) re-proves this holds under the real
  runtime role, not just the isolated `SET ROLE` probe.
- Nothing was weakened: RLS policies themselves are unchanged, no blanket grants were added,
  and the only new bypass (`SECURITY DEFINER`) is scoped to exactly the pre-auth hash-lookup
  shape of query, gated by an explicit `EXECUTE`-only grant.

**Test (must actually run as `role_iam_runtime`, not superuser):**
`tests/integration/iam-db.test.ts`, describe `"S1: end-to-end auth flow under role_iam_runtime
(NOT superuser)"`. `beforeAll` creates a `LOGIN` role (`iam_app_test`, idempotent `DO` block)
that is granted membership in `role_iam_runtime` ONLY (default `INHERIT`, no `BYPASSRLS`, not
a table owner) — then closes and re-initialises the shared `@aix/foundation` pool
(`closePool()`/`initPool()`) pointed at a connection string using that role, and builds a
FRESH `buildApp()` instance (`runtimeApp`) against it. A separate superuser `pg.Pool`
(`verifyPool`) is kept alive throughout purely to independently verify what actually landed in
the DB, never to drive the app itself. `afterAll` restores the superuser-backed shared pool so
every other describe block in the file is unaffected. Assertions, matching the task brief's
enumerated list: (1) `POST /auth/login` via `runtimeApp` returns `authenticated`, and the
resulting session row is independently confirmed to exist via `verifyPool`; (2)
`GET /auth/sessions` with that access token succeeds (proves `validateAccessToken` resolves
correctly under the runtime role); (3) `POST /auth/refresh` rotates successfully; (4) a raw
`SELECT * FROM iam.session` / `iam.refresh_token` on the runtime-role-backed shared pool
(no `aix.user_id` set) returns **zero rows**, not an unscoped dump; (5) two runtime-role users
each see only their own session in `GET /auth/sessions`, never each other's; (6) F3(a) still
holds on the runtime-role connection (`foundation.module_registry` denied,
`foundation.outbox_event` — the approved narrow interface — still reachable); (7)
`GET /auth/sessions` with no bearer token still fails closed with `AUTH_SESSION_REQUIRED`; (8)
import-boundary is unaffected — it is a static, DB-independent check
(`tests/unit/iam-import-boundary.test.ts`) that always runs as part of the full suite and has
no DB-role dimension to re-assert here.

## 12. S2 gap-closing patch — MFA-required-but-unenrolled completion path

**Finding (Opus review):** the break-glass bootstrap admin (decision #3) is created with
`mfa_required = true` and no active factor. `POST /auth/mfa/enrol` requires an authenticated
session, but `POST /auth/login` refused to issue ANY session — not even a limited one — when
`mfa_required` is set and no active factor exists. Dead end: the very first admin could never
complete login end-to-end.

**Fix — an out-of-band, purpose-scoped "enrolment session":**

- `infra/migrations/004_iam_mfa_enrolment_session.cjs` adds `iam.mfa_enrolment_session`
  (`enrolment_id` non-secret handle, `session_token_hash` — hash-only at rest, mirroring
  `iam.step_up_assertion.assertion_id`/`assertion_hash` — `user_id`, `factor_id`, `status`
  `active|used|expired|revoked`, `expires_at_utc`). Deliberately **NO RLS** on this table —
  the same precedent as `iam.mfa_challenge`/`iam.step_up_assertion`/`iam.service_account`: it
  is looked up by a pre-auth secret hash, before any `user_id` scope can be established, and
  adding FORCE RLS here would reintroduce the exact S1 class of bug for a brand-new table.
- `POST /auth/login` (`routes/auth.ts`): when `mfa_required` is true and no active TOTP factor
  exists, password is already verified at that point, so it now mints a random opaque token
  (`generateOpaqueToken()`), persists only its sha256, and returns
  `{status: "mfa_enrolment_required", enrolment_session_id: <raw token>, expires_at_utc}` —
  15-minute expiry, single-use, bound to the user_id — instead of a hard 401. **No full session
  is issued at this point**, by design (verified in tests).
- `POST /auth/mfa/enrol/start` (new, `routes/mfa.ts`) — unauthenticated; resolves the
  enrolment session by hash, creates a pending TOTP factor (same shape/response as the
  existing authenticated `/auth/mfa/enrol`), records `factor_id` back onto the enrolment
  session row, audits `iam.mfa_enrolment_started`.
- `POST /auth/mfa/enrol/verify` (new) — unauthenticated; verifies the TOTP code (rate-limited
  via the existing `iam.account_lockout`, action `'mfa'`, scoped by the enrolment session's
  hash — same mechanism, no schema change needed), activates the factor, marks the enrolment
  session `used` (single-use — a replay is rejected with `AUTH_ENROLMENT_SESSION_INVALID`),
  audits `iam.mfa_enrolment_verified`, and — if the user is `is_interim_admin` — ALSO audits
  `iam.bootstrap_admin_mfa_completed`. Issues a REAL full session directly (no second
  round-trip / re-login required), matching how `/auth/mfa/challenges/{id}/verify` completes
  ordinary login-MFA.
- New `IamError` code `AUTH_ENROLMENT_SESSION_INVALID` (400, generic message — matches the
  §09 Error Handling "Generic" style already used for `AUTH_RESET_TOKEN_INVALID`) covers
  missing/expired/already-used/mismatched-factor cases without distinguishing which.
- "Bootstrap path disabled after completion" falls out naturally rather than needing a new
  flag: once the factor is active, a subsequent login for that user takes the normal
  MFA-challenge branch (an active factor now exists), never `mfa_enrolment_required` again.

**Tests:** `tests/integration/iam-db.test.ts` — the bootstrap describe block now drives the
full enrolment-to-session flow (was previously asserting the OLD hard-401 behaviour; that
assertion was intentionally replaced, not weakened, since fixing exactly that behaviour is
what S2 is) plus reused-enrolment-session rejection; a new `"S2: MFA enrolment-during-login
(non-bootstrap user)"` describe covers wrong-code rejection + rate-limiting, expired-enrolment-
session rejection, and "no full session issued before verification" for a non-bootstrap user
whose `mfa_required` flag was flipped by an operator (the same dead end via a different
trigger). Four audit event types confirmed present in the outbox:
`iam.mfa_enrolment_required`, `iam.mfa_enrolment_started`, `iam.mfa_enrolment_verified`,
`iam.bootstrap_admin_mfa_completed`.

## 13. Password-reset gap-closing patch (module completeness)

`routes/password-reset.ts` (new file), registered in `server.ts`:

- `POST /auth/password-reset/request` — body `{identifier}`. ALWAYS returns the same generic
  `{status: "if_eligible_notification_sent"}` (matches blueprint §04.2.3 literally) regardless
  of whether the identifier resolves — the route handler sends this response unconditionally;
  only the server-side audit/outbox trail (SEC-01-visible, never client-visible) differs.
  Every call (whether or not it resolves to a user) counts toward the `iam.account_lockout`
  `'reset'`-action throttle, so an attacker cannot distinguish "exists" from "doesn't" by which
  one gets rate-limited first. For a resolved active user: mints an opaque reset token
  (`generateOpaqueToken()`, hash-only at rest in the pre-existing `iam.password_reset_token`
  table, 30-minute expiry), enqueues a `notification.delivery` / `iam.password_reset_
  requested_delivery` outbox placeholder (no email/SMS provider exists this pass — a future
  notification worker drains this topic; the raw token is NEVER put in the outbox payload),
  and audits `iam.password_reset_requested`.
- `POST /auth/password-reset/confirm` — body `{reset_token, new_password}` (field names match
  blueprint §04.2.4). Validates the token (`active`, unexpired) — a per-token-hash lockout
  scope (`'reset'` action) also throttles confirm attempts. Enforces a new minimum
  password-policy floor (`lib/password.ts`'s `validatePasswordPolicy`: ≥12 chars, ≤512, at
  least one letter and one digit — deliberately minimal; password-history-count/breach-
  provider checks remain explicitly deferred, §6 gap 4-adjacent) BEFORE consuming the token —
  a weak-password attempt does not burn a valid token. On success: updates the Argon2id hash +
  `hash_params`/`must_change_password`/`failed_attempt_count` on `credential_password`, inserts
  a `password_history` row, calls `revokeAllSessionsForUser` (every existing session AND
  refresh-token family), marks the token `used` (single-use — a replay is rejected with
  `AUTH_RESET_TOKEN_INVALID`), and audits `iam.password_reset_completed` — all in the SAME
  transaction (§5.5 coupling).
- Both endpoints require `Idempotency-Key` and go through `beginIdempotent`/`completeIdempotent`
  (request: dedupes token minting on retry, though the response is identical either way;
  confirm: a byte-for-byte replay with the same key+body returns `duplicate_submission` rather
  than re-running the reset).
- `server.ts`'s log redaction list now also covers `req.body.reset_token` and
  `req.body.enrolment_session_id` (§2 rule: never log secrets).

**Tests:** `tests/integration/iam-db.test.ts`, describe `"Password reset"` — existing-vs-non-
existing identical generic response + hash-only-at-rest token, repeated-request rate limiting
(`iam.account_lockout` row confirmed), full confirm flow (weak password rejected without
consuming the token, then success with a strong password, old session revoked, new password
works / old doesn't, single-use replay rejected, `iam.password_reset_completed` audited), and
an independently-fabricated expired token rejected. Because no email provider exists, the
confirm tests fabricate a valid `iam.password_reset_token` row directly (same convention the
pre-existing F3(b) RLS fixture tests already use for hash-only secrets) rather than trying to
intercept a real token through an API response that, by design, never contains one.

## 14. S3 (documented, deferred, non-blocking)

See §6 gap 12 for the full note. Summary: `last_seen_at_utc` is still updated on every
`validateAccessToken` call (now via `iam.fn_touch_session_last_seen`, for S1's RLS reasons —
the underlying write-amplification concern is unchanged by that). The review rated this Low
severity and explicitly non-blocking for acceptance; throttling it (only UPDATE when stale by
N seconds) is left as a documented future optimisation rather than implemented speculatively
this pass, per this task's explicit "do not optimise unless trivially safe" instruction.

## 15. C1 closed — outbox grant tightened to INSERT-only (post-final-review patch)

The independent Opus final review (`aix-platform/docs/IAM-01_Final_Review_Opus_v1.0.md`) accepted
IAM-01 with minor conditions; **C1 was the one condition to fix now** and is now closed.

- **Grant:** `infra/grants/iam_runtime_grants.sql` — `role_iam_runtime` on `foundation.outbox_event`
  narrowed from `SELECT, INSERT, UPDATE` to **`INSERT` only** (append-only audit/outbox contract:
  a module must never read or mutate other modules' outbox rows). A `REVOKE SELECT, UPDATE … FROM
  role_iam_runtime` precedes the `GRANT INSERT` so the idempotent script also strips the old
  privilege from an already-provisioned DB, not just a fresh one. `foundation.idempotency_record`
  is **unchanged** (`SELECT, INSERT, UPDATE` — the begin/complete cycle genuinely needs all three;
  its cross-module isolation is carry-forward **C2**, to be resolved at platform level in IAM-02).
- **Foundation helper change (required by the grant):** Postgres requires SELECT privilege on any
  column named in an `INSERT … RETURNING` list. `@aix/foundation`'s `enqueueOutbox`
  (`packages/foundation/src/outbox.ts`) previously did `INSERT … RETURNING outbox_id, topic,
  event_type, status`, which would fail under INSERT-only. The `RETURNING` clause was removed and
  the `OutboxRow` is now built from the already-known local values (surrogate `outbox_id` generated
  in JS, `topic`/`event_type` from the caller, `status` the literal `'pending'`). The return
  type/values are byte-identical — no caller impact. `publishAudit` routes through `enqueueOutbox`,
  so it inherits the fix with no direct table access. This is a change to accepted FND-01 code, so
  **both** the FND-01 and IAM-01 suites were re-verified.
- **Verification (fresh disposable Postgres):** `tsc -b` clean; migrations 001→004 apply; both grant
  files apply; grant inventory confirms `outbox_event` = INSERT only, `idempotency_record` =
  SELECT/INSERT/UPDATE; **118/118 tests pass** (the 2 login-flow tests that failed under a naive
  INSERT-only grant are green again; zero FND-01 regressions). Direct proof under `SET ROLE
  role_iam_runtime`: INSERT into `foundation.outbox_event` **succeeds**, direct `SELECT` **denied**,
  direct `UPDATE` **denied**, `foundation.module_registry` **denied** (F3(a) intact),
  `foundation.idempotency_record` SELECT still allowed.

**IAM-01 is accepted as the implementation baseline.** Remaining carry-forward into IAM-02: C2
(idempotency_record isolation), replace the interim shared-token guard + break-glass admin with real
service identity / RBAC / permission guard / SoD, and C3–C6 non-blocking hardening.

## 16. C2 closed — idempotency_record cross-module isolation (post-final-review patch)

`foundation.idempotency_record` is shared cross-module infrastructure — `role_iam_runtime` needs
the full SELECT/INSERT/UPDATE cycle on it for `beginIdempotent`/`completeIdempotent`, so a
table-level grant alone could not stop IAM-01 reading/mutating FND-01's idempotency rows, or vice
versa. Full detail and verification live in `FND-01_IMPLEMENTATION_NOTES.md` ("C2 closed"
section), since the fix is entirely in shared `@aix/foundation` code and a `foundation`-schema
migration (`infra/migrations/005_fnd_idempotency_module_scope.cjs`), not in `services/iam`.

Summary as it affects IAM-01: every `IdempotencyScope` construction across
`routes/{step-up,internal,auth,password-reset,mfa}.ts` now passes `sourceModule: "IAM-01"`. No
grant on `infra/grants/iam_runtime_grants.sql` changed (the `foundation.idempotency_record`
grant comment was updated to note RLS, not the grant, is the isolation boundary). Verified
independently: full IAM login/session/refresh/MFA/password-reset suite passes (35/35 DB-gated,
123/123 overall), `role_iam_runtime` can create/read/update only its own
(`source_module = 'IAM-01'`) idempotency rows and cannot read or mutate FND-01's, and C1
(`foundation.outbox_event` INSERT-only) remains intact.

**C2 is closed.** IAM-02 may now consume the shared idempotency helper as the third module
(`sourceModule: "IAM-02"`) without widening cross-module access — this `source_module` + RLS
pattern is the standard going forward.
