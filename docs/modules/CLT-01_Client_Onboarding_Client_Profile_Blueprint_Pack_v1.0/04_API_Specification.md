# CLT-01 Client Onboarding / Client Profile
## 04 API Specification

## 1. API Principles

All CLT-01 APIs use FND standard envelope, request ID, correlation ID, idempotency, and standard errors.

Sensitive APIs require IAM-02 permission guard.

Sensitive actions emit SEC-01 audit.

Feature/client-class gate uses CFG-01.

---

## 2. Application APIs

### 2.1 POST `/clt1/applications`

Create onboarding application.

### 2.2 GET `/clt1/applications/{application_id}`

Read application.

### 2.3 PATCH `/clt1/applications/{application_id}`

Update draft application.

### 2.4 POST `/clt1/applications/{application_id}/classify`

Classify client type/class.

### 2.5 POST `/clt1/applications/{application_id}/submit`

Submit application.

### 2.6 POST `/clt1/applications/{application_id}/approve`

Final approval request/decision.

### 2.7 POST `/clt1/applications/{application_id}/reject`

Reject application.

### 2.8 POST `/clt1/applications/{application_id}/hold`

Hold application.

---

## 3. Client Profile APIs

### 3.1 GET `/clt1/clients/{client_id}`

Read client profile.

### 3.2 PATCH `/clt1/clients/{client_id}`

Request/update profile amendment.

### 3.3 POST `/clt1/clients/{client_id}/suspend`

Suspend client.

### 3.4 POST `/clt1/clients/{client_id}/close`

Close client.

### 3.5 GET `/internal/clt1/clients/{client_id}/status`

Internal current client status check for downstream modules.

---

## 4. Authorised User / Mandate APIs

### 4.1 POST `/clt1/clients/{client_id}/authorised-users`

Add authorised user.

### 4.2 PATCH `/clt1/clients/{client_id}/authorised-users/{user_id}`

Update authorised user.

### 4.3 POST `/clt1/clients/{client_id}/mandates`

Create/update mandate.

### 4.4 GET `/clt1/clients/{client_id}/mandates/current`

Read current mandate.

---

## 5. Handoff APIs

### 5.1 POST `/internal/clt1/applications/{application_id}/handoff/kyc-kyb`

Create KYC/KYB handoff.

### 5.2 POST `/internal/clt1/applications/{application_id}/handoff/aml`

Create AML/sanctions handoff.

### 5.3 GET `/internal/clt1/applications/{application_id}/handoff-status`

Read handoff status.

---

## 6. Evidence / Export APIs

### 6.1 POST `/clt1/evidence-exports`

Request evidence export.

### 6.2 GET `/clt1/evidence-exports/{export_id}`

Read export status.

---

## 7. Error Codes

| Code | Meaning |
|---|---|
| `CLT1_APPLICATION_NOT_FOUND` | Application not found |
| `CLT1_CLIENT_NOT_FOUND` | Client not found |
| `CLT1_RETAIL_LOCKED` | Retail onboarding locked |
| `CLT1_CLIENT_CLASS_UNKNOWN` | Client class missing/unknown |
| `CLT1_CLIENT_CLASS_NOT_ALLOWED` | Client class not allowed |
| `CLT1_CFG_GATE_DENIED` | CFG-01 gate denied |
| `CLT1_MANDATORY_FIELD_MISSING` | Required field missing |
| `CLT1_DUPLICATE_REVIEW_REQUIRED` | Duplicate review required |
| `CLT1_KYC_HANDOFF_REQUIRED` | KYC/KYB handoff required |
| `CLT1_AML_HANDOFF_REQUIRED` | AML handoff required |
| `CLT1_APPROVAL_REQUIRED` | IAM-02 approval required |
| `CLT1_SELF_APPROVAL_BLOCKED` | Self approval blocked |
| `CLT1_SENSITIVE_READ_LOG_REQUIRED` | SEC-01 sensitive read log required |
| `CLT1_STATUS_BLOCKED` | Client status blocks action |
| `CLT1_MANDATE_REQUIRED` | Mandate required |
| `CLT1_MANDATE_EXPIRED` | Mandate expired |
| `CLT1_AUTHORISED_USER_NOT_ALLOWED` | User not authorised |
