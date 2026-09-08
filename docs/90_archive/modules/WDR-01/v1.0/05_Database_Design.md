# WDR-01 Withdrawal / Payout Execution Rail
## 05 Database Design

## 1. Schema

Recommended schema:

```txt
wdr1
```

Runtime DB role:

```txt
role_wdr1_runtime
```

Rules:

1. WDR-01 runtime role owns/accesses WDR schema only.
2. No ledger journal table.
3. No balance table.
4. No private key material stored.
5. Provider payloads/evidence are hash-linked and audit-retained.

---

## 2. Tables

### 2.1 `wdr1.payout_execution`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| payout_execution_id | varchar | Unique |
| correlation_id | varchar | E2E |
| client_id | varchar | Client |
| asset_or_currency | varchar | Asset/currency |
| amount | numeric | Amount |
| destination_ref | varchar | Destination |
| action_type | varchar | withdrawal/payout/refund/return |
| status | varchar | created/bundle_validated/submitted/acknowledged/processing/final/failed/returned/reversed/cancelled/reconcile_required |
| source_workflow_ref | varchar | LED/payout workflow |
| status_version | int | CAS |
| sec_audit_ref | varchar | Audit |

### 2.2 `wdr1.decision_bundle`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| decision_bundle_id | varchar | Unique |
| payout_execution_id | varchar | Payout |
| correlation_id | varchar | E2E |
| wlt_decision_ref | varchar | WLT |
| aml_decision_ref | varchar | AML |
| travel_rule_ref | varchar | Travel Rule |
| led_reserve_ref | varchar | LED reserve |
| cfg_decision_ref | varchar | CFG |
| iam_approval_ref | varchar | IAM |
| bundle_status | varchar | valid/invalid/stale/revoked/mismatch |
| checked_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.3 `wdr1.provider_route`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| provider_route_id | varchar | Unique |
| provider_id | varchar | Provider |
| rail_type | varchar | bank/custodian/chain/payment |
| asset_or_currency | varchar | Asset |
| destination_type | varchar | bank_account/wallet/custodian_account |
| status | varchar | active/suspended/inactive |
| approval_ref | varchar | Approval |
| sec_audit_ref | varchar | Audit |

### 2.4 `wdr1.provider_instruction`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| provider_instruction_id | varchar | Unique |
| payout_execution_id | varchar | Payout |
| provider_route_id | varchar | Route |
| provider_external_ref | varchar | Provider ref |
| idempotency_key | varchar | Idempotency |
| request_payload_hash | varchar | Request hash |
| auth_key_ref | varchar | Signing/auth key ref |
| instruction_status | varchar | built/submitted/acknowledged/processing/final/failed/unknown |
| submitted_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.5 `wdr1.provider_status_event`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| provider_status_event_id | varchar | Unique |
| provider_instruction_id | varchar | Instruction |
| provider_event_id | varchar | Provider event |
| event_type | varchar | ack/status/finality/failure/return/reversal/cancel |
| event_status | varchar | received/authenticated/rejected |
| payload_hash | varchar | Hash |
| provider_timestamp_utc | timestamptz | Provider time |
| sec_audit_ref | varchar | Audit |

### 2.6 `wdr1.finality_record`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| finality_record_id | varchar | Unique |
| payout_execution_id | varchar | Payout |
| provider_instruction_id | varchar | Instruction |
| finality_model | varchar | bank_finality/custodian_finality/chain_finality |
| finality_status | varchar | pending/final/failed/returned/reversed/reconcile_required |
| confirmations | int | Chain confirmations |
| required_confirmations | int | Required |
| finality_evidence_hash | varchar | Evidence |
| led_notification_ref | varchar | LED notification |
| sec_audit_ref | varchar | Audit |

### 2.7 `wdr1.cancellation_request`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| cancellation_id | varchar | Unique |
| payout_execution_id | varchar | Payout |
| requested_by | varchar | Actor |
| reason_code | varchar | Reason |
| provider_cancel_ref | varchar | Provider cancel ref |
| cancellation_status | varchar | requested/accepted/rejected/too_late/executed_late |
| approval_ref | varchar | Maker-checker |
| sec_audit_ref | varchar | Audit |

### 2.8 `wdr1.return_reversal_case`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| case_id | varchar | Unique |
| payout_execution_id | varchar | Payout |
| original_correlation_id | varchar | Original |
| return_type | varchar | return/reversal/recall/reject/chargeback |
| provider_event_ref | varchar | Provider event |
| led_notification_ref | varchar | LED |
| status | varchar | open/notified_led/in_review/resolved/escalated |
| sec_audit_ref | varchar | Audit |

### 2.9 `wdr1.queryback_case`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| queryback_id | varchar | Unique |
| payout_execution_id | varchar | Payout |
| provider_instruction_id | varchar | Instruction |
| query_status | varchar | pending/queried/terminal/escalated |
| provider_terminal_status | varchar | executed/failed/not_found/unknown |
| escalation_due_utc | timestamptz | SLA |
| sec_audit_ref | varchar | Audit |

### 2.10 `wdr1.reconciliation_run`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| run_id | varchar | Unique |
| recon_type | varchar | bundle/provider/finality/led/reversal/e2e |
| status | varchar | running/completed/failed |
| break_count | int | Count |
| sec_audit_ref | varchar | Audit |

### 2.11 `wdr1.reconciliation_break`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| break_id | varchar | Unique |
| run_id | varchar | Run |
| severity | varchar | low/medium/high/critical |
| break_type | varchar | mismatch/missing/duplicate/stale/orphan |
| affected_ref | varchar | Ref |
| status | varchar | open/in_review/resolved/escalated |
| sec_audit_ref | varchar | Audit |

---

## 3. Indexes

1. `payout_execution(correlation_id, status)`.
2. `payout_execution(client_id, status)`.
3. `decision_bundle(payout_execution_id, bundle_status)`.
4. `provider_route(provider_id, rail_type, status)`.
5. `provider_instruction(payout_execution_id, idempotency_key)`.
6. `provider_instruction(provider_external_ref)`.
7. `provider_status_event(provider_instruction_id, provider_event_id)`.
8. `finality_record(payout_execution_id, finality_status)`.
9. `cancellation_request(payout_execution_id, cancellation_status)`.
10. `return_reversal_case(payout_execution_id, status)`.
11. `queryback_case(payout_execution_id, query_status)`.
12. `reconciliation_break(run_id, severity, status)`.

## 4. Data Rules

1. No ledger tables.
2. No balance tables.
3. No provider private keys stored.
4. Payout execution requires valid decision bundle.
5. Provider instruction requires active LED reserve.
6. Provider instruction requires WLT/AML/Travel Rule where applicable.
7. Duplicate provider event cannot duplicate settlement.
8. Timeout requires query-back.
9. Finality notification to LED requires provider evidence.
10. Return/reversal binds original correlation.
