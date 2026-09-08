# WLT-01 Wallet Screening / Payout Destination Whitelist
## 09 Error Handling

## 1. Principles

1. Unknown destination status fails closed.
2. Unknown client/mandate status fails closed.
3. Stale AML decision fails closed.
4. Stale wallet/bank verification fails closed.
5. Cooling-off active blocks use.
6. Revocation immediately blocks use.
7. Travel Rule missing data blocks/holds.
8. Sensitive read/export fails closed if SEC-01 logging fails.

---

## 2. Error Codes

| Code | Severity | Handling |
|---|---|---|
| `WLT1_DESTINATION_NOT_FOUND` | Medium | Not found |
| `WLT1_DESTINATION_NOT_WHITELISTED` | High | Deny |
| `WLT1_DESTINATION_NOT_ACTIVE` | High | Deny/hold |
| `WLT1_DESTINATION_REVOKED` | Critical/High | Deny |
| `WLT1_COOLING_OFF_ACTIVE` | High | Deny/hold |
| `WLT1_CLIENT_STATUS_BLOCKED` | Critical/High | Deny |
| `WLT1_MANDATE_REQUIRED` | High | Deny |
| `WLT1_CLIENT_DUAL_AUTH_REQUIRED` | High | Approval required |
| `WLT1_WALLET_SCREENING_REQUIRED` | Critical/High | Block activation/use |
| `WLT1_WALLET_RISK_HIGH` | Critical/High | Review/reject |
| `WLT1_WALLET_SANCTIONS_EXPOSURE` | Critical | Block/escalate |
| `WLT1_WALLET_CHAIN_MISMATCH` | Critical/High | Deny |
| `WLT1_WALLET_ADDRESS_INVALID` | High | Reject |
| `WLT1_BENEFICIARY_MISMATCH` | Critical/High | Review/block |
| `WLT1_THIRD_PARTY_BENEFICIARY_REVIEW` | High | Review |
| `WLT1_AML_GATE_REQUIRED` | Critical | Deny/hold |
| `WLT1_AML_DECISION_STALE` | Critical/High | Deny/refresh |
| `WLT1_TRAVEL_RULE_DATA_MISSING` | High | Hold/review |
| `WLT1_VENDOR_RESULT_INVALID` | High | Reject |
| `WLT1_VENDOR_SOURCE_UNAUTHORISED` | Critical | Reject/alert |
| `WLT1_DECISION_TOKEN_STALE` | High | Deny/refresh |
| `WLT1_DECISION_SCOPE_MISMATCH` | Critical/High | Deny |
| `WLT1_SENSITIVE_READ_LOG_REQUIRED` | Critical | Deny read/export |

---

## 3. Fail-Closed Cases

1. Destination unknown.
2. Destination not active.
3. Whitelist not approved.
4. Cooling-off active.
5. AML decision missing/stale/revoked.
6. Wallet/bank risk result missing/stale.
7. Client status blocked.
8. Mandate invalid.
9. Travel Rule data missing.
10. Vendor source invalid.
11. Decision scope mismatch.
12. Sensitive read logging fails.
