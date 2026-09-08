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
| `dep1.credit_bundle_revalidated` | Credit bundle checked | High |
| `dep1.credit_bundle_rejected` | Bundle stale/revoked/mismatch | Critical/High |
| `dep1.aml_wlt_revocation_received` | Revocation signal | Critical/High |
| `dep1.deposit_pulled_to_quarantine` | Revocation/stale bundle quarantine | Critical/High |
| `dep1.sof_review_created` | SoF review required | High |
| `dep1.third_party_source_detected` | Third-party source | High/Critical |
| `dep1.finality_model_evaluated` | Finality model evaluated | High |
| `dep1.crypto_finality_uncorroborated` | Crypto finality weak | High/Critical |
| `dep1.fiat_return_window_open` | Fiat return window open | High |
| `dep1.provider_identity_verified` | Provider identity verified | High |
| `dep1.file_feed_gap_detected` | Missing file/sequence | High/Critical |
| `dep1.independent_truth_failed` | Independent truth failed | Critical |
| `dep1.expired_intent_deposit_detected` | Expired intent deposit | High/Critical |
| `dep1.amount_disposition_required` | Unexpected amount | High/Critical |
| `dep1.inbound_travel_rule_captured` | Inbound Travel Rule | High |
| `dep1.return_case_created` | Controlled return path | High |
| `dep1.reversal_bound_to_correlation` | Reversal linked to saga | Critical/High |

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
9. stale WLT/AML decision used for credit request.
10. AML/WLT revocation after deposit match.
11. third-party source auto-credit attempt.
12. fabricated receipt / independent truth failure.
13. expired intent auto-credit attempt.
14. unexpected amount auto-credit attempt.
15. direct return without payout controls.
