# Principal Fintech Architect Review

## Document Reviewed: 00_Licence_Scope_And_Feature_Lock_v1.2.md

| Item | Details |
|---|---|
| Reviewed document | 00_Licence_Scope_And_Feature_Lock_v1.2.md |
| Platform | AIX Money Broking Platform |
| Review type | Principal Fintech Architect / Licence Boundary Review |
| Review scope | Verification only — whether the 10 prior critical issues are now resolved |
| Review basis | Labuan FSA Money Broking + PSO scope, Exchange application pending |
| Verdict | All 10 prior critical issues resolved at policy/control level; proceed to Charter after corrections 1–3 and confirming client type scope |

---

## 0. Summary

v1.2 is a thorough revision. **All 10 prior critical issues are resolved at the policy/control level.** The document has moved from "contradictory / missing controls" to "controls present, some values pending."

The only residual risks are:

1. A handful of licence-defining values left as `to_be_defined` / `to_be_confirmed`.
2. Two soft-wording loopholes in the agency / back-to-back execution model.
3. Slippage / partial-fill treatment under the zero-inventory rule is not explicitly closed.

---

## 1. Resolved / Not Resolved Status

| # | Prior Critical Issue | Status | Evidence in v1.2 |
|---|---|---|---|
| 1 | Spread / principal-dealing contradiction | Resolved | §4.1–4.2 (disclosed fee only; spread markup prohibited; LP spread disclosed & booked separately), §8.1.16, §9.2 `feature_aix_spread_markup = disabled`, §11.1, param `principal_spread_markup = blocked` |
| 2 | Back-to-back / zero-inventory enforcement | Resolved (tighten wording) | §4.3, §10.5.13–14, §15 diagram (LP-fail → void, no principal absorption), params `aix_inventory_limit=0`, `naked_position_allowed=false`, `lp_leg_firm_before_client_quote=true` |
| 3 | LP outage fail-closed | Resolved | §7.4.14–15, §8.3.13, §9.2 `feature_internal_fallback_pricing = disabled`, §10.6.16–17, param `lp_outage_behaviour = fail_closed_no_internal_fallback` |
| 4 | Trading-terminal exchange-like risk | Resolved | §7.2 (prohibited terminal behaviour), §7.4.3 non-executable depth, §11.2 (click-to-trade ladder / public tape disabled), §11.3 disclaimer, `displayed_depth_type = indicative_snapshot` |
| 5 | Price Target Request / disguised limit order | Resolved | §8.1.17, §9.2 `feature_executable_price_target_request = disabled`, §10.6.18 (alert-only, non-resting), §11.1 → "Price Alert", §13.2.21 excluded |
| 6 | Travel Rule enforcement | Resolved (set threshold) | Renamed `feature_travel_rule_enforcement`, §10.4.11–15 (threshold, self-hosted wallet, VASP DD, sunrise, blocking), params present |
| 7 | AML lifecycle controls | Resolved (set retention) | §5.3.9/15–18, §10.3.11–16 (periodic CDD, re-screening on list update, STR filing, threshold reporting, tainted-funds quarantine) |
| 8 | Ledger integrity controls | Resolved | §10.8.11–16 (precision/rounding, FX capture, trial-balance-nets-zero, idempotency, on-chain confirmations, suspense), §10.7.11–12 (daily client-money + three-way recon) |
| 9 | Audit tamper-evidence | Resolved (set retention) | §10.9.11–15 (append-only, hash-chain, retention, PII read-logging, no self-modification of trail) |
| 10 | Client eligibility / jurisdiction / asset whitelist / limits | Resolved as controls (values open) | §10.2.11–14, §13.1.33–35, params — but all values are `to_be_defined` / `to_be_confirmed` |

**None of the ten are unresolved.** The document has moved from "contradictory / missing controls" to "controls present, some values pending."

---

## 2. Remaining Critical Gaps

These do not reopen the resolved issues, but they are the residual sharp edges:

### G1. Two soft-wording loopholes in the agency / back-to-back model (Issue 2)

- §4.3.2 permits an executable client quote when the LP leg is *"firm, secured, **or otherwise controlled according to the approved execution design**."* That trailing clause is an open door back into principal risk — "otherwise controlled" is undefined and could be read as "AIX holds the price."
- §4.3.7 defers the whole of LP-failure handling ("must be defined before production"). The void-behaviour is stated (§4.3.6, §15 diagram), but the mechanism — timing, partial-fill treatment, client-facing outcome, ledger unwind — is not locked.

### G2. Licence-defining values still deferred (Issues 6, 7, 10)

The following are `to_be_defined` / `to_be_confirmed`: `client_type_scope`, `jurisdiction_allowlist`, `approved_asset_whitelist`, `approved_fiat_scope`, `travel_rule_threshold`, `per_trade_limit`, `daily_transaction_limit`, `aml_record_retention_years`, `audit_retention_years`, `data_residency`, `lp_price_deviation_limit_pct`, `lp_counterparty_exposure_limit`.

Deferring numeric configs (limits, thresholds, deviation %) to the SRS is acceptable. But **`client_type_scope` (retail vs corporate / professional) is not a config value — it is a licence-boundary decision** that changes AML depth, suitability, and market-conduct obligations, and the entire Charter is built on top of it. Leaving it "to_be_confirmed" means the Charter would be drafted on an undefined scope.

### G3. Partial-fill / slippage treatment under zero-inventory is not addressed

`lp_slippage_record_required = true` records slippage, but there is no rule stating who bears it. If the LP fills partially or at a worse price than the client's confirmed quote, the difference must fall to the client or void the trade — never to AIX (that would be a naked position). This is the one realistic path back to principal exposure and it is not explicitly closed.

---

## 3. Corrections Required Before Project Charter

1. **Close the §4.3.2 loophole.** Delete or tightly define "or otherwise controlled according to the approved execution design." An executable client quote must require the LP leg to be **firm or secured** — nothing softer.

2. **Resolve `client_type_scope` now, not "to_be_confirmed."** Confirm whether MVP serves retail or is corporate / professional-only. This is a scope decision the Charter depends on; it cannot be deferred to config.

3. **Lock the slippage / partial-fill rule.** Add an explicit rule: on LP partial fill or price movement beyond the confirmed quote, the trade is voided or re-quoted — AIX absorbs no difference and holds no residual position. Ties off the last principal-risk path (Issue 2).

4. **Elevate LP-failure handling from "defined before production" to defined here.** At minimum state the void / unwind sequence and ledger reversal path, since it is the control that keeps AIX in agency scope.

5. **Confirm `jurisdiction_allowlist`, `approved_asset_whitelist`, and `data_residency` before or with the Charter** — these are boundary inputs the Charter and admissibility framework rely on. Numeric limits / thresholds / retention years may remain `to_be_defined` for the SRS, provided each is gated "must be set before production" (already the case for most).

6. **Doc-control nit:** `Document name` field now correctly reads `_v1.2` — good; ensure downstream SDLC docs reference v1.2 as the accepted base.

---

## 4. Bottom Line

v1.2 clears every prior critical issue. It is safe to proceed to the Project Charter **once corrections 1–3 are applied** (the two wording loopholes and the slippage rule) and `client_type_scope` is confirmed. The remaining `to_be_defined` numeric values can be carried into the SRS under the existing "define before production" gates.
