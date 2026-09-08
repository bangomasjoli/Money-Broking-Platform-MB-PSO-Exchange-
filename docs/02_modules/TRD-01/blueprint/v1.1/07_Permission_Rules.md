# TRD-01 Quote / Trade / LP Execution
## 07 Permission Rules

## 1. Permission Namespace

```txt
trd1.<resource>.<action>
```

---

## 2. Permissions

| Permission | Purpose |
|---|---|
| `trd1.quote.request` | Request quote |
| `trd1.quote.read` | Read quote |
| `trd1.quote.accept` | Accept quote |
| `trd1.trade.read` | Read trade |
| `trd1.trade.execute_lp` | Submit LP execution |
| `trd1.trade.cancel` | Cancel trade |
| `trd1.trade.requote` | Requote |
| `trd1.lp_quote.request` | Request LP quote |
| `trd1.lp_update.receive` | Receive LP update |
| `trd1.settlement_handoff.create` | Create LED handoff |
| `trd1.reconciliation.run` | Run reconciliation |
| `trd1.reconciliation.resolve` | Resolve break |
| `trd1.evidence.export` | Export evidence |
| `trd1.admin.configure_lp` | Configure LP |
| `trd1.admin.configure_instrument` | Configure instrument |
| `trd1.admin.configure_slippage` | Configure slippage policy |
| `trd1.timeout.resolve` | Resolve LP timeout |
| `trd1.fill_conservation.validate` | Validate fill conservation |
| `trd1.cfg_revalidate.execute` | Revalidate CFG at execution/settlement |
| `trd1.best_execution.record` | Record LP-selection evidence |
| `trd1.confirmation.sync` | Sync LED settlement outcome |

---

## 3. Maker-Checker Required

Required for:

1. LP configuration.
2. instrument/pair enablement.
3. slippage policy change.
4. fee schedule/disclosure config.
5. manual trade cancel after LP submission.
6. manual reconcile/timeout resolution.
7. partial fill exception.
8. settlement handoff replay.
9. evidence export.
10. LP timeout manual resolution.
11. late-fill exception resolution.
12. best-execution manual override.
13. price identity exception.
14. partial residual hold release exception.

---

## 4. Never Allowed

No role may have:

```txt
exchange.orderbook.enable
exchange.matching_engine.enable
exchange.client_to_client_matching.enable
exchange.market_maker.enable
exchange.principal_dealing.enable
exchange.aix_spread_markup.enable
trd1.bypass_led_hold
trd1.bypass_aml_gate
trd1.create_client_fill_without_lp_fill
trd1.aix_inventory_use
```

---

## 5. SoD Rules

1. Staff configuring LP cannot solely approve same LP activation.
2. Staff resolving timeout cannot approve own settlement handoff replay where policy requires.
3. Super Admin cannot bypass quote/trade controls.
4. Break-glass cannot place trade.
5. Service account cannot approve trade exception.
6. Dealer cannot alter fee disclosure after quote acceptance.

## 6. v1.1 Elevated Rules

1. No role may approve client fill without conserved external LP fill.
2. No role may approve hidden markup or price identity failure.
3. No role may resolve timeout without LP query-back evidence unless formal incident exception is approved.
4. No role may bypass execution-time or settlement-time CFG revalidation.
5. No role may approve internal crossing/netting.
6. No role may mark client confirmation as settled without LED-01 actual settlement outcome.
