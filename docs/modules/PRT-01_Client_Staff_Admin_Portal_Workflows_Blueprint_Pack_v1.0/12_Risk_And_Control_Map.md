# PRT-01 Client / Staff / Admin Portal Workflows
## 12 Risk And Control Map

| Risk ID | Risk | Impact | Control | Test |
|---|---|---|---|---|
| PRT1-RISK-001 | Portal displays false money status | Client harm | Source-truth/status truth | PRT1-TC-001-005 |
| PRT1-RISK-002 | Frontend bypass | Control bypass | Backend revalidation | PRT1-TC-006 |
| PRT1-RISK-003 | Unauthorized access | Data breach | IAM/permission | PRT1-TC-007-009 |
| PRT1-RISK-004 | Duplicate submission | Double action | Idempotency | PRT1-TC-010 |
| PRT1-RISK-005 | AML tipping-off | Compliance breach | Client-safe messages | PRT1-TC-016 |
| PRT1-RISK-006 | Sensitive export leak | Data breach | Export controls | PRT1-TC-018-019 |
| PRT1-RISK-007 | Freeze ignored | Unsafe money movement | Incident-aware UX | PRT1-TC-021-022 |
| PRT1-RISK-008 | Admin bypass | Financial/control breach | Admin boundary | PRT1-TC-023-024 |
| PRT1-RISK-009 | Exchange UI exposed | Licence breach | Exchange lock | PRT1-TC-025-027 |
| PRT1-RISK-010 | Report hides issue | Misleading reporting | REC warnings | PRT1-TC-029-031 |
