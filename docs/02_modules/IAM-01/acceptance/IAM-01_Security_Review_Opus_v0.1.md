---
document_id: IAM-01-ACC-002
title: IAM-01 Security Review (Opus, v0.1)
version: N/A
document_status: APPROVED
implementation_status: BLOCKED
module: IAM-01
control: Auth, MFA, session, step-up
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 780e116
---

# IAM-01 Authentication / MFA / Session — Independent Security/Compliance Review (Opus, v0.1)

| Item | Detail |
|---|---|
| Module | IAM-01 Authentication / MFA / Session |
| Artifact | `aix-platform/` — `services/iam` + `002_iam_auth_session` + `iam_runtime_grants.sql`, on the accepted FND-01 baseline |
| Reviewer | Principal Fintech Platform Architect (Opus) — independent review of the Sonnet-implemented core slice |
| Verification | Re-ran `tsc -b` (clean) + full suite **107/107** (14 files) against a fresh disposable Postgres; 16 `iam` tables; both grants apply; teardown clean |
| Verdict | **Do NOT final-accept yet.** Strong, well-built core — but **one confirmed deploy-blocking defect (S1)** and **one functional gap (S2)** must close first, plus deferred endpoints for a complete module. Recommend a gap-closing Sonnet pass, then final sign-off. |

---

## 0. Scope + independence

Independent review of the IAM-01 core slice (I did not write it). I re-verified the build myself and read the security-critical code directly — `server.ts`, `plugins/{internal-identity,user-session}.ts`, `lib/session.ts`, and the RLS policies in `002_iam_auth_session.cjs` — rather than reviewing from the implementation summary. This is a *slice* review (v0.1), not the final acceptance sign-off, because the module is deliberately partial (deferred endpoints, see §4).

## 1. What is genuinely strong

- **Opaque tokens, hash-only at rest** (`session.ts`): raw token via `randomBytes(32)`, only `sha256` persisted, validation by hash+lookup — instant server-side revocation, exactly as decision #2 requires. No JWT.
- **Refresh rotation + reuse detection done right**: a non-`active` refresh token revokes the **whole family + session** and emits a **Critical** audit event; the tagged-result pattern (not throwing) is a thoughtful correctness choice so the revocation/audit rows survive commit rather than being rolled back. Every refresh **re-checks account status** (freeze) before rotating.
- **Constant-time internal-identity compare** (`internal-identity.ts`, `timingSafeEqual`) — closes FND-01 review O2 for IAM's own copy; fails closed on missing/blank/wrong token.
- **AJV `removeAdditional: false`** override in `server.ts` — turns `additionalProperties:false` into a genuine 400 rejection instead of silently stripping unknown fields. (This is the concern I flagged after the last pass — resolved.)
- **Thorough log redaction** of password/new_password/refresh_token/code/assertion/authorization/internal-token.
- **Transaction-coupled audit** on sensitive actions; **no-enumeration** login; **concurrent-session cap**; per-class session policy; no-Exchange boot guard; `auth_event` correctly modelled as non-authoritative (SEC-01 remains store of record).
- **F3(a)** genuinely proven (`SET ROLE role_iam_runtime` → `42501` on `foundation.*`); **F3(c)** import-boundary scanner with self-tests; and the **`withUserScope` transaction-scoping bug** the author found and fixed is a real defense-in-depth correction.

## 2. Findings (ranked)

### S1 — CONFIRMED, deploy-blocking: the FORCE-RLS ownership policy is incompatible with the by-token-hash session lookup, and the tests mask it by connecting as a superuser
`002_iam_auth_session.cjs` puts `ENABLE + FORCE ROW LEVEL SECURITY` on `iam.session` / `iam.refresh_token` / `iam.mfa_factor` / `iam.device_registry` with an **ownership-only** policy:
```
USING (user_id = current_setting('aix.user_id', true))
```
But `validateAccessToken()` and `rotateRefreshToken()` resolve the session/refresh row **by `session_token_hash` / `token_hash`, before the user is known**, on a plain pooled connection that does **not** set `aix.user_id` (no `withUserScope`). Under this policy, `current_setting('aix.user_id', true)` is NULL, the predicate never matches, and the lookup returns **zero rows**.

It passes today only because `TEST_DATABASE_URL` connects as the **`postgres` superuser, which bypasses RLS entirely** (superusers are exempt even from FORCE). The intended production posture is IAM running as **`role_iam_runtime`** (non-superuser, no `BYPASSRLS`) — and under that role **every session validation and refresh would fail closed to "not found," i.e. authentication is fully broken.** The integration suite never exercises this because it runs as superuser.

**Why it matters:** the RLS "backstop" as written doesn't just fail to backstop the main path — it *blocks* it the moment least-privilege is actually applied, which is the whole point of the F3 isolation model.

**Fix options (any one):** resolve pre-auth session/refresh lookups through a `SECURITY DEFINER` function; or add a policy permitting token-hash lookups; or scope the RLS to what is actually owner-queried (e.g. keep RLS on `GET /auth/sessions`-style owner reads via `withUserScope`, and don't force ownership RLS on the token-hash resolution path). **And**: add an integration test that runs the auth flow **connected as `role_iam_runtime`, not superuser**, so this class of defect can never hide again.

### S2 — Medium, functional gap: `mfa_required`-but-unenrolled has no completion path, so the break-glass admin can't onboard
Decision #3's bootstrap admin is created with forced MFA enrolment, but there is no self-service enrolment-during-login flow this pass. The very first admin therefore cannot complete login end-to-end — the platform has no reachable authenticated entry point yet. Needs the enrolment-session/challenge-completion path before IAM-01 can be called done.

### S3 — Low: `last_seen_at_utc` write on every authenticated request
`validateAccessToken` issues an `UPDATE iam.session SET last_seen_at_utc = now()` on each call — a write amplification / row-contention cost on the hot auth path. Consider throttling (e.g. only update if stale by N seconds) post-MVP.

### Completeness (not defects — deferred, documented in the notes)
Password-reset request/confirm, WebAuthn factors, session-anomaly scoring, and MFA-reset approval completion are deferred. Fine as scope, but password-reset in particular is expected for a complete IAM-01.

## 3. F3 closure assessment
- **(a) foreign-schema-denied** — solid, demonstrated under `SET ROLE`.
- **(b) missing-client-scope fails closed** — app-level guard is correct (`requireUserSession` throws before any unscoped query). The **DB-level RLS backstop is where S1 bites**: it is proven only in an isolated SET-ROLE test, not on the real auth path, and as written it would break that path under the runtime role. So F3(b) is *app-level satisfied, DB-level not yet trustworthy* until S1 is reconciled.
- **(c) import-boundary** — solid and generic.

## 4. Regulatory / licence posture
Clean. No Exchange/order-book/matching/market-making/principal-dealing/spread surface; no ledger/balance/audit-edit helper; no IAM-02 RBAC/SoD built (correctly deferred, seam documented). Secrets read from env with a documented KMS placeholder for MFA-seed encryption (KMS remains an open item). Audit is publish-only via the FND outbox; SEC-01 remains the store of record.

## 5. Verdict + conditions

**Strong core, but not ready for final acceptance.** The engineering quality is high and the token/session/refresh design is correct. However **S1 is a genuine deploy blocker** — the module authenticates only because the tests run as a superuser; under the least-privilege runtime role the RLS design as written breaks the auth flow. That must be reconciled and proven with a `role_iam_runtime`-connected test before IAM-01 can be trusted. S2 leaves the platform with no usable admin entry point.

**Must close before final IAM-01 sign-off:**
1. **S1** — reconcile the RLS ownership policy with the by-token-hash lookup, and re-run the integration suite connected as `role_iam_runtime` (not superuser).
2. **S2** — MFA-enrolment completion path so the bootstrap admin can onboard.
3. Password-reset endpoints for module completeness.

**Recommended:** one more focused Sonnet pass to close S1–S2 (+ password-reset), then bring the completed IAM-01 back for final Opus acceptance. S3 and the remaining deferrals can follow. Do not proceed to IAM-02 until IAM-01 is accepted.
