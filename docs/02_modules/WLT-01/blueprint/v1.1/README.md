---
document_id: WLT-01-BP-v1.1
title: WLT-01 Blueprint Pack — Wallet Screening / Payout-Destination Whitelist
version: v1.1
document_status: APPROVED
implementation_status: N/A
module: WLT-01
control: Wallet screening, payout-destination whitelist
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: v1.0 (archived)
baseline_commit: 780e116
---

# WLT-01 Wallet Screening / Payout Destination Whitelist Blueprint Pack v1.1

## Module

WLT-01 Wallet Screening / Payout Destination Whitelist

## Purpose

WLT-01 owns digital-asset wallet address screening, fiat payout-destination whitelist controls, beneficiary verification support, and destination eligibility outcomes before any deposit attribution, withdrawal, payout, settlement, or Travel Rule-related movement proceeds.

It consumes CLT-01 client status, KYC-01 verified identity/ownership data, and AML-01 sanctions/Travel Rule screening decisions.

It covers:

1. Wallet address registration.
2. Wallet address ownership / control evidence.
3. Wallet screening.
4. Wallet risk result capture.
5. Blockchain analytics vendor result capture.
6. Sanctions/exposure category checks.
7. Fiat payout destination registration.
8. Beneficiary / bank-account ownership evidence.
9. Payout destination whitelist approval.
10. Destination lifecycle status.
11. Pre-transaction destination eligibility gate.
12. Travel Rule data handoff support.
13. Client-side dual authorisation for destination changes.
14. Maker-checker and Compliance review.
15. Whitelist cooling-off / activation delay.
16. Destination revocation and immediate propagation.
17. Re-screening and ongoing monitoring.
18. Evidence read/export controls.
19. Reconciliation jobs.

## Accepted Dependencies

- FND-01 Platform Foundation accepted v1.2.
- IAM-01 Authentication / MFA / Session accepted v1.2.
- IAM-02 RBAC / Permission Guard / SoD accepted v1.2.
- SEC-01 Audit Log / Security Monitoring accepted v1.2.
- CFG-01 Feature Flag / Licence Lock accepted v1.2.
- CLT-01 Client Onboarding / Client Profile accepted v1.2.
- KYC-01 KYC / KYB Verification accepted v1.2.
- AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening accepted v1.2.

## Pack Contents

1. `01_Module_Blueprint.md`
2. `02_Workflow.md`
3. `03_Diagrams.md`
4. `04_API_Specification.md`
5. `05_Database_Design.md`
6. `06_State_Machine.md`
7. `07_Permission_Rules.md`
8. `08_Audit_Log_Events.md`
9. `09_Error_Handling.md`
10. `10_Test_Cases.md`
11. `11_Claude_Prompt.md`
12. `12_Risk_And_Control_Map.md`
13. `13_Reconciliation_Design.md`
14. `14_Go_Live_Checklist.md`
15. `15_Regulatory_Mapping.md`
16. `16_Data_Classification.md`

Base documents:
- 00_Licence_Scope_And_Feature_Lock_v1.3.md
- 01_Project_Charter_v1.3.md
- 02_Software_Requirement_Specification_v1.2.md
- 03_Master_Module_Index_v1.2.md
- 04_Role_And_Permission_Matrix_v1.2.md
- 05_Master_Workflow_Map_v1.2.md
- 06_Master_System_Rules_v1.2.md
- 07_Master_Data_Flow_v1.2.md
- 08_Master_Technical_Architecture_v1.2.md
- 09_Master_Security_Architecture_v1.2.md
- 10_Master_Testing_Strategy_v1.2.md
- 11_Master_Deployment_Strategy_v1.2.md
- FND-01_Platform_Foundation_Blueprint_Pack_v1.2
- IAM-01_Authentication_MFA_Session_Blueprint_Pack_v1.2
- IAM-02_RBAC_Permission_Guard_SoD_Blueprint_Pack_v1.2
- SEC-01_Audit_Log_Security_Monitoring_Blueprint_Pack_v1.2
- CFG-01_Feature_Flag_Licence_Lock_Blueprint_Pack_v1.2
- CLT-01_Client_Onboarding_Client_Profile_Blueprint_Pack_v1.2
- KYC-01_KYC_KYB_Verification_Blueprint_Pack_v1.2
- AML-01_Sanctions_PEP_Adverse_Media_Travel_Rule_Blueprint_Pack_v1.2


## v1.1 Review Patch Summary

This v1.1 patch closes the Claude Opus initial review gaps:

1. Destination decision token consumption now requires atomic execution-time revalidation against current revocation, whitelist, AML, client-status, mandate and risk state.
2. Destination decision token now binds revocation epoch, whitelist version, limits version, AML revocation epoch and destination status version.
3. Hard consumption contract with MON/settlement/payout/deposit modules added.
4. Per-destination and per-client value limits added:
   - per-transaction max.
   - daily velocity.
   - rolling velocity.
   - concentration limit.
   - first-use lower limit / step-up.
5. Inbound deposit-source screening added:
   - originating wallet/bank source screening.
   - unscreened/sanctioned/high-risk source held/quarantined.
   - no auto-credit before source clearance.
6. Unhosted wallet proof-of-control strengthened:
   - signed message / micro-deposit required.
   - own-name / first-party binding.
   - third-party wallet prohibited unless approved beneficiary.
   - enhanced Travel Rule/counterparty-absent handling.
7. Crypto address integrity controls added:
   - chain-specific checksum/case/format canonicalisation.
   - name-service resolution to raw address only.
   - never store name-service alias as destination.
   - full-address client reconfirmation.
   - scam/lookalike/address-poisoning screening.
8. Supported-chain and provider-coverage matrix added.
9. Unsupported chain/asset is not clear; hold/review required.
10. AML-01 outcome revocation subscription added.
11. Wallet beneficiary relationship bound to KYC-01 verified identity where applicable.
12. Cooling-off cancellation on new risk/revocation hit added.
13. Deposit mis-attribution quarantine added.
14. New tests WLT1-TC-041 to WLT1-TC-069.
