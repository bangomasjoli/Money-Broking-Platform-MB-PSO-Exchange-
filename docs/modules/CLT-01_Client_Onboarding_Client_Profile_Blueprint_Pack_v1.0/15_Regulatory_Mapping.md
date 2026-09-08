# CLT-01 Client Onboarding / Client Profile
## 15 Regulatory Mapping

## 1. Control Mapping

| CLT-01 Control | Master Control / Rule Area | Tests |
|---|---|---|
| Retail lock | LIC-RULE-001, CFG-RULE-001 | CLT1-TC-006 |
| Client class gate | LIC-RULE-001, CFG-RULE-001 | CLT1-TC-006-010 |
| CFG-01 gate | CFG-RULE-001 | CLT1-TC-001-004 |
| Final approval maker-checker | GOV-RULE-001, SOD-RULE-001 | CLT1-TC-016-019 |
| KYC/KYB handoff | KYC-RULE-001 | CLT1-TC-011-015 |
| AML/sanctions handoff | AML-RULE-001 | CLT1-TC-011-015 |
| Status-based access | SYS-RULE-001, CFG-RULE-001 | CLT1-TC-020, 028-029 |
| Mandate/authorised user | SOD-RULE-001, GOV-RULE-001 | CLT1-TC-021-025 |
| Duplicate review | GOV-RULE-001 | CLT1-TC-026-027 |
| Sensitive read logging | SEC-RULE-001, DATA-RULE-001 | CLT1-TC-031-034 |
| Reconciliation | SYS-RULE-001, SEC-RULE-001 | CLT1-TC-037-041 |

---

## 2. Workflow Mapping

| Workflow | Tests |
|---|---|
| WF-CLT01-01 Start Application | CLT1-TC-001-005 |
| WF-CLT01-02 Client Classification | CLT1-TC-006-010 |
| WF-CLT01-03 Submit Application | CLT1-TC-011-015 |
| WF-CLT01-04 Review and Final Approval | CLT1-TC-016-020 |
| WF-CLT01-05 Client Profile Amendment | CLT1-TC-009-010, 031-034 |
| WF-CLT01-06 Authorised User and Mandate Setup | CLT1-TC-021-025 |
| WF-CLT01-07 Duplicate Review | CLT1-TC-026-027 |
| WF-CLT01-08 Status Suspension / Closure | CLT1-TC-028-030 |
| WF-CLT01-09 Sensitive Read / Export | CLT1-TC-031-034 |
| WF-CLT01-10 Reconciliation | CLT1-TC-037-041 |

---

## 3. Regulatory Support

CLT-01 supports:

1. Licence-scope client eligibility.
2. Retail default lock.
3. Controlled onboarding intake.
4. Client evidence and profile records.
5. Mandate and authorised representative controls.
6. Audit trail for onboarding decisions.
7. Handoff to KYC/KYB and AML checks.
8. Prevention of unsupported client access.
9. Sensitive data access control.
10. Downstream lifecycle control.
