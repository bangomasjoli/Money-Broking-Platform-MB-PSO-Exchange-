# DEP-01 Deposit Execution / Inbound Receipt
## 15 Regulatory Mapping

## 1. Control Mapping

| DEP-01 Control | Master / Module Control Area | Tests |
|---|---|---|
| No ledger credit | LEDGER-RULE-001, LED-01 boundary | DEP1-TC-022-023 |
| Receipt authentication | SEC-RULE-003 | DEP1-TC-005-007 |
| Deduplication | FND idempotency | DEP1-TC-008-010 |
| Matching / mis-attribution | FUND-RULE-001 | DEP1-TC-011-015 |
| Source screening handoff | WLT-01, AML-01 | DEP1-TC-016-018 |
| Confirmation policy | SAFEGUARD-RULE-001 | DEP1-TC-019 |
| LED handoff | LED-01 | DEP1-TC-020-021 |
| Reversal / recall | LED clawback / E2E saga | DEP1-TC-024-026 |
| Reconciliation | E2E-01 evidence | DEP1-TC-027-033 |
| Audit | SEC-01 | DEP1-TC-032 |

## 2. Regulatory Support

DEP-01 supports:

1. client money safeguarding by preventing premature credit.
2. AML/CFT by capturing source data for screening.
3. auditability by preserving external receipt evidence.
4. reconciliation by binding receipt to LED status.
5. E2E assurance by correlation ID.
