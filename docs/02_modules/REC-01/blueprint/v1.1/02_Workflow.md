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
3. Define mandated scope, period, source modules and rule set.
4. Load SEC/E2E population denominator.
5. Establish shared as-of LED/E2E sequence cut-off.
6. Capture source data snapshots using common cut-off.
7. Hash input datasets.
8. Run population coverage checks.
9. Run reconciliation rules.
10. Create breaks and in-flight reconciling items.
11. Hash-chain output result and anchor critical run.
12. Emit SEC-01 audit event.
13. Publish run status.

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
3. Store common as-of sequence anchor.
4. Store input hash.
5. Record source completeness status.
6. Check monotonic sequence gaps.
7. Flag missing/unavailable source.
8. Emit SEC-01 audit event.

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
5. Track recurrence signature.
6. Escalate if SLA breached.
7. Emit SEC-01 audit event.

### Rules

1. Investigation notes do not alter source records.
2. Evidence attachment is audit logged.
3. Source module remediation must occur in source module.

---

## 6. WF-REC01-05 Break Closure

### Steps

1. Closure request submitted.
2. Verify remediation evidence.
3. Run clean re-reconciliation of the affected break population for high/critical breaks.
4. Verify validation run proves the break is gone.
5. Apply maker-checker for high/critical break.
6. Enforce independent SoD.
7. Check recurrence history.
8. Mark break resolved/accepted/false-positive according to policy.
9. Emit SEC-01 audit event.

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
6. Verify population coverage proof.
7. Escalate unresolved critical breaks.
8. Finance sign-off.
9. Compliance/Security sign-off where required.
10. Safeguarding four-eyes sign-off.
11. Generate close pack.
12. Hash-chain and anchor close pack.
13. Emit SEC-01 audit event.

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
2. Load safeguarded external balances from authenticated external statements.
3. Verify all safeguarding accounts included.
4. Verify statement as-of date/freshness.
5. Verify ingestion independence/SoD.
6. Load free/encumbered backing.
7. Load holds/reserves/pending deposits/pending withdrawals.
8. Calculate surplus/deficit.
9. Link external statement evidence.
10. Create report.
11. Emit SEC-01 audit event.

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

---

## 11. WF-REC01-10 Population Coverage Proof

### Trigger

Every full-population reconciliation run.

### Steps

1. Load SEC-01 expected-event manifest for the run period/scope.
2. Load E2E-01 correlation registry.
3. Load source-module monotonic sequence ranges.
4. Compare population denominator to LED/DEP/WDR/TRD/WLT/AML/SEC extracts.
5. Create break for missing correlation/sequence/source extract.
6. Mark run as full-population only if coverage proof passes.
7. Emit SEC-01 audit event.

---

## 12. WF-REC01-11 External Statement Trust Validation

### Trigger

External bank/custodian/chain/LP/provider statement ingestion.

### Steps

1. Verify provider identity/authenticated channel.
2. Verify statement file/API sequence.
3. Verify statement as-of period.
4. Verify account universe completeness.
5. Verify ingestion user/function independence.
6. Hash statement.
7. Mark statement trusted/partial/stale/rejected.
8. Emit SEC-01 audit event.

---

## 13. WF-REC01-12 Report Restatement

### Trigger

Final report later found incomplete/incorrect.

### Steps

1. Create restatement request.
2. Link superseded report.
3. Capture reason and affected scope.
4. Generate new report version.
5. Obtain approval.
6. Notify recipients/regulators according to policy.
7. Retain both versions.
8. Emit SEC-01 audit event.

---

## 14. WF-REC01-13 Regulatory Obligation Tracking

### Trigger

Scheduled regulatory/finance reporting calendar.

### Steps

1. Create obligation record.
2. Track due date, period and required content.
3. Link required reports/evidence packs.
4. Flag at-risk filing.
5. Record submission hash and acknowledgement.
6. Escalate missed deadline.
7. Emit SEC-01 audit event.
