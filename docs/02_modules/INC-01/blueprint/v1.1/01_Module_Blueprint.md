# INC-01 Incident / Freeze / Recovery
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | INC-01 |
| Module name | Incident / Freeze / Recovery |
| Pack version | v1.0 |
| Status | Revised after Claude Opus review; atomic verified freeze, INC authority governance, degraded-mode, closed-loop recovery and freeze-collateral controls added |
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


### 5.15 Atomic / Ordered / Verified Freeze

Freeze is not considered effective merely because a module acknowledged a command.

Rules:

1. freeze ordering is exit-points first:
   - WDR provider send gates.
   - TRD LP execution gates.
   - LED settlement/reserve gates.
   - DEP credit gates.
   - then intake/client-facing actions.
2. freeze starts with a stop-the-world barrier for the affected scope.
3. while freeze is `propagating`, affected money movement is denied-by-default.
4. every in-scope module must confirm both acknowledgement and effectiveness.
5. effective means the relevant action gate is actively denying forward action for the scope.
6. partial freeze escalates, broadens or fails closed.
7. missing acknowledgement/effectiveness proof within SLA is high/critical.
8. contained status is prohibited until effective-freeze proof passes.

Parameters:

```txt
freeze_ordering      = exit_points_first_then_intake
freeze_barrier       = stop_the_world_before_per_module_confirm
partial_freeze       = fail_closed_escalate_or_broaden
freeze_effectiveness = verified_not_just_acknowledged
ack_gap_default      = fail_closed_deny_by_default
```

### 5.16 INC Authority, Abuse Control and Record Integrity

INC-01 controls the highest-authority operational actions and must itself be governed.

Rules:

1. platform-wide freeze requires IAM-02 maker-checker unless auto-freeze condition applies.
2. resume authority is separated from declare-resolved authority.
3. freeze release requires independent approval.
4. severity downgrade requires maker-checker and reason.
5. failure to raise an incident after qualifying alert creates anti-suppression alert.
6. incident, freeze, evidence, resume and closure records are hash-chained.
7. high/critical incident records are externally anchored to SEC-01 or approved evidence store.
8. INC privileged actions are always audited.

Parameters:

```txt
freeze_authority     = iam2_maker_checker_sod
resume_authority     = separated_from_declare_resolved
anti_suppression     = non_raise_and_downgrade_audited_alerted
inc_record_integrity = hash_chain + external_anchor
```

### 5.17 Degraded-Mode / Self-Referential Failure

SEC-01, IAM-01/IAM-02 or CFG-01 may themselves be the incident.

Rules:

1. if CFG is suspect, INC must support out-of-band freeze instruction path.
2. if IAM is unavailable/compromised, bounded break-glass authority may trigger freeze with ceiling and post-fact review.
3. if SEC is suspect, independent evidence capture is used.
4. degraded-mode activation requires dual control where possible.
5. degraded-mode actions are time-bounded and later reconciled to SEC once trustworthy.
6. degraded-mode cannot enable source mutation or ledger/balance edits.
7. break-glass cannot resume platform without standard resume gate.

Parameters:

```txt
dependency_incident   = sec_iam_cfg_can_be_the_incident
out_of_band_freeze    = available_when_cfg_or_iam_compromised
independent_evidence  = when_sec_suspect
break_glass_authority = bounded_ceiling_when_iam_down
```

### 5.18 Closed-Loop Money Recovery

Resume requires proof that incident-scoped money damage is corrected or formally risk-accepted with safeguarding intact.

Rules:

1. every incident-scoped in-flight item must reach terminal corrected disposition.
2. terminal corrected disposition is owned by source module, not INC.
3. REC-01 targeted validation must prove incident-scoped value position.
4. safeguarding must be intact before resume.
5. open value-conservation or safeguarding deficit blocks resume unless formally risk-accepted by required authority.
6. executed-late, orphaned reserve, half-settled DvP, stuck deposit and returned payout each require source-module recovery evidence.
7. "REC ran" is not enough; REC validation must pass for the incident scope.

Parameters:

```txt
resume_requires         = every_inflight_item_terminal_corrected
incident_value_position = restored_to_zero_or_explicitly_accepted
safeguarding_after      = intact_proven_before_resume
```

### 5.19 Freeze Collateral / Client-Money-Access Consequence

Freeze can create client detriment by restricting access to safeguarded funds.

Rules:

1. freeze scope must be minimum necessary to contain the incident.
2. broad freeze requires justification.
3. freeze duration is time-bounded.
4. periodic re-justification is required.
5. extension requires escalating approval.
6. client-money-access denial is tracked as incident consequence.
7. notification/obligation rules consider access denial.
8. already-owed obligations are classified:
   - may proceed safely.
   - pause lawfully.
   - cannot proceed because unsafe.
   - requires client/regulator/management communication.
9. freeze must not hide the platform's obligation to clients.

Parameters:

```txt
freeze_scope                 = minimum_necessary_to_contain
freeze_duration              = time_bounded_periodic_re_justification
client_money_access_denial   = tracked_consequence_with_notification
owed_obligation_interaction  = defined
```

### 5.20 Freeze Idempotency and Overlapping / Nested Freezes

Freeze scopes may overlap across incidents.

Rules:

1. freeze order is idempotent by incident + scope + freeze type.
2. overlapping freeze holds are reference-counted.
3. releasing one incident's freeze cannot release a scope still frozen by another incident.
4. freeze release requires all active holds to be cleared or narrowed.
5. nested freezes are visible in the incident dashboard.

Parameters:

```txt
freeze_idempotency = reference_counted_overlapping_freezes
```

### 5.21 Auto-Freeze Critical Conditions

Certain conditions require immediate auto-freeze before human command is fully assembled.

Auto-freeze conditions include:

1. safeguarding deficit.
2. ledger hash-chain mismatch.
3. payout sent without reserve.
4. sanctions hit after movement.
5. privileged access compromise affecting money functions.
6. provider compromise for deposit/payout rail.
7. Exchange runtime feature path.
8. audit tampering for money movement.

Rules:

1. auto-freeze has predefined scope.
2. auto-freeze creates incident automatically.
3. human command team is assigned after containment starts.
4. auto-freeze remains subject to resume gate.

Parameters:

```txt
auto_freeze = defined_critical_conditions
```

### 5.22 E2E Saga Compensation Binding

INC in-flight disposition must drive the E2E-01 saga compensation model.

Rules:

1. every incident-scoped correlation maps to E2E saga.
2. disposition updates saga state.
3. compensation action is owned by source module.
4. INC cannot create a parallel recovery path conflicting with E2E.
5. saga state must be reconciled before resume.

Parameters:

```txt
inflight_disposition = drives_e2e_saga_compensation
```

### 5.23 Notification Clock and REC Obligation Alignment

Notification clocks must be precise and de-duplicated with REC-01.

Rules:

1. notification clock starts at detection time unless regulation/policy defines stricter trigger.
2. obligation is linked to REC-01 regulatory obligation tracker where applicable.
3. duplicate/conflicting obligations are reconciled.
4. late/at-risk obligations escalate.
5. submission hash and acknowledgement retained.

Parameters:

```txt
notification_clock = detection_time_reconciled_with_rec
```

### 5.24 Communications Approval / Tipping-Off / Sensitivity

Incident communication must respect AML tipping-off and security/market sensitivity.

Rules:

1. client communication involving suspected AML subject requires Compliance/MLRO approval.
2. do not disclose investigation details that may constitute tipping-off.
3. security incident disclosures route through Security and Compliance.
4. external statements must be approved and versioned.
5. staff scripts must match client-status truth.

Parameters:

```txt
comms_approval = tipping_off_and_market_sensitivity_via_compliance
```

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
| Atomic Freeze Barrier Service | Stop-the-world barrier and ordered freeze |
| Freeze Effectiveness Verifier | Verifies freeze effective, not ack-only |
| Freeze Hold Registry | Reference-counted overlapping freezes |
| Auto-Freeze Trigger Service | Immediate freeze for critical conditions |
| INC Integrity Anchor Service | Hash-chain/external anchor for INC records |
| Anti-Suppression Monitor | Detects non-raising/downgrade abuse |
| Degraded-Mode Controller | Out-of-band freeze/evidence/break-glass |
| Independent Evidence Collector | Evidence capture when SEC is suspect |
| Money Recovery Verification Service | Terminal corrected disposition and value proof |
| Freeze Collateral Tracker | Tracks client-money access denial |
| E2E Compensation Adapter | Drives E2E saga compensation |
| Notification Clock Reconciler | Aligns INC notifications with REC obligations |
| Communications Approval Controller | Tipping-off/security sensitivity approval |

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

### INC1-FR-017 Atomic Verified Freeze

The platform shall enforce ordered, barrier-based, verified-effective freeze.

### INC1-FR-018 Freeze Fail-Closed Ack Gap

The platform shall deny affected money movement during freeze propagation until effective proof.

### INC1-FR-019 Freeze Authority Governance

The platform shall enforce maker-checker/SoD over freeze and resume.

### INC1-FR-020 Anti-Suppression / Anti-Downgrade

The platform shall audit and alert on incident non-raising and severity downgrade.

### INC1-FR-021 INC Record Integrity

The platform shall hash-chain and externally anchor high/critical INC records.

### INC1-FR-022 Degraded Mode

The platform shall support out-of-band freeze, independent evidence and bounded break-glass.

### INC1-FR-023 Closed-Loop Money Recovery

The platform shall require every incident-scoped money item to reach terminal corrected disposition before resume.

### INC1-FR-024 Safeguarding Recovery Proof

The platform shall require incident-scoped value/safeguarding position proof before resume.

### INC1-FR-025 Freeze Collateral Tracking

The platform shall track client-money-access denial and related obligations.

### INC1-FR-026 Minimum Scope / Time-Bound Freeze

The platform shall enforce minimum necessary scope, time-bounding and periodic re-justification.

### INC1-FR-027 Freeze Idempotency

The platform shall support overlapping/nested reference-counted freezes.

### INC1-FR-028 Auto-Freeze

The platform shall auto-freeze defined critical conditions.

### INC1-FR-029 E2E Saga Compensation Binding

The platform shall bind in-flight disposition to E2E saga compensation.

### INC1-FR-030 Notification Clock Alignment

The platform shall align notification clocks with REC obligation tracking.

### INC1-FR-031 Communications Approval

The platform shall route incident communications through tipping-off/security/market-sensitivity approval.

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
| Freeze ordering | Exit-points first |
| Freeze barrier | Stop-the-world |
| Freeze effectiveness | Verified, not ack-only |
| Ack gap default | Fail-closed |
| Freeze/resume authority | Maker-checker/SoD |
| INC record integrity | Hash-chain + anchor |
| Degraded mode | Out-of-band path |
| Money recovery | Terminal corrected state |
| Safeguarding recovery | Proven before resume |
| Freeze collateral | Client-access denial tracked |
| Freeze duration | Time-bounded |
| Overlapping freeze | Reference counted |
| Auto-freeze | Critical conditions |
| E2E compensation | Bound |
| Notification clock | Detection time / REC aligned |
| Comms approval | Tipping-off/sensitivity |
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
27. contained status based on acknowledgement only.
28. money movement allowed during freeze propagation gap.
29. partial freeze treated as contained.
30. freeze release by same actor who declared resolved without independent approval.
31. severity downgrade without maker-checker/audit.
32. qualifying alert suppressed without incident.
33. INC record hash-chain disabled.
34. standard IAM/CFG/SEC dependency assumed trustworthy during dependency incident.
35. break-glass used for resume.
36. resume before every in-flight item terminal corrected.
37. resume with unresolved incident-scoped safeguarding deficit.
38. freeze scope broader than necessary without justification.
39. freeze extended beyond SLA without re-justification.
40. client-money-access denial ignored.
41. releasing one freeze while overlapping freeze still active.
42. auto-freeze condition waits for manual approval before containment.
43. INC recovery path conflicts with E2E saga compensation.
44. notification clock altered away from detection time without policy.
45. client communication creates AML tipping-off risk.
46. external communication bypasses Compliance/Security approval.

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
17. Atomic verified freeze defined.
18. Freeze fail-closed ack gap defined.
19. Freeze/resume authority governance defined.
20. Anti-suppression/anti-downgrade defined.
21. INC record integrity defined.
22. Degraded-mode/out-of-band path defined.
23. Closed-loop money recovery defined.
24. Safeguarding recovery proof defined.
25. Freeze collateral/client-money-access tracking defined.
26. Minimum scope/time-bound freeze defined.
27. Freeze idempotency/reference counting defined.
28. Auto-freeze conditions defined.
29. E2E saga compensation binding defined.
30. Notification clock alignment defined.
31. Communication approval controls defined.
32. Tests defined and passed.

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
