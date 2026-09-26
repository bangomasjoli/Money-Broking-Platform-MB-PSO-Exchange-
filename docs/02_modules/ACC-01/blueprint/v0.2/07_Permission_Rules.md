# ACC-01 Account Structure
## 07 Permission Rules (v0.2)

## 1. Principles

1. **Default deny — where IAM-02 actually enforces it.** Non-approval permission codes reach the guard's step-10 role lookup, so an absent grant denies. **Approval-gated codes do not** (§3). ACC-01 does not paper over this.
2. **A permission never activates a capability** (Role Matrix §3.7). Holding `acc1.subaccount.create` does not make any product available; an `active` subaccount, a `purpose`, or the default subaccount grants nobody access to anything. `IAM-02` owns permission evaluation; `CFG-01` owns capability evaluation; ACC-01 owns neither.
3. **A capability/status denial is never reported as a permission denial, and vice versa** (Role Matrix §3.7 rule 4).
4. **Backend is the source of truth.** No UI state is a control.
5. **Sensitive reads are logged** (Role Matrix §3.6).
6. **The same rules apply in all five environments** (Role Matrix §3.8) — except the fail-closed **real-use gates** of file 01 §4.5, which restrict, never relax.
7. **ACC-01 assigns no roles and invents no maker/checker authority (ACC-HD-2).** The Role & Permission Matrix and IAM-02 define who may make and check. ACC-01 cites existing Matrix rows only as the *source* for the DCRs; it never restates them as its own assignments.

## 2. Permission catalogue (proposed `iam2.permission` rows, `owner_module = 'ACC-01'`)

All rows: `licence_locked = false` (CFG-01 Phase 3A F-1 lesson; `guard.ts` treats `licence_locked = true` as an unconditional deny reserved for licence-locked business capabilities), `prohibited = false`, `status = 'active'`.

| permission_code | resource | action | sensitivity | requires_approval | Notes |
|---|---|---|---|---|---|
| `acc1.master_account.read` | master_account | read | normal | false | |
| `acc1.master_account.create` | master_account | create | sensitive | **true** | Submit + apply |
| `acc1.master_account.update_profile` | master_account | update_profile | normal | false | |
| `acc1.master_account.close` | master_account | close | financial_critical | **true** | Also baseline-gates `close/seal` and `close/complete` (bound to the approved closure request) |
| `acc1.subaccount.read` | subaccount | read | normal | false | |
| `acc1.subaccount.create` | subaccount | create | sensitive | **true** | |
| `acc1.subaccount.update_profile` | subaccount | update_profile | normal | false | |
| `acc1.subaccount.close` | subaccount | close | financial_critical | **true** | |
| `acc1.restriction.apply` | restriction | apply | financial_critical | **true** | |
| `acc1.restriction.lift` | restriction | lift | financial_critical | **true** | |
| `acc1.restriction.read` | restriction | read | normal | false | |
| `acc1.history.read` | status_history | read | sensitive | false | Sensitive-read-logged |
| `acc1.change_request.read` | change_request | read | normal | false | |
| `acc1.change_request.cancel` | change_request | cancel | normal | false | Maker's own request only |

- `requires_step_up` is not set on catalogue rows (`guard.ts` returns `approval_required` before `step_up_required`); step-up is an approval-policy matter (DCR-ACC-IAM-02c).
- Internal seams have **no** human permission: they are service-to-service, guarded by per-module capability secrets.
- Catalogue rows are inserted by an `iam2`-scoped migration (precedent 022); **no `iam2.role_permission` row is seeded**. Who holds what is decided by IAM-02's governed workflow and the Role Matrix, not by ACC-01.

## 3. What current IAM-02 does and does not provide (RF-01 — verified in source)

| Fact | Source |
|---|---|
| For any permission with `requires_approval = true`, `permission/check` returns `approval_required` at guard **step 7**, **before** the step-10 role-grant lookup, for **any** actor | `services/iam2/src/lib/guard.ts` |
| `/iam2/approvals/request` takes `maker_user_id` as a body field and evaluates **no** permission; `/approve` takes `approver_user_id` likewise; neither is entitlement-checked; the routes are guarded only by the IAM-02 internal service token | `routes/approvals.ts`; `OPEN_FINDINGS.md` `IAM2-FIND-002` (HIGH, OPEN) |
| `permission/execute-verify` checks token existence/status/expiry, actor/action/resource/entity/client binding, payload fingerprint and cache version — **no role grant** | `lib/decision-token.ts`; `routes/internal.ts` |
| No `iam2.approval_policy` row exists; the weakest setting (one approval, no step-up, 24 h) is applied silently | `IAM2-FIND-003` (MEDIUM, OPEN) |
| `iam2.role_permission` has zero rows | CURRENT_STATE; DEC-011 enforcement dependency |

**Therefore, under current IAM-02:**

1. **Current IAM-02 does NOT provide sufficient maker or checker entitlement for real ACC-01 governed actions.** Empty `role_permission` does **not** make them unusable: any two distinct authenticated users, or any service holding the IAM-02 internal token, can request and approve.
2. `IAM2-FIND-002` is a **hard prerequisite** before any real-actor ACC-01 create, close, restrict or lift (gate **G1**, file 01 §4.5). Its platform-wide dimension — the step-7 short-circuit affects **every** approval-gated permission of every module, CLT-01 included — should be considered when the `IAM2-FIND-002` governance row is next revised (recorded here; `OPEN_FINDINGS.md` is **not** modified by this task).
3. DEVELOPMENT/TEST implementation with fixture actors is permitted; tests are rewritten to the **actual** behaviour (file 10 T-060, T-127…T-129).
4. The IAM-02 internal service token that ACC-01 would need for `permission/check` and `execute-verify` also reaches IAM-02's approval-creating routes; ACC-01 must use a **scoped** credential (DCR-ACC-IAM-05) and **never** the general token.

### 3.1 Proposed later pattern (for IAM-02 ownership — **not implemented, not decided**, DCR-ACC-IAM-04)

An **approval-gated action plus an entitlement mechanism that cannot be bypassed by the `approval_required` short-circuit**. Two candidate shapes, both IAM-02's to choose:

- **(A) Paired codes.** Each approval-gated action `X` is paired with a non-approval *initiate* code `X.initiate` (e.g. `acc1.master_account.create.initiate`, `requires_approval = false`), checked at submit **and** apply through the ordinary step-10 role lookup, so the maker's role is enforced independently of step 7; a separate `X.approve` code is checked at approval creation/decision (which additionally requires the `IAM2-FIND-002` route guard).
- **(B) Guard reordering.** IAM-02 evaluates the role-grant step **before** returning `approval_required`, so `approval_required` is only returned to an entitled actor.

ACC-01 makes no assumption about which is chosen; it requires only that, after the fix, an un-entitled maker or checker **cannot** drive an ACC-01 governed action, evidenced by IAM-02's own tests. Any resulting new permission codes are added by the DCR, not invented here.

## 4. Maker-checker and segregation of duties

1. **Maker ≠ checker** — enforced by IAM-02 at approval (`IAM2_SELF_APPROVAL_BLOCKED`). ACC-01 additionally enforces **apply bound to the stored maker**: `execute-verify` receives `actor_id = stored requested_by`, and the token was issued to that maker, so a different caller cannot apply. ACC-01 cannot see the approver's identity (execute-verify never exposes it) — the documented CLT-01/CFG-01 limitation; it is not invented around.
2. **Payload-bound** — the approval is created by an operator with the canonical `approval_payload`; IAM-02 fingerprints it; `execute-verify` fails on mismatch (`IAM2_PAYLOAD_HASH_MISMATCH`). A changed request is a new request.
3. **One approval, one apply.** A consumed token is never reusable; a failure after successful verification requires a **fresh** approval.
4. **Who may be maker and checker** for each change type is **not defined by ACC-01** (ACC-HD-2). Existing Role Matrix rows relevant as *sources*: §7 "Close client account" and §23 "Account freeze/unfreeze". Rows for master-account/subaccount **create**, and the maker/checker for **close**, **restrict** and **lift** as applied to accounts, must be governed in the Role Matrix + IAM-02 (**DCR-ACC-GOV-02**). Until then no real-actor governed apply is permitted (G1).
5. **Emergency restrict-only single-actor path:** not in this version (OQ-06/HD-4, recommended); WF-26 requires maker-checker. Any such path would be a later human decision, restrict-only, never able to lift or activate.
6. **Break-glass never activates or bypasses** (Role Matrix §19A rule 6, §20): no break-glass path exists to create, close, seal or lift through ACC-01.
7. SoD conflicts (Role Matrix §24) are IAM-02's; ACC-01 relies on creator ≠ approver of the same request.

## 5. Subaccount-scoped permissions — split of responsibility

| Aspect | ACC-01 | IAM-02 |
|---|---|---|
| Valid `(client_id, master_account_id, subaccount_id)` triples | **owns** | consults `scope-validate` |
| Storing a user's subaccount-scoped grant | — | **owns** |
| "Scope narrows, never widens; combining scoped grants never yields unscoped" (Role Matrix §5.2A) | relies on | **enforces**; §29 item 39 tests are IAM-02's |
| Whether a grant to a `closed` subaccount is valid | supplies status | decides |
| Membership authority | — (CLT-01) | consumes CLT-01 |

`scope-validate` never calls IAM-02 (re-entrancy safety, test T-126). The default subaccount is **not** a default scope: no grant, role or consumer may treat it as a fallback scope when a scope is missing.

## 6. Prohibited

ACC-01 defines and grants no permission whose name or effect is: activate a capability; set an environment or production activation state; move or view a balance; create or edit a legal entity or membership; transfer ownership; delete an account; bypass closure readiness or the closing barrier; unseal; assign a role; act as any principal.
