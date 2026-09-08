# IAM-01 Authentication / MFA / Session  
## 12 Risk And Control Map

| Risk ID | Risk | Impact | Control | Test |
|---|---|---|---|---|
| IAM1-RISK-001 | Credential stuffing | Account takeover | Rate limit + lockout | IAM1-TC-004/037 |
| IAM1-RISK-002 | Account enumeration | Privacy/security leak | Generic responses | IAM1-TC-003/012 |
| IAM1-RISK-003 | Password stored weakly | Credential compromise | Adaptive hashing | IAM1-TC-009 |
| IAM1-RISK-004 | Reset token reuse | Account takeover | Single-use token | IAM1-TC-013 |
| IAM1-RISK-005 | Login without MFA | Account takeover | MFA policy | IAM1-TC-019/020 |
| IAM1-RISK-006 | Privileged MFA weak/missing | Admin compromise | Phishing-resistant MFA | IAM1-TC-023/024 |
| IAM1-RISK-007 | MFA reset abuse | Account takeover | Approval + audit | IAM1-TC-025 |
| IAM1-RISK-008 | Refresh token replay | Session takeover | Rotation/reuse detection | IAM1-TC-032 |
| IAM1-RISK-009 | Active session remains after reset | Continued compromise | Session revocation | IAM1-TC-015/026/033/034 |
| IAM1-RISK-010 | New-device login unnoticed | ATO undetected | Notification/step-up | IAM1-TC-039/040 |
| IAM1-RISK-011 | Service account used by human | Privilege misuse | Non-human auth rules | IAM1-TC-046 |
| IAM1-RISK-012 | Token/secret logged | Security breach | Log scrubbing | IAM1-TC-016/027/036 |
| IAM1-RISK-013 | Sensitive auth action without audit | Compliance failure | Transaction-coupled audit | IAM1-TC-049 |
| IAM1-RISK-014 | Cross-user session access | Privacy breach | DB/app scope controls | IAM1-TC-052 |
| IAM1-RISK-015 | IAM module accesses other schemas | Boundary breach | Per-module DB grants | IAM1-TC-053 |

## Critical Controls

1. Password hashing.
2. MFA enforcement.
3. Privileged phishing-resistant MFA.
4. Session revocation.
5. Refresh token reuse detection.
6. Lockout/progressive delay.
7. Secret/token log scrubbing.
8. Auth audit events.
9. Service account separation.
