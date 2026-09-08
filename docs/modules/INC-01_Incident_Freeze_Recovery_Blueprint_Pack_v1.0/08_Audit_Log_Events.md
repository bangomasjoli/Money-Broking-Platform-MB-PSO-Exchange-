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

## Critical Alerts

1. critical incident unassigned.
2. freeze acknowledgement missing.
3. in-flight money-flow item not dispositioned.
4. resume attempted without gate.
5. closure attempted without evidence.
6. notification missed.
7. source mutation attempt.
8. audit evidence tampering.
