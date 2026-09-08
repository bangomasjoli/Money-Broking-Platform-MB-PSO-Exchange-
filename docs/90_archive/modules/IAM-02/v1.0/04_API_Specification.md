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

### 2.2 POST `/internal/iam2/permission/check-batch`

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

## 5. SoD APIs

### 5.1 POST `/iam2/sod/check`

Check SoD conflict.

### 5.2 GET `/iam2/sod/matrix`

Read SoD matrix.

### 5.3 POST `/iam2/sod/matrix`

Manage SoD matrix; requires maker-checker and security/compliance approval.

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
