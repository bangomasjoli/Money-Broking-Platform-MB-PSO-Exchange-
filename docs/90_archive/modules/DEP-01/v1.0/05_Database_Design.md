# DEP-01 Deposit Execution / Inbound Receipt
## 05 Database Design

## 1. Schema

Recommended schema:

```txt
dep1
```

Runtime DB role:

```txt
role_dep1_runtime
```

Rules:

1. DEP-01 runtime role owns/accesses DEP schema only.
2. No ledger balance table.
3. No available balance table.
4. Receipt evidence is append-only.
5. Raw sensitive source data should be hashed/masked where possible.

---

## 2. Tables

### 2.1 `dep1.deposit_intent`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| deposit_intent_id | varchar | Unique |
| correlation_id | varchar | E2E correlation |
| client_id | varchar | Client |
| asset_or_currency | varchar | Asset/currency |
| expected_amount | numeric | Optional |
| rail_or_chain | varchar | Rail/chain |
| deposit_reference | varchar | Reference |
| instruction_status | varchar | active/expired/cancelled |
| expires_at_utc | timestamptz | Expiry |
| sec_audit_ref | varchar | Audit |

### 2.2 `dep1.external_receipt`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| receipt_id | varchar | Unique |
| correlation_id | varchar | E2E correlation |
| source_provider | varchar | Bank/custodian/chain provider |
| source_event_id | varchar | Provider event |
| source_transaction_ref | varchar | Tx/payment ref |
| source_type | varchar | fiat_bank/custodian/chain |
| asset_or_currency | varchar | Asset/currency |
| amount | numeric | Amount |
| receipt_status | varchar | received/authenticated/rejected/recalled/reorged |
| source_timestamp_utc | timestamptz | Source time |
| received_at_utc | timestamptz | Time |
| payload_hash | varchar | Raw payload hash |
| source_authenticated | boolean | Source auth |
| sec_audit_ref | varchar | Audit |

### 2.3 `dep1.source_metadata`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| source_metadata_id | varchar | Unique |
| receipt_id | varchar | Receipt |
| source_wallet_hash | varchar | Crypto source |
| source_account_hash | varchar | Fiat source |
| source_name_hash | varchar | Sender name hash |
| source_bank_id | varchar | Bank |
| source_country | varchar | Country |
| tx_hash | varchar | Chain tx |
| chain | varchar | Chain |
| network | varchar | Network |
| memo_tag_hash | varchar | Memo/tag |
| metadata_quality | varchar | complete/partial/unavailable |

### 2.4 `dep1.deposit_match`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| match_id | varchar | Unique |
| receipt_id | varchar | Receipt |
| deposit_intent_id | varchar | Intent |
| client_id | varchar | Client |
| match_status | varchar | matched/unmatched/ambiguous/rejected |
| match_confidence | numeric | Score |
| match_basis | jsonb | Reference/address/amount/source |
| reviewer_approval_ref | varchar | If manual |
| sec_audit_ref | varchar | Audit |

### 2.5 `dep1.deposit`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| deposit_id | varchar | Unique |
| correlation_id | varchar | E2E |
| client_id | varchar | Client |
| receipt_id | varchar | Receipt |
| deposit_intent_id | varchar | Intent |
| asset_or_currency | varchar | Asset |
| amount | numeric | Amount |
| deposit_status | varchar | received/matched/pending_screening/confirmed/quarantined/led_pending/credit_requested/credited/rejected/recalled/exception |
| wlt_decision_ref | varchar | WLT decision |
| aml_decision_ref | varchar | AML decision |
| led_pending_ref | varchar | LED pending |
| led_journal_ref | varchar | LED credit journal |
| sec_audit_ref | varchar | Audit |

### 2.6 `dep1.confirmation_status`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| confirmation_id | varchar | Unique |
| receipt_id | varchar | Receipt |
| confirmation_type | varchar | fiat_settlement/custodian_finality/chain_confirmations |
| current_confirmations | int | Count |
| required_confirmations | int | Threshold |
| finality_status | varchar | pending/sufficient/final/recalled/reorged |
| updated_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.7 `dep1.screening_handoff`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| handoff_id | varchar | Unique |
| deposit_id | varchar | Deposit |
| handoff_type | varchar | wlt_source/aml_gate |
| destination_module | varchar | WLT/AML |
| request_payload_hash | varchar | Request |
| response_ref | varchar | Decision |
| response_status | varchar | clear/hold/hit/review/stale |
| sent_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.8 `dep1.led_handoff`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| led_handoff_id | varchar | Unique |
| deposit_id | varchar | Deposit |
| handoff_type | varchar | create_pending/update_status/request_credit/clawback |
| led_ref | varchar | LED ref |
| handoff_status | varchar | pending/sent/acknowledged/rejected/deadlettered |
| payload_hash | varchar | Payload |
| sent_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.9 `dep1.quarantine_case`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| case_id | varchar | Unique |
| deposit_id | varchar | Deposit |
| reason_code | varchar | Reason |
| severity | varchar | medium/high/critical |
| status | varchar | open/in_review/resolved/escalated/rejected |
| owner | varchar | Owner |
| approval_ref | varchar | Maker-checker |
| resolution_ref | varchar | Evidence |
| sec_audit_ref | varchar | Audit |

### 2.10 `dep1.reversal_event`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| reversal_id | varchar | Unique |
| original_receipt_id | varchar | Original |
| deposit_id | varchar | Deposit |
| reversal_type | varchar | chain_reorg/fiat_recall/custodian_reversal/bank_correction/chargeback |
| source_event_id | varchar | Provider event |
| payload_hash | varchar | Reversal payload |
| led_clawback_ref | varchar | LED clawback |
| status | varchar | received/notified_led/acknowledged/resolved |
| sec_audit_ref | varchar | Audit |

### 2.11 `dep1.reconciliation_run`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| run_id | varchar | Unique |
| recon_type | varchar | receipt/match/screening/led/reversal/e2e |
| status | varchar | running/completed/failed |
| break_count | int | Count |
| sec_audit_ref | varchar | Audit |

### 2.12 `dep1.reconciliation_break`

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

1. `deposit_intent(correlation_id, client_id, instruction_status)`.
2. `external_receipt(source_provider, source_event_id)`.
3. `external_receipt(source_transaction_ref)`.
4. `external_receipt(correlation_id)`.
5. `deposit_match(receipt_id, match_status)`.
6. `deposit(client_id, deposit_status)`.
7. `deposit(correlation_id)`.
8. `confirmation_status(receipt_id, finality_status)`.
9. `screening_handoff(deposit_id, handoff_type)`.
10. `led_handoff(deposit_id, handoff_type, handoff_status)`.
11. `quarantine_case(deposit_id, status)`.
12. `reversal_event(original_receipt_id, status)`.
13. `reconciliation_break(run_id, severity, status)`.

---

## 4. Data Rules

1. No ledger balance table.
2. External receipt unique by source provider/event/tx ref.
3. Same source event/different payload is conflict.
4. Deposit cannot be credited by DEP.
5. Receipt must be authenticated before matching.
6. Ambiguous/unmatched deposit cannot auto-credit.
7. Confirmation threshold must be met before LED credit evaluation request.
8. WLT/AML clear required before LED credit evaluation where applicable.
9. Reversal event must notify LED.
10. Every deposit must have correlation ID.
