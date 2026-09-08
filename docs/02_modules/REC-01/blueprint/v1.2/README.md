---
document_id: REC-01-BP-v1.2
title: REC-01 Blueprint Pack — Reconciliation / Finance Reporting
version: v1.2
document_status: DRAFT
implementation_status: N/A
module: REC-01
control: Reconciliation, finance reporting
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none (uncertified)
baseline_commit: 780e116
---

# REC-01 Reconciliation / Finance Reporting Blueprint Pack v1.2

## Module

REC-01 Reconciliation / Finance Reporting

## Purpose

REC-01 owns cross-module reconciliation, finance control reporting, exception tracking, safeguarding evidence aggregation, and regulator/auditor-ready reporting over the AIX Money Broking + PSO platform.

REC-01 is a detective and reporting module. It must not post ledger, edit balances, execute trades, approve deposits, approve withdrawals, override AML/WLT decisions, or clear its own critical breaks without controlled remediation.

It answers:

```txt
Do all client-money, client-asset, trading, deposit, withdrawal, fee, safeguarding, audit and external-provider records reconcile end-to-end, with unresolved breaks controlled, escalated and evidenced?
```

## Core Scope

1. Cross-module reconciliation orchestration.
2. Ledger-to-external-provider reconciliation.
3. Deposit reconciliation.
4. Withdrawal / payout reconciliation.
5. Trade / LP execution reconciliation.
6. Fee / commission reconciliation.
7. Safeguarding and client-liability reporting.
8. E2E correlation and saga reconciliation.
9. SEC expected-vs-emitted audit completeness.
10. Exception / break management.
11. Finance reporting extracts.
12. Management control reports.
13. Regulatory / auditor evidence pack.
14. Daily close and period close controls.
15. Immutable reconciliation run evidence.

## Strict Out of Scope

1. Ledger posting.
2. Balance editing.
3. Trade execution.
4. Deposit crediting.
5. Withdrawal execution.
6. Wallet screening.
7. AML screening decision.
8. Client onboarding decision.
9. Exchange order book / matching.
10. Principal dealing or AIX inventory.

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

Accepted baseline:
- FND-01 Platform Foundation v1.2 — Accepted
- IAM-01 Authentication / MFA / Session v1.2 — Accepted
- IAM-02 RBAC / Permission Guard / SoD v1.2 — Accepted
- SEC-01 Audit Log / Security Monitoring v1.2 — Accepted
- CFG-01 Feature Flag / Licence Lock v1.2 — Accepted
- CLT-01 Client Onboarding / Client Profile v1.2 — Accepted
- KYC-01 KYC / KYB Verification v1.2 — Accepted
- AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening v1.2 — Accepted
- WLT-01 Wallet Screening / Payout Destination Whitelist v1.2 — Accepted
- LED-01 Ledger / Settlement / Safeguarding v1.2 — Accepted
- TRD-01 Quote / Trade / LP Execution v1.2 — Accepted
- E2E-01 Cross-Module End-to-End Fund-Flow Review v1.2 — Accepted
- DEP-01 Deposit Execution / Inbound Receipt v1.2 — Accepted
- WDR-01 Withdrawal / Payout Execution Rail v1.2 — Accepted


## v1.1 Review Patch Summary

This v1.1 patch closes the Claude Opus initial review gaps:

1. Full-population coverage proof added:
   - SEC-01 expected-event manifest.
   - E2E-01 correlation registry.
   - monotonic per-module sequence coverage.
   - all-green requires proven complete population.
2. Consistent as-of snapshot model added:
   - shared LED journal or E2E saga sequence anchor.
   - consistent cut-off across source modules.
   - explicit in-flight / expected-open reconciling class.
3. External statement trust model added:
   - provider-identity-bound authenticated feed.
   - completeness across all safeguarding accounts.
   - freshness/as-of alignment.
   - ingestion SoD from reconciled functions.
4. REC self-integrity and independence added:
   - hash-chain and external anchor for runs/breaks/reports.
   - mandated-scope enforcement.
   - no selective scoping/blinding.
   - independent SoD for recon execution and safeguarding sign-off.
5. Closed-loop break remediation added:
   - high/critical closure requires clean re-reconciliation of that specific break.
   - recurrence detection.
   - false-positive independent sign-off.
   - repeated close/reopen senior escalation.
6. Materiality/tolerance policy added:
   - governed, versioned, approved.
   - zero-tolerance classes protected.
7. Severity mapping governance added.
8. Reconciliation rule-change control added.
9. Controlled report restatement workflow added.
10. Regulatory obligations/deadline tracking added.
11. New tests REC1-TC-039 to REC1-TC-081.

## v1.2 Final Rollup Summary

REC-01 v1.2 is a non-substantive final rollup after Claude Opus final verification.

Status:
- All 5 critical gaps resolved in v1.1.
- All 6 recommended corrections resolved in v1.1.
- v1.2 fixes cosmetic rollup items only.
- REC-01 is accepted / final verified.

Cosmetic fixes:
1. Updated `01_Module_Blueprint.md` Document Control pack version cell to v1.2.
2. Repinned baseline to accepted v1.2 clean rollups.
3. Added final accepted status note.

Control change from v1.1:
- None.

Accepted baseline:
- FND-01 Platform Foundation v1.2 — Accepted
- IAM-01 Authentication / MFA / Session v1.2 — Accepted
- IAM-02 RBAC / Permission Guard / SoD v1.2 — Accepted
- SEC-01 Audit Log / Security Monitoring v1.2 — Accepted
- CFG-01 Feature Flag / Licence Lock v1.2 — Accepted
- CLT-01 Client Onboarding / Client Profile v1.2 — Accepted
- KYC-01 KYC / KYB Verification v1.2 — Accepted
- AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening v1.2 — Accepted
- WLT-01 Wallet Screening / Payout Destination Whitelist v1.2 — Accepted
- LED-01 Ledger / Settlement / Safeguarding v1.2 — Accepted
- TRD-01 Quote / Trade / LP Execution v1.2 — Accepted
- E2E-01 Cross-Module End-to-End Fund-Flow Review v1.2 — Accepted
- DEP-01 Deposit Execution / Inbound Receipt v1.2 — Accepted
- WDR-01 Withdrawal / Payout Execution Rail v1.2 — Accepted
- REC-01 Reconciliation / Finance Reporting v1.2 — Accepted


Programme status:
- Core platform blueprint chain complete.
- Cross-module assurance layer complete.
- Inbound execution rail complete.
- Outbound execution rail complete.
- Reconciliation / finance assurance layer complete.

Next recommended module:
- INC-01 Incident / Freeze / Recovery.
