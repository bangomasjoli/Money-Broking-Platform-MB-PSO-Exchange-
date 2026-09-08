# PRT-01 Client / Staff / Admin Portal Workflows
## 04 API Specification

## 1. API Principles

PRT-01 APIs are presentation-layer APIs. Financial/compliance actions must route to owning source modules.

## 2. Portal APIs

### 2.1 GET `/prt1/me/dashboard`
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
