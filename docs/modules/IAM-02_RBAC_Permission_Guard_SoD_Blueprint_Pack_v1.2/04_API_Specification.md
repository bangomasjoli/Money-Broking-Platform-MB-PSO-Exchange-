# IAM-02 RBAC / Permission Guard / SoD  
## 04 API Specification

## 1. API Scope

IAM-02 APIs cover authorization, roles, permissions, approval requests, SoD checks, delegations, temporary permissions, break-glass, and permission evidence.

All APIs inherit FND request context, standard envelope, audit/outbox, DB isolation, rate-limit, and error format.

---

## 2. Internal Permission Guard APIs

### 2.1 POST `/internal/iam2/permission/check`

Purpose: runtime permission decision.

Auth: internal service.

Request:

```json
{
  "actor_id": "user_...",
  "session_id": "sess_...",
  "action": "withdrawal.approve",
  "resource": "withdrawal",
  "entity_id": "wdr_...",
  "client_id": "client_...",
  "context": {
    "amount": "100000.00",
    "currency": "USD",
    "requires_step_up": true
  }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "decision": "allow",
    "reason": "permission_granted",
    "decision_token": "decision_token_or_reference",
    "cache_version": 12,
    "payload_hash": "sha256:...",
    "approval_required": false,
    "step_up_required": false,
    "sod_conflict": false
  }
}
```

Decision values:

```txt
allow
deny
approval_required
step_up_required
sod_blocked
licence_locked
```

### 2.2 POST `/internal/iam2/permission/execute-verify`

Purpose: verify approval-to-execution binding before commit.

Auth: internal service.

Request:

```json
{
  "decision_token": "decision_token_or_reference",
  "approval_id": "approval_...",
  "actor_id": "user_...",
  "session_id": "sess_...",
  "action": "withdrawal.approve",
  "resource": "withdrawal",
  "entity_id": "wdr_...",
  "client_id": "client_...",
  "current_payload_hash": "sha256:..."
}
```

Response:

```json
{
  "success": true,
  "data": {
    "execution_authorised": true,
    "decision": "allow",
    "verified_payload_hash": true,
    "verified_cache_version": true,
    "verified_session": true
  }
}
```

Rules:

1. Payload hash mismatch blocks execution.
2. Stale cache version blocks execution.
3. Revoked permission after decision blocks execution.
4. Session/freeze/auth-level invalidation blocks execution.

### 2.3 POST `/internal/iam2/protected-actions/verify`

Purpose: verify a sensitive action is registered and guard-covered.

Auth: internal service / CI / deployment.

### 2.4 POST `/internal/iam2/permission/check-batch`

Purpose: batch permission evaluation for UI/action availability.

Rules:

1. Batch check is advisory for UI only.
2. Runtime action must still call permission check.
3. Sensitive result read is audit logged where required.

---

## 3. Role and Permission APIs

### 3.1 GET `/iam2/roles`

Read roles.

### 3.2 POST `/iam2/roles`

Create role.

Requires approval if privileged/sensitive.

### 3.3 POST `/iam2/roles/{role_id}/permissions`

Assign permission to role.

Requires maker-checker.

### 3.4 DELETE `/iam2/roles/{role_id}/permissions/{permission_id}`

Remove permission from role.

### 3.5 GET `/iam2/permissions`

Read permission catalogue.

### 3.6 POST `/iam2/users/{user_id}/roles`

Assign role to user.

Requires SoD check, approval, and step-up where privileged.

### 3.7 DELETE `/iam2/users/{user_id}/roles/{role_id}`

Revoke role.

---

## 4. Approval APIs

### 4.1 POST `/iam2/approvals`

Create approval request.

Request:

```json
{
  "action": "mfa_reset.approve",
  "resource": "mfa_reset_request",
  "entity_id": "mfa_reset_...",
  "maker_user_id": "user_...",
  "client_id": null,
  "payload_ref": "payload_...",
  "payload_hash": "sha256:...",
  "required_policy": "dual_security_admin"
}
```

### 4.2 GET `/iam2/approvals/pending`

List pending approvals for current user.

### 4.3 POST `/iam2/approvals/{approval_id}/approve`

Approve request.

Rules:

1. Approver cannot be maker.
2. SoD conflict must be checked.
3. Step-up required where policy says so.
4. Approval expiry checked.

### 4.4 POST `/iam2/approvals/{approval_id}/reject`

Reject request.

### 4.5 POST `/iam2/approvals/{approval_id}/cancel`

Maker/system cancels pending request where allowed.

---

## 5. Protected-Action / SoD APIs

### 5.1 GET `/iam2/protected-actions`

Read protected-action registry.

### 5.2 POST `/iam2/protected-actions`

Create/update protected-action registry entry.

Requires maker-checker and Security approval.

### 5.3 POST `/iam2/sod/check`

Check SoD conflict.

### 5.4 GET `/iam2/sod/matrix`

Read SoD matrix.

### 5.5 POST `/iam2/sod/matrix`

Manage SoD matrix; requires Security + Compliance dual non-self approval, step-up, matrix versioning, and meta-SoD check.

---

## 6. Delegation / Temporary Permission APIs

### 6.1 POST `/iam2/delegations`

Create delegation.

### 6.2 DELETE `/iam2/delegations/{delegation_id}`

Revoke delegation.

### 6.3 POST `/iam2/temporary-permissions`

Grant temporary permission.

### 6.4 DELETE `/iam2/temporary-permissions/{grant_id}`

Revoke temporary permission.

---

## 7. Break-Glass APIs

### 7.1 POST `/iam2/break-glass/request`

Request emergency access.

### 7.2 POST `/iam2/break-glass/{request_id}/approve`

Approve break-glass.

### 7.3 POST `/iam2/break-glass/{grant_id}/revoke`

Revoke active break-glass.

### 7.4 POST `/iam2/break-glass/{grant_id}/review`

Submit post-event review.

---

## 8. Evidence APIs

### 8.1 GET `/iam2/evidence/permission-decisions/{decision_id}`

Read permission decision evidence.

### 8.2 GET `/iam2/evidence/approvals/{approval_id}`

Read approval evidence.

### 8.3 GET `/iam2/evidence/sod/{check_id}`

Read SoD check evidence.

Sensitive read logged.

---

## 9. Error Codes

| Code | Meaning |
|---|---|
| `IAM2_PERMISSION_DENIED` | Permission denied |
| `IAM2_PERMISSION_UNKNOWN` | Unknown permission |
| `IAM2_ROLE_UNKNOWN` | Unknown role |
| `IAM2_APPROVAL_REQUIRED` | Approval required |
| `IAM2_STEP_UP_REQUIRED` | IAM-01 step-up required |
| `IAM2_STEP_UP_INVALID` | Step-up assertion invalid |
| `IAM2_SELF_APPROVAL_BLOCKED` | Maker attempted own approval |
| `IAM2_SOD_CONFLICT` | SoD conflict |
| `IAM2_DELEGATION_INVALID` | Delegation invalid |
| `IAM2_TEMP_PERMISSION_EXPIRED` | Temporary permission expired |
| `IAM2_BREAK_GLASS_REQUIRED` | Break-glass required |
| `IAM2_BREAK_GLASS_EXPIRED` | Break-glass expired |
| `IAM2_LICENCE_LOCKED_PERMISSION` | Permission blocked by licence lock |
| `IAM2_PERMISSION_CACHE_STALE` | Permission cache stale/invalid |
| `IAM2_SERVICE_ACCOUNT_APPROVER_BLOCKED` | Service account attempted human approval |
| `IAM2_AUDIT_REQUIRED` | Required audit/outbox failed |
| `IAM2_PAYLOAD_HASH_MISMATCH` | Approved payload hash does not match execution payload |
| `IAM2_DECISION_TOKEN_INVALID` | Permission decision token invalid/expired |
| `IAM2_DECISION_TOKEN_STALE` | Decision token cache version stale |
| `IAM2_UNREGISTERED_PROTECTED_ACTION` | Sensitive action not registered |
| `IAM2_SOD_RISK_ACCEPTANCE_REQUIRED` | Non-critical SoD risk requires controlled acceptance |
| `IAM2_SOD_CRITICAL_BLOCK_ONLY` | Critical SoD conflict cannot be risk accepted |
| `IAM2_BREAK_GLASS_PERMISSION_NOT_ELIGIBLE` | Permission outside break-glass whitelist |
| `IAM2_BREAK_GLASS_DURATION_EXCEEDED` | Break-glass duration exceeds maximum |
| `IAM2_REDELEGATION_BLOCKED` | Delegate attempted re-delegation |
| `IAM2_CFG01_INTERIM_LOCK_SOURCE_REQUIRED` | Interim licence-lock source unavailable |
| `IAM2_SEC01_AUDIT_AUTHORITY_UNAVAILABLE` | Audit authority contract unavailable |
