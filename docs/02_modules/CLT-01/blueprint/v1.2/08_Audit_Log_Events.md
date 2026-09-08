# CLT-01 Client Onboarding / Client Profile
## 08 Audit Log Events

## 1. CLT-01 Events

| Event Type | Trigger | Severity |
|---|---|---|
| `clt1.application_created` | Application created | Medium |
| `clt1.application_updated` | Application updated | Medium |
| `clt1.client_class_claimed` | Client class claimed | Medium/High |
| `clt1.client_class_changed` | Client class changed | High |
| `clt1.retail_onboarding_blocked` | Retail lock applied | High |
| `clt1.application_submitted` | Application submitted | Medium |
| `clt1.kyc_handoff_created` | KYC/KYB handoff | Medium |
| `clt1.aml_handoff_created` | AML handoff | Medium |
| `clt1.duplicate_candidate_detected` | Duplicate flag | High |
| `clt1.duplicate_review_completed` | Duplicate reviewed | High |
| `clt1.application_approval_requested` | Approval requested | High |
| `clt1.application_approved` | Application approved | High |
| `clt1.application_rejected` | Application rejected | High |
| `clt1.application_held` | Application held | High |
| `clt1.client_profile_created` | Client profile created | High |
| `clt1.client_profile_updated` | Profile updated | High |
| `clt1.client_status_changed` | Status changed | High |
| `clt1.authorised_user_added` | Authorised user added | High |
| `clt1.authorised_user_removed` | Authorised user removed | High |
| `clt1.client_mandate_created` | Mandate created | High |
| `clt1.client_mandate_changed` | Mandate changed | High |
| `clt1.sensitive_profile_read` | Sensitive read | High |
| `clt1.evidence_export_requested` | Export requested | High |
| `clt1.evidence_export_generated` | Export generated | High |
| `clt1.downstream_status_blocked` | Status blocks downstream | Medium/High |
| `clt1.reconciliation_finding` | Reconciliation finding | High/Critical |
| `clt1.cdd_outcome_received` | CDD/screening/risk outcome received | High |
| `clt1.cdd_outcome_failed` | CDD/screening/risk failed/hit | Critical/High |
| `clt1.authorised_party_added` | Authorised party added | High |
| `clt1.authorised_party_screened` | Authorised party screening outcome | High |
| `clt1.ubo_identified` | UBO/controller identified | High |
| `clt1.monitoring_feedback_received` | Downstream status feedback received | High/Critical |
| `clt1.periodic_review_due` | Periodic review due | Medium/High |
| `clt1.periodic_review_failed` | Periodic review failed | Critical/High |
| `clt1.verified_identity_duplicate_blocked` | Duplicate verified identity blocked | Critical/High |
| `clt1.related_party_edge_created` | Related party edge created | Medium/High |
| `clt1.data_protection_request_received` | DSAR/rectification/erasure request | High |

---

## 2. Mandatory Metadata

1. application_id.
2. client_id where available.
3. client_class.
4. status.
5. actor_user_id.
6. action.
7. approval_id where applicable.
8. cfg_decision_ref where applicable.
9. handoff_id where applicable.
10. request_id.
11. correlation_id.
12. SEC-01 audit ref.

---

## 3. Critical Alerts

SEC-01 must alert on:

1. Retail onboarding allowed unexpectedly.
2. Client class upgraded without approval.
3. Approved client without KYC/KYB handoff.
4. Approved client without AML handoff.
5. Suspended/closed client still active downstream.
6. Sensitive profile read not logged.
7. Direct status edit suspected.
8. Break-glass approval attempt.
9. Super Admin bypass attempt.
