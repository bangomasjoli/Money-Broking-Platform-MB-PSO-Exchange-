# INC-01 Incident / Freeze / Recovery
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | INC-01 |
| Module name | Incident / Freeze / Recovery |
| Pack version | v1.0 |
| Status | Initial module blueprint for Claude Opus review |
| Platform | AIX Money Broking + PSO Platform |
| Licence posture | Money Broking and PSO approved; Exchange pending |
| Module category | Operational Resilience / Incident Control |
| Depends on | FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2, SEC-01 v1.2, CFG-01 v1.2, CLT-01 v1.2, KYC-01 v1.2, AML-01 v1.2, WLT-01 v1.2, LED-01 v1.2, TRD-01 v1.2, E2E-01 v1.2, DEP-01 v1.2, WDR-01 v1.2, REC-01 v1.2 |
| Provides outcome to | Management, Compliance, Security, Finance, Operations, E2E Saga, REC-01, SEC-01 |

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


---

## 2. Module Purpose

INC-01 coordinates incident response, freeze propagation, money-flow quiescence, evidence preservation and controlled recovery across the platform.

It is the operational counterpart to the E2E-01 freeze and recovery model. It ensures unsafe forward actions stop, in-flight money movements are classified, irreversible steps are controlled, and resume is allowed only after required evidence, remediation and sign-off.

---

## 3. In Scope

INC-01 covers:

1. incident creation from alert/manual/source-module trigger.
2. incident severity classification.
3. incident command assignment.
4. incident category and impact assessment.
5. freeze scope definition.
6. CFG-01 kill-switch / feature-lock orchestration.
7. CLT client/account freeze coordination.
8. IAM access/session freeze coordination.
9. AML/WLT revocation incident coordination.
10. LED ledger/safeguarding incident coordination.
11. DEP deposit incident coordination.
12. WDR payout incident coordination.
13. TRD trading/LP incident coordination.
14. SEC audit/security incident coordination.
15. REC reconciliation-break incident coordination.
16. vendor/provider outage incident.
17. in-flight money-flow quiescence.
18. irreversible-leg handling.
19. evidence preservation.
20. regulatory/management notification workflow.
21. recovery plan.
22. recovery testing/validation.
23. resume gate.
24. post-incident review.
25. lessons learned/control action tracking.

---

## 4. Out of Scope

INC-01 does not implement:

1. ledger posting.
2. balance editing.
3. direct reversal/clawback posting.
4. deposit crediting.
5. payout execution.
6. trade/LP execution.
7. AML/sanctions decision.
8. wallet screening decision.
9. reconciliation break closure.
10. source data mutation.
11. Exchange order book.
12. matching engine.
13. market making.
14. principal dealing.
15. AIX spread markup.

---

## 5. Critical Principles

### 5.1 Incident Command and Control

Every material incident must have a command structure.

Required roles:

1. incident owner.
2. incident commander.
3. operations lead.
4. compliance/MLRO lead where AML/regulatory impact exists.
5. finance lead where client money/assets impacted.
6. security lead where security/system issue exists.
7. technology/vendor lead where IT/vendor issue exists.
8. management approver for major/critical incidents.

Rules:

1. single incident owner accountable.
2. severity determines required role set.
3. high/critical incident cannot be closed without required sign-off.
4. role assignment and changes are audited.

### 5.2 Incident Severity

Severity levels:

1. Low.
2. Medium.
3. High.
4. Critical.

Critical incidents include:

1. client asset/liability mismatch or safeguarding deficit.
2. ledger hash-chain mismatch.
3. unauthorised ledger/balance edit attempt.
4. payout sent without reserve or wrong beneficiary.
5. deposit credited without valid receipt/screening/finality.
6. client fill without LP fill.
7. sanctions/AML hit after money movement.
8. provider compromise or fabricated receipt/instruction.
9. security compromise affecting privileged access.
10. Exchange feature activation path.
11. audit-log tampering or missing critical audit events.
12. regulator-reporting deadline breach with material impact.

### 5.3 Freeze Scope

Freeze may apply to:

1. platform-wide.
2. module-specific.
3. client-specific.
4. asset/currency-specific.
5. rail/provider-specific.
6. destination/source-specific.
7. role/user/session-specific.
8. correlation/saga-specific.

Rules:

1. freeze scope must be explicit.
2. freeze propagation must be recorded.
3. freeze cannot be silently bypassed.
4. false or overly broad freeze is handled through controlled release.

### 5.4 Freeze Propagation

INC-01 coordinates freeze propagation to:

1. CFG-01 feature/kill-switch.
2. IAM-01 session/access controls.
3. IAM-02 permission/SoD controls.
4. CLT-01 client/account status.
5. AML-01 decision/revocation status.
6. WLT-01 source/destination status.
7. LED-01 reserve/ledger/settlement gating.
8. DEP-01 deposit credit gate.
9. WDR-01 payout send gate.
10. TRD-01 quote/trade/LP execution gate.
11. REC-01 close/report/break escalation.
12. SEC-01 audit/security monitoring.

### 5.5 Money-Flow Quiescence

When money-flow incident occurs, INC-01 must classify in-flight items by stage.

Stages:

1. before hold/reserve.
2. hold/reserve placed but not externally executed.
3. external instruction sent but not final.
4. externally final/irreversible.
5. reversal/return/clawback pending.
6. ledger settlement complete.
7. client-facing status published.

Rules:

1. stop new forward actions.
2. cancel/release only through owning module.
3. never release reserve locally.
4. never edit ledger locally.
5. irreversible stage requires exception/recovery path.
6. every in-flight item gets disposition.

### 5.6 Point of No Return

INC-01 must respect point-of-no-return boundaries.

Examples:

1. WDR provider send after point-of-no-return.
2. TRD LP execution accepted/final.
3. DEP confirmed external receipt after reversal risk evaluation.
4. LED journal posted and immutable.
5. external bank/custodian/chain finality.

Rules:

1. do not claim cancellation where irreversible execution happened.
2. do not hide executed-late status.
3. do not reverse via direct edit.
4. use source-module recovery path.

### 5.7 Evidence Preservation

Incident evidence must be preserved immediately.

Evidence includes:

1. incident trigger.
2. alert payload.
3. audit events.
4. affected correlation IDs.
5. affected client IDs.
6. source module records.
7. external provider evidence.
8. screenshots/log extracts where needed.
9. decision and approval trail.
10. communication trail.
11. remediation evidence.
12. recovery validation evidence.

Rules:

1. evidence pack is hash-linked.
2. critical evidence is immutable.
3. access is restricted.
4. evidence export requires approval.
5. chain of custody is audited.

### 5.8 Recovery Plan

Every high/critical incident requires a recovery plan.

Recovery plan must define:

1. scope to recover.
2. root cause summary.
3. impacted clients/assets/modules.
4. remediation actions.
5. validation tests.
6. reconciliation requirements.
7. communication requirements.
8. regulatory/management notification requirements.
9. residual risk.
10. resume gate criteria.

### 5.9 Resume Gate

No frozen scope may resume until required gates pass.

Resume gate requires:

1. freeze reason resolved or risk accepted.
2. source modules confirm safe state.
3. REC-01 reconciliation or targeted validation complete where money affected.
4. SEC-01 audit evidence complete.
5. finance/compliance/security sign-off as required.
6. management sign-off for critical incidents.
7. residual risk accepted.
8. communication plan complete.

### 5.10 Regulatory and Management Notification

INC-01 must track notification obligations.

Rules:

1. incident severity and category determine notification requirement.
2. notification clock starts from detection/escalation according to policy.
3. required content and recipient tracked.
4. draft/review/submission/acknowledgement retained.
5. late or missed notification escalates.

### 5.11 Post-Incident Review

After incident closure, INC-01 must require:

1. root cause analysis.
2. timeline.
3. impact analysis.
4. control failures.
5. remediation actions.
6. recurrence prevention.
7. owner and due date for actions.
8. management approval for high/critical incidents.

### 5.12 No Bypass / No Source Mutation

INC-01 cannot bypass controls to recover faster.

Prohibited:

1. direct ledger edit.
2. direct balance edit.
3. payout outside WDR controls.
4. credit outside DEP/LED controls.
5. trade correction outside TRD/LED controls.
6. AML/WLT override without owning-module decision.
7. deleting audit logs.
8. clearing REC breaks.
9. enabling Exchange features.

### 5.13 Client Status Truthfulness

Client/staff visible status must reflect actual incident and money-flow state.

Rules:

1. no false "completed" where incident unresolved.
2. no false "cancelled" where external execution occurred.
3. client communication must be approved for material incidents.
4. status correction is audit logged.

### 5.14 Incident Closure

Incident closure requires:

1. all required evidence attached.
2. all material in-flight items dispositioned.
3. required reconciliation complete.
4. required notifications complete or formally not required.
5. recovery/resume decision documented.
6. residual action owners assigned.
7. required sign-offs completed.
8. closure audit event.

---

## 6. Actors

| Actor | Role |
|---|---|
| Incident Reporter | Raises incident |
| Incident Commander | Leads response |
| Operations Lead | Coordinates operations actions |
| Compliance / MLRO Lead | AML/regulatory decision support |
| Finance Lead | Client money/assets impact |
| Security Lead | Security incident response |
| Technology Lead | System/vendor remediation |
| Management Approver | Critical incident approval |
| REC-01 Service | Reconciliation/break evidence |
| SEC-01 Service | Audit/security evidence |
| CFG-01 Service | Kill-switch/feature lock |
| IAM-01/IAM-02 Services | Access/session/permission freeze |
| LED-01 Service | Ledger/reserve/settlement controls |
| DEP-01 Service | Deposit in-flight state |
| WDR-01 Service | Payout in-flight state |
| TRD-01 Service | Trade/LP in-flight state |
| AML-01/WLT-01 Services | Screening/revocation evidence |

---

## 7. Dependencies

### 7.1 Upstream

1. SEC-01 alerts/audit events.
2. REC-01 breaks.
3. LED-01 safeguarding/ledger alerts.
4. DEP-01 deposit incident signals.
5. WDR-01 payout incident signals.
6. TRD-01 trade/LP incident signals.
7. AML-01 sanctions/revocation alerts.
8. WLT-01 source/destination risk alerts.
9. CFG-01 licence/feature state.
10. IAM privileged access/session data.
11. External vendor/provider alerts.

### 7.2 Downstream

1. CFG-01 kill-switch / feature lock.
2. IAM session/access freeze.
3. CLT client/account restriction.
4. AML/WLT revocation coordination.
5. LED reserve/settlement gating.
6. DEP deposit gate.
7. WDR payout gate.
8. TRD execution gate.
9. REC validation.
10. SEC evidence and alerting.
11. Management/regulatory reporting.

---

## 8. Components

| Component | Description |
|---|---|
| Incident Intake Service | Creates incidents from alerts/manual/source triggers |
| Severity Classification Engine | Determines severity/category |
| Incident Command Service | Assigns roles and owners |
| Freeze Scope Engine | Determines freeze scope |
| Freeze Propagation Orchestrator | Sends freeze commands to modules |
| Quiescence Manager | Tracks and stops in-flight money-flow actions |
| Point-of-No-Return Classifier | Classifies irreversible stages |
| Evidence Preservation Service | Builds hash-linked evidence |
| Notification Obligation Tracker | Tracks management/regulatory deadlines |
| Recovery Plan Service | Defines remediation/recovery |
| Resume Gate Controller | Controls restart/release |
| Post-Incident Review Service | RCA and lessons learned |
| Action Tracker | Tracks remediation actions |
| Communication Log Service | Records internal/client/regulator communications |
| Incident Dashboard | Management view |
| SEC Audit Adapter | Emits and retrieves audit events |
| REC Validation Adapter | Requests targeted recon/validation |

---

## 9. Functional Requirements

### INC1-FR-001 Incident Intake

The platform shall create incidents from manual input, alerts or source-module triggers.

### INC1-FR-002 Severity Classification

The platform shall classify incident severity and category.

### INC1-FR-003 Incident Command

The platform shall assign incident roles and owner.

### INC1-FR-004 Freeze Scope

The platform shall define freeze scope.

### INC1-FR-005 Freeze Propagation

The platform shall propagate freezes to relevant modules.

### INC1-FR-006 Money-Flow Quiescence

The platform shall classify and disposition in-flight money-flow items.

### INC1-FR-007 Point-of-No-Return

The platform shall identify irreversible stages and enforce recovery path.

### INC1-FR-008 Evidence Preservation

The platform shall preserve hash-linked incident evidence.

### INC1-FR-009 Notification Obligation

The platform shall track management/regulatory/client notification obligations.

### INC1-FR-010 Recovery Plan

The platform shall require recovery plan for high/critical incidents.

### INC1-FR-011 Resume Gate

The platform shall enforce resume gate before freeze release.

### INC1-FR-012 Post-Incident Review

The platform shall require post-incident review for high/critical incidents.

### INC1-FR-013 Remediation Action Tracking

The platform shall track remediation actions and due dates.

### INC1-FR-014 No Source Mutation

The platform shall prohibit INC from mutating source-of-truth records.

### INC1-FR-015 Status Truthfulness

The platform shall ensure client/staff status reflects true incident and money-flow state.

### INC1-FR-016 Incident Closure

The platform shall require evidence, disposition, notification and sign-off before closure.

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Freeze propagation | Near real-time / fail-closed |
| Evidence integrity | Hash-linked |
| Audit | SEC-01 integrated |
| Ledger mutation | Prohibited |
| Balance edit | Prohibited |
| Source mutation | Prohibited |
| In-flight disposition | Required |
| Critical closure sign-off | Required |
| Resume gate | Required |
| Regulatory tracking | Required |
| Test coverage | Critical controls 100% |

---

## 11. Prohibited Behaviours

INC-01 must not allow:

1. direct ledger posting.
2. direct balance editing.
3. direct reserve release.
4. direct payout execution.
5. direct deposit credit.
6. direct trade correction.
7. AML/WLT override outside owning module.
8. deleting audit evidence.
9. altering REC break status.
10. unlogged freeze release.
11. resume without resume gate.
12. critical incident closure without required sign-off.
13. closure without in-flight disposition.
14. closure without evidence pack.
15. false "cancelled" for executed-late payout.
16. false "complete" for unresolved incident.
17. bypass CFG kill-switch.
18. bypass IAM access freeze.
19. bypass LED settlement gate.
20. bypass WDR/DEP/TRD gates.
21. hiding regulatory notification requirement.
22. notification deadline missed without escalation.
23. evidence export without approval.
24. Exchange order book activation.
25. principal dealing / AIX inventory.
26. AIX spread markup.

---

## 12. Acceptance Criteria

INC-01 is accepted only if:

1. Incident intake defined.
2. Severity classification defined.
3. Incident command defined.
4. Freeze scope defined.
5. Freeze propagation defined.
6. Money-flow quiescence defined.
7. Point-of-no-return classification defined.
8. Evidence preservation defined.
9. Notification obligation tracker defined.
10. Recovery plan defined.
11. Resume gate defined.
12. Post-incident review defined.
13. Remediation action tracking defined.
14. No source mutation defined.
15. Status truthfulness defined.
16. Incident closure controls defined.
17. Tests defined and passed.

---

## 13. Open Items

1. Final incident severity matrix.
2. Final regulatory notification timeframes.
3. Final management escalation matrix.
4. Final client communication templates.
5. Final vendor escalation contacts.
6. Final freeze SLA.
7. Final resume gate approval matrix.
8. Final incident retention schedule.
9. Final incident dashboard KPIs.
10. Final regulator evidence format.
