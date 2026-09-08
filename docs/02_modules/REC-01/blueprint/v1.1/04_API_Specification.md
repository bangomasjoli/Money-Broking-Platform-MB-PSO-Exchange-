# REC-01 Reconciliation / Finance Reporting
## 04 API Specification

## 1. API Principles

All REC-01 APIs use FND request/correlation ID, standard error envelope, IAM permission checks and SEC audit events.

REC-01 APIs do not mutate source-of-truth financial records.

---

## 2. Reconciliation Run APIs

### 2.1 POST `/rec1/reconciliation-runs`

Create reconciliation run.

### 2.2 GET `/rec1/reconciliation-runs/{run_id}`

Read reconciliation run.

### 2.3 POST `/rec1/reconciliation-runs/{run_id}/rerun`

Create new rerun from prior scope.

### 2.4 GET `/rec1/reconciliation-runs/{run_id}/breaks`

List breaks for run.

---

## 3. Break Management APIs

### 3.1 GET `/rec1/breaks/{break_id}`

Read break.

### 3.2 POST `/rec1/breaks/{break_id}/assign`

Assign break.

### 3.3 POST `/rec1/breaks/{break_id}/investigation-note`

Add investigation note.

### 3.4 POST `/rec1/breaks/{break_id}/closure-request`

Request closure.

### 3.5 POST `/rec1/breaks/{break_id}/approve-closure`

Approve closure.

### 3.6 POST `/rec1/breaks/{break_id}/escalate`

Escalate break.

---

## 4. Reporting APIs

### 4.1 POST `/rec1/reports/safeguarding`

Generate safeguarding report.

### 4.2 POST `/rec1/reports/daily-close`

Generate daily close pack.

### 4.3 POST `/rec1/reports/finance`

Generate finance report.

### 4.4 POST `/rec1/reports/evidence-pack`

Generate evidence pack.

### 4.5 GET `/rec1/reports/{report_id}`

Read report.

---

## 5. Dashboard APIs

### 5.1 GET `/rec1/dashboard/summary`

Read reconciliation dashboard.

### 5.2 GET `/rec1/dashboard/breaks`

Read break dashboard.

### 5.3 GET `/rec1/dashboard/safeguarding`

Read safeguarding dashboard.

---

## 6. Coverage / Statement / Governance APIs

### 6.1 POST `/rec1/reconciliation-runs/{run_id}/prove-population-coverage`

Run SEC/E2E denominator coverage proof.

### 6.2 POST `/rec1/reconciliation-runs/{run_id}/validate-as-of`

Validate shared LED/E2E as-of sequence snapshot.

### 6.3 POST `/rec1/external-statements`

Ingest external statement with trust validation.

### 6.4 POST `/rec1/external-statements/{statement_id}/validate-trust`

Validate authenticity/completeness/freshness/independence.

### 6.5 POST `/rec1/breaks/{break_id}/re-reconcile`

Run targeted re-reconciliation for break closure.

### 6.6 POST `/rec1/reports/{report_id}/restate`

Create controlled restated report.

### 6.7 POST `/rec1/regulatory-obligations`

Create regulatory obligation.

### 6.8 GET `/rec1/regulatory-obligations/{obligation_id}`

Read regulatory obligation.

---

## 7. Error Codes

| Code | Meaning |
|---|---|
| `REC1_SOURCE_MUTATION_PROHIBITED` | REC cannot mutate source data |
| `REC1_LEDGER_POST_PROHIBITED` | REC cannot post ledger |
| `REC1_RUN_SCOPE_INVALID` | Invalid reconciliation scope |
| `REC1_SOURCE_UNAVAILABLE` | Source unavailable |
| `REC1_SOURCE_HASH_MISMATCH` | Source hash mismatch |
| `REC1_RUN_ALREADY_FINAL` | Run final and immutable |
| `REC1_CRITICAL_BREAK_AUTO_CLEAR_PROHIBITED` | Critical break cannot auto-clear |
| `REC1_BREAK_CLOSURE_EVIDENCE_REQUIRED` | Closure evidence required |
| `REC1_SOD_VIOLATION` | SoD violation |
| `REC1_DAILY_CLOSE_BLOCKED` | Daily close blocked |
| `REC1_SAFEGUARDING_DEFICIT` | Safeguarding deficit |
| `REC1_VALUE_CONSERVATION_FAILED` | Value conservation failed |
| `REC1_AUDIT_EVENT_MISSING` | Expected SEC event missing |
| `REC1_EXPORT_APPROVAL_REQUIRED` | Export approval required |
| `REC1_REPORT_OPEN_BREAK_WARNING` | Report generated with open breaks |
| `REC1_POPULATION_COVERAGE_REQUIRED` | Population coverage proof required |
| `REC1_POPULATION_GAP_DETECTED` | Missing correlation/sequence |
| `REC1_AS_OF_SEQUENCE_REQUIRED` | Shared as-of sequence required |
| `REC1_IN_FLIGHT_ITEM_SLA_EXCEEDED` | In-flight item aged into break |
| `REC1_EXTERNAL_STATEMENT_AUTH_FAILED` | External statement auth failed |
| `REC1_STATEMENT_ACCOUNT_UNIVERSE_INCOMPLETE` | Missing safeguarding account |
| `REC1_STATEMENT_STALE` | Statement as-of stale |
| `REC1_STATEMENT_INGESTION_SOD_REQUIRED` | Statement ingestion SoD required |
| `REC1_HASH_CHAIN_REQUIRED` | REC record hash-chain required |
| `REC1_RUN_SCOPE_NARROWED` | Narrowed scope requires warning/approval |
| `REC1_INDEPENDENCE_SOD_REQUIRED` | Independent reconciliation SoD required |
| `REC1_CLEAN_RERECON_REQUIRED` | Clean re-reconciliation required |
| `REC1_RECURRENCE_DETECTED` | Break recurrence detected |
| `REC1_TOLERANCE_POLICY_REQUIRED` | Tolerance policy required |
| `REC1_ZERO_TOLERANCE_APPLIED` | Tolerance applied to zero-tolerance class |
| `REC1_RULE_CHANGE_APPROVAL_REQUIRED` | Rule change approval required |
| `REC1_REPORT_RESTATEMENT_REQUIRED` | Report must be restated, not edited |
| `REC1_REGULATORY_OBLIGATION_DUE` | Filing due/at risk |
