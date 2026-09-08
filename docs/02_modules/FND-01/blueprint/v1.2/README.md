---
document_id: FND-01-BP-v1.2
title: FND-01 Blueprint Pack — Platform Foundation
version: v1.2
document_status: APPROVED
implementation_status: N/A
module: FND-01
control: Platform foundation (scheduler/RLS/audit-outbox/correlation)
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: v1.1 (superseded, retained)
baseline_commit: 780e116
---

# FND-01 Platform Foundation Blueprint Pack v1.2

## Module

FND-01 Platform Foundation

## Purpose

This blueprint pack defines the platform foundation layer for the AIX Money Broking Platform. It provides the shared runtime, request standards, environment boundaries, module boundary rules, deployment safety baseline, observability baseline, and cross-cutting controls required before building regulated business modules.

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

## Scope

This module does not implement client onboarding, KYC, AML, wallet screening, trading, ledger, settlement, reconciliation, or reporting logic. It creates the safe platform base on which those modules can be built.

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



## v1.1 Review Patch Summary

This v1.1 patch closes the Claude Opus review gaps:

1. Scheduler and background job queue baseline added.
2. Database-level isolation baseline added.
3. Audit/outbox transaction-coupling contract added.
4. Async correlation propagation added.
5. Rule/workflow/data-flow traceability table added.
6. Rate-limit interface baseline added.
7. Idempotency-key uniqueness scope clarified.
8. Role naming reconciled to canonical / candidate role mapping.

## v1.2 Final Verification Patch

This v1.2 patch marks FND-01 as accepted and fixes only three documentation hygiene items:

1. Removed duplicate Job Queue Interface row from the Foundation Components table.
2. Added retention rows for scheduled/job/rate-limit tables.
3. Clarified idempotency namespace and cross-actor replay behaviour.
