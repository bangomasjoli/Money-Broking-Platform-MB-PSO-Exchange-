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
