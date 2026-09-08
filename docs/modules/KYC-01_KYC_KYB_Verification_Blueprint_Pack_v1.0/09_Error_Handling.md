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
