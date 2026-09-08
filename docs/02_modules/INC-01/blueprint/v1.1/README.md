---
document_id: INC-01-BP-v1.1
title: INC-01 Blueprint Pack — Incident / Freeze / Recovery
version: v1.1
document_status: APPROVED
implementation_status: N/A
module: INC-01
control: Incident, freeze, recovery
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: v1.0 (archived)
baseline_commit: 780e116
---

# INC-01 Incident / Freeze / Recovery Blueprint Pack v1.1

## Module

INC-01 Incident / Freeze / Recovery

## Purpose

INC-01 owns incident intake, triage, freeze propagation, money-flow quiescence, incident command, controlled recovery, resume gates, post-incident evidence and regulatory/management reporting.

INC-01 is an operational control module. It does not post ledger, edit balances, execute payouts, approve deposits, override AML/WLT decisions, clear reconciliation breaks, or bypass licence locks. It coordinates incident response and recovery across accepted modules.

It answers:

```txt
When a security, AML, ledger, safeguarding, vendor, rail, operational, or licence incident occurs, can the platform stop unsafe forward actions, preserve evidence, protect client assets, recover safely, and resume only after controlled sign-off?
```

## Core Scope

1. Incident intake and classification.
2. Severity and materiality assessment.
3. Incident command / role assignment.
4. Freeze and kill-switch orchestration.
5. Cross-module freeze propagation.
6. In-flight money-flow quiescence.
7. Provider/vendor outage handling.
8. Security incident handling.
9. AML/sanctions incident handling.
10. Ledger/safeguarding incident handling.
11. Deposit/payout/trade incident handling.
12. Evidence preservation.
13. Client/management/regulator notification workflow.
14. Recovery plan and resume gate.
15. Post-incident reconciliation and root-cause analysis.
16. Lessons learned / control improvement tracking.
17. Audit and evidence pack.

## Strict Out of Scope

1. Ledger posting.
2. Balance editing.
3. Deposit crediting.
4. Payout execution.
5. Trade execution.
6. AML decision ownership.
7. Wallet decision ownership.
8. Reconciliation break closure.
9. Direct source data mutation.
10. Exchange order book / matching.
11. Principal dealing or AIX inventory.

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
- REC-01 Reconciliation / Finance Reporting v1.2 — Accepted


## v1.1 Review Patch Summary

This v1.1 patch closes the Claude Opus initial review gaps:

1. Atomic / ordered / verified freeze added:
   - exit points first, intake second.
   - stop-the-world barrier.
   - partial freeze fail-closed and broaden/escalate.
   - verified-effective freeze, not ack-only.
2. INC authority and abuse controls added:
   - maker-checker / SoD for freeze and resume.
   - separation between declare resolved and release freeze.
   - anti-suppression and anti-downgrade controls.
   - hash-chain and external anchor for INC records.
3. Degraded-mode model added:
   - SEC/IAM/CFG can be the incident.
   - out-of-band freeze path.
   - independent evidence capture where SEC is suspect.
   - bounded break-glass authority where IAM is unavailable/compromised.
4. Closed-loop money recovery added:
   - every incident-scoped in-flight item must reach terminal corrected state.
   - incident value position restored to zero or explicitly risk-accepted.
   - safeguarding proven intact before resume.
5. Freeze collateral / client-money-access consequence model added:
   - minimum-necessary scope.
   - time-bounded freeze.
   - periodic re-justification.
   - client-money-access denial tracked as consequence.
   - owed obligation interaction defined.
6. Freeze idempotency and overlapping/nested freeze reference counting added.
7. Auto-freeze for defined critical conditions added.
8. In-flight disposition bound to E2E saga compensation model.
9. Notification clock reconciled with REC-01 obligations.
10. Communication approval with tipping-off and market-sensitivity controls added.
11. Fail-closed default during freeze acknowledgement gap added.
12. New tests INC1-TC-037 to INC1-TC-083.
