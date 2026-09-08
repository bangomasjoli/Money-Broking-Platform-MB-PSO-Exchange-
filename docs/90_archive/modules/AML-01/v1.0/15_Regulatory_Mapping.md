# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 15 Regulatory Mapping

## 1. Control Mapping

| AML-01 Control | Master Control / Rule Area | Tests |
|---|---|---|
| Handoff vs outcome separation | AML-RULE-001, SYS-RULE-001 | AML1-TC-001-004 |
| KYC pass vs AML clear boundary | AML-RULE-001, KYC-RULE-001 | AML1-TC-004 |
| Sanctions screening | AML-RULE-001 | AML1-TC-005-007 |
| PEP/adverse-media screening | AML-RULE-001 | AML1-TC-008-009 |
| List/provider version | VND-RULE-001, AML-RULE-001 | AML1-TC-010 |
| Vendor authenticity | VND-RULE-001, SEC-RULE-003 | AML1-TC-011-012 |
| Match review | AML-RULE-001, GOV-RULE-001 | AML1-TC-013-018 |
| Outcome publication | SYS-RULE-001, AML-RULE-001 | AML1-TC-019-024 |
| Rescreening | AML-RULE-001 | AML1-TC-025-029 |
| Travel Rule screening support | TRAVEL-RULE-001 | AML1-TC-030-033 |
| STR/tipping-off | AML-RULE-001, SEC-RULE-001 | AML1-TC-034-038 |
| Reconciliation | SYS-RULE-001, SEC-RULE-001 | AML1-TC-039-043 |

---

## 2. Workflow Mapping

| Workflow | Tests |
|---|---|
| WF-AML01-01 Screening Case Creation | AML1-TC-001-004 |
| WF-AML01-02 Screening | AML1-TC-005-012 |
| WF-AML01-03 Match Review | AML1-TC-013-018 |
| WF-AML01-04 True Hit Escalation | AML1-TC-007, 015-017, 034 |
| WF-AML01-05 Outcome Publication | AML1-TC-019-024 |
| WF-AML01-06 Ongoing Rescreening | AML1-TC-025-029 |
| WF-AML01-07 Travel Rule Screening | AML1-TC-030-033 |
| WF-AML01-08 STR / Suspicion Case | AML1-TC-034-038 |
| WF-AML01-09 Sensitive Read / Export | AML1-TC-035, 038, 042 |
| WF-AML01-10 Reconciliation | AML1-TC-039-043 |

---

## 3. Regulatory Support

AML-01 supports:

1. AML/CFT screening evidence.
2. Sanctions/PEP/adverse-media control.
3. Ongoing monitoring and rescreening.
4. Travel Rule party screening support.
5. STR/suspicious case preparation control.
6. Tipping-off prevention.
7. Auditable AML outcome publication to CLT-01.
8. EDD/remediation trigger to KYC-01.
9. Sensitive screening evidence access control.
