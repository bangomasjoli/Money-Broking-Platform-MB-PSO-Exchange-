# KYC-01 KYC / KYB Verification
## 13 Reconciliation Design

## 1. Purpose

KYC-01 reconciliation detects missing cases, incomplete verification, stale outcomes, missing publications, unauthorised manual overrides and evidence gaps.

---

## 2. Reconciliation Types

| Reconciliation | Source A | Source B | Purpose |
|---|---|---|---|
| CLT handoff vs KYC case | CLT handoff | kyc_case | Detect missing case |
| KYC case vs outcome | kyc_case | cdd_outcome | Detect missing outcome |
| Outcome vs checklist | cdd_outcome | document_checklist_item | Detect pass with missing docs |
| Outcome vs UBO | cdd_outcome | ownership_node | Detect pass with missing UBO |
| Outcome vs manual approval | cdd_outcome/manual_review | IAM-02 approval | Detect unauthorised manual outcome |
| Vendor inbox vs result | vendor_result_inbox | verification_result | Detect unprocessed vendor result |
| Outcome publication | cdd_outcome | outcome_publication/CLT | Detect unpublished outcome |
| Periodic review | periodic_review_schedule | cdd_outcome | Detect stale/overdue review |
| Sensitive access | evidence_access_log | SEC-01 | Detect unlogged read/export |

---

## 3. Scheduled Jobs

1. CLT handoff without case scan.
2. Case without outcome scan.
3. Pass outcome with missing required document scan.
4. Pass outcome with missing UBO/controller scan.
5. Manual outcome without approval scan.
6. Vendor result dead-letter scan.
7. Outcome publication failure scan.
8. Periodic review overdue scan.
9. Stale evidence but pass outcome scan.
10. Sensitive read/export missing audit scan.

---

## 4. Critical Findings

| Finding | Severity |
|---|---|
| Pass outcome with missing document | Critical |
| Pass outcome with missing UBO/controller | Critical |
| Manual pass without IAM-02 approval | Critical |
| Vendor result unauthenticated but processed | Critical |
| Stale outcome still pass/current | Critical |
| Outcome not published to CLT | Critical/High |
| Sensitive evidence read without SEC-01 audit | Critical |
| Direct DB outcome edit suspected | Critical |

---

## 5. Output

Each reconciliation run produces:

1. run ID.
2. checked counts.
3. findings.
4. severity.
5. affected case/outcome IDs.
6. SEC-01 audit refs.
7. recommended action.
8. reviewer sign-off where required.
