# KYC-01 KYC / KYB Verification
## 09 Error Handling

## 1. Principles

1. Missing required verification blocks pass.
2. Stale outcome is not pass.
3. Handoff delivery is not outcome.
4. Manual override requires IAM-02 maker-checker.
5. Vendor result requires source authentication and payload integrity.
6. Sensitive evidence read/export fails closed if SEC-01 logging fails.
7. Error response does not expose sensitive evidence.

---

## 2. Error Codes

| Code | Severity | Handling |
|---|---|---|
| `KYC1_HANDOFF_INVALID` | High | Reject/deadletter |
| `KYC1_CASE_NOT_FOUND` | Medium | Not found |
| `KYC1_REQUIRED_DOCUMENT_MISSING` | High | Block pass |
| `KYC1_DOCUMENT_INVALID` | High | Block pass |
| `KYC1_DOCUMENT_EXPIRED` | High | Stale/remediation |
| `KYC1_IDENTITY_NOT_VERIFIED` | Critical/High | Block pass |
| `KYC1_ENTITY_NOT_VERIFIED` | Critical/High | Block pass |
| `KYC1_UBO_INCOMPLETE` | Critical/High | Block pass |
| `KYC1_AUTHORISED_PARTY_NOT_VERIFIED` | Critical/High | Block authority/outcome |
| `KYC1_EDD_REQUIRED` | High | Route EDD |
| `KYC1_EDD_NOT_APPROVED` | Critical/High | Block pass |
| `KYC1_MANUAL_REVIEW_REQUIRED` | High | Hold |
| `KYC1_APPROVAL_REQUIRED` | High | Approval required |
| `KYC1_VENDOR_RESULT_INVALID` | High | Reject |
| `KYC1_VENDOR_SOURCE_UNAUTHORISED` | Critical | Reject/alert |
| `KYC1_DUPLICATE_IDENTITY_UNRESOLVED` | Critical/High | Block pass |
| `KYC1_OUTCOME_STALE` | High | Publish stale |
| `KYC1_OUTCOME_PUBLISH_FAILED` | Critical/High | Retry/deadletter/escalate |
| `KYC1_SENSITIVE_READ_LOG_REQUIRED` | Critical | Deny read/export |
| `KYC1_UBO_LOOKTHROUGH_INCOMPLETE` | Critical/High | EDD/fail |
| `KYC1_UNTRACEABLE_OWNERSHIP` | Critical/High | EDD/fail |
| `KYC1_TRUST_NOMINEE_ROLE_INCOMPLETE` | High | Remediation/EDD |
| `KYC1_VENDOR_NOT_ACCREDITED` | Critical/High | Reject result |
| `KYC1_VENDOR_RECORDS_UNOBTAINABLE` | Critical/High | Reject reliance |
| `KYC1_VENDOR_CONFIDENCE_BELOW_THRESHOLD` | High | Remediation/manual review |
| `KYC1_VENDOR_RESULT_INCONCLUSIVE` | High | Not pass |
| `KYC1_VENDOR_RESULT_EXPIRED` | High | Stale/reverify |
| `KYC1_PROOFING_LEVEL_INSUFFICIENT` | High | Not pass |
| `KYC1_LIVENESS_REQUIRED` | High | Request liveness |
| `KYC1_SOW_SOF_REQUIRED` | High | Request SoW/SoF |
| `KYC1_KYC_AML_CONTRACT_MISSING` | Critical | Block combined readiness |
| `KYC1_EVIDENCE_STORE_CONTRACT_MISSING` | Critical | Block evidence use |
| `KYC1_EVIDENCE_HASH_MISMATCH` | Critical | Block + alert |
| `KYC1_IDENTITY_APPLICATION_MISMATCH` | High/Critical | Remediation/EDD |
| `KYC1_HASH_BASIS_MISMATCH_CLT` | High/Critical | Reconcile/block duplicate decision |

---

## 3. Fail-Closed Cases

1. Required document missing.
2. Identity/entity verification missing.
3. UBO/controller verification incomplete.
4. Authorised-party verification missing.
5. EDD required but not approved.
6. Vendor result unauthenticated.
7. Manual override lacks approval.
8. Outcome publication to CLT fails after retries.
9. Sensitive read log fails.
10. Ownership/control not traced to ultimate natural persons.
11. Vendor reliance not approved or result below threshold/inconclusive/expired.
12. Required proofing assurance method missing.
13. Evidence-store contract unavailable or hash mismatch.
14. KYC/AML hard contract missing for combined CDD readiness.
