# Principal Fintech Platform Architect Review

## Document Reviewed: 06_Master_System_Rules_v1.0.md

| Item | Details |
|---|---|
| Reviewed document | 06_Master_System_Rules_v1.0.md |
| Platform | AIX Money Broking Platform |
| Review type | Principal Fintech Platform Architect / Regulated Fintech Control & Security Review |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 03 v1.2, 02 v1.2, 04 v1.2, 05 v1.2 |
| Review basis | Labuan FSA Money Broking + PSO scope, Exchange application pending |
| Verdict | Strong, well-structured rulebook; five rule gaps (FX/precision, prohibited-asset categories, error-set completeness, encryption, reliability/go-live) to close before Master Data Flow |

---

## 0. Summary

All v1.2 base docs exist — the version chain is consistent (no phantom references this time). This is a strong, well-structured rulebook: rule IDs with severity, enforcement points, failure behaviour, error codes, a consolidated error set, rule-to-test and rule-to-module mapping, and a parameter block. It faithfully consolidates the licence / agency / money-movement / AML / security controls from docs 00–05.

This review focuses on genuine rule gaps.

---

## 1. Critical Gaps

### C1. No FX / conversion or asset precision-and-rounding rules (Areas 7, 5) — HIGHEST PRIORITY

For a fiat↔crypto platform these are money-critical, and both are **missing as rules**. SRS had MON-SRS-008 (FX / conversion) and AST-04 (asset precision / rounding), but doc 06 has no `FX-RULE` (rate source, timestamp, rounding, validity, and **who bears FX movement — never AIX as principal**) and no precision / rounding rule. Rounding errors break the double-entry invariant (LED-RULE-001), and unmanaged FX movement is a direct back-door to principal exposure — contradicting LIC-RULE-003. Currently only an open-item mention (§29.8), not an enforceable rule.

### C2. No prohibited-asset-category rule (Areas 2, 13)

The lock document's core **asset locks** — MYR pairs, privacy coins, algorithmic stablecoins, securities tokens, plus derivatives / margin / lending / staking / yield — are not captured as a system rule, and §24 (prohibited behaviours) omits them entirely. Asset admissibility exists only in the workflow (WF-18). A rulebook must carry an `ASSET-RULE` enforcing prohibited categories with a licence-lock failure behaviour, or the enforceable layer silently loses one of the licence boundary's sharpest controls.

### C3. Master error set omits `ASSET_NOT_ALLOWED` / `PAIR_NOT_ALLOWED` (and FX codes) (Area 11)

§25 is presented as the authoritative error set, but it drops **ASSET_NOT_ALLOWED** and **PAIR_NOT_ALLOWED** — both present in the SRS (§24) and workflow taxonomies — plus any FX / precision code. This is a completeness gap that will make the API layer diverge from the rulebook the moment product-access is coded.

### C4. No encryption (in-transit / at-rest) system rule (Areas 1, 10)

Data classification (DATA-RULE-001), sensitive-read logging (DATA-RULE-002), and secrets handling (VND-RULE-002) are all present, but there is **no explicit rule mandating encryption in transit and at rest** for PII / KYC / Travel Rule / bank / wallet data. The SRS NFR carried it; the rulebook — the enforceable source of truth — omits it.

### C5. No reliability / BCP-DR rule and no consolidated go-live assurance rule (Areas 1, 5)

The rulebook has no reliability rule (backup, restore test, RTO / RPO, monitoring) and no single go-live gate rule (pentest passed, DR tested, compliance / MLRO sign-off, safeguarding balances, exchange-modules-disabled verified). These controls exist in the SRS (§26) and Charter but were not carried into the enforceable rules. SAFE-RULE-001.7 references a go-live safeguarding check in isolation; the full assurance gate is absent.

---

## 2. Recommended Corrections

1. **Add `FX-RULE-001` and `LED-RULE-005` (C1):** FX / conversion rule (approved rate source, server-UTC timestamp, rounding policy, rate validity, re-quote / void on movement beyond tolerance, **AIX must not absorb FX movement as principal**) and an asset precision / rounding rule (per-asset decimals, rounding direction, no sub-precision leakage that breaks trial balance). Both Critical, with error codes.

2. **Add `ASSET-RULE-001 Prohibited Asset Categories` (C2):** enumerate the locked categories (MYR pair, privacy coin, algorithmic stablecoin, securities token, derivatives, margin, lending, staking, yield), failure behaviour `LICENCE_SCOPE_BLOCKED` / `ASSET_NOT_ALLOWED`, and add them to §24 prohibited behaviours.

3. **Complete the error set (C3):** add `ASSET_NOT_ALLOWED`, `PAIR_NOT_ALLOWED`, `FX_RATE_INVALID` (or equivalent), and `DATA_RESIDENCY_VIOLATION` to §25 so it matches the SRS / workflow taxonomies. (`DATA_EXPORT_RESTRICTED` is present but the SRS-side codes above are not.)

4. **Add `SEC-RULE-003 Encryption` (C4):** encryption in transit (TLS) and at rest for all sensitive / PII data classes, key management via KMS / vault, Critical severity.

5. **Add `REL-RULE-001 Reliability / BCP-DR` and `GOV-RULE-001 Go-Live Assurance Gate` (C5):** the first covering backup, restore test, RTO / RPO, monitoring, fail-safe; the second consolidating pentest-passed, DR-tested, compliance / MLRO sign-off, safeguarding balances, trial-balance-nets-zero, and exchange-modules-disabled as mandatory pre-production gates.

6. **Add a global input-validation / rate-limiting system rule (`SYS-RULE-005`).** The SYS block covers default-deny, backend-truth, fail-closed, and UTC, but not request validation / sanitization or rate limiting / abuse protection — both belong in the enforceable core.

7. **Add an explicit SoD-conflict-matrix rule.** CFG-RULE-003 blocks self-approval, but the broader SoD conflict matrix (SOD-001–020 from doc 04) should be referenced as an enforced rule, not left implicit behind a single error code.

8. **Add dedicated SOF/SOW, beneficial-ownership, and EDD rules** (or fold explicit sub-rules under AML-RULE-001). They are preconditions in the workflow but have no standing rule in the rulebook.

---

## 3. Additional Rules / Parameters to Add

```txt
# --- New rules ---
FX-RULE-001    FX / Conversion (rate source, UTC timestamp, rounding, no AIX principal absorption)   # Critical
LED-RULE-005   Asset Precision & Rounding (per-asset decimals, no trial-balance leakage)              # Critical
ASSET-RULE-001 Prohibited Asset Categories (MYR/privacy/algo-stable/securities/derivatives/margin/lending/staking/yield)  # Critical
SEC-RULE-003   Encryption in transit and at rest for sensitive data                                   # Critical
REL-RULE-001   Reliability / BCP-DR (backup, restore test, RTO/RPO, monitoring)                       # High
GOV-RULE-001   Go-Live Assurance Gate (pentest, DR test, compliance sign-off, safeguarding balance)   # Critical
SYS-RULE-005   Input Validation & Rate Limiting                                                       # High
SOD-RULE-001   Segregation-of-Duties Conflict Matrix enforcement (SOD-001..020)                       # Critical

# --- New error codes (add to §25) ---
ASSET_NOT_ALLOWED
PAIR_NOT_ALLOWED
FX_RATE_INVALID
DATA_RESIDENCY_VIOLATION
GO_LIVE_GATE_NOT_MET

# --- New parameters ---
fx_conversion_policy = approved_rate_source_utc_rounding_no_principal_absorption
asset_precision_rounding_policy = per_asset_defined
prohibited_asset_categories = myr_privacy_algostable_securities_derivatives_margin_lending_staking_yield
encryption_in_transit = required
encryption_at_rest_sensitive = required
reliability_bcp_dr = required
go_live_assurance_gate = required
input_validation = required
rate_limiting = required
sod_conflict_matrix_enforced = true
sof_sow_capture_required = true
beneficial_ownership_required = true
edd_required_for_high_risk = true
```

---

## 4. Top Priorities Before the Master Data Flow

1. **C1** — FX + precision rules. The money-integrity gap that both breaks double-entry and re-opens principal exposure.
2. **C2** — Prohibited-asset-category rule. A licence-boundary control that dropped out of the enforceable layer.
3. **C5** — Reliability / BCP-DR + go-live assurance. The operational-readiness rules the rulebook currently lacks.

C3 (error-set completeness) and C4 (encryption rule) are quick completeness fixes that should ride along.

---

## 5. Consistency Note

The rulebook is otherwise well-aligned with docs 00–05, and the base-version chain is clean (all cited v1.2 files exist). Once these rule gaps are closed, the enforceable layer will fully match the upstream design.
