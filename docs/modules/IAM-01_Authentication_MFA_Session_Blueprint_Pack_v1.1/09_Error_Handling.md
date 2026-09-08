# IAM-01 Authentication / MFA / Session  
## 09 Error Handling

## 1. Principles

1. Avoid account enumeration.
2. Never leak credential state.
3. Return stable error codes.
4. Use generic messages for login/reset.
5. Log safe internal reason codes.
6. Fail closed on auth control failure.
7. Include FND request/correlation ID.
8. Use server UTC.

---

## 2. Error Codes

| Code | Severity | User Message Style |
|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | Medium | Generic |
| `AUTH_MFA_REQUIRED` | Medium | Action required |
| `AUTH_MFA_FAILED` | Medium/High | Generic |
| `AUTH_MFA_ENROLMENT_REQUIRED` | High | Action required |
| `AUTH_SESSION_EXPIRED` | Medium | Re-auth required |
| `AUTH_SESSION_REVOKED` | Medium | Re-auth required |
| `AUTH_REFRESH_REUSE_DETECTED` | Critical | Re-auth required |
| `AUTH_ACCOUNT_LOCKED` | High | Safe/generic |
| `AUTH_RATE_LIMITED` | High | Try later |
| `AUTH_PASSWORD_POLICY_FAILED` | Medium | Policy guidance |
| `AUTH_RESET_TOKEN_INVALID` | Medium | Generic |
| `AUTH_PRIVILEGED_MFA_REQUIRED` | Critical/High | Action required |
| `AUTH_SERVICE_ACCOUNT_INVALID` | High | Generic |
| `AUTH_AUDIT_REQUIRED` | Critical | Service unavailable |
| `AUTH_TOKEN_LOGGING_BLOCKED` | Critical | Internal only |
| `AUTH_STEP_UP_REQUIRED` | High | Action required |
| `AUTH_STEP_UP_FAILED` | High | Generic |
| `AUTH_RECENT_AUTH_INVALID` | High | Re-auth required |
| `AUTH_MFA_RESET_APPROVAL_REQUIRED` | Critical/High | Approval required |
| `AUTH_ACCOUNT_FROZEN` | Critical/High | Access unavailable |
| `AUTH_SESSION_ANOMALY` | High/Critical | Re-auth required |
| `AUTH_CONCURRENT_SESSION_LIMIT` | High | Session limit reached |
| `AUTH_BREACHED_PASSWORD` | Medium | Password not allowed |
| `AUTH_PASSWORD_REUSE_BLOCKED` | Medium | Password not allowed |

---

## 3. Account Enumeration Protection

For login and reset request:

1. Do not reveal whether identifier exists.
2. Use same response shape.
3. Normalise response timing where feasible.
4. Rate-limit by multiple scopes.
5. Log internal reason safely.

---

## 4. Fail-Closed Cases

Authentication fails closed when:

1. Password hash verification unavailable.
2. MFA secret unavailable.
3. Time source unavailable for token expiry.
4. Session store unavailable.
5. Audit/outbox required but unavailable.
6. Rate-limit service unavailable where configured fail-closed.
7. Privileged MFA requirement unresolved.
8. Service account credential validation unavailable.
9. Step-up assertion cannot be verified for sensitive action.
10. Freeze/suspension status check fails where fail-closed policy applies.
11. Mid-session anomaly is high risk.
12. Session policy cannot be resolved.

---

## 5. Safe Messages

| Scenario | Safe Message |
|---|---|
| Invalid login | Invalid login details or additional verification required |
| Reset request | If eligible, instructions will be sent |
| MFA failed | Verification failed |
| Locked | Account cannot be accessed at this time |
| Token expired | Please sign in again |
| Service issue | Service temporarily unavailable |
| Step-up required | Additional verification required |
| Frozen/suspended account | Account cannot be accessed at this time |
| Session anomaly | Please verify your identity again |
| Password breached/reused | Choose a different password |
