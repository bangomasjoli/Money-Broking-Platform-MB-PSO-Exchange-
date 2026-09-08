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
| `WLT1_EXECUTION_REVALIDATION_REQUIRED` | Critical | Deny execution |
| `WLT1_REVOCATION_EPOCH_MISMATCH` | Critical | Deny execution |
| `WLT1_DECISION_ALREADY_CONSUMED` | Critical/High | Deny reuse |
| `WLT1_LIMIT_EXCEEDED` | High/Critical | Deny/hold |
| `WLT1_VELOCITY_EXCEEDED` | High/Critical | Deny/hold |
| `WLT1_FIRST_USE_STEPUP_REQUIRED` | High | Step-up/hold |
| `WLT1_INBOUND_SOURCE_SCREENING_REQUIRED` | High/Critical | Hold attribution |
| `WLT1_DEPOSIT_QUARANTINED` | Critical/High | Quarantine |
| `WLT1_DEPOSIT_SOURCE_UNMATCHED` | High/Critical | Quarantine/review |
| `WLT1_UNHOSTED_PROOF_REQUIRED` | Critical/High | Block activation |
| `WLT1_PROOF_OF_CONTROL_FAILED` | Critical/High | Block activation |
| `WLT1_WALLET_OWN_NAME_REQUIRED` | High/Critical | Review/block |
| `WLT1_ADDRESS_CANONICALISATION_FAILED` | High | Reject |
| `WLT1_NAME_SERVICE_ALIAS_NOT_ALLOWED` | High | Resolve raw address |
| `WLT1_ADDRESS_POISONING_REVIEW` | High/Critical | Review/hold |
| `WLT1_UNSUPPORTED_CHAIN` | High/Critical | Hold/review |
| `WLT1_AML_REVOCATION_RECEIVED` | Critical/High | Revoke/restrict |
| `WLT1_COOLING_OFF_CANCELLED_BY_RISK` | High | Re-review |

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
13. Execution-time revalidation not performed.
14. Revocation epoch/version mismatch.
15. Destination/client limit breach.
16. Inbound source unscreened/unmatched/high-risk.
17. Unhosted wallet proof-of-control missing.
18. Address canonicalisation or poisoning review fails.
19. Unsupported chain/provider coverage.
20. AML revocation signal received.
