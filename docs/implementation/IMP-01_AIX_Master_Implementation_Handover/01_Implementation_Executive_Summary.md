# IMP-01 AIX Master Implementation Handover
## 01 Implementation Executive Summary

## 1. Objective

This document provides the executive implementation bridge for the accepted AIX Money Broking + PSO platform blueprint chain.

The accepted blueprints define the complete money, control, compliance, reconciliation, resilience and portal surface of the platform. The next phase is to implement the platform module-by-module without weakening the regulatory, safeguarding, audit, licence-lock or money-flow controls.

## 2. Implementation Principle

The implementation must follow this rule:

```txt
code_must_conform_to_blueprints = true
blueprints_must_not_be_weakened_by_implementation = true
frontend_must_not_bypass_backend = true
manual_ops_must_not_bypass_system_controls = true
```

## 3. Platform Runtime Scope

The platform is a regulated Money Broking + PSO platform. It is not an Exchange runtime.

Allowed:

1. institutional / HNWI / professional onboarding, according to approved scope.
2. KYC/KYB.
3. AML/sanctions/PEP/adverse media.
4. Travel Rule.
5. wallet/source/destination screening.
6. deposit receipt/intention workflows.
7. withdrawal/payout execution workflows.
8. LP-backed agency quote/trade execution.
9. immutable double-entry ledger.
10. reconciliation and finance reporting.
11. incident/freeze/recovery.
12. client/staff/admin portals.

Prohibited until separately licensed/approved:

1. public exchange order book.
2. matching engine.
3. public market depth.
4. client-to-client matching.
5. market making.
6. principal dealing.
7. AIX inventory.
8. AIX spread markup.
9. securities/STO features unless separately approved.

## 4. Implementation Strategy

Recommended implementation sequence:

```txt
foundation → identity → permissions → audit → licence-lock → client/compliance → wallet/ledger → execution rails → trading → reconciliation → incident → portal → E2E QA → UAT → go-live
```

## 5. Engineering Rule

Each module must be implemented in isolation:

1. read only relevant module blueprint files.
2. search existing repo patterns first.
3. implement only current module.
4. keep focused diffs.
5. add tests from module test cases.
6. update implementation handover.
7. use fresh Claude Code session or `/compact` after each module.

## 6. Acceptance Rule

A module implementation is not complete until:

1. APIs implemented.
2. database migrations implemented.
3. permissions enforced.
4. audit events emitted.
5. errors mapped.
6. tests added and passing.
7. forbidden behaviours tested.
8. evidence artifacts generated.
9. deployment checklist completed.
10. module handover updated.

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

