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
