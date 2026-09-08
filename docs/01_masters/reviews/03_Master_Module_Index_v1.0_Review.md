# Principal Fintech Platform Architect Review

## Document Reviewed: 03_Master_Module_Index_v1.0.md

| Item | Details |
|---|---|
| Reviewed document | 03_Master_Module_Index_v1.0.md |
| Platform | AIX Money Broking Platform |
| Review type | Principal Fintech Platform Architect / Module Index Review |
| Base documents | 00_Licence_Scope_And_Feature_Lock_v1.3.md, 01_Project_Charter_v1.3.md |
| Review basis | Labuan FSA Money Broking + PSO scope, Exchange application pending |
| Verdict | Strong, comprehensive module catalogue; five real gaps to close before the SRS |

---

## 0. Summary

This is a strong, well-structured catalogue — 158 modules across 12 groups — and it visibly absorbed the earlier corrections: DvP as MON-14, FX policy as MON-16, custody / safeguarding as MON-23 / MON-24, pre-funded hold as MON-15, and the traceability matrix as RPT-13. Licence-boundary and custody coverage is genuinely good.

This review focuses on the real gaps that remain.

---

## 1. Critical Gaps

### C1. No Transaction Monitoring / Alert Engine module (Areas 1, 8)

CMP-13 AML Case Management lists its dependency as "Alerts, Screening" — but **no module generates those alerts.** There is screening (CMP-04 / 05 / 08), re-screening (CMP-06), and case handling (CMP-13), but the **transaction-monitoring rules engine** (velocity, structuring, threshold breaches, pattern rules → alert → case) is missing as a named module. This is a core AML requirement and currently an orphaned dependency.

### C2. No withdrawal beneficiary / payout-destination whitelist (Areas 1, 6)

MON-11 Withdrawal Workflow depends on Travel Rule and Wallet Screening, but there is **no module managing verified payout destinations** — registered client bank accounts and whitelisted crypto withdrawal addresses, with verification, change cooling-off, and maker-checker. This is a primary fraud / AML control (it prevents withdrawal to an unverified or attacker-controlled destination) and it is absent. Travel Rule captures beneficiary *data*; it does not *whitelist and verify* the client's own payout destinations.

### C3. Pre-Funded Hold (MON-15) is not wired into the execution dependency chain (Areas 4, 6, 10)

MON-15 exists, but PRD-07 (OTC/RFQ), PRD-08 (Spot Terminal), and PRD-13 (Trade Booking) **do not list it as a dependency**, and the Money-Movement (19.3) and LP-Execution (19.4) dependency rules never require pre-funding before LP execution. Without "client funds / assets locked before the LP leg fires," the zero-inventory / agency / no-settlement-risk guarantee is asserted in prose but **not enforced at the module-dependency level** — a latent principal / settlement-risk path back into the model.

### C4. Build-sequence dependency inversion: money / settlement precedes the vendor integrations it needs (Area 3)

Phase D builds Deposit (D8), Withdrawal (D9), Settlement (D10–D11), and Reconciliation (D12) **before** Phase E delivers Custodian Integration (VND-07), Bank Integration (VND-08), and the LP Adapter (VND-04 / E3). But MON-08 / 09 / 13 / 19 / 20 / 21 explicitly depend on custodian, bank, node, and LP modules. Custodian and bank integration must precede — or run parallel to — the deposit / settlement build, not lag it.

### C5. No professional / accredited-status verification gate (Areas 5, 6)

Retail is locked and MVP is institutional / HNWI / professional-only — so the control that *keeps only qualified clients in* is the single most important eligibility gate. CLT-06 onboards HNWI / professional clients, but there is **no module that evidences / certifies qualifying status** (professional-investor thresholds, proof, attestation, re-assessment). The gatekeeper for the entire client-scope boundary is under-specified.

---

## 2. Recommended Corrections

1. **Add CMP-21 Transaction Monitoring & Alert Engine** (MVP-Critical, Compliance-Critical): rules → alerts → feeds CMP-13. Make CMP-13's "Alerts" dependency point to it.

2. **Add a Payout Destination Whitelist module** (e.g., MON-26 or IAM-11; Money-Critical + Compliance-Critical): registered bank accounts + whitelisted withdrawal addresses, verification, new-destination cooling-off, maker-checker, and linkage to Travel Rule (CMP-10) and Wallet Screening (CMP-08). Add it as a dependency of MON-11.

3. **Wire Pre-Funded Hold into execution:** add MON-15 as an explicit dependency of PRD-07, PRD-08, and PRD-13, and add a rule to §19.3 / §19.4: *no LP execution may fire before client pre-funding is held.* This is the enforcement that makes agency / zero-inventory real.

4. **Fix the build sequence (§18):** move Vendor Registry, LP Registry / Adapter, Custodian Integration, and Bank Integration to precede or parallel Phase D. At minimum, VND-07 and VND-08 must land before D8 (Deposit) and D11 (Settlement).

5. **Add CLT-14 Professional / Accredited Status Verification** (MVP-Critical, Compliance-Critical) as the eligibility gate behind CLT-03 Client Type Scope and CLT-04 Retail Onboarding Lock.

6. **Resolve the asset-whitelist ownership overlap:** CMP-20 (Approved Asset Whitelist Review) vs AST-02 / AST-03 (Approved Asset Whitelist / Admissibility Review) describe the same control from two groups. Define CMP as the *review / approval* step and AST as the *enforcement / config* store, or merge — otherwise two modules claim the same responsibility.

7. **Add a no-negative-balance / overdraft-prevention rule** to MON-06 Client Balance and to §19.3 (available balance cannot go negative; holds cannot exceed available).

8. **Generalise reconciliation-break handling:** MON-25 is settlement-specific. Add reconciliation-break / exception management for MON-17 / 20 / 21 (what happens when ledger ≠ bank / custodian / LP), with escalation and audit.

9. **Strengthen the blueprint pack (§4):** add `15_Regulatory_Mapping.md` for every Compliance-Critical module (which licence clause / regulation the module satisfies) to feed RPT-13 traceability, and a PII / data-classification note for modules handling client PII. Currently traceability is a single downstream module rather than a per-module obligation.

10. **Flag two market-conduct / privacy modules** currently absent — Complaints / Dispute Management (market conduct register) and Data-Subject-Rights / Privacy (PDPA / DSAR handling within retention limits). These can be Optional-Later, but they should appear in the index rather than be missing, since the Charter lists the corresponding policies as deliverables.

---

## 3. Additional Modules / Parameters to Add

```txt
# --- New modules ---
CMP-21  Transaction Monitoring & Alert Engine         # MVP-Critical / Compliance-Critical
MON-26  Payout Destination Whitelist (bank + wallet)  # MVP-Critical / Money+Compliance-Critical
CLT-14  Professional / Accredited Status Verification # MVP-Critical / Compliance-Critical
MON-27  Reconciliation Break / Exception Management    # MVP-Critical / Money-Critical
CMP-22  Complaints / Dispute Management (market conduct) # Optional-Later / Compliance-Critical
CMP-23  Data-Subject Rights / Privacy (PDPA/DSAR)      # Optional-Later / Compliance-Critical

# --- Dependency / control parameters ---
pre_funding_required_before_lp_execution = true
withdrawal_destination_whitelist_required = true
withdrawal_new_destination_cooling_off = required
transaction_monitoring_engine = required
professional_status_verification_required = true
client_negative_balance = prohibited
vendor_integration_precedes_money_movement = true
per_module_regulatory_mapping = required_for_compliance_critical
asset_whitelist_owner = AST_enforce_CMP_review        # resolve overlap
```

---

## 4. Top Priorities Before the SRS

1. **C3** — Wire Pre-Funded Hold (MON-15) into PRD execution. It is the module-level enforcement of the whole agency / zero-inventory model.
2. **C1 + C2** — Transaction Monitoring engine and payout-destination whitelist. Two core AML / money controls that are currently missing or orphaned.
3. **C4** — Fix the vendor-vs-money sequencing so deposit / settlement is not designed against integrations that do not yet exist.

C5 (professional-status verification) and the remaining corrections should be closed in the same pass, since they define the client-eligibility gate the whole MVP scope depends on.
