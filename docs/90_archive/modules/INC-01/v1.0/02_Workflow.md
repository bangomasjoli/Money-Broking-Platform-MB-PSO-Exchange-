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

1. Define freeze scope.
2. Identify affected modules.
3. Issue freeze/lock commands to CFG/IAM/CLT/AML/WLT/LED/DEP/WDR/TRD/REC as required.
4. Record propagation acknowledgements.
5. Retry/alert on missing acknowledgement.
6. Set freeze status.
7. Emit SEC-01 audit event.

### Rules

1. missing acknowledgement is a high/critical issue.
2. freeze scope must be explicit.
3. freeze release requires resume gate.

---

## 5. WF-INC01-04 Money-Flow Quiescence

### Steps

1. Query affected in-flight deposits, withdrawals, trades and ledger operations.
2. Classify each item by stage.
3. Stop new forward actions.
4. Cancel or pause reversible actions through owning module.
5. For irreversible actions, create exception/recovery item.
6. Record disposition for every in-flight item.
7. Notify REC-01 for targeted reconciliation.
8. Emit SEC-01 audit event.

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
2. Verify all in-flight items dispositioned.
3. Verify source modules confirm safe state.
4. Verify REC validation complete where required.
5. Verify SEC evidence complete.
6. Verify notifications complete or not required.
7. Obtain required approvals.
8. Release freeze through source modules.
9. Emit SEC-01 audit event.

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
