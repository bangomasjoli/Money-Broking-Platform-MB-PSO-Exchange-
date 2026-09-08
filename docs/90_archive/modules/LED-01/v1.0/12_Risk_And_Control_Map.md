# LED-01 Ledger / Settlement / Safeguarding
## 12 Risk And Control Map

| Risk ID | Risk | Impact | Control | Test |
|---|---|---|---|---|
| LED1-RISK-001 | Unbalanced journal | Ledger corruption | Double-entry validation | LED1-TC-001-002 |
| LED1-RISK-002 | Direct balance edit | Fraud/control bypass | Append-only journal | LED1-TC-003-004 |
| LED1-RISK-003 | Double credit deposit | Client liability overstatement | Idempotency | LED1-TC-005/012 |
| LED1-RISK-004 | Available credit before backing | Safeguarding breach | Deposit credit gate | LED1-TC-009-011 |
| LED1-RISK-005 | Payout without controls | Fund loss/AML breach | WLT/AML/reserve gate | LED1-TC-013-018 |
| LED1-RISK-006 | LP execution without hold | AIX exposure | Prefunded hold | LED1-TC-019-022 |
| LED1-RISK-007 | DvP sequence skipped | AIX exposure | DvP controller | LED1-TC-023 |
| LED1-RISK-008 | AIX absorbs residual | Principal exposure | No inventory rule | LED1-TC-025 |
| LED1-RISK-009 | Client liabilities exceed assets | Safeguarding breach | Full-backing invariant | LED1-TC-026-027 |
| LED1-RISK-010 | Hidden spread/fee | Licence/commercial breach | Fee disclosure | LED1-TC-028-029 |
| LED1-RISK-011 | Reversal hides issue | Audit breach | Reversal controls | LED1-TC-030-032 |
| LED1-RISK-012 | Frozen/closed posting | Integrity breach | Close/freeze controls | LED1-TC-033-034 |
| LED1-RISK-013 | Reconciliation break ignored | Operational loss | Reconciliation workflow | LED1-TC-035-039 |

## Critical Controls

1. Double-entry ledger.
2. Append-only journals.
3. No direct balance edit.
4. Full-backing invariant.
5. Deposit credit only after backing.
6. WLT and AML gate for movement.
7. Prefunded hold.
8. DvP sequencing.
9. No principal exposure.
10. Idempotency and ordering.
11. Reconciliation and safeguarding report.
