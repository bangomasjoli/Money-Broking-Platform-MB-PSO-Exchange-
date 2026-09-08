# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 09 Error Handling

## 1. Principles

1. Missing or stale screening blocks AML clear.
2. Sanctions true hit hard-blocks.
3. KYC pass is not AML clear.
4. Handoff delivery is not outcome.
5. Vendor result requires source authentication and payload integrity.
6. Travel Rule missing data cannot be clear.
7. STR/tipping-off data must be protected.
8. Sensitive read/export fails closed if SEC-01 logging fails.

---

## 2. Error Codes

| Code | Severity | Handling |
|---|---|---|
| `AML1_HANDOFF_INVALID` | High | Reject/deadletter |
| `AML1_CASE_NOT_FOUND` | Medium | Not found |
| `AML1_SCREENING_OUTCOME_PENDING` | High | Hold |
| `AML1_SCREENING_OUTCOME_STALE` | High | Rescreen/hold |
| `AML1_SANCTIONS_HIT` | Critical | Hard block/escalate |
| `AML1_PEP_REVIEW_REQUIRED` | High | Review/EDD |
| `AML1_ADVERSE_MEDIA_REVIEW_REQUIRED` | High | Review/EDD |
| `AML1_MATCH_REVIEW_REQUIRED` | High | Review |
| `AML1_FALSE_POSITIVE_REASON_REQUIRED` | High | Block false-positive decision |
| `AML1_TRUE_HIT_ESCALATION_REQUIRED` | Critical | Escalate |
| `AML1_VENDOR_RESULT_INVALID` | High | Reject |
| `AML1_VENDOR_SOURCE_UNAUTHORISED` | Critical | Reject/alert |
| `AML1_LIST_VERSION_MISSING` | Critical/High | Block clear |
| `AML1_LIST_UPDATE_RESREEN_REQUIRED` | High | Rescreen |
| `AML1_TRAVEL_RULE_DATA_MISSING` | High | Missing data outcome |
| `AML1_TRAVEL_RULE_HIT` | Critical/High | Review/escalate |
| `AML1_STR_ACCESS_RESTRICTED` | Critical | Deny |
| `AML1_TIPPING_OFF_BLOCKED` | Critical/High | Suppress |
| `AML1_OUTCOME_PUBLISH_FAILED` | Critical/High | Retry/deadletter/escalate |
| `AML1_SENSITIVE_READ_LOG_REQUIRED` | Critical | Deny read/export |
| `AML1_PRE_TRANSACTION_GATE_REQUIRED` | Critical | Deny/hold action |
| `AML1_PRE_TRANSACTION_SCREENING_STALE` | Critical/High | Rescreen |
| `AML1_LIST_UPDATE_SLA_BREACHED` | Critical | Alert/escalate |
| `AML1_LIST_FRESHNESS_UNKNOWN` | Critical/High | Mark stale/hold |
| `AML1_INTERIM_BLOCK_ACTIVE` | High | Hold action |
| `AML1_LIST_COVERAGE_INCOMPLETE` | Critical/High | Block clear |
| `AML1_OWNERSHIP_50_RULE_HIT` | Critical | Hard block/escalate |
| `AML1_KYC_UBO_GRAPH_STALE` | High | Review/pending |
| `AML1_SCREENING_INPUT_INCOMPLETE` | High | Review/pending |
| `AML1_STR_CLOCK_REQUIRED` | Critical | Block STR workflow closure |
| `AML1_STR_DEADLINE_BREACH` | Critical | Escalate |
| `AML1_PENDING_STR_POLICY_REQUIRED` | Critical/High | Hold/escalate |
| `AML1_SANCTIONS_FP_DUAL_REVIEW_REQUIRED` | Critical/High | Block clearance |
| `AML1_STANDING_FP_REATTEST_REQUIRED` | High | Re-review |
| `AML1_THRESHOLD_FLOOR_BREACH` | Critical | Block config |
| `AML1_OUTCOME_HASH_INVALID` | Critical | Deny outcome use |
| `AML1_OUTCOME_REVOKED` | Critical/High | Deny/refresh |
| `AML1_PEP_RCA_REQUIRED` | High | Review/EDD |
| `AML1_HIGH_RISK_JURISDICTION` | High | EDD/restrict/reject |
| `AML1_DELISTING_REVIEW_REQUIRED` | High | Keep restriction pending review |
| `AML1_TRAVEL_RULE_THRESHOLD_REQUIRED` | High | Block policy activation |
| `AML1_TRAVEL_RULE_SUNRISE_REVIEW` | High | Review/hold |

---

## 3. Fail-Closed Cases

1. Required screening missing.
2. Screening list version missing.
3. Vendor result unauthenticated.
4. Unresolved possible match.
5. Sanctions true hit.
6. Stale screening outcome.
7. Travel Rule required data missing.
8. Outcome publication failed after retry.
9. Sensitive read log fails.
10. STR access unauthorised.
11. Pre-transaction gate missing/stale.
12. List freshness unknown or list-update SLA breached.
13. Sanctions list coverage incomplete.
14. KYC UBO graph stale/incomplete for ownership-based sanctions.
15. Minimum screening input incomplete.
16. STR clock/deadline missing.
17. Sanctions false-positive dual review missing.
18. Outcome hash invalid/revoked.
