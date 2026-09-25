# ACC-01 Account Structure
## 07 Permission Rules

## 1. Principles

1. **Default deny.** Every `/acc1/*` route is guarded by IAM-02; an absent permission, an unavailable IAM-02, or a malformed response denies.
2. **A permission never activates a capability** (Role Matrix §3.7). Holding `acc1.subaccount.create` does not make any product available; an `active` subaccount does not grant anyone access to anything. `IAM-02` owns permission evaluation; `CFG-01` owns capability evaluation; ACC-01 owns neither.
3. **A capability denial is never reported as a permission denial, and vice versa** (Role Matrix §3.7 rule 4): ACC-01 status denials surface as `ACCOUNT_*` / `ACC1_ACCOUNT_*` reasons from `resolve`, not as `PERMISSION_DENIED`.
4. **Backend is the source of truth.** No UI state is a control.
5. **Sensitive reads are logged** (Role Matrix §3.6) — cross-client listings and status history.
6. **The same rules apply in all five environments** (Role Matrix §3.8); every permission decision records the environment.

## 2. Permission catalogue (proposed `iam2.permission` rows, `owner_module = 'ACC-01'`)

All rows: `licence_locked = false`, `prohibited = false`, `status = 'active'`. **`licence_locked = false` is deliberate** (CFG-01 Phase 3A F-1 lesson; migration 022 comment): `guard.ts` treats `licence_locked = true` as an unconditional deny reserved for genuine licence-locked business capabilities, which account administration is not.

| permission_code | resource | action | sensitivity | requires_approval | Notes |
|---|---|---|---|---|---|
| `acc1.master_account.read` | master_account | read | normal | false | |
| `acc1.master_account.create` | master_account | create | sensitive | **true** | Submit + apply |
| `acc1.master_account.update_profile` | master_account | update_profile | normal | false | Name/description only |
| `acc1.master_account.close` | master_account | close | financial_critical | **true** | Also gates `close/complete` (baseline check only — approval already spent at request) |
| `acc1.subaccount.read` | subaccount | read | normal | false | |
| `acc1.subaccount.create` | subaccount | create | sensitive | **true** | |
| `acc1.subaccount.update_profile` | subaccount | update_profile | normal | false | |
| `acc1.subaccount.close` | subaccount | close | financial_critical | **true** | |
| `acc1.restriction.apply` | restriction | apply | financial_critical | **true** | Compliance-domain |
| `acc1.restriction.lift` | restriction | lift | financial_critical | **true** | Compliance-domain |
| `acc1.restriction.read` | restriction | read | normal | false | |
| `acc1.history.read` | status_history | read | sensitive | false | Sensitive-read-logged |
| `acc1.change_request.read` | change_request | read | normal | false | |
| `acc1.change_request.cancel` | change_request | cancel | normal | false | Maker's own request only (application-enforced) |

- `requires_step_up` is **not** set on the catalogue rows: `guard.ts` returns `approval_required` before `step_up_required`, and step-up is applied to the *checker's* approve action by IAM-02 approval policy (DCR-ACC-IAM-02).
- Internal seams (`resolve`, `scope-validate`, `open-accounts`, reconciliation extract) have **no** human permission: they are service-to-service, guarded by per-module capability secrets — the same posture as CLT-01's internal seams and CFG-01's `evaluate`.
- Catalogue rows are inserted by an `iam2`-scoped migration (precedent 022) and **no `iam2.role_permission` row is seeded**. Who holds what is decided through IAM-02's approved role-assignment workflow. Until `iam2.role_permission` has rows nobody holds an effective permission (`IAM2-FIND-002`, DEC-011), so the routes are unusable by any human in a real environment — by design, not a defect of ACC-01.

## 3. Proposed role mapping (for IAM-02 role-assignment; **not** seeded, HD-2)

The Role Matrix v1.3 has **no row for account structure**; these are proposals to be reviewed and, if accepted, added to the Role Matrix (DCR-ACC-GOV-02). Legend: M = maker, K = checker.

| Action | Maker | Checker | Rationale |
|---|---|---|---|
| Create master account | `OPS_OFFICER` or `COMPLIANCE_ANALYST` | `OPS_MANAGER` or `COMPLIANCE_OFFICER` | Structural, follows client approval; compliance-critical module |
| Create subaccount (`general`/`trading`/`treasury`) | `OPS_OFFICER` | `OPS_MANAGER` | Operational separation |
| Create subaccount (`payments`/`rwa`) | `OPS_OFFICER` / `PAY_OPERATIONS_OFFICER` / `RWA_OPERATIONS_OFFICER` | `COMPLIANCE_OFFICER` (+ ops manager) | Pending `A2-Q1`/`A2-Q2`; conservative |
| Close master/sub account | `COMPLIANCE_ANALYST` / `COMPLIANCE_OFFICER` | `COMPLIANCE_OFFICER` / `MLRO` | Role Matrix §7: "Close client account" — compliance K/A, ops/finance R |
| Apply restriction | `COMPLIANCE_ANALYST` / `COMPLIANCE_OFFICER` | `COMPLIANCE_OFFICER` / `MLRO` | Role Matrix §23 "Account freeze/unfreeze" (existing row) |
| Lift restriction | same | `COMPLIANCE_OFFICER` / `MLRO` | Same row |
| Read accounts | `SUPPORT_AGENT`, `OPS_*`, `FINANCE_*`, `COMPLIANCE_*`, `AUDITOR`, `MANAGEMENT` (read-only) | — | |
| Update profile | `OPS_OFFICER`, `ADMIN` | — | Non-governed |
| Read status history | `COMPLIANCE_*`, `AUDITOR`, `MANAGEMENT` | — | Sensitive-read-logged |

`SUPER_ADMIN` and `ADMIN` gain **no** implicit account authority; no role bypasses maker-checker.

## 4. Maker-checker and segregation of duties

1. **Maker ≠ checker**, enforced by IAM-02 (`IAM2_SELF_APPROVAL_BLOCKED`); ACC-01 additionally refuses `apply` by a caller who is not the request's maker or an explicitly authorised operator, and never lets the checker be the requester of the request they approve.
2. **Payload-bound:** the approval carries `payload_hash`; `execute-verify` fails on mismatch (`IAM2_PAYLOAD_HASH_MISMATCH`). Editing a request is not possible — a changed request is a new request.
3. **One approval, one apply.** A consumed decision token is never reusable; a failed apply needs a new approval.
4. **Freeze/restrict asymmetry is a *proposal only* (OQ-06/HD-4):** WF-26 requires maker-checker for both directions. Whether an emergency, restrict-only, single-actor path is wanted (court order, active theft) is a human decision; **v0.1 does not include one**, and any such path would be restrict-only, never lift, always auditable and never available to activate anything.
5. Conflicts, per Role Matrix §24, are IAM-02's to evaluate. ACC-01 states the pairs it relies on: creator ≠ approver of the same request; restriction applier ≠ restriction lifter approver for the same restriction where IAM-02 policy so defines.
6. **Break-glass never activates or bypasses** (Role Matrix §19A rule 6, §20): no break-glass path exists to create, close or lift through ACC-01.

## 5. Subaccount-scoped permissions — the split of responsibility

| Aspect | ACC-01 | IAM-02 |
|---|---|---|
| The set of valid `(client_id, master_account_id, subaccount_id)` triples | **owns** | consults `scope-validate` |
| Storing a user's subaccount-scoped grant | — | **owns** (extension; `iam2.user_role` currently has an unused `client_id`) |
| "Scope narrows, never widens; combining scoped grants never yields unscoped" (Role Matrix §5.2A) | relies on | **enforces**; §29 item 39 tests are IAM-02's |
| Whether a grant to a `closed` subaccount is valid | supplies status | decides |
| Membership authority (who may act for the entity) | — (CLT-01) | consumes CLT-01 |

Membership authority ≠ subaccount scope (decision pack §4.7): CLT-01 says *who may act for the entity*; the scope grant says *on which subaccount*. The `X-AIX-Client-Id` narrowing-only rule extends to a subaccount selector **narrowing only**; a selector can never be authority.

**Exact subaccount-scoped permission model** is Role Matrix §30 open item 19 and is **not decided here**; ACC-01 supplies the registry it will point at.

## 6. Prohibited

ACC-01 defines and grants no permission whose name or effect is: activate a capability; set an environment or production activation state; move or view a balance; create or edit a legal entity or membership; transfer account ownership; delete an account; bypass closure readiness; act as any principal.
