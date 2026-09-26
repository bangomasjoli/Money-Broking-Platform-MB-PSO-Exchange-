# ACC-01 Account Structure
## 09 Error Handling (v0.3)

## 1. Principles

1. Fail closed: unreadable peer, missing row, malformed peer response, unsatisfied dependency prerequisite ⇒ deny or `unknown`, never allow. (An invalid `ENVIRONMENT` value refuses boot; the environment is recorded, never a branch — ACC-REQ-035.)
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
| `ACC1_CLIENT_NOT_ELIGIBLE` | 409 | High | Client status not in {`active`,`active_limited`} — a local structural backstop, **not** an eligibility ruling |
| `ACC1_CLIENT_CLASS_NOT_ALLOWED` | 409 | High | Retail/unknown class — local backstop; CLT-01 owns classification |
| `ACC1_DEPENDENCY_NOT_SATISFIED` | 503 | High | **(R2)** A named dependency prerequisite (`DEP-IAM-ACTOR-BINDING`, `DEP-IAM-ENTITLEMENT`, `DEP-IAM-SCOPED-CREDENTIAL`, `DEP-CLT-READ-SCOPE`, `DEP-LED-CLOSURE-CONTRACT`, `DEP-FREEZE-GOVERNANCE`, `DEP-PUBLIC-PERIMETER`; file 01 §4.5) is not evidenced. Carries the dependency id and evidence `provider`, never prerequisite internals and **never an environment name**. Replaces v0.2 `ACC1_REAL_USE_NOT_PERMITTED` |
| `ACC1_ACTOR_BINDING_MISMATCH` | 403 | Critical | **(R2)** IAM-01 session principal ≠ stored `requested_by` at apply/cancel, or IAM-02-attested actor/maker/checker/payload/scope did not match the request |
| `ACC1_CLIENT_LOOKUP_UNAVAILABLE` | 503 | High | CLT-01 unreadable ⇒ deny |
| `ACC1_MASTER_ACCOUNT_LIMIT_REACHED` | 409 | Medium | Configured per-client limit |
| `ACC1_SUBACCOUNT_LIMIT_REACHED` | 409 | Medium | Configured per-master limit |
| `ACC1_DUPLICATE_SUBACCOUNT_NAME` | 409 | Medium | Unique among non-terminal siblings |
| `ACC1_PURPOSE_INVALID` | 422 | Medium | Not in the enumerated set |
| `ACC1_OWNERSHIP_IMMUTABLE` | 409 | Critical | Owner/identity/purpose change refused; audited |
| `ACC1_STATUS_TRANSITION_INVALID` | 409 | High | Not a legal transition |
| `ACC1_PARENT_NOT_USABLE` | 409 | High | Subaccount creation under a `suspended`/`frozen`/`closing`/`closure_sealed`/`closed` master (a master in `closing` or later rejects new children) |
| `ACC1_DEFAULT_SUBACCOUNT_PROTECTED` | 409 | High | The default subaccount cannot be closed or aborted alone; it enters `closing` only with its master's closure request (**not** "only after its master closes" — that v0.2 rule is removed) |
| `ACC1_ACCOUNT_NOT_ACTIVE` | 409 | High | Action requires a usable target |
| `ACC1_SCOPE_NOT_APPLICABLE` | 422 | Medium | e.g. `login_block` (principal-level, not an account scope; ownership ungoverned — DCR-ACC-GOV-05) |
| `ACC1_RESTRICTION_INVALID` | 422 | Medium | Kind/scope combination illegal, missing reason, `effective_until` on an authority source |
| `ACC1_RESTRICTION_LIFT_BLOCKED` | 409 | High | Missing evidence, or authority-sourced without release evidence (also for cancelling an authority-sourced scheduled restriction) |
| `ACC1_RESTRICTION_NOT_IN_FORCE` | 409 | Medium | **(R2-F07)** Lift of a restriction not in force by time (not yet effective — use cancel; lapsed/lifted/expired/cancelled) |
| `ACC1_RESTRICTION_ALREADY_EFFECTIVE` | 409 | Medium | **(R2-F07)** Cancel of a scheduled restriction that is already effective by time — use lift |
| `ACC1_CLOSURE_BLOCKED` | 409 | High | Completion refused: latest attestation `blocked`/`unavailable`/stale/pre-barrier/`seal_version` mismatch, `committed_after_preseal_watermark > 0`, `max_resolution_version_committed ≥ closure_sealed_at_version`, `in_flight_status = unresolved`, watermark reference mismatch, non-`closed` children, authority restriction active. Body lists attester outcomes as codes; target **remains** `closure_sealed` |
| `ACC1_CLOSURE_SEAL_INVALID` | 409 | High | Seal from a state other than `closing`; master seal with a non-`closed` child; seal request not bound to the applied closure request |
| `ACC1_CLOSURE_NOT_READY` | 409 | High | **(R2-F01)** Seal refused: latest pre-seal readiness absent, `not_ready`, `unavailable`, stale, for another `closure_cycle`, or its `journal_watermark` differs from the approved W_pre |
| `ACC1_CLOSURE_ABORT_INVALID` | 409 | High | **(R2)** Abort without matching blocking machine evidence; abort of a `closed` row; abort of a subaccount under a `closing`/`closure_sealed` master or of the default alone |
| `ACC1_CLOSURE_ATTESTERS_UNCONFIGURED` | 409 | High | Empty attester set ⇒ closure disabled (fail closed) |
| `ACC1_APPROVAL_REQUIRED` | 403 | High | No approval bound to the request |
| `ACC1_APPROVAL_INVALID` | 403 | Critical | `execute-verify` non-affirmative (token invalid/stale/consumed, payload mismatch); request unchanged. After a failure **following** a successful verify the request stays `requested` and a **fresh** approval is required |
| `ACC1_SELF_APPROVAL_BLOCKED` | 403 | Critical | Maker attempting to act as own checker |
| `ACC1_CHANGE_REQUEST_STATE_INVALID` | 409 | Medium | Apply/cancel in the wrong state; stored-payload hash mismatch at apply |
| `ACC1_CHANGE_REQUEST_EXPIRED` | 410 | Medium | TTL lapsed |
| `ACC1_PAYLOAD_INVALID` | 400 | Medium | Schema violation (also `additionalProperties`) |
| `ACC1_VERSION_CONFLICT` | 409 | Medium | Optimistic concurrency |
| `ACC1_IDEMPOTENCY_CONFLICT` | 409 | Medium | Same key, different body |
| `ACC1_IDEMPOTENCY_KEY_REQUIRED` | 400 | Medium | |
| `ACC1_AUDIT_REQUIRED` | 503 | Critical | SEC-01 unrecordable ⇒ mutation refused |
| `ACC1_PERMISSION_UNAVAILABLE` | 503 | High | IAM-02 unreachable ⇒ deny |
| `ACC1_INTERNAL_AUTH_REQUIRED` | 401 | High | Missing/invalid per-module capability secret |
| `ACC1_SERVICE_UNAVAILABLE` | 503 | High | DB/pool unavailable — never degrades to a 200 |
| `ACC1_CONFIG_INVALID` | 500 (boot) | Critical | Boot refusal: missing/duplicate consumer secrets, missing/invalid `ACC1_MAX_SUBACCOUNTS_PER_MASTER` (or invalid master limit), missing/invalid `ACC1_ATTESTATION_MAX_AGE_SECONDS` or `ACC1_CHANGE_REQUEST_TTL`, an invalid `ENVIRONMENT` value (recorded only — never a branch), empty required base URLs or dedicated credentials, **a dedicated credential equal to a general peer token**. **A creation attempted with a limit unavailable fails closed** (`ACC1_CONFIG_INVALID` at runtime, never a default) |

## 3. Mapping to the Master Error Code Set (System Rules §26)

ACC-01 does not raise the master codes itself — it *supplies the reason*; the consuming module raises its master code.

| `resolve` outcome | Consumer raises |
|---|---|
| `effective_status = frozen` or `blocked_scopes ∋ full_account_freeze` | `ACCOUNT_FROZEN` |
| `resolve.client_status = suspended` | `CLIENT_SUSPENDED` (same code; the client-level cause is visible in `client_status`) |
| `resolve.client_status = restricted` / `active_limited` | No master code exists for these; consumer-specific denial naming the ACC-01 status (raise as OQ-06 if a master code is wanted). `CLIENT_FROZEN` is **not** used — CLT-01 has no `frozen` client status |
| **`closure_barrier = true`** (evaluated **first**, whatever `effective_status` shows) | consumer-specific denial naming the closure barrier (not `PERMISSION_DENIED`, not `FEATURE_DISABLED`) |
| `effective_status ∈ {suspended, restricted, closing, closure_sealed, closed, unknown}` | consumer-specific denial with the ACC-01 status as reason (not `PERMISSION_DENIED`, not `FEATURE_DISABLED`) — per the **consumer evaluation order** (file 01 §10): closure barrier, then component statuses (closure-drain allow-list under `closing`), then product policy |

A denial attributed to ACC-01 status is never surfaced as `PERMISSION_DENIED` or `FEATURE_DISABLED` (Role Matrix §3.7 rule 4; test ACC1-T-062).

## 4. Anti-oracle rules

- Client routes: unknown, foreign, unauthorised and inactive-membership cases are indistinguishable (200 empty / 404).
- Staff/internal routes may return 404 (authenticated, authorised callers).
- `scope-validate` returns `consistent:false` with no detail about *which* element failed.
