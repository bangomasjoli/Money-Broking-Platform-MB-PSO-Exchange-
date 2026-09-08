---
document_id: KYC-01-BP-v1.2
title: KYC-01 Blueprint Pack — KYC / KYB Verification
version: v1.2
document_status: DRAFT
implementation_status: N/A
module: KYC-01
control: KYC / KYB verification
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none (uncertified)
baseline_commit: 780e116
---

# KYC-01 KYC / KYB Verification Blueprint Pack v1.2

## Module

KYC-01 KYC / KYB Verification

## Purpose

KYC-01 owns customer due diligence verification outcomes for individuals, companies, institutions, authorised parties, directors, controllers and UBOs.

KYC-01 provides the CDD/KYB outcomes that CLT-01 requires before onboarding approval.

It covers:
1. Individual KYC case creation.
2. Corporate / institutional KYB case creation.
3. Identity verification outcome.
4. Company verification outcome.
5. Director/controller/UBO verification outcome.
6. Document checklist and verification result.
7. Beneficial ownership threshold checks.
8. Enhanced due diligence routing.
9. CDD outcome lifecycle.
10. Periodic review and refresh.
11. Remediation and rejection.
12. Auditable outcome publication back to CLT-01.
13. Sensitive evidence access and export controls.

## Accepted Dependencies

- FND-01 Platform Foundation accepted v1.2.
- IAM-01 Authentication / MFA / Session accepted v1.2.
- IAM-02 RBAC / Permission Guard / SoD accepted v1.2.
- SEC-01 Audit Log / Security Monitoring accepted v1.2.
- CFG-01 Feature Flag / Licence Lock accepted v1.2.
- CLT-01 Client Onboarding / Client Profile accepted v1.2.

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


## v1.1 Review Patch Summary

This v1.1 patch closes the Claude Opus initial review gaps:

1. UBO look-through to ultimate natural persons added.
2. Indirect ownership aggregation across branches added.
3. Trust/nominee role modelling added: settlor, trustee, beneficiary, protector, nominee, controller.
4. Untraceable ownership/control now triggers EDD or fail, never pass.
5. Third-party/vendor reliance framework added:
   - regulated/supervised vendor requirement.
   - underlying CDD records obtainable on demand.
   - vendor accreditation status.
   - vendor outage fail-closed/manual fallback.
   - confidence threshold and inconclusive handling.
   - vendor result validity window.
6. Identity-proofing assurance levels added by client class/risk:
   - document authenticity check.
   - liveness/biometric binding for non-face-to-face onboarding.
   - address verification.
   - SoW/SoF for high-risk/HNWI/EDD.
7. KYC↔AML boundary hardened:
   - KYC pass = identity/entity verification only.
   - KYC pass is not screening clearance.
   - AML/PEP/EDD integration is a hard contract.
   - Combined CDD requires KYC pass + AML clear.
8. Evidence-store security contract added:
   - encryption at rest.
   - IAM-02-bound access control.
   - hash re-verification on read.
   - retention/destruction aligned with CLT-01.
9. Identity-vs-application cross-check added.
10. Verified-identity hash basis aligned with CLT-01.
11. Minimum EDD measures enumerated.
12. Reconciliation extended for active authorised party without KYC pass and pass outcome with untraced ownership.

## v1.2 Final Rollup Summary

KYC-01 v1.2 is a non-substantive final rollup after Claude Opus final verification.

Status:
- All 5 critical gaps resolved in v1.1.
- All 6 recommended corrections resolved in v1.1.
- v1.2 fixes only cosmetic version/NFR-table nits.
- KYC-01 is accepted / final verified.

Cosmetic fixes:
1. Updated `01_Module_Blueprint.md` Document Control pack version cell to v1.2.
2. Added NFR rows for the v1.1 controls:
   - UBO look-through.
   - Vendor reliance.
   - Proofing assurance.
   - Evidence-store security.
   - KYC/AML boundary.
   - Verified-identity hash alignment.
   - Minimum EDD measures.

Control change from v1.1:
- None.

Next module:
- AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening.
