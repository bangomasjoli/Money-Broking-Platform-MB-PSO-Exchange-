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

Read handoff delivery status.

### 5.4 POST `/internal/clt1/applications/{application_id}/outcomes`

Receive KYC/KYB, AML/sanctions, PEP/adverse-media, or risk outcome.

### 5.5 GET `/internal/clt1/applications/{application_id}/outcome-status`

Read aggregate CDD/screening/risk outcome.

### 5.6 POST `/internal/clt1/clients/{client_id}/status-feedback`

Receive ongoing monitoring feedback from KYC/AML/risk/CFG modules.

---

## 6. Authorised Party / Related Party / Data Protection APIs

### 6.1 POST `/clt1/clients/{client_id}/authorised-parties`

Add authorised signatory, director, controller, UBO, client admin, client maker or client approver.

### 6.2 POST `/internal/clt1/authorised-parties/{party_id}/outcomes`

Receive authorised-party screening outcome.

### 6.3 GET `/clt1/clients/{client_id}/related-parties`

Read related-party graph where authorised.

### 6.4 POST `/clt1/data-protection/requests`

Create DSAR, rectification, erasure, restriction or portability request.

---

## 7. Evidence / Export APIs

### 7.1 POST `/clt1/evidence-exports`

Request evidence export.

### 7.2 GET `/clt1/evidence-exports/{export_id}`

Read export status.

---

## 8. Error Codes

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
| `CLT1_CDD_OUTCOME_REQUIRED` | CDD/screening/risk outcome required |
| `CLT1_CDD_OUTCOME_FAILED` | CDD outcome failed |
| `CLT1_AML_SANCTIONS_HIT` | Sanctions hit |
| `CLT1_PEP_ADVERSE_MEDIA_REVIEW_REQUIRED` | PEP/adverse-media review required |
| `CLT1_RISK_RATING_REQUIRED` | Risk rating required |
| `CLT1_RISK_REJECTED` | Risk rejected/prohibited |
| `CLT1_AUTHORISED_PARTY_SCREENING_REQUIRED` | Authorised-party screening required |
| `CLT1_UBO_THRESHOLD_REQUIRED` | UBO threshold/identification required |
| `CLT1_HANDOFF_FAILED` | Handoff failed |
| `CLT1_HANDOFF_DEADLETTERED` | Handoff dead-lettered/escalated |
| `CLT1_CLASS_EVIDENCE_UNVERIFIED` | Class evidence not verified |
| `CLT1_ONGOING_MONITORING_HIT` | Downstream monitoring hit |
| `CLT1_REVIEW_EXPIRED` | Periodic review expired |
| `CLT1_VERIFIED_IDENTITY_DUPLICATE` | Active duplicate verified identity |
| `CLT1_DSAR_RETAINED_LEGAL_BASIS` | Retained due legal/regulatory basis |
