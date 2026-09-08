# WDR-01 Withdrawal / Payout Execution Rail
## 12 Risk And Control Map

| Risk ID | Risk | Impact | Control | Test |
|---|---|---|---|---|
| WDR1-RISK-001 | Execution without LED reserve | Unbacked payout | Reserve validation | WDR1-TC-007-008 |
| WDR1-RISK-002 | Destination bypass | AML/fraud loss | WLT verify-consume | WDR1-TC-004 |
| WDR1-RISK-003 | AML/Travel Rule bypass | Compliance breach | AML gate | WDR1-TC-005-006 |
| WDR1-RISK-004 | Provider spoof/instruction tamper | Fund loss | Provider auth | WDR1-TC-013 |
| WDR1-RISK-005 | Duplicate instruction | Double payout | Idempotency | WDR1-TC-014-015 |
| WDR1-RISK-006 | Timeout blind retry | Double payout | Query-back | WDR1-TC-017-020 |
| WDR1-RISK-007 | Premature finality | Incorrect ledger settlement | Finality model | WDR1-TC-021-023 |
| WDR1-RISK-008 | Return/reversal ignored | Ledger mismatch | LED notify | WDR1-TC-024-025 |
| WDR1-RISK-009 | Principal funding | Regulatory breach | No-principal control | WDR1-TC-033 |
| WDR1-RISK-010 | Sanctioned return | Legal breach | Compliance/legal route | WDR1-TC-038 |

## v1.1 Additional Risk Controls

| Risk ID | Risk | Control | Tests |
|---|---|---|---|
| WDR1-RISK-011 | Stale bundle at irreversible send | Atomic revalidate-and-transmit | WDR1-TC-041-046 |
| WDR1-RISK-012 | Value leakage / fee ambiguity | Payout value conservation | WDR1-TC-047-051 |
| WDR1-RISK-013 | Payment instruction alteration | Beneficiary integrity guard | WDR1-TC-052-056 |
| WDR1-RISK-014 | Batch partial/double execution | Batch envelope/item finality | WDR1-TC-057-061 |
| WDR1-RISK-015 | Duplicate logical payout | Reserve send lock / dedup | WDR1-TC-044-045 |
| WDR1-RISK-016 | State race/out-of-order event | CAS transition guard | WDR1-TC-062 |
| WDR1-RISK-017 | Late execution misclassified | Executed-late settlement exception | WDR1-TC-063 |
| WDR1-RISK-018 | Signing key abuse | Key governance | WDR1-TC-064-065 |
| WDR1-RISK-019 | Stuck reserve/instruction | Pinned reserve SLA | WDR1-TC-066 |
| WDR1-RISK-020 | False client paid status | Rail+LED truth status | WDR1-TC-067-068 |
