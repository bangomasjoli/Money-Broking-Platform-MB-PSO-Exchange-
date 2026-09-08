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
| `wdr1.send.atomic_revalidate` | Atomic send revalidation |
| `wdr1.batch.create` | Create batch envelope |
| `wdr1.value_conservation.validate` | Validate payout conservation |
| `wdr1.beneficiary.verify` | Verify beneficiary integrity |
| `wdr1.signing_key.manage` | Manage signing key references |
| `wdr1.travel_rule_payload.verify` | Verify Travel Rule payload |
| `wdr1.sla_case.manage` | Manage stuck payout SLA |

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
9. high-value beneficiary verification.
10. batch/file release.
11. value conservation exception.
12. provider signing key change.
13. Travel Rule payload exception.
14. executed-late exception.

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

## 6. v1.1 Elevated Rules

1. No role may bypass send-time revalidation.
2. No role may bypass reserve-send lock.
3. No role may approve high-value payout without independent beneficiary verification where threshold applies.
4. No role may mark value conservation as pass without evidence.
5. No role may use expired/revoked signing key.
6. No role may mark paid/complete without rail finality and LED outcome.
