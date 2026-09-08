---
document_id: IAM-02-BP-v1.1
title: IAM-02 Blueprint Pack — RBAC / Permission Guard / SoD
version: v1.1
document_status: SUPERSEDED
implementation_status: N/A
module: IAM-02
control: RBAC, permission guard, segregation of duties
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: v1.0 (archived)
baseline_commit: 780e116
---

# IAM-02 RBAC / Permission Guard / SoD Blueprint Pack v1.1

## Module

IAM-02 RBAC / Permission Guard / Segregation of Duties

## Purpose

This blueprint pack defines the permanent permission-control layer for the AIX Money Broking + PSO Platform.

IAM-02 owns:

1. Role-based access control.
2. Permission guard.
3. Maker-checker approval framework.
4. Segregation-of-duties conflict checks.
5. Delegated permissions.
6. Temporary permissions.
7. Break-glass access control.
8. Permission audit events.
9. Permission cache invalidation.
10. Sensitive permission read logging.
11. Role mapping and canonical permission catalogue.
12. Integration with IAM-01 step-up authentication.

## Accepted Dependencies

- FND-01 Platform Foundation accepted v1.2.
- IAM-01 Authentication / MFA / Session accepted v1.2.

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


## v1.1 Review Patch Summary

This v1.1 patch closes the Claude Opus initial review gaps:

1. Approval-to-execution binding added: immutable payload hash, execution verification, and permission decision token.
2. Protected-action registry and guard-coverage reconciliation added.
3. SoD risk-acceptance tightened, Critical SoD conflicts made block-only, and IAM-02 meta-SoD added.
4. Break-glass privilege ceiling, explicit whitelist, max duration, and concurrent grant limit added.
5. Interim licence-lock and audit-authority contracts added until CFG-01 and SEC-01 are live.
6. Service-account approver loophole removed.
7. Revocation/cache invalidation made mandatory and deterministic.
8. Approval concurrency and dual non-conflicting approver controls added.
9. Cache positive-version check added.
10. Re-delegation prohibited.
11. Permission decision bound to IAM-01 session/auth level.
12. User override cannot satisfy licence-locked or prohibited permissions.
