# PRT-01 Client / Staff / Admin Portal Workflows
## 09 Error Handling

## 1. Principles

1. Portal errors must be safe and non-leaking.
2. Backend denial is authoritative.
3. Sensitive reason codes are not shown to clients.
4. Stale status forces refresh/revalidation.
5. Freeze/incident denial is shown through approved template.

## 2. Error Codes

| Code | Severity | Handling |
|---|---|---|
| `PRT1_SOURCE_TRUTH_REQUIRED` | Critical/High | Refresh/block |
| `PRT1_BACKEND_REVALIDATION_REQUIRED` | Critical | Block action |
| `PRT1_PERMISSION_DENIED` | High | Deny |
| `PRT1_STEP_UP_REQUIRED` | Medium/High | Request MFA |
| `PRT1_CFG_LOCKED` | Critical/High | Hide/deny |
| `PRT1_INCIDENT_FREEZE_ACTIVE` | Critical/High | Deny/show approved message |
| `PRT1_STATUS_NOT_FINAL` | High | Show pending |
| `PRT1_MASKING_REQUIRED` | High | Mask |
| `PRT1_EXPORT_APPROVAL_REQUIRED` | High | Hold |
| `PRT1_TIPPING_OFF_RISK` | Critical/High | Block |
| `PRT1_EXCHANGE_FEATURE_PROHIBITED` | Critical | Block/alert |
| `PRT1_FRONTEND_ONLY_CONTROL_PROHIBITED` | Critical | Reject |
| `PRT1_IDEMPOTENCY_CONFLICT` | High | Existing/conflict |
| `PRT1_AUDIT_REQUIRED` | Critical | Fail closed |
| `PRT1_DISPLAY_NON_REGRESSION_REQUIRED` | Critical/High | Suppress/fail closed |
| `PRT1_OVERLAY_PRECEDENCE_REQUIRED` | Critical/High | Apply overlay |
| `PRT1_OBJECT_AUTHORIZATION_FAILED` | Critical/High | Deny/audit |
| `PRT1_SERVICE_ACCOUNT_RESCOPE_REQUIRED` | Critical | Deny |
| `PRT1_INVALIDATION_EPOCH_STALE` | Critical/High | Revalidate/fail closed |
| `PRT1_EXPORT_SOURCE_MASKING_REQUIRED` | Critical | Reject |
| `PRT1_EXPORT_DISCLOSURE_LOG_REQUIRED` | High | Reject |
| `PRT1_EXPORT_TOKEN_INVALID` | High/Critical | Reject |
| `PRT1_EXPORT_RECHECK_FAILED` | High/Critical | Reject |
| `PRT1_QUOTE_BINDING_FAILED` | Critical | Reject |
| `PRT1_UNTRUSTED_BROWSER_INPUT` | Critical/High | Reject/audit |
| `PRT1_UPLOAD_POLICY_FAILED` | High/Critical | Quarantine/reject |
| `PRT1_WEB_INTEGRITY_CONTROL_REQUIRED` | Critical/High | Block |
| `PRT1_NOTIFICATION_SUPERSEDED` | Medium/High | Suppress/supersede |
| `PRT1_STEP_UP_BINDING_REQUIRED` | High/Critical | Re-auth |
| `PRT1_DISCLOSED_FEE_MISMATCH` | Critical | Block |
| `PRT1_CLIENT_SAFE_REASON_REQUIRED` | High/Critical | Block |
| `PRT1_CORRELATION_REQUIRED` | Critical/High | Block |
| `PRT1_SOURCE_UNAVAILABLE_DEGRADED` | High/Critical | Show unavailable/disable |
