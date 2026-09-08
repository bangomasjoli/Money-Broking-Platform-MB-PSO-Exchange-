# Principal Fintech Platform Architect Review — LED-01 Ledger / Settlement / Safeguarding v1.0

| Item | Details |
|---|---|
| Reviewed pack | LED-01 Ledger / Settlement / Safeguarding Blueprint Pack v1.0 (16 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2, FND-01/IAM-01/IAM-02/SEC-01 v1.2, CFG-01/CLT-01/KYC-01/AML-01/WLT-01 cited v1.2 (accepted at v1.1 — see Consistency Note) |
| Review type | Principal Fintech Platform Architect — Initial Blueprint Review |
| Verdict | Strong, well-scoped money-core draft; **5 critical gaps** before acceptance. Most serious is **C1** — available balance is a derived *snapshot* with no atomic reservation, so concurrent holds/payouts can overspend (double-spend / negative balance). C1 is the highest-severity finding across the module set to date. |

---

## 0. Summary

LED-01 is the authoritative financial ledger and settlement-control module, and structurally it is the most complete first-draft in the set: immutable double-entry (§5.1), no-direct-balance-edit (§5.2), full-backing/safeguarding invariant (§5.3), prefunded holds before execution (§5.4), DvP / no-AIX-exposure (§5.5), deposit credit control (§5.6), withdrawal/payout control (§5.7), WLT-01 verify-and-consume (§5.8), AML-01 pre-transaction gate (§5.9), fee = disclosed brokerage only (§5.11), controlled reversal (§5.12), close/freeze (§5.13), idempotency/ordering (§5.14), and mandatory reconciliation (§5.15). Boundaries are clean — custody/keys, rail execution, LP pricing, matching are all out of scope.

The five gaps are all in the same place: the module **declares** the correctness properties but does not yet **deliver the enforcement mechanism**. The properties a settlement ledger cannot get wrong — atomic balance reservation under concurrency, two-leg DvP atomicity, and preventive (not detective) safeguarding — are asserted as rules but have no supporting mechanism in the schema/state machines. This mirrors the lesson IAM-02, CFG-01 and WLT-01 each learned (declared control vs execution-time enforcement), now applied to money.

---

## Critical Gaps

### C1 — Balance is a derived *snapshot*; no atomic reservation, so concurrent holds/payouts can overspend available balance (double-spend / TOCTOU on money) — **HIGHEST PRIORITY**
**Area:** §5.2 (balances derived from journals), §5.4 r2–3 (hold ≤ available; hold reduces available), §5.14 r5 ("concurrent holds/postings cannot overspend available balance"), 05 §2.4 `balance_snapshot` (`available_balance` derived, `computed_at_utc`, `as_of_journal_sequence`), WF-LED01-03 step 2 / WF-LED01-04 step 2 ("verify available balance").

§5.14 r5 *states* the requirement but nothing *delivers* it. Available balance is a **periodically computed snapshot** (`computed_at_utc`, `as_of_journal_sequence`) — by construction it lags the journal. Two concurrent payouts (or payout + LP hold) each read the same available figure, each pass "balance sufficient," and both reserve/post → negative available balance = an unbacked debit and a safeguarding breach. No serialisation point exists in the schema: no per-account row lock, no monotonic per-account balance version with compare-and-set, no atomic conditional "insert hold **iff** available − Σactive_holds ≥ amount." This is the single property a ledger must prove and it is currently only asserted.

**Needed:** an authoritative real-time available balance with an **atomic conditional reservation** (per-account serialisation / optimistic version / row-lock guard), where hold creation and posting are a compare-and-set against live balance, not a read of a computed snapshot. Snapshots become a reconciliation artefact, never the reservation source.

### C2 — DvP is asserted, but the settlement model is single-leg and cannot express two-leg atomicity or partial-settlement failure
**Area:** §5.5 (DvP / no AIX exposure), WF-LED01-05 (debit source / credit destination after receipt), 06 §4 settlement state (`requested→held→instructed→confirmed→posted`, `failed→released`), 05 §2.7 `settlement` (single `amount`, single `execution_ref`).

DvP is inherently **two coupled legs** (deliver asset A ↔ receive counter-value B). The `settlement` table and state machine model *one* leg with *one* amount/execution_ref. There is no linkage between delivery and receipt legs, no state for "leg A confirmed, leg B pending," and no defined behaviour when one leg settles and the other fails — the partial-settlement window is exactly the exposure DvP exists to eliminate. For agency back-to-back (client ↔ AIX ↔ LP) settlement is a *chain* (client hold → LP execution → LP settle → client settle); if the LP leg confirms but the client leg fails, §5.5 r5/r6 forbid AIX absorbing the gap but no **in-flight holding state or compensating-unwind** is defined to hold that position without AIX principal exposure.

**Needed:** a two-leg (or leg-linked) settlement structure with atomic commit/rollback across both legs, an explicit "one-leg-settled/other-pending" state, and a compensating-unwind path that parks an in-flight leg in a client/suspense position — never AIX inventory — until resolved.

### C3 — Safeguarding is detective (periodic snapshot + freeze), not preventive; backing is never *reserved/encumbered* at credit or debit time
**Area:** §5.3 r1 ("must not credit available balance unless backing evidence exists"), 05 §2.8 `safeguarding_position` (`computed_at_utc`, `invariant_status`), 13 §3.4 (scheduled scan), WF-LED01-10 (breach → freeze *after* the fact).

The invariant `Σliabilities ≤ safeguarded_assets` is produced as a **snapshot by a reconciliation job** and enforced by freezing *after* detection. But §5.3 r1 demands a **precondition at credit time**. There is no atomic per-credit check that the specific incoming amount maps to **confirmed, unencumbered** backing, and nothing prevents a deposit-credit and a concurrent payout leaning on the same backing (the C1 race one level up). There is also no concept of **encumbered vs free** safeguarded assets — custodian assets already committed to an outbound settlement still count as backing in an aggregate snapshot, overstating coverage.

**Needed:** treat safeguarded backing as a **reserved resource** — credit consumes/reserves free backing atomically, outbound settlement encumbers backing, and the invariant is checked *preventively* on the movement path (fail closed), with the daily snapshot as a cross-check rather than the primary control.

### C4 — No treatment of the FX/cross-asset conversion event, rounding residuals, or where they post — the core money-broking flow can leak principal exposure and cannot balance to the sub-unit
**Area:** §5.3 invariant (per asset/currency), §5.5 r6 (residuals "cannot be absorbed by AIX inventory"), §5.11 (disclosed brokerage only), 05 §2.2–2.3 (single `asset_or_currency` per line), Open Items 2 (asset list) / 8 (fee schedule).

This is money *broking* — the primary event is **converting asset A → asset B via agency back-to-back**. The per-asset invariant is correct per leg, but the module never models the **conversion itself**: the instant liability shifts A→B. If rate/timing/rounding isn't DvP-linked and atomic, AIX ends up net long/short an asset = the exact principal exposure §5.5 forbids, with no mechanism to prevent it. Every fiat↔crypto conversion also produces **sub-unit rounding residuals**; §5.5 r6 forbids AIX absorbing them but the pack defines **no residual/rounding account** — so a cross-asset ledger cannot balance to the sub-unit. A ledger that can't name where the dust goes can't close.

**Needed:** model the conversion as a linked A-out/B-in leg pair (DvP, C2), with an explicit **rounding/residual account policy** (bounded, monitored, client- or cost-attributed — never AIX principal), and confirm the disclosed-brokerage fee is the *only* AIX economics on the conversion (no implied spread from rate/rounding).

### C5 — "Immutable" journal is an application-layer assertion only; no cryptographic hash-chaining / tamper-evidence on the journal sequence, so a break-glass/DBA edit is invisible
**Area:** §5.1 (append-only), §5.2 (no direct edit), 05 §2.2–2.3 `journal`/`journal_line` (no prev-hash/chain), 05 §2.4 `balance_snapshot.hash` (only the snapshot is hashed), vs SEC-01's established tamper-evidence pattern.

The authoritative financial ledger relies on "no update/delete" policy + reconciliation totals for integrity, but the journal itself is **not hash-chained**. `balance_snapshot` carries a `hash`, yet `journal`/`journal_line` — the source of truth — do not link each entry to the prior entry's hash. A privileged actor (break-glass, DBA, compromised service role) could insert or alter a historical journal and reconstruct matching totals to hide it. SEC-01 already set the tamper-evidence bar for the audit store; the *money* ledger deserves at least the same. Reversal (§5.12) must also be provably unable to *mask* a prior safeguarding breach — a sealed chain makes that auditable.

**Needed:** hash-chain posted journals (each journal sealing the prior), an independent chain-verification reconciliation job, periodic external anchoring, and an explicit rule that reversal/correction preserves and references the sealed original in-chain.

---

## Recommended Corrections

1. **Hold lifecycle vs in-flight settlement.** Hold (06 §3) and settlement (06 §4) state machines are independent — a hold can `expire`/`release` while its settlement is `instructed` (leg live at the rail), risking double-release or an unbacked in-flight debit. An active/instructed settlement must pin its hold; expiry cannot fire mid-settlement.
2. **Post-credit clawback path.** Deposit state (06 §2) is `confirmed→credited` with no reversal for **chain reorg** or **fiat recall/ACH return** after credit. Add a recall/reorg reversal state that claws back credited balance under controlled reversal (C5 chain), with negative-balance handling if already spent.
3. **Idempotency key scope.** `journal.idempotency_key` uniqueness is undefined across modules. Specify composite `(source_module, source_event_id, idempotency_key)` and define behaviour on **same key / different payload** (must reject as conflict, not silently return the prior result).
4. **Near-real-time invariant, not daily.** NFR "reconciliation daily minimum" is too slow for crypto-rail safeguarding. Require a per-movement preventive invariant check (C3) plus intraday safeguarding scans; daily is the floor for full recon only.
5. **Operational / clearing / suspense accounts as an exposure backdoor.** §5.5 r1 permits an "approved operational account" and `ledger_account.account_type` includes `operational`/`clearing`. Add explicit bounds: operational/clearing/suspense/residual balances are capped, monitored, reconciled every run, and **cannot fund client settlement** — this is where principal exposure and dust hide.
6. **Fee ↔ settlement atomicity.** Fees post as a separate journal (WF-LED01-06); if settlement posts and the fee journal fails (or vice-versa) the ledger is inconsistent. Fees on a settlement should share the atomic journal or run under a saga with compensation.

---

## Additional Parameters to Define

```txt
# Atomic reservation (C1)
available_balance_source          = authoritative_realtime_not_snapshot
hold_creation                     = atomic_compare_and_set_vs_live_balance
per_account_serialisation         = required (row_lock_or_version)
snapshot_role                     = reconciliation_only_never_reservation
concurrent_overspend              = must_be_impossible_by_construction

# DvP two-leg (C2)
settlement_model                  = two_leg_linked (deliver_vs_receive)
partial_settlement_state          = one_leg_settled_other_pending
one_leg_fail_unwind               = compensating_to_client_or_suspense
aix_absorbs_inflight_gap          = prohibited

# Preventive safeguarding (C3)
backing_check                     = preventive_at_credit_and_debit_time
backing_model                     = free_vs_encumbered
credit_consumes                   = unencumbered_confirmed_backing_atomic
invariant_snapshot                = cross_check_not_primary_control

# FX / residual (C4)
conversion_event                  = modelled_as_linked_leg_pair
rounding_residual_account         = defined_bounded_never_aix_principal
aix_net_asset_position            = zero_enforced_post_conversion
aix_economics                     = disclosed_brokerage_only

# Journal tamper-evidence (C5)
journal_hash_chain                = prev_hash_per_journal
chain_verification_job            = independent_scheduled
external_anchoring                = periodic
reversal_seals_original           = in_chain_referenced

# Corrections
hold_pinned_while_settlement_inflight = true
post_credit_clawback              = reorg_and_fiat_recall_supported
idempotency_scope                 = source_module+source_event+key
invariant_cadence                 = per_movement + intraday + daily_full
operational_clearing_bounds       = capped_monitored_cannot_fund_client
fee_settlement_posting            = atomic_or_saga_compensated
```

---

## Consistency Note

LED-01 sits correctly at the bottom of the money tier: it consumes WLT-01 verify-and-consume, the AML-01 pre-transaction gate, CLT-01 status/mandate, IAM-02 maker-checker/SoD, SEC-01 audit, FND-01 idempotency/outbox, and the CFG-01 gate, and keeps custody/keys, rail execution, LP pricing and matching out of scope — clean boundaries. Two threads need aligning with the accepted set:

1. **Immutability should match SEC-01's tamper-evidence.** SEC-01 hash-seals the audit store; the money ledger currently does not (C5). The authoritative financial record should be at least as tamper-evident as the audit trail describing it.
2. **Version pinning.** The §1 dependency list cites FND-01/IAM-01/IAM-02/SEC-01 at v1.2 (correct) **but also CFG-01, CLT-01, KYC-01, AML-01, WLT-01 at `v1.2`** — those five are accepted at **v1.1** (their v1.2 clean rollups do not exist yet). Pin to the accepted versions or mark them as forward references.

Unifying theme: as with IAM-02 (C1), CFG-01 (kill-switch), and WLT-01 (verify-and-consume), the controls are *declared* (§5.14 r5, §5.3 r1, §5.5) but need the **enforcement mechanism** — atomic reservation (C1), two-leg atomicity (C2), preventive backing (C3) — not just the rule.

---

## Top Priorities

1. **C1** — atomic conditional reservation against a live balance; a snapshot-derived available figure cannot be the reservation source, or concurrency overspends.
2. **C2** — two-leg DvP with defined partial-settlement failure/unwind that never rests exposure on AIX.
3. **C3** — make the full-backing invariant *preventive* at movement time with free-vs-encumbered backing, not a daily detective snapshot.
4. **C4 / C5** — model the FX conversion + rounding-residual account (no principal leak; ledger balances to the sub-unit); hash-chain the journal for money-grade tamper-evidence.
