# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 08 Audit Log Events

## 1. AML-01 Events

| Event Type | Trigger | Severity |
|---|---|---|
| `aml1.handoff_received` | Handoff received | Medium |
| `aml1.screening_case_created` | Case created | Medium |
| `aml1.screening_run_started` | Screening run started | Medium |
| `aml1.vendor_result_received` | Vendor result received | Medium/High |
| `aml1.vendor_result_rejected` | Vendor result rejected | High |
| `aml1.match_candidate_created` | Candidate match | High |
| `aml1.false_positive_decisioned` | False-positive decision | High |
| `aml1.true_hit_detected` | True hit | Critical |
| `aml1.true_hit_escalated` | Escalated | Critical |
| `aml1.outcome_computed` | Outcome computed | High |
| `aml1.outcome_published` | Outcome published | High |
| `aml1.kyc_edd_trigger_sent` | KYC EDD trigger | High/Critical |
| `aml1.rescreening_started` | Rescreening started | Medium |
| `aml1.rescreening_completed` | Rescreening completed | Medium/High |
| `aml1.list_update_received` | List update received | High |
| `aml1.travel_rule_screened` | Travel Rule screened | High |
| `aml1.travel_rule_missing_data` | Missing data | High |
| `aml1.str_case_created` | STR/suspicion case | Critical |
| `aml1.str_decision_recorded` | STR decision | Critical |
| `aml1.tipping_off_blocked` | Unsafe notification blocked | Critical/High |
| `aml1.sensitive_evidence_read` | Sensitive read | High |
| `aml1.evidence_exported` | Evidence exported | High |
| `aml1.reconciliation_finding` | Reconciliation finding | High/Critical |
| `aml1.pre_transaction_screening_requested` | Pre-transaction screening requested | High |
| `aml1.pre_transaction_screening_blocked` | Transaction blocked by sanctions gate | Critical/High |
| `aml1.list_update_sla_started` | List-update SLA started | High |
| `aml1.list_update_sla_breached` | List-update SLA breached | Critical |
| `aml1.interim_block_applied` | Interim block applied | High/Critical |
| `aml1.ownership_50_rule_hit` | Ownership-based sanctions hit | Critical |
| `aml1.screening_input_incomplete` | Screening input incomplete | High |
| `aml1.str_clock_started` | STR clock started | Critical/High |
| `aml1.str_deadline_breached` | STR deadline breached | Critical |
| `aml1.sanctions_fp_dual_reviewed` | Sanctions false positive dual reviewed | High |
| `aml1.fp_reattestation_due` | False-positive re-attestation due | High |
| `aml1.aml_outcome_revoked` | AML outcome revoked | High/Critical |
| `aml1.delisting_review_created` | De-listing review | High |
| `aml1.travel_rule_sunrise_review` | Travel Rule sunrise handling | High |

---

## 2. Critical Alerts

SEC-01 must alert on:

1. Sanctions true hit.
2. True hit without CLT restriction feedback.
3. True hit without KYC EDD trigger where required.
4. STR case accessed by unauthorised role.
5. Client-facing tipping-off attempt.
6. List update without rescreening.
7. Stale AML outcome treated as clear.
8. Sensitive screening/STR read not logged.
9. Direct DB outcome edit suspected.
10. Pre-transaction gate bypass attempt.
11. List-update SLA breach.
12. Ownership-based sanctions hit.
13. STR deadline breach.
14. Sanctions FP review bypass.
15. Incomplete input cleared attempt.
16. Outcome hash invalid/revoked used downstream.
