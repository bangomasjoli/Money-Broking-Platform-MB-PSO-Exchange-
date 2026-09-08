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
