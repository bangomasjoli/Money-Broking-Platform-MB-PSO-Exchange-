# SEC-01 Audit Log / Security Monitoring  
## 12 Risk And Control Map

| Risk ID | Risk | Impact | Control | Test |
|---|---|---|---|---|
| SEC1-RISK-001 | Audit event missing | No evidence | Required ingestion + reconciliation | SEC1-TC-001, 044-047 |
| SEC1-RISK-002 | Audit event modified | Evidence unreliable | Immutability + hash chain | SEC1-TC-011, 050 |
| SEC1-RISK-003 | Audit event deleted | Evidence loss | Delete prohibited | SEC1-TC-051 |
| SEC1-RISK-004 | Sensitive action proceeds without audit | Control failure | Fail closed | SEC1-TC-015/016 |
| SEC1-RISK-005 | Secret stored in audit metadata | Data leakage | Metadata restrictions | SEC1-TC-007 |
| SEC1-RISK-006 | Audit read unauthorised | Confidentiality breach | IAM-02 access control | SEC1-TC-036 |
| SEC1-RISK-007 | Sensitive audit read unlogged | Audit blind spot | Sensitive read logging | SEC1-TC-037/038 |
| SEC1-RISK-008 | Evidence export abused | Data leakage/legal risk | Approval, watermark, audit | SEC1-TC-039-043 |
| SEC1-RISK-009 | Security event not alerted | Incident missed | Rule engine | SEC1-TC-019-028 |
| SEC1-RISK-010 | Critical alert closed improperly | Incident suppressed | Closure evidence/approval | SEC1-TC-032/033 |
| SEC1-RISK-011 | Interim IAM audit not reconciled | Missing authoritative history | Handoff reconciliation | SEC1-TC-044-048 |
| SEC1-RISK-012 | Retention breach | Legal/regulatory issue | Retention/legal hold | SEC1-TC-052/053 |
| SEC1-RISK-013 | Audit admin edits own trail | Insider risk | SoD/prohibited direct edit | SEC1-TC-055 |
| SEC1-RISK-014 | Monitoring rule disabled silently | Alert bypass | Maker-checker + audit | SEC1-TC-058 |
| SEC1-RISK-015 | Sequence/hash gap ignored | Tampering undetected | Integrity verification | SEC1-TC-010/014 |

## Critical Controls

1. Immutable audit store.
2. Hash chain.
3. Batch sealing.
4. Sensitive action audit fail-closed.
5. Sensitive read logging.
6. Evidence export approval/logging.
7. Security alert rule engine.
8. Alert lifecycle evidence.
9. Interim audit handoff.
10. Retention/legal hold.
11. IAM-02 access control.
12. Audit deletion/modification prohibition.
