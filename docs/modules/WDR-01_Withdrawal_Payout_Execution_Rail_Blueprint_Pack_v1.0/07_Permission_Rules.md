# WDR-01 Withdrawal / Payout Execution Rail
## 07 Permission Rules

## 1. Permission Namespace

```txt
wdr1.<resource>.<action>
```

## 2. Permissions

| Permission | Purpose |
|---|---|
| `wdr1.execution.create` | Create execution record |
| `wdr1.execution.read` | Read execution |
| `wdr1.bundle.validate` | Validate decision bundle |
| `wdr1.provider.submit` | Submit provider instruction |
| `wdr1.provider.queryback` | Query provider |
| `wdr1.provider.receive_status` | Receive provider status |
| `wdr1.led.notify_finality` | Notify LED finality |
| `wdr1.led.notify_failure` | Notify LED failure |
| `wdr1.cancel.request` | Request cancellation |
| `wdr1.return_reversal.manage` | Manage return/reversal |
| `wdr1.reconciliation.run` | Run reconciliation |
| `wdr1.reconciliation.resolve` | Resolve break |
| `wdr1.evidence.export` | Export evidence |
| `wdr1.admin.configure_provider` | Configure provider/rail |

## 3. Maker-Checker Required

Required for:

1. provider/rail configuration.
2. manual payout cancellation.
3. manual query-back resolution.
4. return/reversal resolution.
5. manual replay of provider instruction.
6. finality override/risk acceptance.
7. reconciliation break resolution.
8. evidence export.

## 4. Never Allowed

No role may have:

```txt
wdr1.ledger.post
wdr1.balance.edit
wdr1.bypass_led_reserve
wdr1.bypass_wlt_decision
wdr1.bypass_aml_gate
wdr1.bypass_travel_rule
wdr1.bypass_cfg_lock
wdr1.principal_fund_payout
```

## 5. SoD Rules

1. User configuring provider cannot approve same provider activation.
2. User requesting cancellation cannot solely approve cancellation.
3. Super Admin cannot execute payout bypass.
4. Service account cannot approve exception.
5. Break-glass cannot submit payout instruction.
