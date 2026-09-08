# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening Blueprint Pack v1.2

## Module

AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening

## Purpose

AML-01 owns screening outcomes for onboarding, ongoing monitoring, wallet/counterparty screening support, and Travel Rule screening requirements.

It provides the AML/sanctions/PEP/adverse-media outcomes that CLT-01 requires before final client approval and that KYC-01 consumes as EDD/remediation triggers.

It covers:

1. Sanctions list screening.
2. PEP screening.
3. Adverse media screening.
4. Watchlist screening.
5. Screening case lifecycle.
6. Match decision workflow.
7. False-positive and true-hit handling.
8. AML outcome publication to CLT-01.
9. AML-triggered EDD signal to KYC-01.
10. Ongoing monitoring / rescreening.
11. Travel Rule data validation and screening support.
12. Suspicious activity escalation and STR preparation controls.
13. Tipping-off protection.
14. Sensitive evidence access and export controls.
15. Screening vendor/result integrity.

## Accepted Dependencies

- FND-01 Platform Foundation accepted v1.2.
- IAM-01 Authentication / MFA / Session accepted v1.2.
- IAM-02 RBAC / Permission Guard / SoD accepted v1.2.
- SEC-01 Audit Log / Security Monitoring accepted v1.2.
- CFG-01 Feature Flag / Licence Lock accepted v1.2.
- CLT-01 Client Onboarding / Client Profile accepted v1.2.
- KYC-01 KYC / KYB Verification accepted v1.2.

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


## v1.1 Review Patch Summary

This v1.1 patch closes the Claude Opus initial review gaps:

1. Synchronous pre-transaction sanctions gate added as hard contract with MON/settlement/payment and Travel Rule flows.
2. Sanctions list-update rescreening SLA with interim blocking added.
3. Mandated sanctions list coverage added:
   - UN
   - OFAC
   - EU
   - UK/HMT
   - MAS
   - Malaysia/MOHA
4. Ownership-based sanctions / 50% rule using KYC-01 UBO ownership graph added.
5. Screening scope now consumes KYC-01 ownership tree and all natural-person UBOs/controllers.
6. List freshness assurance added.
7. Matching-quality standard added:
   - aliases
   - fuzzy matching
   - transliteration
   - name variations
   - DOB/nationality/ID corroboration
8. STR statutory clock/deadline and escalation path added.
9. Transaction handling during pending STR defined as policy-controlled with no tipping-off.
10. Sanctions false-positive governance strengthened:
    - dual Compliance/MLRO review.
    - standing false-positive periodic re-attestation.
    - non-suppressible match-threshold floor.
11. Minimum screening-input dataset by party type added.
12. Thin/incomplete input can only be review_required/pending, never clear.
13. AML outcome tamper-evidence/freshness contract added:
    - hash-sealed outcome.
    - validity window.
    - revoke on new hit.
    - CLT payload-hash verification.
14. PEP depth added:
    - foreign/domestic PEP.
    - RCA coverage.
    - declassification/persistence.
15. Country/high-risk jurisdiction source and handling added.
16. De-listing/removal controlled unblock path added.
17. Travel Rule de-minimis threshold and sunrise handling added.

## v1.2 Final Rollup Summary

AML-01 v1.2 is a non-substantive final rollup after Claude Opus final verification.

Status:
- All 5 critical gaps resolved in v1.1.
- All 6 recommended corrections resolved in v1.1.
- v1.2 fixes only the cosmetic version-cell nit.
- AML-01 is accepted / final verified.

Cosmetic fix:
1. Updated `01_Module_Blueprint.md` Document Control pack version cell to v1.2.

Control change from v1.1:
- None.

Compliance sub-tier status:
- CLT-01 accepted v1.2.
- KYC-01 accepted v1.2.
- AML-01 accepted v1.2.

Next module:
- WLT-01 Wallet Screening / Payout Destination Whitelist.
