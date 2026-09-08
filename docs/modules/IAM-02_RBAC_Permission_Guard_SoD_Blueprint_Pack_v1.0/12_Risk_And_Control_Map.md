# IAM-02 RBAC / Permission Guard / SoD  
## 12 Risk And Control Map

| Risk ID | Risk | Impact | Control | Test |
|---|---|---|---|---|
| IAM2-RISK-001 | Permission bypass | Unauthorized action | Backend permission guard | IAM2-TC-001 to 008 |
| IAM2-RISK-002 | Unknown permission allowed | Privilege escalation | Default deny | IAM2-TC-003 |
| IAM2-RISK-003 | Self-approval | Fraud/control failure | Self-approval block | IAM2-TC-018 |
| IAM2-RISK-004 | SoD conflict | Fraud/control failure | SoD matrix | IAM2-TC-025 to 030 |
| IAM2-RISK-005 | Privileged role assigned without approval | Admin compromise | Maker-checker + step-up | IAM2-TC-010/023/024 |
| IAM2-RISK-006 | Licence-locked permission granted | Licence breach | Licence-lock deny | IAM2-TC-006/013/043 |
| IAM2-RISK-007 | Delegation abuse | Unauthorized approval/action | Scoped delegation + expiry + SoD | IAM2-TC-031 to 034 |
| IAM2-RISK-008 | Temporary permission persists | Privilege exposure | Mandatory expiry and reconciliation | IAM2-TC-035/036 |
| IAM2-RISK-009 | Break-glass abuse | Emergency privilege misuse | Approval, expiry, alert, review | IAM2-TC-038 to 045 |
| IAM2-RISK-010 | Stale permission cache | Revoked access still works | Cache invalidation | IAM2-TC-051 to 055 |
| IAM2-RISK-011 | Client maker approves own withdrawal | Client fraud/control failure | Client-side dual auth | IAM2-TC-046 to 050 |
| IAM2-RISK-012 | Service account as human approver | Control bypass | Service account approver block | IAM2-TC-063 |
| IAM2-RISK-013 | Sensitive permission read unlogged | Audit failure | Sensitive read logging | IAM2-TC-057 |
| IAM2-RISK-014 | Hidden permission grant | Privilege abuse | Approval + audit + reconciliation | IAM2-TC-012/060 |
| IAM2-RISK-015 | Step-up bypass for high-risk approval | Account takeover/fraud | IAM-01 step-up verification | IAM2-TC-023/024 |

## Critical Controls

1. Permission guard default deny.
2. Maker-checker.
3. Self-approval block.
4. SoD conflict matrix.
5. Licence-lock deny.
6. Step-up for sensitive approvals.
7. Permission revocation propagation.
8. Break-glass control.
9. Client-side dual authorization.
10. Sensitive read audit.
