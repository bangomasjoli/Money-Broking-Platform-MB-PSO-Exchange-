# REC-01 Reconciliation / Finance Reporting
## 07 Permission Rules

## 1. Permission Namespace

```txt
rec1.<resource>.<action>
```

## 2. Permissions

| Permission | Purpose |
|---|---|
| `rec1.run.create` | Create recon run |
| `rec1.run.read` | Read run |
| `rec1.run.finalise` | Finalise run |
| `rec1.break.read` | Read break |
| `rec1.break.assign` | Assign break |
| `rec1.break.investigate` | Add investigation |
| `rec1.break.request_closure` | Request closure |
| `rec1.break.approve_closure` | Approve closure |
| `rec1.report.generate` | Generate report |
| `rec1.report.read` | Read report |
| `rec1.evidence_pack.generate` | Generate evidence pack |
| `rec1.export.sensitive` | Export sensitive data |
| `rec1.close.signoff_finance` | Finance sign-off |
| `rec1.close.signoff_compliance` | Compliance sign-off |
| `rec1.close.signoff_management` | Management sign-off |
| `rec1.admin.configure_rules` | Configure rule sets |

## 3. Maker-Checker Required

Required for:

1. high/critical break closure.
2. close sign-off with material unresolved breaks.
3. evidence pack export.
4. sensitive data export.
5. reconciliation rule set change.
6. materiality/SLA threshold change.
7. manual report finalisation.
8. accepting false positive critical break.

## 4. Never Allowed

No role may have:

```txt
rec1.ledger.post
rec1.balance.edit
rec1.source.modify
rec1.audit.modify
rec1.break.delete
rec1.critical_break.auto_clear
rec1.exchange_report.enable
```

## 5. SoD Rules

1. User who creates/remediates break cannot approve same high/critical closure.
2. Finance close signer cannot be the only approver of own manual adjustment report.
3. Admin configuring reconciliation rule cannot approve first report under new rule.
4. Evidence pack requester cannot solely approve own sensitive export.
