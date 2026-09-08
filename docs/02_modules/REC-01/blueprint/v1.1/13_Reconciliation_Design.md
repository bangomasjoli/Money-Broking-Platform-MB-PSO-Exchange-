# REC-01 Reconciliation / Finance Reporting
## 13 Reconciliation Design

## 1. Purpose

This document lists the primary reconciliation suites REC-01 must run.

---

## 2. Required Reconciliation Suites

### 2.1 LED Ledger Suite

1. Journal balance.
2. Hash-chain integrity.
3. Balance roll-forward.
4. Hold/reserve status.
5. Fee journal mapping.
6. Reversal/clawback mapping.

### 2.2 Safeguarding Suite

1. Client liabilities by asset/currency.
2. External safeguarded assets.
3. Free vs encumbered backing.
4. Pending deposits/withdrawals.
5. Residual/suspense balances.
6. Surplus/deficit.

### 2.3 DEP Deposit Suite

1. External receipt vs DEP record.
2. Receipt authentication.
3. WLT/AML clear.
4. Finality evidence.
5. LED pending deposit.
6. LED credit.
7. Reversal/recall.

### 2.4 WDR Withdrawal Suite

1. Payout request.
2. WLT verify-and-consume.
3. AML/Travel Rule gate.
4. LED reserve.
5. Provider instruction.
6. Finality.
7. LED settlement.
8. Return/reversal.
9. Value conservation.

### 2.5 TRD Trade Suite

1. Quote request.
2. LP quote.
3. Client acceptance.
4. LED hold.
5. LP order/fill.
6. Client fill.
7. Price identity.
8. Value conservation.
9. LED settlement.

### 2.6 SEC Audit Suite

1. Expected event manifest.
2. Emitted events.
3. Event sequence.
4. Missing events.
5. Duplicate events.
6. Unauthorized sensitive actions.

### 2.7 E2E Saga Suite

1. Correlation completeness.
2. Saga step status.
3. Orphaned intermediate states.
4. Compensation actions.
5. Evidence bundle completeness.
6. Final client-visible status.

---

## 3. Break Severity Mapping

| Condition | Severity |
|---|---|
| Liabilities > safeguarded assets | Critical |
| Ledger hash-chain mismatch | Critical |
| Unbalanced journal | Critical |
| Missing SEC event for money movement | Critical |
| Payout without reserve | Critical |
| Deposit credited without confirmed receipt | Critical |
| Client fill without LP fill | Critical |
| Value conservation fail | Critical/High |
| External statement missing | High/Critical by materiality |
| Stale unresolved saga step | High/Critical by SLA |

## 4. v1.1 Population and As-Of Reconciliation

Every full reconciliation run must first prove:

1. SEC expected-event manifest coverage.
2. E2E correlation registry coverage.
3. per-module monotonic sequence coverage.
4. source extract completeness.
5. shared LED/E2E as-of cut-off.
6. in-flight expected-open items separately tracked.

All-green status is prohibited unless the population coverage proof passes.

## 5. v1.1 External Statement Trust Reconciliation

External statements must reconcile:

1. provider identity / authenticated source.
2. safeguarding account universe.
3. statement sequence/completeness.
4. as-of date against run cut-off.
5. independent ingestion SoD.
6. source hash and anchor.

## 6. v1.1 Closed-Loop Break Remediation

High/critical break closure requires:

1. remediation evidence.
2. targeted validation run.
3. validation result clean for that break.
4. independent approval.
5. recurrence signature update.
6. re-open/escalate if reappears.
