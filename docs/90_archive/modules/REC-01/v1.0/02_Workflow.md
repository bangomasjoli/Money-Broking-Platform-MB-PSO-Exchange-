# REC-01 Reconciliation / Finance Reporting
## 02 Workflow

## 1. Workflow Scope

REC-01 workflows cover scheduled/on-demand reconciliation runs, source snapshots, break creation, break investigation, break closure, daily close, safeguarding reporting, finance reporting, evidence pack generation and controlled export.

---

## 2. WF-REC01-01 Scheduled Reconciliation Run

### Trigger

Configured schedule, daily close, or authorised manual run.

### Steps

1. Verify REC job schedule and CFG feature state.
2. Create reconciliation run ID.
3. Define scope, period, source modules and rule set.
4. Capture source data snapshots.
5. Hash input datasets.
6. Run reconciliation rules.
7. Create breaks for mismatches.
8. Hash output result.
9. Emit SEC-01 audit event.
10. Publish run status.

### Rules

1. Rerun creates new run ID.
2. Prior run is not overwritten.
3. Source data is read-only.
4. Critical run failure escalates.

---

## 3. WF-REC01-02 Source Data Snapshot

### Steps

1. Query source module data by period/correlation.
2. Store source module version and extract timestamp.
3. Store input hash.
4. Record source completeness status.
5. Flag missing/unavailable source.
6. Emit SEC-01 audit event.

---

## 4. WF-REC01-03 Break Creation

### Trigger

Reconciliation mismatch or missing data detected.

### Steps

1. Create immutable break record.
2. Assign severity using severity engine.
3. Link affected source records.
4. Link correlation/saga where available.
5. Assign owner by break type.
6. Set SLA due date.
7. Notify Finance/Ops/Compliance/Security where required.
8. Emit SEC-01 audit event.

---

## 5. WF-REC01-04 Break Investigation

### Steps

1. Owner reviews break.
2. Attach investigation notes.
3. Link source module remediation case.
4. Upload or link evidence.
5. Escalate if SLA breached.
6. Emit SEC-01 audit event.

### Rules

1. Investigation notes do not alter source records.
2. Evidence attachment is audit logged.
3. Source module remediation must occur in source module.

---

## 6. WF-REC01-05 Break Closure

### Steps

1. Closure request submitted.
2. Verify remediation evidence.
3. Verify source data rerun or targeted validation.
4. Apply maker-checker for high/critical break.
5. Enforce SoD.
6. Mark break resolved/accepted/false-positive according to policy.
7. Emit SEC-01 audit event.

### Rules

1. Critical break cannot auto-clear.
2. Closure without evidence blocked.
3. Same user cannot create and approve high/critical closure.

---

## 7. WF-REC01-06 Daily Close

### Steps

1. Run required reconciliation suite.
2. Verify LED journal/hash-chain status.
3. Verify safeguarding report.
4. Verify deposit/withdrawal/trade/fee reports.
5. Review open breaks.
6. Escalate unresolved critical breaks.
7. Finance sign-off.
8. Compliance/Security sign-off where required.
9. Generate close pack.
10. Emit SEC-01 audit event.

### Close Blocks

1. unresolved unapproved critical break.
2. safeguarding deficit.
3. ledger hash-chain mismatch.
4. missing external statement.
5. missing SEC critical event.
6. unapproved manual adjustment.

---

## 8. WF-REC01-07 Safeguarding Report

### Steps

1. Load client liabilities by asset/currency from LED.
2. Load safeguarded external balances.
3. Load free/encumbered backing.
4. Load holds/reserves/pending deposits/pending withdrawals.
5. Calculate surplus/deficit.
6. Link external statement evidence.
7. Create report.
8. Emit SEC-01 audit event.

---

## 9. WF-REC01-08 Evidence Pack Generation

### Steps

1. Select correlation/client/period/report scope.
2. Validate requester permission.
3. Retrieve source records and hashes.
4. Retrieve SEC audit events.
5. Retrieve E2E saga/evidence bundle.
6. Apply masking/minimisation.
7. Generate pack with run ID and completeness statement.
8. Require maker-checker for sensitive export.
9. Emit SEC-01 audit event.

---

## 10. WF-REC01-09 Report Generation

### Steps

1. Select report type and period.
2. Verify data sources and run status.
3. Generate report from immutable run outputs.
4. Label draft/final.
5. Include open-break warnings.
6. Export/store report.
7. Emit SEC-01 audit event.
