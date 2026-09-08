# IAM-01 Authentication / MFA / Session — Independent Final Security/Compliance Review (Opus, v1.0)

| Item | Detail |
|---|---|
| Module | IAM-01 Authentication / MFA / Session |
| Artifact | `aix-platform/` — `services/iam`, migrations `002/003/004`, `iam_runtime_grants.sql`, on the accepted FND-01 baseline |
| Reviewer | Principal Fintech Platform Architect (Opus) — independent final acceptance review |
| Prior review | `IAM-01_Security_Review_Opus_v0.1.md` (S1/S2 + password-reset raised) |
| Verification | Re-ran `tsc -b` (clean) + full suite **118/118** on a fresh disposable Postgres; migrations 001–004 apply; both grants apply; 3 SECURITY DEFINER fns present; runtime-role block present; teardown clean |

---

## 1. Verdict

**ACCEPT WITH MINOR CONDITIONS.**

S1 is genuinely closed and — critically — now proven under the real least-privilege role `role_iam_runtime`, not just the superuser that masked the original defect. S2 is genuinely closed: the break-glass bootstrap admin can now onboard end-to-end. Password-reset is complete and non-enumerating. Core auth/session/MFA controls are correctly built and verified. The conditions below are least-privilege tightenings and carry-forward items, not functional defects; **C1 should be applied now** (a one-line grant change), the rest carried into IAM-02.

## 2. Verification summary

- **Commands:** `npx tsc -b`; drop/create `aix_iam_rev`; `node-pg-migrate up` (001→004); apply `fnd_runtime_grants.sql` + `iam_runtime_grants.sql`; `vitest run` with `TEST_DATABASE_URL`; drop DB + test role.
- **Result:** `tsc` exit 0. **14 test files, 118 tests, 0 failures** (unit 84 incl. import-boundary/totp/session-tokens/app/password; integration `iam-db` 34).
- **DB/grants:** 16 `iam` tables; 3 `SECURITY DEFINER` functions each with `proconfig = search_path=iam, pg_temp`; `role_iam_runtime` holds `iam.*` DML + `foundation.{outbox_event,idempotency_record}` DML + EXECUTE on the 3 functions; **denied** on `foundation.module_registry` (F3(a)).
- **Runtime-role:** the integration suite creates a LOGIN role member of `role_iam_runtime` and drives login/refresh/GET-sessions through it — the exact path that would have caught the original S1.

## 3. S1 status — CLOSED (verified)

Pre-auth by-token-hash resolution now runs through 3 `SECURITY DEFINER` functions (`iam.fn_resolve_session_by_token_hash`, `fn_resolve_refresh_by_token_hash`, `fn_touch_session_last_seen`). Reviewed and sound:
- **Bodies** are trivial parameterized `SELECT`/`UPDATE` (no dynamic SQL → no injection), return **only the minimal columns**.
- **`SET search_path = iam, pg_temp`** on every function → no search-path hijack.
- **`REVOKE ALL … FROM PUBLIC`** + `EXECUTE` granted only to `role_iam_runtime`.
- Everywhere the user is known, RLS is **satisfied** via `set_config('aix.user_id', …, true)` on the same transaction (extends `withUserScope`) rather than broadly bypassed.
- The runtime-role test proves: login creates a session, `validateAccessToken`/refresh succeed, a direct unscoped `SELECT * FROM iam.session` returns zero rows (RLS holds), two users' session lists never overlap, F3(a) still denies `foundation.module_registry`, missing-scope still fails closed.

The patch also correctly found that **FORCE RLS blocked writes** (`WITH CHECK`), not only the two SELECTs — the broader fix (scope-before-write) is right.

## 4. S2 status — CLOSED (verified)

`mfa_required` + no active factor now returns `mfa_enrolment_required` + a raw `enrolment_session_id` and **no session**. `/auth/mfa/enrol/start` (look up by `sha256` hash, active+unexpired, supersede prior pending factor, store AES-256-GCM-encrypted TOTP secret) → `/auth/mfa/enrol/verify` (verify TOTP, activate factor, **mark enrolment single-use `used`**, then `createSession`). Verified: no full session before TOTP verification; enrolment session is random, **hash-only at rest**, bound to `user_id`+`factor_id`, expiring, single-use, rate-limited; `is_interim_admin` emits `bootstrap_admin_mfa_completed` and completes login. The bootstrap path is create-once (guarded by "no `iam.user_identity` exists"), so it self-disables after first onboarding. Audit events emitted at each step.

## 5. Password-reset status — COMPLETE (verified)

`/auth/password-reset/request` returns an **identical** `if_eligible_notification_sent` envelope whether or not the identifier resolves (no enumeration), and counts every request toward the throttle so timing/rate-limit can't distinguish existence. Token is opaque, **hash-only at rest**, 30-min expiry, single-use. `/auth/password-reset/confirm` validates the token, enforces password policy, updates the **Argon2id** hash, writes `password_history`, **revokes all sessions + refresh families**, marks the token `used`, emits transaction-coupled audit, and is rate-limited. Delivery is an **outbox placeholder** (no email provider) and the **raw token is never placed in the outbox payload**.

## 6. F3 status

- **(a) foreign-schema-denied** — holds; `foundation.module_registry` denied to `role_iam_runtime`.
- **(b) missing-client-scope fails closed** — app-level (`requireUserSession` throws before any query) **and** DB-level RLS backstop is now genuinely exercised under `role_iam_runtime` (not just superuser). This is the material improvement over v0.1.
- **(c) import-boundary** — holds (`services/iam` imports only the bare `@aix/foundation` specifier; no `services/fnd` internals).

## 7. Security / compliance posture

Argon2id hashing; opaque DB-backed sessions (no JWT) with instant revocation; refresh rotation + reuse→whole-family revoke + Critical audit; account-status/freeze re-check on every refresh; per-class session policy + concurrent-session cap; IAM-side rate-limit/lockout on login/MFA/reset/refresh; constant-time internal-token compare; standard envelope; TypeBox validation with `additionalProperties:false` **and** AJV `removeAdditional:false` (genuine reject); correlation ID + transaction-coupled audit on sensitive actions; idempotency on replay-sensitive writes; thorough log redaction; no plaintext password/session/refresh/reset/enrolment/MFA-seed at rest (MFA seed is AES-256-GCM authenticated-encrypted). **Licence posture clean:** no Exchange/order-book/matching/market-making/principal-dealing/spread surface; no ledger/balance/audit-edit helper; **no IAM-02 RBAC/SoD built** (seam documented). `packages/foundation/src` and `services/fnd/src` unmodified.

## 8. Observations ranked by severity

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| **C1** | **Medium** | `role_iam_runtime` is granted `SELECT, INSERT, UPDATE` on `foundation.outbox_event`, but `enqueueOutbox`/`publishAudit` only **INSERT**. The extra `SELECT` lets IAM read **every module's** audit-event payloads; `UPDATE` lets it mutate other modules' outbox delivery state. Over-privileged cross-module read/write. | **Condition — fix now:** narrow to `INSERT` (+ only the columns needed). One-line change in `iam_runtime_grants.sql`; re-verify. |
| C2 | Medium | `foundation.idempotency_record` is a shared table with **no RLS/scoping**; IAM legitimately needs INSERT/SELECT/UPDATE (the begin/complete pattern), but so does every module — so any grantee can read/alter another module's idempotency rows. | Carry-forward: decide at platform level — RLS by `source_module`/actor, per-module idempotency tables, or accept as trusted-infra with the risk documented. Not IAM-specific. |
| C3 | Low | The 3 SECURITY DEFINER functions are owned by a **superuser** (migration identity). Safe as written, and the migration documents the sharp edge, but superuser ownership maximises blast radius if a body ever changes. | Harden later: own them by a dedicated non-superuser `BYPASSRLS` role. |
| C4 | Low | MFA-seed encryption key is `SHA-256(passphrase)` — real at-rest confidentiality, but not a salted/stretched KDF, and no key rotation. Documented KMS handoff. | Carry to SEC-01/CFG-01 KMS work. |
| C5 | Low | `password_history` is **written** on reset but reuse is **not enforced** ("not in last N"). | Completeness follow-up. |
| C6 | Low | `last_seen_at_utc` write on every authenticated request (S3, previously acknowledged). | Deferred; throttle later. |

## 9. Go / no-go for IAM-02

**GO.** IAM-01 is accepted as the authentication baseline. The `@aix/foundation` reuse, opaque-session model, RLS/SECURITY-DEFINER pattern, and F3 test harness are sound foundations for IAM-02 to build permission-guard/RBAC/SoD on top of. Apply **C1** before or as the first commit alongside IAM-02.

## 10. Conditions to carry into IAM-02

1. **C1 (now):** tighten the `foundation.outbox_event` grant to INSERT-only and re-run the suite.
2. **C2:** resolve shared-`idempotency_record` cross-module isolation at the platform level (RLS or per-module) — IAM-02 will add a third consumer, so decide before the pattern proliferates.
3. **Replace the interim seams** IAM-01 stood up: the IAM internal shared-token guard and the break-glass bootstrap admin must be superseded by real IAM service-identity + IAM-02 permission guard / RBAC (the interim admin is flagged `is_interim_admin` for exactly this).
4. **C3/C4/C5/C6** as non-blocking hardening/completeness follow-ups.
5. Reuse the `role_iam_runtime`-connected integration pattern as the **standard** for every future module (it is what caught S1) — no module's DB tests should run solely as superuser.

*No code was written in this review.*
