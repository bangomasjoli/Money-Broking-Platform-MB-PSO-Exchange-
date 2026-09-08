# INC-01 Incident / Freeze / Recovery
## 02 Workflow

## 1. Workflow Scope

INC-01 workflows cover incident intake, severity classification, freeze propagation, in-flight money-flow quiescence, evidence preservation, notification tracking, recovery planning, resume gate, closure and post-incident review.

---

## 2. WF-INC01-01 Incident Intake

### Trigger

Manual report, SEC alert, REC break, source module alert, vendor outage or regulatory trigger.

### Steps

1. Create incident record.
2. Assign incident ID and correlation where available.
3. Record trigger source and payload hash.
4. Classify initial category and severity.
5. Assign incident owner/commander.
6. Preserve initial evidence.
7. Emit SEC-01 audit event.

---

## 3. WF-INC01-02 Severity Classification

### Steps

1. Evaluate affected modules.
2. Evaluate client money/asset impact.
3. Evaluate AML/sanctions impact.
4. Evaluate security/system impact.
5. Evaluate regulatory/reporting impact.
6. Set severity.
7. Determine required roles and sign-offs.
8. Emit SEC-01 audit event.

---

## 4. WF-INC01-03 Freeze Propagation

### Trigger

Incident requires freeze/quiescence.

### Steps

1. Define minimum necessary freeze scope.
2. Identify affected modules and exit-point priority.
3. Create freeze barrier for affected scope.
4. Fail-closed affected money movement during propagation.
5. Issue freeze/lock commands in ordered sequence: WDR/TRD/LED/DEP exit gates before intake.
6. Record propagation acknowledgements.
7. Verify effectiveness proof from each module.
8. If any module fails or times out, broaden/escalate/fail-closed.
9. Set freeze status only when effectiveness proof passes.
10. Emit SEC-01 audit event.

### Rules

1. missing acknowledgement is a high/critical issue.
2. freeze scope must be explicit.
3. freeze release requires resume gate.

---

## 5. WF-INC01-04 Money-Flow Quiescence

### Steps

1. Query affected in-flight deposits, withdrawals, trades and ledger operations.
2. Classify each item by stage.
3. Bind each item to E2E saga/compensation state.
4. Stop new forward actions.
5. Cancel or pause reversible actions through owning module.
6. For irreversible actions, create exception/recovery item.
7. Record terminal corrected disposition target for every in-flight item.
8. Notify REC-01 for targeted reconciliation.
9. Emit SEC-01 audit event.

---

## 6. WF-INC01-05 Evidence Preservation

### Steps

1. Capture source records and references.
2. Capture audit events.
3. Capture provider/vendor evidence.
4. Capture affected clients/correlations.
5. Hash-link evidence.
6. Restrict access.
7. Record chain of custody.
8. Emit SEC-01 audit event.

---

## 7. WF-INC01-06 Notification Obligation

### Steps

1. Determine notification requirement by severity/category.
2. Create obligation record.
3. Track deadline.
4. Draft notification.
5. Review/approve.
6. Submit or mark not required with reason.
7. Store acknowledgement.
8. Escalate late/at-risk notification.
9. Emit SEC-01 audit event.

---

## 8. WF-INC01-07 Recovery Plan

### Steps

1. Identify root cause and scope.
2. Define remediation actions.
3. Define validation tests.
4. Define REC reconciliation requirements.
5. Define residual risk.
6. Obtain required approvals.
7. Execute remediation in source modules.
8. Preserve evidence.
9. Emit SEC-01 audit event.

---

## 9. WF-INC01-08 Resume Gate

### Steps

1. Verify freeze reason resolved or risk accepted.
2. Verify all in-flight items reached terminal corrected disposition.
3. Verify incident value position restored to zero or formally accepted.
4. Verify safeguarding intact.
5. Verify source modules confirm safe state.
6. Verify REC validation passed for incident scope.
7. Verify SEC or independent evidence complete.
8. Verify notifications complete or not required.
9. Verify freeze collateral/client-access consequence reviewed.
10. Obtain independent approvals.
11. Release freeze through source modules using freeze-hold registry.
12. Emit SEC-01 audit event.

---

## 10. WF-INC01-09 Incident Closure

### Steps

1. Verify evidence pack complete.
2. Verify recovery plan complete.
3. Verify resume gate complete or incident remains contained.
4. Verify post-incident review complete for high/critical.
5. Verify remediation actions tracked.
6. Obtain closure sign-offs.
7. Close incident.
8. Emit SEC-01 audit event.

---

## 11. WF-INC01-10 Post-Incident Review

### Steps

1. Build incident timeline.
2. Document root cause.
3. Document control failures.
4. Document client/financial/regulatory impact.
5. Define action items.
6. Assign owners and due dates.
7. Track action completion.
8. Management review for high/critical.
9. Emit SEC-01 audit event.

---

## 12. WF-INC01-11 Auto-Freeze

### Trigger

Defined critical condition detected.

### Steps

1. Detect auto-freeze condition.
2. Create incident automatically.
3. Apply predefined minimum necessary scope.
4. Execute atomic verified freeze immediately.
5. Assign incident command team.
6. Notify required roles.
7. Emit SEC-01 audit event.

---

## 13. WF-INC01-12 Degraded-Mode Operation

### Trigger

SEC/IAM/CFG is unavailable, compromised or suspected.

### Steps

1. Activate degraded-mode incident.
2. Determine compromised dependency.
3. Use out-of-band freeze path if CFG/IAM path cannot be trusted.
4. Use independent evidence collector if SEC evidence suspect.
5. Use bounded break-glass authority only for freeze/containment, not resume.
6. Reconcile degraded actions back to SEC and REC once restored.
7. Emit/anchor evidence through independent channel.

---

## 14. WF-INC01-13 Freeze Extension / Re-Justification

### Trigger

Freeze nears duration SLA or scope remains frozen beyond approved period.

### Steps

1. Review continued necessity.
2. Assess client-money-access denial.
3. Narrow scope where possible.
4. Obtain escalation approval for extension.
5. Update notification obligations.
6. Emit SEC-01 audit event.

---

## 15. WF-INC01-14 Communications Approval

### Trigger

Client/staff/vendor/regulator/public communication required.

### Steps

1. Draft communication.
2. Check AML tipping-off risk.
3. Check security/market sensitivity.
4. Route to Compliance/Security/Management approval as required.
5. Store final version hash.
6. Record recipient/submission/acknowledgement.
7. Emit SEC-01 audit event.
