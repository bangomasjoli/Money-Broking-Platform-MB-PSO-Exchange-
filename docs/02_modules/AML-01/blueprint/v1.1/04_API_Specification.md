# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 04 API Specification

## 1. API Principles

All AML-01 APIs use FND request/correlation ID, idempotency and standard error envelope.

Sensitive APIs require IAM-02 permission guard.

Sensitive evidence/STR read/export emits SEC-01 audit.

---

## 2. Handoff / Case APIs

### 2.1 POST `/internal/aml1/handoffs`

Receive CLT/KYC handoff and create screening case.

### 2.2 GET `/aml1/cases/{case_id}`

Read screening case.

### 2.3 GET `/aml1/cases?client_id=...&party_id=...`

Search screening cases.

---

## 3. Screening Result APIs

### 3.1 POST `/internal/aml1/cases/{case_id}/vendor-results`

Receive vendor screening result.

### 3.2 POST `/internal/aml1/cases/{case_id}/screen`

Run screening.

### 3.3 POST `/aml1/cases/{case_id}/match-review`

Create match review decision.

---

## 4. Outcome APIs

### 4.1 POST `/internal/aml1/cases/{case_id}/compute-outcome`

Compute AML outcome.

### 4.2 POST `/internal/aml1/cases/{case_id}/publish-outcome`

Publish outcome to CLT-01.

### 4.3 POST `/internal/aml1/cases/{case_id}/trigger-kyc-edd`

Send EDD/remediation trigger to KYC-01.

---

## 5. Rescreening APIs

### 5.1 POST `/internal/aml1/rescreening/list-update`

Start list-update rescreening.

### 5.2 POST `/internal/aml1/rescreening/periodic`

Start periodic rescreening.

### 5.3 POST `/internal/aml1/rescreening/profile-change`

Start profile-change rescreening.

---

## 6. Travel Rule APIs

### 6.1 POST `/internal/aml1/travel-rule/screen`

Validate and screen Travel Rule party data.

### 6.2 GET `/internal/aml1/travel-rule/{screening_id}`

Read Travel Rule screening result.

---

## 7. STR / Suspicion APIs

### 7.1 POST `/aml1/str-cases`

Create restricted STR/suspicion case.

### 7.2 POST `/aml1/str-cases/{case_id}/decision`

Record MLRO/Compliance STR decision.

### 7.3 GET `/aml1/str-cases/{case_id}`

Read restricted STR case.

---

## 8. Evidence Export APIs

### 8.1 POST `/aml1/evidence-exports`

Request screening/STR evidence export.

### 8.2 GET `/aml1/evidence-exports/{export_id}`

Read export status.

---

## 9. Pre-Transaction / List / STR APIs

### 9.1 POST `/internal/aml1/pre-transaction/screen`

Run synchronous pre-transaction sanctions gate.

### 9.2 POST `/internal/aml1/list-updates`

Receive list update and start SLA/interim blocking.

### 9.3 POST `/internal/aml1/ownership-sanctions/screen`

Run ownership-based sanctions / 50 percent rule screening.

### 9.4 POST `/aml1/str-cases/{case_id}/clock/start`

Start suspicion-to-MLRO/FIU filing clock.

### 9.5 POST `/aml1/false-positives/{decision_id}/reattest`

Re-attest standing sanctions false positive.

### 9.6 POST `/aml1/delisting-reviews`

Create de-listing/unblock review.

---

## 10. Error Codes

| Code | Meaning |
|---|---|
| `AML1_HANDOFF_INVALID` | Handoff invalid |
| `AML1_CASE_NOT_FOUND` | Case not found |
| `AML1_SCREENING_OUTCOME_PENDING` | Outcome pending |
| `AML1_SCREENING_OUTCOME_STALE` | Outcome stale |
| `AML1_SANCTIONS_HIT` | Sanctions true hit |
| `AML1_PEP_REVIEW_REQUIRED` | PEP review required |
| `AML1_ADVERSE_MEDIA_REVIEW_REQUIRED` | Adverse-media review required |
| `AML1_MATCH_REVIEW_REQUIRED` | Match review required |
| `AML1_FALSE_POSITIVE_REASON_REQUIRED` | False-positive reason missing |
| `AML1_TRUE_HIT_ESCALATION_REQUIRED` | True-hit escalation required |
| `AML1_VENDOR_RESULT_INVALID` | Vendor result invalid |
| `AML1_VENDOR_SOURCE_UNAUTHORISED` | Vendor source unauthorised |
| `AML1_LIST_VERSION_MISSING` | List/provider version missing |
| `AML1_LIST_UPDATE_RESREEN_REQUIRED` | List update rescreen required |
| `AML1_TRAVEL_RULE_DATA_MISSING` | Travel Rule required data missing |
| `AML1_TRAVEL_RULE_HIT` | Travel Rule screening hit |
| `AML1_STR_ACCESS_RESTRICTED` | STR access restricted |
| `AML1_TIPPING_OFF_BLOCKED` | Notification/action blocked for tipping-off risk |
| `AML1_OUTCOME_PUBLISH_FAILED` | Outcome publication failed |
| `AML1_SENSITIVE_READ_LOG_REQUIRED` | Sensitive read logging required |
| `AML1_PRE_TRANSACTION_GATE_REQUIRED` | Pre-transaction sanctions gate required |
| `AML1_PRE_TRANSACTION_SCREENING_STALE` | Transaction screening stale |
| `AML1_LIST_UPDATE_SLA_BREACHED` | List update rescreen SLA breached |
| `AML1_LIST_FRESHNESS_UNKNOWN` | List freshness cannot be proven |
| `AML1_INTERIM_BLOCK_ACTIVE` | Interim block active pending rescreen |
| `AML1_LIST_COVERAGE_INCOMPLETE` | Mandatory sanctions list coverage incomplete |
| `AML1_OWNERSHIP_50_RULE_HIT` | Ownership-based sanctions threshold met |
| `AML1_KYC_UBO_GRAPH_STALE` | KYC UBO graph stale/incomplete |
| `AML1_SCREENING_INPUT_INCOMPLETE` | Minimum screening input missing |
| `AML1_STR_CLOCK_REQUIRED` | STR statutory/internal clock required |
| `AML1_STR_DEADLINE_BREACH` | STR deadline breach |
| `AML1_PENDING_STR_POLICY_REQUIRED` | Pending STR transaction policy required |
| `AML1_SANCTIONS_FP_DUAL_REVIEW_REQUIRED` | Sanctions FP requires dual review |
| `AML1_STANDING_FP_REATTEST_REQUIRED` | Standing FP re-attestation required |
| `AML1_THRESHOLD_FLOOR_BREACH` | Match threshold below floor |
| `AML1_OUTCOME_HASH_INVALID` | Outcome payload hash invalid |
| `AML1_OUTCOME_REVOKED` | AML outcome revoked by new hit/list update |
| `AML1_PEP_RCA_REQUIRED` | PEP/RCA handling required |
| `AML1_HIGH_RISK_JURISDICTION` | High-risk jurisdiction handling required |
| `AML1_DELISTING_REVIEW_REQUIRED` | Controlled unblock review required |
| `AML1_TRAVEL_RULE_THRESHOLD_REQUIRED` | Travel Rule applicability threshold required |
| `AML1_TRAVEL_RULE_SUNRISE_REVIEW` | Counterparty VASP sunrise handling required |
