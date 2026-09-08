# TRD-01 Quote / Trade / LP Execution
## 12 Risk And Control Map

| Risk ID | Risk | Impact | Control | Test |
|---|---|---|---|---|
| TRD1-RISK-001 | Exchange feature enabled | Licence breach | Feature lock | TRD1-TC-033-036 |
| TRD1-RISK-002 | Client fill without LP fill | Principal exposure | LP-fill mapping | TRD1-TC-022 |
| TRD1-RISK-003 | LP execution without hold | AIX exposure | LED hold | TRD1-TC-016 |
| TRD1-RISK-004 | Hidden spread markup | Licence/commercial breach | Fee disclosure/no markup | TRD1-TC-031-032 |
| TRD1-RISK-005 | Stale quote accepted | Price dispute | Quote expiry/hash | TRD1-TC-009-010 |
| TRD1-RISK-006 | LP spoof/tamper | False execution | Source auth/payload hash | TRD1-TC-005 |
| TRD1-RISK-007 | Duplicate LP fill | Double settlement | Idempotency | TRD1-TC-023 |
| TRD1-RISK-008 | LP timeout double execution | Fund-flow risk | Pending recon/no blind retry | TRD1-TC-020 |
| TRD1-RISK-009 | Slippage silently accepted | Client harm/principal leak | Tolerance/requote | TRD1-TC-024 |
| TRD1-RISK-010 | Residual absorbed by AIX | Principal exposure | LED residual handoff | TRD1-TC-026 |

## Critical Controls

1. Agency/back-to-back execution.
2. LP fill maps to client fill.
3. LED prefunded hold before LP execution.
4. No principal/inventory.
5. No spread markup.
6. Quote expiry/hash.
7. LP source auth/payload hash.
8. Slippage and partial-fill controls.
9. Settlement handoff to LED.
10. Exchange feature lock.

## v1.1 Additional Risk Controls

| Risk ID | Risk | Control | Tests |
|---|---|---|---|
| TRD1-RISK-011 | Accept-to-fill principal window | Contingent/atomic agency execution model | TRD1-TC-041-044 |
| TRD1-RISK-012 | Client fill diverges from LP fill | Fill conservation invariant | TRD1-TC-045-047 |
| TRD1-RISK-013 | Hidden spread in price construction | Price identity + quote hash LP evidence | TRD1-TC-048-050 |
| TRD1-RISK-014 | LP timeout double-exec/late-fill hole | Query-back + late-fill guard | TRD1-TC-051-055 |
| TRD1-RISK-015 | Internal crossing/netting | No-internalisation guard | TRD1-TC-056-058 |
| TRD1-RISK-016 | Licence lock TOCTOU | CFG revalidation at execution/settlement | TRD1-TC-059-060 |
| TRD1-RISK-017 | Poor LP selection evidence | Best-execution record | TRD1-TC-061-062 |
| TRD1-RISK-018 | Partial hold release mismatch | LED-atomic residual hold release | TRD1-TC-063-064 |
| TRD1-RISK-019 | Trade state race | Compare-and-set transitions | TRD1-TC-065-066 |
| TRD1-RISK-020 | False settled confirmation | LED actual outcome sync | TRD1-TC-067-068 |
