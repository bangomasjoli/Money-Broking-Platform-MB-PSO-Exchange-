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

## v1.1 Additional Risk Controls

| Risk ID | Risk | Control | Tests |
|---|---|---|---|
| PRT1-RISK-011 | Cached favourable status lies after reversal/freeze | Non-regression + overlay precedence | PRT1-TC-033-038 |
| PRT1-RISK-012 | IDOR/BOLA object access | Object entitlement | PRT1-TC-039-043 |
| PRT1-RISK-013 | Portal stale after freeze/revocation/restatement | Push invalidation | PRT1-TC-044-048 |
| PRT1-RISK-014 | Export egress leak | Source masking/token/disclosure/recheck | PRT1-TC-049-055 |
| PRT1-RISK-015 | Browser economics tampering | Quote binding | PRT1-TC-056-058 |
| PRT1-RISK-016 | Unsafe upload / web attack | Upload/web integrity | PRT1-TC-059-064 |
| PRT1-RISK-017 | Stale contradictory notification | Supersession | PRT1-TC-065-066 |
| PRT1-RISK-018 | MFA not bound to money action | Action-bound step-up | PRT1-TC-067-068 |
| PRT1-RISK-019 | Fee disclosure mismatch | Disclosed-fee display truth | PRT1-TC-069-070 |
| PRT1-RISK-020 | Internal reasons leaked to client | Client-safe reason catalogue | PRT1-TC-071-072 |
| PRT1-RISK-021 | Portal action outside E2E/SEC trace | Correlation propagation | PRT1-TC-073-078 |
