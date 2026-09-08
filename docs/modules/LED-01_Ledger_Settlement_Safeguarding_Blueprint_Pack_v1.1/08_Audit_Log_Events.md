# LED-01 Ledger / Settlement / Safeguarding
## 08 Audit Log Events

| Event Type | Trigger | Severity |
|---|---|---|
| `led1.journal_post_requested` | Journal request | High |
| `led1.journal_posted` | Journal posted | High |
| `led1.journal_rejected` | Journal rejected | High |
| `led1.unbalanced_journal_rejected` | Unbalanced journal | Critical/High |
| `led1.direct_balance_edit_attempt` | Direct edit attempt | Critical |
| `led1.deposit_pending_created` | Pending deposit | High |
| `led1.deposit_credited` | Deposit credited | High |
| `led1.deposit_quarantined` | Deposit quarantined | High/Critical |
| `led1.hold_created` | Hold created | High |
| `led1.hold_consumed` | Hold consumed | High |
| `led1.hold_released` | Hold released | High |
| `led1.settlement_created` | Settlement created | High |
| `led1.settlement_confirmed` | Settlement confirmed | High |
| `led1.settlement_failed` | Settlement failed | High |
| `led1.dvp_sequence_rejected` | DvP invalid | Critical/High |
| `led1.safeguarding_check_passed` | Full-backing pass | Medium/High |
| `led1.safeguarding_breach` | Full-backing breach | Critical |
| `led1.reversal_requested` | Reversal requested | High |
| `led1.reversal_posted` | Reversal posted | High |
| `led1.freeze_created` | Freeze created | Critical/High |
| `led1.freeze_released` | Freeze released | High |
| `led1.period_closed` | Period closed | High |
| `led1.reconciliation_started` | Reconciliation run | Medium |
| `led1.reconciliation_break_created` | Break created | High/Critical |
| `led1.reconciliation_break_resolved` | Break resolved | High |
| `led1.evidence_exported` | Evidence export | High |
| `led1.atomic_reservation_requested` | Atomic reservation requested | High |
| `led1.atomic_reservation_committed` | Atomic reservation committed | High |
| `led1.atomic_reservation_conflict` | Balance version conflict | High/Critical |
| `led1.snapshot_reservation_attempt` | Snapshot used for reservation | Critical |
| `led1.dvp_group_created` | DvP group created | High |
| `led1.dvp_partial_settlement` | One leg settled pending other | Critical/High |
| `led1.compensating_unwind_required` | Unwind required | Critical |
| `led1.backing_encumbered` | Backing encumbered | High |
| `led1.backing_reuse_attempt` | Encumbered backing reuse attempt | Critical |
| `led1.conversion_event_created` | Conversion event | High |
| `led1.residual_bound_breach` | Residual bound breach | Critical/High |
| `led1.aix_net_position_breach` | AIX net position nonzero | Critical |
| `led1.journal_hash_chained` | Journal sealed | Medium/High |
| `led1.journal_chain_mismatch` | Chain mismatch | Critical |
| `led1.external_anchor_published` | External anchor | Medium/High |
| `led1.clawback_case_created` | Clawback case | Critical/High |
| `led1.idempotency_payload_conflict` | Same key different payload | Critical/High |
| `led1.operational_account_bound_breach` | Operational bound breach | Critical/High |
| `led1.fee_settlement_compensation` | Fee/settlement compensation | High |

## Critical Alerts

SEC-01 must alert on:

1. unbalanced journal attempt.
2. direct balance edit attempt.
3. safeguarding breach.
4. negative available balance attempt.
5. payout without WLT decision.
6. settlement with stale AML decision.
7. LP execution without hold.
8. AIX exposure detected.
9. closed/frozen scope posting attempt.
10. reconciliation critical break.
11. concurrent overspend attempt.
12. DvP partial failure.
13. backing reuse attempt.
14. journal chain mismatch.
15. AIX net position breach.
16. clawback/recall event.
17. operational account bound breach.
