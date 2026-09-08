# CLT-01 Client Onboarding / Client Profile
## 09 Error Handling

## 1. Principles

1. Retail default fails closed.
2. Unknown client class holds/denies progression.
3. CFG-01 denial blocks progression.
4. Final approval fails closed on missing handoffs.
5. Sensitive read fails closed if SEC-01 logging fails.
6. Error messages do not disclose sensitive duplicate/risk data.
7. All errors include request/correlation ID.

---

## 2. Error Codes

| Code | Severity | Handling |
|---|---|---|
| `CLT1_APPLICATION_NOT_FOUND` | Medium | Not found |
| `CLT1_CLIENT_NOT_FOUND` | Medium | Not found |
| `CLT1_RETAIL_LOCKED` | High | Block/hold |
| `CLT1_CLIENT_CLASS_UNKNOWN` | High | Hold |
| `CLT1_CLIENT_CLASS_NOT_ALLOWED` | High | Block/hold |
| `CLT1_CFG_GATE_DENIED` | High | Deny |
| `CLT1_MANDATORY_FIELD_MISSING` | Medium | Return validation |
| `CLT1_DUPLICATE_REVIEW_REQUIRED` | High | Hold |
| `CLT1_KYC_HANDOFF_REQUIRED` | Critical/High | Block approval |
| `CLT1_AML_HANDOFF_REQUIRED` | Critical/High | Block approval |
| `CLT1_APPROVAL_REQUIRED` | High | Approval required |
| `CLT1_SELF_APPROVAL_BLOCKED` | Critical/High | Block |
| `CLT1_SENSITIVE_READ_LOG_REQUIRED` | Critical | Deny read/export |
| `CLT1_STATUS_BLOCKED` | High | Deny |
| `CLT1_MANDATE_REQUIRED` | High | Block downstream |
| `CLT1_MANDATE_EXPIRED` | High | Block mandate action |
| `CLT1_AUTHORISED_USER_NOT_ALLOWED` | High | Deny |

---

## 3. Fail-Closed Cases

1. CFG-01 gate unavailable.
2. Retail default lock unknown.
3. Client class unknown.
4. KYC/KYB handoff missing.
5. AML handoff missing.
6. Duplicate review unresolved.
7. IAM-02 approval unavailable.
8. SEC-01 audit unavailable for sensitive read/export.
9. Client status unknown.
10. Mandate status unknown.

---

## 4. Safe Messages

| Scenario | Message |
|---|---|
| Retail locked | This onboarding type is not currently supported |
| Missing information | Required information is missing |
| Approval needed | Approval is required |
| Duplicate review | Additional review is required |
| Status blocked | Client status does not allow this action |
| Sensitive read denied | You are not authorised to access this profile data |
