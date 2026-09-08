# CLT-01 Client Onboarding / Client Profile
## 05 Database Design

## 1. Schema

Recommended schema:

```txt
clt1
```

Runtime DB role:

```txt
role_clt1_runtime
```

Rules:

1. CLT-01 runtime role owns/accesses CLT-01 schema only.
2. Profile/status changes are append-versioned.
3. Sensitive client data must be classified.
4. Direct DB edit of client status is prohibited.
5. Downstream modules consume status via API/event, not direct table write.

---

## 2. Tables

### 2.1 `clt1.client_application`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| application_id | varchar | Unique |
| applicant_type | varchar | individual/corporate/institutional |
| client_class | varchar | institutional/hnwi/professional/retail/unknown |
| client_class_status | varchar | claimed/verified/rejected/held |
| country_of_residence | varchar | Country |
| jurisdiction | varchar | Jurisdiction |
| onboarding_channel | varchar | Portal/staff/API |
| status | varchar | draft/submitted/duplicate_review/pending_kyc/pending_aml/under_review/approved/rejected/held/cancelled |
| cfg_decision_ref | varchar | CFG-01 decision |
| created_by | varchar | User |
| assigned_reviewer | varchar | Staff |
| submitted_at_utc | timestamptz | Submitted |
| approved_at_utc | timestamptz | Approved |
| approval_id | varchar | IAM-02 approval |
| sec_audit_ref | varchar | SEC-01 audit |
| version | int | Version |
| created_at_utc | timestamptz | Created |
| updated_at_utc | timestamptz | Updated |

### 2.2 `clt1.client_profile`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| client_id | varchar | Unique |
| application_id | varchar | Source app |
| legal_name | varchar | Name |
| display_name | varchar | Display |
| client_type | varchar | individual/corporate/institutional |
| client_class | varchar | institutional/hnwi/professional |
| status | varchar | pending/active_limited/active/suspended/restricted/closed/rejected |
| country_of_residence | varchar | Country |
| jurisdiction | varchar | Jurisdiction |
| risk_status_ref | varchar | Downstream risk |
| kyc_status_ref | varchar | KYC/KYB |
| aml_status_ref | varchar | AML |
| cfg_decision_ref | varchar | CFG |
| profile_version | int | Version |
| created_at_utc | timestamptz | Created |
| updated_at_utc | timestamptz | Updated |
| sec_audit_ref | varchar | Audit |

### 2.3 `clt1.client_classification_evidence`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| evidence_id | varchar | Unique |
| application_id | varchar | Application |
| client_id | varchar | Optional client |
| claimed_class | varchar | Class |
| evidence_type | varchar | financial/professional/institutional/corporate |
| evidence_ref | varchar | Document/reference |
| status | varchar | provided/verified/rejected/expired |
| verified_by | varchar | User |
| verified_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.4 `clt1.authorised_user`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| authorised_user_id | varchar | Unique |
| client_id | varchar | Client |
| user_id | varchar | IAM user |
| role | varchar | client_admin/client_maker/client_approver/viewer |
| status | varchar | active/inactive/suspended/revoked |
| authority_evidence_ref | varchar | Evidence |
| effective_from_utc | timestamptz | From |
| expires_at_utc | timestamptz | Optional |
| approval_id | varchar | Approval |
| sec_audit_ref | varchar | Audit |

### 2.5 `clt1.client_mandate`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| mandate_id | varchar | Unique |
| client_id | varchar | Client |
| mandate_type | varchar | standard/custom/institutional |
| rules | jsonb | Thresholds/approvals |
| status | varchar | active/inactive/expired/revoked |
| effective_from_utc | timestamptz | From |
| expires_at_utc | timestamptz | Expiry/review |
| approval_id | varchar | Approval |
| sec_audit_ref | varchar | Audit |

### 2.6 `clt1.consent_record`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| consent_id | varchar | Unique |
| application_id | varchar | Application |
| client_id | varchar | Client |
| consent_type | varchar | terms/privacy/risk_disclosure/data_processing |
| consent_version | varchar | Version |
| accepted_by | varchar | User |
| accepted_at_utc | timestamptz | Time |
| ip_hash | varchar | Optional safe hash |
| sec_audit_ref | varchar | Audit |

### 2.7 `clt1.handoff_status`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| handoff_id | varchar | Unique |
| application_id | varchar | Application |
| client_id | varchar | Client |
| target_module | varchar | KYC/KYB/AML/etc |
| status | varchar | pending/sent/received/failed/completed |
| payload_hash | varchar | Integrity |
| sent_at_utc | timestamptz | Sent |
| completed_at_utc | timestamptz | Complete |
| sec_audit_ref | varchar | Audit |

### 2.8 `clt1.duplicate_candidate`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| duplicate_id | varchar | Unique |
| application_id | varchar | Application |
| matched_client_id | varchar | Matched client |
| match_type | varchar | name/id/email/phone/corporate_ref |
| match_score | numeric | Score |
| status | varchar | open/duplicate/not_duplicate/needs_more_info |
| reviewed_by | varchar | Reviewer |
| reviewed_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.9 `clt1.profile_change_request`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| change_request_id | varchar | Unique |
| client_id | varchar | Client |
| change_type | varchar | profile/class/mandate/user/status |
| from_hash | varchar | Previous snapshot hash |
| to_hash | varchar | New snapshot hash |
| reason | text | Safe reason |
| status | varchar | requested/approved/rejected/applied/cancelled |
| approval_id | varchar | IAM-02 approval |
| sec_audit_ref | varchar | Audit |

### 2.10 `clt1.client_status_history`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| status_history_id | varchar | Unique |
| client_id | varchar | Client |
| from_status | varchar | Previous |
| to_status | varchar | New |
| reason_code | varchar | Reason |
| evidence_ref | varchar | Evidence |
| changed_by | varchar | User |
| approval_id | varchar | Approval |
| changed_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

---

## 3. Indexes

1. `client_application(application_id, status)`.
2. `client_application(client_class, status)`.
3. `client_profile(client_id, status)`.
4. `client_profile(client_class, status)`.
5. `authorised_user(client_id, user_id, status)`.
6. `client_mandate(client_id, status)`.
7. `handoff_status(application_id, target_module, status)`.
8. `duplicate_candidate(application_id, status)`.
9. `profile_change_request(client_id, status)`.
10. `client_status_history(client_id, changed_at_utc)`.

---

## 4. Data Rules

1. Retail/ineligible class cannot become active.
2. Client-class change requires evidence and approval.
3. Final approval requires KYC/KYB and AML handoff creation.
4. Approved profile does not grant trading/payment access alone.
5. Sensitive read/export requires SEC-01 audit.
6. Status change is append-versioned.
7. Mandate must have effective date and review/expiry where required.
8. Duplicate flags must be resolved before final approval.
9. Super Admin cannot directly set client active.
10. Service account cannot create approved client directly.
