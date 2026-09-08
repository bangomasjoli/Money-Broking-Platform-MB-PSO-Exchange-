# INC-01 Incident / Freeze / Recovery
## 08 Audit Log Events

| Event Type | Trigger | Severity |
|---|---|---|
| `inc1.incident_created` | Incident intake | High |
| `inc1.incident_classified` | Severity classification | High |
| `inc1.command_assigned` | Command assignment | High |
| `inc1.freeze_requested` | Freeze order | Critical/High |
| `inc1.freeze_acknowledged` | Module ack | High |
| `inc1.freeze_ack_missing` | Missing ack | Critical/High |
| `inc1.money_flow_quiesced` | Quiescence | Critical/High |
| `inc1.inflight_item_dispositioned` | In-flight disposition | High |
| `inc1.evidence_captured` | Evidence capture | High |
| `inc1.notification_obligation_created` | Notification obligation | High |
| `inc1.notification_submitted` | Notification submitted | High |
| `inc1.notification_late` | Late notification | Critical/High |
| `inc1.recovery_plan_approved` | Recovery plan | High |
| `inc1.resume_gate_approved` | Resume approval | Critical/High |
| `inc1.freeze_released` | Freeze release | Critical/High |
| `inc1.post_incident_review_completed` | PIR | High |
| `inc1.incident_closed` | Closure | High |
| `inc1.prohibited_mutation_attempt` | Source/ledger mutation attempt | Critical |
| `inc1.freeze_barrier_started` | Atomic freeze barrier | Critical/High |
| `inc1.freeze_effectiveness_verified` | Freeze effective proof | Critical/High |
| `inc1.freeze_effectiveness_failed` | Freeze ineffective | Critical |
| `inc1.partial_freeze_escalated` | Partial freeze fail-closed | Critical |
| `inc1.freeze_hold_created` | Reference-counted freeze | High |
| `inc1.freeze_extension_requested` | Freeze re-justification | High |
| `inc1.auto_freeze_triggered` | Auto-freeze | Critical |
| `inc1.severity_downgrade_requested` | Downgrade | High/Critical |
| `inc1.incident_suppression_detected` | Non-raise alert | Critical/High |
| `inc1.inc_record_anchored` | Hash-chain/external anchor | High |
| `inc1.degraded_mode_activated` | Degraded mode | Critical |
| `inc1.out_of_band_freeze_used` | Out-of-band freeze | Critical |
| `inc1.independent_evidence_captured` | Independent evidence | Critical/High |
| `inc1.money_recovery_verified` | Recovery proof | Critical/High |
| `inc1.freeze_consequence_created` | Client access impact | High |
| `inc1.communication_approved` | Comms approval | High |
| `inc1.tipping_off_risk_blocked` | AML tipping-off risk | Critical/High |

## Critical Alerts

1. critical incident unassigned.
2. freeze acknowledgement missing.
3. in-flight money-flow item not dispositioned.
4. resume attempted without gate.
5. closure attempted without evidence.
6. notification missed.
7. source mutation attempt.
8. audit evidence tampering.
9. freeze ack without effectiveness proof.
10. partial freeze not escalated.
11. resume by same actor who declared resolved.
12. incident suppression/downgrade abuse.
13. degraded-mode use.
14. resume with money recovery unresolved.
15. freeze exceeds SLA without re-justification.
16. client access denial untracked.
17. tipping-off risk in communication.
