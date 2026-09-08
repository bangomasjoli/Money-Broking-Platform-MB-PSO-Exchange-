# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 05 Database Design

## 1. Schema

Recommended schema:

```txt
aml1
```

Runtime DB role:

```txt
role_aml1_runtime
```

Rules:

1. AML-01 runtime role owns/accesses AML-01 schema only.
2. Screening outcome is append-versioned.
3. Manual match decision requires IAM-02 approval where policy says.
4. STR/suspicion data is highly restricted.
5. Direct DB edit of screening outcome is prohibited.

---

## 2. Tables

### 2.1 `aml1.screening_case`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| case_id | varchar | Unique |
| application_id | varchar | CLT application |
| client_id | varchar | CLT client |
| party_id | varchar | Party/UBO/signatory |
| case_type | varchar | client/party/ubo/travel_rule/counterparty |
| screening_scope | jsonb | sanctions/pep/adverse_media/watchlist |
| status | varchar | open/screening/review/escalated/completed/stale/closed |
| current_outcome_status | varchar | clear/hit/pending/stale/review_required |
| current_outcome_id | varchar | Current outcome |
| created_from_handoff_id | varchar | Handoff |
| sec_audit_ref | varchar | Audit |
| created_at_utc | timestamptz | Created |
| updated_at_utc | timestamptz | Updated |

### 2.2 `aml1.screening_result`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| screening_result_id | varchar | Unique |
| case_id | varchar | Case |
| screening_type | varchar | sanctions/pep/adverse_media/watchlist/country/travel_rule |
| provider_id | varchar | Provider |
| list_name | varchar | List |
| list_version | varchar | Version |
| list_freshness_ref | varchar | Freshness proof |
| screened_at_utc | timestamptz | Time |
| search_input_hash | varchar | Input hash |
| input_quality_status | varchar | complete/incomplete/thin/review_required |
| result_status | varchar | no_match/possible_match/true_hit/inconclusive |
| payload_hash | varchar | Integrity |
| source_authenticated | boolean | Source auth |
| sec_audit_ref | varchar | Audit |

### 2.3 `aml1.match_candidate`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| candidate_id | varchar | Unique |
| screening_result_id | varchar | Result |
| list_entry_ref | varchar | Candidate |
| match_score | numeric | Score |
| threshold | numeric | Threshold |
| threshold_floor | numeric | Non-suppressible floor |
| matched_fields | jsonb | Field matches |
| candidate_status | varchar | possible/false_positive/true_hit/inconclusive |
| decision_id | varchar | Review decision |

### 2.4 `aml1.match_decision`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| decision_id | varchar | Unique |
| candidate_id | varchar | Candidate |
| decision | varchar | false_positive/true_hit/inconclusive/needs_more_info |
| decision_reason | text | Safe reason |
| evidence_ref | varchar | Evidence |
| decided_by | varchar | User |
| approval_id | varchar | IAM-02 approval |
| decided_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.5 `aml1.aml_outcome`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| outcome_id | varchar | Unique |
| case_id | varchar | Case |
| outcome_status | varchar | clear/hit/pending/stale/review_required |
| outcome_reason | varchar | Reason |
| screening_scope | jsonb | Scope |
| list_versions | jsonb | Versions |
| valid_until_utc | timestamptz | Validity |
| outcome_version | int | Version |
| outcome_hash | varchar | Hash-sealed payload |
| revoked_at_utc | timestamptz | Revoked if new hit/list update |
| revocation_reason | varchar | Reason |
| published_to_clt | boolean | Published |
| published_at_utc | timestamptz | Time |
| payload_hash | varchar | Hash |
| sec_audit_ref | varchar | Audit |
| created_at_utc | timestamptz | Created |

### 2.6 `aml1.outcome_publication`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| publication_id | varchar | Unique |
| outcome_id | varchar | Outcome |
| target_module | varchar | CLT-01/KYC-01 |
| delivery_status | varchar | pending/sent/received/failed/deadlettered |
| payload_hash | varchar | Hash |
| retry_count | int | Retries |
| sent_at_utc | timestamptz | Sent |
| sec_audit_ref | varchar | Audit |

### 2.7 `aml1.rescreening_run`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| run_id | varchar | Unique |
| trigger_type | varchar | list_update/periodic/profile_change/party_change/manual |
| provider_id | varchar | Provider |
| list_version | varchar | New version |
| affected_count | int | Count |
| status | varchar | running/completed/failed |
| started_at_utc | timestamptz | Start |
| completed_at_utc | timestamptz | Done |
| sec_audit_ref | varchar | Audit |

### 2.8 `aml1.travel_rule_screening`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| travel_rule_screening_id | varchar | Unique |
| transfer_ref | varchar | Future transfer/ref |
| originator_hash | varchar | Originator data hash |
| beneficiary_hash | varchar | Beneficiary data hash |
| vasp_counterparty_hash | varchar | VASP/counterparty |
| data_completeness_status | varchar | complete/missing/incomplete |
| screening_outcome | varchar | clear/hit/review_required/missing_data |
| sec_audit_ref | varchar | Audit |
| created_at_utc | timestamptz | Created |

### 2.9 `aml1.str_case`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| str_case_id | varchar | Unique |
| client_id | varchar | Client |
| party_id | varchar | Party |
| source_case_id | varchar | Screening/monitoring case |
| suspicion_type | varchar | sanctions/pep/adverse_media/transaction/other |
| status | varchar | draft/review/approved_to_file/not_file/closed |
| suspicion_formed_at_utc | timestamptz | Suspicion time |
| mlro_review_due_utc | timestamptz | Internal due |
| filing_due_utc | timestamptz | Statutory filing due |
| pending_transaction_policy | varchar | proceed/hold/block/escalate |
| tipping_off_restriction | boolean | Required |
| safe_reason_code | varchar | Operational reason |
| mlro_decision_by | varchar | MLRO/Compliance |
| decision_at_utc | timestamptz | Decision |
| sec_audit_ref | varchar | Audit |

### 2.10 `aml1.sensitive_access_log`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| access_id | varchar | Unique |
| case_id | varchar | Case |
| str_case_id | varchar | Optional STR |
| user_id | varchar | User |
| action | varchar | read/export/download |
| scope_hash | varchar | Scope |
| approval_id | varchar | Approval |
| sec_audit_ref | varchar | Audit |
| occurred_at_utc | timestamptz | Time |

---


### 2.11 `aml1.pre_transaction_screening`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| pre_txn_screening_id | varchar | Unique |
| action_ref | varchar | Payment/settlement/transfer ref |
| client_id | varchar | Client |
| counterparty_ref | varchar | Counterparty |
| screening_scope | jsonb | Parties screened |
| decision_status | varchar | clear/hold/block/review_required |
| decision_expires_at_utc | timestamptz | Short-lived expiry |
| list_versions | jsonb | Lists used |
| input_quality_status | varchar | Complete/thin |
| outcome_hash | varchar | Decision hash |
| sec_audit_ref | varchar | Audit |

### 2.12 `aml1.list_update_event`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| list_update_id | varchar | Unique |
| provider_id | varchar | Provider |
| list_name | varchar | List |
| old_version | varchar | Old |
| new_version | varchar | New |
| freshness_ref | varchar | Freshness proof |
| received_at_utc | timestamptz | Received |
| rescreen_sla_due_utc | timestamptz | SLA |
| interim_block_status | varchar | active/released/escalated |
| sec_audit_ref | varchar | Audit |

### 2.13 `aml1.ownership_sanctions_result`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| ownership_result_id | varchar | Unique |
| client_id | varchar | Client |
| kyc_graph_version | varchar | KYC ownership graph |
| sanctioned_ownership_percentage | numeric | Aggregated |
| control_hit | boolean | Control rule |
| rule_applied | varchar | 50pct/control |
| result_status | varchar | clear/hit/review_required |
| sec_audit_ref | varchar | Audit |

### 2.14 `aml1.screening_input_quality`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| input_quality_id | varchar | Unique |
| case_id | varchar | Case |
| party_type | varchar | individual/entity/vasp |
| required_fields | jsonb | Required |
| provided_fields | jsonb | Provided |
| quality_status | varchar | complete/incomplete/thin |
| action_taken | varchar | screen/review_required/pending |
| sec_audit_ref | varchar | Audit |

### 2.15 `aml1.false_positive_attestation`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| attestation_id | varchar | Unique |
| decision_id | varchar | Match decision |
| fp_type | varchar | sanctions/pep/adverse_media |
| approver_one | varchar | Compliance |
| approver_two | varchar | MLRO/second approver |
| reattest_due_utc | timestamptz | Due |
| status | varchar | active/expired/revoked |
| sec_audit_ref | varchar | Audit |

### 2.16 `aml1.jurisdiction_screening`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| jurisdiction_screening_id | varchar | Unique |
| client_id | varchar | Client |
| country_code | varchar | Country |
| source | varchar | FATF/internal/etc |
| list_status | varchar | normal/grey/black/high_risk |
| outcome | varchar | clear/edd/restrict/reject |
| sec_audit_ref | varchar | Audit |

### 2.17 `aml1.delisting_review`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| delisting_review_id | varchar | Unique |
| prior_match_id | varchar | Prior match |
| case_id | varchar | Case |
| delisting_ref | varchar | Removal evidence |
| review_status | varchar | pending/approved/rejected |
| approval_id | varchar | Compliance/MLRO |
| unblock_published_at_utc | timestamptz | Published |
| sec_audit_ref | varchar | Audit |

### 2.18 `aml1.travel_rule_policy`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| policy_id | varchar | Unique |
| transaction_type | varchar | Type |
| de_minimis_threshold | numeric | Threshold |
| required_fields | jsonb | Required data |
| sunrise_handling | varchar | review/hold/reject/edd |
| status | varchar | active/inactive |
| approved_ref | varchar | Approval |


## 3. Indexes

1. `screening_case(case_id, status)`.
2. `screening_case(client_id, current_outcome_status)`.
3. `screening_result(case_id, screening_type, result_status)`.
4. `screening_result(provider_id, list_version)`.
5. `match_candidate(screening_result_id, candidate_status)`.
6. `match_decision(candidate_id, decision)`.
7. `aml_outcome(case_id, outcome_status, outcome_version)`.
8. `outcome_publication(outcome_id, delivery_status)`.
9. `rescreening_run(trigger_type, status)`.
10. `travel_rule_screening(transfer_ref, screening_outcome)`.
11. `str_case(client_id, status)`.
12. `sensitive_access_log(case_id, occurred_at_utc)`.
13. `pre_transaction_screening(action_ref, decision_status, decision_expires_at_utc)`.
14. `list_update_event(provider_id, list_name, new_version)`.
15. `ownership_sanctions_result(client_id, result_status)`.
16. `screening_input_quality(case_id, quality_status)`.
17. `false_positive_attestation(decision_id, status, reattest_due_utc)`.
18. `jurisdiction_screening(client_id, country_code, outcome)`.
19. `delisting_review(case_id, review_status)`.
20. `travel_rule_policy(transaction_type, status)`.

---

## 4. Data Rules

1. AML clear requires all required screening scopes complete.
2. Handoff received is not screening clear.
3. KYC pass is not AML clear.
4. Sanctions true hit hard-blocks.
5. False-positive decision requires reason/evidence.
6. True hit requires Compliance/MLRO escalation.
7. List/provider version is mandatory.
8. Vendor result requires authenticated source and payload hash.
9. List update triggers rescreening.
10. Stale outcome must publish stale/review_required to CLT-01.
11. STR/suspicion access is restricted.
12. Tipping-off protection suppresses unsafe client messages.
13. Sensitive read/export requires SEC-01 audit.
14. Direct DB edit of outcome is prohibited.
15. Pre-transaction sanctions gate is required before fund/asset movement where applicable.
16. List update requires SLA-driven rescreening and interim block.
17. Sanctions list coverage baseline must be complete.
18. Ownership-based sanctions / 50% rule uses KYC-01 UBO graph.
19. Incomplete screening input cannot be clear.
20. STR clock/deadline fields are mandatory for suspicion case.
21. Sanctions false positive requires dual review and re-attestation.
22. AML outcome must be hash-sealed and revocable.
23. PEP screening covers foreign/domestic/RCA and declassification.
24. De-listing unblock requires review/approval.
25. Travel Rule threshold and sunrise policy are required.
