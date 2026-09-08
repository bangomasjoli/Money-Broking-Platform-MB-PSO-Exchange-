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
| reference_uniqueness_mode | varchar | unique_per_intent/reusable_with_memo/shared_virtual_account |
| instruction_status | varchar | active/expired/cancelled |
| expires_at_utc | timestamptz | Expiry |
| address_reuse_policy_ref | varchar | Reuse policy |
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
| provider_identity_ref | varchar | Provider signing/mTLS/HMAC identity |
| independent_truth_status | varchar | pending/pass/fail/not_required |
| file_sequence_no | varchar | File/feed sequence |
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
| own_source_status | varchar | own_verified/third_party_approved/third_party_review/unverified/unavailable |
| kyc_verified_source_ref | varchar | KYC own-source ref |
| travel_rule_ref | varchar | Inbound Travel Rule data |

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
| intent_status_at_match | varchar | active/expired/cancelled |
| amount_disposition_status | varchar | exact/partial/over/under/dust/unexpected/review |
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
| credit_bundle_ref | varchar | Coherent bundle ref |
| finality_model_ref | varchar | Finality evidence |
| sof_sow_evidence_ref | varchar | SoF/SoW evidence |
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
| finality_status | varchar | pending/sufficient/final/economic_final/recalled/reorged/return_window_open |
| finality_model | varchar | crypto_reorg_depth/fiat_return_window/custodian_finality |
| corroboration_status | varchar | pass/fail/not_required |
| return_window_until_utc | timestamptz | Fiat return/recall window |
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


### 2.13 `dep1.credit_screening_bundle`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| credit_bundle_id | varchar | Unique |
| deposit_id | varchar | Deposit |
| correlation_id | varchar | E2E |
| client_id | varchar | Client |
| amount | numeric | Amount |
| asset_or_currency | varchar | Asset |
| wlt_decision_ref | varchar | WLT |
| aml_decision_ref | varchar | AML |
| confirmation_id | varchar | Finality |
| point_in_time_snapshot_id | varchar | E2E snapshot |
| bundle_status | varchar | valid/invalid/stale/revoked/mismatch |
| checked_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.14 `dep1.revocation_signal`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| revocation_signal_id | varchar | Unique |
| source_module | varchar | AML/WLT |
| affected_deposit_id | varchar | Deposit |
| affected_source_hash | varchar | Source |
| decision_ref | varchar | Decision |
| revocation_type | varchar | new_hit/list_update/manual_revocation/source_risk |
| action_taken | varchar | quarantined/blocked_led/notified_led |
| sec_audit_ref | varchar | Audit |

### 2.15 `dep1.source_of_funds_review`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| sof_review_id | varchar | Unique |
| deposit_id | varchar | Deposit |
| source_metadata_id | varchar | Source |
| own_source_status | varchar | own_verified/third_party/unverified |
| sof_sow_required | boolean | Required |
| evidence_ref | varchar | Evidence |
| review_status | varchar | pending/approved/rejected/escalated |
| approval_ref | varchar | Maker-checker |
| sec_audit_ref | varchar | Audit |

### 2.16 `dep1.provider_identity`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| provider_identity_id | varchar | Unique |
| source_provider | varchar | Provider |
| auth_method | varchar | mtls/hmac/signature/file_pgp/api_key_plus_ip |
| key_id | varchar | Key |
| key_status | varchar | active/rotating/expired/revoked |
| allowed_source_ref | varchar | Account/feed/channel |
| last_rotated_at_utc | timestamptz | Rotation |
| sec_audit_ref | varchar | Audit |

### 2.17 `dep1.file_feed_control`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| feed_control_id | varchar | Unique |
| source_provider | varchar | Provider |
| feed_date | date | Date |
| sequence_no | varchar | Sequence |
| completeness_status | varchar | complete/missing/out_of_order/duplicate |
| expected_next_sequence | varchar | Expected |
| sec_audit_ref | varchar | Audit |

### 2.18 `dep1.amount_disposition`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| amount_disposition_id | varchar | Unique |
| deposit_id | varchar | Deposit |
| expected_amount | numeric | Expected |
| actual_amount | numeric | Actual |
| disposition_type | varchar | exact/partial/over/under/dust/unexpected/split |
| disposition_status | varchar | allowed/review/quarantine/rejected |
| policy_ref | varchar | Policy |
| sec_audit_ref | varchar | Audit |

### 2.19 `dep1.return_case`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| return_case_id | varchar | Unique |
| deposit_id | varchar | Deposit |
| return_reason | varchar | unmatched/rejected/third_party/sanctions/legal |
| return_allowed_status | varchar | permitted/prohibited/review |
| wlt_decision_ref | varchar | Payout destination control |
| aml_decision_ref | varchar | AML gate |
| led_payout_ref | varchar | LED payout/refund |
| status | varchar | open/in_review/sent/prohibited/closed |
| sec_audit_ref | varchar | Audit |


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
14. `credit_screening_bundle(deposit_id, bundle_status)`.
15. `revocation_signal(affected_deposit_id, revocation_type)`.
16. `source_of_funds_review(deposit_id, review_status)`.
17. `provider_identity(source_provider, key_status)`.
18. `file_feed_control(source_provider, feed_date, sequence_no)`.
19. `amount_disposition(deposit_id, disposition_status)`.
20. `return_case(deposit_id, status)`.

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
11. Credit request requires valid credit_screening_bundle.
12. AML/WLT revocation blocks in-flight deposit.
13. Third-party/unverified source requires SoF review.
14. Economic finality must be supported by finality model.
15. Provider identity must be active and verified.
16. Expired/cancelled intent match cannot auto-credit.
17. Unexpected amount disposition cannot auto-credit.
18. Return path must be controlled through WLT/AML/LED payout controls.
19. Reversal must bind original correlation/saga/deposit/receipt.
