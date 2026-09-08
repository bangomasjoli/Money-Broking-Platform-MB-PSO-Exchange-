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
| logical_payout_key | varchar | correlation+client+destination+amount+asset |
| led_reserve_binding_status | varchar | unbound/bound/sent/released_by_led |
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
| send_time_revalidated_at_utc | timestamptz | Send recheck time |
| revocation_epoch_hash | varchar | WLT/AML/CFG epoch hash |
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
| canonical_destination_hash | varchar | WLT canonical destination hash |
| beneficiary_integrity_status | varchar | pass/fail/pending |
| reserve_send_lock_ref | varchar | Exclusive reserve lock |
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
| amount_sent | numeric | Sent amount |
| fee_amount | numeric | Rail/network fee |
| fee_asset | varchar | Fee asset |
| residual_amount | numeric | Residual |
| beneficiary_received_amount | numeric | Beneficiary amount |
| value_conservation_status | varchar | pass/fail/pending |
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


### 2.12 `wdr1.payout_batch`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| batch_id | varchar | Unique |
| provider_route_id | varchar | Route |
| batch_idempotency_key | varchar | Batch idem |
| batch_status | varchar | built/submitted/acknowledged/partial/final/failed/reconcile_required |
| item_count | int | Items |
| total_amount | numeric | Total |
| file_manifest_hash | varchar | Manifest |
| file_checksum | varchar | Checksum |
| submitted_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.13 `wdr1.payout_batch_item`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| batch_item_id | varchar | Unique |
| batch_id | varchar | Batch |
| payout_execution_id | varchar | Payout |
| item_idempotency_key | varchar | Item idem |
| item_status | varchar | pending/submitted/final/failed/returned/unknown |
| item_finality_ref | varchar | Finality |
| sec_audit_ref | varchar | Audit |

### 2.14 `wdr1.value_conservation_record`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| conservation_id | varchar | Unique |
| payout_execution_id | varchar | Payout |
| led_reserve_ref | varchar | Reserve |
| reserved_amount | numeric | Reserved |
| amount_sent | numeric | Sent |
| fee_amount | numeric | Fee |
| residual_amount | numeric | Residual |
| fx_rate | numeric | Rail FX if any |
| conservation_status | varchar | pass/fail/pending |
| led_settlement_ref | varchar | LED |
| sec_audit_ref | varchar | Audit |

### 2.15 `wdr1.reserve_send_lock`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| reserve_send_lock_id | varchar | Unique |
| led_reserve_ref | varchar | LED reserve |
| payout_execution_id | varchar | Payout |
| provider_instruction_id | varchar | Instruction |
| lock_status | varchar | acquired/sent/released/failed |
| acquired_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.16 `wdr1.provider_signing_key_ref`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| key_ref_id | varchar | Unique |
| provider_id | varchar | Provider |
| key_id | varchar | External/HSM key ID |
| key_status | varchar | active/rotating/expired/revoked |
| storage_boundary | varchar | hsm/secrets_manager/custodian |
| last_rotated_at_utc | timestamptz | Rotation |
| approval_ref | varchar | Maker-checker |
| sec_audit_ref | varchar | Audit |

### 2.17 `wdr1.travel_rule_payload_check`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| travel_payload_check_id | varchar | Unique |
| payout_execution_id | varchar | Payout |
| aml_travel_rule_ref | varchar | AML-cleared payload |
| sent_payload_hash | varchar | Sent payload |
| consistency_status | varchar | pass/fail/not_required |
| counterparty_vasp_status | varchar | reachable/unreachable/sunrise_exception/not_required |
| sec_audit_ref | varchar | Audit |

### 2.18 `wdr1.payout_sla_case`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| sla_case_id | varchar | Unique |
| payout_execution_id | varchar | Payout |
| led_reserve_ref | varchar | Reserve |
| sla_type | varchar | timeout/finality/stuck_reserve |
| due_at_utc | timestamptz | Due |
| status | varchar | open/escalated/resolved |
| sec_audit_ref | varchar | Audit |


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
13. `payout_batch(batch_idempotency_key, batch_status)`.
14. `payout_batch_item(batch_id, item_idempotency_key)`.
15. `value_conservation_record(payout_execution_id, conservation_status)`.
16. `reserve_send_lock(led_reserve_ref, lock_status)`.
17. `provider_signing_key_ref(provider_id, key_status)`.
18. `travel_rule_payload_check(payout_execution_id, consistency_status)`.
19. `payout_sla_case(payout_execution_id, status)`.

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
11. Send requires atomic revalidate-and-transmit.
12. One reserve can have at most one sent lock.
13. Logical payout key must be unique for non-terminal duplicate requests.
14. Provider payload destination hash must match WLT canonical destination hash.
15. Batch file requires manifest and checksum.
16. Value conservation must pass before LED finality notification.
17. Provider signing key must be active.
18. Travel Rule sent payload must match AML-cleared payload.
19. Stuck payout/reserve must create SLA case.
