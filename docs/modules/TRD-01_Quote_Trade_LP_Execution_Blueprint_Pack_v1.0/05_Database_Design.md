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
| client_price | numeric | Client price |
| fee_amount | numeric | Fee |
| fee_disclosure_ref | varchar | Disclosure |
| slippage_tolerance | numeric | Tolerance |
| status | varchar | offered/accepted/expired/cancelled |
| valid_until_utc | timestamptz | Expiry |
| quote_hash | varchar | Hash |
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
| sec_audit_ref | varchar | Audit |

### 2.9 `trd1.settlement_handoff`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| handoff_id | varchar | Unique |
| trade_id | varchar | Trade |
| led_hold_ref | varchar | Hold |
| led_settlement_ref | varchar | LED settlement |
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
