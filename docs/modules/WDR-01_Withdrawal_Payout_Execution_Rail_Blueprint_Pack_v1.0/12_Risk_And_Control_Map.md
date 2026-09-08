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
