# PRT-01 Client / Staff / Admin Portal Workflows
## 13 Reconciliation Design

## 1. Purpose

PRT-01 does not perform financial reconciliation, but its displayed statuses and portal actions must reconcile to source modules and SEC audit.

## 2. Portal Reconciliation Checks

1. sensitive portal action has source module request.
2. portal displayed final status matches source module final status.
3. portal export has approval and audit event.
4. portal freeze denial corresponds to INC context/source denial.
5. portal message template version approved.
6. portal report display matches REC report status.
7. portal admin action has IAM approval/maker-checker.
8. no Exchange UI route exposed.
9. no portal source-truth financial data exists.
10. every sensitive view/action/export emits SEC audit.

## 3. Critical Breaks

1. status shown final before source finality.
2. export without approval/audit.
3. admin financial bypass.
4. Exchange route exposed.
5. AML tipping-off client message.
6. freeze ignored.

## 4. v1.1 Portal Reconciliation Strengthening

Additional REC/SEC checks:

1. displayed final status is never more favourable than current source status.
2. source status version/epoch was checked.
3. freeze/revocation/reversal/restatement overlay was applied.
4. object read had entitlement decision.
5. source call was re-scoped to end-user entitlement.
6. export used source-side masking and valid disclosure log.
7. export token was recipient-bound, single-use and unexpired.
8. quote acceptance matched server quote ID/hash/economics.
9. notification sent after reconcile-before-send.
10. sensitive action carried correlation ID to source and SEC.
11. missing source feed showed degraded/unavailable.
