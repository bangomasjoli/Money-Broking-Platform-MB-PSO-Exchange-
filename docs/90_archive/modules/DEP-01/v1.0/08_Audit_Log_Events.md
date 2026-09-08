# DEP-01 Deposit Execution / Inbound Receipt
## 08 Audit Log Events

| Event Type | Trigger | Severity |
|---|---|---|
| `dep1.deposit_intent_created` | Deposit intent | Medium/High |
| `dep1.receipt_received` | Receipt received | High |
| `dep1.receipt_authenticated` | Receipt authenticated | High |
| `dep1.receipt_rejected` | Receipt rejected | High |
| `dep1.receipt_duplicate_detected` | Duplicate receipt | High |
| `dep1.idempotency_payload_conflict` | Same event different payload | Critical/High |
| `dep1.source_metadata_extracted` | Source metadata | High |
| `dep1.deposit_matched` | Deposit matched | High |
| `dep1.deposit_unmatched` | No match | High |
| `dep1.deposit_ambiguous_match` | Multiple match | Critical/High |
| `dep1.wlt_screening_requested` | WLT handoff | High |
| `dep1.aml_gate_requested` | AML handoff | High |
| `dep1.led_pending_requested` | LED pending | High |
| `dep1.led_credit_evaluation_requested` | LED credit eval | High |
| `dep1.deposit_quarantined` | Quarantine | Critical/High |
| `dep1.confirmation_updated` | Confirmation update | High |
| `dep1.reversal_received` | Reorg/recall/reversal | Critical/High |
| `dep1.led_clawback_notified` | LED clawback notify | Critical/High |
| `dep1.reconciliation_break_created` | Recon break | High/Critical |
| `dep1.prohibited_credit_attempt` | DEP credit attempt | Critical |
| `dep1.evidence_exported` | Evidence export | High |

## Critical Alerts

SEC-01 must alert on:

1. DEP attempted ledger credit.
2. unauthenticated receipt matched.
3. duplicate receipt amount credited risk.
4. ambiguous match auto-resolved.
5. LED credit evaluation requested before WLT/AML/confirmation clear.
6. reversal after credit.
7. source payload conflict.
8. missing correlation ID.
