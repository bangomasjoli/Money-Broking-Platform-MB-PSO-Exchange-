# WDR-01 Withdrawal / Payout Execution Rail
## 15 Regulatory Mapping

## 1. Control Mapping

| WDR-01 Control | Master / Module Control Area | Tests |
|---|---|---|
| WLT verify-and-consume | WLT-01 | WDR1-TC-004 |
| AML / Travel Rule gate | AML-01 | WDR1-TC-005-006 |
| LED reserve validation | LED-01 | WDR1-TC-007-008 |
| CFG/IAM runtime checks | CFG-01 / IAM-02 | WDR1-TC-009-010 |
| Provider authentication | SEC-01 / vendor controls | WDR1-TC-011-016 |
| Timeout query-back | E2E saga / WDR controls | WDR1-TC-017-020 |
| Finality model | LED settlement truth | WDR1-TC-021-023 |
| Return/reversal handling | LED clawback/failure | WDR1-TC-024-025 |
| Cancellation / freeze | E2E-01 / incident controls | WDR1-TC-026-030 |
| No principal funding | LED / safeguarding | WDR1-TC-031-033 |
| Return-to-source controls | DEP-01 / WLT / AML / LED | WDR1-TC-037-038 |
| Audit / reconciliation | SEC-01 / E2E | WDR1-TC-039-040 |

## 2. Regulatory Support

WDR-01 supports:

1. PSO payout execution controls.
2. AML/CFT and Travel Rule controlled outbound transfers.
3. client money safeguarding by requiring LED reserve.
4. no-principal exposure.
5. audit and reconciliation evidence.
6. controlled return/refund path.

## v1.1 Additional Mapping

| WDR-01 Control | Master / Module Control Area | Tests |
|---|---|---|
| Atomic send revalidation | E2E decision-bundle freshness | WDR1-TC-041-046 |
| Payout value conservation | LED safeguarding / no principal | WDR1-TC-047-051 |
| Beneficiary integrity | WLT canonical destination | WDR1-TC-052-054 |
| Travel Rule payload consistency | AML-01 Travel Rule | WDR1-TC-055-056 |
| Batch/file envelope | PSO rail control | WDR1-TC-057-061 |
| Reserve send lock / dedup | LED reserve / E2E saga | WDR1-TC-044-045 |
| State CAS / executed late | FND/E2E controls | WDR1-TC-062-063 |
| Signing key governance | SEC/vendor controls | WDR1-TC-064-065 |
| Pinned reserve SLA | E2E orphan sweeper | WDR1-TC-066 |
| Client status truth | LED settlement truth | WDR1-TC-067-068 |
