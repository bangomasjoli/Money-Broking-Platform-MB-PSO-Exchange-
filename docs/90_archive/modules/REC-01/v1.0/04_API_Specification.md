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

## 6. Error Codes

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
