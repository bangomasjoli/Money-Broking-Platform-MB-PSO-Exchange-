# ACC-01 Account Structure
## 02 Workflow

All state-changing workflows use one mechanism — the **governed change request** (§1) — so that maker-checker, payload binding, audit and crash recovery are designed once.

## 1. Governed change request (common mechanism)

Change types: `create_master_account`, `create_subaccount`, `close_master_account`, `close_subaccount`, `apply_restriction`, `lift_restriction`.
(Profile edits — `display_name`, `description` — are not governed: single-step, permission-checked, audited, version-checked.)

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Maker submits `POST /acc1/change-requests` with `Idempotency-Key` | Staff maker | Baseline `acc1.*` permission check via IAM-02 (`approval_required` counts as pass, per the CLT-01 precedent — the real gate is step 6) |
| 2 | ACC-01 validates shape and **cheap preconditions** (target exists, legal transition, limits not obviously exceeded, restriction scope applicable) | ACC-01 | Fail early; never authoritative — every precondition is re-checked at apply |
| 3 | ACC-01 stores the request: canonical payload, `payload_hash` (SHA-256 of canonical JSON), `status = requested`, expiry | ACC-01 | Audit `acc1.change_requested` |
| 4 | Maker (or system) raises the approval through IAM-02's existing generic `/iam2/approvals` flow with the `payload_hash`; `approval_id` is recorded on the request | Maker | IAM-02 approval policy |
| 5 | Checker approves in IAM-02 (different user; step-up per IAM-02 policy) | Checker | SoD, self-approval blocked by IAM-02 |
| 6 | **Apply**: `POST /acc1/change-requests/{id}/apply` with the decision token | Maker or authorised operator | see §2 |
| 7 | Request → `applied`; status history + audit written in the same transaction as the mutation | ACC-01 | Fail closed if audit unrecordable |

Requests expire (`ACC1_CHANGE_REQUEST_TTL`, default 7 days — to be set) and may be cancelled by their maker while `requested`. A rejected approval marks the request `rejected` (terminal).

## 2. Apply — crash-window-safe sequence

The IAM-02 decision token is single-use and its consumption is in another service, so a crash between "token consumed" and "mutation committed" must not strand the request.

| Step | Action |
|---:|---|
| A1 | Tx-1: `SELECT … FOR UPDATE` the request; require `status = requested`; recompute `payload_hash` from the stored payload and compare with the stored hash; set `status = applying`, `apply_claimed_at_utc = now()`. Commit. |
| A2 | Call IAM-02 `execute-verify` with `{action, approval_id, decision_token, payload_hash, actor}`. Any non-affirmative ⇒ Tx: `status = failed` (reason code), audit, stop. |
| A3 | Tx-2 (on affirmative): store `verification_ref` on the request. Commit. |
| A4 | Tx-3: **re-validate every precondition against live state** (client eligibility through the CLT-01 seam *before* opening the tx; then inside the tx: target row `FOR UPDATE`, transition legality, limits under the advisory lock, uniqueness); perform the mutation; write status history; set request `applied` with `result_ref`; emit audit. One transaction. |
| A5 | Any A4 precondition failure ⇒ request `failed` with the precise reason code; the consumed approval is **not** reusable — a new request is required. |

**Recovery:** a request in `applying` with `verification_ref` set older than `ACC1_APPLY_RECOVERY_SECONDS` is completed by the same A4 path without a second `execute-verify` (verification already recorded); one in `applying` **without** `verification_ref` is marked `failed` (`ACC1_APPLY_VERIFICATION_UNCERTAIN`) because the token state is unknown — never re-tried blindly. Recovery is an internal, audited operator action, not an automatic retry loop.

## 3. WF-A — Create master account

1. Preconditions: `client_id` supplied; CLT-01 status ∈ {`active`, `active_limited`}; client class ∈ {`institutional`, `hnwi`, `professional`} (`retail`/`unknown` ⇒ deny); count of non-closed master accounts for the client < `ACC1_MAX_MASTER_ACCOUNTS_PER_CLIENT`.
2. Request → approval → apply (§1–§2).
3. On apply, atomically: insert `master_account` (`active`); if HD-1 accepted, insert the default `general` subaccount (`is_default = true`, `active`); write history rows; snapshot `client_status_at_creation` and `client_class_at_creation` as creation evidence; audit `acc1.master_account_created` (+ `acc1.subaccount_created`).
4. Created while the client is `active_limited`, the account is *inert*: its effective status is `restricted` with all transactional scopes blocked until CLT-01 reaches `active` (§06 client-derived mapping). It becomes usable with no ACC-01 action.

Merchant / issuer / investor clients (Workflow §33A.3 step 4) follow the same path; the difference is only the subaccount `purpose`, which activates nothing.

## 4. WF-B — Create subaccount

1. Preconditions: master account exists; its effective status ∈ {`active`, `restricted`}; `purpose` valid; name unique among the master's non-terminal subaccounts; subaccount count < `ACC1_MAX_SUBACCOUNTS_PER_MASTER`.
2. Request → approval → apply. Owner is **taken from the master row**, never from the request body (the request cannot name a `client_id` for a subaccount).
3. Audit `acc1.subaccount_created`.
4. Suggested checker escalation for `payments` and `rwa` purposes pending `A2-Q1`/`A2-Q2` — HD-2.

## 5. WF-C — Apply restriction (WF-26 application step)

ACC-01 implements only WF-26 steps **6–7 and 11** (system applies / removes restriction; affected workflows blocked by scope). Steps 1–5 and 8–10 (trigger, scope decision, maker/checker, notification, lift request) belong to the compliance workflow and IAM-02.

1. Maker supplies: target (master or subaccount), `kind` ∈ {`partial_restriction`, `suspension`, `full_freeze`}, `scopes`, `source_type` (FRZ-RULE-001 trigger vocabulary), `source_ref`, `reason_code`, `effective_from`, optional `effective_until`.
2. Blocking conditions (WF-26 §30.6): missing reason ⇒ reject; missing scope ⇒ reject; maker-checker incomplete ⇒ cannot apply; SoD conflict ⇒ IAM-02 blocks.
3. `login_block` is **not** an account scope (login is principal-level, IAM-01/CLT-01) ⇒ `ACC1_SCOPE_NOT_APPLICABLE`.
4. Apply inserts an `account_restriction` row (`active`), recomputes the target's stored status projection under the row lock, writes history, audits Critical.
5. Multiple simultaneous restrictions are legal; stored status is the worst projection; lifting one recomputes.
6. Scheduled `effective_from` in the future ⇒ row is `scheduled` until due; a timed expiry lapses the row to `expired` by a lifecycle job, which recomputes status and audits (lapse never *loosens* a restriction whose source is `court_order`/`regulatory_directive` — those require an approved lift).

## 6. WF-D — Lift restriction

1. Maker requests lift with `lift_evidence_ref` (WF-26 step 9: lift needs resolution evidence).
2. Lift **blocked** when the restriction `source_type` is `court_order` or `regulatory_directive` unless the evidence is recorded as an authority release; blocked when evidence is missing (WF-26 §30.6 items 5–6).
3. Approval (checker: Compliance Officer / MLRO) → apply → restriction `lifted`, status recomputed, history + Critical audit.
4. Lifting never restores a status that another still-active restriction forbids.

## 7. WF-E — Closure (WF-27 account-level)

1. **Request** (`close_subaccount` / `close_master_account`): preconditions — target not already `closing`/`closed`; default subaccount only with its master; a master closure lists every non-closed subaccount (all must be `closed` at completion).
2. Approval → apply ⇒ target status `closing` (new-activity scopes `trade_block`, `deposit_block` implied; drain of open items permitted — this pack does not decide the drain rules of other modules, it exposes the scope).
3. **Readiness**: ACC-01 calls each configured attester (initially LED-01; later WLT-01, others) for the target. Each returns `clear` / `blocked(reason_codes)`; unreachable or unconfigured ⇒ `blocked(unavailable)`. Evidence stored in `closure_attestation`.
4. `POST …/close/complete` (permission `acc1.*.close`): requires **all** attesters `clear` within `ACC1_ATTESTATION_MAX_AGE` (default 15 min) ⇒ `closed`, `closed_at_utc` set, history + Critical audit.
5. OFF-RULE-001 items 1–5 are LED-01 / settlement attestations (balance, open trade, settlement, withdrawal, reconciliation break). Items 6–8 (AML/STR restriction, verified own-name return destination, retention) are **client-level** and stay CLT-01/compliance; ACC-01 additionally refuses to complete while the target carries an active `court_order`/`regulatory_directive` restriction.
6. A blocked completion leaves the target in `closing`; a restriction may still be applied to a `closing` target. There is **no** transition back from `closing` to `active` in v0.1 (OQ-07: whether a governed "abort closure" is wanted).
7. Until LED-01 provides an attestation contract, **closure cannot complete** in any environment. This is deliberate and fail-closed, not a defect (nothing needs closing before ledger accounts exist except a mistaken creation — see the operator note in file 14).

## 8. WF-F — Resolve (hot path)

1. Consumer presents its per-module capability secret; ACC-01 derives `caller_module` from which secret matched (never from a header).
2. ACC-01 reads: subaccount row, master row, active restrictions for both, and CLT-01 status (live).
3. Computes effective status and `blocked_scopes`; returns evidence tuple and `environment`.
4. Any unreadable input ⇒ `effective_status = "unknown"` with HTTP 200 (a valid answer), **or** 503 when ACC-01 itself is unavailable. Consumers must deny on both.
5. Resolve emits no per-call audit row (volume); denials of the *caller* (bad secret) are logged; aggregate resolve outcome metrics feed monitoring.

## 9. WF-G — Profile update

`PATCH` `display_name` / `description`; optimistic `If-Match`-style `version`; permission `acc1.*.update_profile`; no approval; audit `acc1.account_profile_updated` (Medium). Never touches ownership, purpose, status.
