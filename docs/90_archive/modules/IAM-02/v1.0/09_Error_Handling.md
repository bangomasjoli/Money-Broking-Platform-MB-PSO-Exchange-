# IAM-02 RBAC / Permission Guard / SoD  
## 09 Error Handling

## 1. Principles

1. Default deny.
2. Fail closed on missing policy.
3. No sensitive data leakage.
4. Stable error codes.
5. Audit sensitive denies and approvals.
6. Do not reveal hidden permissions to unauthorised users.
7. Include FND request/correlation ID.

---

## 2. Error Codes

| Code | Severity | User Message Style |
|---|---|---|
| `IAM2_PERMISSION_DENIED` | High | Generic |
| `IAM2_PERMISSION_UNKNOWN` | High | Generic |
| `IAM2_ROLE_UNKNOWN` | Medium | Generic |
| `IAM2_APPROVAL_REQUIRED` | Medium | Action required |
| `IAM2_STEP_UP_REQUIRED` | High | Additional verification required |
| `IAM2_STEP_UP_INVALID` | High | Re-auth required |
| `IAM2_SELF_APPROVAL_BLOCKED` | Critical/High | Generic/blocked |
| `IAM2_SOD_CONFLICT` | Critical/High | Generic/blocked |
| `IAM2_DELEGATION_INVALID` | High | Generic |
| `IAM2_TEMP_PERMISSION_EXPIRED` | Medium | Permission expired |
| `IAM2_BREAK_GLASS_REQUIRED` | High | Emergency approval required |
| `IAM2_BREAK_GLASS_EXPIRED` | High | Emergency access expired |
| `IAM2_LICENCE_LOCKED_PERMISSION` | Critical | Blocked |
| `IAM2_PERMISSION_CACHE_STALE` | High | Retry/re-auth required |
| `IAM2_SERVICE_ACCOUNT_APPROVER_BLOCKED` | Critical | Blocked |
| `IAM2_AUDIT_REQUIRED` | Critical | Service unavailable |
| `IAM2_APPROVAL_EXPIRED` | Medium | Approval expired |
| `IAM2_APPROVER_NOT_ELIGIBLE` | High | Not eligible |
| `IAM2_CLIENT_APPROVAL_REQUIRED` | High | Client approval required |

---

## 3. Fail-Closed Cases

IAM-02 fails closed when:

1. Permission is unknown.
2. Role is unknown.
3. Licence-lock state unavailable.
4. Approval policy unavailable.
5. SoD matrix unavailable.
6. IAM-01 step-up verification unavailable for required step-up.
7. Permission cache stale and cannot refresh.
8. Audit/outbox cannot persist required event.
9. Delegation expiry unknown.
10. Temporary permission expiry unknown.
11. Break-glass expiry unknown.
12. Client-side approval state unknown.

---

## 4. Safe Messages

| Scenario | Safe Message |
|---|---|
| No permission | You are not authorised to perform this action |
| Approval needed | Approval is required before this action can proceed |
| Step-up needed | Additional verification is required |
| SoD conflict | This action cannot be completed due to control restrictions |
| Licence locked | This feature is not available |
| Break-glass expired | Emergency access is no longer active |
| System control unavailable | Service temporarily unavailable |
