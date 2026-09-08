# KYC-01 KYC / KYB Verification
## 05 Database Design

## 1. Schema

Recommended schema:

```txt
kyc1
```

Runtime DB role:

```txt
role_kyc1_runtime
```

Rules:

1. KYC-01 runtime role owns/accesses KYC-01 schema only.
2. CDD outcome is append-versioned.
3. Manual outcome change requires IAM-02 approval.
4. Raw sensitive documents should live in approved document/evidence store; KYC-01 stores references/hashes.
5. Direct DB edit of outcome is prohibited.

---

## 2. Tables

### 2.1 `kyc1.kyc_case`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| case_id | varchar | Unique |
| application_id | varchar | CLT application |
| client_id | varchar | Optional CLT client |
| party_id | varchar | Optional authorised party |
| case_type | varchar | individual/entity/authorised_party/ubo/controller/trust_nominee |
| client_class | varchar | Client class |
| jurisdiction | varchar | Jurisdiction |
| status | varchar | open/pending_documents/verification/edd/remediation/manual_review/completed/closed |
| current_outcome_status | varchar | pass/fail/pending/stale/remediation_required |
| current_outcome_id | varchar | Current outcome |
| next_review_utc | timestamptz | Review |
| created_from_handoff_id | varchar | CLT handoff |
| sec_audit_ref | varchar | Audit |
| created_at_utc | timestamptz | Created |
| updated_at_utc | timestamptz | Updated |

### 2.2 `kyc1.document_checklist_item`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| checklist_item_id | varchar | Unique |
| case_id | varchar | Case |
| document_type | varchar | Type |
| required | boolean | Required |
| status | varchar | missing/received/verified/rejected/expired |
| evidence_ref | varchar | Evidence reference |
| evidence_hash | varchar | Hash |
| expiry_date | date | Expiry |
| verification_result_ref | varchar | Result |
| sec_audit_ref | varchar | Audit |

### 2.3 `kyc1.verification_result`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| verification_result_id | varchar | Unique |
| case_id | varchar | Case |
| source_type | varchar | vendor/manual/registry |
| source_id | varchar | Vendor/user/source |
| result_type | varchar | identity/entity/document/authority/ubo |
| result_status | varchar | pass/fail/inconclusive |
| payload_hash | varchar | Integrity |
| source_authenticated | boolean | Source auth |
| assurance_level | varchar | Proofing assurance level |
| proofing_methods | jsonb | document/liveness/address/biometric/etc |
| confidence_threshold | numeric | Required threshold |
| validity_until_utc | timestamptz | Result validity |
| application_crosscheck_status | varchar | matched/mismatch/review_required |
| confidence_score | numeric | Optional |
| received_at_utc | timestamptz | Received |
| sec_audit_ref | varchar | Audit |

### 2.4 `kyc1.ownership_node`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| node_id | varchar | Unique |
| case_id | varchar | Entity case |
| node_type | varchar | individual/entity/trust/nominee/other |
| name_hash | varchar | Privacy-preserving name hash |
| ownership_percentage | numeric | Direct ownership |
| indirect_ownership_percentage | numeric | Aggregated indirect ownership |
| control_indicator | boolean | Control |
| trust_nominee_role | varchar | settlor/trustee/beneficiary/protector/nominee/controller |
| parent_node_id | varchar | Ownership parent |
| natural_person_resolved | boolean | Ultimate natural person resolved |
| trace_status | varchar | traced/untraceable/edd_required/failed |
| requires_verification | boolean | Requires case |
| linked_party_case_id | varchar | Party case |
| status | varchar | pending/verified/rejected |

### 2.5 `kyc1.cdd_outcome`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| outcome_id | varchar | Unique |
| case_id | varchar | Case |
| outcome_status | varchar | pass/fail/pending/stale/remediation_required |
| outcome_reason | varchar | Reason |
| verification_scope | jsonb | Scope |
| evidence_refs | jsonb | Evidence |
| valid_until_utc | timestamptz | Validity |
| outcome_version | int | Version |
| approval_id | varchar | IAM-02 approval |
| published_to_clt | boolean | Published |
| published_at_utc | timestamptz | Time |
| payload_hash | varchar | Payload hash |
| sec_audit_ref | varchar | Audit |
| created_at_utc | timestamptz | Created |

### 2.6 `kyc1.manual_review`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| review_id | varchar | Unique |
| case_id | varchar | Case |
| review_type | varchar | manual_pass/manual_fail/edd/ubo_exception/remediation_clearance |
| requested_by | varchar | User |
| decision | varchar | approve/reject/remediate |
| approval_id | varchar | IAM-02 approval |
| reason | text | Safe reason |
| sec_audit_ref | varchar | Audit |

### 2.7 `kyc1.vendor_result_inbox`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| inbox_id | varchar | Unique |
| vendor_id | varchar | Vendor |
| case_id | varchar | Case |
| payload_hash | varchar | Hash |
| signature_valid | boolean | Signature/source valid |
| processing_status | varchar | received/processed/rejected/deadlettered |
| received_at_utc | timestamptz | Received |
| sec_audit_ref | varchar | Audit |

### 2.8 `kyc1.periodic_review_schedule`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| schedule_id | varchar | Unique |
| case_id | varchar | Case |
| client_id | varchar | Client |
| review_type | varchar | periodic/triggered/document_expiry |
| due_at_utc | timestamptz | Due |
| status | varchar | scheduled/due/overdue/completed/cancelled |
| sec_audit_ref | varchar | Audit |

### 2.9 `kyc1.outcome_publication`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| publication_id | varchar | Unique |
| outcome_id | varchar | Outcome |
| target_module | varchar | CLT-01 |
| delivery_status | varchar | pending/sent/received/failed/deadlettered |
| payload_hash | varchar | Hash |
| retry_count | int | Retries |
| sent_at_utc | timestamptz | Sent |
| sec_audit_ref | varchar | Audit |

### 2.10 `kyc1.evidence_access_log`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| access_id | varchar | Unique |
| case_id | varchar | Case |
| user_id | varchar | User |
| action | varchar | read/export/download |
| evidence_scope_hash | varchar | Scope |
| approval_id | varchar | Approval |
| sec_audit_ref | varchar | Audit |
| occurred_at_utc | timestamptz | Time |

---


### 2.11 `kyc1.vendor_reliance`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| vendor_id | varchar | Vendor |
| verification_type | varchar | identity/entity/document/address/liveness |
| reliance_status | varchar | approved/rejected/suspended/pending |
| regulated_supervised_status | varchar | verified/not_verified/not_applicable |
| records_obtainable | boolean | Underlying CDD records obtainable |
| contract_ref | varchar | Contract/SLA/audit rights ref |
| confidence_threshold | numeric | Acceptance threshold |
| result_validity_days | int | Validity |
| manual_fallback_allowed | boolean | Degraded fallback |
| approved_ref | varchar | IAM-02/Compliance approval |
| sec_audit_ref | varchar | Audit |

### 2.12 `kyc1.proofing_policy`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| policy_id | varchar | Unique |
| client_class | varchar | Client class |
| risk_class | varchar | Risk |
| channel | varchar | face_to_face/non_face_to_face |
| required_assurance_level | varchar | Assurance level |
| required_methods | jsonb | doc_auth/liveness/address/biometric |
| sow_sof_required | boolean | SoW/SoF |
| multi_source_required | boolean | Corroboration |
| status | varchar | active/inactive |
| approved_ref | varchar | Approval |

### 2.13 `kyc1.evidence_store_contract`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| contract_id | varchar | Unique |
| evidence_store_id | varchar | Store |
| encryption_at_rest | boolean | Required |
| iam2_bound_access | boolean | Required |
| hash_reverify_on_read | boolean | Required |
| retention_policy_ref | varchar | CLT-aligned retention |
| destruction_policy_ref | varchar | Destruction |
| legal_hold_supported | boolean | Legal hold |
| status | varchar | active/inactive |

### 2.14 `kyc1.identity_crosscheck`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| crosscheck_id | varchar | Unique |
| case_id | varchar | Case |
| clt_application_ref | varchar | CLT app |
| verified_identity_hash | varchar | KYC hash |
| clt_identity_hash | varchar | CLT hash |
| hash_basis_version | varchar | Canonical basis version |
| match_status | varchar | matched/mismatch/review_required |
| action_taken | varchar | pass/remediation/edd/fail |
| sec_audit_ref | varchar | Audit |

### 2.15 `kyc1.edd_measure`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| measure_id | varchar | Unique |
| case_id | varchar | Case |
| measure_type | varchar | enhanced_ownership/sow/sof/senior_approval/multisource/enhanced_review |
| status | varchar | pending/completed/rejected |
| evidence_ref | varchar | Evidence |
| approval_id | varchar | Approval |
| sec_audit_ref | varchar | Audit |


## 3. Indexes

1. `kyc_case(case_id, status)`.
2. `kyc_case(application_id, case_type)`.
3. `kyc_case(client_id, current_outcome_status)`.
4. `document_checklist_item(case_id, status)`.
5. `verification_result(case_id, result_type, result_status)`.
6. `ownership_node(case_id, requires_verification, status)`.
7. `cdd_outcome(case_id, outcome_status, outcome_version)`.
8. `manual_review(case_id, review_type)`.
9. `vendor_result_inbox(vendor_id, processing_status)`.
10. `periodic_review_schedule(due_at_utc, status)`.
11. `outcome_publication(outcome_id, delivery_status)`.
12. `evidence_access_log(case_id, occurred_at_utc)`.
13. `vendor_reliance(vendor_id, verification_type, reliance_status)`.
14. `proofing_policy(client_class, risk_class, channel, status)`.
15. `evidence_store_contract(evidence_store_id, status)`.
16. `identity_crosscheck(case_id, match_status)`.
17. `edd_measure(case_id, measure_type, status)`.

---

## 4. Data Rules

1. CDD outcome pass requires all required checks complete.
2. Handoff received is not outcome pass.
3. Missing required document blocks pass.
4. Missing UBO/controller verification blocks pass.
5. EDD required but not approved blocks pass.
6. Manual override requires IAM-02 approval.
7. Vendor result requires authenticated source and payload hash.
8. Stale outcome must publish stale to CLT-01.
9. Sensitive read/export requires SEC-01 audit.
10. Direct DB edit of outcome is prohibited.
11. Pass requires UBO/control look-through to ultimate natural persons where applicable.
12. Untraceable ownership/control routes to EDD or fail, never pass.
13. Vendor result requires approved reliance status, confidence threshold, validity window and records-obtainability where relied upon.
14. Inconclusive vendor result is not pass.
15. Proofing method must satisfy assurance policy.
16. Non-face-to-face proofing requires liveness/biometric binding where policy requires.
17. KYC pass is identity/entity only and not AML/sanctions/PEP clearance.
18. Evidence hash must be reverified on read/export/outcome use.
19. Evidence-store contract must be active before evidence can be trusted.
20. Verified identity hash basis must align with CLT-01.
