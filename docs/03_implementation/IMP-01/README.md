---
document_id: IMP-01
title: AIX Master Implementation Handover
version: v1.0
document_status: DRAFT
implementation_status: IN_PROGRESS
module: N/A
control: Build order, dependency map, migration order, go-live roadmap
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 780e116
---

# IMP-01 AIX Master Implementation Handover Pack v1.0

## Purpose

This pack converts the accepted AIX Money Broking + PSO blueprint chain into an implementation-ready handover for developers, Claude Code, Codex, QA, compliance, finance, security and management.

It is not a new system module. It is the bridge from accepted documentation to working source code.

## Platform Boundary

AIX platform implementation must remain within the accepted Money Broking + PSO scope:

```txt
allowed_runtime_model = money_broking_psp_spot_broking_agency_model
exchange_runtime = prohibited_until_licensed
aix_inventory = zero
aix_principal_dealing = prohibited
aix_market_making = prohibited
aix_spread_markup = prohibited
client_assets_fully_backed = mandatory
ledger_double_entry_immutable = mandatory
audit_evidence_continuous = mandatory
```

## Pack Contents

1. `01_Implementation_Executive_Summary.md`
2. `02_Build_Order_And_Dependency_Map.md`
3. `03_Repository_And_Codebase_Setup.md`
4. `04_Module_Implementation_Handover.md`
5. `05_API_And_Service_Contract_Map.md`
6. `06_Database_Migration_Order.md`
7. `07_Environment_Config_Secrets_Checklist.md`
8. `08_Testing_And_QA_Master_Matrix.md`
9. `09_Security_Compliance_Evidence_Checklist.md`
10. `10_Claude_Code_Codex_Workflow.md`
11. `11_Go_Live_Implementation_Roadmap.md`
12. `12_Final_Handover_Status.md`

## Status

```txt
IMP-01 status = implementation handover draft v1.0
source blueprint chain = accepted / review-complete
next phase = module-by-module implementation
```

# Accepted Blueprint Chain

## Master Documents

1. `00_Licence_Scope_And_Feature_Lock_v1.3.md`
2. `01_Project_Charter_v1.3.md`
3. `02_Software_Requirement_Specification_v1.2.md`
4. `03_Master_Module_Index_v1.2.md`
5. `04_Role_And_Permission_Matrix_v1.2.md`
6. `05_Master_Workflow_Map_v1.2.md`
7. `06_Master_System_Rules_v1.2.md`
8. `07_Master_Data_Flow_v1.2.md`
9. `08_Master_Technical_Architecture_v1.2.md`
10. `09_Master_Security_Architecture_v1.2.md`
11. `10_Master_Testing_Strategy_v1.2.md`
12. `11_Master_Deployment_Strategy_v1.2.md`

## Accepted Modules

1. FND-01 Platform Foundation v1.2 — Accepted
2. IAM-01 Authentication / MFA / Session v1.2 — Accepted
3. IAM-02 RBAC / Permission Guard / SoD v1.2 — Accepted
4. SEC-01 Audit Log / Security Monitoring v1.2 — Accepted
5. CFG-01 Feature Flag / Licence Lock v1.2 — Accepted
6. CLT-01 Client Onboarding / Client Profile v1.2 — Accepted
7. KYC-01 KYC / KYB Verification v1.2 — Accepted
8. AML-01 Sanctions / PEP / Adverse Media / Travel Rule v1.2 — Accepted
9. WLT-01 Wallet Screening / Payout Destination Whitelist v1.2 — Accepted
10. LED-01 Ledger / Settlement / Safeguarding v1.2 — Accepted
11. TRD-01 Quote / Trade / LP Execution v1.2 — Accepted
12. E2E-01 Cross-Module End-To-End Fund-Flow Review v1.2 — Accepted
13. DEP-01 Deposit Execution / Inbound Receipt v1.2 — Accepted
14. WDR-01 Withdrawal / Payout Execution Rail v1.2 — Accepted
15. REC-01 Reconciliation / Finance Reporting v1.2 — Accepted
16. INC-01 Incident / Freeze / Recovery v1.2 — Accepted
17. PRT-01 Client / Staff / Admin Portal Workflows v1.2 — Accepted

