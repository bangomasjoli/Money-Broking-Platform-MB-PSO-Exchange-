# IAM-02 RBAC / Permission Guard / SoD  
## 10 Test Cases

## 1. Permission Guard Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM2-TC-001 | User with permission performs action | Allowed | Critical |
| IAM2-TC-002 | User without permission performs action | Denied | Critical |
| IAM2-TC-003 | Unknown permission | Denied fail closed | Critical |
| IAM2-TC-004 | Missing actor context | Denied | Critical |
| IAM2-TC-005 | Missing resource/client scope | Denied | Critical |
| IAM2-TC-006 | Licence-locked permission checked | Denied | Critical |
| IAM2-TC-007 | Prohibited permission checked | Denied | Critical |
| IAM2-TC-008 | Permission decision audit emitted | Present | High |

---

## 2. Role / Permission Assignment Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM2-TC-009 | Assign normal role | Assignment works after policy | High |
| IAM2-TC-010 | Assign privileged role without approval | Blocked | Critical |
| IAM2-TC-011 | Assign role to self for elevation | Blocked | Critical |
| IAM2-TC-012 | Assign permission to role without approval | Blocked | Critical |
| IAM2-TC-013 | Assign licence-locked permission to role | Blocked | Critical |
| IAM2-TC-014 | Assign prohibited permission to role | Blocked | Critical |
| IAM2-TC-015 | Role revocation invalidates cache | Cache invalidated | Critical |
| IAM2-TC-016 | Revoked role still works | Blocked | Critical |

---

## 3. Maker-Checker Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM2-TC-017 | Sensitive action creates approval | Approval pending | Critical |
| IAM2-TC-018 | Maker approves own action | Blocked | Critical |
| IAM2-TC-019 | Eligible checker approves | Approved | Critical |
| IAM2-TC-020 | Ineligible checker approves | Blocked | Critical |
| IAM2-TC-021 | Approval expires | Cannot approve | High |
| IAM2-TC-022 | Dual approval required | One approval insufficient | Critical |
| IAM2-TC-023 | Approval requires step-up but missing | Step-up required | Critical |
| IAM2-TC-024 | Approval with valid step-up | Allowed | Critical |

---

## 4. SoD Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM2-TC-025 | SoD conflict role assignment | Blocked | Critical |
| IAM2-TC-026 | SoD conflict permission assignment | Blocked | Critical |
| IAM2-TC-027 | SoD conflict approval | Blocked | Critical |
| IAM2-TC-028 | SoD conflict delegation | Blocked | Critical |
| IAM2-TC-029 | SoD check audit evidence | Present | High |
| IAM2-TC-030 | Risk acceptance required conflict | Requires approval/evidence | High |

---

## 5. Delegation / Temporary Permission Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM2-TC-031 | Valid delegation | Active until expiry | High |
| IAM2-TC-032 | Delegation without expiry | Blocked | Critical |
| IAM2-TC-033 | Delegation exceeds delegator permission | Blocked | Critical |
| IAM2-TC-034 | Delegation to conflicted user | Blocked | Critical |
| IAM2-TC-035 | Temporary permission valid | Allowed within scope/time | High |
| IAM2-TC-036 | Temporary permission expired | Blocked | Critical |
| IAM2-TC-037 | Temporary licence-locked permission | Blocked | Critical |

---

## 6. Break-Glass Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM2-TC-038 | Break-glass request | Pending approval | Critical |
| IAM2-TC-039 | Recipient approves own break-glass | Blocked | Critical |
| IAM2-TC-040 | Break-glass without expiry | Blocked | Critical |
| IAM2-TC-041 | Break-glass approved | Active time-boxed | Critical |
| IAM2-TC-042 | Break-glass expires | Access revoked | Critical |
| IAM2-TC-043 | Break-glass bypasses licence lock | Blocked | Critical |
| IAM2-TC-044 | Break-glass post-review missing | Escalated/block future | High |
| IAM2-TC-045 | Break-glass audit/alert | Present | Critical |

---

## 7. Client-Side Dual Authorization Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM2-TC-046 | Client maker initiates withdrawal | Approval required | Critical |
| IAM2-TC-047 | Client maker approves own action | Blocked | Critical |
| IAM2-TC-048 | Client approver approves with step-up | Approved | Critical |
| IAM2-TC-049 | Client approval threshold not met | Action blocked | Critical |
| IAM2-TC-050 | Staff approval also required | Client approval alone insufficient | Critical |

---

## 8. Permission Cache / Revocation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM2-TC-051 | Permission revoked | Cache invalidated | Critical |
| IAM2-TC-052 | Stale cache used after revocation | Blocked/fail closed | Critical |
| IAM2-TC-053 | User disabled/frozen | Permissions blocked | Critical |
| IAM2-TC-054 | Permission cache unavailable | Fail closed | Critical |
| IAM2-TC-055 | Session revalidation triggered | IAM-01 notified | High |

---

## 9. Sensitive Read / Evidence Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM2-TC-056 | Auditor reads evidence | Allowed read-only | Medium |
| IAM2-TC-057 | Sensitive permission read | Audit logged | High |
| IAM2-TC-058 | Unauthorised evidence read | Denied | High |
| IAM2-TC-059 | Permission export | Approval/audit required | High |
| IAM2-TC-060 | Evidence missing audit ref | Critical defect | Critical |

---

## 10. Service Account Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM2-TC-061 | Service account performs scoped action | Allowed | High |
| IAM2-TC-062 | Service account exceeds scope | Denied | Critical |
| IAM2-TC-063 | Service account approves human action | Blocked | Critical |
| IAM2-TC-064 | Service account uses human role | Blocked | Critical |

---

## 11. Approval-to-Execution Binding Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM2-TC-065 | Approval created with payload hash | Hash stored | Critical |
| IAM2-TC-066 | Execute with same payload hash | Allowed if all checks pass | Critical |
| IAM2-TC-067 | Approve 10k then mutate payload to 500k | Blocked + Critical audit | Critical |
| IAM2-TC-068 | Execute with expired approval | Blocked | Critical |
| IAM2-TC-069 | Execute with stale decision token after role revoke | Blocked | Critical |
| IAM2-TC-070 | Execute with session/auth-level invalidated | Blocked | Critical |
| IAM2-TC-071 | Decision token reused for different entity/action | Blocked | Critical |

---

## 12. Protected Action Registry Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM2-TC-072 | Registered sensitive action | Guard mapping present | Critical |
| IAM2-TC-073 | Unregistered sensitive action | Fail closed | Critical |
| IAM2-TC-074 | Orphan action in module scan | Build/deploy blocked | Critical |
| IAM2-TC-075 | Registry missing test reference | Coverage audit fails | High |

---

## 13. SoD Risk / Meta-SoD Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM2-TC-076 | Critical SoD risk acceptance attempted | Blocked | Critical |
| IAM2-TC-077 | High SoD risk accepted without Compliance+Management | Blocked | Critical |
| IAM2-TC-078 | SoD risk acceptance without expiry | Blocked | Critical |
| IAM2-TC-079 | SoD matrix editor also role assigner | Blocked | Critical |
| IAM2-TC-080 | SoD matrix critical rule disabled silently | Integrity alert / block | Critical |

---

## 14. Break-Glass Ceiling Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM2-TC-081 | Break-glass grants whitelisted emergency permission | Allowed time-boxed | Critical |
| IAM2-TC-082 | Break-glass grants IAM-02 admin permission | Blocked | Critical |
| IAM2-TC-083 | Break-glass grants SoD/licence-control permission | Blocked | Critical |
| IAM2-TC-084 | Break-glass duration exceeds max | Blocked | Critical |
| IAM2-TC-085 | Break-glass concurrent grant limit exceeded | Blocked | High |

---

## 15. Interim CFG/SEC and Correction Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM2-TC-086 | CFG-01 unavailable; config-sealed locked list used | Locked permissions blocked | Critical |
| IAM2-TC-087 | Local licence_locked flag drift from sealed list | Reconciliation alert/block | Critical |
| IAM2-TC-088 | SEC-01 unavailable; local audit index used as non-authoritative | Audit/outbox still emitted | High |
| IAM2-TC-089 | Service account tries human checker approval | Blocked | Critical |
| IAM2-TC-090 | Dual approvers same user/double-click race | Single decision only | Critical |
| IAM2-TC-091 | Dual approvers mutually conflicting under SoD | Blocked | Critical |
| IAM2-TC-092 | Delegate tries to re-delegate | Blocked | Critical |
| IAM2-TC-093 | User override allows licence-locked permission | Blocked | Critical |
| IAM2-TC-094 | Cache TTL valid but version stale | Blocked | Critical |

---

## 16. Go-Live Criteria

```txt
permission_guard_tests_passed = true
role_assignment_tests_passed = true
maker_checker_tests_passed = true
self_approval_block_tests_passed = true
sod_tests_passed = true
delegation_tests_passed = true
temporary_permission_tests_passed = true
break_glass_tests_passed = true
client_side_dual_authorization_tests_passed = true
cache_revocation_tests_passed = true
licence_locked_permission_tests_passed = true
sensitive_read_tests_passed = true
service_account_tests_passed = true
approval_execution_binding_tests_passed = true
protected_action_registry_tests_passed = true
sod_risk_meta_sod_tests_passed = true
break_glass_ceiling_tests_passed = true
interim_cfg_sec_contract_tests_passed = true
cache_positive_version_tests_passed = true
delegation_depth_tests_passed = true
critical_control_coverage = 100_percent
```
