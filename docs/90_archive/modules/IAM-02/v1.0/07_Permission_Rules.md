# IAM-02 RBAC / Permission Guard / SoD  
## 07 Permission Rules

## 1. Permission Namespace

Permission format:

```txt
<module>.<resource>.<action>
```

Examples:

```txt
iam2.role.read
iam2.role.assign
iam2.permission.assign
iam2.approval.approve
iam2.sod.manage
iam2.break_glass.approve
mon.withdrawal.approve
prd.trade.approve
```

---

## 2. IAM-02 Administrative Permissions

| Permission | Purpose |
|---|---|
| `iam2.role.read` | Read role catalogue |
| `iam2.role.create` | Create role |
| `iam2.role.update` | Update role |
| `iam2.role.retire` | Retire role |
| `iam2.role.assign_user` | Assign role to user |
| `iam2.role.revoke_user` | Revoke role |
| `iam2.permission.read` | Read permission catalogue |
| `iam2.permission.assign_role` | Assign permission to role |
| `iam2.permission.revoke_role` | Revoke permission from role |
| `iam2.approval.create` | Create approval |
| `iam2.approval.approve` | Approve request |
| `iam2.approval.reject` | Reject request |
| `iam2.sod.read` | Read SoD matrix |
| `iam2.sod.manage` | Manage SoD matrix |
| `iam2.delegation.create` | Create delegation |
| `iam2.delegation.revoke` | Revoke delegation |
| `iam2.temporary_permission.grant` | Grant temporary permission |
| `iam2.temporary_permission.revoke` | Revoke temporary permission |
| `iam2.break_glass.request` | Request break-glass |
| `iam2.break_glass.approve` | Approve break-glass |
| `iam2.break_glass.revoke` | Revoke break-glass |
| `iam2.break_glass.review` | Close post-review |
| `iam2.evidence.read` | Read permission evidence |
| `iam2.sensitive_read` | Read sensitive permission data |

---

## 3. Prohibited Permissions

These permissions must not be grantable while Exchange is pending:

```txt
exchange.orderbook.enable
exchange.matching_engine.enable
exchange.client_to_client_matching.enable
exchange.public_trading.enable
exchange.market_maker.enable
exchange.principal_dealing.enable
exchange.aix_spread_markup.enable
```

These permissions must never exist as bypass permissions:

```txt
iam2.bypass_permission_guard
iam2.bypass_maker_checker
iam2.bypass_sod
iam2.bypass_audit
iam2.bypass_licence_lock
iam2.self_approve
ledger.direct_edit
balance.direct_edit
audit.delete
audit.modify
```

---

## 4. Maker-Checker Required Actions

Maker-checker required for:

1. Role creation/update/retirement.
2. Privileged role assignment.
3. Permission assignment to role.
4. SoD matrix change.
5. Approval policy change.
6. Temporary sensitive permission grant.
7. Delegation of sensitive approval.
8. Break-glass request.
9. MFA reset approval from IAM-01.
10. Withdrawal approval.
11. Payout destination approval.
12. High-value trade approval.
13. LP settlement payment approval.
14. Regulatory report submission.
15. Threshold report submission.
16. Feature/licence control change in CFG-01.

---

## 5. SoD Conflict Examples

| Conflict | Enforcement |
|---|---|
| Maker and checker same user | Block |
| Role assigner and approver same user | Block |
| Payment maker and payment approver same user | Block |
| Ledger poster and ledger approver same user | Block |
| Compliance case maker and STR approver same user | Block |
| Break-glass grantor and recipient same user | Block |
| Service account as human approver | Block |
| Client maker and client approver same user | Block |
| Permission admin approving own privilege escalation | Block |
| Auditor with mutation role | Block |

---

## 6. Step-Up Required Permissions

Step-up required for:

1. Privileged role assignment.
2. Permission grant/revoke for sensitive permissions.
3. Approval of high-risk action.
4. MFA reset approval.
5. Break-glass approval.
6. Large withdrawal approval.
7. Payout destination approval.
8. High-value trade approval.
9. Sensitive evidence export.
10. Service account credential control.

---

## 7. Permission Precedence

1. Licence-lock deny.
2. Prohibited permission deny.
3. Account/session freeze deny.
4. Explicit deny override.
5. SoD block.
6. Missing step-up deny/step_up_required.
7. Approval required.
8. Temporary permission if active and valid.
9. Delegated permission if active and valid.
10. Role permission.
11. Default deny.
