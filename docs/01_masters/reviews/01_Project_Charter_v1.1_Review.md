# Principal Fintech Platform Architect Review

## Document Reviewed: 01_Project_Charter_v1.1.md

| Item | Details |
|---|---|
| Reviewed document | 01_Project_Charter_v1.1.md |
| Platform | AIX Money Broking Platform |
| Review type | Principal Fintech Platform Architect / Project Charter Review |
| Base document | 00_Licence_Scope_And_Feature_Lock_v1.3.md |
| Review basis | Labuan FSA Money Broking + PSO scope, Exchange application pending |
| Verdict | Strong licence/execution content (inherited); missing most project-governance layer and a custody/safeguarding architecture blind spot |

---

## 0. Summary

The licence-boundary and execution-model content is strong and well-inherited from the lock document (the client-type scope is now resolved as institutional / HNWI). However, **as a Project Charter it is missing most of the classic project-governance layer**, and it carries one large architectural blind spot: **custody and client-money safeguarding are never defined**, even though crypto deposit / withdrawal is in scope while self-custody is prohibited.

This review is scoped to Critical Gaps / Recommended Corrections / Additional Parameters.

---

## 1. Critical Gaps

### C1. Custody & client-money safeguarding model is undefined (Areas 1, 4, 6, 10) — HIGHEST PRIORITY

The Charter has deposit / withdrawal, client balance, and a client-money ledger, but **never states where assets actually live.** Self-custody and AIX private-key custody are prohibited by the lock doc "unless separately approved," yet digital-asset deposit / withdrawal is in MVP scope.

Unanswered: which **crypto custodian**, which **fiat banking partner**, whether client money sits in a **segregated / safeguarding account at the bank level** (not just ledger separation). This is the single biggest unresolved architecture question and it blocks the entire money-movement design.

### C2. No project-governance layer (Areas 1, 8)

A Charter's core job is to name authority and boundaries of delivery. Missing: **project sponsor**, **named MLRO / Compliance Officer** accountability, **steering / decision authority (RACI)**, **budget / funding**, **timeline / milestones / dates** (the SDLC table has no schedule), **team / resourcing**, a **sign-off / approval block**, and **change-control authority for the Charter itself**. As written, no one is named accountable and there is no schedule.

### C3. Third-party dependencies are invisible (Areas 3, 4)

The whole model depends on external parties that appear nowhere as dependencies, risks, or modules: **LP legal + market-data license agreement** (Binance ToS may prohibit this use — bigger than "confirm redistribution rights"), **sanctions / PEP screening vendor**, **blockchain analytics / wallet-screening vendor**, **KYC / IDV vendor**, **on-chain node provider**, **banking rails**, and **cloud / outsourcing regulatory notification** (LFSA outsourcing expectations). Single-LP **concentration** with no backup LP is also unaddressed.

### C4. Missing modules (Area 4)

Not in the module list despite being required by in-scope features: **wallet / blockchain infrastructure** (deposit-address management, on-chain confirmation monitoring, reorg handling), **regulatory reporting** (periodic LFSA returns, distinct from STR), **records retention / archival**, **client agreement / consent / e-sign** (establishing the agency relationship at onboarding), **BCP / DR**, and a **vendor-integration** layer.

### C5. AI / Claude governance controls are absent (Area 7)

§24 assigns models to tasks but sets **no controls**: nothing prohibits **PII / secrets / real client data in prompts**, no **mandatory human expert review / sign-off of AI-generated regulated logic** (ledger, AML, licence gates), no rule that **AI cannot flip feature flags or bypass licence locks**, and no **data-governance rule for external tools** (using "ChatGPT 5.5" for "regulatory logic mapping" and "security review" sends regulated context off-platform). For a regulated build this is a material governance gap.

### C6. Development-delivery controls are thin (Area 8)

No **Definition of Done**, no **code-review / PR approval / branch protection**, no **test-coverage threshold**, no **CI security scanning (SAST / DAST / dependency)**, no **independent penetration test before go-live**, no **production change / release approval (maker-checker for deploys)**, and no explicit **environment matrix** (dev / test / staging / prod). Delivery quality is asserted, not gated.

### C7. Success criteria are feature-existence only — no assurance / go-live gates (Areas 5, 6)

§21 lists "feature works" items but omits operational-readiness gates: **compliance / MLRO go-live sign-off**, **LFSA platform notification / approval** (the digital money broking platform guideline may require regulator sign-off before launch), **penetration test passed**, **DR / backup tested**, and **client-money reconciliation actually balances** (currently only "reconciliation workflow exists"). A platform can pass all 25 criteria and still be unfit to launch.

### C8. Risk register gaps (Area 3)

§20 omits: **custody / safeguarding risk** (asset loss, key compromise), **LP concentration / counterparty-credit / offboarding** risk (only outage is covered — not Binance holding AIX funds, defaulting, or geo-blocking AIX), **conflict-of-interest / best-execution** risk, **data-privacy / PDPA** risk, **market-data licensing legal** risk, **regulatory-change / licence-condition-breach** risk, **BCP / DR** risk, and **key-person** risk.

### C9. Documentation deliverables missing (Area 9)

§22.1 omits regulated-fintech essentials: **AML / Compliance Policy + MLRO manual**, **Best Execution Policy** (only the "evidence" is referenced), **Client Agreement / Risk Disclosure** (agency relationship), **BCP / DR plan**, **Data Protection & Retention policy / DPIA**, **Incident Response runbook**, **Regulatory Reporting SOP**, **threat model**, and a **requirements ↔ licence ↔ module traceability matrix**.

### C10. Residual exchange-like / principal exposure (Area 10)

Three subtle openings remain:

- **Continuous streaming feel:** WebSocket realtime + "quote update < 1 second" + "External LP Market Depth display" push the terminal toward a live public-market look. Constrain to **indicative snapshot cadence**, not a continuously streaming order-book.
- **Latent exchange capability:** "Future Exchange expansion without rebuilding from zero" (Vision 8 / Objective 20) risks building matching-engine-shaped scaffolding that is partially wired in MVP. Add a control that **locked modules are not partially built or wired** into live paths.
- **OTC / RFQ counterparty ambiguity:** §7's agency / back-to-back rules are framed around the LP / spot flow. It is not explicitly stated that **OTC / RFQ is also agency** (staff / LP counterparty, never AIX as principal). A staff-input quote could otherwise be read as principal dealing.

---

## 2. Recommended Corrections

1. **Define the custody / safeguarding model (C1).** Add a section naming the crypto custody arrangement (third-party custodian — self-custody stays blocked), the fiat banking partner, and **bank-level segregation / safeguarding of client money** separate from AIX operating funds. If undecided, list it as a **blocking dependency** before SRS, not an open assumption.

2. **Add a Governance section (C2):** sponsor, named MLRO / Compliance Officer as accountable approver, RACI / decision authority, budget, milestone timeline, team / resourcing, a Charter **sign-off block**, and Charter change-control.

3. **Add a Dependencies & Vendors section (C3)** covering the LP legal + market-data agreement, screening / analytics / IDV vendors, node provider, banking rails, cloud / outsourcing regulatory notification, and a **backup-LP** position for concentration risk.

4. **Add the missing modules (C4)** to §11: Wallet / Blockchain Infrastructure, Regulatory Reporting, Records Retention / Archival, Client Agreement / Consent, BCP / DR, Vendor Integration.

5. **Add an AI Governance subsection to §24 (C5):** no PII / secrets / real client data in prompts; AI-generated regulated logic requires human expert review and cannot be auto-merged; AI must not flip flags or bypass licence locks; external-tool data-governance rule.

6. **Add delivery gates (C6):** Definition of Done, mandatory code review / branch protection, test-coverage threshold, CI security scanning, independent pen test before go-live, and maker-checker on production deploys; state the environment matrix.

7. **Add assurance go-live gates to §21 (C7):** compliance / MLRO sign-off, LFSA platform notification / approval, pen test passed, DR tested, and client-money reconciliation **balances** (not just "exists").

8. **Extend the risk register (C8)** with custody / safeguarding, LP concentration / counterparty-credit / offboarding, conflict-of-interest / best-execution, data-privacy / PDPA, market-data licensing, regulatory-change, BCP / DR, and key-person risks — each with a control.

9. **Add the missing documentation deliverables (C9)** to §22.1, including the requirements ↔ licence ↔ module traceability matrix as an explicit artifact.

10. **Close the residual exchange / principal openings (C10):** specify indicative-snapshot cadence (not continuous order-book streaming); state locked modules must not be partially wired in MVP; and explicitly declare OTC / RFQ execution as agency (LP / counterparty, never AIX principal).

11. **Doc-control check:** confirm every scope statement in this Charter is traceable to `00_..._v1.3.md` (the accepted base) — add a one-line traceability note or matrix so downstream SRS inherits a verified boundary.

---

## 3. Additional Parameters to Add

```txt
# --- Governance ---
project_sponsor = to_be_named
mlro_compliance_officer_named = required
charter_management_approval = required
raci_defined = required
project_budget = to_be_defined
project_timeline_milestones = to_be_defined
charter_change_control_authority = defined
compliance_signoff_before_production = required

# --- Custody & client money (blocking) ---
custody_model = to_be_defined            # third_party_custodian; self_custody blocked
crypto_custody_provider = to_be_defined
fiat_banking_partner = to_be_defined
client_money_safeguarding_account = segregated_bank_level_required
client_asset_segregation = required
fx_conversion_policy = to_be_defined

# --- Dependencies / vendors ---
lp_legal_agreement_required = true
lp_market_data_license_agreement = required
lp_concentration_backup_lp = to_be_defined
sanctions_screening_vendor = to_be_defined
blockchain_analytics_vendor = to_be_defined
kyc_idv_vendor = to_be_defined
onchain_node_provider = to_be_defined
outsourcing_cloud_regulatory_notification = required

# --- Missing modules ---
module_wallet_blockchain_infra = required
module_regulatory_reporting = required
module_records_retention_archival = required
module_client_agreement_consent = required
module_bcp_dr = required
module_vendor_integration = required

# --- AI / Claude governance ---
ai_no_pii_or_secrets_in_prompts = true
ai_no_real_client_data_in_prompts = true
ai_generated_regulated_logic_human_review = required
ai_cannot_modify_feature_flags = true
ai_cannot_bypass_licence_locks = true
ai_output_code_review_before_merge = required
external_ai_tool_data_governance = required

# --- Delivery controls ---
definition_of_done_per_module = required
code_review_pr_approval = required
branch_protection = required
min_test_coverage = to_be_defined
ci_security_scanning = sast_dast_dependency
independent_pentest_before_golive = required
production_deploy_approval = maker_checker
environment_matrix = dev_test_staging_prod
rollback_criteria = defined

# --- Go-live assurance gates ---
compliance_golive_signoff = required
lfsa_platform_notification_or_approval = to_be_confirmed
pentest_passed_gate = required
dr_backup_tested_gate = required
client_money_reconciliation_balanced_gate = required

# --- Exchange / principal safety ---
lp_depth_stream_mode = indicative_snapshot_not_continuous
locked_modules_partial_wiring_in_mvp = prohibited
otc_rfq_execution_model = agency_no_aix_principal
```

---

## 4. Top Priorities Before Master Module Index / SRS

1. **C1** — Custody & client-money safeguarding. The platform cannot be designed without it.
2. **C2 / C3** — Governance + vendor dependencies. A Charter must name authority and external reliance.
3. **C7** — Go-live assurance gates, so "MVP success" means "fit to launch," not just "features exist."

Everything else strengthens the Charter, but these three are structural.
