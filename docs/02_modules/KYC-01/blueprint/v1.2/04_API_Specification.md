# KYC-01 KYC / KYB Verification
## 04 API Specification

## 1. API Principles

All KYC-01 APIs use FND request/correlation ID, idempotency and standard error envelope.

Sensitive APIs require IAM-02 permission guard.

Sensitive evidence read/export emits SEC-01 audit.

---

## 2. Handoff / Case APIs

### 2.1 POST `/internal/kyc1/handoffs`

Receive CLT-01 handoff and create case.

### 2.2 GET `/kyc1/cases/{case_id}`

Read case.

### 2.3 GET `/kyc1/cases?application_id=...&client_id=...`

Search cases.

---

## 3. Evidence / Checklist APIs

### 3.1 POST `/kyc1/cases/{case_id}/evidence`

Add evidence reference.

### 3.2 GET `/kyc1/cases/{case_id}/checklist`

Read checklist.

### 3.3 PATCH `/kyc1/cases/{case_id}/checklist/{item_id}`

Update checklist item status.

---

## 4. Verification Result APIs

### 4.1 POST `/internal/kyc1/cases/{case_id}/vendor-results`

Receive vendor verification result.

### 4.2 POST `/kyc1/cases/{case_id}/manual-review`

Create manual review decision request.

### 4.3 POST `/kyc1/cases/{case_id}/edd-review`

Create EDD review decision.

---

## 5. UBO / Party APIs

### 5.1 POST `/kyc1/cases/{case_id}/ownership-structure`

Create/update ownership/control structure.

### 5.2 POST `/kyc1/cases/{case_id}/ubo-cases`

Create UBO/controller verification cases.

### 5.3 POST `/kyc1/cases/{case_id}/ownership-lookthrough/verify`

Run UBO look-through and indirect ownership aggregation.

### 5.4 GET `/kyc1/party-cases/{party_case_id}`

Read party verification case.

---

## 6. Vendor / Evidence Store APIs

### 6.1 GET `/kyc1/vendors/{vendor_id}/reliance-status`

Read vendor reliance/accreditation status.

### 6.2 POST `/internal/kyc1/vendor-results/{inbox_id}/validate-reliance`

Validate vendor result against reliance, confidence and validity rules.

### 6.3 POST `/internal/kyc1/evidence/{evidence_ref}/verify-hash`

Re-verify evidence hash with evidence store.

---

## 7. Outcome APIs

### 9.1 POST `/internal/kyc1/cases/{case_id}/compute-outcome`

Compute CDD outcome.

### 9.2 POST `/internal/kyc1/cases/{case_id}/publish-outcome`

Publish outcome to CLT-01.

### 7.3 GET `/internal/kyc1/cases/{case_id}/outcome`

Read outcome.

---

## 8. Periodic Review APIs

### 9.1 POST `/internal/kyc1/periodic-review/run`

Run periodic review job.

### 9.2 POST `/kyc1/cases/{case_id}/trigger-review`

Trigger manual review.

---

## 9. Evidence Export APIs

### 9.1 POST `/kyc1/evidence-exports`

Request evidence export.

### 9.2 GET `/kyc1/evidence-exports/{export_id}`

Read export status.

---

## 10. Error Codes

| Code | Meaning |
|---|---|
| `KYC1_HANDOFF_INVALID` | CLT handoff invalid |
| `KYC1_CASE_NOT_FOUND` | Case not found |
| `KYC1_REQUIRED_DOCUMENT_MISSING` | Required document missing |
| `KYC1_DOCUMENT_INVALID` | Document invalid |
| `KYC1_DOCUMENT_EXPIRED` | Document expired |
| `KYC1_IDENTITY_NOT_VERIFIED` | Identity verification failed/missing |
| `KYC1_ENTITY_NOT_VERIFIED` | Entity verification failed/missing |
| `KYC1_UBO_INCOMPLETE` | UBO threshold/verification incomplete |
| `KYC1_AUTHORISED_PARTY_NOT_VERIFIED` | Authorised party not verified |
| `KYC1_EDD_REQUIRED` | Enhanced due diligence required |
| `KYC1_EDD_NOT_APPROVED` | EDD not approved |
| `KYC1_MANUAL_REVIEW_REQUIRED` | Manual review required |
| `KYC1_APPROVAL_REQUIRED` | IAM-02 approval required |
| `KYC1_VENDOR_RESULT_INVALID` | Vendor result invalid |
| `KYC1_VENDOR_SOURCE_UNAUTHORISED` | Vendor source unauthorised |
| `KYC1_DUPLICATE_IDENTITY_UNRESOLVED` | Duplicate identity unresolved |
| `KYC1_OUTCOME_STALE` | Outcome stale |
| `KYC1_OUTCOME_PUBLISH_FAILED` | Outcome publication failed |
| `KYC1_SENSITIVE_READ_LOG_REQUIRED` | Sensitive read logging required |
| `KYC1_UBO_LOOKTHROUGH_INCOMPLETE` | UBO look-through incomplete |
| `KYC1_UNTRACEABLE_OWNERSHIP` | Ownership/control untraceable |
| `KYC1_TRUST_NOMINEE_ROLE_INCOMPLETE` | Trust/nominee role incomplete |
| `KYC1_VENDOR_NOT_ACCREDITED` | Vendor not accredited/approved |
| `KYC1_VENDOR_RECORDS_UNOBTAINABLE` | Underlying CDD records not obtainable |
| `KYC1_VENDOR_CONFIDENCE_BELOW_THRESHOLD` | Vendor result below threshold |
| `KYC1_VENDOR_RESULT_INCONCLUSIVE` | Vendor result inconclusive |
| `KYC1_VENDOR_RESULT_EXPIRED` | Vendor result validity expired |
| `KYC1_PROOFING_LEVEL_INSUFFICIENT` | Proofing assurance level insufficient |
| `KYC1_LIVENESS_REQUIRED` | Liveness/biometric binding required |
| `KYC1_SOW_SOF_REQUIRED` | Source-of-wealth/source-of-funds required |
| `KYC1_KYC_AML_CONTRACT_MISSING` | KYC/AML hard contract missing |
| `KYC1_EVIDENCE_STORE_CONTRACT_MISSING` | Evidence-store contract missing |
| `KYC1_EVIDENCE_HASH_MISMATCH` | Evidence hash mismatch |
| `KYC1_IDENTITY_APPLICATION_MISMATCH` | Verified identity/entity mismatches CLT application |
| `KYC1_HASH_BASIS_MISMATCH_CLT` | Verified identity hash basis not aligned with CLT-01 |
