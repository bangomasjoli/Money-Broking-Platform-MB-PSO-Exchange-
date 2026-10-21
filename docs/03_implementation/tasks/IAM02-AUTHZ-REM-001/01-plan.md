# 01 Plan — IAM02-AUTHZ-REM-001: IAM-02 approval-authorisation remediation (documentation checkpoint)

- **Task ID:** IAM02-AUTHZ-REM-001
- **Risk:** CRITICAL — reason: IAM-02 is the platform's authorisation authority; six modules treat its approval flow as the gate for regulated actions.
- **Category:** IAM-02 security remediation (authorisation / maker-checker / step-up / approval policy)
- **Planner:** record author Claude Sonnet 5.5 (`claude-sonnet-5-5`) / HIGH; supporting design review by Claude Opus 5.5 (`claude-opus-5-5`) / HIGH in the **same shared session** (not independent — see §12)
- **Selected implementer:** Sonnet, in a **separately authorised** task on its own branch — NOT YET AUTHORISED
- **Baseline commit:** `effcdf39c6666f014ce7c9776f83903f6263381f` (`main`, equal to `origin/main` when this record was written)
- **Human approval:** owner security-direction approval recorded in GitHub Issue #6 (2026-10-22, Asia/Kuching). **That approval is direction only.** Approval of this record, approval to implement, migration authorisation, acceptance and merge are all NOT given.

## 0. Status and authority (read first)
- **Documentation only.** No code, migration, grant, configuration or governed register was changed. The new approval-authorisation remediation is **unimplemented and unaccepted**.
- **Preserved, unchanged:** the accepted IAM-02 baseline v1.0 (Phases 0–5) (`docs/00_project_state/MODULE_STATUS.md`; `docs/02_modules/IAM-02/acceptance/IAM-02_Security_Review_Opus_v0.2_reverify.md`) and the APPROVED adjudication `IAM-02-ACC-003` (`docs/02_modules/IAM-02/acceptance/IAM-02_Approval_Control_Adjudication_Opus_v1.0.md`). Findings `IAM2-FIND-002/003/004` remain **OPEN** in `docs/OPEN_FINDINGS.md`, which this task did not edit.
- **Owner acceptance of a decision is not** implementation acceptance, a regulatory authorisation, a migration-execution instruction or approval to merge (Issue #6, verbatim intent).
- Labels used below: **VERIFIED** (inspected source or executed test, see `03-evidence.md`), **INFERRED**, **PROPOSED**, **UNSPECIFIED** (needs owner decision, not invented here).

## 1. Objective
Close the approval-authorisation gaps recorded as `IAM2-FIND-002` and `IAM2-FIND-003`, plus the additional reproduced defects in §5, by recording the owner-approved direction and a testable requirement set, so that a separately authorised Sonnet implementation and a fresh-context independent security review can proceed without another planning cycle.

## 2. Owner-approved decisions and crosswalk by substance
Source of approval: Issue #6, response “approve all” to the ChatGPT presentation of C-1…C-11 **with both stated qualifications** (§3). The identifiers C-1…C-11 in the Issue are the ChatGPT list; the longer original Opus matrix (C-1…C-16) is a different artefact. Equivalence below was established **item by item on substance**, not by number. Where wording differs, **the Issue's wording controls**.

| Issue #6 decision (approved substance) | Opus review item with same substance | Match | Requirements |
|---|---|---|---|
| C-1 extend guard with `evaluatePermissionWithStepUp`; preserve established guard behaviour | guard-extension option (a): new function beside an unchanged `evaluatePermission` | Same | AZ-04, AZ-05, AZ-12 |
| C-2 **B**: approval is additional to the maker's underlying permission, never a replacement | maker-entitlement option B | Same; **Issue qualification 1 widens it to request AND execution** | AZ-01, AZ-02, AZ-03 |
| C-3 universal approver MFA/step-up | approval step-up scope (a) honour the seed flag | Same | AZ-05 |
| C-4 bind assertion to purpose `iam2_approval:<approval_id>` | per-approval step-up purpose | Same | AZ-05 |
| C-5 snapshot security requirements at creation of each request | snapshot onto the request | Same (Opus preferred snapshot over pin-plus-trigger; the Issue approves snapshot) | AZ-06 |
| C-6 class-based fail-closed for absent/unknown/sensitive policies | fail-closed class rule | Same; **class boundary is UNSPECIFIED** (§9) | AZ-06 |
| C-7 retired policy: use the pending request's valid snapshot, **subject to immediate revocation and other current fail-closed safeguards** | retired policy: continue under snapshot | **Narrower than Opus**: Issue adds live-safeguard override | AZ-06, AZ-10 |
| C-8 enforce required checker/approver roles | enforce `required_approver_roles` | Same | AZ-07 |
| C-9 controlled asymmetric rejection with `self_reject` audit evidence | reject asymmetric + `self_reject` flag | Same | AZ-08 |
| C-10 implementer proposes exact error/audit codes; reviewer validates; unspecified details not pre-approved | implementer proposes codes | Same | AZ-11 |
| C-11 plan schema migration **072**, approval-policy configuration **073** separately, under normal separately authorised migration/write controls | migration authorisation 072 now / 073 after policy matrix | **Issue is stricter**: it does **not** authorise executing 072 now; the Opus wording “authorise 072 now” is superseded | AZ-13 |

Opus items **not** covered by “approve all” (Issue: need crosswalk/owner attention):

| Opus item | Treatment in this record |
|---|---|
| C-12 policy matrix values (32 redemption pairs + 8 registered without redeemer) | **NOT APPROVED.** Blocks migration 073 content and rollout. §9 |
| C-13 role model and `role_permission` / `user_role` provisioning, maker and checker roles | **NOT APPROVED.** Blocks rollout. §9 |
| C-14 request-time contract per pair (action, resource, entity_id, payload shape) | **NOT APPROVED.** Blocks UAT/rollout. Only redemption-time pairs are code-confirmed (`03-evidence.md` §5) |
| C-15 register new findings; L1–L3 placement under DEC-005 | Partly addressed: §5 raises task-scoped findings for human promotion. **L1–L3 placement NOT decided** |
| C-16 fresh-context independent reviewer | The Issue requires a fresh-context independent review and separate human acceptance; **reviewer identity UNSPECIFIED** |

## 3. Binding owner qualifications (Issue #6)
1. **Maker authorisation is mandatory at both request and protected-action execution.** Generic approval-create privilege alone must not create or execute a request. Explicit denial, revoked privilege, current licence lock or another fail-closed control must override an approval/decision token. Verify on the **actual consumer/execution path**, not by accepting `approval_required` or `step_up_required` as a substitute for a grant. Specifically address the `roles.ts` explicit-deny-with-token bypass and revocation/cache validity.
2. A valid policy snapshot cannot bypass an explicit emergency revocation or other later-established fail-closed control. A retired policy does not silently weaken a pending approval.
3. Approver assertion identity must match the approver, and assertions must be purpose-bound. Test cross-user and cross-approval negatives.
4. Preserve SoD evidence on duplicate-decision paths (a savepoint strategy if independently validated) and audit failures correctly.

## 4. Requirements (AZ-nn) — current verified state and required behaviour
Evidence references are to `03-evidence.md`.

| ID | Required behaviour (from decision) | Current state at baseline (VERIFIED unless marked) | Tests |
|---|---|---|---|
| AZ-01 | Maker must hold the **underlying** permission to create an approval request for action X (C-2, Q1). `iam2.approval.create` alone is insufficient. | `routes/approvals.ts` request handler evaluates no permission (E-1). | T-01, T-02 |
| AZ-02 | At **execution**, the maker's underlying entitlement is re-evaluated; explicit deny, revoked grant, licence lock, prohibited, or any later fail-closed control overrides a valid token (C-2, Q1, Q2). | `execute-verify` evaluates **no permission** (E-4). 22 of the 24 consumer redemption call sites are preceded by an advisory baseline `checkPermission` on the same path, and for approval-gated permissions that baseline passes `approval_required`/`step_up_required` even for an **unprovisioned** actor (executed accepted test for `cfg1.feature.enable`; same guard path for the other flagged permissions — INFERRED for them). The **two WLT-01 apply routes run no baseline at all** (E-5). | T-03 … T-07 |
| AZ-03 | `routes/roles.ts` must not assign a role when the acting admin is explicitly denied, licence-locked or prohibited, token or not (Q1). | **Reproduced defect** (E-2, F01). | T-08 |
| AZ-04 | Create/approve/reject each evaluate their approval permission through the accepted guard, consuming the decision; denial evidence persists (C-1; FIND-002). | None evaluated (E-1). | T-09 |
| AZ-05 | Universal approver step-up; evidence must be unforgeable by callers, bound to the approver's identity and to purpose `iam2_approval:<approval_id>` (C-3, C-4, Q3). | Step-up only if a policy row asks; assertion user **not** compared; generic purpose (E-1, E-3, F02). | T-10 … T-14 |
| AZ-06 | Snapshot step-up, approver roles, count, expiry at creation; class-based fail-closed for absent/unknown/sensitive policy; retired policy → snapshot governs **subject to AZ-10** (C-5, C-6, C-7, Q2). | Policy re-read by `(action, resource, active)` at decision; null `policy_id` skips step-up; silent default of 1 approval/no step-up (E-1, F03). | T-15 … T-20 |
| AZ-07 | Approver must hold one of the snapshot's required roles when non-empty; evaluated with correct `aix.user_id` context, strictly sequential (C-8). | `required_approver_roles` read by no code (E-1). | T-21, T-22 |
| AZ-08 | Reject requires `iam2.approval.reject`; self-rejection permitted and audited with `self_reject` (C-9, approved). “No step-up/SoD on reject” is the Opus reading of “asymmetric” — **PROPOSED, exact semantics UNSPECIFIED (§9 item 7)**. | No permission check; no flag (E-1). | T-23 |
| AZ-09 | Duplicate-decision paths keep same-transaction evidence (guard decision log, `sod_check`, audit) (Q4). | Evidence discarded by transaction abort (E-6, F07). | T-24, T-25 |
| AZ-10 | Revocation and cache validity are enforced; a policy snapshot never overrides an explicit emergency revocation or later fail-closed control (Q1, Q2, approved). That a privileged revocation also invalidates dependent pending approvals and outstanding tokens is a **PROPOSED** reading; the mechanism is **UNSPECIFIED (§9 item 2)**. | No revocation path in runtime code; cache version bumped only on assignment and bootstrap (E-7, F05). | T-26 … T-28 |
| AZ-11 | Denials return structured outcomes and commit their evidence; exact codes proposed by the implementer (C-10). | Existing pattern for expiry/self-approval/SoD (accepted); new paths absent. | T-29 |
| AZ-12 | Preserve: decision-token issuance, binding and staleness behaviour; runtime grants; SoD; RLS; licence locks; guard default behaviour. | Accepted baseline (IAM-02 v0.2 re-verify). | T-30 … T-32 |
| AZ-13 | Migration 072 = schema only; 073 = policy configuration, separately authorised. Neither executed by this task. | Latest migration on `main` is `071`; no `072+` exists on any known ref (E-8). | T-33 |

## 5. Reproduced and verified defects (task-scoped findings, PROPOSED for human triage)
Labels in the “Origin” column are the **review-list labels** (R1, C5…C9, B-6) and are **not** decision identifiers C-5…C-9. Severities are **proposals**; promotion to `docs/OPEN_FINDINGS.md` is a human act (`tasks/README.md`).

| ID | Origin | Finding | Proposed severity | Evidence | Distinct from registered findings? |
|---|---|---|---|---|---|
| IAM02-AUTHZ-REM-001-F01 | R1 | `routes/roles.ts` assigns a role to an acting admin holding an **explicit DENY override** when a decision token is supplied; the guard result is consulted only when no token is present. | HIGH | E-2 (executed) | New; adjacent to FIND-002 |
| IAM02-AUTHZ-REM-001-F02 | C5 | Approve accepts a step-up assertion that IAM-01 reports belongs to a **different user**. | MEDIUM–HIGH | E-3 (executed) | New; refines FIND-002 |
| IAM02-AUTHZ-REM-001-F03 | C6 | Retiring a policy after request creation silently removes the step-up requirement. | MEDIUM | E-3 (executed) | New; refines FIND-003 |
| IAM02-AUTHZ-REM-001-F04 | C8 + Q1 | Underlying maker entitlement is not enforced at request or execution; consumers accept `approval_required`/`step_up_required` as a pass; `execute-verify` evaluates nothing. | HIGH | E-4, E-5 (code and accepted tests) | New; **not** in FIND-002 text |
| IAM02-AUTHZ-REM-001-F05 | B-6 | Privileged revocation leaves outstanding tokens and pending approvals valid; no revocation path bumps the cache version. | MEDIUM | E-7 (code) | New; related to carry-forward L1 |
| IAM02-AUTHZ-REM-001-F06 | C7 | Schema permits multiple active policies for one `(action, resource)`; selection is `LIMIT 1` with no ordering. | LOW | E-3 (schema, executed); selection order INFERRED | New; refines FIND-003 |
| IAM02-AUTHZ-REM-001-F07 | C9 | A duplicate-decision `23505` aborts the transaction and the `COMMIT` becomes `ROLLBACK`, discarding same-transaction `sod_check` and audit rows. | LOW today; rises once guard rows are added | E-6 (executed) | New; adjacent to FIND-004 |

`task.json` counts F02 as MEDIUM and all severities as proposals; none is promoted, accepted or closed. Existing registered rows are unchanged.

## 6. Mapping to `docs/OPEN_FINDINGS.md` and closure criteria
| Registered finding | Mapped task items | Closure criteria carried forward (verbatim intent) |
|---|---|---|
| `IAM2-FIND-002` (HIGH) | AZ-01…AZ-05, AZ-07, AZ-08; F01, F02, F04 | All three handlers gated; regression tests prove refusal without the permission on each of create/approve/reject; `requires_step_up` honoured; `required_approver_roles` decision recorded (now: **enforce**); independent re-review. |
| `IAM2-FIND-003` (MEDIUM) | AZ-06; F03, F06 | Policy rows exist for every integrated module's approval-gated actions (**needs C-12**); a test proves a step-up/multi-approval action cannot be approved under the bare default; unmatched-action fallback decided, implemented, tested; independent re-review. |
| `IAM2-FIND-004` (LOW) | adjacent only (F07) | **Not in scope** unless the owner adds it. |
| `IAM2-FIND-001` | none | **Explicitly excluded.** |
| Carry-forward L1/L2/L3 | AZ-05 (L2 reduced by per-approval purpose), AZ-10 (L1-adjacent) | Remain open; **not closed** by this task. L3 (caller-asserted identity) is not superseded. |

Closure of any finding requires repository evidence (commit and reproduced result), a fresh-context independent review and explicit human acceptance recorded in the authoritative acceptance record (`CLAUDE.md` §4). Nothing here closes a finding.

## 7. Proposed implementation scope (PROPOSED — not authorised)
Subject to the unspecified items in §9. Files are likely, not approved:
- `platform/services/iam2/src/lib/iam01-client.ts` — return an unforgeable, registry-checked `VerifiedStepUp` carrying verified user, purpose and freshness.
- `platform/services/iam2/src/lib/guard.ts` — add `evaluatePermissionWithStepUp`; `evaluatePermission` signature and behaviour unchanged; **plus** an entitlement-eligibility entry point for AZ-01/AZ-02 (see §9, item 1).
- `platform/services/iam2/src/lib/sod.ts` — expose maker/approver role codes from the existing sequential evaluation; no change to rules or ordering.
- `platform/services/iam2/src/routes/approvals.ts` — create/approve/reject per AZ-01…AZ-11 (guard first, lock, outcome-then-throw, SAVEPOINT on the decision insert with exact named-constraint matching).
- `platform/services/iam2/src/routes/roles.ts` — AZ-03 only.
- `platform/services/iam2/src/routes/internal.ts` — only if the AZ-02 mechanism M1 (§9) is selected.
- `platform/services/iam2/src/lib/errors.ts` — codes proposed by the implementer (C-10).
- `platform/infra/migrations/072_*.cjs` (new, **schema only**): partial unique index on active `(action, resource)`; `CHECK` constraints on policy shape; snapshot columns on `approval_request`. **No grant change is expected**; the existing runtime grants were shown sufficient for the SAVEPOINT approach (E-6). `073` (policy rows) is a separate, later, separately authorised task.
- Tests under `platform/tests/` for §8.

## 8. Required tests (acceptance evidence for the later implementation)
All negative and concurrency tests run through the real application path against a database migrated from scratch with the fnd, iam and iam2 grant files, **under the `role_iam2_runtime` login**, never a superuser.

Negative (each must fail before and pass after):
- T-01 create refused with `iam2.approval.create` but without the underlying permission. T-02 create refused for an unprovisioned maker.
- T-03 execution refused when the maker's grant was revoked after approval. T-04 execution refused under an explicit deny override added after approval. T-05 execution refused under a licence lock. T-06 execution refused for a prohibited permission. T-07 the two WLT-01 apply paths and one CLT-01, KYC-01, AML-01, CFG-01 and SEC-01 path each refuse on the same conditions (consumer/execution path, not only IAM-02 unit level).
- T-08 `roles.ts` with a token and an explicit deny override performs **no** assignment and persists the guard decision (reproduction R1 inverted).
- T-09 refusal without `iam2.approval.create`/`approve`/`reject`; deny override; revoked or expired role; inactive `role_permission`; zero-role actor.
- T-10 no assertion → step-up required. T-11 invalid, expired or wrong-purpose assertion. T-12 **another user's** valid assertion (R2 inverted). T-13 assertion for **another approval**. T-14 forged or cloned `VerifiedStepUp`, and a body field added to `/internal/iam2/permission/check`, cannot establish step-up; an unentitled actor holding a valid assertion is denied.
- T-15 absent policy in the fail-closed class refused with evidence. T-16 unknown action refused. T-17 retired policy after creation: snapshot governs (R3 inverted: step-up still required). T-18 retired policy **plus** a later explicit deny/revocation/licence lock: refused. T-19 legacy request with null snapshot in the class refused. T-20 duplicate active policy rejected by the index (R-C7 inverted).
- T-21 approver outside `required_approver_roles` refused. T-22 `aix.user_id` scoping: query-order assertion; no `Promise.all` on these paths.
- T-23 reject requires `iam2.approval.reject`; maker self-reject allowed and audited with `self_reject`; no token can result from reject.
- T-24 duplicate approver: guard decision log, `sod_check` and audit rows all persisted. T-25 only the named `(approval_id, approver_user_id)` constraint is treated as a duplicate; any other error aborts fail-closed.
- T-26 privileged revocation bumps the cache version and invalidates outstanding tokens. T-27 pending approvals depending on a revoked grant cannot be approved. T-28 documented timing semantics: a revocation committed before the guard's grant read is honoured; one committed after is not retroactive.

Concurrency: two distinct approvers on a 2-of-n request → exactly one token; three simultaneous same-approver attempts → one decision, all evidence persisted; approve vs reject → one terminal state; revoke vs approve race → no approval by an actor entitled only before the revocation committed.

Regression/preservation: T-29 every denial path commits its evidence and throws outside the transaction. T-30 decision-token issuance/binding/staleness tests unchanged and passing. T-31 grant-matrix assertion unchanged (`platform/tests/integration/iam2-db.test.ts`, “role_iam2_runtime has SELECT+INSERT+UPDATE…”). T-32 `iam2-guard.test.ts` unchanged and passing. T-33 migration 072 applies on a fresh database and the repo `migrate:up` chain remains valid.

Baseline for before/after comparison: 8 files, 148/148 passing on a fresh database at `effcdf39` (`03-evidence.md` §6). The full suite was **not** run.

## 9. UNSPECIFIED — not approved by Issue #6 and not invented here
1. **AZ-02 mechanism.** The outcome is mandated; the mechanism is not. PROPOSED **M1**: `execute-verify` and the approval-create handler re-evaluate the maker's underlying permission through a guard eligibility entry point (precedence steps 1–5 and 10–11, with steps 6–7 treated as satisfied by the approval flow), centrally for all six consumers, leaving the consumers' advisory baseline and their accepted tests unchanged. Alternative **M2**: each consumer strengthens its own baseline (six modules, larger cross-module change; leaves `execute-verify` blind). C-1 approves `evaluatePermissionWithStepUp`; an additional eligibility entry point and a behaviour change in `execute-verify` are **not explicitly covered** and need owner confirmation.
2. **“Emergency revocation” and “valid snapshot” definitions** (Q2): which mechanisms count (grant/role revocation, deny override, licence lock, policy-level revocation, approval cancellation — `cancel` is unimplemented), and what makes a snapshot “valid”.
3. **Fail-closed class boundary** (C-6): Opus proposed unknown action, or `requires_approval`, `requires_step_up`, or sensitivity `sensitive`/`privileged`/`financial_critical`; treatment of a registered `normal` permission without approval flags; and the `sec1.security_alert.close` gap (registered `normal`, yet SEC-01 redeems a token for it).
4. **Policy matrix** (count, step-up, roles, expiry) for 32 redemption pairs and 8 registered-but-unredeemed pairs; **checker roster**; **role/permission grants**; provisioning method; maker role definition.
5. **Request-time contract** per pair (no repository code or operator path defines it).
6. **Exact error and audit codes** (C-10).
7. **`self_reject` semantics** beyond “permitted and audited”.
8. **Independent validation of SAVEPOINT** (Q4 says “if independently validated”). The same-session probe is not independent (E-6).
9. **Migration numbers 072/073** are the owner's planned numbers; confirm free at task time.
10. Reviewer identity and model for the fresh-context review; L1–L3 placement.

## 10. Rollout ordering (PROPOSED)
Fresh-database proof of migrations and grants → policy matrix decision → least-privilege, explicit role grants (no wildcard, no bulk `INSERT … SELECT`; revocation bumps the cache) → application change → regression and integration evidence → fresh-context independent review → human acceptance → controlled deployment. Code may merge while fail-closed (every approval denied until policies and grants exist); that is an availability cost, never a reason for a broad grant or temporary bypass. No production activation is implied.

## 11. Exclusions (must not be done)
- No runtime code, migration, grant file, configuration or consumer-module change in this checkpoint.
- No edit of `docs/OPEN_FINDINGS.md`, `docs/DECISION_LOG.md`, `docs/DOCUMENT_REGISTER.md`, `docs/00_project_state/MODULE_STATUS.md`, `docs/00_project_state/CURRENT_STATE.md` or any acceptance record.
- No change to licence scope, runtime guards (`assertNoExchangeRuntime`), capability gates, `DEC-011`…`DEC-014` boundaries, or the accepted decision-token behaviour.
- Not in scope: `IAM2-FIND-001`, `IAM2-FIND-004` (unless added by the owner), the protected-action registry, the `cancel` endpoint, L1/L3 remediation, UI.
- Do not mark any finding closed or any item accepted.

## 12. Provenance and independence
Facts in `03-evidence.md` were re-collected at the baseline commit for this checkpoint. The design review that raised F01–F07 was produced by Claude in the same shared session as the plan it reviewed; **a model switch inside one conversation is not independent review** (`docs/00_project_state/CLAUDE_CODE_USAGE_RULES.md` and the accuracy protocol). It is supporting analysis only. Closure needs the fresh-context independent review named in §6.

## Context references (explicit repo-relative files)
| Category | Path | Why |
|---|---|---|
| control | `CLAUDE.md`; `docs/00_project_state/CURRENT_STATE.md`; `docs/03_implementation/tasks/README.md` | operating rules; record conventions |
| findings | `docs/OPEN_FINDINGS.md` (`IAM2-FIND-001…004`, IAM-02 section header) | register mapping |
| decisions | `docs/DECISION_LOG.md` (DEC-005, DEC-008) | register ownership; IAM-01 session seam (no IAM-02 approval decision exists) |
| acceptance | `docs/02_modules/IAM-02/acceptance/IAM-02_Approval_Control_Adjudication_Opus_v1.0.md`; `…/IAM-02_Security_Review_Opus_v0.1.md`; `…_v0.2_reverify.md` | accepted baseline; L1–L3 |
| blueprint | `docs/02_modules/IAM-02/blueprint/v1.2/04_API_Specification.md` §4; `…/05_Database_Design.md` §2.6; `…/07_Permission_Rules.md` §4–§9 | requirements |
| source | `platform/services/iam2/src/routes/approvals.ts`; `…/routes/roles.ts`; `…/routes/internal.ts`; `…/lib/guard.ts`; `…/lib/sod.ts`; `…/lib/decision-token.ts`; `…/lib/iam01-client.ts`; `platform/services/iam/src/routes/step-up.ts`; `platform/packages/foundation/src/db.ts` | defect evidence |
| migrations/grants | `platform/infra/migrations/006_iam2_core.cjs`; `platform/infra/grants/iam2_runtime_grants.sql` | schema and privileges |
| tests | `platform/tests/integration/iam2-db.test.ts`; `platform/tests/integration/cfg1-iam2-guard-real.test.ts` | baseline and accepted baseline-pass semantics |
| owner decision | GitHub Issue #6 | approved direction |

## Acceptance criteria (checkable from repository evidence)
Documentation checkpoint (this record):
- [ ] Human review confirms the crosswalk in §2 and that no unapproved item was recorded as approved.
- [ ] The diff contains only files under `docs/03_implementation/tasks/IAM02-AUTHZ-REM-001/`.
- [ ] No governed register, acceptance record, code, migration, grant or configuration changed.

Later implementation task (separately authorised):
- [ ] Every AZ requirement in §4 has passing tests T-01…T-33 with exact commands and pass/fail/skip counts.
- [ ] Negative tests were observed failing before the change.
- [ ] R1–R4 style reproductions now refuse.
- [ ] Regression, grant-matrix and decision-token tests unchanged and passing.
- [ ] The §9 mechanism and parameters were decided by the owner before coding.
- [ ] A fresh-context independent security review and explicit human acceptance are recorded before any finding is closed.
