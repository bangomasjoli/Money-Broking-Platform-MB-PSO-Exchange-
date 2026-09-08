# PRT-01 Client / Staff / Admin Portal Workflows
## 04 API Specification

## 1. API Principles

PRT-01 APIs are presentation-layer APIs. Financial/compliance actions must route to owning source modules.

## 2. Portal APIs

### 2.1 GET `/prt1/me/dashboard?as_of_epoch={epoch}`
Read user dashboard.

### 2.2 GET `/prt1/client/status`
Read client source-truth status.

### 2.3 GET `/prt1/client/balances`
Read LED-backed balance display.

### 2.4 POST `/prt1/client/deposit-intents`
Route deposit intent request to DEP.

### 2.5 POST `/prt1/client/withdrawal-requests`
Route withdrawal request to WDR/LED controls.

### 2.6 POST `/prt1/client/quote-requests`
Route quote request to TRD.

### 2.7 POST `/prt1/client/quote-acceptance`
Route quote acceptance to TRD.

### 2.8 GET `/prt1/staff/worklist`
Read staff worklist.

### 2.9 POST `/prt1/staff/actions/{action_id}/submit`
Submit staff action to source module.

### 2.10 POST `/prt1/approvals/{approval_id}/approve`
Approve maker-checker item.

### 2.11 POST `/prt1/exports`
Create controlled export request with recipient, purpose, lawful/regulatory basis and source-side masking policy.

### 2.11A POST `/prt1/exports/{export_request_id}/download-token`
Issue recipient-bound single-use expiring download token after recheck.

Request evidence/report export.

### 2.12 GET `/prt1/incidents/context`
Read incident/freeze context.

## 3. Error Codes

| Code | Meaning |
|---|---|
| `PRT1_SOURCE_TRUTH_REQUIRED` | Source-truth status required |
| `PRT1_BACKEND_REVALIDATION_REQUIRED` | Backend revalidation required |
| `PRT1_PERMISSION_DENIED` | IAM permission denied |
| `PRT1_STEP_UP_REQUIRED` | MFA/step-up required |
| `PRT1_CFG_LOCKED` | Feature/licence locked |
| `PRT1_INCIDENT_FREEZE_ACTIVE` | Action blocked by incident/freeze |
| `PRT1_STATUS_NOT_FINAL` | Cannot display final status |
| `PRT1_MASKING_REQUIRED` | Sensitive data masked |
| `PRT1_EXPORT_APPROVAL_REQUIRED` | Export approval required |
| `PRT1_TIPPING_OFF_RISK` | Message/action blocked due to tipping-off risk |
| `PRT1_EXCHANGE_FEATURE_PROHIBITED` | Exchange UI prohibited |
| `PRT1_FRONTEND_ONLY_CONTROL_PROHIBITED` | Frontend-only control rejected |
| `PRT1_IDEMPOTENCY_CONFLICT` | Duplicate/conflicting submit |
| `PRT1_AUDIT_REQUIRED` | Audit event required |
| `PRT1_DISPLAY_NON_REGRESSION_REQUIRED` | Source status version/non-regression required |
| `PRT1_OVERLAY_PRECEDENCE_REQUIRED` | Freeze/revocation/reversal/restatement overlay required |
| `PRT1_OBJECT_AUTHORIZATION_FAILED` | Object-level access denied |
| `PRT1_SERVICE_ACCOUNT_RESCOPE_REQUIRED` | Service call must be end-user scoped |
| `PRT1_INVALIDATION_EPOCH_STALE` | Invalidation epoch stale/lost |
| `PRT1_EXPORT_SOURCE_MASKING_REQUIRED` | Masking must be source/policy-engine applied |
| `PRT1_EXPORT_DISCLOSURE_LOG_REQUIRED` | Recipient/purpose/basis required |
| `PRT1_EXPORT_TOKEN_INVALID` | Token expired/reused/not recipient-bound |
| `PRT1_EXPORT_RECHECK_FAILED` | Generation/download recheck failed |
| `PRT1_QUOTE_BINDING_FAILED` | Server quote ID/hash/economics mismatch |
| `PRT1_UNTRUSTED_BROWSER_INPUT` | Client-posted economics/hidden field rejected |
| `PRT1_UPLOAD_POLICY_FAILED` | Upload failed type/size/scan/sanitization |
| `PRT1_WEB_INTEGRITY_CONTROL_REQUIRED` | CSRF/clickjacking/session/output-encoding required |
| `PRT1_NOTIFICATION_SUPERSEDED` | Notification suppressed/superseded |
| `PRT1_STEP_UP_BINDING_REQUIRED` | Step-up must bind to action/economics |
| `PRT1_DISCLOSED_FEE_MISMATCH` | Fee display differs from source/charged fee |
| `PRT1_CLIENT_SAFE_REASON_REQUIRED` | Client-safe reason-code required |
| `PRT1_CORRELATION_REQUIRED` | Correlation ID required |
| `PRT1_SOURCE_UNAVAILABLE_DEGRADED` | Source unavailable must show degraded |

## 4. v1.1 Control APIs

### 4.1 POST `/internal/prt1/invalidation-events`

Receive freeze/revocation/restatement/reversal invalidation event.

### 4.2 POST `/internal/prt1/display/validate-truth`

Validate source version, overlay precedence and non-regression.

### 4.3 POST `/internal/prt1/object-authorize`

Validate object-level entitlement.

### 4.4 POST `/internal/prt1/notifications/reconcile-before-send`

Reconcile notification against current source truth.

### 4.5 POST `/internal/prt1/uploads/scan`

Validate and scan uploaded file.

### 4.6 POST `/internal/prt1/quote-acceptance/verify-binding`

Verify server quote ID/hash/economics binding.

