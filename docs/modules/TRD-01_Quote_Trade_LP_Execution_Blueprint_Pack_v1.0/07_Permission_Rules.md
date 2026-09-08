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
