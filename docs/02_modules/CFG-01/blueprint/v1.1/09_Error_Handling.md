# CFG-01 Feature Flag / Licence Lock  
## 09 Error Handling

## 1. Principles

1. Unknown feature fails closed.
2. Unknown licence state fails closed.
3. Prohibited feature returns locked/prohibited reason.
4. Sensitive decision audit failure fails closed.
5. Stale decision token fails closed.
6. Errors must not reveal confidential licence evidence to unauthorised users.
7. All errors include request/correlation ID.

---

## 2. Error Codes

| Code | Severity | Handling |
|---|---|---|
| `CFG1_FEATURE_UNKNOWN` | High | Deny |
| `CFG1_FEATURE_DENIED` | Medium | Deny |
| `CFG1_FEATURE_PROHIBITED` | Critical | Deny + alert |
| `CFG1_LICENCE_LOCKED` | High/Critical | Deny |
| `CFG1_EXCHANGE_PENDING_LOCKED` | Critical | Deny + alert |
| `CFG1_RETAIL_DEFAULT_LOCKED` | High | Deny |
| `CFG1_AIX_SPREAD_MARKUP_PROHIBITED` | Critical | Deny + alert |
| `CFG1_PRINCIPAL_DEALING_PROHIBITED` | Critical | Deny + alert |
| `CFG1_MARKET_MAKING_PROHIBITED` | Critical | Deny + alert |
| `CFG1_APPROVAL_REQUIRED` | High | Approval required |
| `CFG1_STEP_UP_REQUIRED` | High | Step-up required |
| `CFG1_FEATURE_VERSION_STALE` | High | Revalidate/deny |
| `CFG1_DECISION_TOKEN_INVALID` | High | Deny |
| `CFG1_AUDIT_REQUIRED` | Critical | Fail closed |
| `CFG1_DEPLOYMENT_GATE_BLOCKED` | High/Critical | Block deployment |
| `CFG1_INTERIM_HANDOFF_MISMATCH` | Critical | Block affected feature |
| `CFG1_DRIFT_DETECTED` | High/Critical | Alert/reconcile |
| `CFG1_KILL_SWITCH_BLOCKED` | Critical | Block |
| `CFG1_CONFIG_INTEGRITY_FAILED` | Critical | Deny + alert |
| `CFG1_OUT_OF_BAND_CONFIG_CHANGE` | Critical | Deny + alert |
| `CFG1_EXCHANGE_ACTIVATION_CEREMONY_REQUIRED` | Critical | Block |
| `CFG1_LFSA_EVIDENCE_UNVERIFIED` | Critical | Block |
| `CFG1_FEATURE_GATE_TOKEN_REQUIRED` | Critical | Deny |
| `CFG1_FEATURE_GATE_ORPHAN` | Critical | Deny/block deployment |
| `CFG1_AUDIT_OUTBOX_REQUIRED` | Critical | Fail closed |
| `CFG1_NONPROD_LOCKED_FEATURE_PROMOTION` | Critical | Block deployment |
| `CFG1_SYNTHETIC_ENV_ONLY` | High/Critical | Block real-data use |
| `CFG1_TOKEN_REVOKED_BY_KILL_SWITCH` | High | Deny |
| `CFG1_TOKEN_REVOKED_BY_LICENCE_CHANGE` | High/Critical | Deny |

---

## 3. Fail-Closed Cases

CFG-01 fails closed when:

1. Feature unknown.
2. Licence profile unknown.
3. Feature state stale.
4. Licence profile stale.
5. Prohibited registry unavailable.
6. SEC-01 audit unavailable for sensitive decision.
7. IAM-02 approval unavailable for sensitive change.
8. Decision token invalid/stale.
9. Handoff mismatch unresolved.
10. Deployment gate missing required evidence.
11. Config integrity seal mismatch.
12. Prohibited registry signature missing.
13. Feature-gated action lacks CFG decision token.
14. FND transaction-coupled audit outbox enqueue fails during SEC-01 outage.
15. Exchange activation ceremony incomplete.
16. Locked feature found enabled in non-prod config being promoted to production.

---

## 4. Safe User Messages

| Scenario | Message |
|---|---|
| Feature locked | This feature is not available |
| Approval required | Approval is required before this change |
| Licence locked | This feature is restricted by current licence status |
| Deployment blocked | Deployment gate failed |
| Stale decision | Feature state must be revalidated |
| Prohibited feature | This feature is not permitted |
