# WLT-01 Wallet Screening / Payout Destination Whitelist
## 05 Database Design

## 1. Schema

Recommended schema:

```txt
wlt1
```

Runtime DB role:

```txt
role_wlt1_runtime
```

Rules:

1. WLT-01 runtime role owns/accesses WLT-01 schema only.
2. Destination status is append/versioned.
3. Approval requires IAM-02 where policy says.
4. Direct DB edit of whitelist status is prohibited.
5. No private keys or transaction signing material stored.

---

## 2. Tables

### 2.1 `wlt1.destination`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| destination_id | varchar | Unique |
| client_id | varchar | Client |
| destination_type | varchar | wallet/fiat_payout |
| status | varchar | draft/pending_screening/pending_review/approved_pending_cooling/active/revoked/restricted/expired |
| whitelist_version | int | Version |
| destination_status_version | int | Status version |
| revocation_epoch | int | Revocation epoch |
| limits_version | int | Limits version |
| client_status_ref | varchar | CLT status ref |
| mandate_ref | varchar | CLT/IAM mandate |
| created_by | varchar | User |
| approval_id | varchar | IAM-02 approval |
| sec_audit_ref | varchar | Audit |
| created_at_utc | timestamptz | Created |
| updated_at_utc | timestamptz | Updated |

### 2.2 `wlt1.wallet_destination`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| destination_id | varchar | FK |
| chain | varchar | Chain |
| network | varchar | Network |
| address | varchar | Canonical address |
| address_hash | varchar | Hash |
| asset_scope | varchar | Asset/all |
| wallet_type | varchar | hosted/unhosted/unknown |
| ownership_evidence_ref | varchar | Evidence |
| proof_of_control_status | varchar | required/pending/verified/failed/exception_approved |
| travel_rule_counterparty_ref | varchar | Optional |
| name_service_alias_hash | varchar | If provided; not authoritative |
| canonicalisation_version | varchar | Chain-specific rules version |
| full_address_reconfirmed | boolean | Client reconfirmation |
| scam_lookalike_status | varchar | clear/review_required/hit |
| sec_audit_ref | varchar | Audit |

### 2.3 `wlt1.wallet_screening_result`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| screening_result_id | varchar | Unique |
| destination_id | varchar | Destination |
| provider_id | varchar | Provider |
| chain | varchar | Chain |
| network | varchar | Network |
| address_hash | varchar | Address |
| risk_score | numeric | Score |
| risk_status | varchar | clear/review_required/high_risk/hit/stale |
| risk_categories | jsonb | Categories |
| direct_exposure | jsonb | Direct exposure |
| indirect_exposure | jsonb | Indirect exposure |
| sanctions_exposure | boolean | Sanctions exposure |
| cluster_ref | varchar | Provider cluster |
| payload_hash | varchar | Integrity |
| source_authenticated | boolean | Source auth |
| valid_until_utc | timestamptz | Validity |
| sec_audit_ref | varchar | Audit |

### 2.4 `wlt1.payout_destination`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| destination_id | varchar | FK |
| rail | varchar | Bank/fiat rail |
| currency | varchar | Currency |
| country | varchar | Country |
| bank_name_hash | varchar | Bank name hash |
| account_number_token | varchar | Tokenised/masked account |
| routing_hash | varchar | Routing/IBAN hash |
| beneficiary_name_hash | varchar | Beneficiary |
| beneficiary_relationship | varchar | self/related_party/third_party |
| beneficiary_verification_status | varchar | pending/verified/mismatch/review_required |
| evidence_ref | varchar | Evidence |
| sec_audit_ref | varchar | Audit |

### 2.5 `wlt1.destination_approval`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| approval_record_id | varchar | Unique |
| destination_id | varchar | Destination |
| approval_type | varchar | whitelist/high_risk/third_party/cooling_override/revocation_reversal |
| requested_by | varchar | User |
| approval_id | varchar | IAM-02 approval |
| client_dual_auth_ref | varchar | Client approval |
| decision | varchar | approved/rejected |
| reason | text | Safe reason |
| sec_audit_ref | varchar | Audit |

### 2.6 `wlt1.cooling_off`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| cooling_id | varchar | Unique |
| destination_id | varchar | Destination |
| starts_at_utc | timestamptz | Start |
| ends_at_utc | timestamptz | End |
| status | varchar | active/completed/overridden/cancelled |
| override_approval_id | varchar | Approval |
| sec_audit_ref | varchar | Audit |

### 2.7 `wlt1.destination_decision`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| decision_id | varchar | Unique |
| destination_id | varchar | Destination |
| client_id | varchar | Client |
| action_type | varchar | withdraw/payout/settle/deposit_attribution/travel_rule |
| chain_or_rail | varchar | Chain/rail |
| asset_or_currency | varchar | Asset/currency |
| decision_status | varchar | allow/deny/hold |
| denial_reason | varchar | Reason |
| aml_decision_ref | varchar | AML-01 ref |
| aml_decision_hash | varchar | AML hash |
| aml_revocation_epoch | int | AML revocation epoch |
| destination_revocation_epoch | int | Destination revocation epoch |
| amount | numeric | Requested amount |
| amount_currency_or_asset | varchar | Currency/asset |
| limits_version | int | Limits version |
| execution_ref | varchar | Downstream execution ref |
| consumed_at_utc | timestamptz | Consume time |
| consumed_status | varchar | unconsumed/consumed/rejected |
| risk_result_version | varchar | Wallet/bank risk result |
| whitelist_version | int | Whitelist version |
| mandate_version | varchar | Mandate |
| expires_at_utc | timestamptz | Expiry |
| sec_audit_ref | varchar | Audit |

### 2.8 `wlt1.revocation_event`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| revocation_id | varchar | Unique |
| destination_id | varchar | Destination |
| trigger_source | varchar | AML/KYC/CLT/vendor/manual/mandate |
| trigger_ref | varchar | Ref |
| reason_code | varchar | Reason |
| revoked_at_utc | timestamptz | Time |
| downstream_notified | boolean | Propagated |
| sec_audit_ref | varchar | Audit |

### 2.9 `wlt1.vendor_result_inbox`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| inbox_id | varchar | Unique |
| provider_id | varchar | Vendor |
| destination_id | varchar | Destination |
| result_type | varchar | wallet_screening/bank_verification |
| payload_hash | varchar | Hash |
| signature_valid | boolean | Signature/source valid |
| processing_status | varchar | received/processed/rejected/deadlettered |
| received_at_utc | timestamptz | Received |
| sec_audit_ref | varchar | Audit |

### 2.10 `wlt1.rescreening_run`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| run_id | varchar | Unique |
| trigger_type | varchar | periodic/aml_update/vendor_update/status_change/mandate_change/manual |
| affected_count | int | Count |
| status | varchar | running/completed/failed |
| started_at_utc | timestamptz | Start |
| completed_at_utc | timestamptz | Done |
| sec_audit_ref | varchar | Audit |

### 2.11 `wlt1.sensitive_access_log`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| access_id | varchar | Unique |
| destination_id | varchar | Destination |
| user_id | varchar | User |
| action | varchar | read/export/download |
| scope_hash | varchar | Scope |
| approval_id | varchar | Approval |
| sec_audit_ref | varchar | Audit |
| occurred_at_utc | timestamptz | Time |

---


### 2.12 `wlt1.destination_limit_profile`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| limit_profile_id | varchar | Unique |
| client_id | varchar | Client |
| destination_id | varchar | Optional destination |
| asset_or_currency | varchar | Asset/currency |
| rail_or_chain | varchar | Rail/chain |
| per_transaction_limit | numeric | Max per transaction |
| daily_velocity_limit | numeric | Daily cap |
| rolling_velocity_limit | numeric | Rolling cap |
| concentration_limit | numeric | Concentration |
| first_use_limit | numeric | New destination cap |
| stepup_required_above | numeric | Step-up threshold |
| version | int | Version |
| status | varchar | active/inactive |
| approved_ref | varchar | Approval |

### 2.13 `wlt1.limit_evaluation`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| limit_evaluation_id | varchar | Unique |
| decision_id | varchar | Decision |
| destination_id | varchar | Destination |
| client_id | varchar | Client |
| amount | numeric | Amount |
| asset_or_currency | varchar | Currency/asset |
| result_status | varchar | pass/hold/deny/stepup_required |
| breach_type | varchar | per_txn/daily/rolling/concentration/first_use |
| limits_version | int | Limits version |
| sec_audit_ref | varchar | Audit |

### 2.14 `wlt1.inbound_source_screening`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| inbound_source_id | varchar | Unique |
| deposit_ref | varchar | Deposit/source ref |
| client_id | varchar | Expected/matched client |
| source_type | varchar | crypto_wallet/fiat_bank/unknown |
| source_hash | varchar | Source hash |
| chain_or_rail | varchar | Chain/rail |
| screening_status | varchar | clear/review_required/high_risk/hit/unscreened |
| match_status | varchar | matched/unmatched/unknown |
| quarantine_status | varchar | none/quarantined/released/escalated |
| aml_decision_ref | varchar | AML ref |
| sec_audit_ref | varchar | Audit |

### 2.15 `wlt1.proof_of_control`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| proof_id | varchar | Unique |
| destination_id | varchar | Destination |
| proof_method | varchar | signed_message/microdeposit/satoshi_test/exception |
| challenge_ref | varchar | Challenge |
| verification_status | varchar | pending/verified/failed/expired |
| verified_at_utc | timestamptz | Time |
| expires_at_utc | timestamptz | Expiry |
| approval_id | varchar | Exception approval |
| sec_audit_ref | varchar | Audit |

### 2.16 `wlt1.address_integrity_check`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| address_check_id | varchar | Unique |
| destination_id | varchar | Destination |
| chain | varchar | Chain |
| network | varchar | Network |
| raw_address_hash | varchar | Raw address |
| canonical_address_hash | varchar | Canonical |
| canonicalisation_version | varchar | Rules version |
| checksum_valid | boolean | Checksum |
| name_service_resolved | boolean | Name-service used |
| full_address_reconfirmed | boolean | Client reconfirm |
| poisoning_screen_status | varchar | clear/review_required/hit |
| sec_audit_ref | varchar | Audit |

### 2.17 `wlt1.chain_coverage`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| coverage_id | varchar | Unique |
| chain | varchar | Chain |
| network | varchar | Network |
| asset_scope | varchar | Asset/all |
| provider_id | varchar | Analytics provider |
| coverage_status | varchar | supported/unsupported/degraded |
| approved_ref | varchar | Approval |
| updated_at_utc | timestamptz | Updated |

### 2.18 `wlt1.aml_revocation_signal`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| signal_id | varchar | Unique |
| aml_signal_ref | varchar | AML signal |
| client_id | varchar | Client |
| destination_id | varchar | Optional destination |
| signal_type | varchar | outcome_revoked/new_hit/list_update_interim_block/travel_rule_restriction |
| action_taken | varchar | revoked/restricted/held/no_match |
| processed_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |


## 3. Indexes

1. `destination(destination_id, status)`.
2. `destination(client_id, destination_type, status)`.
3. `wallet_destination(address_hash, chain, network)`.
4. `wallet_screening_result(destination_id, risk_status, valid_until_utc)`.
5. `payout_destination(destination_id, beneficiary_verification_status)`.
6. `destination_approval(destination_id, approval_type, decision)`.
7. `cooling_off(destination_id, status, ends_at_utc)`.
8. `destination_decision(destination_id, action_type, expires_at_utc)`.
9. `revocation_event(destination_id, revoked_at_utc)`.
10. `vendor_result_inbox(provider_id, processing_status)`.
11. `rescreening_run(trigger_type, status)`.
12. `sensitive_access_log(destination_id, occurred_at_utc)`.
13. `destination_limit_profile(client_id, destination_id, status)`.
14. `limit_evaluation(decision_id, result_status)`.
15. `inbound_source_screening(deposit_ref, quarantine_status)`.
16. `proof_of_control(destination_id, verification_status)`.
17. `address_integrity_check(destination_id, poisoning_screen_status)`.
18. `chain_coverage(chain, network, coverage_status)`.
19. `aml_revocation_signal(client_id, signal_type, processed_at_utc)`.

---

## 4. Data Rules

1. Active destination requires screening, approval and cooling-off completion.
2. Destination use requires active whitelist and current AML decision.
3. Chain/network/address must match exactly after canonicalisation.
4. Fiat payout destination requires beneficiary verification.
5. Third-party beneficiary requires enhanced approval.
6. High-risk wallet requires Compliance review.
7. Revocation immediately invalidates decision tokens.
8. Expired/stale wallet risk result blocks use.
9. Travel Rule missing data blocks/holds use.
10. Sensitive read/export requires SEC-01 audit.
11. Direct DB edit of whitelist status is prohibited.
12. No private keys or signing material may be stored.
13. Destination decision must be revalidated and consumed at execution time.
14. Revocation epoch mismatch denies execution.
15. Amount/asset/action scope mismatch denies execution.
16. Limit/velocity breach denies or holds according to policy.
17. Inbound source unscreened/high-risk/sanctioned is quarantined.
18. Unhosted wallet requires proof-of-control unless approved exception.
19. Wallet destination must be first-party or approved beneficiary/counterparty.
20. Name-service alias is never authoritative destination.
21. Unsupported chain/asset/provider coverage cannot be clear.
22. AML revocation signal immediately invalidates affected destination decisions.
23. Cooling-off new-risk event cancels activation.
