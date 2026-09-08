# PRT-01 Client / Staff / Admin Portal Workflows
## 15 Regulatory Mapping

## 1. Control Mapping

| PRT-01 Control | Master / Module Control Area | Tests |
|---|---|---|
| Source-truth display | LED/TRD/DEP/WDR/REC/INC | PRT1-TC-001-005 |
| Backend revalidation | IAM/CFG/source modules | PRT1-TC-006-010 |
| Client workflows | CLT/DEP/WDR/TRD | PRT1-TC-011-015 |
| Tipping-off safe UX | AML/INC | PRT1-TC-016 |
| Masking/export | SEC/REC/INC | PRT1-TC-017-020 |
| Incident/freeze UX | INC | PRT1-TC-021-022 |
| Admin boundaries | IAM/SEC/source modules | PRT1-TC-023-024 |
| Exchange UI prohibition | CFG/licence lock | PRT1-TC-025-027 |
| Report warnings | REC | PRT1-TC-029-031 |

## 2. Regulatory Support

PRT-01 supports:

1. client communication truthfulness.
2. AML tipping-off prevention.
3. secure access to sensitive data.
4. evidence/report controlled access.
5. licence-lock enforcement in user interfaces.
6. auditability of user actions.

## v1.1 Additional Mapping

| PRT-01 Control | Master / Module Control Area | Tests |
|---|---|---|
| Display non-regression | LED/TRD/DEP/WDR/REC/INC truth | PRT1-TC-033-038 |
| Object authorization | IAM-02 / data protection | PRT1-TC-039-043 |
| Push invalidation | INC/AML/WLT/REC/DEP/WDR/TRD/LED | PRT1-TC-044-048 |
| Export hardening | REC/SEC/INC evidence | PRT1-TC-049-055 |
| Hostile input | Security architecture | PRT1-TC-056-064 |
| Notification supersession | Status truth/comms | PRT1-TC-065-066 |
| Action-bound step-up | IAM-01/IAM-02 | PRT1-TC-067-068 |
| Disclosed-fee display | TRD/LED agency fee model | PRT1-TC-069-070 |
| Client-safe reason codes | AML/INC tipping-off controls | PRT1-TC-071-072 |
| Correlation propagation | FND/E2E/SEC/REC | PRT1-TC-073-078 |
