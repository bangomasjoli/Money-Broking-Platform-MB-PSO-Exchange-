# CFG-01 Feature Flag / Licence Lock  
## 07 Permission Rules

## 1. Permission Namespace

Format:

```txt
cfg1.<resource>.<action>
```

---

## 2. CFG-01 Permissions

| Permission | Purpose |
|---|---|
| `cfg1.feature.read` | Read feature registry |
| `cfg1.feature.create` | Create feature entry |
| `cfg1.feature.update` | Update feature metadata |
| `cfg1.feature.change_request` | Request feature state change |
| `cfg1.feature.enable` | Enable approved feature |
| `cfg1.feature.disable` | Disable feature |
| `cfg1.feature.kill_switch` | Emergency feature disable |
| `cfg1.licence_profile.read` | Read licence profile |
| `cfg1.licence_profile.change_request` | Request licence profile change |
| `cfg1.licence_profile.activate` | Activate approved profile |
| `cfg1.prohibited_feature.read` | Read prohibited registry |
| `cfg1.prohibited_feature.manage` | Manage prohibited registry |
| `cfg1.deployment_gate.check` | Run deployment gate |
| `cfg1.reconciliation.run` | Run reconciliation |
| `cfg1.evidence_export.request` | Request evidence export |
| `cfg1.evidence_export.approve` | Approve evidence export |
| `cfg1.admin.configure` | Administer CFG-01 |

---

## 3. Prohibited / Non-Grantable Permissions

These must not exist as bypass permissions:

```txt
cfg1.bypass_licence_lock
cfg1.bypass_feature_flag
cfg1.enable_prohibited_feature
cfg1.enable_exchange_without_approval
cfg1.enable_principal_dealing
cfg1.enable_market_making
cfg1.enable_aix_spread_markup
cfg1.disable_audit
cfg1.disable_iam
cfg1.disable_sec01
cfg1.override_without_audit
```

---

## 4. Maker-Checker / Step-Up Required

Required for:

1. Feature enablement.
2. Feature registry creation/update for sensitive features.
3. Prohibited feature registry change.
4. Licence profile change.
5. Exchange licence activation.
6. Kill-switch deactivation.
7. Evidence export.
8. Deployment gate override, if any allowed.
9. Feature decision policy change.
10. Client-class constraint change.

---

## 5. SoD Rules

1. Feature change requester cannot approve own change.
2. Licence profile requester cannot approve own profile.
3. Tech Admin cannot solely approve licence-sensitive feature enablement.
4. Compliance must approve licence-sensitive features.
5. Security must approve security-sensitive features.
6. Deployment manager cannot override failed deployment gate alone.
7. Kill-switch deactivation requires non-activator approval.
8. Evidence export requester cannot be sole approver.
9. Prohibited feature registry editor cannot approve own edit.
10. Super Admin cannot bypass SoD.

---

## 6. Feature Decision Precedence

Decision order:

1. Prohibited feature deny.
2. Licence profile deny/lock.
3. Suspended/revoked licence deny.
4. Environment constraint deny.
5. Client-class constraint deny.
6. Kill-switch deny.
7. Dependency not ready deny.
8. Feature state disabled/locked deny.
9. Stale version deny/revalidate.
10. Explicit feature allow.
11. Default deny.

---

## 7. Required Prohibited Feature Codes

Minimum prohibited/locked feature codes:

```txt
exchange.public_order_book
exchange.matching_engine
exchange.client_to_client_matching
exchange.public_exchange_trading
exchange.public_market_depth
exchange.market_maker
exchange.principal_dealing
pricing.aix_spread_markup
onboarding.retail_default
audit.bypass
permission.bypass
kyc.bypass
aml.bypass
travel_rule.bypass
ledger.direct_edit
balance.direct_edit
client_approval.bypass
lp_settlement_approval.bypass
break_glass_logging.bypass
```
