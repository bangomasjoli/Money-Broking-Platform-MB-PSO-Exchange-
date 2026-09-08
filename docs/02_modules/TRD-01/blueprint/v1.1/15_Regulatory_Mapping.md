# TRD-01 Quote / Trade / LP Execution
## 15 Regulatory Mapping

## 1. Control Mapping

| TRD-01 Control | Master Control / Rule Area | Tests |
|---|---|---|
| Agency/back-to-back execution | MB-RULE-001, LIC-RULE-001 | TRD1-TC-021-030 |
| Exchange feature lock | LIC-RULE-001, CFG-RULE-001 | TRD1-TC-033-036 |
| LP approval/coverage | VND-RULE-001 | TRD1-TC-004-005 |
| Client eligibility | CLT/KYC/AML-RULE-001 | TRD1-TC-001-003 |
| Quote expiry/hash | TRADE-RULE-001, SEC-RULE-003 | TRD1-TC-008-010 |
| Fee disclosure/no markup | FEE-RULE-001 | TRD1-TC-007,031-032 |
| LED prefunded hold | LEDGER-RULE-001, FUND-RULE-001 | TRD1-TC-012-016 |
| AML gate | AML-RULE-001 | TRD1-TC-014 |
| LP execution idempotency | SYS-RULE-001 | TRD1-TC-018-020,023 |
| Slippage/partial fill | TRADE-RULE-001 | TRD1-TC-024-026 |
| Settlement handoff | SETTLE-RULE-001 | TRD1-TC-027-028 |
| Reconciliation | SYS-RULE-001 | TRD1-TC-037-040 |

---

## 2. Workflow Mapping

| Workflow | Tests |
|---|---|
| WF-TRD01-01 Quote Request | TRD1-TC-001-007 |
| WF-TRD01-02 Quote Acceptance | TRD1-TC-008-014 |
| WF-TRD01-03 LP Execution | TRD1-TC-015-020 |
| WF-TRD01-04 Fill Processing | TRD1-TC-021-026 |
| WF-TRD01-05 Slippage/Requote/Void | TRD1-TC-024-026 |
| WF-TRD01-06 Settlement Handoff | TRD1-TC-027-028 |
| WF-TRD01-07 Expiry/Cancel/Timeout | TRD1-TC-009,020 |
| WF-TRD01-08 Reconciliation | TRD1-TC-037-040 |

---

## 3. Regulatory Support

TRD-01 supports:

1. Money Broking agency execution.
2. no principal dealing.
3. no Exchange matching/order book.
4. disclosed brokerage fee.
5. prefunded trading.
6. LP execution evidence.
7. trade reconciliation.
8. client confirmation evidence.

## v1.1 Additional Mapping

| TRD-01 Control | Master Control / Rule Area | Tests |
|---|---|---|
| Agency execution window | MB-RULE-001, PRINCIPAL-RULE-001 | TRD1-TC-041-044 |
| Fill conservation | MB-RULE-001, SETTLE-RULE-001 | TRD1-TC-045-047 |
| Price construction/no spread | FEE-RULE-001, MB-RULE-001 | TRD1-TC-048-050 |
| Timeout query-back / late fill | SYS-RULE-001, SETTLE-RULE-001 | TRD1-TC-051-055 |
| No internalisation/netting | LIC-RULE-001, EXCHANGE-LOCK-RULE | TRD1-TC-056-058 |
| CFG revalidation | CFG-RULE-001 | TRD1-TC-059-060 |
| Best execution | MB-RULE-001 | TRD1-TC-061-062 |
| Partial hold release | LEDGER-RULE-001 | TRD1-TC-063-064 |
| Trade CAS | SYS-RULE-001 | TRD1-TC-065-066 |
| Confirmation settlement truth | SETTLE-RULE-001 | TRD1-TC-067-068 |
