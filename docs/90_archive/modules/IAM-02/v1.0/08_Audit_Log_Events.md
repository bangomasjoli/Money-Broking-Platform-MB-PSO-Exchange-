# IAM-02 RBAC / Permission Guard / SoD  
## 08 Audit Log Events

## 1. Audit Principles

IAM-02 events use FND audit envelope and SEC-01 authoritative audit store.

IAM-02 local evidence is non-authoritative index/evidence unless linked to SEC-01 audit reference.

---

## 2. Required Events

| Event Type | Trigger | Severity |
|---|---|---|
| `iam2.permission_decision_allow` | Sensitive allow decision | Medium |
| `iam2.permission_decision_deny` | Sensitive deny decision | Medium |
| `iam2.permission_decision_approval_required` | Approval required | Medium |
| `iam2.role_created` | Role created | High |
| `iam2.role_updated` | Role updated | High |
| `iam2.role_retired` | Role retired | High |
| `iam2.role_assigned` | Role assigned to user | High |
| `iam2.role_revoked` | Role revoked | High |
| `iam2.permission_assigned_to_role` | Permission assigned | Critical/High |
| `iam2.permission_revoked_from_role` | Permission revoked | High |
| `iam2.approval_requested` | Approval created | Medium |
| `iam2.approval_approved` | Approval approved | High |
| `iam2.approval_rejected` | Approval rejected | Medium |
| `iam2.approval_expired` | Approval expired | Medium |
| `iam2.self_approval_blocked` | Self approval attempt | Critical/High |
| `iam2.sod_conflict_detected` | SoD conflict | Critical/High |
| `iam2.delegation_created` | Delegation created | High |
| `iam2.delegation_revoked` | Delegation revoked | Medium |
| `iam2.temporary_permission_granted` | Temporary grant | Critical/High |
| `iam2.temporary_permission_expired` | Temporary grant expired | Medium |
| `iam2.break_glass_requested` | Break-glass requested | Critical |
| `iam2.break_glass_approved` | Break-glass approved | Critical |
| `iam2.break_glass_activated` | Break-glass active | Critical |
| `iam2.break_glass_expired` | Break-glass expired | Critical/High |
| `iam2.break_glass_review_closed` | Post-review closed | High |
| `iam2.licence_locked_permission_blocked` | Locked permission attempted | Critical |
| `iam2.permission_cache_invalidated` | Cache invalidated | Medium |
| `iam2.sensitive_read` | Sensitive permission/evidence read | Medium |
| `iam2.client_side_approval_completed` | Client approval completed | High |

---

## 3. Event Metadata

Events must include:

1. actor_user_id.
2. actor_role_refs.
3. action.
4. resource.
5. entity_id.
6. client_id where applicable.
7. approval_id where applicable.
8. sod_check_id where applicable.
9. step_up_assertion_ref where applicable.
10. permission_sources where safe.
11. decision/reason code.
12. request_id.
13. correlation_id.
14. occurred_at_utc.
15. audit_event_ref.

---

## 4. Prohibited Metadata

Never include:

1. Plaintext secrets.
2. IAM-01 tokens.
3. IAM-01 MFA codes.
4. Full approval payload if sensitive.
5. Client confidential documents.
6. STR/suspicious report contents.
7. Production credentials.
8. Full private keys or API keys.

---

## 5. Alert Events

Critical alerts:

1. Attempt to grant licence-locked permission.
2. Self-approval attempt.
3. Break-glass activation.
4. SoD critical conflict.
5. Permission guard bypass detected.
6. Permission cache stale after revocation.
7. Service account acting as human approver.
8. Sensitive permission read anomaly.
