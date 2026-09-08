# SEC-01 Audit Log / Security Monitoring  
## 15 Regulatory Mapping

## 1. Control Mapping

| SEC-01 Control | Master Control / Rule Area | Tests |
|---|---|---|
| Authoritative audit store | SEC-RULE-001, SYS-RULE-001 | SEC1-TC-001 |
| Audit immutability | SEC-RULE-001 | SEC1-TC-050/051 |
| Hash-chain integrity | SEC-RULE-002 | SEC1-TC-008-014 |
| Sensitive action audit fail-closed | SEC-RULE-001, GOV-RULE-001 | SEC1-TC-015/016 |
| Sensitive read logging | SEC-RULE-001, DATA-RULE-001 | SEC1-TC-037/038 |
| Evidence export controls | SEC-RULE-001, GOV-RULE-001 | SEC1-TC-039-043 |
| Security monitoring | SEC-RULE-003 | SEC1-TC-019-028 |
| Alert lifecycle | SEC-RULE-003, GOV-RULE-001 | SEC1-TC-029-034 |
| Interim audit handoff | SEC-RULE-001, SYS-RULE-001 | SEC1-TC-044-048 |
| Retention/legal hold | DATA-RULE-001, GOV-RULE-001 | SEC1-TC-052-054 |
| Audit admin SoD | SOD-RULE-001, IAM-RULE-001 | SEC1-TC-055-060 |
| Licence/prohibited feature monitoring | LIC-RULE-001, CFG-RULE-001 | SEC1-TC-025 |

---

## 2. Workflow Mapping

| Workflow | Tests |
|---|---|
| WF-SEC01-01 Audit Event Ingestion | SEC1-TC-001-007 |
| WF-SEC01-02 Hash Chain and Batch Seal | SEC1-TC-008-014 |
| WF-SEC01-03 Security Monitoring Rule Evaluation | SEC1-TC-019-028 |
| WF-SEC01-04 Alert Triage | SEC1-TC-029-034 |
| WF-SEC01-05 Sensitive Audit Read | SEC1-TC-035-038 |
| WF-SEC01-06 Evidence Export | SEC1-TC-039-043 |
| WF-SEC01-07 Interim Audit Handoff | SEC1-TC-044-048 |
| WF-SEC01-08 Audit Integrity Verification | SEC1-TC-010-014 |
| WF-SEC01-09 Audit Retention / Archive | SEC1-TC-052-054 |
| WF-SEC01-10 Audit Failure Handling | SEC1-TC-015-018 |

---

## 3. Regulatory Support

SEC-01 supports:

1. Complete audit trail for regulated activities.
2. Evidence for LFSA/regulator review.
3. Internal and external audit evidence.
4. Board-level governance evidence.
5. Security incident monitoring.
6. Privileged access monitoring.
7. Immutable event evidence.
8. Client money and transaction control evidence in downstream modules.
9. Licence boundary breach attempt monitoring.
10. Operational resilience evidence.
