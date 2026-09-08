---
document_id: IAM-02-ACC-001
title: IAM-02 Security Review (Opus, v0.1)
version: N/A
document_status: APPROVED
implementation_status: ACCEPTED
module: IAM-02
control: RBAC, permission guard, segregation of duties
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 780e116
---

# IAM-02 RBAC / Permission Guard / SoD — Independent Security/Compliance Review (Opus, v0.1)

| Item | Detail |
|---|---|
| Module | IAM-02 RBAC / Permission Guard / Segregation of Duties (Phases 0-5) |
| Artifact | `aix-platform/` — `services/iam2`, migrations `006`/`007`, `iam2_runtime_grants.sql`, on the FND-01 + IAM-01 + C1/C2 baseline |
| Reviewer | Principal Fintech Platform Architect (Opus) — independent post-implementation review |
| Scope reviewed | Phases 0-5 only (Phases 6-7 correctly deferred). Blueprint v1.2. |
| Verification | Own run: `tsc -b` clean; migrations 001→007 apply; 3 grant files apply; **196/196 tests** on a fresh disposable Postgres; two findings reproduced empirically via direct probes under the real runtime role. |

---

## 1. Verdict

**ACCEPT WITH CONDITIONS — two must-fix defects before IAM-02 is an accepted baseline and before any money-tier module integrates with it.**

The build is high quality: the precedence chain, licence-lock/prohibited supremacy, opaque single-use decision tokens, the config-sealed one-time bootstrap transition, least-privilege grants, and the runtime-role-connected test discipline are all sound and were verified in code and against a live database. **However, the two headline controls this module exists to provide do not fully hold as the blueprint specifies:**

- **F1 (High):** the generic `execute-verify` endpoint does **not** bind a decision token to the actor/action/resource/entity/client it was issued for — approval-to-execution binding rests on payload-hash alone (which is optional). Proven: a token minted to approve *withdrawal wdr_1* was redeemed for *a different actor, action `led.journal.post`, and entity* and returned `execution_authorised: true`.
- **F2 (High):** `checkApprovalSodConflict` runs concurrent queries on a single pooled DB connection, racing the RLS `set_config` — the exact bug class that already bit this codebase once (IAM-01 `withUserScope`). It can cause the SoD conflict check to silently see zero rows (fail-open).

Neither is exploitable end-to-end in the current partial system (no downstream money module exists yet; no real maker/approver SoD conflict data is seeded). Both are localized, small fixes. This is the same disposition IAM-01 got at its S1/S2 stage: **conditionally accept, fix, re-verify** — not a rejection of the design.

## 2. Verification summary

- `npx tsc -b` exit 0. Fresh `aix_iam2_opus` DB: migrations 001→007 apply; `fnd`/`iam`/`iam2` grant files apply; `vitest run` → **19 files, 196 tests, 0 failures** (44 FND + 123 IAM-01, both unregressed; 29 IAM-02 incl. the reject-expiry regression test).
- The DB-gated IAM-02 suite connects as `role_iam2_runtime` via a real LOGIN role from the start (the S1 lesson applied from day one — good).
- Both findings below were reproduced by me directly against the running app / DB, not inferred from code alone. Test DB dropped; no stray DBs/roles.

## 3. Findings

### F1 — `execute-verify` does not enforce decision-token binding (High; fix before money-tier integration)

`04_API_Specification.md` §2.2 and §5.8 rule 6 / §5.9 require the decision token to be **bound** to actor, session, action, resource, entity, client, and payload hash, and re-validated at execution — "approval cannot be reused for a different entity, amount, destination, client, or action scope." The `iam2.permission_decision_token` row **stores** all of these, and `verifyAndConsumeDecisionToken` **returns** them — but the `POST /internal/iam2/permission/execute-verify` handler (`routes/internal.ts`) passes only `decision_token`, `current_payload_hash`, and `session_id` into the verifier and compares **none** of the presented `actor_id`/`action`/`resource`/`entity_id`/`client_id` against the token's bound values. Verification therefore rests on: payload-hash equality (optional — `null == null` passes), a conditional session check (skipped entirely when the token's `session_id` is null, which it always is for approval-issued tokens), and cache-version.

**Reproduced (live app, this review):**
- A token minted to approve `wdr.withdrawal.approve` / entity `wdr_1` / maker `userA`, **with** a payload, was accepted by `execute-verify` when presented with `actor_id=SOMEONE_ELSE`, `action=led.journal.post`, `entity_id=wdr_999_DIFFERENT` and the matching `current_payload_hash` → `200 { execution_authorised: true, verified_session: true }`.
- An approval created with **no** `payload` mints a token with `payload_hash = null`; it was then redeemed with no `current_payload_hash` and arbitrary action/entity/actor → `200 execution_authorised: true`. This is a pure 12-minute single-use bearer token, unbound to anything.

Note the response hardcodes `verified_payload_hash/verified_cache_version/verified_session: true` regardless of what was actually checked — misleading, and part of the same gap.

**Why it matters:** this endpoint is precisely the control that is supposed to bind a *withdrawal approval* to a *specific withdrawal* when WDR-01/LED-01/TRD-01 call it. A downstream module receives `execution_authorised: true` and proceeds with **its own** action/entity, trusting IAM-02 confirmed the token matches. `routes/roles.ts` (IAM-02's in-process caller) already does the right thing — it re-checks `verified.action`/`actorUserId`/`entityId` after `verifyAndConsumeDecisionToken` — so the fix is to move that same binding comparison **into** `verifyAndConsumeDecisionToken` / the `execute-verify` handler so every caller gets it. Also: require a non-null `payload_hash` for any approval-issued token (a null-payload approval should not mint a redeemable token), and stop hardcoding the `verified_*` response flags.

**Mitigating:** the token is an opaque secret held by the approved maker; no downstream caller exists yet; IAM-02's own role-assignment path is not affected. Not currently exploitable — but it is the module's central binding control and must be correct before it guards money.

### F2 — concurrent queries on one PoolClient race the RLS scope in `checkApprovalSodConflict` (High; fail-open on a security control)

`lib/sod.ts::checkApprovalSodConflict` does:
```ts
const [maker, approver, rules] = await Promise.all([
  effectiveGrants(client, input.makerUserId),   // set_config('aix.user_id', maker) then SELECT
  effectiveGrants(client, input.approverUserId), // set_config('aix.user_id', approver) then SELECT
  activeSodRules(client),
]);
```
Two `effectiveGrants` calls run **concurrently on the same pooled connection**, each doing `SET set_config('aix.user_id', …, true)` followed by an RLS-gated `SELECT` on `iam2.user_role`. node-postgres emitted its "client.query() called while the client is already executing a query" deprecation warning during my probe run — confirming the concurrency is real on the live approval path. Because the two `set_config` statements and their `SELECT`s interleave nondeterministically on one connection, a `SELECT` can execute while `aix.user_id` holds the **other** user's id; under `FORCE ROW LEVEL SECURITY` the ownership policy then hides that user's rows and `effectiveGrants` returns **empty** — so a genuine maker↔approver SoD conflict is **missed (fail-open)**. This is the identical failure mode the codebase already hit and fixed once (IAM-01 `withUserScope`, documented in `IAM-01_IMPLEMENTATION_NOTES.md` §7).

`checkRoleAssignmentSodConflict` happens to be safe today (only **one** of its three parallel queries issues a `set_config`, so nothing competes to clobber `aix.user_id` before its SELECT) — which is why the role-assignment SoD test passes and this stayed hidden. But it is the same anti-pattern and should also be serialized.

**Fix:** run these queries sequentially (`await` each), or scope each `effectiveGrants` on its own dedicated client/transaction. Never issue concurrent `query()` calls on one pooled connection, especially any that set transaction-local RLS scope.

**Mitigating:** latent — no `role_permission` rows are seeded yet, so effective permission sets are currently empty and the seeded meta-SoD (`permission_permission`) rule cannot match regardless; the fail-open only bites once real role→permission wiring exists. Fix before that lands.

### Lower-severity observations (carry-forward, not blocking)

- **L1 — decision-token freshness vs. account freeze.** `execute-verify` re-checks cache-version (permission changes) but not account/session **freeze** or auth-level (blueprint §2.2 rule 4). Guard step 3 is also a documented no-op. Both need an IAM-01 HTTP endpoint that reports session/freeze status, which doesn't exist and is IAM-01's to add — legitimately deferred, but track it: a frozen actor with unchanged permissions currently still passes execute-verify.
- **L2 — step-up assertions are reusable within their freshness window.** IAM-01's `verify-assertion` is deliberately not single-use, so one `iam2_approval`-purpose step-up assertion can authorize multiple distinct approval decisions by the same approver within ~10 min. Matches IAM-01's documented model; for high-value approvals consider requiring a fresh, approval-bound step-up. Minor.
- **L3 — trust model.** The entire authorization plane is currently keyed on one shared internal-service-token plus caller-supplied `*_user_id` body fields (IAM-02 has no user-session auth of its own yet). Documented (`IAM-02_IMPLEMENTATION_NOTES.md` §8.6) and acceptable as an interim seam, but it means that shared secret's compromise = full authz compromise. The interim service-identity replacement (implementation plan §5) should not slip.

## 4. What is correct and verified (not exhaustive)

- **Licence-lock (step 1) and prohibited (step 2) are checked before any override/role resolution and are non-overridable** — verified in `guard.ts` and by the seeded 7 Exchange permissions (`prohibited=true, licence_locked=true`). No Exchange runtime route registered; boot guard intact.
- **Decision-token mechanics** (opaque, sha256-at-rest, single-use consume, revoke-on-payload-mismatch with Critical `iam2.approval_payload_hash_mismatch` audit, stale-cache-version block) are well built — the gap is purely the missing field-binding comparison (F1), not the token machinery.
- **Meta-SoD is genuinely enforced at the effective-permission level**, not seeded-but-inert — `lib/sod.ts` resolves `permission_permission` rules against each side's effective permission set. (Subject to the F2 concurrency fix.)
- **Bootstrap-to-RBAC transition** matches the approved design exactly: config-flag + config-sealed `user_id`, purpose-bound IAM-01 assertion whose `user_id` must equal the sealed value, `auth_level` presence required, structurally one-time via a narrow count-only `SECURITY DEFINER` function under `SERIALIZABLE`, `security_admin`/`tech_admin` only, single generic denial for every failure branch. Sound.
- **IAM-01 HTTP client is fail-closed** on network error, non-2xx, and `valid:false` alike.
- **Grants** are per-table least-privilege; `role_iam2_runtime` is denied on `iam.*` and `foundation.module_registry`, INSERT-only on `foundation.outbox_event` (C1 holds for the third module), and `source_module`-scoped on `foundation.idempotency_record` (C2 holds) — all re-verified under a real LOGIN role.
- **Import boundary** holds; `packages/foundation` and `services/iam` unmodified.
- The **reject-expiry rollback bug** found during implementation verification is fixed and regression-tested.

## 5. Conditions & go/no-go

**Conditions to clear before IAM-02 is accepted as a baseline (a small Sonnet fix-pass + re-verify, then a short re-review):**
1. **F1** — enforce decision-token binding in `execute-verify`/`verifyAndConsumeDecisionToken` (compare presented actor/action/resource/entity/client to the token's bound values); require non-null `payload_hash` for approval-issued tokens; stop hardcoding the `verified_*` response flags. Add tests: token bound to entity A rejected for entity B; null-payload approval mints no redeemable token.
2. **F2** — serialize the queries in `checkApprovalSodConflict` (and `checkRoleAssignmentSodConflict`); never run concurrent `query()` on one PoolClient. Add a test that a maker↔approver SoD conflict actually blocks at approval time.

**Go/no-go for Phase 6-7 / next module:** **Conditional GO.** The architecture is right and the deferred Phase 6-7 scope is correctly tracked. Clear F1 and F2 first (they are in the two controls this module exists to provide), then this is a solid base for the RBAC/approval machinery downstream modules will lean on. Carry L1-L3 forward.

*No code was written in this review; findings F1 and F2 were reproduced against a disposable database and it was torn down.*
