# IAM-01 Authentication / MFA / Session  
## 14 Go-Live Checklist

## 1. IAM-01 Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 1 | IAM-01 blueprint accepted | Pending |
| 2 | FND-01 dependency accepted | Complete |
| 3 | Password hashing implemented | Pending |
| 4 | Password reset implemented | Pending |
| 5 | Login rate limiting implemented | Pending |
| 6 | MFA enrolment implemented | Pending |
| 7 | MFA verification implemented | Pending |
| 8 | Privileged MFA enforced or risk accepted | Pending |
| 9 | MFA reset approval hook implemented | Pending |
| 10 | Session issuance implemented | Pending |
| 11 | Session revocation implemented | Pending |
| 12 | Refresh token rotation implemented | Pending |
| 13 | Refresh token reuse detection implemented | Pending |
| 14 | Account lockout/progressive delay implemented | Pending |
| 15 | New-device/new-location notification implemented | Pending |
| 16 | Service-account authentication implemented | Pending |
| 17 | Auth audit events implemented | Pending |
| 18 | Field-level encryption for MFA secrets implemented | Pending |
| 19 | No credential/token logging verified | Pending |
| 20 | DB isolation tests passed | Pending |
| 21 | Auth reconciliation jobs implemented | Pending |
| 22 | IAM1-TC test suite passed | Pending |
| 23 | Security sign-off | Pending |
| 24 | QA sign-off | Pending |
| 25 | Compliance sign-off where required | Pending |

---

## 2. Go-Live Blocking Failures

1. Plaintext password storage.
2. Plaintext MFA secret storage.
3. Login without required MFA.
4. Privileged access without privileged MFA where required.
5. Refresh token reuse not detected.
6. Session not revoked after password/MFA reset.
7. Password/reset/MFA tokens logged.
8. Account enumeration possible.
9. MFA reset without approval.
10. Service account usable interactively by human.
11. Auth audit missing for sensitive action.
12. Cross-user session access possible.
