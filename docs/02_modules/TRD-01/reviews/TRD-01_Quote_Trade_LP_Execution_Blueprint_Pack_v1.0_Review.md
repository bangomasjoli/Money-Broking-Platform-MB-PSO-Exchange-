# Principal Fintech Platform Architect Review — TRD-01 Quote / Trade / LP Execution v1.0

| Item | Details |
|---|---|
| Reviewed pack | TRD-01 Quote / Trade / LP Execution Blueprint Pack v1.0 (16 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2, FND-01/IAM-01/IAM-02/SEC-01 v1.2; CFG-01/CLT-01/KYC-01/AML-01/WLT-01/LED-01 cited v1.2 (accepted at v1.1 — see Consistency Note) |
| Review type | Principal Fintech Platform Architect — Initial Blueprint Review |
| Verdict | Strong, well-scoped trading draft; **5 critical gaps** before acceptance — all on the agency-vs-principal boundary this module exists to hold. Most serious is **C1** — the accept→fill sequencing leaves AIX carrying market/principal risk in the middle. |

---

## 0. Summary

TRD-01 controls the trade lifecycle from client quote request through LP execution to settlement handoff, as Money Broking agency/back-to-back. The draft inherits the control plane cleanly — LED-01 prefunded hold + pinning, AML-01 pre-transaction gate, CFG-01 licence lock, SEC-01 evidence, IAM-02 maker-checker/client dual-auth — and shows the right instincts throughout: approved-LP-only, LP source-authentication + payload hash, idempotent LP execution with `client_order_ref`, fail-closed on LP outage, slippage/requote/void, no order-book/matching/inventory tables, and a controlled settlement handoff that keeps ledger posting in LED-01.

The five gaps are all in the same dimension and are the reason this module draws the tightest scrutiny in the set: the **agency-vs-principal line** is *declared* (§5.1–5.3) but not yet *enforced by mechanism*. The accept→fill window lets AIX stand in the spread at risk (C1); "client fill maps to LP fill" has no conservation invariant (C2); no-spread has no checked price-construction identity (C3); indeterminate LP timeouts have a holding state but no resolution protocol (C4); and the no-exchange boundary is a list of prohibitions rather than structural proof against internalisation with execution-time lock re-validation (C5). This is the same declared-vs-enforced theme LED-01, WLT-01 and IAM-02 each closed.

---

## Critical Gaps

### C1 — The accept→fill window leaves AIX at principal risk; client price is committed *before* the LP fill, with no contingent-pricing or atomic accept-execute coupling — **HIGHEST PRIORITY**
**Area:** §5.2 (agency/back-to-back), §5.6 (quote binds client price + LP price + validity), WF-TRD01-02 (client accepts → trade created at accepted price), WF-TRD01-03 (*then* LP execution), 05 §2.4 `client_quote` (`lp_price`/`client_price`/`valid_until_utc`), Open Item 4 (quote TTL).

The sequence is: client accepts a **firm client quote** (binding AIX to a price) → *then* AIX sends the order to the LP → *then* the LP fills. Between acceptance and LP fill, AIX carries **market risk**: if the LP rejects, times out, or fills worse, AIX has a client locked at one price and no matching LP fill — that is principal exposure, the exact thing §5.2 forbids. "No LP fill = no final client fill" only covers the clean reject (void); it does not cover a fill at a different price, and it does not change the fact that AIX quoted a firm price *ahead* of securing the executable LP price. There is also no requirement that the **LP quote be firm/executable for the acceptance window**, nor that **client-quote validity ≤ LP-quote validity** — so at acceptance the referenced LP quote (`lp_quote.valid_until_utc`) may already be stale, forcing re-execution at a new price that AIX absorbs or passes to the client unilaterally.

**Needed:** define the agency execution sequencing that structurally removes the middle risk — either (i) the client price is **contingent/provisional** until the LP fill confirms (client bears the execution result, AIX passes it through), or (ii) the LP quote is **firm/executable** and acceptance **atomically binds LP execution** against that same firm quote, with `client_quote.valid_until ≤ lp_quote.valid_until`. As drawn, AIX sits in the spread at risk.

### C2 — "Client fill must map to LP fill" has no enforced conservation invariant; client fill quantity/price can diverge from the underlying LP fill(s)
**Area:** §5.2 r4–5, 05 §2.7 `lp_fill` (`fill_amount`/`fill_price`) vs §2.8 `client_fill` (independent `filled_amount`/`execution_price`), data rules 4/9, WF-TRD01-04 step 9.

The rule is stated but nothing binds it mechanically. `client_fill.filled_amount` and `execution_price` are free columns independent of the `lp_fill` they cite — there is no invariant that **client filled quantity == LP filled quantity** and **client execution price == LP fill price** (the *only* permitted delta being the separately-posted disclosed brokerage fee). Without it, a client fill can be booked better than the LP gave (AIX absorbs the loss = principal) or worse (hidden spread = §5.3 breach). Partial/tranche fills are worse: one client trade may map to **many** LP fills, but there is no aggregation model enforcing `Σ lp_fill.amount == client_fill.filled_amount` with a volume-weighted price identity. Reconciliation checks "client fill without LP fill" but never **quantity/price conservation**.

**Needed:** a hard conservation invariant binding each client fill to its LP fill(s) — quantity equality (1:1 or Σ tranche), price identity net of only the disclosed fee, validated at fill and in reconciliation; a client fill not conserved against an external LP fill is blocked.

### C3 — No-spread relies on disclosure, but the price-construction arithmetic is unconstrained and the quote hash doesn't bind the LP evidence
**Area:** §5.3 (no markup), §5.6 (`quote_hash`), 05 §2.4 (`lp_price`/`client_price`/`fee_amount` free numerics; `quote_hash` not defined to cover LP refs).

The no-markup control is a disclosure statement, not a checked identity. Nothing enforces `client_all_in_price == lp_price ± disclosed_commission` — a markup can hide in the gap between `lp_price` and `client_price` while a token `fee_amount` is nominally "disclosed." And `quote_hash` is not specified to bind `lp_quote_id` / `lp_price` / the LP `payload_hash`, so the client quote's linkage to the actual LP evidence is not tamper-evident or provable to a client/regulator.

**Needed:** a defined, validated price-construction formula where the **only** difference between the LP price and the client all-in price is the disclosed brokerage/commission — checked at quote build **and** at fill — and a `quote_hash` that cryptographically binds the LP quote reference, LP price, and LP payload hash so the agency pricing is provable end-to-end.

### C4 — LP timeout / indeterminate execution has a holding state but no authoritative resolution protocol (double-execution / unknown-exposure / late-fill hole)
**Area:** §5.10 r6, WF-TRD01-03 fail-closed, WF-TRD01-04 step 8 (`pending_reconciliation`), 06 §3 LP order (`timeout → reconcile_required`), 06 §2 trade (`reconcile_required`).

"Mark pending_reconciliation, no blind retry" is the right instinct but stops short. On timeout the order is **indeterminate** — it may or may not have executed at the LP — and there is no **query-back protocol**: an idempotent order-status request to the LP (keyed by `client_order_ref`) to establish the true terminal state before releasing the hold or voiding. Consequences: the client hold sits pinned indefinitely; or a real LP fill was never captured, so the client is never settled while AIX holds the position (exposure); or the hold is released and a **late fill** then arrives and still fires a settlement handoff against a released hold (unbacked settlement). There is also no stuck-state escalation ("timeout on the timeout") and no guard blocking a settlement handoff for a trade already voided.

**Needed:** a deterministic resolution protocol — idempotent LP order-status query-back to reach a true terminal state, a late-fill guard that cannot settle against a released hold or a voided trade, a stuck-`reconcile_required` escalation SLA, and explicit reconciliation that no `pending_reconciliation` trade is silently abandoned.

### C5 — Exchange-lock and no-internalisation are declarative prohibitions, not structural controls; no proof against internal crossing and no execution-time CFG-01 licence-lock re-validation
**Area:** §5.1 / prohibited #1–5, §5.5 r6 (CFG feature checked at eligibility only), 05 §1 rules 3–5 (no order-book/matching tables), data rules 11/12.

Two structural holes sit behind the stated prohibitions. **(a) Internal crossing/netting** — when client A buys and client B sells the same pair, nothing structurally prevents a router from netting them internally instead of routing both to the LP; that would *be* client-to-client matching / operating a matching engine. The design asserts every trade needs "an LP execution path" but never proves the path is real — an `lp_order`/`lp_fill` could be synthetic. **(b) TOCTOU on the licence lock** — the CFG-01 trading/Exchange feature is checked at *quote-time eligibility* (§5.5 r6) but never **re-validated at LP execution / settlement** against a CFG-01 licence-lock decision, the same execution-time re-validation LED-01 (atomic reservation), WLT-01 (verify-and-consume) and IAM-02 (decision token) all added. Exchange could be un-locked/re-locked between quote and execution.

**Needed:** structural proof of the boundary — an explicit **no-internalisation / no-netting** control with every client fill provably bound to a **distinct external LP fill_id from an approved LP** (ties C2), plus reconciliation that no two client fills share one LP fill; and **execution-time + settlement-time re-validation** of the CFG-01 licence-lock decision (fail-closed), not merely a quote-time gate.

---

## Recommended Corrections

1. **LP quote firmness / RFQ semantics.** Define whether LP quotes are firm/executable or indicative. If indicative, acceptance must re-request a firm executable quote before hold + execution; enforce `client_quote.valid_until ≤ lp_quote.valid_until` (ties C1).
2. **Best-execution / LP-selection record.** Open Item 1 implies multiple LPs, but there's no best-execution policy or routing-rationale capture (which LP, why) — a money-broking client-best-interest expectation. Record LP selection evidence per trade.
3. **Slippage asymmetry — price improvement belongs to the client.** §5.11 r6 forbids hiding price improvement but doesn't say who gets it. In agency, positive slippage passes to the **client**, never kept by AIX (else it's principal spread capture); state this explicitly alongside the negative-slippage → requote/void path.
4. **Partial-fill hold release atomicity.** Tie partial-fill residual-hold release to LED-01 hold pinning (LED §5.22): release amount = hold − consumed, atomic with LED-01; a requote must **re-hold**, never reuse a released hold.
5. **Trade state concurrency.** `trade.status_version` exists but transitions aren't bound to a compare-and-set; out-of-order LP events (fill before ack, late fill after timeout) must reject/park via an optimistic version guard (ties C4).
6. **Confirmation reflects LED-01 settlement truth, not optimistic handoff.** §5.12 confirmation carries "settlement status," but the handoff is sent at fill — ensure the client confirmation reflects LED-01's **actual** settlement outcome and that a LED-01 settlement failure propagates back to correct the trade/confirmation (bidirectional; no false "settled").

---

## Additional Parameters to Define

```txt
# Agency execution window (C1)
client_price_binding      = contingent_until_lp_fill OR atomic_accept_execute
lp_quote_type             = firm_executable_required_for_window
client_quote_validity     = less_or_equal_lp_quote_validity
aix_principal_window      = must_not_exist_by_construction

# Fill conservation (C2)
client_fill_qty           = equals_lp_fill_qty (1:1 or sum_of_tranches)
client_fill_price         = equals_lp_fill_price_net_of_disclosed_fee
unconserved_client_fill   = blocked
multi_lp_fill_aggregation = volume_weighted_bound_to_client_fill

# Price construction (C3)
client_all_in_price       = lp_price +/- disclosed_commission_only
markup_between_lp_and_client = prohibited
quote_hash_covers         = lp_quote_id + lp_price + lp_payload_hash
price_check_points        = quote_build + fill

# Indeterminate LP resolution (C4)
lp_timeout_resolution     = idempotent_order_status_queryback
late_fill_after_void      = cannot_settle
settlement_vs_released_hold = prohibited
stuck_reconcile_required  = escalation_sla

# Structural no-exchange (C5)
internal_crossing_netting = prohibited
client_fill_binds         = distinct_external_lp_fill_id
one_lp_fill_two_client_fills = reconciliation_break
cfg_licence_lock_recheck  = at_execution_and_settlement_fail_closed

# Corrections
lp_quote_firmness         = defined
best_execution_record     = per_trade
positive_slippage         = to_client_never_aix
partial_hold_release      = atomic_with_led (hold_minus_consumed)
trade_state_transition    = status_version_compare_and_set
confirmation_settlement   = reflects_led_actual_outcome
```

---

## Consistency Note

TRD-01 pairs cleanly with the accepted stack: it consumes LED-01's prefunded hold + pinning (LED §5.22) and hands off conversion legs/residual to LED-01's DvP + residual model (LED §5.18/§5.20), verifies the AML-01 pre-transaction gate, checks the CFG-01 licence lock, uses WLT-01 where a withdrawal destination is involved, and keeps custody/keys/ledger-posting/screening out of scope — correct boundaries, and it rightly declares no order-book/matching/inventory tables. Two threads to align: (a) the **execution-time re-validation** pattern that LED-01, WLT-01 and IAM-02 each adopted needs to reach TRD-01's CFG-01 licence-lock and hold checks (C5/C1); and (b) version pinning — the dependency list cites **LED-01 v1.2** (accepted at v1.1) plus CFG-01/CLT-01/KYC-01/AML-01/WLT-01 at **v1.2** (all accepted at v1.1); pin to accepted versions or mark as forward references. The unifying theme mirrors the whole money tier: the agency/no-spread/no-exchange controls are *declared* (§5.1–5.3), but need the *mechanism* — contingent/atomic pricing (C1), a fill conservation invariant (C2), a checked price-construction identity (C3), deterministic timeout resolution (C4), and structural non-internalisation + execution-time lock re-validation (C5).

---

## Top Priorities

1. **C1** — remove the accept→fill principal window via contingent pricing or atomic accept-execute against a firm LP quote.
2. **C2 / C3** — enforce client-fill↔LP-fill conservation (quantity + price) and a price-construction identity where the only delta is the disclosed fee.
3. **C4** — deterministic resolution of indeterminate LP timeouts (query-back, late-fill guard, no settle-against-released-hold).
4. **C5** — structural proof of no internalisation (every fill bound to a distinct external LP fill) and execution-time CFG-01 licence-lock re-validation.
