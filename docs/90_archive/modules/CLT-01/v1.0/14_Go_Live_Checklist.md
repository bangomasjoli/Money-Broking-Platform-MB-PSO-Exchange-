# CLT-01 Client Onboarding / Client Profile
## 14 Go-Live Checklist

## 1. CLT-01 Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 1 | CLT-01 blueprint accepted | Pending |
| 2 | FND-01 dependency accepted | Complete |
| 3 | IAM-01 dependency accepted | Complete |
| 4 | IAM-02 dependency accepted | Complete |
| 5 | SEC-01 dependency accepted | Complete |
| 6 | CFG-01 dependency accepted | Complete |
| 7 | Client application intake defined | Pending |
| 8 | Client type/class taxonomy defined | Pending |
| 9 | Retail default lock defined | Pending |
| 10 | CFG-01 gate defined | Pending |
| 11 | Client profile lifecycle defined | Pending |
| 12 | Final maker-checker approval defined | Pending |
| 13 | KYC/KYB handoff defined | Pending |
| 14 | AML handoff defined | Pending |
| 15 | Mandate/authorised user setup defined | Pending |
| 16 | Client-side dual authorisation setup defined | Pending |
| 17 | Duplicate detection/review defined | Pending |
| 18 | Sensitive read/export defined | Pending |
| 19 | Reconciliation jobs defined | Pending |
| 20 | Tests CLT1-TC-001 to CLT1-TC-041 defined | Pending |
| 21 | Security sign-off | Pending |
| 22 | Compliance sign-off | Pending |
| 23 | Management sign-off | Pending |

---

## 2. Blocking Failures

1. Retail applicant can become active by default.
2. Client-class upgrade without evidence/approval.
3. Approved client without KYC/KYB handoff.
4. Approved client without AML handoff.
5. Onboarding approval grants trading/deposit/withdrawal directly.
6. Self-approval possible.
7. Duplicate unresolved but approved.
8. Suspended/closed client active downstream.
9. Sensitive read not logged.
10. Break-glass or Super Admin bypass.
11. Direct DB status edit.
12. Mandate user exceeds authority.
