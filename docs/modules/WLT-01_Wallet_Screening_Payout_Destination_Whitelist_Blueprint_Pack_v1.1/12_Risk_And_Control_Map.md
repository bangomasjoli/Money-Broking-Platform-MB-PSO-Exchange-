# WLT-01 Wallet Screening / Payout Destination Whitelist
## 12 Risk And Control Map

| Risk ID | Risk | Impact | Control | Test |
|---|---|---|---|---|
| WLT1-RISK-001 | Use unwhitelisted destination | Fund-flow breach | Destination gate | WLT1-TC-022 |
| WLT1-RISK-002 | Wallet high risk allowed | AML/CFT breach | Wallet screening/review | WLT1-TC-006 |
| WLT1-RISK-003 | Wallet sanctions exposure allowed | Sanctions breach | Hard block/escalation | WLT1-TC-007 |
| WLT1-RISK-004 | Beneficiary mismatch | Fraud/misdirected payment | Beneficiary verification | WLT1-TC-011 |
| WLT1-RISK-005 | Third-party payout unapproved | Fraud/AML risk | Approval | WLT1-TC-012 |
| WLT1-RISK-006 | Cooling-off bypass | Account takeover/fraud | Cooling-off enforcement | WLT1-TC-018/019 |
| WLT1-RISK-007 | Stale AML decision used | Sanctions breach | AML gate freshness | WLT1-TC-024 |
| WLT1-RISK-008 | Travel Rule data missing | Travel Rule breach | Data completeness gate | WLT1-TC-025 |
| WLT1-RISK-009 | Revoked destination used | Fund-flow breach | Revocation propagation | WLT1-TC-032 |
| WLT1-RISK-010 | Scope-mismatched token reused | Control bypass | Action-scoped decision | WLT1-TC-026 |
| WLT1-RISK-011 | Vendor spoof/result tampered | False clear | Source auth/hash | WLT1-TC-008 |
| WLT1-RISK-012 | WLT executes payout directly | Scope/control breach | No movement execution | WLT1-TC-027 |
| WLT1-RISK-013 | Direct whitelist DB edit | Control bypass | Reconciliation/audit | WLT1-TC-038 |

## Critical Controls

1. Destination whitelist before movement.
2. Wallet screening.
3. Beneficiary verification.
4. AML-01 pre-transaction gate.
5. Travel Rule completeness.
6. Client mandate / dual authorisation.
7. Maker-checker approval.
8. Cooling-off.
9. Immediate revocation.
10. Ongoing rescreening.
11. Decision token scope/freshness.
12. SEC-01 sensitive access logging.

## v1.1 Additional Risk Controls

| Risk ID | Risk | Control | Tests |
|---|---|---|---|
| WLT1-RISK-014 | Revoked destination used with unexpired token | Execution-time revalidation + revocation epoch | WLT1-TC-041-044 |
| WLT1-RISK-015 | Account drained to valid whitelist destination | Value/velocity/first-use limits | WLT1-TC-045-047 |
| WLT1-RISK-016 | Inbound sanctioned/high-risk source credited | Inbound source screening + quarantine | WLT1-TC-048-051 |
| WLT1-RISK-017 | Unhosted wallet not controlled by client | Proof-of-control + own-name binding | WLT1-TC-052-054 |
| WLT1-RISK-018 | Address poisoning/canonicalisation loss | Address integrity controls | WLT1-TC-055-057 |
| WLT1-RISK-019 | Unsupported chain falsely cleared | Chain/provider coverage | WLT1-TC-058, 061 |
| WLT1-RISK-020 | AML revocation not applied | AML revocation subscription | WLT1-TC-059, 069 |
| WLT1-RISK-021 | New risk during cooling-off activates | Cooling-off cancellation | WLT1-TC-060, 063 |
