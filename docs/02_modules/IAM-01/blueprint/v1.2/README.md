---
document_id: IAM-01-BP-v1.2
title: IAM-01 Blueprint Pack — Authentication / MFA / Session
version: v1.2
document_status: APPROVED
implementation_status: N/A
module: IAM-01
control: Auth, MFA, session, step-up
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: v1.1 (superseded, retained)
baseline_commit: 780e116
---

# IAM-01 Authentication / MFA / Session Blueprint Pack v1.2

## Module

IAM-01 Authentication / MFA / Session

## Purpose

This blueprint pack defines authentication, MFA, password, session, device, account-lockout, login notification, service-account identity, and authentication security events for the AIX Money Broking Platform.

IAM-01 depends on the accepted FND-01 platform foundation and must inherit:

1. Request context.
2. Correlation ID propagation.
3. Standard API envelope.
4. Standard error envelope.
5. Audit/outbox transaction-coupling baseline.
6. Async correlation propagation.
7. Per-module DB grants and RLS baseline.
8. Rate-limit interface.
9. Log-scrubbing baseline.
10. Deployment smoke hooks.

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


## v1.1 Review Patch Summary

This v1.1 patch closes the Claude Opus review gaps:

1. Step-up authentication interface and recent-auth assertion added.
2. Interim MFA-reset approval control added until IAM-02 is live.
3. Account freeze/suspension → immediate session revocation contract added.
4. Per-user-class session policy added.
5. Access-token binding and mid-session anomaly detection added.
6. Concurrent-session limit and global logout added.
7. Password history and breached-password check added.
8. `iam.auth_event` clarified as non-authoritative read index; SEC-01 audit store remains authoritative.
9. FND-01 dependency clarified as accepted FND-01 v1.2 foundation pack.
10. Additional tests added for step-up, freeze revocation, session hijack mitigation, concurrent sessions, MFA-verify/token-refresh rate limiting, and auth event authority.

## v1.2 Final Verification Patch

This v1.2 patch fixes the final verification hygiene items:

1. FND-01 dependency reference is standardised to the accepted `FND-01_Platform_Foundation_Blueprint_Pack_v1.2` pack reference without artifact-type `.zip` wording.
2. IAM1-TC-079, IAM1-TC-080, and IAM1-TC-081 priority cells are completed.
3. No substantive IAM control changes from v1.1.
