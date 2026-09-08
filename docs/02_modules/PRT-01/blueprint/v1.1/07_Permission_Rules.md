# PRT-01 Client / Staff / Admin Portal Workflows
## 07 Permission Rules

## 1. Permission Namespace

```txt
prt1.<resource>.<action>
```

## 2. Permissions

| Permission | Purpose |
|---|---|
| `prt1.client.view_dashboard` | Client dashboard |
| `prt1.client.request_deposit` | Deposit intent |
| `prt1.client.request_withdrawal` | Withdrawal request |
| `prt1.client.request_quote` | Quote request |
| `prt1.client.accept_quote` | Quote acceptance |
| `prt1.staff.view_worklist` | Staff worklist |
| `prt1.compliance.view_restricted` | Restricted compliance data |
| `prt1.finance.view_reports` | Finance reports |
| `prt1.security.view_sessions` | Security/session views |
| `prt1.admin.manage_nonfinancial` | Non-financial admin |
| `prt1.approval.approve` | Maker-checker approval |
| `prt1.export.request` | Request export |
| `prt1.export.approve` | Approve export |
| `prt1.template.manage` | Manage message templates |
| `prt1.object.read_authorized` | Object-level read authorization |
| `prt1.export.download_token.issue` | Issue export download token |
| `prt1.upload.submit` | Submit upload |
| `prt1.notification.send` | Send reconciled notification |
| `prt1.status.override_display` | Restricted emergency display correction |

## 3. Never Allowed

No role may have:

```txt
prt1.ledger.post
prt1.balance.edit
prt1.deposit.credit
prt1.withdrawal.execute
prt1.trade.execute
prt1.aml.override
prt1.wlt.override
prt1.inc.freeze.release_bypass
prt1.rec.break.clear
prt1.audit.delete
prt1.exchange_ui.enable
```

## 4. Maker-Checker Required

1. sensitive export.
2. message template approval.
3. admin high-risk configuration.
4. client-facing incident/security communication.
5. role/menu permission changes.
6. evidence pack download for auditor/regulator.

## 5. v1.1 Object Entitlement Rules

1. Client object read requires ownership.
2. Staff object read requires assigned case, mandate or approved scope.
3. Portal service account never grants broader user access.
4. Auditor/regulator access requires evidence-pack scope.
5. Management dashboard access requires approved aggregation scope.
