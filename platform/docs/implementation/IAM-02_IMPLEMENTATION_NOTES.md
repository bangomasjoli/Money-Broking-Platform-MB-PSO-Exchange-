# IAM-02 RBAC / Permission Guard / SoD — Implementation Notes

Module: **IAM-02 RBAC / Permission Guard / Segregation of Duties**
Blueprint: `aix-platform-docs/modules/IAM-02_RBAC_Permission_Guard_SoD_Blueprint_Pack_v1.2/`
Plan: `docs/implementation/IAM-02_Implementation_Plan_v1.0.md`
Implementation status: **Phases 0-5 implemented, Opus-reviewed, and accepted as an
implementation baseline** (211/211 tests green on a fresh disposable Postgres, after the F1/F2
gap-closing pass — see §10). Phases 6-7 are explicitly deferred — see §7. Built in two stages
(Sonnet), each independently verified against a fresh disposable Postgres before the next
stage began, mirroring the FND-01/IAM-01 build discipline.

---

## 1. Scope implemented

- **Phase 0** — new service `services/iam2` (`@aix/service-iam2`), scaffolded as IAM-01's own
  copy (Fastify 5, TypeBox, `removeAdditional: false` override, log redaction, request-context
  plugin, IAM-02's own interim internal-identity guard). Import-boundary test proves
  `services/iam2/src/**` never imports `services/iam/src/**` or `services/fnd/src/**` — only
  the bare `@aix/foundation` specifier and HTTP calls to IAM-01's public surface.
- **Phase 1** — schema `iam2`, 13 core tables (`role`, `permission`, `role_permission`,
  `user_role`, `user_permission_override`, `approval_policy`, `approval_request`,
  `approval_decision`, `sod_rule`, `sod_check`, `permission_decision_log`,
  `permission_decision_token`, `permission_cache_version`), `role_iam2_runtime` with
  per-table least-privilege grants (C1 discipline applied from day one — e.g. INSERT-only on
  append-only tables, no grant at all on tables nothing touches yet), seeded catalogue (7
  prohibited Exchange permissions, 24 IAM-02 admin permissions, a provisional 4-role bootstrap
  catalogue explicitly marked non-final per blueprint §13).
- **Phase 2** — permission guard core (`lib/guard.ts`), the 11-step precedence chain from
  `07_Permission_Rules.md` §7, `POST /internal/iam2/permission/check`.
- **Phase 3** — approval-to-execution binding: payload-hash capture, `permission_decision_token`
  issuance/verification, `POST /iam2/approvals/{request,:id/approve,:id/reject}`,
  `POST /internal/iam2/permission/execute-verify`.
- **Phase 4** — maker-checker (self-approval block, atomic approval-count increment) + SoD
  blocking (role-assignment-time and approval-decision-time checks; meta-SoD rule seeded and
  actually evaluated, not inert — see §4).
- **Phase 5** — step-up integration with IAM-01 over HTTP (`lib/iam01-client.ts` →
  `POST /internal/auth/verify-assertion`, fail-closed on any network/non-2xx/invalid outcome),
  permission-cache-version bump on role assignment, cache-version mismatch blocks
  `execute-verify`.
- **Bootstrap-to-RBAC transition** — `POST /internal/iam2/bootstrap/first-assignment`,
  implementing the approved config-sealed design exactly (see §5).

## 2. Migrations

- `006_iam2_core.cjs` — schema + all 13 tables + grants-adjacent RLS (see §3) + seed catalogue.
- `007_iam2_seed_sod_rules.cjs` — two meta-SoD rows (`iam2.sod.manage` vs. `iam2.role.assign_user`
  / `iam2.permission.assign_role`, `severity='critical'`, `enforcement='block'`,
  `risk_acceptance_allowed=false`) + `iam2.fn_count_active_role_assignments(varchar[])`, a
  narrow `SECURITY DEFINER` function needed by the bootstrap transition (see §5).
- Both additive; no changes to migrations 001-005 (FND-01/IAM-01/C2 baseline untouched).

## 3. RLS design

- `iam2.user_role`, `iam2.user_permission_override` — `ENABLE + FORCE RLS`, ownership by
  `user_id` via `current_setting('aix.user_id', true)`, identical shape to IAM-01's
  `iam.session`-family (S1-proven pattern).
- `iam2.role`, `iam2.permission`, `iam2.role_permission`, `iam2.sod_rule` — no RLS (global
  catalogues, no single owner).
- `iam2.permission_decision_token` — **deliberately no RLS**. This is a pre-auth-shaped
  hash-lookup table (resolved by `token_hash` before the owning actor is known), the exact
  class of problem that produced IAM-01's S1 deploy-blocker. It follows IAM-01's
  `iam.step_up_assertion` precedent (no RLS at all) rather than the SECURITY DEFINER precedent,
  since a token-hash lookup with a table-level grant and no per-row ownership check is simpler
  and equally safe when the table is genuinely only ever looked up by its own secret hash.
- `iam2.approval_request`, `iam2.approval_decision`, `iam2.sod_check`,
  `iam2.permission_decision_log` — no RLS; evidence/audit-trail tables, access controlled at
  the application layer (mirrors `iam.auth_event`).
- `iam2.fn_count_active_role_assignments` — the one exception requiring a genuine
  `SECURITY DEFINER` escape hatch: the bootstrap transition needs a **global** existence check
  ("does any active `security_admin`/`tech_admin` row exist, for any user") that ownership-RLS
  on `user_role` structurally cannot answer. Reuses IAM-01's established SECURITY DEFINER
  pattern rather than inventing new architecture; returns a count only (not row contents), so
  it cannot be used to exfiltrate another user's role assignments. Verified directly: a raw
  `SELECT count(*) FROM iam2.user_role` under `role_iam2_runtime` with no `aix.user_id` set
  returns 0 despite data existing, while the function correctly returns the true cross-user
  count — RLS isolation is intact, the escape hatch is exactly as narrow as intended.

## 4. Meta-SoD — how it's actually enforced, not just seeded

`07_Permission_Rules.md` §5.6A.7 requires "a SoD matrix editor cannot also hold role assignment
or permission assignment authority." The seeded rule conflicts at the **permission level**
(`iam2.sod.manage` vs. `iam2.role.assign_user`/`iam2.permission.assign_role`), not the role
level — no role in the provisional catalogue is itself named "SoD manager." `lib/sod.ts`
therefore resolves conflicts against each side's **effective permission set** (role →
role_permission → permission_code, unioned across every active role), not just role codes —
otherwise the seeded rule would be present but inert. Enforced at two points:
`checkRoleAssignmentSodConflict` (role-assignment time) and `checkApprovalSodConflict`
(approval-decision time, comparing the maker's and approver's effective grants). `role_role`
rows are also evaluated generically (none seeded yet — full canonical matrix remains
blueprint §13's open item); `action_action` rows are not evaluated (no seed data of that shape,
not required this stage).

## 5. Bootstrap-to-RBAC transition

Implements the approved design exactly: `IAM2_BOOTSTRAP_TRANSITION_ENABLED` (explicit env
flag) + `IAM2_BOOTSTRAP_ADMIN_USER_ID` (config-sealed — operator-copied from IAM-01's known
`is_interim_admin` user once; IAM-02 never auto-discovers this, since IAM-01 has no HTTP
endpoint exposing that flag — `GET /internal/auth/users/{user_id}/auth-status` was explicitly
deferred in IAM-01, see its implementation notes §3). `POST /internal/iam2/bootstrap/first-assignment`
requires: (a) the env flag, (b) a verified IAM-01 step-up assertion (`purpose =
"iam2_bootstrap_transition"`) whose `user_id` exactly matches the config-sealed value, (c) a
non-empty `auth_level` on that assertion (proves MFA/step-up was genuinely completed), (d) no
active `security_admin`/`tech_admin` `iam2.user_role` row exists **anywhere** (via the
SECURITY DEFINER function, §3) — checked inside a `SERIALIZABLE` transaction so two concurrent
attempts cannot both observe "zero" and both succeed. On success: one `iam2.user_role` row
(`assigned_by = 'iam2_bootstrap_transition'`, `approval_id = NULL` — there is structurally no
approver yet), a Critical audit event, cache-version bump. Structurally single-use (condition
(d) is permanently false after the first success); can only ever grant `security_admin` or
`tech_admin`, never any other role; not reusable as a general bypass.

**Operational note:** the caller side of this flow (authenticating as IAM-01's bootstrap admin,
completing `/auth/step-up` + `/auth/step-up/verify` with purpose `iam2_bootstrap_transition`)
is outside this stage's scope — IAM-02 only verifies the resulting assertion. This should be
documented in an operator runbook before first production use.

## 6. Bug found and fixed during independent verification

**Not caught by the implementing subagent's own report.** The `POST /iam2/approvals/:id/reject`
handler's expiry branch (`approval.status === 'pending' && expires_at_utc <= now()`) did
`UPDATE ... SET status = 'expired'` and then `throw`ed directly from inside the same
`withTransaction` callback. Since a thrown error rolls back the entire transaction, the
`UPDATE` was silently discarded — verified directly: the app correctly returned
`410 IAM2_APPROVAL_EXPIRED` to the caller, but the row's `status` column remained `'pending'`
in the database. This is the exact bug class the same file's `approve` handler had already
been fixed for (denial paths must return a structured outcome and let the route throw only
*after* the transaction commits) — the fix just hadn't been applied to `reject`'s equivalent
branch. **Not a security/authorization bypass** (expiry is re-derived from `expires_at_utc` on
every subsequent call regardless of the stored `status`), but a real data-consistency defect
that would leave the `status` column misleading for any code/reporting that reads it directly.
Fixed to mirror `approve`'s already-correct pattern; a permanent regression test was added
(`tests/integration/iam2-db.test.ts`, "rejecting an already-expired approval... durably
persists status='expired'") and the fix was independently re-verified via a direct app-level
probe against the database, not just the test suite.

## 7. Deferred — Phase 6/7 (tracked second-pass gap-closing list)

Not built this pass, per approved scope:
- Delegation (`iam2.delegation`), temporary permissions (`iam2.temporary_permission`).
- Steady-state break-glass module (`iam2.break_glass_request` + whitelist/ceiling) — distinct
  from the one-time bootstrap-to-RBAC transition, which IS built.
- SoD risk-acceptance override path (non-Critical conflicts currently always block, since the
  risk-acceptance table/workflow doesn't exist yet — see §4/§8).
- Meta-SoD beyond the one seeded core rule (full canonical SoD matrix remains blueprint §13's
  open item).
- Protected-action registry + orphan-action reconciliation jobs.
- Sensitive-read evidence logging (`iam2.sensitive_read` audit on evidence-read endpoints).
- Role-revocation endpoint (`DELETE /iam2/users/{user_id}/roles/{role_id}`) — not built; a
  small, self-contained gap, not scoped this pass.
- IAM-01 freeze/session-status integration for guard step 3 (account/session freeze) — remains
  a documented no-op fall-through; no suitable IAM-01 HTTP endpoint exists for it yet.

## 8. Known gaps / judgment calls for Opus review

1. **`action` field convention** — `04_API_Specification.md`'s own example request uses a
   2-segment `action`/`resource` pair, but the permission namespace is a 3-segment
   `<module>.<resource>.<action>` code. This implementation treats the request's `action` field
   as the fully-qualified `permission_code` throughout (guard, approvals, roles); `resource`
   is carried for logging/audit context only, never concatenated into the lookup key.
2. **Explicit ALLOW overrides are not a grant path** — only `effect='deny'` overrides are
   read by the guard, matching `07_Permission_Rules.md` §7's precedence list (which has no
   "explicit allow override" step). The schema supports `effect='allow'` rows; they are inert.
3. **`iam2.role.assign_user`'s `requires_step_up=true` makes `evaluatePermission` unconditionally
   return `step_up_required`** for that permission (Phase 2 design: these flags are static
   catalogue checks, not "has this actor already stepped up for this call" checks). The only
   way to actually assign a role is via the Phase 3 approval flow issuing a `decision_token`
   first, which `POST /iam2/users/{user_id}/roles` then verifies. This is an internally
   consistent two-tier design (dogfooding IAM-02's own guard for its own admin actions) but is
   a real architectural choice worth an Opus read, not an accident.
4. **A single generic step-up purpose** (`"iam2_approval"`) is used across every approval
   decision, rather than a purpose per action — simpler operational flow, flagged as a
   judgment call rather than derived from the blueprint.
5. **No idempotency key on `/iam2/approvals/*` or `/iam2/users/{user_id}/roles`** — these are
   internal-service-to-service calls without a documented Idempotency-Key field in the API
   spec; a retried `approve` call is caught by the DB's own unique constraint (clean error, not
   a duplicate decision), and a retried role-assignment would re-verify (and re-consume) the
   decision token, which fails closed on the second attempt (token already consumed) rather
   than silently double-assigning — acceptable but worth confirming.
6. **IAM-02 has no user-session auth of its own this stage** — every endpoint trusts an
   explicit `*_user_id` body field for the acting identity (mirrors `permission/check`'s
   `actor_id` convention), not an authenticated session. A future stage giving IAM-02 real
   session auth would replace this with authenticated identity instead of a caller-supplied
   field.

## 9. Tests

168 tests from Phase 0-2 (stage 1) + 27 from Phase 3-5 (stage 2) + 1 regression test (§6) =
**196 tests**, all DB-gated integration tests connected as `role_iam2_runtime` via a real
LOGIN role from the start (never superuser-only, applying the S1 lesson from day one rather
than discovering it after the fact). Full FND-01 (44) + IAM-01 (123, including C1/C2) suites
are unregressed throughout both stages and the bugfix.

## 10. F1/F2 fix-pass — independent Opus security review findings closed

The Opus review (`docs/IAM-02_Security_Review_Opus_v0.1.md`, v0.1) returned **ACCEPT WITH
CONDITIONS**: two High-severity findings (F1, F2) required a fix-and-re-verify pass before
IAM-02 is an accepted baseline. Both are now closed. Phases 6-7 remain explicitly deferred —
no scope beyond F1/F2 was touched this pass (see §7 above, unchanged).

### 10.1 F1 closed — decision-token binding not enforced at execute-verify

**Root cause.** `verifyAndConsumeDecisionToken` (`lib/decision-token.ts`) stored every bound
field (`actor_user_id`, `action`, `resource`, `entity_id`, `client_id`) on
`iam2.permission_decision_token` at issuance, but never compared the PRESENTED values against
them at verification — only payload-hash (optional) and a conditional session check ran.
`routes/internal.ts`'s `execute-verify` handler passed the presented fields through unused.
Reproduced live during this fix-pass exactly as the review describes: a token minted for
`(actor=maker, action=wdr.withdrawal.approve, entity=wdr_1)` with a payload was accepted by
`execute-verify` when presented `(actor=ATTACKER, action=led.journal.post,
entity=wdr_999_DIFFERENT)` with the matching payload hash — `execution_authorised: true`.

**Fix.**
- `VerifyDecisionTokenInput` now requires `actorUserId`/`action`/`resource` and accepts
  optional `entityId`/`clientId`. `verifyAndConsumeDecisionToken`'s check order is now:
  existence/status/expiry → **binding fields (actor/action/resource/entity/client)** →
  payload hash → cache version → consume. Binding is null-safe: a token bound to
  `entity_id`/`client_id = null` only matches a presented value that is ALSO null/undefined —
  never a wildcard. Any binding mismatch collapses to the same caller-facing
  `IAM2_DECISION_TOKEN_INVALID` as an invalid/expired token (no new error code — a binding
  mismatch and an unusable token are the same "this token cannot authorise this execution"
  outcome for the caller), but is audited distinctly (see below) and revokes the token so a
  mismatch attempt cannot be retried, even with subsequently-correct bindings.
- A NEW Critical audit event, `iam2.decision_token_binding_mismatch`, is emitted on a binding
  mismatch specifically — distinct from the existing `iam2.approval_payload_hash_mismatch`
  (payload-hash-specific). Metadata mirrors the existing shape (action/approval_id), never the
  raw mismatched values.
- `routes/internal.ts`'s `execute-verify` now passes `actor_id`/`action`/`resource`/
  `entity_id`/`client_id` from the request body straight into the verifier (the request schema
  already carried all of these — no new wire fields).
- `routes/roles.ts`'s call site now passes the full binding context too (`actorUserId`,
  `action: "iam2.role.assign_user"`, `resource: "role"`, `entityId`) so the shared verifier's
  check fires with complete context there as well; its pre-existing local post-hoc binding
  re-check is left in place as defense-in-depth (now provably redundant, kept deliberately
  rather than deleted).
- **Approval-issued tokens now require a non-null `payload_hash`.** `routes/approvals.ts`'s
  approve handler no longer calls `issueDecisionToken` when `approval.payload_hash` is null —
  the approval still resolves to `status: 'approved'`, just with no `decision_token` field in
  the response. A null-payload approval-issued token would otherwise be a bearer credential
  bound to nothing worth verifying; this is not a rejection of the approval, only "no
  redeemable token minted."
- `execute-verify`'s response no longer hardcodes `verified_payload_hash`/
  `verified_cache_version`/`verified_session: true`. `verifyAndConsumeDecisionToken`'s success
  result now carries `verifiedPayloadHash`/`verifiedSession`/`verifiedCacheVersion: boolean`,
  each true only when that check was actually meaningful (e.g. `verifiedPayloadHash` is false
  for a vacuous null-vs-null comparison, not hardcoded true regardless of input).
- `guard.ts`'s direct-allow-path `issueDecisionToken` call was confirmed to ALREADY gate on
  `if (input.payloadHash)` before issuing — no change needed there; it was never affected by
  the approval-side gap.

**Consequence for the existing role-assignment flow (fixed, not just noted).** Under the
"no payload → no token" rule, the pre-existing "Phase 4: SoD conflict blocks role assignment"
integration test would have minted NO token (its `POST /iam2/approvals/request` call carried
no `payload`), breaking `routes/roles.ts`'s decision-token flow. Fixed properly: a
role-assignment approval request now carries `payload: { role_code, target_user_id }` (the
actual thing being executed), so `payload_hash` is non-null and a token IS issued — with the
side benefit that the payload-hash binding now also protects the SPECIFIC role code being
granted (a token minted to grant role X can no longer be redeemed to grant role Y). The test
and `routes/roles.ts`'s own header comment were both updated to reflect this; the whole test
file was searched for every other `iam2.role.assign_user` approval + `routes/roles.ts` token
redemption — only the one block existed, and it is fixed.

**Tests added/updated** (`tests/integration/iam2-db.test.ts`, new "F1: execute-verify enforces
decision-token binding" describe block, plus one addition to the existing Phase 3 describe and
one to the Phase 4 SoD describe; `tests/unit/iam2-decision-token.test.ts` — a pre-existing
fake-client unit-test file for this same function, not originally in this fix-pass's file list,
updated to supply the newly-required binding fields, with 3 new unit-level binding-mismatch
tests added): action mismatch rejected; entity mismatch rejected; actor mismatch rejected;
resource mismatch rejected; null-bound `client_id` rejected for a non-null presented
`client_id` (null-safety, not wildcard); no-payload approval mints no token; full-binding happy
path succeeds; expired token rejected; stale cache version rejected; `verified_*` flags reflect
what was actually checked (both a "nothing meaningful checked" and a "meaningfully checked and
true" case for `verified_session`); a binding-mismatch attempt emits the Critical audit event
and revokes the token so a same-token retry with subsequently-correct bindings still fails.

**Own reproduction (this fix-pass, live app + disposable DB, not just the test suite).**
Repeated the review's exact scenario: minted a token for
`(actor=maker, action=wdr.withdrawal.approve_repro_*, entity=wdr_1)` with a real payload hash,
then called `execute-verify` with a different actor, `action=led.journal.post`, a different
entity, and the SAME payload hash. Result: `HTTP 409 IAM2_DECISION_TOKEN_INVALID` (previously
`200 execution_authorised: true`). A follow-up call with the ORIGINAL correct bindings also
failed (token revoked on the first mismatch, not merely wrong once). The
`iam2.decision_token_binding_mismatch` audit row was confirmed present in
`foundation.outbox_event` with the token's true bound values in its metadata (not the
attacker's presented ones).

### 10.2 F2 closed — concurrent RLS-scoped queries in `checkApprovalSodConflict`

**Root cause (confirmed by direct trace, matching the review exactly).**
`checkApprovalSodConflict` ran `Promise.all([effectiveGrants(maker), effectiveGrants(approver),
activeSodRules()])`. `effectiveGrants` does `SET aix.user_id = $1` (transaction-local, via
`set_config(..., true)`) followed by an RLS-gated `SELECT` on `iam2.user_role`, on the SAME
shared `PoolClient`. Because `Promise.all` evaluates its array's function calls synchronously
up to each one's first `await`, and node-postgres queues `.query()` calls on one client in
submission order, the wire sequence was deterministically: `SET maker`, `SET approver` (queued
immediately behind — BEFORE maker's own follow-up SELECT is even submitted), then maker's
SELECT (now running with `aix.user_id` already overwritten to the APPROVER), then approver's
SELECT (correct, coincidentally). Under FORCE ROW LEVEL SECURITY, maker's SELECT — scoped to
the WRONG user — returns ZERO rows deterministically, not just "sometimes": a genuine
maker↔approver SoD conflict was never detected via this path (fail-open on the exact control
this function exists to provide). This is the same failure class the codebase already hit once
(IAM-01 `withUserScope`).

**Fix.** Both `checkApprovalSodConflict` and `checkRoleAssignmentSodConflict`
(`lib/sod.ts`) now run their `effectiveGrants` calls sequentially — `await` each one to full
completion before the next starts. `activeSodRules` (which never touches `aix.user_id`) may
run before/after/between them safely. `checkRoleAssignmentSodConflict` was refactored to the
same sequential discipline even though today only one of its three calls issues a `set_config`
(so nothing currently races there) — per the review's explicit instruction to close the
anti-pattern everywhere it appears, not only where it is provably broken today: RLS scope via
`set_config`/`current_setting` is transaction-local session state on a shared `PoolClient`;
concurrent `.query()` calls that mutate it can interleave and cause a subsequent RLS-gated read
to run under the wrong scope — a fail-open SECURITY risk, not merely a performance concern. No
RLS was bypassed, weakened, or removed; the fix is purely about call ordering.

**Tests added.** New "F2: real maker<->approver SoD conflict blocks the approval decision"
describe block in `tests/integration/iam2-db.test.ts` — the deterministic regression test the
review asked for: seeds the maker with a role granting `iam2.role.assign_user` and the
approver with a role granting `iam2.sod.manage` via REAL `role_permission` grants (not just
role codes), attempts the approval decision, and confirms `IAM2_SOD_CONFLICT` — not a false
"success" caused by both effective-grant lookups silently returning empty. Runs under the same
`role_iam2_runtime`-connected app the whole suite already uses. The pre-existing "Phase 4: SoD
conflict blocks role assignment" test (which exercises `checkRoleAssignmentSodConflict`) was
re-confirmed passing after its own refactor and after the F1.4 payload-carrying update above.

### 10.3 Verification performed this fix-pass

`npx tsc -b` clean. Fresh disposable Postgres (`aix_iam2_f1f2_fix`, dropped after use, along
with the session's `iam2_app_test` LOGIN test role): migrations 001→007 applied with no new
migration needed (both fixes are application-layer logic + test fixture changes, not schema
changes); all three grant files (`fnd`/`iam`/`iam2`) applied cleanly. Full `vitest run`:
**19 test files, 211 tests, 0 failures** — the 196-test baseline is unregressed except for the
one deliberately-modified test (Phase 4 SoD role-assignment, updated per §10.1's payload-shape
change, still passing and still exercising the SoD block correctly), plus 15 new tests (11 in
`iam2-db.test.ts`'s new F1/F2 blocks + 1 in its Phase 3 block [expired-token regression] + 3 in
`tests/unit/iam2-decision-token.test.ts`). The F1 attack was independently re-reproduced
end-to-end against the live app and disposable DB (§10.1) and confirmed blocked, not merely
inferred from the test suite.

### 10.4 Carry-forward — deferred/lower-severity items (unchanged by this fix-pass)

Phases 6-7 remain deferred exactly as scoped in §7 (delegation, temporary permissions,
steady-state break-glass, SoD risk-acceptance, full canonical SoD matrix, protected-action
registry, sensitive-read evidence logging, role-revocation endpoint, IAM-01 freeze/session
integration for guard step 3). The review's three Lower-severity observations also carry
forward unchanged, tracked here for the next pass:
- **L1 — decision-token freshness vs. account freeze.** `execute-verify` still does not
  re-check account/session freeze or auth-level (guard step 3 remains a documented no-op) —
  needs a future IAM-01 HTTP endpoint reporting session/freeze status, which does not exist yet
  and is IAM-01's to add.
- **L2 — step-up assertion reuse policy for high-value approvals.** IAM-01's
  `verify-assertion` is deliberately not single-use, so one `iam2_approval`-purpose step-up
  assertion can authorise multiple distinct approval decisions by the same approver within its
  freshness window (~10 min). Matches IAM-01's documented model; worth revisiting a
  fresh/approval-bound step-up requirement for high-value approvals specifically.
- **L3 — interim trust model.** The authorization plane is still keyed on one shared internal
  service token plus caller-supplied `*_user_id` body fields — no user-session auth of IAM-02's
  own yet. Documented and accepted as an interim seam (§8.6), but the shared secret's
  compromise is a full authz-plane compromise; the interim shared internal-service token must
  eventually be replaced by a real service identity / IAM-02's own guard, per the
  implementation plan's §5 — this should not slip.

## 11. Opus short re-review — IAM-02 accepted as baseline

The short Opus re-review of the F1/F2 fix-pass (`docs/IAM-02_Security_Review_Opus_v0.2_reverify.md`)
confirmed both findings genuinely closed — full read of all four patched paths plus an
independent fresh-disposable-Postgres run (211/211) — and found no new gap introduced.
**Verdict: IAM-02 Phases 0-5 is now an accepted implementation baseline.** Carry-forward L1-L3
(§10.4) remain tracked and non-blocking. Phase 6-7 planning remains a separate, later step.

**Next module: SEC-01 Audit Log / Security Monitoring.**
