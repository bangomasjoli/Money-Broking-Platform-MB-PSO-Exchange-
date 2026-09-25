# ACC-01 Account Structure
## 09 Error Handling

## 1. Principles

1. Fail closed: unreadable peer, missing row, malformed peer response, unknown environment ⇒ deny or `unknown`, never allow.
2. Errors include request/correlation ID (FND envelope).
3. Client-facing errors never disclose another client's data or whether an account exists outside the caller's authority (existence-oracle rule, file 04 §5).
4. A capability/status denial is never reported as a permission denial (Role Matrix §3.7 rule 4).
5. Error messages carry no PII and no internal identifiers of other clients.
6. Internal IAM-02 error codes (`IAM2_*`) are translated, not leaked.

## 2. Error codes

| Code | HTTP | Severity | Handling |
|---|---:|---|---|
| `ACC1_MASTER_ACCOUNT_NOT_FOUND` | 404 | Medium | Not found (staff/internal only) |
| `ACC1_SUBACCOUNT_NOT_FOUND` | 404 | Medium | Not found (staff/internal only) |
| `ACC1_CHANGE_REQUEST_NOT_FOUND` | 404 | Medium | |
| `ACC1_RESTRICTION_NOT_FOUND` | 404 | Medium | |
| `ACC1_CLIENT_NOT_ELIGIBLE` | 409 | High | Client status not in {`active`,`active_limited`} |
| `ACC1_CLIENT_CLASS_NOT_ALLOWED` | 409 | High | Retail/unknown class (retail lock) |
| `ACC1_CLIENT_LOOKUP_UNAVAILABLE` | 503 | High | CLT-01 unreadable ⇒ deny |
| `ACC1_MASTER_ACCOUNT_LIMIT_REACHED` | 409 | Medium | Configured per-client limit |
| `ACC1_SUBACCOUNT_LIMIT_REACHED` | 409 | Medium | Configured per-master limit |
| `ACC1_DUPLICATE_SUBACCOUNT_NAME` | 409 | Medium | Unique among non-terminal siblings |
| `ACC1_PURPOSE_INVALID` | 422 | Medium | Not in the enumerated set |
| `ACC1_OWNERSHIP_IMMUTABLE` | 409 | Critical | Owner/identity/purpose change refused; audited |
| `ACC1_STATUS_TRANSITION_INVALID` | 409 | High | Not a legal transition |
| `ACC1_PARENT_NOT_USABLE` | 409 | High | Subaccount creation under a `suspended`/`frozen`/`closing`/`closed` master |
| `ACC1_DEFAULT_SUBACCOUNT_PROTECTED` | 409 | High | Default cannot close independently |
| `ACC1_ACCOUNT_NOT_ACTIVE` | 409 | High | Action requires a usable target |
| `ACC1_SCOPE_NOT_APPLICABLE` | 422 | Medium | e.g. `login_block` (principal-level, not an account scope) |
| `ACC1_RESTRICTION_INVALID` | 422 | Medium | Kind/scope combination illegal, missing reason, `effective_until` on an authority source |
| `ACC1_RESTRICTION_LIFT_BLOCKED` | 409 | High | Missing evidence, or authority-sourced without release evidence |
| `ACC1_CLOSURE_BLOCKED` | 409 | High | Attestation `blocked`/`unavailable`/stale, subaccounts remain, authority restriction active. Body lists attester outcomes as codes |
| `ACC1_CLOSURE_ATTESTERS_UNCONFIGURED` | 409 | High | Empty attester set ⇒ closure disabled (fail closed) |
| `ACC1_APPROVAL_REQUIRED` | 403 | High | No approval bound to the request |
| `ACC1_APPROVAL_INVALID` | 403 | Critical | `execute-verify` non-affirmative (token invalid/stale/consumed, payload mismatch) |
| `ACC1_SELF_APPROVAL_BLOCKED` | 403 | Critical | Maker attempting to act as own checker |
| `ACC1_APPLY_VERIFICATION_UNCERTAIN` | 409 | Critical | Crash-window: token state unknown; new request required |
| `ACC1_CHANGE_REQUEST_STATE_INVALID` | 409 | Medium | Apply/cancel in the wrong state |
| `ACC1_CHANGE_REQUEST_EXPIRED` | 410 | Medium | TTL lapsed |
| `ACC1_PAYLOAD_INVALID` | 400 | Medium | Schema violation (also `additionalProperties`) |
| `ACC1_VERSION_CONFLICT` | 409 | Medium | Optimistic concurrency |
| `ACC1_IDEMPOTENCY_CONFLICT` | 409 | Medium | Same key, different body |
| `ACC1_IDEMPOTENCY_KEY_REQUIRED` | 400 | Medium | |
| `ACC1_AUDIT_REQUIRED` | 503 | Critical | SEC-01 unrecordable ⇒ mutation refused |
| `ACC1_PERMISSION_UNAVAILABLE` | 503 | High | IAM-02 unreachable ⇒ deny |
| `ACC1_INTERNAL_AUTH_REQUIRED` | 401 | High | Missing/invalid per-module capability secret |
| `ACC1_SERVICE_UNAVAILABLE` | 503 | High | DB/pool unavailable — never degrades to a 200 |
| `ACC1_CONFIG_INVALID` | 500 (boot) | Critical | Boot refusal: missing/duplicate consumer secrets, unknown environment misuse, empty required base URLs |

## 3. Mapping to the Master Error Code Set (System Rules §26)

ACC-01 does not raise the master codes itself — it *supplies the reason*; the consuming module raises its master code.

| `resolve` outcome | Consumer raises |
|---|---|
| `effective_status = frozen` or `blocked_scopes ∋ full_account_freeze` | `ACCOUNT_FROZEN` |
| `resolve.client_status = suspended` | `CLIENT_SUSPENDED` (same code; the client-level cause is visible in `client_status`) |
| `resolve.client_status = restricted` / `active_limited` | No master code exists for these; consumer-specific denial naming the ACC-01 status (raise as OQ-06 if a master code is wanted). `CLIENT_FROZEN` is **not** used — CLT-01 has no `frozen` client status |
| `effective_status ∈ {suspended, restricted, closing, closed, unknown}` | consumer-specific denial with the ACC-01 status as reason (not `PERMISSION_DENIED`, not `FEATURE_DISABLED`) |

A denial attributed to ACC-01 status is never surfaced as `PERMISSION_DENIED` or `FEATURE_DISABLED` (Role Matrix §3.7 rule 4; test ACC1-T-062).

## 4. Anti-oracle rules

- Client routes: unknown, foreign, unauthorised and inactive-membership cases are indistinguishable (200 empty / 404).
- Staff/internal routes may return 404 (authenticated, authorised callers).
- `scope-validate` returns `consistent:false` with no detail about *which* element failed.
