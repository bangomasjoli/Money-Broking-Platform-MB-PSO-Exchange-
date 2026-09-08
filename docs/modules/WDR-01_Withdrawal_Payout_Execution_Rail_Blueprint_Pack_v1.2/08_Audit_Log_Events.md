# WDR-01 Withdrawal / Payout Execution Rail
## 08 Audit Log Events

| Event Type | Trigger | Severity |
|---|---|---|
| `wdr1.execution_created` | Execution intake | High |
| `wdr1.decision_bundle_validated` | Bundle valid | High |
| `wdr1.decision_bundle_rejected` | Bundle rejected | Critical/High |
| `wdr1.provider_route_selected` | Route selected | High |
| `wdr1.provider_instruction_built` | Instruction built | High |
| `wdr1.provider_instruction_submitted` | Instruction submitted | Critical/High |
| `wdr1.provider_ack_received` | Provider ack | High |
| `wdr1.provider_timeout` | Timeout | High/Critical |
| `wdr1.provider_queryback_started` | Query-back | High |
| `wdr1.finality_received` | Finality | High |
| `wdr1.led_finality_notified` | LED finality notify | Critical/High |
| `wdr1.failure_notified_led` | LED failure notify | Critical/High |
| `wdr1.return_reversal_received` | Return/reversal | Critical/High |
| `wdr1.cancellation_requested` | Cancellation | High |
| `wdr1.cancellation_confirmed` | Cancellation confirmed | High |
| `wdr1.late_execution_after_cancel` | Late execution | Critical |
| `wdr1.freeze_interrupted_execution` | Freeze handling | Critical/High |
| `wdr1.prohibited_bypass_attempt` | Control bypass | Critical |
| `wdr1.reconciliation_break_created` | Recon break | High/Critical |
| `wdr1.evidence_exported` | Evidence export | High |
| `wdr1.send_time_revalidation_started` | Send critical section | Critical/High |
| `wdr1.send_time_revalidation_failed` | Stale bundle at send | Critical |
| `wdr1.reserve_send_lock_acquired` | Reserve send lock | Critical/High |
| `wdr1.payout_value_conservation_checked` | Value conservation | High |
| `wdr1.payout_value_conservation_failed` | Conservation failure | Critical |
| `wdr1.beneficiary_integrity_verified` | Payload matches WLT destination | High |
| `wdr1.beneficiary_integrity_failed` | Payload mismatch | Critical |
| `wdr1.batch_envelope_created` | Batch payout | High |
| `wdr1.batch_file_integrity_checked` | File manifest/checksum | High |
| `wdr1.batch_item_finality_updated` | Item finality | High |
| `wdr1.logical_payout_duplicate_detected` | Duplicate logical payout | Critical/High |
| `wdr1.state_version_conflict` | CAS conflict | High |
| `wdr1.executed_late_detected` | Late execution after cancel | Critical |
| `wdr1.signing_key_validated` | Provider signing key | High |
| `wdr1.travel_rule_payload_checked` | Travel Rule payload consistency | High |
| `wdr1.stuck_payout_sla_exceeded` | Stuck payout | High/Critical |
| `wdr1.client_status_corrected` | Status correction | High |

## Critical Alerts

1. instruction without LED reserve.
2. instruction without WLT/AML gate.
3. instruction after kill-switch/freeze.
4. provider timeout unresolved past SLA.
5. finality without LED notification.
6. LED settlement without provider finality.
7. return/reversal ignored.
8. duplicate instruction risk.
9. principal funding attempt.
10. stale bundle at send.
11. value conservation failure.
12. beneficiary payload mismatch.
13. batch checksum/manifest failure.
14. duplicate reserve-send lock.
15. executed-late after cancellation.
16. client status paid before LED/rail finality.
