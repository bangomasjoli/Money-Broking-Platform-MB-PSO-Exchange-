# ACC-01 Account Structure
## 06 State Machine (v0.4)

Statuses are lowercase snake_case, matching the repository convention. Legal transitions are enforced in the database (file 05 §5) and again in the application.

## 1. Master account and subaccount status

Identical vocabulary: `active`, `restricted`, `suspended`, `frozen`, `closing`, `closure_sealed`, `closed`. **PRE-SEAL READY is evidence (`closure_readiness`), not a status** — the vocabulary stays at seven.

```mermaid
stateDiagram-v2
  [*] --> active : approved create (apply)
  active --> restricted : restriction (partial)
  active --> suspended : restriction (suspension)
  active --> frozen : restriction (full_freeze)
  restricted --> suspended : stronger restriction
  restricted --> frozen : stronger restriction
  suspended --> frozen : stronger restriction
  frozen --> suspended : lift leaves weaker active
  frozen --> restricted : lift leaves weaker active
  suspended --> restricted : lift leaves weaker active
  restricted --> active : last restriction lifted
  suspended --> active : last restriction lifted
  frozen --> active : last restriction lifted
  active --> closing : maker-only initiation (entitlement-checked, audited; master ⇒ whole family)
  restricted --> closing : maker-only initiation (entitlement-checked, audited; master ⇒ whole family)
  suspended --> closing : maker-only initiation (entitlement-checked, audited; master ⇒ whole family)
  frozen --> closing : maker-only initiation (entitlement-checked, audited; master ⇒ whole family)
  closing --> closure_sealed : seal_closure (FINAL checker approval + PINNED pre-seal readiness; sets closure_barrier, writes the seal pin)
  closure_sealed --> closed : close/complete (INDEPENDENT target only: machine-verified CAS vs the pin) OR atomic family completion (master-directed children + default + master, one transaction)
  closing --> active : abort_closure (governed recovery, lands on recomputed projection)
  closure_sealed --> active : abort_closure (governed recovery; only path that clears closure_barrier)
  closed --> [*]
```

`abort_closure` lands on the **recomputed operational projection** (`active`, `restricted`, `suspended` or `frozen`, from the restrictions in force by time, database clock) — drawn once as `active` for legibility. It is **never** a return to a remembered "prior" value. **(R3)** A **master-directed** child (default included) sits at `closure_sealed` until the master's atomic completion; the only other exit is the master's family abort.

Rules:

1. `active`/`restricted`/`suspended`/`frozen` are a **projection** of the target's active restrictions (§3), recomputed in the same transaction as any restriction change. Never set independently. Precedence `frozen > suspended > restricted > active`.
2. `closing`, `closure_sealed`, `closed` are lifecycle states, not projections. While `closing`/`closure_sealed`, restrictions may still be applied/lifted and recorded; stored status stays; resolution honours them.
3. **`closure_barrier` is an independent stored fact (ACC-REQ-042).** It is `true` exactly while status ∈ {`closure_sealed`, `closed`}. It is set only by `closing → closure_sealed` and cleared **only** by the governed recovery transaction (`abort_closure` from `closure_sealed`). Entering `closure_sealed` increments `closure_seal_version` and records `closure_sealed_at_version` (the target `version` the seal wrote). `closure_seal_version` is monotonic and **never reset**, so evidence for an aborted seal can never match a later seal.
4. **`closure_sealed` exits only to `closed` (completion) or, through the governed abort, to the operational projection.** There is no ungoverned reopen. `closing` exits only to `closure_sealed` or, through the governed abort, to the operational projection.
5. `closed` is terminal: no transition out, no identifier reuse, no restriction or profile mutation, no abort.
6. No `pending`, `rejected` or `cancelled` status on an account row — those outcomes live on the change request. No account row exists without an applied approved request.
7. **Master-family rules (ACC-R3-HD-01 — amends ACC-R2-HD-04; ACC-REQ-046/050/051).** Master initiation moves the master, **its default subaccount** and every operational child to `closing` in **one transaction** under one `closure_family_id` (a governed lifecycle cascade of listed rows — restrictions still never fan out). A child already `closing`/`closure_sealed` through its **own** initiation is `independent_preserved`: not adopted, not touched. Each master-directed child, the default included, follows `closing → closure_sealed` (own pin) and **then waits**: it has **no individual completion**. A **master may enter `closure_sealed` only when every master-directed child is `closure_sealed` with a fresh clear attestation and every independent child is `closed`**. The master's completion closes **every master-directed child, the default and the master in one atomic transaction**. **Invariant: every non-`closed` master has exactly one non-`closed` default; a `closed` master has only `closed` subaccounts.** The default may enter `closing` only in the same transaction as its master's `closing`, and may become `closed` only in the same transaction as its master. A master in `closing` or later rejects new child creation.
8. **Abort scope (R3).** A master-directed subaccount (the default included) cannot be aborted alone. Aborting the master returns the master, the default and every master-directed child still in the family together, and **never** an independently initiated child closure (that child has its own abort, with its own evidence). A `closed` child under a non-`closed` master can only be an independently completed non-default child.
9. Only the transitions drawn are legal ⇒ else `ACC1_STATUS_TRANSITION_INVALID`.

### 1.1 Transition table

| From | To | Cause | Governed by | Audit |
|---|---|---|---|---|
| — | `active` | apply `create_*` | Request + IAM-02 verify (**`DEP-IAM-ACTOR-BINDING`, `DEP-IAM-ENTITLEMENT`, `DEP-LED-CLOSURE-CONTRACT`**) | High |
| `active`/`restricted`/`suspended` | `restricted`/`suspended`/`frozen` (stronger) | apply `apply_restriction` | Request + verify (**+ `DEP-FREEZE-GOVERNANCE`**) | Critical |
| `frozen`/`suspended`/`restricted` | weaker or `active` | apply `lift_restriction` | Request + verify (**+ `DEP-FREEZE-GOVERNANCE`**) | Critical |
| `active`/`restricted`/`suspended`/`frozen` | `closing` | **maker-only initiation** `close_*` (master ⇒ master + default + every operational child; independent closures preserved) | **Entitlement-checked maker-only action, audited — no checker** (**`DEP-IAM-ENTITLEMENT`, `DEP-IAM-ACTOR-BINDING`, `DEP-LED-CLOSURE-CONTRACT`**; seam DCR-ACC-IAM-07) | Critical |
| `closing` | `closure_sealed` | apply `seal_closure`: **final checker approval** bound to the **exact** pre-seal readiness (pinned) and target `version`; master ⇒ every master-directed child `closure_sealed` + attested, independent children `closed`, family set hash equal | Request + verify (final human approval) | Critical |
| `closure_sealed` | `closed` | **Independent target:** `close/complete` — CAS + latest post-barrier attestation bound to the pin. **Family:** master completion — one transaction closing every master-directed child, the default and the master, re-verifying every member | Non-approval entitlement-checked permission + **machine-verified** criteria (no second checker) | Critical |
| `closing`/`closure_sealed` | operational projection | apply `abort_closure`: evidence-conditioned governed recovery (master ⇒ whole family; **no `DEP-LED-CLOSURE-CONTRACT`**) | Request + verify (maker-checker) | Critical |

## 2. Effective status and the consumer evaluation order

`effective_status ∈ { active, restricted, suspended, frozen, closing, closure_sealed, closed, unknown }` — for a **subaccount** the worst of client-derived, master, subaccount (each including **time-effective** restrictions, §3); for a master, of client-derived and master.

Precedence: `closed > frozen > suspended > closure_sealed > closing > restricted > active`. `unknown` overrides everything: any input unreadable, absent or unrecognised ⇒ `unknown`. **This label is descriptive.** Lifecycle and restriction are different dimensions, so the statuses are not totally ordered and **no protection depends on the ranking** (R2-F03).

### 2.0 The consumer evaluation order (normative — RF-04, ACC-R2-HD-05)

For any **transaction-producing activity**, in this order (file 01 §10 restates it; the two must not diverge):

1. **`closure_barrier`.** `closure_barrier = true` ⇒ **DENY every** transaction-producing activity, absolutely. It is evaluated **before** and **independently of** `effective_status`: it does not matter whether the descriptive status shows `frozen`, `suspended`, `restricted`, `closing` or anything else — **a more severe descriptive status must never mask the barrier.** No allow-list, policy or drain exception applies. `unknown`, an unavailable `resolve` or a missing `subaccount_id` ⇒ DENY (never default).
2. **Structural account status and restrictions — conjunctive over components.** Client-derived, master (stored lifecycle **and** `restriction_status`) and subaccount (same) must **each** permit the activity: permitted only when the component is `active`. **Narrowing exception:** where a component is `closing` (`closure_draining = true`), only the **closure-drain allow-list** (file 01 §7.1) may proceed, and only if every component not itself `closing` is still `active` — drain never overrides a restriction or a client status. Any other non-`active` state ⇒ DENY unless an authoritative policy authorises that specific activity (DCR-ACC-GOV-04 — none exists, so today: deny).
3. **Product/activity policy** (CFG-01, IAM-02, the consuming module) applies afterwards; ACC-01's answer is necessary, never sufficient.

- **Transaction-producing activity** includes (non-exhaustively): trading/quote/order, deposit, withdrawal/payout, settlement, wallet/payout-destination activation, internal transfer, fee posting, subscription/allocation (RWA), payment acceptance/payout (Pay), Exchange/securities-market access, and any other activity that produces a transaction, journal or posting.
- **`blocked_scopes` is explanatory evidence only.** It is **not** an allow-list or a deny-list. An activity not named in it is **not** thereby permitted.
- Read/reporting access is decided by IAM-02 and the consuming module, not by ACC-01 (OQ-06).
- The **closure-drain subset** of status→activity policy is defined in this pack by the approved ACC-R2-HD-01 (file 01 §7.1); the **broader** status→activity policy for other non-`active` states remains DCR-ACC-GOV-04.
- `closure_sealed` and `closed` can never be authorised for any transaction-producing activity: `closure_barrier` is `true` for both.

### 2.1 Client-derived input (CLT-01 `client_profile.status`)

| CLT-01 status | Client-derived status | Semantics |
|---|---|---|
| `active` | `active` | No effect |
| `active_limited` | `restricted` | **Report-only**: every transaction-producing activity denies — trading, deposit, withdrawal, **settlement**, wallet/payout activation, **Exchange/securities-market access**, and any other (CLT-01 §5.19 lists trading, deposit, withdrawal, settlement, wallet/payout activation, Exchange access as **not permitted**). Closure-drain activity is denied too (fail closed) |
| `restricted` | `restricted` | **Report-only**, same semantics (CLT-01 defines no restriction scope — DCR-ACC-CLT-02; ACC-01 fails closed) |
| `suspended` | `suspended` | |
| `closed` | `closed` | |
| `pending`, any other value, unreadable | `unknown` | Fail closed |

### 2.2 `blocked_scopes` (explanatory) — FRZ-RULE-002 vocabulary, account-meaningful subset

`trade_block`, `deposit_block`, `withdrawal_block`, `payout_destination_block`, `report_only_access`, `full_account_freeze`. `login_block` is principal-level and is rejected by ACC-01 (`ACC1_SCOPE_NOT_APPLICABLE`).

Scopes reported per status (explanatory only): `active` none; `restricted` the explicit scopes of its active partial restrictions, or `report_only_access` when client-derived; `suspended` `report_only_access` plus the four `*_block`; `frozen` `full_account_freeze`; `closing` `trade_block`, `deposit_block` (**and nothing here permits any activity — only the closure-drain allow-list does**); `closure_sealed` and `closed` `full_account_freeze`; `unknown` all.

### 2.3 Independent closure facts returned by resolve (R2)

| Field | Meaning |
|---|---|
| `closure_barrier` | `true` if the subaccount **or** its master has the barrier (independent of every other field) |
| `closure_draining` | `true` if the subaccount or its master is `closing` |
| `restriction_status` `{master_account, subaccount}` | Projection of the **time-effective** restrictions per level (`active` when none) — separate from lifecycle, so a restriction can never hide a lifecycle state or vice versa |
| `closure` evidence | `closure_seal_version` and `closure_sealed_at_version` per level; `closure_cycle` per level; **(R3)** `closure_initiation_id` per level — the discriminator a consumer must bind CDA-1 activity to |

## 3. Restriction state (`acc1.account_restriction.status`) and time-effectiveness

```mermaid
stateDiagram-v2
  [*] --> scheduled : apply, effective_from in future
  [*] --> active : apply, effective now
  scheduled --> active : housekeeping when effective_from reached
  scheduled --> active : inline activation inside a governed lift (time-effective)
  scheduled --> cancelled : cancel_scheduled_restriction (governed; NOT yet effective by time)
  active --> lifted : approved lift (in force by time)
  active --> expired : housekeeping when effective_until reached (not court/regulatory sources)
  lifted --> [*]
  expired --> [*]
  cancelled --> [*]
```

**Time-effective rule (RF-08):** "now" is the **database `clock_timestamp()`** evaluated in the resolve query or the locked check — never the application clock, never transaction-start `now()` (R3-F07.2). For resolution a restriction counts as **in force** when `effective_from_utc <= clock_timestamp()` **and** it is not `lifted`/`cancelled` **and** (`effective_until_utc IS NULL` **or** `clock_timestamp() < effective_until_utc`) — irrespective of whether its stored state has been advanced by the housekeeping job. The job is **housekeeping, not enforcement**: it aligns stored state, status projection, history, audit and `version`; a late job opens no gap.

**Lifecycle operations are also decided by effective time (R2-F07, ACC-REQ-049):** `lift_restriction` is legal for a restriction **in force by time**, including one still stored `scheduled` (the lift performs the activation inline in its transaction); `cancel_scheduled_restriction` is legal only for a restriction **not yet effective by time** — checked in the locked statement and again by a deferred constraint check at commit (file 05 §5). The housekeeping job **never** determines whether a restriction can be lifted or cancelled. Both are maker-checker governed. Every restriction change, including cancellation, bumps the target `version`.

**Version evidence (RF-08) — one design, used consistently:** every restriction change bumps the `version` of the row it targets — apply, housekeeping activation, inline activation, lift, expiry, cancellation. Resolve returns `versions = {subaccount, master_account}` **and** `applied_restriction_ids` — the restrictions counted as in force at evaluation, which completes the evidence in the housekeeping-lag window. No separate restriction-set version is introduced.

Restriction `kind`: `partial_restriction` (scopes ⊆ the four `*_block` scopes and/or `report_only_access`, non-empty), `suspension` (default suspension set), `full_freeze` (scopes = `{full_account_freeze}` only). `source_type` follows FRZ-RULE-001 (`sanctions_hit`, `aml_case`, `transaction_monitoring_alert`, `wallet_screening_result`, `court_order`, `regulatory_directive`, `fraud_account_takeover`, `safeguarding_shortfall`, `manual_compliance_decision`, `operational_incident`), extended only by migration.

This is a deliberately reduced form of WF-26's eleven workflow states; nothing is dropped — the workflow states before application live in the compliance workflow and IAM-02 approval, the `active_*` states are `kind` × `active`.

**Not decided here:** who owns whole-client freeze and `login_block`, and how a CLT-01 client freeze relates to an ACC-01 restriction (DCR-ACC-GOV-05). An ACC-01 restriction **never substitutes** for a client-level freeze.

## 4. Change request state (`acc1.account_change_request.status`) — mirrors the CLT-01/CFG-01 request/apply row

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> applied : apply committed
  requested --> cancelled : maker cancels
  requested --> expired : TTL
  applied --> [*]
  cancelled --> [*]
  expired --> [*]
```

There is **no `applying`, `failed` or `rejected` state**. Any failure after IAM-02 execute-verify rolls the apply transaction back and leaves the row `requested`; the consumed approval is not reusable and a **fresh** approval is required. A rejected/expired IAM-02 approval is invisible to ACC-01; the request expires. A precondition failure before verification changes nothing.

## 5. Closure evidence (`acc1.closure_readiness`, `acc1.closure_attestation`, `acc1.closure_recovery`)

- **Pre-seal readiness** — per (target, attester, `closure_cycle`), append-only with a sequence and an immutable `readiness_id`: `readiness_status` ∈ `ready` | `not_ready` | `unavailable`; `balance_state` ∈ `none` | `returned` | `present` (no amounts); `open_withdrawal_count`, `open_settlement_count`, `blocking_recon_break_count`, `in_flight_unaccounted_count`; `journal_watermark` (W_pre, commit-ordered); `max_resolution_version_observed`; `readiness_payload_hash`; `target_version_observed` (database-set); `as_of_utc`. **A row can be inserted only while the target is `closing` at the current cycle (database trigger).** Until the seal, only the latest row counts; a seal is legal only when the **pinned** row of every configured attester is the latest, `ready`, all counts are 0, `balance_state ≠ present`, fresh (`ACC1_ATTESTATION_MAX_AGE_SECONDS`, secondary guard), and the target `version` equals the version the checker approved.
- **Seal pin (R3)** — one immutable `closure_seal_pin` per (target, `closure_seal_version`), written in the seal transaction: pinned readiness id, sequence, watermark and payload hash per attester; `closure_cycle`; approved and sealed-at target versions; initiation and family ids; family set hash (master); seal request payload hash; attested approval id, checker and policy; the apply-time verification result. After the seal **the pin, not the latest readiness, is the reference**; no later readiness row can exist for that seal.
- **Post-barrier attestation** — per (target, attester, `closure_seal_version`), append-only with a sequence: `attested_status` ∈ `clear` | `blocked` | `unavailable`; `seal_version_observed`; database-bound `seal_pin_id` / `pinned_readiness_id` / `binding_ok`; `journal_watermark`; `preseal_watermark_ref`; `committed_after_preseal_watermark`; `max_resolution_version_committed`; `in_flight_count`, `in_flight_status`; `balance_state`, `open_item_count`; `as_of_utc`. **Only the latest row per target + attester + current `closure_seal_version` may satisfy completion.** `closed` requires every configured attester's latest row `clear` with `binding_ok`, `seal_version_observed = current`, `preseal_watermark_ref` = **the pin's pinned-readiness watermark**, `committed_after_preseal_watermark = 0`, `max_resolution_version_committed < closure_sealed_at_version`, `in_flight_status ∈ {none, refused_by_fence}`, `balance_state ∈ {none, returned}`, `open_item_count = 0`, fresh. An attestation taken **before** the seal (older `seal_version` or none) is never accepted. An empty attester set disables closure (`ACC1_CLOSURE_ATTESTERS_UNCONFIGURED`).
- **Family (R3)** — `closure_family` (`open`/`completed`/`aborted`) and immutable `closure_family_member` rows (`master`, `default`, `master_directed_child`, `independent_preserved`; the latter carries the child's own initiation id).
- **Recovery** — one append-only `closure_recovery` row per returned target of a governed abort: target, `from_status`, `closure_cycle_before/after`, `closure_seal_version_at_abort`, family id and role, `reason_code`, cited evidence and its owning member, `change_request_id`, attested approval fields.

## 6. Invariants asserted by tests (file 10)

1. `subaccount.client_id = master_account.client_id`; `restriction.client_id` equals its target's `client_id`.
2. Stored status is never inconsistent with the projection of restrictions (except lifecycle states).
3. Every stored status has a matching last `account_status_history.to_status`.
4. No row leaves `closed`; no row leaves `closure_sealed` except to `closed` or through the governed abort.
5. No account row lacks an applied, approved creation request.
6. A `closed` row has a latest `clear` attestation per attester at its `closure_seal_version` satisfying §5.
7. **(R3)** A `closure_sealed` master has only `closure_sealed` master-directed children or `closed` independent children; a `closing` master has no operational child; a `closed` master has only `closed` children.
7a. **(R3)** *Every non-`closed` master has exactly one non-`closed` default subaccount* (ACC-REQ-050) — after every step of every closure, abort and completion scenario.
7b. **(R3)** A master-directed subaccount is `closed` only in the same transaction as its master; the default is never `closed` while its master is not.
8. `closure_barrier = (status ∈ {closure_sealed, closed})` at all times; it is cleared only by a governed recovery row.
9. `closure_seal_version` never decreases; an aborted seal's attestations never match a later seal.
10. **(R3)** Every `closure_sealed`/`closed` row has exactly one seal pin whose pinned readiness was the latest `ready` row at the seal; no readiness row for that target has a `readiness_seq` above the pinned row's after the seal; every counting attestation's `preseal_watermark_ref` equals the pin's.
