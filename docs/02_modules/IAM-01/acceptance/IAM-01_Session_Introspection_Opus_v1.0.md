---
document_id: IAM-01-ACC-003
title: IAM-01 Internal Session Introspection — Independent Final Acceptance (Opus, v1.0)
version: N/A
document_status: APPROVED
implementation_status: ACCEPTED
module: IAM-01
control: Internal client session-introspection seam (WLT-01 BLOCKER-1 prerequisite)
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 5a29559
---

# IAM-01 Internal Session Introspection — Independent Final Acceptance (Opus, v1.0)

| Item | Detail |
|---|---|
| Module | IAM-01 — new internal route added to the accepted Authentication / MFA / Session baseline |
| Artifact | `services/iam/src/{config,server,routes/internal,lib/{errors,session}}.ts` + `tests/integration/iam-session-introspection.test.ts` |
| Trigger | WLT-01 BLOCKER-1 — WLT-01 had no legal mechanism to resolve a client bearer token into an authenticated identity/`userClass` (IAM-01's client authentication is an in-process `requireUserSession` preHandler; WLT-01 cannot import it under the F3(c) module-import boundary, holds no `iam.*` DB grant, and IAM-01 exposed no introspection HTTP seam) |
| Implementation commit | `5794ffe` — `feat(iam): add internal session introspection` |
| Test-harness remediation commit | `5a29559` — `test(iam): add fail-loud introspection canary` |
| Reviewer | Independent Opus acceptance review (architecture pass + implementation pass + this final acceptance pass, three separate turns) |
| Verification | Re-ran `tsc -b` (clean); IAM-01 suite 120/120 (7 files); IAM-02 suite 83/83 (5 files); full platform canonical suite 179/179 files, 4708/4708 tests, 0 failures, on a freshly migrated disposable Postgres (head `067`, all 9 grant files applied); four independent adversarial probes on disposable scratch databases (reverse token-direction isolation, live 403→401 collapse cross-check, auth-event-write-failure behaviour, empty/unmigrated-DB false-green reproduction and its subsequent remediation) |

---

## 1. Verdict

**ACCEPTED.** `validateAccessToken` is reused byte-unchanged; `requireUserSession` and every pre-existing `/internal/auth/*` route are untouched; the negative-state collapse genuinely eliminates a 403 account-state oracle (independently proven, not merely asserted); infrastructure failure stays distinguishable from an invalid identity; the dedicated capability token is enforced bidirectionally; no raw token or its hash is ever logged, audited, or persisted; the response is an explicit four-field allowlist; no migration; no grant widening; no `iam.*` grant reaches WLT. Two post-acceptance TEST findings (a missing fail-loud DB-readiness canary and a dead no-op assertion) were identified in the final acceptance pass and closed test-only in a follow-up commit, independently re-verified.

**IAM-01 SESSION INTROSPECTION: COMPLETE / ACCEPTED**
**WLT-01 BLOCKER-1: SATISFIED**
**BLOCKER-2: REMAINS OPEN — SHARED RATE-LIMIT ENGINE**

## 2. Accepted route contract

`POST /internal/auth/session/validate` — internal only, no public alias, no GET/PUT/DELETE equivalent.

- **Request:** `{ access_token: string }` — `minLength: 1`, `maxLength: 512`, `additionalProperties: false`. The token travels in the body, never `Authorization` (that header identifies the *calling service* on this route via the guard).
- **Caller authority:** `makeIamInternalIdentityGuard(iamIntrospectionServiceToken)` — a DEDICATED capability secret (`IAM_INTROSPECTION_SERVICE_TOKEN`), distinct from `IAM_INTERNAL_SERVICE_TOKEN`. The general internal token does not open this route; this route's token does not open any other `/internal/auth/*` route (independently probed in both directions).
- **Canonical validation reuse:** the handler calls `validateAccessToken(client, access_token)` verbatim — no independent token hashing, no independent `fn_resolve_session_by_token_hash` call, no independent expiry/status check, no independent `user_class` derivation. `validateAccessToken`'s function body is byte-identical to the pre-implementation commit.
- **Positive response (`data`):** exactly `valid`, `user_id`, `session_id`, `user_class`. No `expires_at_utc` (deliberate — prevents caching authority across requests), no PII, no session metadata, no token hash.
- **Negative collapse:** `AUTH_SESSION_REQUIRED` / `AUTH_SESSION_REVOKED` / `AUTH_SESSION_EXPIRED` / `AUTH_ACCOUNT_FROZEN` (`SESSION_VALIDATION_NEGATIVE_CODES`, exported beside `validateAccessToken`) all collapse to a single `401 AUTH_SESSION_REQUIRED`. Independently verified: on the same suspended account and the same token, the canonical `/auth/sessions` route still returns `403 AUTH_ACCOUNT_FROZEN` while this seam returns `401 AUTH_SESSION_REQUIRED` — the account-state oracle genuinely does not survive at the seam.
- **Infrastructure failure:** a pool-acquire failure or any exception inside `validateAccessToken` that is not one of the four negative codes maps to `503 AUTH_SESSION_INTROSPECTION_UNAVAILABLE` — never a negative-auth 401, never `200 { valid:false }`.
- **Denial audit-write failure (independently probed):** if the `iam.session_introspection_denied` write itself fails (a trigger was installed on a disposable database to force this), the route surfaces canonical `500 INTERNAL_ERROR` — never `200`, never `401`. Still fail-closed; a downstream caller must treat any non-200/non-401 as unavailable.

## 3. Audit / evidence behaviour

- Successful introspection publishes **no** SEC-01/business audit event (would be high-frequency noise on every downstream public request). SEC-01 IAM audit-event inventory independently reconstructed at **30 — unchanged**.
- A negative result writes exactly one `iam.session_introspection_denied` row to the IAM-local `iam.auth_event` table (`result: "blocked"`, `user_id: null`) — no field on that table is capable of carrying the raw token or its hash, and neither ever appears there.
- `last_seen_at_utc` still advances on every successful call (`validateAccessToken`'s existing, unmodified behaviour) and does not advance on a failed call; `expires_at_utc` is never extended by introspection.

## 4. Findings — carried (none fixed by design)

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| FINDING-A (`IAM1-FIND-001`) | INFORMATIONAL | `user_class` is `iam.session`'s own snapshot column at session creation, not a live `iam.user_identity.user_class` read — identical to pre-existing `requireUserSession` semantics. Pinned by a test that mutates the underlying user row beneath a live session and proves the snapshot value is still returned. | Not fixed — this is pre-existing canonical behaviour, deliberately preserved rather than silently changed. Any future user-class mutation path must revoke sessions or resolve live, as its own separate task. |
| FINDING-B (`IAM1-FIND-002`) | LOW | Every successful introspection advances the canonical `last_seen_at_utc` touch. Once WLT-01 public traffic exists this raises IAM-01 write volume; no authentication-semantic effect (idle timeout unenforced today). | Not fixed — raises the priority of the already-documented deferred throttle (S3), out of scope here. |
| FINDING-C (`IAM1-FIND-003`) | MEDIUM | The dedicated token is capability scoping via the existing shared-secret guard, not true per-caller cryptographic service identity — honestly documented in the code's own comments. | Accepted interim architecture, consistent with every other `/internal/*` guard platform-wide. Should be an early adopter of real per-caller service identity when that model lands. |
| NEW-3 (`IAM1-FIND-004`) | INFORMATIONAL | `SESSION_VALIDATION_NEGATIVE_CODES` has no compile-time exhaustiveness binding to `validateAccessToken`'s throws. | Not fixed — a future untracked code fails toward 503 (safe direction), not toward a false 401/200. |
| NEW-4 (`IAM1-FIND-005`) | INFORMATIONAL | Auth-event write failure surfaces as canonical 500 rather than the seam's own 503 (independently reproduced by probe, §2 above). | Not fixed — still fail-closed; recorded as a documented behaviour a future WLT IAM client must account for. |

## 5. Findings — closed this pass (test-only)

| ID | Severity | Finding | Resolution | Closure commit |
|---|---|---|---|---|
| NEW-1 (`IAM1-FIND-006`) | MEDIUM | The introspection acceptance suite had no fail-loud DB-readiness canary (H-D3C-1 convention). Against a completely unmigrated database it reported **48/48 passing in 28 ms** — every DB-gated test body silently early-returned. Zero production impact; regressed an already-accepted platform control. | Applied the exact established pattern from `iam-db.test.ts`/`iam2-db.test.ts`/`sec1-db.test.ts`/`cfg1-db.test.ts`/`aml1-db.test.ts`/`wlt1-db.test.ts`: the file's first test now does `if (!schemaReady) return expect(schemaReady, "run migrate:up + iam_runtime_grants.sql first").toBe(true);` instead of a silent early-return. No new test added — the existing first test is reused as the canary, matching the platform convention exactly. Independently re-verified: against a fresh, deliberately unmigrated database the suite now fails loudly (`Test Files 1 failed`, `Tests 1 failed | 47 passed`, vitest exit code **1**). | `5a29559` |
| NEW-2 (`IAM1-FIND-007`) | LOW | A dead no-op loop (`for (const c of cases) { void c; }`) under a comment claiming the 403 `AUTH_ACCOUNT_FROZEN` oracle never surfaces from this route — asserted nothing. | Removed, without a replacement cosmetic assertion. The adjacent real test (`"the 403 that AUTH_ACCOUNT_FROZEN would produce on /auth/sessions never appears via introspection..."`) already proves the property end-to-end and was left unmodified. | `5a29559` |

## 6. Inventory after state (independently reconstructed, not merely trusted)

| Inventory | Before | After | Verified |
|---|---|---|---|
| IAM HTTP routes | 21 | **22** | ✅ (5 internal, 17 public — unchanged) |
| IAM errors | 26 | **27** | ✅ only `AUTH_SESSION_INTROSPECTION_UNAVAILABLE` added |
| IAM config keys | 15 | **16** | ✅ |
| IAM redaction paths | 11 | **12** | ✅ `req.body.access_token` added |
| IAM tables | 17 | **17** | ✅ unchanged |
| IAM SEC-01 business audit events | 30 | **30** | ✅ unchanged |
| IAM test files | 6 | **7** | ✅ (canary reuse — no new test added at the harness-remediation step) |
| Migration head | `067_clt1_authorised_user_iam_binding` | **unchanged** | ✅ |
| IAM runtime grants | — | **unchanged** | ✅ `git diff` against `infra/grants/` = 0 |
| WLT `iam.*` grant | none | **none** | ✅ |

## 7. Canonical test baseline

- IAM-01: **7 test files, 120/120 tests**
- IAM-02: **5 test files, 83/83 tests**
- Focused introspection suite: **48/48 tests** against a correctly migrated database; independently reproduced to **fail loudly** (1 failed, vitest exit 1) against an unmigrated database after the NEW-1 remediation
- TypeScript (`tsc -b`): **0 errors**
- Full platform canonical (sequential, `--no-file-parallelism`): **179 test files, 4708/4708 tests, 0 failures**

## 8. Downstream WLT-01 readiness

This seam supplies exactly what the frozen WLT-01 public-surface authority chain requires:

```
Authorization: Bearer → POST /internal/auth/session/validate
  → 200 { user_id, user_class, session_id }
  → WLT enforces userClass ∈ {client, client_approver}
  → CLT GET /internal/clt1/principals/:iam_user_id/client-memberships
  → active client → WLT operation
```

`user_id` feeds CLT's path parameter and WLT's future audit actor; `user_class` feeds the allowlist gate CLT's own membership route makes a precondition of treating membership as authority. Any non-200/non-401 response must be treated as IAM unavailability by WLT's future client — never as a valid or invalid identity.

**Downstream WLT config obligation (recorded, not implemented):** because the guard uses a dedicated capability token, WLT's future IAM client will require its own configuration value for the credential it presents as `x-internal-service-token` when calling this seam — a *dedicated IAM introspection service credential*, distinct from any other internal-service token WLT already holds. No final WLT env-key name is fixed here; none is controlled by an accepted WLT implementation contract yet. This reconciles the WLT public-surface config delta from the earlier estimate of +13 (21→34) to **+14 (21→35)**. WLT code and configuration are unmodified by this record.

## 9. What this record does not do

- Does not implement, start, or resolve **BLOCKER-2** (shared rate-limit engine) — remains OPEN.
- Does not implement any WLT-01 public route or WLT-01 configuration.
- Does not fix FINDING-A, FINDING-B, FINDING-C, NEW-3, or NEW-4 — all carried, as recorded in §4.
- Does not reopen or alter the WLT-01 blueprint v1.1/v1.2 authority conflict, WLT-01 monetary-coercion/concentration/step-up deferrals, any CLT-01 finding, the IAM-02 double-consume triage, WDR-01/KMS, or shared-DB test-environment drift.

## 10. Final verdict

**IAM-01 SESSION INTROSPECTION:
COMPLETE / ACCEPTED**

**WLT-01 BLOCKER-1:
SATISFIED**

**BLOCKER-2:
REMAINS OPEN — SHARED RATE-LIMIT ENGINE**

*No code was written in this acceptance record's own review pass; all commits cited above were produced and independently re-verified in their own dedicated turns.*
