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
| screened_at_utc | timestamptz | Time |
| search_input_hash | varchar | Input hash |
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
