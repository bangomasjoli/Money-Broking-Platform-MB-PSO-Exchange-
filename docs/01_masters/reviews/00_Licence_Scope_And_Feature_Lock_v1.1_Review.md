# Principal Fintech Architect Review

## Document Reviewed: 00_Licence_Scope_And_Feature_Lock_v1.1.md

| Item | Details |
|---|---|
| Reviewed document | 00_Licence_Scope_And_Feature_Lock_v1.1.md |
| Platform | AIX Money Broking Platform |
| Review type | Principal Fintech Architect / Licence Boundary Review |
| Reviewer role | Fintech architecture, compliance, and licence-scope control |
| Review basis | Labuan FSA Money Broking + PSO scope, Exchange application pending |
| Verdict | Strong Phase-0 document; three licence-defining gaps must be closed before Project Charter |

---

## 0. Summary

Version 1.1 is a major improvement over v1.0. The following prior gaps are now **closed**:

1. LP integration section now exists (§6).
2. Client-to-client matching is explicitly locked.
3. Resting / stop-limit / GTC / post-only orders are locked.
4. UI naming control added (§10).
5. External-LP-depth vs AIX-order-book labelling is enforced.
6. LP price snapshot, execution reference, slippage, and best-terms evidence are required.

This review focuses only on what **remains open** in v1.1, plus **new risks that v1.1 introduced**.

---

## 1. Critical Gaps (still open in v1.1)

### C1. "Spread" is still a revenue mechanism — this is principal dealing (Area 4) — HIGHEST PRIORITY

v1.1 doubled down: §6.3.6, §9.5.6, §9.6.4, and §11.4.12 all require AIX to record / store / show a **spread**, and §7.3.12 only prohibits a *hidden* spread.

Earning a spread on an LP-backed fill = marking up the LP price = **dealing on own account / principal**. A pure agency money broker charges a **disclosed brokerage commission**, not a spread margin.

As written, the document simultaneously blocks principal dealing (§9.1.4, parameters) **and** builds a principal-style spread into the core execution model. This contradiction must be resolved before the Charter — it is the single most likely thing to reclassify AIX from broker to unlicensed dealer.

### C2. No back-to-back / zero-inventory enforcement — the flow lets AIX carry principal risk (Areas 3, 4)

§6.2 and the §14 diagram show `client accepts quote → then send to LP`. This creates a **quote-risk window**: AIX shows the client a firm price, the client accepts, *then* AIX goes to the LP. If the LP fills worse or rejects, AIX either eats the difference (market risk = principal) or breaks the trade.

There is no rule requiring:

- (a) the LP leg to be secured / firm **before** the client sees an executable quote;
- (b) **back-to-back matched execution** (every client leg tied to a completed LP leg);
- (c) **zero inventory / no naked position**;
- (d) defined handling when the LP hedge leg fails post-acceptance.

Without these four, the ledger and the flow permit principal risk regardless of the "broker" label.

### C3. `lp_outage_fallback_required = true` is dangerously ambiguous — must be fail-closed (Area 7)

"Fallback" can be read as "quote from an alternative / internal source when the LP is down" — which means AIX quoting off its own book = principal / market-making.

This must be explicitly **fail-closed**: LP outage disables quoting and execution; there is no internal fallback price source.

Also still missing: LP price **sanity / deviation limits** vs a reference, LP **counterparty credit / exposure limits**, LP **API key / secret management**, and **three-way reconciliation** (LP fill ↔ brokered trade ↔ ledger).

### C4. The "professional trading terminal" display is the sharpest accidental-exchange risk (Areas 2, 3)

§6.1 renders a chart + **live external LP depth** + **"recent LP market activity"** (a trade tape) inside a trading terminal. Regulators apply substance-over-form: a live depth ladder + tape that looks and behaves like an exchange screen will not be saved by the label "External LP Market Depth."

Missing controls:

- Depth must be **non-executable / non-clickable** (client cannot trade a depth level directly — all execution RFQ-gated).
- Indicative / snapshot rather than continuous streaming where possible.
- An on-screen disclaimer.
- **Binance market-data redistribution licensing** compliance (their terms restrict re-display).

### C5. "Price Target Request" is a re-labelled resting limit order (Areas 3, 10)

§10.1 maps `Price Target Request` as the preferred term to avoid saying "Limit Order." But renaming does not change behaviour — if a client can submit a target price that waits until the market reaches it, that **is** a resting / GTC limit order, which §5 and §12.2 explicitly lock.

Either remove this concept from MVP, or define it strictly as a one-shot **price alert / notification** that produces no execution instruction and never rests in a book.

### C6. Travel Rule is still "readiness," not enforcement (Area 6)

Unchanged from v1.0: flag is `feature_travel_rule_readiness`, parameter `travel_rule_readiness_required`, yet §9.4.6 mandates blocking transfers on missing data (enforcement).

Still missing a **de-minimis threshold**, **self-hosted / unhosted wallet** handling, **counterparty-VASP due diligence**, and **sunrise-issue** handling.

### C7. AML stops at onboarding; no ongoing or regulatory-reporting layer (Area 6)

Still missing:

- **Periodic KYC / CDD refresh** by risk rating.
- **Re-screening on sanctions-list updates**.
- An **STR / regulatory-filing workflow** to the FIU (distinct from the internal case in §9.3.6).
- **Threshold transaction reporting**.
- **Tainted-funds / mixer handling** on deposits (auto-quarantine).

### C8. Ledger integrity controls still absent (Area 5)

§9.8 is unchanged. Still missing:

- Asset **precision / rounding policy**.
- **FX-rate capture** (fiat ↔ crypto).
- **System-wide trial-balance-nets-to-zero** invariant.
- **Idempotency** on postings (retry = double-post).
- **On-chain confirmation thresholds** before crediting deposits.
- Suspense / clearing accounts.
- **Daily client-money segregation reconciliation** (a hard PSO / client-money requirement).

### C9. Audit log still has no tamper-evidence, retention, or read-logging (Area 5)

§9.9 unchanged: "must not be deleted" without **append-only / WORM / hash-chaining**, no **retention period** (6–7 yr AML), no logging of **read** access to sensitive PII (KYC / Travel Rule), and no separation preventing a flag-changing admin from touching their own trail.

### C10. No client-eligibility, asset-whitelist, or jurisdiction boundary (Areas 6, 9)

Still no **approved-asset whitelist** mechanism (only "unapproved listing prohibited"), no **client-type boundary** (retail vs corporate / professional — confirm whether retail is even in scope for Labuan MB), no **geo / sanctioned-country blocking**, and no **per-trade / daily transaction limits** for MVP.

---

## 2. Recommended Corrections

1. **Resolve the spread contradiction (C1).** Decide the model explicitly: **agency (disclosed commission only, no spread markup)** — recommended, and consistent with `principal_dealing = blocked` — or matched / riskless-principal (which changes the regulatory characterisation and must be confirmed with compliance). If any spread appears, state it is the **LP's spread, fully disclosed pre-trade**, with AIX taking no principal risk. Replace every "record / show spread" with "disclosed brokerage fee (+ LP spread shown transparently)." Delete the phrase "hidden spread" in §7.3.12 — prohibit non-disclosed spreads outright, not merely un-audited ones.

2. **Make execution back-to-back and fail-closed (C2, C3).** Add rules: the LP leg must be firm / secured before an executable client quote is shown; every brokered trade must be matched to a completed LP fill; **zero inventory / no naked position**; defined LP-hedge-failure handling (void the client trade, no principal absorption); and LP outage = **disable quoting**, no internal fallback price. Add LP price-deviation limits, LP credit limits, LP secret management, and three-way reconciliation.

3. **Neuter the trading-terminal exchange risk (C4).** Depth must be **non-executable** (RFQ-gated), labelled indicative, with disclaimer; assess streaming vs snapshot; confirm Binance data-redistribution licensing. Consider dropping the live "recent LP market activity" tape from MVP.

4. **Remove or redefine "Price Target Request" (C5)** as a non-resting one-shot alert, or exclude from MVP.

5. **Rename to enforcement (C6):** `feature_travel_rule_readiness` → `feature_travel_rule_enforcement`; add threshold, self-hosted-wallet, VASP-DD, and sunrise handling.

6. **Extend AML (C7):** periodic refresh, re-screening on list updates, STR / regulatory-filing workflow, threshold reporting, deposit wallet-screening disposition, and record retention.

7. **Strengthen ledger (C8):** precision / rounding, FX capture, trial-balance invariant, idempotency keys, deposit confirmation thresholds, daily client-money reconciliation.

8. **Strengthen audit (C9):** append-only + hash-chaining, retention period, read-access logging, separation of duties.

9. **Add MVP boundaries (C10):** approved-asset whitelist, approved-fiat scope, client-type boundary, geo / sanctioned-country blocking, per-trade / daily limits, and a compliance sign-off go-live gate.

10. **Developer safety additions:** feature flags and LP integration must **default to disabled / deny** when unknown; **server-authoritative UTC** for quote expiry (never trust client clock); idempotency mandatory on financial ops; non-prod must use **LP sandbox only** (no live keys, no real PII); secrets in KMS / vault; encryption-at-rest for KYC / Travel Rule; Labuan / Malaysia **data residency**.

11. **Elevate best-execution:** `best_available_terms_evidence` exists as a parameter but has no rule — add a best-execution / fair-pricing rule in §9 with evidence retention.

---

## 3. Additional Parameters to Add

```txt
# --- Agency enforcement (resolves spread/principal conflict) ---
execution_model = agency_back_to_back
revenue_model = disclosed_brokerage_fee      # spread markup as AIX margin prohibited
principal_spread_markup = blocked
lp_spread_disclosure = required_pre_trade
aix_inventory_limit = 0
naked_position_allowed = false
lp_leg_firm_before_client_quote = true
lp_hedge_failure_handling = void_client_trade

# --- LP fail-closed & risk (tighten existing block) ---
lp_outage_behaviour = fail_closed_no_internal_fallback
lp_price_deviation_limit_pct = <set>
lp_counterparty_exposure_limit = <set>
lp_three_way_reconciliation_required = true
lp_secret_management = kms_vault
lp_environment = sandbox_in_nonprod_only

# --- Trading terminal / market-data safety ---
lp_depth_executable = false                  # non-clickable, RFQ-gated
lp_depth_delivery = indicative_snapshot
lp_market_data_redistribution_licensed = required
price_target_request = alert_only_non_resting

# --- Travel Rule enforcement ---
travel_rule_enforcement = true
travel_rule_threshold = <set_currency_amount>
self_hosted_wallet_handling = required
counterparty_vasp_dd_required = true
travel_rule_block_on_missing_data = true

# --- AML lifecycle ---
kyc_periodic_refresh_required = true
sanctions_rescreen_on_list_update = true
str_regulatory_filing_workflow = true
threshold_transaction_reporting = true
deposit_wallet_screening_required = true
aml_record_retention_years = <set>

# --- Ledger integrity ---
asset_precision_policy_required = true
fx_rate_capture_required = true
system_trial_balance_zero_invariant = true
ledger_idempotency_required = true
deposit_confirmation_threshold_required = true
client_money_daily_reconciliation = true

# --- Audit integrity ---
audit_log_append_only = true
audit_log_tamper_evidence = hash_chain
audit_read_access_logging = true
audit_retention_years = <set>

# --- MVP boundaries ---
approved_asset_whitelist = [<set>]
approved_fiat_scope = [<set>]
client_type_scope = corporate_professional   # confirm retail in/out
jurisdiction_allowlist = [<set>]
sanctioned_country_block = true
per_trade_limit = <set>
daily_transaction_limit = <set>

# --- Safety / infra ---
feature_flag_default_state = disabled
fail_safe_default = deny
quote_expiry_time_source = server_utc
pii_encryption_at_rest = true
data_residency = labuan_malaysia
best_execution_policy_required = true
```

---

## 4. Top Priorities Before Project Charter

1. **C1** — Spread = principal dealing. Reconcile with `principal_dealing = blocked`.
2. **C2 / C3** — Back-to-back + fail-closed, so AIX never carries a naked position.
3. **C4 / C5** — The live terminal display and the disguised limit order: the two places v1.1 accidentally re-opened the exchange line.

Everything else is important, but these three are the licence-defining gaps.

---

## 5. Document Control Nit

The header's "Document name" field still reads `00_Licence_Scope_And_Feature_Lock.md` while the actual file is `_v1.1`. Align it so downstream SDLC documents reference the correct version.
