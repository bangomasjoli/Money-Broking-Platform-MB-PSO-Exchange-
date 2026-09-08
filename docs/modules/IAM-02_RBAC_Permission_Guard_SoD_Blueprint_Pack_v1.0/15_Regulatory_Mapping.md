# IAM-02 RBAC / Permission Guard / SoD  
## 15 Regulatory Mapping

## 1. Rule-ID Mapping

| IAM-02 Control | Master Rule / Control | Tests |
|---|---|---|
| Permission guard | IAM-RULE-001, SYS-RULE-001 | IAM2-TC-001 to 008 |
| Maker-checker | MC-RULE-001, GOV-RULE-001 | IAM2-TC-017 to 024 |
| Self-approval block | SOD-RULE-001, MC-RULE-001 | IAM2-TC-018 |
| SoD matrix | SOD-RULE-001 | IAM2-TC-025 to 030 |
| Licence-lock deny | LIC-RULE-001 to LIC-RULE-004, CFG-RULE-001 | IAM2-TC-006, 013, 043 |
| Step-up integration | IAM-RULE-001, SEC-RULE-003 | IAM2-TC-023/024 |
| Delegation | SOD-RULE-001, GOV-RULE-001 | IAM2-TC-031 to 034 |
| Temporary permission | IAM-RULE-001, GOV-RULE-001 | IAM2-TC-035 to 037 |
| Break-glass | SEC-RULE-003, GOV-RULE-001 | IAM2-TC-038 to 045 |
| Client-side dual auth | PAY-RULE-001, SOD-RULE-001 | IAM2-TC-046 to 050 |
| Permission revocation | IAM-RULE-001, SEC-RULE-003 | IAM2-TC-051 to 055 |
| Sensitive read audit | SEC-RULE-001, SEC-RULE-002 | IAM2-TC-056 to 060 |
| Service account control | VND-RULE-003, SEC-RULE-003 | IAM2-TC-061 to 064 |

---

## 2. Workflow Mapping

| Workflow | Tests |
|---|---|
| WF-IAM02-01 Runtime Permission Guard | IAM2-TC-001 to 008 |
| WF-IAM02-02 Role Assignment | IAM2-TC-009 to 016 |
| WF-IAM02-03 Permission Assignment | IAM2-TC-012 to 016 |
| WF-IAM02-04 Maker-Checker Approval | IAM2-TC-017 to 024 |
| WF-IAM02-05 SoD Conflict Check | IAM2-TC-025 to 030 |
| WF-IAM02-06 Delegation | IAM2-TC-031 to 034 |
| WF-IAM02-07 Temporary Permission | IAM2-TC-035 to 037 |
| WF-IAM02-08 Break-Glass | IAM2-TC-038 to 045 |
| WF-IAM02-09 Permission Revocation | IAM2-TC-051 to 055 |
| WF-IAM02-10 Client-Side Dual Authorization | IAM2-TC-046 to 050 |

---

## 3. Data-Flow Mapping

| Data Flow | IAM-02 Control | Tests |
|---|---|---|
| Auth/session context | IAM-01 session into permission guard | IAM2-TC-001 to 005 |
| Step-up flow | IAM-01 recent-auth assertion verification | IAM2-TC-023/024 |
| Audit/outbox flow | Permission/approval audit | IAM2-TC-008/057/060 |
| Permission cache flow | Cache invalidation/version | IAM2-TC-051 to 055 |
| Approval evidence flow | Approval request/decision/evidence | IAM2-TC-017 to 024 |
| Break-glass evidence flow | Request/approval/review | IAM2-TC-038 to 045 |
| Client-side approval flow | Client maker/checker | IAM2-TC-046 to 050 |
| Reconciliation flow | Expiry/conflict/evidence scans | Go-live reconciliation tests |

---

## 4. Regulatory Support

IAM-02 supports:

1. Controlled access to regulated platform functions.
2. Maker-checker for sensitive operations.
3. Segregation of duties.
4. Prevention of self-approval.
5. Licence-boundary enforcement.
6. Evidence for audit and regulatory review.
7. Emergency access governance.
8. Client-side dual authorization.
9. Permission revocation and least privilege.
