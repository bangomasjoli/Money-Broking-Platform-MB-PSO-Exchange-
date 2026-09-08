# REC-01 Reconciliation / Finance Reporting
## 08 Audit Log Events

| Event Type | Trigger | Severity |
|---|---|---|
| `rec1.reconciliation_run_created` | Run created | High |
| `rec1.source_snapshot_captured` | Source snapshot | High |
| `rec1.reconciliation_run_completed` | Run completed | High |
| `rec1.reconciliation_run_failed` | Run failed | High/Critical |
| `rec1.break_created` | Break created | High/Critical |
| `rec1.break_assigned` | Break assigned | Medium/High |
| `rec1.break_investigation_updated` | Investigation note/evidence | Medium/High |
| `rec1.break_closure_requested` | Closure requested | High |
| `rec1.break_closure_approved` | Closure approved | High/Critical |
| `rec1.break_closure_rejected` | Closure rejected | High |
| `rec1.critical_break_escalated` | Critical escalation | Critical |
| `rec1.safeguarding_report_generated` | Safeguarding report | High/Critical |
| `rec1.value_conservation_failed` | Value conservation fail | Critical |
| `rec1.audit_completeness_failed` | SEC expected-event fail | Critical/High |
| `rec1.daily_close_blocked` | Close blocked | Critical/High |
| `rec1.daily_close_signed_off` | Close sign-off | High |
| `rec1.report_generated` | Report generated | High |
| `rec1.evidence_pack_generated` | Evidence pack | High |
| `rec1.sensitive_export_requested` | Export requested | High |
| `rec1.prohibited_source_mutation_attempt` | REC source mutation attempt | Critical |
| `rec1.population_coverage_checked` | Population coverage proof | High/Critical |
| `rec1.population_gap_detected` | Missing correlation/sequence | Critical/High |
| `rec1.as_of_anchor_selected` | Shared as-of cut-off | High |
| `rec1.in_flight_item_created` | Expected-open item | Medium/High |
| `rec1.in_flight_sla_breached` | In-flight aged to break | High/Critical |
| `rec1.external_statement_ingested` | External statement loaded | High |
| `rec1.external_statement_trust_failed` | Statement auth/completeness/freshness fail | Critical/High |
| `rec1.rec_integrity_anchored` | REC hash-chain/external anchor | High |
| `rec1.run_scope_narrowed` | Narrowed scope | High/Critical |
| `rec1.clean_rerecon_completed` | Break validation rerun | High |
| `rec1.break_recurrence_detected` | Recurring break | High/Critical |
| `rec1.policy_version_approved` | Tolerance/severity/rule policy | High |
| `rec1.report_restated` | Report restatement | High/Critical |
| `rec1.regulatory_obligation_due` | Filing due | High |
| `rec1.regulatory_submission_recorded` | Filing submitted | High |

## Critical Alerts

1. safeguarding deficit.
2. ledger hash-chain mismatch.
3. missing SEC event for money movement.
4. client fill without LP fill.
5. payout sent without reserve.
6. deposit credited without receipt/source clearance.
7. value conservation failure.
8. critical break closure without maker-checker.
9. source mutation attempt.
10. all-green report without full-population proof.
11. external statement trust failure for safeguarding.
12. selective scope presented as complete.
13. high/critical break closure without clean re-recon.
14. recurring critical break.
15. rule/severity downgrade without approval.
16. regulatory deadline missed.
