---
document_id: CLT-01-BP-v1.2
title: CLT-01 Blueprint Pack — Client Onboarding / Client Profile
version: v1.2
document_status: DRAFT
implementation_status: N/A
module: CLT-01
control: Client onboarding, client profile
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none (uncertified)
baseline_commit: 780e116
---

# CLT-01 Client Onboarding / Client Profile Blueprint Pack v1.2

## Module

CLT-01 Client Onboarding / Client Profile

## Purpose

CLT-01 defines the client onboarding and client profile control layer for the AIX Money Broking + PSO Platform.

It covers:
1. Client application intake.
2. Client type and client-class classification.
3. Institutional / HNWI / Professional eligibility controls.
4. Retail default lock.
5. Client profile creation.
6. Client account lifecycle.
7. Client mandate and authorised user structure.
8. Client-side dual authorisation setup.
9. Onboarding status and handoff to KYC/KYB / AML modules.
10. Licence-scope feature gating through CFG-01.
11. Audit evidence through SEC-01.
12. Permission and approval controls through IAM-02.

## Accepted Dependencies

- FND-01 Platform Foundation accepted v1.2.
- IAM-01 Authentication / MFA / Session accepted v1.2.
- IAM-02 RBAC / Permission Guard / SoD accepted v1.2.
- SEC-01 Audit Log / Security Monitoring accepted v1.2.
- CFG-01 Feature Flag / Licence Lock accepted v1.2.

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


## v1.1 Review Patch Summary

This v1.1 patch closes the initial Claude Opus review gaps:

1. Final onboarding approval now requires actual CDD, screening and risk outcomes, not merely handoff existence.
2. Handoff delivery status is separated from outcome status.
3. Sanctions hit, failed CDD, prohibited PEP/adverse-media result, or rejected risk rating hard-blocks onboarding.
4. Authorised signatories, directors, controllers, UBOs, client admins and client approvers require individual KYC/sanctions/PEP screening before authority is active.
5. UBO identification threshold added as a required parameter.
6. Downstream-to-CLT ongoing monitoring feedback contract added.
7. Post-onboarding hits, KYC expiry, risk increases, or periodic review failure can restrict/suspend the client.
8. Client-class progression now requires verified classification evidence; unverified class is treated as retail-locked/held.
9. Data-protection model strengthened with lawful basis, DSAR, rectification, erasure/restriction, pseudonymisation, cross-border basis, retention and destruction.
10. Handoff failure retry/dead-letter/escalation added.
11. Mandate schema validation aligned to IAM-02 WF-IAM02-10.
12. Authorised-user revocation immediate propagation added.
13. Verified-identity uniqueness and related-party graph added.
14. `active_limited` defined as non-transactional.

## v1.2 Final Rollup Summary

CLT-01 v1.2 is a non-substantive final rollup after Claude Opus final verification.

Status:
- All 5 critical gaps resolved in v1.1.
- All 6 recommended corrections resolved in v1.1.
- v1.2 fixes only cosmetic placement/index nits.
- CLT-01 is accepted / final verified.

Cosmetic fixes:
1. Repositioned the v1.1 principle blocks into the Critical Principles area.
2. Added indexes for the new v1.1 tables:
   - `cdd_outcome`
   - `authorised_party`
   - `monitoring_feedback`
   - `related_party_edge`
   - `verified_identity`
   - `data_protection_request`
   - `retention_schedule`

Control change from v1.1:
- None.

Next module:
- KYC-01 KYC / KYB Verification.
