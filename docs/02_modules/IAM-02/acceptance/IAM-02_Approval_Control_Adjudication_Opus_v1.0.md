---
document_id: IAM-02-ACC-003
title: IAM-02 Approval Control Observations — Independent Adjudication (Opus, v1.0)
version: v1.0
document_status: APPROVED
implementation_status: N/A
module: IAM-02
control: Approval authorization, maker-checker, SoD, approval policy, approval evidence
owner: Unassigned
effective_date: 2026-09-21
last_reviewed: 2026-09-21
supersedes: none
baseline_commit: 49498f9
---

# IAM-02 — Approval Control Observations: Independent Adjudication (Opus, v1.0)

| Item | Detail |
|---|---|
| Purpose | Adjudicate the IAM-02 control observations surfaced by UI Phases 2L and 2R, which were recorded in controlled UI documentation and the project handover but never registered as findings |
| Reviewer | Independent security / authorization / governance review (Opus) |
| Method | Direct source inspection at `49498f9` — not a re-reading of the UI-phase summaries |
| Scope | IAM-02 approval lifecycle only: creation, approve, reject, SoD evaluation, approval policy, decision-token binding, audit emission, runtime grants, and every consumer of the approval flow. No code written. No test run. No database created. |
| Prior art respected | `IAM-02_Security_Review_Opus_v0.1.md` (F1/F2 + carry-forwards L1–L3) and `IAM-02_Security_Review_Opus_v0.2_reverify.md` (F1/F2 CLOSED). This adjudication does not re-open F1/F2 and does not restate L1–L3 as new findings. |

**Outcome: three findings registered — `IAM2-FIND-002` (HIGH), `IAM2-FIND-003` (MEDIUM), `IAM2-FIND-004` (LOW). Five observations adjudicated as not findings.** Nothing is closed by this review.

---

## 1. Source inspected

`services/iam2/src/routes/approvals.ts` (all three handlers in full), `routes/internal.ts`, `routes/roles.ts`, `routes/bootstrap.ts`, `lib/guard.ts`, `lib/sod.ts`, `lib/decision-token.ts`; migrations `006_iam2_core.cjs` (schema + seeded permission catalogue + seeded roles) and `007_iam2_seed_sod_rules.cjs`; `infra/grants/iam2_runtime_grants.sql`; the permission-registration migrations for consumer modules (`013`, `017`, `019`, `022`–`032`, `036`–`046`, `056`, `063`); blueprint v1.2 `04_API_Specification.md`, `06_State_Machine.md`, `07_Permission_Rules.md`, `08_Audit_Log_Events.md`; `notes/IAM-02_IMPLEMENTATION_NOTES.md` §4/§7/§8; and every module that references the approval flow (`clt1`, `wlt1`, `kyc1`, `aml1`, `sec1`, `cfg1`).

## 2. Adjudication summary

| Obs | Subject | Decision |
|---|---|---|
| **A** | Approver authorization never checked | **FINDING — `IAM2-FIND-002` (HIGH)** |
| **B** | Reject control asymmetry | **Split.** Authorization half → `IAM2-FIND-002`. Missing expiry audit event → **`IAM2-FIND-004` (LOW)**. Absent maker/SoD check on reject → design question folded into `IAM2-FIND-002` remediation |
| **C** | Approval policy table unseeded | **FINDING — `IAM2-FIND-003` (MEDIUM)** |
| **D** | `required_approver_roles` unread | **Not separate — same root cause as A**, consolidated into `IAM2-FIND-002` |
| **E** | Narrow SoD coverage | **Not a finding** — approved, documented deferral |
| **F** | Permanent block after one conflict | **Not a finding** — intended, fails closed |
| **G** | Decision/SoD evidence not readable | **Not a finding** — deferred read-side capability |
| **H** | Arbitrary action string on creation | **Not a finding** — deferred protected-action registry; binding prevents privilege gain. Creation-authorization half → `IAM2-FIND-002` |

## 3. Root-cause consolidation

**A + D + the authorization half of B + the creation half of H are one root cause**, registered once as `IAM2-FIND-002`: *the IAM-02 approval endpoints evaluate no entitlement for the acting user on any of the three governed approval permissions.* `required_approver_roles` (D) is the configuration half of the same missing control — the field cannot matter while no entitlement evaluation happens at all, and fixing A without reading D would leave the control half-built. Separate findings would have produced three rows with one remediation.

**E and F are not one root cause.** E is coverage of the conflict *catalogue* (which rules exist); F is the *lifecycle consequence* of a matched rule (what a block does to the request). They were adjudicated independently and neither became a finding.

**C is deliberately kept separate from A.** A is a code omission (no check is made); C is a configuration-plus-fail-open property (absent policy silently yields the weakest control). Fixing A does not fix C, and fixing C does not fix A.

---

## 4. Findings

### IAM2-FIND-002 — Approval endpoints enforce no permission authorization (HIGH)

**Evidence.** Migration `006_iam2_core.cjs` seeds three approval permissions as `active`:

- `iam2.approval.create` — `normal`
- `iam2.approval.approve` — **`sensitive`, `requires_step_up = true`**, carrying the migration's own inline comment *"§6 rule 3: approval of a high-risk action requires step-up."*
- `iam2.approval.reject` — `normal`

A repository-wide search for these three permission codes outside the seed migration returns **nothing**: no route, library or service evaluates any of them. `routes/approvals.ts` imports only `lookupCacheVersion` from `lib/guard.js` and never calls `evaluatePermission` or `checkPermission` in any of its three handlers. The acting user arrives as a request-body field (`maker_user_id` / `approver_user_id`) and is used for identity comparison and SoD lookup only — never for entitlement.

The omission is not architectural. `routes/roles.ts` in the same service **does** call `evaluatePermission` and consumes its decision, so the in-process pattern exists and is proven; it is simply absent from the approval path.

Consequently, and independently of who the caller claims to be:

1. No entitlement is required to **create** an approval request.
2. No entitlement is required to **approve** — so the `requires_step_up = true` flag on `iam2.approval.approve` is never reached. `lib/guard.ts` step 6 (`guard.ts:334-339`) would return the blocking decision `step_up_required` for exactly this permission, which is the governed intent of blueprint §6 rule 3. It is never invoked.
3. No entitlement is required to **reject**.
4. `approval_policy.required_approver_roles` is never read by any code path: `lookupPolicy` (`approvals.ts:80-88`) selects only `policy_id`, `required_approval_count`, `requires_step_up` and `expiry_minutes`.

**Control impact.** IAM-02 is the platform's authorization authority, and its approval flow is the sole authorization gate that six consumer modules rely on for regulated actions — CLT-01 (client application approval, client-profile suspend/reactivate/close, mandates, authorised parties/users, related parties, duplicate candidates), WLT-01 (`wlt1.destination.approve_apply`, `wlt1.evidence_export.apply`), KYC-01 (`kyc1.outcome.override`), AML-01 (`aml1.match.confirm` / `.dismiss`), SEC-01 (`sec1.security_alert.close`) and CFG-01 (kill-switch deactivation, feature enable/disable, licence-profile activate/suspend/revoke). Those modules verify a decision token that IAM-02 mints; they do not, and architecturally cannot, re-derive whether the approver was entitled to approve. The maker≠approver rule and the maker-vs-approver SoD check **are** enforced on approve, so the control is not absent — but "a different user with no seeded conflict" is the entire approver test today.

**Current exposure (does not lower the severity, and is stated precisely).** The routes are behind IAM-02's internal-service-token guard; the platform is not internet-exposed; no money-tier module is live; and **no `role_permission` rows are seeded anywhere**, so every actor's effective permission set is currently empty — meaning enforcement cannot simply be switched on without first provisioning role grants. This is a pre-operational RBAC state, not a compensating control: the approval endpoints are live and mint tokens that real modules accept.

**Severity rationale — HIGH.** Consistent with this module's own precedent: v0.1's F1 and F2 were both graded High as "core controls this module exists to provide do not fully hold", explicitly while "not exploitable end-to-end in the current partial system". This finding is the same shape — a governed, registered, seeded control that is never evaluated, in the module that defines authorization for the platform. It is not graded higher because there is no current path from an unauthenticated position to an approval decision, and the identity/SoD half of maker-checker does hold. It is not graded lower because the deficiency is in the authorization control itself, is required before any money-tier integration, and is already relied upon by six modules' regulated actions.

**Remediation requirement.** Evaluate the acting user's entitlement in all three approval handlers via IAM-02's own guard (`evaluatePermission`), consuming its decision rather than discarding it — `iam2.approval.create` on create, `iam2.approval.approve` on approve, `iam2.approval.reject` on reject — and honour the resulting `step_up_required` / `deny` outcomes. Decide and record, as part of the same turn, (a) whether `required_approver_roles` becomes the enforced role constraint or is removed as dead metadata, and (b) whether reject requires maker separation and an SoD check, or is deliberately asymmetric because a rejection denies rather than grants (see §5, Observation B). Provisioning `role_permission` grants is a prerequisite for enabling enforcement.

**Closure criteria.** All three handlers call the guard and act on its decision; a regression test proves an actor without the relevant permission is refused on each of create / approve / reject through the real app path; a test proves `iam2.approval.approve`'s `requires_step_up` is honoured; the `required_approver_roles` decision is recorded in the module's controlled notes; and an independent re-review confirms it.

**Dependencies.** Requires `role_permission` seeding (no rows exist). Interacts with carry-forward **L3** (identity is caller-asserted, not authenticated) — entitlement enforcement is necessary but not sufficient while the interim trust model stands; L3 is not superseded by this finding.

---

### IAM2-FIND-003 — Absent approval policy silently yields the weakest control (MEDIUM)

**Evidence.** `iam2.approval_policy` exists with `required_approval_count`, `requires_step_up`, `expiry_minutes` and `required_approver_roles`, and the runtime role holds `SELECT` on it. **No `INSERT INTO iam2.approval_policy` exists anywhere** in migrations, seeds or service code, and the runtime role has no `INSERT` — so no policy row exists and no route can create one. `lookupPolicy` returns `undefined`, and `approvals.ts:145-146` applies `requiredCount = 1`, `expiryMinutes = 1440`, with step-up requested only when `policy?.requires_step_up` is true — that is, never.

An absent policy is therefore indistinguishable from a policy that says "one approval, no step-up", and the fallback is applied silently: no warning, no audit event, no fail-closed branch.

**Control impact.** Blueprint §4 lists sixteen action classes that require maker-checker and §6 lists ten requiring step-up — including *payout destination approval* and *approval of a high-risk action*. WLT-01's `wlt1.destination.approve_apply` is a live implementation of the former, and its seeded permission carries `requires_step_up = false`, so step-up for that workflow is enforced neither at the consumer permission, nor by approval policy, nor (per `IAM2-FIND-002`) via `iam2.approval.approve`. Every approval in the platform is currently single-approval, no-step-up, by silent default rather than by decision. n-of-m exists in the model and is exercised correctly (`approved_count`/`required_count`), but nothing can ever configure it above one.

**Severity rationale — MEDIUM.** The mechanism is built and correct; what is missing is governed configuration plus a fail-closed guard for actions the blueprint marks as high-risk. It is not HIGH because no control is bypassed that was ever configured, the defaults are not unreasonable for a pre-production platform, and the blueprint's §5 list is framed as examples. It is not LOW because at go-live the platform would apply the weakest setting to regulated approvals silently, which is precisely the condition an approval-policy table exists to prevent.

**Remediation requirement.** Seed and govern approval policies for the implemented approval-gated actions, with `required_approval_count` and `requires_step_up` derived from blueprint §4/§6; and make a missing policy fail closed (or explicitly and auditably fall back) for any permission marked `sensitive`, `financial_critical` or `requires_step_up`. Policy content is a compliance decision, not an implementation choice.

**Closure criteria.** Policy rows exist for the approval-gated actions of every integrated module; a test proves an action requiring step-up or multi-approval cannot be approved under the bare default; the fallback behaviour for an unmatched action is decided, implemented and tested; independent re-review confirms it.

**Dependencies.** Should be remediated with or after `IAM2-FIND-002` — enforcing `required_approver_roles` is meaningless while no policy row exists.

---

### IAM2-FIND-004 — `iam2.approval_expired` not emitted when expiry is recorded via reject (LOW)

**Evidence.** `08_Audit_Log_Events.md` requires `iam2.approval_expired` ("Approval expired", Medium). The approve handler's expiry branch (`approvals.ts:247-258`) persists `status = 'expired'` **and** publishes `iam2.approval_expired`. The reject handler's expiry branch (`approvals.ts:450-453`) persists the identical state transition and publishes **nothing**, returning `IAM2_APPROVAL_EXPIRED` directly.

Because expiry is written lazily — only when a decision is attempted after `expires_at_utc`, as there is no sweeper — whether a governed audit event exists for a real state transition depends on which route happened to observe it first.

**Control impact.** Evidence completeness only. The state change is durably persisted either way, and the audit record is not the source of truth for the request's status. No authorization decision depends on it. The surrounding discipline is otherwise correct: the handler deliberately returns structured outcomes rather than throwing, precisely so denial paths keep their durable writes.

**Severity rationale — LOW.** A single, narrowly-scoped missing audit emission on one branch, with no authorization or money-flow consequence, and an unambiguous fix. Consistent with the register's use of LOW for audit-metadata completeness gaps (e.g. `CLT-FIND-001`).

**Remediation requirement.** Publish `iam2.approval_expired` in the reject handler's expiry branch, inside the same transaction, matching the approve handler's payload shape.

**Closure criteria.** The event is emitted on both paths and a regression test asserts it for the reject path.

---

## 5. Observations adjudicated as NOT findings

### B (residual) — reject does not enforce maker separation, SoD or step-up — *design question, not a deficiency*

Verified: the reject handler checks existence, expiry and `pending` status, enforces one decision per approver through the DB `UNIQUE` constraint, then records the decision and sets `rejected`. It performs no maker≠rejecter check, no SoD check and no step-up. Approve does all three.

This is not registered as a control deficiency because a rejection **denies** rather than grants: it cannot produce a decision token, cannot authorize a downstream action, and moves no regulated state beyond terminating the request. Self-rejection is in practice a request withdrawal — notable because the blueprint's `POST /iam2/approvals/{approval_id}/cancel` (§4.5) and the `cancelled` state (§06 state machine) are unimplemented and `cancelled` is never written, so reject is the only withdrawal path that exists. The security-relevant half of the asymmetry — that *anyone* who can reach the route may reject — is the entitlement gap already registered as `IAM2-FIND-002`, and is resolved by requiring `iam2.approval.reject`. Whether reject should additionally require maker separation is a governance decision, explicitly listed in that finding's remediation scope.

### E — narrow SoD coverage — *approved, documented deferral*

Verified: `007_iam2_seed_sod_rules.cjs` seeds exactly two `permission_permission` rules (`iam2.sod.manage` vs `iam2.role.assign_user` / `iam2.permission.assign_role`); `crossMatches` (`lib/sod.ts:106-127`) evaluates `role_role` and `permission_permission` and ignores `action_action`. A recorded `pass` therefore means only that no seeded rule matched.

This is already governed as a deferral, not a defect: `IAM-02_IMPLEMENTATION_NOTES.md` §7 lists *"Meta-SoD beyond the one seeded core rule (full canonical SoD matrix remains blueprint §13's open item)"* as not built per approved scope, and §4 states plainly that `role_role` rows are evaluated but none is seeded and `action_action` is "not required this stage". Blueprint §5 is titled "SoD Conflict **Examples**". Registering this as a new finding would duplicate an existing, accepted scope deferral. **Classification: future capability gap, tracked in `IAM-02` §7 and blueprint §13.** Its go-live materiality is real and belongs to the Phase 6/7 planning turn, not to this register.

### F — a matched conflict blocks the request permanently — *intended design, fails closed*

Verified: on a matched conflict, approve writes `status = 'blocked'`, records a `sod_check` row with `result = 'block'`, publishes `iam2.sod_conflict_detected`, and returns. Every later approve or reject sees a non-`pending` request and is refused with `IAM2_APPROVAL_ALREADY_DECIDED` — so one conflicted candidate's attempt terminates a request that a different, non-conflicting approver could legitimately have decided.

Blueprint §06 defines `pending --> blocked_by_sod` as a terminal state, so blocking the request (not merely the attempt) is the specified behaviour, and it **fails closed**. Its marginal risk is also negligible: anyone able to trigger it can already reject the same request outright. The genuine consequence is availability and workflow friction — a new request must be raised — which is a design question for the Phase 6/7 SoD work (alongside the deferred risk-acceptance path), not a control deficiency. **Classification: expected design with a recorded availability side-effect.**

### G — `approval_decision` / `sod_check` not readable — *deferred read-side capability*

Verified: the runtime role holds `INSERT` only on both tables (`iam2_runtime_grants.sql`), with the grant file's own comment recording that `approval_decision` is "never read back". Blueprint `04_API_Specification.md` §4.2 (`GET /iam2/approvals/pending`) and §8.2 (`GET /iam2/evidence/approvals/{approval_id}`) are specified and unimplemented, and §7 of the implementation notes defers sensitive-read evidence logging on evidence-read endpoints.

Evidence is durably written and complete; only queryability is absent, and the corresponding endpoints are unbuilt scope. Per this review's own terms of reference, an unimplemented read side is not a defect. **Classification: future capability gap.** Recorded for the implementing turn: it requires a grant change as well as routes, and evidence reads must carry the sensitive-read audit that §7 defers.

### H — approval creation accepts an arbitrary action string — *deferred protected-action registry*

Verified: `CreateApprovalBody` constrains `action` only to a 1–128 character string, and the insert stores it unvalidated against `iam2.permission`. A request may therefore be created for a misspelled or non-existent action.

No privilege can be gained. The decision token is bound to the action at issue, and `verifyAndConsumeDecisionToken` compares it against the action the consumer presents from its own hardcoded constant; a token minted for a bogus action can never satisfy a real consumer, and a mismatch revokes the token and raises a Critical `iam2.decision_token_binding_mismatch` audit event. The residual risk is misleading approval artifacts — an evidence-quality concern. The control that would close it is the **protected-action registry**, explicitly deferred in `IAM-02` §7, whose governed audit event `iam2.unregistered_sensitive_action_blocked` (08, Critical) is defined and never emitted. **Classification: deferred control, tracked in `IAM-02` §7.** The authorization half of creation — that no entitlement is required to create a request at all — is registered under `IAM2-FIND-002`.

---

## 6. Blocking treatment

| Finding | UI Phase 2S | Frontend / API integration | UAT | Production exposure |
|---|---|---|---|---|
| `IAM2-FIND-002` (HIGH) | **No** | **Yes — blocks** any integration that lets a browser-originated actor create or decide an approval | **Yes — blocks** UAT of an approval workflow with real actors | **Yes — blocks** |
| `IAM2-FIND-003` (MEDIUM) | **No** | No | **Conditional** — blocks UAT intended to evidence n-of-m or step-up | **Yes — blocks** |
| `IAM2-FIND-004` (LOW) | **No** | No | No | **No** — remediate opportunistically |

**Why none blocks UI Phase 2S.** 2S is Users / Roles / Permissions: a read-only, `B`-classified prototype over demo data with no fetch, no server action, no auth and no mutation, exactly as Phases 2L–2R were built. It cannot exercise, weaken or depend on these controls. Implementation sequencing and go-live control readiness are distinct, and a backend authorization finding does not gate a disconnected prototype. **2S must not, however, present approver entitlement, approval policy or required approver roles as enforced controls** — the same discipline Phase 2R applied, which is what surfaced these observations.

**On UAT.** `IAM2-FIND-002` blocks any UAT that would evidence maker-checker as a working control with real actors, because the result would not demonstrate the control the blueprint specifies. It does not block unrelated UAT.

---

## 7. What is correct (verified in this review, not exhaustive)

- **Maker ≠ approver is genuinely enforced on approve**, audited as `iam2.self_approval_blocked`, and correctly leaves the request `pending` rather than consuming it.
- **SoD is enforced at approval-decision time against effective permission sets**, sequentially (F2's fix holds), with a durable `sod_check` row on both pass and block.
- **Decision-token binding holds** (F1's fix holds): binding is checked inside `verifyAndConsumeDecisionToken`, so every caller inherits it; a mismatch revokes the token and raises a Critical audit event; a null-payload approval mints no token.
- **The `approved_count`/`required_count` increment is atomic** and guarded by `status = 'pending'`; one decision per approver is enforced by a DB `UNIQUE` constraint with the duplicate mapped to a clean error.
- **Denial paths that write are returned as structured outcomes, not thrown**, so expiry, self-approval and SoD blocks keep their durable rows and audit events.
- **Grants are least-privilege** and the approval tables are correctly append-only for the runtime role.
- **Expiry is evaluated before self-approval**, so an expired request is expired regardless of who asks.

## 8. Register consistency note (no action taken here)

Carry-forwards **L1** (no freeze/auth-level re-check at execute-verify), **L2** (step-up assertions reusable within their freshness window) and **L3** (interim trust model: one shared internal-service token plus caller-asserted user ids) remain open and are tracked **only** in `IAM-02_Security_Review_Opus_v0.1.md` / `v0.2_reverify.md`, not in `OPEN_FINDINGS.md`, whose own header states it is the single current register for unresolved findings and deferred controls. The same is true of the `IAM-02` §7 deferrals cited above. This review does not register them, because doing so would exceed its remit and would restate accepted scope as new findings — but the visibility gap is recorded here for a governance decision.

*No code, test, migration or application file was modified by this review. No database was created. No finding was closed.*
