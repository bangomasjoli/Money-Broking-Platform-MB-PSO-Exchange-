# TRD-01 Quote / Trade / LP Execution
## 05 Database Design

## 1. Schema

Recommended schema:

```txt
trd1
```

Runtime DB role:

```txt
role_trd1_runtime
```

Rules:

1. TRD-01 runtime role owns/accesses TRD-01 schema only.
2. Trade states are append-versioned.
3. No order book table.
4. No matching table.
5. No AIX inventory table.

---

## 2. Tables

### 2.1 `trd1.instrument_pair`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| pair_id | varchar | Unique |
| base_asset | varchar | Base |
| quote_asset | varchar | Quote |
| status | varchar | active/suspended/inactive |
| allowed_client_classes | jsonb | Eligibility |
| cfg_feature_ref | varchar | CFG |
| approved_ref | varchar | Approval |
| sec_audit_ref | varchar | Audit |

### 2.2 `trd1.lp_profile`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| lp_id | varchar | Unique |
| lp_name | varchar | Name |
| status | varchar | active/suspended/inactive |
| allowed_pairs | jsonb | Coverage |
| api_profile_ref | varchar | Integration |
| approval_ref | varchar | Approval |
| sec_audit_ref | varchar | Audit |

### 2.3 `trd1.lp_quote`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| lp_quote_id | varchar | Unique |
| lp_id | varchar | LP |
| pair_id | varchar | Pair |
| side | varchar | buy/sell |
| amount | numeric | Amount |
| lp_price | numeric | LP price |
| quote_type | varchar | firm_executable/indicative |
| valid_until_utc | timestamptz | Expiry |
| source_authenticated | boolean | Source auth |
| payload_hash | varchar | Hash |
| received_at_utc | timestamptz | Received |
| sec_audit_ref | varchar | Audit |

### 2.4 `trd1.client_quote`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| quote_id | varchar | Unique |
| client_id | varchar | Client |
| lp_quote_id | varchar | LP quote |
| pair_id | varchar | Pair |
| side | varchar | buy/sell |
| amount | numeric | Amount |
| lp_price | numeric | LP price |
| quote_type | varchar | firm_executable/indicative |
| client_price | numeric | Client price |
| fee_amount | numeric | Fee |
| fee_disclosure_ref | varchar | Disclosure |
| slippage_tolerance | numeric | Tolerance |
| status | varchar | offered/accepted/expired/cancelled |
| valid_until_utc | timestamptz | Expiry |
| quote_hash | varchar | Hash |
| execution_model | varchar | contingent/atomic_firm |
| lp_payload_hash_bound | varchar | Bound LP evidence |
| price_identity_status | varchar | pass/fail |
| sec_audit_ref | varchar | Audit |

### 2.5 `trd1.trade`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| trade_id | varchar | Unique |
| quote_id | varchar | Quote |
| client_id | varchar | Client |
| pair_id | varchar | Pair |
| side | varchar | Side |
| requested_amount | numeric | Requested |
| status | varchar | accepted/hold_created/execution_submitted/filled/partial_filled/rejected/voided/settlement_pending/settled/reconcile_required |
| led_hold_ref | varchar | LED hold |
| aml_decision_ref | varchar | AML |
| client_approval_ref | varchar | Client approval |
| status_version | int | Version |
| cfg_decision_ref | varchar | CFG licence decision |
| cfg_decision_hash | varchar | CFG hash |
| execution_model | varchar | contingent/atomic_firm |
| sec_audit_ref | varchar | Audit |

### 2.6 `trd1.lp_order`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| lp_order_id | varchar | Unique |
| trade_id | varchar | Trade |
| lp_id | varchar | LP |
| client_order_ref | varchar | Idempotent ref |
| idempotency_key | varchar | Idempotency |
| order_status | varchar | submitted/accepted/filled/partial_filled/rejected/timeout/cancelled |
| request_payload_hash | varchar | Request |
| response_payload_hash | varchar | Response |
| submitted_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.7 `trd1.lp_fill`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| lp_fill_id | varchar | Unique |
| lp_order_id | varchar | LP order |
| trade_id | varchar | Trade |
| fill_amount | numeric | Amount |
| fill_price | numeric | Price |
| fill_status | varchar | filled/partial/rejected/cancelled |
| fill_payload_hash | varchar | Hash |
| external_lp_fill | boolean | Must be true |
| allocated_quantity | numeric | Quantity allocated to client fills |
| allocation_status | varchar | unallocated/partial_allocated/fully_allocated |
| received_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.8 `trd1.client_fill`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| client_fill_id | varchar | Unique |
| trade_id | varchar | Trade |
| lp_fill_id | varchar | LP fill |
| filled_amount | numeric | Amount |
| execution_price | numeric | Price |
| fee_amount | numeric | Fee |
| fill_status | varchar | final/partial/voided |
| confirmation_ref | varchar | Client confirmation |
| conservation_record_id | varchar | Conservation proof |
| lp_vwap_price | numeric | VWAP for tranches |
| price_identity_status | varchar | pass/fail |
| sec_audit_ref | varchar | Audit |

### 2.9 `trd1.settlement_handoff`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| handoff_id | varchar | Unique |
| trade_id | varchar | Trade |
| led_hold_ref | varchar | Hold |
| led_settlement_ref | varchar | LED settlement |
| led_settlement_status | varchar | pending/confirmed/failed/reversed |
| conversion_legs | jsonb | A-out/B-in |
| fee_disclosure_ref | varchar | Fee |
| residual_details | jsonb | Rounding |
| evidence_hash | varchar | Evidence |
| delivery_status | varchar | pending/sent/acknowledged/failed/deadlettered |
| sec_audit_ref | varchar | Audit |

### 2.10 `trd1.trade_state_event`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| state_event_id | varchar | Unique |
| trade_id | varchar | Trade |
| from_status | varchar | From |
| to_status | varchar | To |
| reason_code | varchar | Reason |
| source_ref | varchar | Source |
| occurred_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.11 `trd1.reconciliation_run`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| run_id | varchar | Unique |
| recon_type | varchar | quote/lp/fill/settlement/fee/residual |
| status | varchar | running/completed/failed |
| break_count | int | Count |
| sec_audit_ref | varchar | Audit |

### 2.12 `trd1.reconciliation_break`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| break_id | varchar | Unique |
| run_id | varchar | Run |
| severity | varchar | low/medium/high/critical |
| break_type | varchar | mismatch/missing/duplicate/out_of_order/prohibited |
| affected_ref | varchar | Ref |
| status | varchar | open/in_review/resolved/escalated |
| resolution_ref | varchar | Evidence |
| sec_audit_ref | varchar | Audit |

---


### 2.13 `trd1.fill_conservation_record`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| conservation_record_id | varchar | Unique |
| trade_id | varchar | Trade |
| client_fill_id | varchar | Client fill |
| lp_fill_refs | jsonb | One or more LP fills |
| lp_quantity_total | numeric | LP total |
| client_quantity | numeric | Client quantity |
| lp_vwap_price | numeric | VWAP |
| client_execution_price | numeric | Client price |
| disclosed_fee_amount | numeric | Fee |
| conservation_status | varchar | pass/fail |
| sec_audit_ref | varchar | Audit |

### 2.14 `trd1.price_construction_record`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| price_record_id | varchar | Unique |
| quote_id | varchar | Quote |
| trade_id | varchar | Optional trade |
| lp_price | numeric | LP price |
| client_all_in_price | numeric | Client price |
| disclosed_fee_amount | numeric | Fee |
| rounding_policy_ref | varchar | Rounding |
| identity_status | varchar | pass/fail |
| quote_hash | varchar | Hash |
| sec_audit_ref | varchar | Audit |

### 2.15 `trd1.lp_timeout_resolution`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| timeout_resolution_id | varchar | Unique |
| lp_order_id | varchar | LP order |
| trade_id | varchar | Trade |
| client_order_ref | varchar | Query key |
| query_status | varchar | pending/queried/terminal/escalated |
| lp_terminal_status | varchar | filled/rejected/cancelled/not_found/unknown |
| escalation_due_utc | timestamptz | SLA |
| resolution_ref | varchar | Evidence |
| sec_audit_ref | varchar | Audit |

### 2.16 `trd1.cfg_revalidation`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| cfg_revalidation_id | varchar | Unique |
| trade_id | varchar | Trade |
| action_type | varchar | quote_acceptance/lp_execution/settlement_handoff |
| cfg_decision_ref | varchar | CFG decision |
| cfg_decision_hash | varchar | Hash |
| status | varchar | pass/fail/stale |
| checked_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.17 `trd1.lp_selection_record`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| selection_record_id | varchar | Unique |
| trade_id | varchar | Trade |
| eligible_lps | jsonb | Eligible set |
| selected_lp_id | varchar | Selected |
| selection_reason | varchar | price/liquidity/coverage/availability/risk/manual |
| quotes_considered | jsonb | Evidence |
| manual_reason | text | If manual |
| sec_audit_ref | varchar | Audit |

### 2.18 `trd1.settlement_confirmation_sync`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| sync_id | varchar | Unique |
| trade_id | varchar | Trade |
| handoff_id | varchar | Handoff |
| led_settlement_ref | varchar | LED ref |
| led_outcome_status | varchar | pending/confirmed/failed/reversed |
| client_confirmation_status | varchar | executed_pending_settlement/settled/failed/corrected |
| payload_hash | varchar | LED event hash |
| sec_audit_ref | varchar | Audit |


## 3. Indexes

1. `instrument_pair(pair_id, status)`.
2. `lp_profile(lp_id, status)`.
3. `lp_quote(lp_id, pair_id, valid_until_utc)`.
4. `client_quote(client_id, status, valid_until_utc)`.
5. `trade(client_id, status)`.
6. `trade(quote_id)`.
7. `lp_order(trade_id, client_order_ref)`.
8. `lp_order(idempotency_key)`.
9. `lp_fill(lp_order_id, lp_fill_id)`.
10. `client_fill(trade_id, lp_fill_id)`.
11. `settlement_handoff(trade_id, delivery_status)`.
12. `trade_state_event(trade_id, occurred_at_utc)`.
13. `reconciliation_break(run_id, severity, status)`.
14. `fill_conservation_record(trade_id, conservation_status)`.
15. `price_construction_record(quote_id, identity_status)`.
16. `lp_timeout_resolution(lp_order_id, query_status)`.
17. `cfg_revalidation(trade_id, action_type, status)`.
18. `lp_selection_record(trade_id, selected_lp_id)`.
19. `settlement_confirmation_sync(trade_id, led_outcome_status)`.

---

## 4. Data Rules

1. No client quote without LP quote.
2. No accepted quote after expiry.
3. No LP execution without LED hold.
4. No client fill without LP fill.
5. No settlement handoff without LP fill and hold.
6. No spread markup.
7. Fee requires disclosure.
8. LP source authentication and payload hash required.
9. Duplicate LP fill cannot duplicate client fill.
10. Out-of-order LP status cannot skip state.
11. No order book/matching data structures.
12. No AIX inventory state.
13. Client quote validity must not exceed LP quote validity.
14. Quote hash must bind LP quote ID, LP price and LP payload hash.
15. Client fill quantity must equal LP fill quantity or tranche sum.
16. Client price must equal LP price/VWAP net of disclosed fee only.
17. LP fill quantity cannot be double allocated.
18. Timeout must resolve through LP query-back.
19. CFG decision must be revalidated at execution and settlement.
20. Client confirmation must reflect LED actual settlement outcome.
