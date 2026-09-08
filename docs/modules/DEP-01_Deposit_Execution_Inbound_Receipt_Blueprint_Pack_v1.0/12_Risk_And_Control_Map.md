# DEP-01 Deposit Execution / Inbound Receipt
## 12 Risk And Control Map

| Risk ID | Risk | Impact | Control | Test |
|---|---|---|---|---|
| DEP1-RISK-001 | DEP credits balance | Ledger/safeguarding breach | No-credit boundary | DEP1-TC-022-023 |
| DEP1-RISK-002 | Fake receipt | False credit | Source authentication | DEP1-TC-005-007 |
| DEP1-RISK-003 | Duplicate receipt | Double credit | Deduplication | DEP1-TC-008-010 |
| DEP1-RISK-004 | Mis-attribution | Wrong client credit | Conservative matching | DEP1-TC-011-015 |
| DEP1-RISK-005 | Source screening bypass | AML/sanctions risk | WLT/AML handoff | DEP1-TC-016-018 |
| DEP1-RISK-006 | Unconfirmed receipt credited | Safeguarding risk | Confirmation threshold | DEP1-TC-019 |
| DEP1-RISK-007 | LED handoff missing | Orphan deposit | LED pending/credit handoff | DEP1-TC-020-021 |
| DEP1-RISK-008 | Reorg/recall ignored | Unbacked balance | LED clawback notify | DEP1-TC-024-026 |
| DEP1-RISK-009 | Correlation missing | E2E recon gap | Saga correlation | DEP1-TC-031 |
| DEP1-RISK-010 | Audit missing | Evidence gap | SEC audit | DEP1-TC-032 |

## Critical Controls

1. DEP cannot credit ledger.
2. Receipt authentication.
3. Payload hash.
4. Deduplication.
5. Conservative matching.
6. WLT/AML handoff.
7. LED pending/credit handoff.
8. Quarantine.
9. Reversal notification.
10. E2E correlation.
