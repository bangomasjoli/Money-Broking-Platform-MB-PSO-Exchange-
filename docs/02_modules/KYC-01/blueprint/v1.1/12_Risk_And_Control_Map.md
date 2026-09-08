# KYC-01 KYC / KYB Verification
## 12 Risk And Control Map

| Risk ID | Risk | Impact | Control | Test |
|---|---|---|---|---|
| KYC1-RISK-001 | Handoff treated as pass | CDD bypass | Outcome separation | KYC1-TC-003 |
| KYC1-RISK-002 | Missing document still passes | CDD failure | Required checklist | KYC1-TC-005/037 |
| KYC1-RISK-003 | Failed identity/entity passes | CDD failure | Verification result gates | KYC1-TC-011/013 |
| KYC1-RISK-004 | Missing UBO verification | KYB/AML failure | UBO threshold | KYC1-TC-016-018 |
| KYC1-RISK-005 | Unverified authorised party active | Client authority risk | Party verification | KYC1-TC-019/020 |
| KYC1-RISK-006 | Manual override without approval | Control bypass | IAM-02 maker-checker | KYC1-TC-024/039 |
| KYC1-RISK-007 | Vendor result spoofed | False verification | Source auth/payload hash | KYC1-TC-014/015 |
| KYC1-RISK-008 | Stale outcome treated as pass | Perpetual KYC breach | Periodic review | KYC1-TC-031-033 |
| KYC1-RISK-009 | Outcome not published to CLT | CLT incorrect status | Outcome publication recon | KYC1-TC-025/026 |
| KYC1-RISK-010 | Sensitive evidence read unlogged | Data breach | SEC-01 logging | KYC1-TC-035/036 |
| KYC1-RISK-011 | KYC pass grants trading | Scope breach | No transaction activation | KYC1-TC-021 |
| KYC1-RISK-012 | Direct outcome DB edit | Control bypass | Append/version/recon | KYC1-TC-040 |

## Critical Controls

1. Handoff vs outcome separation.
2. Required document checklist.
3. Identity/entity verification.
4. UBO/controller verification.
5. Authorised-party verification.
6. EDD routing.
7. IAM-02 maker-checker for manual decision.
8. Vendor result authenticity.
9. Periodic review/stale outcome.
10. CLT outcome publication.
11. SEC-01 sensitive read logging.

## v1.1 Additional Risk Controls

| Risk ID | Risk | Control | Tests |
|---|---|---|---|
| KYC1-RISK-013 | Layered ownership hides natural controller | UBO look-through recursion | KYC1-TC-041-045 |
| KYC1-RISK-014 | Vendor reliance invalid | Vendor reliance framework | KYC1-TC-046-051 |
| KYC1-RISK-015 | Weak proofing accepted as pass | Proofing assurance policy | KYC1-TC-052-054 |
| KYC1-RISK-016 | KYC pass misread as AML clearance | KYC/AML boundary contract | KYC1-TC-055-057 |
| KYC1-RISK-017 | Evidence store tampering | Hash re-verification + store contract | KYC1-TC-058-060 |
| KYC1-RISK-018 | Duplicate hash inconsistent with CLT | CLT hash basis alignment | KYC1-TC-061 |
| KYC1-RISK-019 | EDD routing lacks measures | Minimum EDD measures | KYC1-TC-062 |
