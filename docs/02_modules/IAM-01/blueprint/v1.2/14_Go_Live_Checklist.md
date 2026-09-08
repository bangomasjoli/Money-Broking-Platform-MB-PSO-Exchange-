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
| 25 | Step-up interface implemented | Pending |
| 26 | Recent-auth assertion verification implemented | Pending |
| 27 | Interim MFA-reset approval/disable control implemented until IAM-02 | Pending |
| 28 | Freeze/suspension session revocation implemented | Pending |
| 29 | Frozen user refresh denial implemented | Pending |
| 30 | Per-user-class session policy implemented | Pending |
| 31 | Privileged shorter TTL / re-auth policy implemented | Pending |
| 32 | Access-token binding/anomaly response implemented | Pending |
| 33 | Concurrent-session limits implemented | Pending |
| 34 | Global logout implemented | Pending |
| 35 | Password history and breached-password checks implemented | Pending |
| 36 | SEC-01 authoritative audit relationship clarified | Pending |
| 37 | Compliance sign-off where required | Pending |

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
13. Step-up interface missing for sensitive actions.
14. Admin/staff MFA reset possible without approval before IAM-02.
15. Frozen/suspended user retains active session or refresh.
16. Admin session TTL not stricter than staff/client.
17. Access-token replay from different device/IP not detected.
18. Unlimited privileged concurrent sessions.
19. Breached/reused password accepted where policy blocks it.
20. Local auth event treated as authoritative over SEC-01 audit.
