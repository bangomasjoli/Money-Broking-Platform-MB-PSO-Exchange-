# CLT-01 Client Onboarding / Client Profile
## 12 Risk And Control Map

| Risk ID | Risk | Impact | Control | Test |
|---|---|---|---|---|
| CLT1-RISK-001 | Retail onboarded by default | Licence/scope breach | CFG gate + retail lock | CLT1-TC-006 |
| CLT1-RISK-002 | Client class upgraded falsely | Scope breach | Evidence + approval | CLT1-TC-009 |
| CLT1-RISK-003 | Approved without KYC handoff | Compliance failure | Handoff required | CLT1-TC-013 |
| CLT1-RISK-004 | Approved without AML handoff | Compliance failure | Handoff required | CLT1-TC-014 |
| CLT1-RISK-005 | Onboarding approval grants trading | Product/control breach | Downstream eligibility required | CLT1-TC-020 |
| CLT1-RISK-006 | Self-approval | Fraud/control failure | IAM-02 maker-checker | CLT1-TC-017 |
| CLT1-RISK-007 | Duplicate client ignored | Fraud/duplicate risk | Duplicate review | CLT1-TC-026/027 |
| CLT1-RISK-008 | Unauthorised mandate user | Client fraud | Mandate evidence/approval | CLT1-TC-021-025 |
| CLT1-RISK-009 | Suspended client downstream access | Control failure | Status-based access | CLT1-TC-028 |
| CLT1-RISK-010 | Sensitive read unlogged | Data/audit failure | SEC-01 logging | CLT1-TC-031/032 |
| CLT1-RISK-011 | Direct status edit | Control bypass | Reconciliation/audit | CLT1-TC-030 |
| CLT1-RISK-012 | Super Admin bypass | Control bypass | IAM/CFG/SoD rules | CLT1-TC-035 |
| CLT1-RISK-013 | Break-glass approval | Control bypass | Prohibited | CLT1-TC-036 |

## Critical Controls

1. CFG-01 onboarding/client-class gate.
2. Retail default lock.
3. Client-class evidence and approval.
4. KYC/KYB handoff.
5. AML/sanctions handoff.
6. IAM-02 maker-checker.
7. SEC-01 audit.
8. Status-based downstream blocking.
9. Mandate/authorised-user control.
10. Duplicate review.
11. Sensitive read logging.
