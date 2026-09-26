# ACC-01 Account Structure
## 02 Workflow (v0.2)

All state-changing workflows use one mechanism — the **governed change request** (§1) — mirroring the accepted CLT-01 (`routes/decisions.ts`) and CFG-01 (`feature-changes.ts`) request/apply pattern exactly, so no new IAM-02 seam is invented (RF-07).

## 0. Reality of current IAM-02 (RF-01 — read before §1)

Verified against repository source at baseline `5a4f872`:

1. `guard.ts` returns `approval_required` at **step 7** whenever `iam2.permission.requires_approval` is true, **before** the step-10 role-grant lookup. A baseline `permission/check` for an approval-gated `acc1.*` code therefore returns `approval_required` for **any** actor, with or without any role. ACC-01 (like CLT-01) treats `approval_required` as a baseline **pass** so the check is satisfiable; it is therefore **not an entitlement check** for approval-gated codes.
2. `/iam2/approvals/request|approve|reject` are guarded only by the IAM-02 internal service token and evaluate **no permission** for maker or approver (`IAM2-FIND-002`, HIGH, OPEN). `maker_user_id` / `approver_user_id` are body fields.
3. `permission/execute-verify` checks token existence, actor/action/resource/entity/client binding, payload fingerprint and cache version. It checks **no role grant**.

**Consequence:** with today's IAM-02, an empty `iam2.role_permission` table does **not** make approval-gated ACC-01 actions unusable — any two distinct authenticated users (or any service holding the IAM-02 internal token) can drive create/close/restrict/lift. ACC-01 therefore **provides no maker or checker entitlement** and **must not be used with real actors** until `IAM2-FIND-002` is fixed (gate **G1**, file 01 §4.5). Development/test implementation with fixture actors remains permitted. The v0.1 statement that default-deny holds under an empty `role_permission` table is **withdrawn** for approval-gated codes (it remains true only for non-approval codes at guard step 10).

## 1. Governed change request (common mechanism)

Change types: `create_master_account`, `create_subaccount`, `close_master_account`, `close_subaccount`, `apply_restriction`, `lift_restriction`. Profile edits (`display_name`, `description`) are not governed: permission-checked, audited, version-checked.

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Maker submits `POST /acc1/change-requests` with `Idempotency-Key` and a **real** `requested_by` (the actor IAM-02's baseline check runs against) | Staff maker | Baseline `acc1.*` check through IAM-02 (`approval_required` counts as pass — **not** an entitlement; §0) |
| 2 | ACC-01 validates shape and preconditions (target exists, legal transition, limits configured and not exceeded, scope applicable, client eligible via the CLT-01 read seam) | ACC-01 | Fail early; every precondition is re-checked at apply |
| 3 | ACC-01 stores the request, its **canonical payload** and `payload_hash = fingerprint(payload)` (`@aix/foundation` `fingerprint`: `"sha256:" + 64 hex`, 71 characters), `status = requested`, expiry. The response returns `change_request_id`, the canonical `approval_payload` and `payload_hash` | ACC-01 | Audit `acc1.change_requested` |
| 4 | An **operator outside ACC-01's routes** creates the IAM-02 approval via IAM-02's existing `POST /iam2/approvals/request` with `{ maker_user_id, action, resource, entity_id, client_id, payload }` — `payload` being exactly the returned `approval_payload`. **IAM-02 computes its own fingerprint** of the payload it receives; ACC-01 never submits a hash to IAM-02 | Operator / maker | IAM-02 approval policy |
| 5 | A checker approves via IAM-02's existing `POST /iam2/approvals/:id/approve`. IAM-02 blocks requester == approver; **IAM-02 does not entitlement-check either actor today (§0)** | Checker | SoD in IAM-02 only |
| 6 | IAM-02 mints the single-use **decision token to the maker** (`maker_user_id`), bound to `actor / action / resource / entity_id / client_id / payload_hash / cache_version` | IAM-02 | — |
| 7 | **Apply** — `POST /acc1/change-requests/{id}/apply` with `{ decision_token, approval_id }`. **Apply is bound to the stored `requested_by`** (the request's maker): ACC-01 supplies `actor_id = stored requested_by`, never a caller-supplied value | Maker (the token's actor) | see §2 |
| 8 | Request → `applied`; history + audit written in the same transaction as the mutation | ACC-01 | Fail closed if audit unrecordable |

`entity_id` in the IAM-02 action = the `change_request_id`; `client_id` = the owning client; `action` = the `acc1.*` permission code; `resource` = the resource of file 07 §2.

Requests expire (`ACC1_CHANGE_REQUEST_TTL`, required configuration) and may be cancelled by their maker while `requested`. ACC-01 does **not** learn of an IAM-02 rejection; a rejected/expired approval simply leaves the request `requested` until it expires.

## 2. Apply (mirrors CLT-01 `approve/apply` and CFG-01 — including token-consumed-after-verify discipline)

| Step | Action |
|---:|---|
| A1 | Read the stored request row; require `status = requested` and not expired; **recompute** `payload_hash` from the **stored** payload (never from a live re-read) and compare with the stored hash. Mismatch ⇒ refuse. |
| A2 | Re-check preconditions **before** any network call: real-use gate for the change type (file 01 §4.5), client eligibility through the CLT-01 read seam, limits configured, target state. |
| A3 | Call IAM-02 `POST /internal/iam2/permission/execute-verify` with `{ decision_token, approval_id, actor_id: <stored requested_by>, action, resource, entity_id: <change_request_id>, client_id, current_payload_hash: <recomputed> }` (exact field names of the seam; `additionalProperties: false` there). Any non-2xx / `execution_authorised !== true` / malformed ⇒ **deny**, request unchanged. This is **before** ACC-01 opens its local transaction; the token is consumed the moment verification succeeds. |
| A4 | Open the local transaction: `FOR UPDATE` the request row and target rows; re-validate transition legality, limits (under the advisory lock), uniqueness, closure-barrier state; perform the mutation; write status history; set request `applied` with `result_ref`; emit audit. One transaction. |
| A5 | **Any failure after A3** (including a crash or an audit failure) rolls back and leaves the row exactly `requested`. The consumed approval is **not** reusable — the operator obtains a **fresh** IAM-02 approval and applies again. This is the accepted CLT-01/CFG-01 posture: no separate `failed` write that would face the same audit-durability problem; a best-effort failure audit is attempted only when the failure is not itself an audit failure. |

Replays: applying an already `applied` request returns the recorded result and mutates nothing. Two concurrent applies cannot both pass A3 (the token is single-use) and serialise on the A4 row lock.

v0.1's `applying` / `verification_ref` claim-and-recover mechanism is **withdrawn** as an invention beyond the accepted seam pattern.

## 3. WF-A — Create master account

1. Preconditions (re-checked at apply): `client_id` supplied; CLT-01 status ∈ {`active`, `active_limited`} and class ∈ {`institutional`, `hnwi`, `professional`} (`retail`/`unknown` ⇒ deny) — a **local structural backstop, not an eligibility authority** (RF-11); non-closed master accounts for the client < `ACC1_MAX_MASTER_ACCOUNTS_PER_CLIENT`; `ACC1_MAX_SUBACCOUNTS_PER_MASTER` present and ≥ 1 (else fail closed); gates G1 **and G2** outside DEV/TEST.
2. Request → approval → apply (§1–§2).
3. On apply, atomically: insert `master_account` (`active`); insert the **default `general` subaccount** (`is_default = true`, `active`; **structural only**, file 01 §8); write history; snapshot `client_status_at_creation`/`client_class_at_creation`; audit `acc1.master_account_created` and `acc1.subaccount_created`. Failure of either rolls back both.
4. Created while the client is `active_limited`, the account is *inert*: client-derived effective status is `restricted` with **report-only** semantics (every transaction-producing activity denies) until CLT-01 reports `active`; it becomes usable with no ACC-01 action.

## 4. WF-B — Create subaccount

1. Preconditions: master exists; its effective status ∈ {`active`, `restricted`}; `purpose` valid; name unique among the master's **non-`closed`** subaccounts (`closing`/`closure_sealed` included); subaccount count (non-`closed`, including the default) < `ACC1_MAX_SUBACCOUNTS_PER_MASTER`, which must be validly configured; gates G1 **and G2** outside DEV/TEST.
2. Request → approval → apply. Owner is **taken from the master row**; a request cannot name a `client_id` for a subaccount.
3. Audit `acc1.subaccount_created`.
4. **Who may be maker/checker for each purpose is not decided here** (ACC-HD-2): the Role Matrix + IAM-02 define it (DCR-ACC-GOV-02). ACC-01 does not add purpose-dependent role rules.

## 5. WF-C — Apply restriction (WF-26 application step)

ACC-01 implements only WF-26 steps **6–7 and 11** (system applies / removes restriction; affected workflows blocked by scope). Steps 1–5 and 8–10 belong to the compliance workflow and IAM-02. **Ownership of whole-client freeze, of `login_block`, and the relationship between a CLT-01 client freeze and an ACC-01 account restriction are ungoverned (DCR-ACC-GOV-05); an ACC-01 restriction never substitutes for a client-level freeze; real use of this workflow (G4) waits for that governance.**

1. Maker supplies: target (master **or** subaccount), `kind` ∈ {`partial_restriction`, `suspension`, `full_freeze`}, `scopes`, `source_type`, `source_ref?`, `reason_code`, `effective_from?`, `effective_until?`.
2. Blocking conditions (WF-26 §30.6): missing reason/scope ⇒ reject; maker-checker incomplete ⇒ cannot apply; SoD conflict ⇒ IAM-02 blocks.
3. `login_block` is not an account scope ⇒ `ACC1_SCOPE_NOT_APPLICABLE`.
4. Apply inserts an `account_restriction` row, **increments the target row's `version`**, recomputes the target's stored status projection under the row lock, writes history, audits Critical.
5. Multiple simultaneous restrictions are legal; stored status is the worst projection.
6. **Time-effective, not job-effective (RF-08).** A restriction whose `effective_from_utc <= now()` is **treated as active by resolution** whether its stored lifecycle state is `scheduled` or `active`. The lifecycle job is **housekeeping**: it moves `scheduled → active`, records status/history/audit and bumps `version`; a late or crashed job therefore opens **no** enforcement gap. Resolve reports the restriction ids it counted (`applied_restriction_ids`) so consumer evidence is complete even in the housekeeping-lag window. An `effective_until_utc` lapse is likewise evaluated by time at resolution; authority-sourced restrictions (`court_order`, `regulatory_directive`) never lapse by time.

## 6. WF-D — Lift restriction

1. Maker requests lift with `lift_evidence_ref` (WF-26 step 9).
2. Lift **blocked** when evidence is missing, or when the source is `court_order`/`regulatory_directive` and the evidence is not recorded as an authority release (WF-26 §30.6 items 5–6).
3. Approval → apply → restriction `lifted`, target `version` incremented, status recomputed, history + Critical audit.
4. Lifting never restores a status that another still-active restriction forbids.

## 7. WF-E — Closure (WF-27, account level) — preventive, approved sequence

Preconditions: gate G1 and G5 outside DEV/TEST. **Until the LED-01 barrier + attestation contract exists (DCR-ACC-LED-01c) closure cannot complete in any environment**; with an empty attester configuration it is disabled (`ACC1_CLOSURE_ATTESTERS_UNCONFIGURED`), never "nothing to check".

1. **Request** (`close_subaccount` / `close_master_account`) → approval → apply ⇒ target `closing`. A master request lists **every** non-closed subaccount (ids + versions, bound into the approved payload); on apply the master **and the listed children** enter `closing` in one transaction. The default subaccount closes only with its master.
2. **Drain (`closing`).** New-activity scopes are blocked; the only permitted activity is that **explicitly authorised** for a `closing` account by authoritative policy (DCR-ACC-GOV-04); absent that policy, consumers deny. OFF-RULE-001 items 1–5 (balance, open trade, settlement, withdrawal, reconciliation break) are LED-01/settlement matters cleared during drain.
3. **Seal — the final closing barrier.** `POST …/close/seal` (permission `acc1.*.close`, bound to the approved closure request, Critical audit) moves the target `closing → closure_sealed` and **increments `closure_seal_version`**. From this point **every** transactional/posting activity is denied for the target and, for a sealed master, all its children are already `closed`. LED-01 must refuse every posting when resolve shows `closure_sealed` (DCR-ACC-LED-01c). There is **no unseal** in this version (OQ-07).
4. **Post-barrier attestation.** ACC-01 collects a **fresh** attestation from every configured attester **after** the seal. Each attestation returns `{ target_id, seal_version_observed, status: clear|blocked, journal_watermark, in_flight_predating_seal: 0|n, evidence_ref, as_of }`. ACC-01 accepts it only if `seal_version_observed == current closure_seal_version`, `in_flight_predating_seal == 0`, `as_of` is within `ACC1_ATTESTATION_MAX_AGE_SECONDS` (required configuration; missing/invalid ⇒ fail closed), and `status = clear`. Unreachable, unconfigured, malformed, stale or mismatched ⇒ `unavailable`/`blocked` ⇒ **blocked**. Attestations are stored (`closure_attestation`).
5. **Complete.** `POST …/close/complete` (permission `acc1.*.close`) runs a single compare-and-set: `closure_sealed → closed` **only if** the target is still `closure_sealed`, at the attested `closure_seal_version`, with all attesters clear and no active `court_order`/`regulatory_directive` restriction. Because the barrier cannot be lifted, it remains effective from seal to close. A master may seal only when **all** children are `closed`, and completes with its **own** post-barrier attestation.
6. **A blocked completion leaves the target `closure_sealed`** (still barred). A restriction may still be recorded against it. There is no return path in this version.
7. LED-01's duty (specified in DCR-ACC-LED-01c, not built here): refuse all postings to a sealed target; attest with the observed `seal_version`, a journal watermark and a zero count of in-flight postings whose resolve evidence predates the seal; make its own resolve-then-post atomic with respect to that evidence.
8. Whether closure needs a **second human approval** is **not newly decided** in v0.2: the reviewed model is preserved (one approval at request covers the closure sequence; seal and complete are permission-checked, request-bound, machine-verified steps) unless the masters require otherwise (HD-5 remains as reviewed; file 17).
9. Items 6–8 of OFF-RULE-001 (AML/STR restriction, verified own-name return destination, retention) are **client-level** and stay with CLT-01/compliance.

## 8. WF-F — Resolve (hot path)

1. Consumer presents its per-module capability secret; ACC-01 derives `caller_module` from which secret matched (never a header).
2. ACC-01 reads: subaccount, master, restrictions (both levels, **evaluated by time**), and CLT-01 status through its **dedicated read-scoped credential**.
3. Computes effective status and explanatory scopes; returns version evidence, `applied_restriction_ids`, `environment`. **Consumers must apply the consumer rule (file 01 §10): `effective_status ≠ active` ⇒ deny transactional activity unless explicitly authorised; the response is not an allow-list.**
4. Any unreadable input ⇒ `effective_status = "unknown"` (HTTP 200); ACC-01's own DB failure ⇒ 503. Consumers deny on both.
5. **Requires an explicit `subaccount_id`.** There is no resolve-by-client, resolve-by-master-default or "default subaccount" lookup (ACC-HD-1).
6. No per-call audit row (volume); caller-authentication failures are audited; aggregate metrics feed monitoring.

## 9. WF-G — Profile update

`PATCH` `display_name` / `description`; optimistic `version`; permission `acc1.*.update_profile`; no approval; audit `acc1.account_profile_updated`. Never touches ownership, purpose, status, `is_default`.
