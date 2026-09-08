# CFG-01 Feature Flag / Licence Lock Blueprint Pack v1.1

## Module

CFG-01 Feature Flag / Licence Lock

## Purpose

CFG-01 is the authoritative licence-scope and feature-control module for the AIX Money Broking + PSO Platform.

It owns:

1. Licence-lock source of truth.
2. Feature flag registry.
3. Runtime feature evaluation.
4. Exchange-pending lock enforcement.
5. Prohibited feature prevention.
6. Environment and tenant/client feature constraints.
7. Controlled feature changes through IAM-02 maker-checker.
8. Audit and monitoring through SEC-01.
9. Runtime propagation to downstream modules.

CFG-01 replaces interim sealed licence-lock lists used by IAM-02 and SEC-01.

## Accepted Dependencies

- FND-01 Platform Foundation accepted v1.2.
- IAM-01 Authentication / MFA / Session accepted v1.2.
- IAM-02 RBAC / Permission Guard / SoD accepted v1.2.
- SEC-01 Audit Log / Security Monitoring accepted v1.2.

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


## v1.1 Review Patch Summary

This v1.1 patch closes the Claude Opus initial review gaps:

1. Licence/prohibited config integrity added: signed hash sealed to Doc 00 baseline.
2. Decision-time prohibited-registry and licence-profile integrity verification added.
3. Out-of-band config change detection added: fail-closed and Critical SEC-01 alert.
4. Hardened Exchange activation governance ceremony added.
5. LFSA licence-evidence authenticity verification added.
6. Board sign-off, per-feature activation, deployment gate, re-seal, and cooldown added for Exchange activation.
7. Prohibited-registry meta-SoD added.
8. CFG-01 feature gate bound to IAM-02 permission decision token.
9. Feature-gate coverage/orphan-gate reconciliation added.
10. Asymmetric fail-closed defined: locked/prohibited always deny; allowed licensed activity uses FND transaction-coupled audit outbox during SEC-01 outage.
11. Prohibited/Exchange-locked features hard-blocked in all environments; synthetic-data-only quarantine exception for non-prod testing.
12. Production deployment hard-blocks non-prod enabled locked feature config.
13. Kill-switch forces immediate version increment and decision-token revocation.
14. Suspended/revoked licence immediately revokes outstanding decision tokens.
15. Decision token now binds prohibited-registry version and integrity hash.

No Exchange features are enabled.
