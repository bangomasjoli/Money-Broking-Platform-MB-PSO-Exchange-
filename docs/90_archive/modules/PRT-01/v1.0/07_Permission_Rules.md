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
