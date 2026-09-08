# KYC-01 KYC / KYB Verification
## 08 Audit Log Events

## 1. KYC-01 Events

| Event Type | Trigger | Severity |
|---|---|---|
| `kyc1.handoff_received` | CLT handoff received | Medium |
| `kyc1.case_created` | KYC/KYB case created | Medium |
| `kyc1.document_reference_added` | Evidence ref added | High |
| `kyc1.document_verified` | Document verified | High |
| `kyc1.document_rejected` | Document rejected | High |
| `kyc1.identity_verified` | Identity verified | High |
| `kyc1.identity_failed` | Identity failed | High/Critical |
| `kyc1.entity_verified` | Entity verified | High |
| `kyc1.entity_failed` | Entity failed | High/Critical |
| `kyc1.ownership_structure_created` | Ownership captured | High |
| `kyc1.ubo_verification_required` | UBO required | High |
| `kyc1.ubo_verified` | UBO verified | High |
| `kyc1.ubo_incomplete` | UBO incomplete | High/Critical |
| `kyc1.authorised_party_verified` | Authorised party verified | High |
| `kyc1.edd_required` | EDD required | High |
| `kyc1.edd_decisioned` | EDD decision | Critical/High |
| `kyc1.manual_review_requested` | Manual review requested | High |
| `kyc1.manual_review_decisioned` | Manual review decision | High/Critical |
| `kyc1.outcome_computed` | Outcome computed | High |
| `kyc1.outcome_published` | Outcome published to CLT | High |
| `kyc1.outcome_stale` | Outcome stale | High |
| `kyc1.remediation_requested` | Remediation requested | High |
| `kyc1.vendor_result_received` | Vendor result received | Medium/High |
| `kyc1.vendor_result_rejected` | Vendor result rejected | High |
| `kyc1.sensitive_evidence_read` | Sensitive evidence read | High |
| `kyc1.evidence_exported` | Evidence exported | High |
| `kyc1.reconciliation_finding` | Reconciliation finding | High/Critical |

---

## 2. Critical Alerts

SEC-01 must alert on:

1. CDD pass without required document.
2. CDD pass without UBO verification.
3. Manual pass without IAM-02 approval.
4. Vendor result unauthenticated.
5. Direct DB outcome edit suspected.
6. Stale outcome still treated as pass.
7. Sensitive evidence read not logged.
8. Outcome publish failed/deadlettered.
