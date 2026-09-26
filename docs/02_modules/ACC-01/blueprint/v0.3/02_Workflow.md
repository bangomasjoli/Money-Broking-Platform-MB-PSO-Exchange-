# ACC-01 Account Structure
## 02 Workflow (v0.3)

All state-changing workflows use one mechanism — the **governed change request** (§1) — mirroring the accepted CLT-01 (`routes/decisions.ts`) and CFG-01 (`feature-changes.ts`) request/apply pattern, so no new IAM-02 seam is invented **by ACC-01**. Where the current IAM-02 seam cannot prove a property ACC-01 needs, the gap is recorded as an external dependency (§0, §1) — not papered over.

Closure *completion* is not a change request: it is a machine-verified compare-and-set (§7.6).

## 0. Reality of current IAM-02 (RF-01, R2-F04 — read before §1)

Verified against repository source (`services/iam2`, re-checked for v0.3):

| # | Fact | Source |
|---|---|---|
| 1 | `guard.ts` evaluates **step 6 (step-up) before step 7 (approval)**. With `requires_step_up = true` the check returns `step_up_required` **before approval is considered**. With `requires_approval = true` it returns `approval_required` at step 7, **before** the step-10 role-grant lookup, for **any** actor. A baseline `permission/check` on an approval-gated `acc1.*` code therefore returns `approval_required` for any actor; ACC-01 treats it as a baseline pass, so it is **not an entitlement check** | `guard.ts` |
| 2 | `/iam2/approvals/request`, `/approve`, `/reject` are guarded only by the IAM-02 internal service token and evaluate **no permission** for maker or approver. `maker_user_id` / `approver_user_id` are body fields (`IAM2-FIND-002`, HIGH, OPEN) | `routes/approvals.ts` |
| 3 | `permission/execute-verify` checks token existence, actor/action/resource/entity/client binding, payload fingerprint and cache version. It checks **no role grant** | `lib/decision-token.ts`; `routes/internal.ts` |
| 4 | The `execute-verify` body accepts an optional `approval_id`, but it is **never passed to verification and never compared**. The `approval_id` an ACC-01 caller presents is therefore **caller-asserted**, not verified; `execute-verify` does not return the token's approval id, approver, policy or maker | `routes/internal.ts`; `decision-token.ts` |
| 5 | `actor_id` in `execute-verify` is a **body field**. The token is bound to `approval.maker_user_id`, but IAM-02 does not authenticate who is calling: any holder of the internal service token **and** the decision token passes actor binding by presenting the maker's id | `routes/internal.ts` |
| 6 | The raw decision token is **returned in the `/approve` response**, i.e. to the **approve caller**, not to the maker | `routes/approvals.ts` |
| 7 | IAM-02 computes `fingerprint(payload)` itself (`"sha256:" + 64 hex`, 71 characters); the request schema has no hash field | `approvals.ts`; foundation `idempotency.ts` |

**Consequences (the claims withdrawn are listed in `05-remediation-r2.md`):**

- Any two distinct authenticated users, or any service holding the IAM-02 internal token, can request and approve; ACC-01 **provides no maker or checker entitlement** → `DEP-IAM-ENTITLEMENT`.
- ACC-01 **does not claim** that "a different caller cannot apply". Under today's seam that property does **not** hold, and ACC-01 cannot fake it by sending `actor_id = stored requested_by` (a caller-asserted value the seam accepts from anyone) → `DEP-IAM-ACTOR-BINDING` (ACC-R2-HD-07, DCR-ACC-IAM-06).
- ACC-01 **does not claim** `approval_id` is verified today. Until the actor-binding contract exists, a recorded `approval_id` carries `approval_id_source = caller_asserted` and reconciliation R-7 reports it as such.
- **Until the owning IAM-02 change exists, real governed ACC-01 apply remains gated.** ACC-01 fails closed on `DEP-IAM-ACTOR-BINDING` in every environment; development and testing satisfy it with an explicit labelled test double implementing the **target** contract (§1 step 7) — dependency injection, not an environment exception.
- The v0.1 statement that default-deny holds under an empty `role_permission` table stays **withdrawn** for approval-gated codes (true only for non-approval codes at guard step 10).

## 1. Governed change request (common mechanism)

Change types: `create_master_account`, `create_subaccount`, `close_master_account`, `close_subaccount` (closure **initiation**), `seal_closure`, `abort_closure`, `apply_restriction`, `lift_restriction`, `cancel_scheduled_restriction`. Profile edits (`display_name`, `description`) are not governed: permission-checked, audited, version-checked.

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Maker submits `POST /acc1/change-requests` with `Idempotency-Key`; `requested_by` is the **IAM-01-authenticated session principal**, never a body field | Staff maker | Baseline `acc1.*` check through IAM-02 (`approval_required` counts as pass — **not** an entitlement; §0) |
| 2 | ACC-01 validates shape and preconditions (target exists, legal transition, limits configured and not exceeded, scope applicable, client readable through the CLT-01 read seam **using the dedicated read-scoped credential**) | ACC-01 | Fail early; every precondition is re-checked at apply |
| 3 | ACC-01 stores the request, its **canonical payload** and `payload_hash = fingerprint(payload)` (`@aix/foundation`, `"sha256:" + 64 hex`, 71 characters), `status = requested`, expiry. Response: `change_request_id`, canonical `approval_payload`, `payload_hash` | ACC-01 | Audit `acc1.change_requested` |
| 4 | An **operator outside ACC-01's routes** creates the IAM-02 approval via `POST /iam2/approvals/request` with `{ maker_user_id, action, resource, entity_id, client_id, payload }` — `payload` exactly the returned `approval_payload`. **IAM-02 computes its own fingerprint**; ACC-01 never submits a hash | Operator / maker | IAM-02 approval policy |
| 5 | A checker approves via `POST /iam2/approvals/:id/approve`. IAM-02 blocks requester == approver; **it does not entitlement-check either actor today (§0)** | Checker | SoD in IAM-02 only |
| 6 | IAM-02 mints the single-use **decision token**, bound to `actor / action / resource / entity_id / client_id / payload_hash / cache_version`. Under the current seam the raw token is returned **to the approve caller** (§0 fact 6); **how it reaches the maker is outside ACC-01 and is not a control ACC-01 relies on**. Under the target contract (step 7) token custody stops being a security property, because apply is bound to an authenticated actor | IAM-02 | — |
| 7 | **Apply** — `POST /acc1/change-requests/{id}/apply` with `{ decision_token, approval_id }`. **Target contract (DCR-ACC-IAM-06, `DEP-IAM-ACTOR-BINDING`)**: IAM-02 verifies the token **and** an authenticated actor assertion, and **returns attested facts** — `approval_id`, `authenticated_actor_id`, `maker_user_id`, checker/approver identity, `policy_id`, `payload_hash`, `action`, `resource`, `entity_id`, `client_id`. ACC-01 requires `authenticated_actor_id == maker_user_id == stored requested_by`, checker ≠ maker, `payload_hash` = the recomputed stored hash, and every binding field equal to the request; it **records the attested values** (`approval_id_source = iam2_attested`) and treats the body `approval_id` as a hint that must equal the attested id. **ACC-01 consumes attested facts, never body assertions, and never fakes the proof with a caller-supplied `actor_id`.** *Local defence in depth (not a substitute for IAM-02's proof):* the IAM-01-authenticated session principal must equal the stored `requested_by` (`ACC1_ACTOR_BINDING_MISMATCH`, Critical audit); both identities are audited | Maker | see §2 |
| 8 | Request → `applied`; history + audit written in the same transaction as the mutation | ACC-01 | Fail closed if audit unrecordable |

`entity_id` in the IAM-02 action = the `change_request_id`; `client_id` = the owning client; `action` = the `acc1.*` permission code; `resource` = the resource of file 07 §2.

Requests expire (`ACC1_CHANGE_REQUEST_TTL`, required configuration) and may be cancelled by their maker (session principal = `requested_by`) while `requested`. ACC-01 does **not** learn of an IAM-02 rejection; a rejected/expired approval simply leaves the request `requested` until it expires.

## 2. Apply (mirrors CLT-01 `approve/apply` and CFG-01 — including token-consumed-after-verify discipline)

| Step | Action |
|---:|---|
| A1 | Read the stored request row; require `status = requested` and not expired; **recompute** `payload_hash` from the **stored** payload (never a live re-read) and compare with the stored hash. Mismatch ⇒ refuse. |
| A2 | Re-check preconditions **before** any state-changing network call: dependency prerequisites for the change type (`ACC1_DEPENDENCY_NOT_SATISFIED`, file 01 §4.5 — **no environment logic**); client readable/eligible through the CLT-01 read seam (**dedicated read-scoped credential; every change type reads CLT-01 at apply**); limits configured; target state. For `seal_closure`: collect a **fresh pre-seal readiness** from every configured attester (§7.4). |
| A3 | Call IAM-02 execute-verify per the **target contract** (§1 step 7) with the presented token, the authenticated actor assertion, `action`, `resource`, `entity_id = change_request_id`, `client_id` and `current_payload_hash = <recomputed>`. Any non-2xx / `execution_authorised !== true` / malformed / attested-fact mismatch ⇒ **deny**, request unchanged. This is **before** ACC-01 opens its local transaction; the token is consumed the moment verification succeeds. |
| A4 | Open the local transaction: `FOR UPDATE` the request row and target rows (for `create_subaccount` the master is read **`FOR SHARE`** first — §4); re-validate transition legality, limits (under the advisory lock), uniqueness and closure state, the **listed child set** (master closure/abort), the **pre-seal readiness binding** (seal) and the **abort evidence** (abort); perform the mutation; write status history; set request `applied` with `result_ref` and the attested approval fields; emit audit. One transaction. |
| A5 | **Any failure after A3** (including a crash or an audit failure) rolls back and leaves the row exactly `requested`. The consumed approval is **not** reusable — the operator obtains a **fresh** IAM-02 approval and applies again. This is the accepted CLT-01/CFG-01 posture: no separate `failed` write; a best-effort failure audit is attempted only when the failure is not itself an audit failure. |

Replays: applying an already `applied` request returns the recorded result and mutates nothing. Two concurrent applies cannot both pass A3 (single-use token) and serialise on the A4 row lock.

v0.1's `applying` / `verification_ref` claim-and-recover mechanism remains **withdrawn**.

## 3. WF-A — Create master account

1. Preconditions (re-checked at apply): `client_id` supplied; CLT-01 status ∈ {`active`, `active_limited`} and class ∈ {`institutional`, `hnwi`, `professional`} (`retail`/`unknown` ⇒ deny) — a **local structural backstop, not an eligibility authority** (RF-11); non-closed master accounts for the client < `ACC1_MAX_MASTER_ACCOUNTS_PER_CLIENT`; `ACC1_MAX_SUBACCOUNTS_PER_MASTER` present and ≥ 1 (else fail closed); the governed-apply dependency set **and `DEP-LED-CLOSURE-CONTRACT`** satisfied (RF-02 approved decision; file 01 §4.5).
2. Request → approval → apply (§1–§2).
3. On apply, atomically: insert `master_account` (`active`); insert the **default `general` subaccount** (`is_default = true`, `active`; **structural only**, file 01 §8); write history; snapshot `client_status_at_creation`/`client_class_at_creation`; audit `acc1.master_account_created` and `acc1.subaccount_created`. Failure of either rolls back both.
4. Created while the client is `active_limited`, the account is *inert*: client-derived effective status is `restricted` with **report-only** semantics (every transaction-producing activity denies) until CLT-01 reports `active`; it becomes usable with no ACC-01 action.

## 4. WF-B — Create subaccount

1. Preconditions: master exists; its effective status ∈ {`active`, `restricted`}; `purpose` valid; name unique among the master's **non-`closed`** subaccounts (`closing`/`closure_sealed` included); subaccount count (non-`closed`, including the default) < `ACC1_MAX_SUBACCOUNTS_PER_MASTER`, validly configured; the governed-apply set **and `DEP-LED-CLOSURE-CONTRACT`** satisfied.
2. Request → approval → apply. Owner is **taken from the master row**; a request cannot name a `client_id` for a subaccount.
3. **Concurrency with master closure (R2-F02).** The apply transaction and `trg_acc1_sa_owner` read the master row **`FOR SHARE`** before the status check. A concurrent master-closure apply (which `FOR UPDATE`s the master) therefore serialises with it: creation first ⇒ the new child is visible to the closure apply, the listed set no longer matches and the closure request is refused (new request); closure first ⇒ the master is `closing` and creation is rejected (`ACC1_PARENT_NOT_USABLE`). **A master in `closing` or later rejects new child creation.**
4. Audit `acc1.subaccount_created`.
5. **Who may be maker/checker for each purpose is not decided here** (ACC-HD-2): the Role Matrix + IAM-02 define it (DCR-ACC-GOV-02).

## 5. WF-C — Apply restriction (WF-26 application step)

ACC-01 implements only WF-26 steps **6–7 and 11** (system applies / removes restriction; affected workflows blocked by scope). Steps 1–5 and 8–10 belong to the compliance workflow and IAM-02. **Ownership of whole-client freeze, of `login_block`, and the relationship between a CLT-01 client freeze and an ACC-01 account restriction are ungoverned (DCR-ACC-GOV-05); an ACC-01 restriction never substitutes for a client-level freeze; operating this workflow requires `DEP-FREEZE-GOVERNANCE`.**

1. Maker supplies: target (master **or** subaccount), `kind` ∈ {`partial_restriction`, `suspension`, `full_freeze`}, `scopes`, `source_type`, `source_ref?`, `reason_code`, `effective_from?`, `effective_until?`.
2. Blocking conditions (WF-26 §30.6): missing reason/scope ⇒ reject; maker-checker incomplete ⇒ cannot apply; SoD conflict ⇒ IAM-02 blocks.
3. `login_block` is not an account scope ⇒ `ACC1_SCOPE_NOT_APPLICABLE`.
4. Apply inserts an `account_restriction` row, **increments the target row's `version`**, recomputes the target's stored status projection under the row lock (a `closing`/`closure_sealed` target keeps its lifecycle status; the restriction is recorded and honoured by resolution), writes history, audits Critical.
5. Multiple simultaneous restrictions are legal; stored status is the worst projection.
6. **Time-effective, not job-effective (RF-08).** A restriction whose `effective_from_utc <= now()` is **treated as active by resolution** whether its stored lifecycle state is `scheduled` or `active`. The lifecycle job is **housekeeping**: it moves `scheduled → active`, records status/history/audit and bumps `version`; a late or crashed job opens **no** enforcement gap. Resolve reports `applied_restriction_ids`. An `effective_until_utc` lapse is likewise evaluated by time; authority-sourced restrictions (`court_order`, `regulatory_directive`) never lapse by time.

## 6. WF-D — Lift restriction, and WF-D2 — Cancel a scheduled restriction (R2-F07)

**Legality is decided by effective time only — never by the stored lifecycle state, and never by whether housekeeping has run** (ACC-REQ-049):

| Restriction, evaluated **by time** at apply, under the row lock | Governed operation | Result |
|---|---|---|
| **In force** (`effective_from_utc <= now()`, not lifted/cancelled, not lapsed) — whether stored `active` **or still stored `scheduled`** | `lift_restriction` | Legal. If stored `scheduled`, the lift transaction **first performs the activation inline** (`scheduled → active`, history + audit `acc1.account_restriction_activated` with cause `lift_inline_activation`), then `active → lifted`, in one transaction |
| **Not yet effective** (`effective_from_utc > now()`, stored `scheduled`) | `cancel_scheduled_restriction` | Legal: `scheduled → cancelled` |
| Not yet effective | `lift_restriction` | Refused `ACC1_RESTRICTION_NOT_IN_FORCE` (use cancel) |
| Already effective **by time** | `cancel_scheduled_restriction` | Refused `ACC1_RESTRICTION_ALREADY_EFFECTIVE` (use lift); time may pass between submit and apply, so this is decided at apply |
| Lapsed (`effective_until_utc` passed), lifted, expired or cancelled | either | Refused `ACC1_RESTRICTION_NOT_IN_FORCE`; housekeeping aligns stored state |

**Lift:**
1. Maker requests lift with `lift_evidence_ref` (WF-26 step 9).
2. Lift **blocked** when evidence is missing, or when the source is `court_order`/`regulatory_directive` and the evidence is not recorded as an authority release (WF-26 §30.6 items 5–6).
3. Approval → apply → restriction `lifted`, target `version` incremented, status recomputed, history + Critical audit.
4. Lifting never restores a status that another still-active restriction forbids.

**Cancel scheduled restriction:**
1. Maker requests with `reason_code` and, for `court_order`/`regulatory_directive` sources, authority-release `cancel_evidence_ref` (same rule as lift).
2. Governed by **maker-checker** like every restriction change (`acc1.restriction.cancel`, approval-gated; governed-apply set + `DEP-FREEZE-GOVERNANCE`).
3. Apply → restriction `cancelled`, `cancelled_change_request_id`/`cancelled_at_utc` set, target `version` incremented (ACC-REQ-041), history + audit (`acc1.account_restriction_cancelled`). The restriction never affected any resolve, so nothing else changes.

The housekeeping job **must never determine** whether a restriction can be lifted or cancelled; stopping it changes no legality (T-195…T-198).

## 7. WF-E — Closure (WF-27, account level) — preventive, completable

Approved decisions: ACC-R2-HD-01 (drain allow-list), -02 (final checker approval before seal), -03 (governed abort), -04 (default subaccount), -05 (independent barrier). Dependency prerequisites: governed-apply set + `DEP-LED-CLOSURE-CONTRACT` (file 01 §4.5). **Until the LED-01 contract exists (DCR-ACC-LED-01c/-01e) closure cannot complete anywhere**; an empty attester configuration disables it (`ACC1_CLOSURE_ATTESTERS_UNCONFIGURED`), never "nothing to check".

```txt
ACTIVE → CLOSING/DRAINING → PRE-SEAL READY → FINAL CHECKER APPROVAL → CLOSURE_SEALED → POST-BARRIER LED ATTESTATION → CLOSED
                 └────────── governed abort (§7.7) ──────────┴────────────────────────┘
```

### 7.1 Initiation (WF-27 steps 1–3) → `closing`
1. **Request** (`close_subaccount` / `close_master_account`) → approval → apply ⇒ target `closing`, `closure_cycle` incremented. Initiation stays a governed change request under ACC-REQ-012; it is **not** the final approval (OQ-13 records that ACC-R2-HD-02 does not say whether initiation itself needs a checker).
2. **Master request:** lists **every** non-closed subaccount, the **default included** (ids, versions, statuses), bound into the approved payload. At apply, under `FOR UPDATE` on the master and every listed child, ACC-01 re-validates the set is exactly the current non-closed set; then the **master and its default `general` subaccount enter `closing` atomically** together with every other listed child not already `closing`. A child already in `closing`/`closure_sealed` from its own closure is recorded as-is. A mismatch ⇒ refused, new request.
3. **Subaccount request (non-default):** the child alone enters `closing`. The **default** cannot be the target of `close_subaccount` (`ACC1_DEFAULT_SUBACCOUNT_PROTECTED`); it enters `closing` only with its master.

### 7.2 Drain (WF-27 steps 4–8)
`closing` permits **only** the closure-drain allow-list of file 01 §7.1 (CDA-1…CDA-5) and only where every other component (restrictions, client status) still permits it; every other transaction-producing activity is denied. ACC-01 performs none of it — it supplies `closure_draining = true` and consumers apply the allow-list (file 01 §10). OFF-RULE-001 items 1–5 are cleared during drain by the owning modules. Restrictions may still be recorded against a `closing` target; the stored status stays `closing` and resolution honours the restriction.

### 7.3 Pre-seal readiness (prevents sealing a funded account)
ACC-01 collects readiness from every configured attester (attester port; stored in `closure_readiness`). A result is affirmative only if it proves: no remaining balance **or** the authorised balance-return complete; no open withdrawal or settlement requiring completion; no blocking reconciliation break; no unaccounted in-flight posting; and — for a master — every child `closed`. It returns `journal_watermark` (W_pre), `max_resolution_version_observed`, `closure_cycle_observed`, `evidence_ref`, `as_of` (file 01 §7.2). Readiness may be re-collected any number of times; **only the latest row per target + attester + `closure_cycle` counts**.

### 7.4 Final checker approval → seal (WF-27 steps 9–10; ACC-R2-HD-02)
1. **Seal request** (`seal_closure`; the maker submits **only when the latest readiness is affirmative**). The approved payload binds: target id, target `version`, `closure_cycle`, the `closure_readiness` ids and their `journal_watermark` (W_pre), the closure request id and — for a master — each child's id and `closure_seal_version`.
2. **The checker's approval of this request is the FINAL HUMAN APPROVAL**, given immediately before sealing. No second checker is needed after sealing, and none is designed.
3. **Apply** (§2): A2 collects a **fresh** readiness; if it is not affirmative, or its `journal_watermark` differs from the approved W_pre (something committed after the readiness the checker saw), the seal is refused `ACC1_CLOSURE_NOT_READY` and a new request is needed. Then A3 verify and A4 transaction: lock, re-check legality (`closing → closure_sealed` only), readiness binding, master ⇒ **all children `closed`**, no `court_order`/`regulatory_directive` block; set `closure_barrier = true`, increment `closure_seal_version`, record `closure_sealed_at_version` (= the target `version` written by this transition), bump `version`, history, Critical audit `acc1.account_closure_sealed`.
4. From this point `closure_barrier = true` and **every new posting is refused** by every consumer, independent of any other status (file 01 §10).

### 7.5 Post-barrier attestation (machine-verified)
ACC-01 collects a **fresh** attestation from every configured attester **after** the seal, sending `target_id`, `closure_seal_version`, `closure_sealed_at_version` and `preseal_watermark_ref`. Each returns `{ target_id, seal_version_observed, attestation_status, journal_watermark, preseal_watermark_ref, committed_after_preseal_watermark, max_resolution_version_committed, in_flight_count, in_flight_status, evidence_ref, as_of }` (file 01 §7.2). Rows are append-only with a monotonic sequence. Unreachable, unconfigured, malformed, stale or mismatched ⇒ `unavailable`/`blocked`. **Only the latest row per target + attester + current `closure_seal_version` counts.** A blocked or unavailable attestation is not terminal: re-collect (latest wins) or, if it cannot resolve, use the governed abort (§7.7).

### 7.6 Complete (machine-verified; **no second checker**)
`POST …/close/complete` (a non-approval, entitlement-checked permission `acc1.*.close_complete`; the criteria below are machine-verified) runs a single compare-and-set `closure_sealed → closed` **only if**, inside one transaction: status is still `closure_sealed` **and** `closure_barrier = true` at the attested `closure_seal_version`; the latest attestation of **every configured attester** is `clear` with `seal_version_observed` = current, `committed_after_preseal_watermark = 0`, `max_resolution_version_committed < closure_sealed_at_version`, `in_flight_status ∈ {none, refused_by_fence}`, `preseal_watermark_ref` = the recorded readiness watermark, and `as_of` within `ACC1_ATTESTATION_MAX_AGE_SECONDS` (secondary guard; required configuration; missing/invalid ⇒ fail closed); no active `court_order`/`regulatory_directive` restriction; for a master, every child `closed`. The barrier is never cleared on this path, so it stands from seal to close. On any failure the target **stays `closure_sealed`** (still barred), the outcome codes are returned (`ACC1_CLOSURE_BLOCKED`) and the governed abort remains available.

### 7.7 Governed abort / unseal (ACC-R2-HD-03)
`abort_closure` is a **maker-checker** governed change request, legal from `closing` **or** `closure_sealed`, **not a normal operational shortcut**:

1. **Evidence-conditioned.** The request carries a `reason_code` ∈ {`preseal_readiness_blocked`, `postseal_attestation_blocked`, `postseal_attestation_unavailable`, `closure_invariant_failed`, `authority_restriction_blocks_closure`, `attester_contract_fault`}; at apply ACC-01 verifies the matching machine evidence (latest readiness `not_ready`/`unavailable`; latest attestation `blocked`/`unavailable`; an invariant query failing; an active authority restriction; a recorded attester contract error). No evidence ⇒ `ACC1_CLOSURE_ABORT_INVALID`. It **cannot bypass a closure requirement** and cannot apply to `closed`.
2. **Scope.** A subaccount whose master is `closing`/`closure_sealed`, and the default subaccount, cannot be aborted alone (`ACC1_CLOSURE_ABORT_INVALID` / `ACC1_DEFAULT_SUBACCOUNT_PROTECTED`). A **master** abort lists every non-closed child (ids, versions) in its approved payload and returns the master **and all listed non-closed children** together. Children already `closed` stay `closed`.
3. **One transaction:** invalidate all closure-readiness and post-seal attestations (evidence is keyed to `closure_cycle` and `closure_seal_version`; abort **increments `closure_cycle`** and never resets `closure_seal_version`, so old evidence can never match a later seal); increment `version`; **clear `closure_barrier` — only here**; recompute the stored status as the projection of the restrictions **in force by time**; write history and a `closure_recovery` row; emit Critical audit `acc1.account_closure_aborted`.
4. **Never restores what another authority denied.** Only ACC-01's own projection is restored. Effective status is still computed live: a client CLT-01 has suspended, a restriction still in force, or a capability CFG-01 withholds stays denied. A new closure needs a new request.
5. LED-01 lifts its fence only when `resolve` shows `closure_barrier = false` (authoritative); a later seal has a higher `closure_seal_version` (DCR-ACC-LED-01c).

### 7.8 Master ordering
Children first: every child (the default included) drains, is sealed (own final approval), attested and closed; only when **all** are `closed` may the master be sealed (own final approval, own readiness), attested and completed. This removes the R2-F02 deadlock. A master with **only its default child** completes closure end to end (T-031, T-160).

### 7.9 Out of scope here
Items 6–8 of OFF-RULE-001 (AML/STR restriction, verified own-name return destination, retention) are **client-level** and stay with CLT-01/compliance (ACC-01 additionally refuses to seal/complete under an active authority restriction).

## 8. WF-F — Resolve (hot path)

1. Consumer presents its per-module capability secret; ACC-01 derives `caller_module` from which secret matched (never a header).
2. ACC-01 reads: subaccount, master, restrictions (both levels, **evaluated by time**), and CLT-01 status through its **dedicated read-scoped credential** (`DEP-CLT-READ-SCOPE`).
3. Computes `closure_barrier`, `closure_draining`, per-level time-effective restriction status, the descriptive `effective_status`, explanatory scopes; returns version and closure/seal evidence, `applied_restriction_ids`, `environment`. **Consumers apply the evaluation order of file 01 §10 — `closure_barrier` first, then component statuses, then product policy; the response is not an allow-list and `effective_status` is not the gate.**
4. Any unreadable input ⇒ `effective_status = "unknown"` (HTTP 200); ACC-01's own DB failure ⇒ 503. Consumers deny on both.
5. **Requires an explicit `subaccount_id`.** There is no resolve-by-client, resolve-by-master-default or "default subaccount" lookup (ACC-HD-1).
6. No per-call audit row (volume); caller-authentication failures are audited; aggregate metrics feed monitoring.

## 9. WF-G — Profile update

`PATCH` `display_name` / `description`; optimistic `version`; permission `acc1.*.update_profile`; no approval; audit `acc1.account_profile_updated`. Never touches ownership, purpose, status, `is_default`.
