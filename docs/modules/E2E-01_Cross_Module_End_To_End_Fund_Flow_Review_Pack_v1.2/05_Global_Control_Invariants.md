# E2E-01 Cross-Module End-to-End Fund-Flow Review
## 05 Global Control Invariants

## 1. Licence Invariants

```txt
exchange_orderbook_enabled = false
matching_engine_enabled = false
client_to_client_matching_enabled = false
market_maker_enabled = false
principal_dealing_enabled = false
aix_spread_markup_enabled = false
```

## 2. Client Eligibility Invariant

```txt
client_money_action_allowed =
  CLT.status == approved
  AND KYC.outcome == current_pass
  AND AML.outcome == current_clear
  AND mandate.valid == true
  AND CFG.feature_allowed == true
  AND no_active_freeze_or_restriction
```

## 3. Ledger Invariants

```txt
journal.debits == journal.credits
posted_journal_mutable == false
direct_balance_edit_allowed == false
available_balance >= 0
reservation_source == live_balance_not_snapshot
```

## 4. Safeguarding Invariant

```txt
sum(client_liabilities_by_asset) <= confirmed_safeguarded_assets_by_asset
free_backing_not_double_used = true
encumbered_backing_reused = false
```

## 5. Deposit Invariant

```txt
available_credit_allowed =
  receipt_confirmed
  AND source_screening_clear
  AND source_matched
  AND backing_free_confirmed
  AND AML_KYC_CLT_clear
  AND idempotency_unique
```

## 6. Withdrawal / Payout Invariant

```txt
payout_allowed =
  WLT.verify_and_consume == current_allow
  AND AML.pre_transaction_gate == current_clear
  AND LED.atomic_reserve == committed
  AND TravelRule.complete_if_required
  AND no_freeze
```

## 7. Trade Invariants

```txt
trade_execution_allowed =
  CFG.execution_revalidated
  AND client_eligible
  AND quote_valid
  AND lp_approved_external
  AND LED.prefunded_hold_active
  AND AML.pre_transaction_gate_current
```

```txt
client_fill_allowed =
  external_lp_fill_exists
  AND fill_conservation_pass
  AND price_identity_pass
  AND no_internalisation
  AND no_synthetic_lp_fill
```

## 8. No Principal Exposure Invariant

```txt
aix_inventory_position == 0
aix_net_asset_position_after_conversion == 0
client_fill_without_lp_fill == false
aix_funds_client_settlement == false
rounding_residual_as_aix_profit == false
```

## 9. Audit Invariant

```txt
critical_action_without_sec_audit = prohibited
sensitive_read_without_sec_audit = prohibited
audit_delete_or_modify = prohibited
```

## 10. Reconciliation Invariant

Every money-flow event must reconcile across:

1. source request.
2. decision tokens.
3. audit event.
4. ledger journal/hold.
5. external evidence.
6. final state.

Unreconciled critical break must not auto-clear.

## 11. v1.1 Saga Consistency Invariant

```txt
for every correlation_id:
  every forward step is terminal_success OR compensated OR held_within_sla OR escalated
  no consumed_decision_without_downstream_action
  no active_hold_without_live_trade_or_payout
  no external_lp_order_without_resolution
  no settlement_handoff_without_led_outcome
```

## 12. v1.1 Decision Bundle Coherence Invariant

```txt
decision_bundle_valid =
  all_tokens.same_correlation_id
  AND all_tokens.same_client_id
  AND all_tokens.same_amount_asset_action
  AND all_tokens.same_point_in_time_snapshot_id
  AND all_tokens.not_stale
  AND all_tokens.not_revoked
```

## 13. v1.1 Global Freshness Invariant

```txt
decision_fresh =
  now <= token.valid_until_utc
  AND token.revocation_epoch == current_revocation_epoch
  AND revocation_signal_propagated_within_sla
```

## 14. v1.1 End-to-End Value Conservation Invariant

```txt
per_correlation:
  client_value_debited = client_value_credited + disclosed_fee + bounded_residual
  aix_net_asset_position = 0
  residual_account_within_bound = true
  no_value_in_operational_or_suspense_unexplained = true
```

## 15. v1.1 Freeze / Recovery Invariant

```txt
on_freeze:
  new_entries_blocked
  in_flight_state_disposition_defined
  affected_holds_orders_decisions_identified
  irreversible_legs_quarantined_or_compensated
  resume_requires_global_recovery_gate
```

## 16. v1.1 SEC Completeness Invariant

```txt
for every correlation_id:
  expected_event_manifest == emitted_sec_events
  missing_required_event = critical_break
```
