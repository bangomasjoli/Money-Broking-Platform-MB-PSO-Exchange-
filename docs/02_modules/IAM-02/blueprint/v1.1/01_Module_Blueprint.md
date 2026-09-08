# IAM-02 RBAC / Permission Guard / SoD  
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | IAM-02 |
| Module name | RBAC / Permission Guard / Segregation of Duties |
| Pack version | v1.1 |
| Status | Revised after Claude Opus review; approval-execution binding, protected-action registry, SoD risk acceptance hardening, break-glass ceiling, interim CFG/SEC contracts, cache version checks, revocation SLA, approval concurrency, delegation depth, and service-account approval controls added |
| Platform | AIX Money Broking + PSO Platform |
| Licence posture | Money Broking and PSO approved; Exchange pending |
| Module category | IAM / Security / Governance |
| Depends on | FND-01 v1.2; IAM-01 v1.2 |
| Blocks | All protected business modules, maker-checker flows, privileged admin flows |

Base documents:
- 00_Licence_Scope_And_Feature_Lock_v1.3.md
- 01_Project_Charter_v1.3.md
- 02_Software_Requirement_Specification_v1.2.md
- 03_Master_Module_Index_v1.2.md
- 04_Role_And_Permission_Matrix_v1.2.md
- 05_Master_Workflow_Map_v1.2.md
- 06_Master_System_Rules_v1.2.md
- 07_Master_Data_Flow_v1.2.md
- 08_Master_Technical_Architecture_v1.2.md
- 09_Master_Security_Architecture_v1.2.md
- 10_Master_Testing_Strategy_v1.2.md
- 11_Master_Deployment_Strategy_v1.2.md
- FND-01_Platform_Foundation_Blueprint_Pack_v1.2
- IAM-01_Authentication_MFA_Session_Blueprint_Pack_v1.2


---

## 2. Module Purpose

IAM-02 is the permanent authorization layer for the platform.

It answers:

```txt
Who can perform which action, on which entity, under what condition, with what approval and SoD restrictions?
```

IAM-02 must ensure:

1. Authenticated users cannot perform actions unless explicitly permitted.
2. Permissions are backend enforced.
3. Self-approval is prohibited.
4. Segregation-of-duties conflicts are blocked.
5. Maker-checker approvals are enforced for sensitive actions.
6. Privileged access is time-bound and auditable.
7. Break-glass is exceptional, approved, time-boxed, and reviewed.
8. Permission changes take effect safely across sessions and caches.
9. Exchange-locked permissions cannot be granted while Exchange approval is pending.

---

## 3. In Scope

IAM-02 covers:

1. Role catalogue.
2. Permission catalogue.
3. Role-permission assignment.
4. User-role assignment.
5. User-permission override where approved.
6. Permission guard evaluation.
7. Context-aware permission checks.
8. Maker-checker approval policy.
9. Approval request lifecycle.
10. Approval delegation.
11. Temporary permission grant.
12. Permission expiry.
13. Permission revocation.
14. Segregation-of-duties matrix.
15. Self-approval prevention.
16. Dual approval for high-risk actions.
17. Client-side dual authorization integration where required.
18. IAM-01 step-up requirement integration.
19. Break-glass permission grant.
20. Break-glass auto-expiry.
21. Break-glass post-event review.
22. Sensitive permission read logging.
23. Permission audit events.
24. Permission cache invalidation.
25. Role mapping to canonical role matrix.
26. Permission evidence and traceability.

---

## 4. Out of Scope

IAM-02 does not implement:

1. Login, MFA, session issuance, token refresh.
2. KYC/KYB.
3. AML/sanctions/Travel Rule.
4. Ledger, balance, settlement, reconciliation.
5. Trading, quote, LP execution, order book.
6. Feature flag/licence-lock administration.
7. Audit-log storage/hash-chain implementation.
8. Client onboarding workflow.
9. Exchange module activation.
10. Business-rule decision logic owned by downstream modules.

IAM-02 provides authorization and approval control only.

---

## 5. Critical Principles

### 5.1 Authentication Is Not Authorization

IAM-01 authenticates the user.

IAM-02 authorizes the action.

A valid login session is never enough to perform a protected action.

### 5.2 Backend Permission Guard

Every protected API/action must call the IAM-02 permission guard.

Frontend menu hiding is not a control.

Permission evaluation must happen on the backend.

### 5.3 Default Deny

If role, permission, approval policy, SoD status, feature/licence lock, or actor context is unknown, the decision is deny.

```txt
permission_default = deny
```

### 5.4 Least Privilege

Roles must contain only required permissions.

Broad super-admin permissions must not bypass:

1. Licence locks.
2. Audit logging.
3. Maker-checker.
4. SoD.
5. Client-side approval.
6. IAM-01 step-up.
7. Data classification restrictions.

### 5.5 No Self-Approval

A maker cannot approve the same action they initiated.

The following are prohibited:

1. Self-approval.
2. Same-user maker/checker.
3. Same service account maker/checker.
4. Break-glass grantor as recipient.
5. Approval by user with active SoD conflict.

### 5.6 Segregation of Duties

IAM-02 must enforce SoD conflict rules at:

1. Role assignment time.
2. Permission assignment time.
3. Approval time.
4. Runtime action time where required.
5. Delegation grant time.
6. Temporary permission grant time.


### 5.6A SoD Risk Acceptance and Meta-SoD

SoD risk acceptance is not a bypass.

Rules:

1. Critical SoD conflicts are block-only.
2. High/Medium SoD risk acceptance requires Compliance + Management dual non-self approval.
3. Risk acceptance requires IAM-01 step-up by approvers.
4. Risk acceptance must have expiry.
5. Risk acceptance must have re-attestation schedule.
6. SoD matrix changes require Security + Compliance dual approval and step-up.
7. IAM-02 meta-SoD must prevent a SoD matrix editor from also holding role assignment or permission assignment authority.
8. SoD matrix versioning and integrity reconciliation are required.
9. Any silent disablement of Critical SoD rule is Critical incident.

Parameters:

```txt
sod_critical_conflict_enforcement = block_only
sod_risk_acceptance_requires = compliance_plus_management_dual_nonself_stepup
sod_matrix_change_requires = dual_security_compliance_plus_stepup
sod_matrix_integrity_reconciliation = enabled
iam2_admin_meta_sod = matrix_editor_ne_role_assigner
```

### 5.7 Maker-Checker Framework

IAM-02 is the permanent approval engine for sensitive actions.

It must support:

1. Single approval.
2. Dual approval.
3. Role-specific approval.
4. Value-tiered approval.
5. Compliance approval.
6. Finance approval.
7. Management approval.
8. Client-side approval integration.
9. Approval expiry.
10. Approval rejection.
11. Approval cancellation.
12. Approval evidence.


### 5.8 Approval-to-Execution Binding

IAM-02 must cryptographically or deterministically bind what was approved to what is executed.

Rules:

1. Approval request must capture immutable payload hash at creation.
2. Executing module must present approval ID and current payload hash at execution.
3. IAM-02 must re-verify payload hash before allowing execution.
4. Payload hash mismatch blocks execution and emits Critical audit event.
5. Approval is scoped to actor, action, resource, entity, client, payload hash, approval policy, and expiry.
6. Approval cannot be reused for a different entity, amount, destination, client, or action scope.
7. Approval must be consumed or marked execution-linked according to downstream action policy.

Parameters:

```txt
approval_payload_immutable = true
approval_payload_hash_verified_at_exec = true
approval_reuse_cross_entity = prohibited
```

### 5.9 Permission Decision Token

IAM-02 must issue a short-lived decision token for protected execution paths.

Decision token must be bound to:

```txt
actor_id
session_id
auth_level
action
resource
entity_id
client_id
payload_hash
permission_cache_version
approval_id
step_up_assertion_ref
issued_at_utc
expires_at_utc
```

Rules:

1. Executing module must present decision token at commit/execution.
2. IAM-02 must revalidate token at execution.
3. Token fails if cache version changed after issuance.
4. Token fails if permission/role was revoked after issuance.
5. Token fails if IAM-01 session is revoked, frozen, stepped down, or auth level no longer satisfies action.
6. Token fails if payload hash mismatches.
7. Token is short-lived and action-scoped.

Parameters:

```txt
permission_decision_token_bound_to = actor_action_entity_payloadhash_cacheversion
permission_decision_bound_to_session = true
permission_cache_positive_version_required = true
```

### 5.10 Protected-Action Registry

IAM-02 must maintain a registry of protected platform actions.

Rules:

1. Every sensitive action must be registered with permission code, resource, owner module, approval policy, step-up requirement, licence-lock status, and test coverage.
2. Downstream modules must reference a registered action before execution.
3. Unregistered sensitive action fails closed.
4. CI/build checks and runtime reconciliation must detect orphan protected actions.
5. UI action availability checks do not replace runtime guard checks.

Parameters:

```txt
protected_action_registry_enforced = true
unregistered_sensitive_action = fail_closed
```

### 5.11 Step-Up Integration

IAM-02 must consume IAM-01 recent-auth assertions for sensitive actions.

Rules:

1. Approval of high-risk actions requires fresh step-up where configured.
2. Permission change for privileged role requires step-up.
3. Break-glass grant requires step-up.
4. MFA reset approval requires step-up.
5. Step-up assertion must be verified with IAM-01.

### 5.12 Licence-Lock Supremacy

IAM-02 must never grant permission that overrides licence restrictions.

Exchange-related permissions remain blocked while Exchange is pending.

Examples blocked by policy:

```txt
ENABLE_PUBLIC_ORDER_BOOK
ENABLE_MATCHING_ENGINE
ENABLE_CLIENT_TO_CLIENT_MATCHING
ENABLE_PUBLIC_EXCHANGE_TRADING
ENABLE_MARKET_MAKER
ENABLE_PRINCIPAL_DEALING
ENABLE_AIX_SPREAD_MARKUP
```

### 5.13 Break-Glass Is Exceptional

Break-glass access must be:

1. Justified.
2. Approved by non-recipient.
3. Time-boxed.
4. Auto-expiring.
5. Fully audited.
6. Alerted to Security/Compliance/Management where required.
7. Post-event reviewed.
8. Not usable to bypass licence lock or audit.


Break-glass privilege ceiling:

1. Break-glass can grant only permissions from an explicit emergency whitelist.
2. Break-glass cannot grant IAM-02 administration permissions.
3. Break-glass cannot grant SoD matrix management.
4. Break-glass cannot grant licence-control permissions.
5. Break-glass cannot grant Exchange/prohibited permissions.
6. Break-glass cannot create durable role/permission assignments.
7. Break-glass maximum duration and concurrent grant count must be configured.

Parameters:

```txt
break_glass_eligible_permission_set = explicit_whitelist
break_glass_cannot_grant = iam2_admin,sod_manage,licence_control,exchange_locked_permissions
break_glass_max_duration_minutes = to_be_defined
break_glass_max_concurrent_per_user = to_be_defined
```

### 5.14 Interim CFG-01 and SEC-01 Contracts

CFG-01 and SEC-01 may not be live when IAM-02 is built.

Until CFG-01 is live:

1. Licence-locked/prohibited permission set must come from config-sealed list matching Document 00 v1.3.
2. Runtime grant path for locked/prohibited permissions is prohibited.
3. Local `licence_locked` flag is a cached/index field only, not the source of truth.
4. Reconciliation with CFG-01 is mandatory once CFG-01 exists.

Until SEC-01 is live:

1. IAM-02 local audit/evidence index is non-authoritative.
2. Required audit/outbox event must still be emitted using FND pattern.
3. SEC-01 becomes authoritative audit store when live.
4. Missing audit reference for sensitive action is Critical.

Parameters:

```txt
licence_lock_source_until_cfg01 = config_sealed_list_matching_00_v1.3
licence_locked_permission_runtime_grant = prohibited
audit_authority_until_sec01 = iam2_local_index_nonauthoritative
cfg01_licence_lock_reconciliation = required_when_available
```

---

## 6. Actors

| Actor | IAM-02 Role |
|---|---|
| Client User | Protected client actions |
| Client Approver | Client-side approval / dual authorization |
| Staff User | Operational actions |
| Compliance Officer / MLRO | Compliance approvals and sensitive reads |
| Finance User | Finance approval/payment-related approvals |
| Operations Manager | Operational approvals |
| Security Admin | Permission security control |
| Tech Admin | Technical/admin permission control |
| Super Admin | Limited privileged admin, no bypass |
| Auditor | Read-only evidence review |
| System Job | Non-human permission cleanup/reconciliation |
| Service Account | Scoped non-human actions |

---

## 7. Dependencies

### 7.1 Upstream

1. FND-01 request context.
2. FND-01 audit/outbox contract.
3. FND-01 DB isolation baseline.
4. FND-01 rate-limit interface.
5. IAM-01 authenticated session context.
6. IAM-01 step-up assertion verification.
7. IAM-01 freeze/suspension revocation signal where applicable.

### 7.2 Downstream

All protected modules depend on IAM-02.

Priority downstream modules:

1. SEC-01 Audit Log / Security Monitoring.
2. CFG-01 Feature Flag / Licence Lock.
3. CLT client modules.
4. CMP compliance modules.
5. MON money/ledger/settlement modules.
6. PRD trading/quote modules.
7. PRT portal modules.

---

## 8. Components

| Component | Description |
|---|---|
| Role Catalogue | Canonical roles and role metadata |
| Permission Catalogue | Canonical permissions and scopes |
| User Role Service | Assign/revoke user roles |
| Role Permission Service | Assign/revoke permissions to roles |
| Permission Guard | Runtime allow/deny decision engine |
| Protected Action Registry | Canonical action-to-permission/policy registry |
| Decision Token Service | Short-lived execution-bound permission decision token |
| Approval Payload Hasher | Immutable approval payload hash and execution verification |
| Context Policy Engine | Entity/action/context-aware conditions |
| Maker-Checker Engine | Approval request lifecycle |
| Approval Policy Engine | Defines required approver rules |
| SoD Matrix Engine | Conflict detection and prevention |
| SoD Risk Acceptance Engine | Controlled non-critical SoD risk acceptance with expiry/re-attestation |
| SoD Matrix Versioning | Integrity-controlled matrix version and reconciliation |
| Delegation Service | Delegated approval/permission handling |
| Temporary Permission Service | Time-bound permission grant |
| Break-Glass Service | Emergency access workflow with privilege ceiling/whitelist |
| Permission Cache | Safe cache with invalidation |
| Permission Audit Publisher | Emits permission audit events |
| Sensitive Read Logger | Logs sensitive permission reads |
| Permission Reconciliation Job | Detects expired/conflicting grants, orphan actions, stale cache, and matrix drift |

---

## 9. Functional Requirements

### IAM2-FR-001 Role Catalogue

The platform shall maintain canonical roles with owner, description, status, and scope.

### IAM2-FR-002 Permission Catalogue

The platform shall maintain canonical permissions with action, resource, sensitivity, licence-lock status, and step-up requirement.

### IAM2-FR-003 Role-Permission Assignment

The platform shall assign permissions to roles only through approved workflow.

### IAM2-FR-004 User-Role Assignment

The platform shall assign users to roles only through approved workflow.

### IAM2-FR-005 Permission Guard

The platform shall evaluate every protected action through the permission guard.

### IAM2-FR-006 Context-Aware Permission

The platform shall evaluate actor, resource, entity scope, client ownership, action type, value threshold, status, licence lock, and required step-up context.

### IAM2-FR-007 Maker-Checker

The platform shall require approval for configured sensitive actions.

### IAM2-FR-008 Self-Approval Block

The platform shall block same-user maker/checker approval.

### IAM2-FR-009 SoD Conflict Matrix

The platform shall enforce SoD conflict rules at assignment and approval time.

### IAM2-FR-010 Temporary Permission

The platform shall support time-bound temporary permissions with auto-expiry.

### IAM2-FR-011 Delegation

The platform shall support delegated approval/permission according to policy.

### IAM2-FR-012 Break-Glass

The platform shall support emergency break-glass access with approval, expiry, alerting, and post-review.

### IAM2-FR-013 Step-Up Requirement

The platform shall require and verify IAM-01 recent-auth assertion for configured sensitive permission actions.

### IAM2-FR-014 Permission Cache Invalidation

The platform shall invalidate permission cache on role/permission/session/security changes.

### IAM2-FR-015 Sensitive Permission Read Logging

The platform shall audit sensitive permission read/export.

### IAM2-FR-016 Licence-Locked Permission Block

The platform shall prevent granting or using Exchange/prohibited permissions while locked.

### IAM2-FR-017 Approval Expiry

The platform shall expire approval requests if not acted on within policy window.

### IAM2-FR-018 Permission Revocation Propagation

The platform shall ensure revoked permissions stop working quickly and safely.

### IAM2-FR-019 Client-Side Dual Authorization

The platform shall support client-side approval/dual authorization integration for withdrawals, large trades, and institutional mandates where required.

### IAM2-FR-020 Permission Evidence

The platform shall retain permission decision, approval, SoD, and step-up evidence.

### IAM2-FR-021 Approval Payload Hash

The platform shall bind approval requests to an immutable payload hash and re-verify the hash at execution.

### IAM2-FR-022 Permission Decision Token

The platform shall issue and validate short-lived permission decision tokens bound to actor, session, action, entity, payload hash, approval, step-up, and cache version.

### IAM2-FR-023 Protected Action Registry

The platform shall maintain a protected-action registry and fail closed on unregistered sensitive actions.

### IAM2-FR-024 SoD Risk Acceptance

The platform shall allow risk acceptance only for non-Critical SoD conflicts with dual non-self approval, step-up, expiry, and re-attestation.

### IAM2-FR-025 IAM-02 Meta-SoD

The platform shall prevent IAM-02 administrators from combining SoD matrix management with role/permission assignment powers.

### IAM2-FR-026 Break-Glass Privilege Ceiling

The platform shall restrict break-glass to explicit whitelisted emergency permissions with max duration and concurrent grant limits.

### IAM2-FR-027 Interim Licence-Lock Source

The platform shall use a config-sealed licence-lock/prohibited permission set matching Document 00 until CFG-01 is live.

### IAM2-FR-028 Interim Audit Authority

The platform shall treat local IAM-02 evidence as non-authoritative until SEC-01 is live and reconcile when SEC-01 becomes available.

### IAM2-FR-029 Positive Cache Version Check

The platform shall fail closed if decision cache version is older than latest subject permission cache version.

### IAM2-FR-030 Delegation Depth

The platform shall prohibit re-delegation and evaluate delegated approval against both delegator and delegate identities.

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Permission decision latency | To be defined; must support critical APIs |
| Permission default | Deny |
| Permission cache | Safe, invalidatable, no stale privileged access |
| SoD conflict enforcement | Required |
| Self-approval block | Required |
| Approval audit | Required |
| Sensitive read logging | Required |
| Step-up integration | Required |
| Licence-lock override | Prohibited |
| Break-glass expiry | Required |
| Break-glass post-review | Required |
| Permission revocation propagation | Mandatory; SLA to be defined |
| Data classification | Restricted / Security Critical |
| Protected-action registry | Required |
| Approval payload hash | Required |
| Permission decision token | Required |
| Positive cache version check | Required |
| Break-glass privilege whitelist | Required |
| SoD matrix integrity reconciliation | Required |
| Test coverage | Critical controls 100% |

---

## 11. Prohibited Behaviours

IAM-02 must not allow:

1. Permission bypass.
2. Audit bypass.
3. Licence-lock bypass.
4. Self-approval.
5. Direct ledger edit.
6. Direct balance edit.
7. Audit log delete/modify.
8. Granting Exchange permissions while Exchange locked.
9. Granting principal-dealing permissions.
10. Granting market-making permissions.
11. Granting AIX spread-markup permission.
12. Granting matching-engine permission.
13. Standing unrestricted break-glass.
14. Permanent emergency access.
15. Permission cache overriding revocation.
16. Hidden permission grants.
17. Unlogged sensitive permission reads.
18. Delegation to conflicted user.
19. Temporary permission without expiry.
20. Service account acting as human approver.
21. Approval execution with mismatched payload hash.
22. Execution without valid decision token where token required.
23. Unregistered sensitive action execution.
24. Critical SoD risk acceptance.
25. SoD matrix editor assigning own permissions/roles.
26. Break-glass granting IAM-02 admin, SoD, licence-control, or Exchange permissions.
27. Re-delegation by delegate.
28. Licence-locked permission satisfied by user override.
29. TTL-only permission cache without positive version check.

---

## 12. Acceptance Criteria

IAM-02 is accepted only if:

1. Role catalogue exists.
2. Permission catalogue exists.
3. Permission guard returns default deny.
4. Protected actions require permission guard.
5. Maker-checker works.
6. Self-approval is blocked.
7. SoD conflict matrix works.
8. Delegation respects SoD and expiry.
9. Temporary permissions expire.
10. Break-glass is approved, time-boxed, audited, and post-reviewed.
11. Step-up integration works.
12. Permission cache invalidates safely.
13. Revoked permission stops working.
14. Licence-locked permissions cannot be granted or used.
15. Client-side dual authorization integration is supported.
16. Sensitive permission read logging works.
17. Permission audit events are emitted.
18. Approval payload hash is verified at execution.
19. Decision token binding works and blocks stale/revoked/mismatched execution.
20. Protected-action registry catches orphan sensitive actions.
21. Critical SoD conflicts are block-only.
22. SoD risk acceptance requires dual non-self approval, step-up, expiry, and re-attestation.
23. IAM-02 meta-SoD works.
24. Break-glass whitelist/ceiling works.
25. Interim CFG-01/SEC-01 contracts are defined and tested.
26. Positive cache version checks work.
27. Re-delegation is blocked.
28. Tests pass.

---

## 13. Open Items

1. Final canonical role list.
2. Final permission namespace.
3. Final approval thresholds.
4. Final SoD matrix.
5. Final delegation policy.
6. Final break-glass approval chain.
7. Final permission cache TTL.
8. Final revocation propagation SLA.
9. Final client-side approval threshold.
10. Final step-up freshness window by action.
11. Final approval payload canonicalisation/hash algorithm.
12. Final decision token TTL.
13. Final protected-action registry source format.
14. Final SoD risk-acceptance duration and re-attestation period.
15. Final break-glass eligible permission whitelist.
16. Final break-glass maximum duration and concurrent grant count.
17. Final revocation propagation SLA seconds.
18. Final CFG-01 reconciliation handover method.
19. Final SEC-01 audit migration/reconciliation method.
