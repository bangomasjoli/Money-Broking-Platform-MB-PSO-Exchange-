# Principal Fintech Platform Architect Review — E2E-01 Cross-Module End-to-End Fund-Flow Review v1.0

| Item | Details |
|---|---|
| Reviewed pack | E2E-01 Cross-Module End-to-End Fund-Flow Review Pack v1.0 (12 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Accepted baseline (as cited) | FND-01, IAM-01, IAM-02, SEC-01, CFG-01, CLT-01, KYC-01, AML-01, WLT-01, LED-01, TRD-01 — cited v1.2 (accepted at v1.1; v1.2 = clean rollups — see Consistency Note) |
| Review type | Principal Fintech Platform Architect — Cross-Module Integration Review |
| Verdict | Strong, well-structured integration pack; **5 critical cross-module gaps** before E2E acceptance. All five are *emergent* — they arise from module composition, timing and shared state, and none is visible in a single-module review. Most serious is **C1** — there is no global cross-module transaction/saga consistency model for the multi-hop money path. |

---

## 0. Summary

E2E-01 does the right thing structurally: it names the platform-level outcomes (no-exchange / no-principal / full-backing / agency / fail-closed / continuous-audit), decomposes the five core flows (onboarding, deposit, whitelist, trade, payout) into sequence diagrams with explicit blocking conditions, registers 15 inter-module contracts with a required decision-token field set and per-token fail-closed rules, states global control invariants as boolean predicates, and maps per-flow evidence chains plus a cross-module reconciliation matrix. The single-module contracts it references are consistent with what those modules were accepted on — the eligibility chain, the money-movement chain, verify-and-consume, atomic reservation, fill conservation, DvP, and licence-lock revalidation all appear correctly.

The gaps are not in the individual contracts — those are sound — but in the **spaces between them**. A modular monolith moving client money across eleven independently-transacted schemas has failure modes that exist only at the seams: partial completion across transactional boundaries (C1), decision bundles assembled from individually-valid-but-mutually-inconsistent tokens (C2), staleness/revocation propagating into in-flight transactions (C3), value leaking between pairwise-reconciled hops (C4), and freeze/recovery that isn't defined across modules (C5). An E2E review is precisely where these must be closed, and v1.0 does not yet address them.

---

## Critical Gaps

### C1 — No global cross-module transaction/saga consistency model; the multi-hop money path can partially complete across independent transactional boundaries — **HIGHEST PRIORITY**
**Area:** 03 Flow D/E, 04 §1 (contracts are point-to-point), 05 §10 (reconciliation is detective), 08 §2 (pairwise recon).

A single trade or payout crosses CFG → IAM → CLT/KYC/AML → WLT → LED → TRD → LP → LED → SEC — **separate modules, separate schemas, separate transactions**, several with external side effects (WLT decision consumption, LED hold creation/atomic reservation, LP execution, LED settlement). The pack lists the checks *in sequence* but never defines the **consistency model when the process fails between steps**. Concrete emergent failures: WLT verify-and-consume marks a destination decision one-time-consumed, then LED reservation fails → the decision is burned with no movement (client stuck, or a retry double-consumes); LED hold created, then TRD crashes before LP submission → orphaned pinned hold; LP fills externally but the result never reaches TRD → an executed position with no client fill and no settlement. Each module is internally idempotent, but there is no **correlation-ID-driven saga with a defined compensating action per step**, and no **cross-module orphaned-intermediate-state sweeper** to detect and resolve holds/decisions/orders stranded mid-flow. This is the defining risk of the architecture and is currently unaddressed.

**Needed:** an explicit end-to-end saga/orchestration model over the money path — per-step forward action + compensation (release consumed WLT decision, cancel orphaned hold, resolve unmatched LP order via query-back), all bound to one correlation ID, plus a scheduled cross-module reconciler that finds and unwinds stranded intermediate state within an SLA.

### C2 — Decision tokens are validated independently; nothing binds the bundle to one transaction (same correlation / client / amount / point-in-time), so a flow can proceed on individually-valid but mutually-inconsistent decisions
**Area:** 04 §2 (required token fields — no cross-token join key), 04 §3 (per-token fail-closed, checked in isolation), 05 §2 (eligibility predicate reads CLT/KYC/AML as independent booleans).

Every token (CFG licence, AML gate, WLT verify-and-consume, LED reservation) is checked alone — unexpired, unrevoked, hash-valid, scope-matched. But nothing requires the whole bundle to describe the **same transaction**: same correlation/trade ID, same client, same amount, same asset, mutually-consistent point-in-time. A valid AML gate for client X's 100-unit payout could sit beside a WLT decision for a *different* destination or amount; a CFG decision issued for one action scope could accompany a LED reservation for another. Each passes its own fail-closed rules; together they are incoherent. The eligibility invariant (05 §2) has the same defect in the time dimension — CLT, KYC and AML are read at different instants, so a client can be CLT-suspended at T+1 yet still clear on an AML value cached from T-1. There is no **single point-in-time eligibility snapshot** and no **cross-token join key**.

**Needed:** a required correlation/trade-ID join key on every decision token, a rule that a money action consumes a *coherent bundle* (all tokens bound to the same correlation, client, amount, asset), and a point-in-time eligibility snapshot so CLT/KYC/AML/CFG are evaluated as one atomic read, not four independent ones.

### C3 — "Current/fresh" is asserted everywhere but there is no global validity-window or revocation-propagation SLA for in-flight transactions when an upstream outcome flips mid-flow
**Area:** 01 §4.2/4.3, 04 §4 (high-risk: "stale AML outcome", "licence-lock TOCTOU"), 05 §6/§7 ("current_clear"/"current"), 04 E2E-C-007 (AML revocation signal).

The invariants demand AML `current_clear`, KYC `current_pass`, WLT `current_allow`, CFG `revalidated` — but "current" is never quantified platform-wide. AML-01 revokes on a new hit, CLT can suspend, KYC can expire, and those signals propagate to WLT/LED/TRD — yet the pack defines neither (a) the **maximum validity window** for each decision at each consumption point, nor (b) the **revocation-propagation SLA** (if AML revokes at T, by when must a trade/payout already past the AML gate but not yet settled be halted?), nor (c) the disposition of a transaction **already mid-settlement** — LED DvP one leg done, or a payout instruction already at the rail — when the revocation lands. This is the systemic form of the TOCTOU each module closed locally, now across module boundaries and across the settlement window.

**Needed:** a global freshness contract — per-decision maximum validity window, a revocation-propagation SLA with a defined interrupt/hold action for in-flight transactions at each stage (pre-hold, held, executing, settling), and an explicit rule for the irreversible-leg case (compensate/quarantine, never silently complete).

### C4 — No end-to-end value-conservation proof; each hop reconciles pairwise, but nothing proves total value in = out + fee + residual with zero leakage across the whole chain
**Area:** 08 §2 (pairwise reconciliation matrix), 05 §4/§8 (per-module safeguarding/no-principal), 03 Flow D (TRD conversion legs → LED DvP/residual).

The reconciliation matrix pairs adjacent hops — deposit source vs ledger credit, LP fill vs client fill, client fill vs LED settlement, liabilities vs assets — and each can pass while a leak hides in the seam between them. TRD computes an internally-consistent VWAP conservation; LED posts an internally-balanced DvP; but the FX-rate/rounding boundary **between** TRD's conversion legs and LED's residual/rounding account can lose value that lands in an operational/suspense account which pairwise recon counts as "reconciled." There is no **single per-transaction conservation invariant** spanning client debit = LP notional + disclosed fee + bounded residual, with AIX net asset position provably zero across the *entire* chain, nor a global daily equivalent that closes the seams the pairwise recons leave open.

**Needed:** an end-to-end per-correlation value-conservation invariant across TRD conversion legs ↔ LED DvP ↔ safeguarding ↔ custodian (and a global daily roll-up), asserting zero leakage and zero AIX principal, explicitly reconciling the residual/rounding seam between TRD and LED rather than trusting each side's internal balance.

### C5 — Incident/freeze/recovery is in scope but has no cross-module propagation, in-flight quiescence, or orchestrated resume model
**Area:** 01 §3 item 12 (freeze/recovery in scope), 04 §4 (SEC→all "action proceeds"), no dedicated freeze-propagation contract; LED freeze + CFG kill-switch exist only per-module.

Freeze is only meaningful at the platform level if it defines what happens to work **already in flight**. If Compliance freezes a client (CLT) or AML fires a sanctions freeze, the pack does not define the fate of: an in-flight trade at the LP, a hold already created in LED, a settlement handoff in deadletter, or a payout instruction already at the rail. Likewise a CFG kill-switch / Exchange-lock flip mid-trade: TRD rechecks at execution/settlement (good, per-module), but the E2E pack states no **global ordering guarantee** that a lock flip both blocks new entries and defines the disposition of every in-flight state. And recovery is undefined at the system level — after a freeze, resuming safely requires an orchestrated gate that re-verifies the journal hash-chain, the safeguarding invariant, and orphaned holds/decisions across modules before money movement resumes; today each module recovers alone with no global resume barrier.

**Needed:** a cross-module freeze-propagation contract (scope, order, and in-flight quiescence per stage), a defined disposition for each in-flight artifact when a freeze/kill-switch lands, and an orchestrated recovery gate that re-verifies integrity + safeguarding + orphaned state platform-wide before resuming.

---

## Recommended Corrections

1. **Correlation ID as the mandatory spine.** The token field set (04 §2) requires an idempotency key/source event but not a single end-to-end **correlation/trace ID** threaded through every module, every SEC audit event, and every evidence/reconciliation record (FND-01 established this primitive). Make it a required join key everywhere — without it the reconciliation matrix (08 §2) cannot actually join the hops, and C1/C2/C4 have no anchor.
2. **Complete the contract register.** 04 §1 omits real edges the flows rely on: KYC→LED (verified beneficiary identity at payout), IAM-02→CLT/WLT/TRD (client dual-auth WF-IAM02-10), CFG→LED (settlement-time licence lock). More importantly, Flows B/E hand to a **deposit/withdrawal execution / rail module** that is *not in the accepted baseline and has no contract* — the E2E chain terminates at an unbuilt edge; flag this boundary explicitly as out-of-scope-pending or add the contract.
3. **Pin the baseline to accepted versions.** 01 §2 lists all eleven modules at v1.2, but they were accepted at **v1.1** (v1.2 are the clean cosmetic rollups; TRD-01 v1.2 has only just appeared). Confirm each v1.2 rollup is byte-verified as substantively identical, or pin the E2E baseline to the accepted v1.1 set.
4. **Add interleaving/adversarial-timing scenarios.** 07 is strong on "blocked" cases but light on **concurrency/ordering**: two flows competing for the same LED balance (does atomic reservation hold across a trade *and* a payout simultaneously?), revocation landing between the AML gate and settlement, freeze during a DvP with one leg already done, duplicate correlation replay across modules. These are where C1–C3/C5 actually bite.
5. **SEC completeness across the whole chain.** The audit invariant (05 §9) is per-action; add the **expected-vs-emitted event reconciliation across a full flow** (SEC-01 §5.5C) so a silently-dropped middle step is detected — not just a single missing audit ref, but a gap anywhere in the correlation's expected event sequence.
6. **Joint, time-consistent evidence retrieval for regulators.** 08 lists evidence refs per step but not the requirement that the **entire E2E evidence bundle for one transaction is jointly retrievable via its correlation ID and retained to the longest applicable statutory clock** — the reconstruction test a Labuan FSA / FIU examination applies.

---

## Additional Parameters to Define

```txt
# Cross-module transaction model (C1)
money_path_consistency    = saga_with_per_step_compensation
saga_bound_to             = single_correlation_id
orphaned_intermediate_state = swept_and_unwound_within_sla
partial_completion         = must_not_strand_hold_or_decision

# Decision-bundle coherence (C2)
token_join_key            = correlation_id + client + amount + asset
eligibility_read          = single_point_in_time_snapshot
mismatched_token_bundle   = fail_closed
cross_token_consistency   = required_before_money_move

# Global freshness / revocation (C3)
decision_validity_window  = defined_per_gate_per_stage
revocation_propagation_sla = defined_for_inflight
inflight_on_revocation    = interrupt_hold_or_compensate
irreversible_leg_on_revoke = quarantine_never_silent_complete

# End-to-end conservation (C4)
value_conservation        = per_correlation_in_equals_out_plus_fee_plus_residual
aix_net_position_chainwide = zero
residual_seam_trd_led     = explicitly_reconciled
global_daily_conservation  = required

# Freeze / recovery (C5)
freeze_propagation        = cross_module_scoped_ordered
inflight_quiescence       = defined_per_stage
kill_switch_inflight_disposition = defined
recovery_resume_gate      = orchestrated_integrity_safeguarding_orphan_check

# Corrections
correlation_id            = mandatory_spine_all_contracts_and_evidence
contract_register         = complete_incl_execution_rail_boundary
baseline_versions         = pinned_to_accepted
e2e_scenarios             = include_interleaving_and_timing
sec_completeness          = expected_vs_emitted_per_flow
evidence_bundle           = jointly_retrievable_by_correlation
```

---

## Consistency Note

The pack is faithful to the accepted single-module contracts: the eligibility chain (05 §2) matches CLT-01 §5.14 outcome gating + KYC-01/AML-01 sealed outcomes; the money-movement chain (01 §4.3) matches the WLT→LED verify-and-consume and AML pre-transaction gate; the trade chain (01 §4.4) matches TRD-01's fill conservation + price identity + CFG execution-time revalidation + LED settlement truth; and the ledger/safeguarding invariants (05 §3/§4/§8) match LED-01's atomic reservation, free-vs-encumbered backing, DvP and zero-principal model. Nothing contradicts a module's accepted behaviour. Two housekeeping items: (a) the baseline is cited at **v1.2** for all eleven modules while they were accepted at **v1.1** (v1.2 = clean rollups; confirm byte-parity or pin to v1.1); and (b) the register terminates at a **deposit/withdrawal execution / rail module** that is not itself an accepted module — the E2E boundary should name it as pending. The unifying theme: every single-module contract is sound, but E2E acceptance depends on the *seam* controls — global saga/compensation (C1), decision-bundle coherence (C2), freshness/revocation propagation (C3), end-to-end conservation (C4), and cross-module freeze/recovery (C5) — which are the emergent risks a module-by-module review structurally cannot catch, and which this pack must add to be the platform-level assurance it sets out to be.

---

## Top Priorities

1. **C1** — define the cross-module saga/compensation model + orphaned-state sweeper so the multi-hop money path cannot partially complete.
2. **C2** — bind the decision bundle to one transaction (correlation/client/amount/point-in-time) with a single eligibility snapshot.
3. **C3** — global freshness window + revocation-propagation SLA with defined in-flight interrupt, including the irreversible-leg case.
4. **C4 / C5** — end-to-end per-transaction value conservation across the TRD↔LED seam, and cross-module freeze-propagation + orchestrated recovery gate.
