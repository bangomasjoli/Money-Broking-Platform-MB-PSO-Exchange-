# WLT-01 Wallet Screening / Payout Destination Whitelist
## 08 Audit Log Events

## 1. WLT-01 Events

| Event Type | Trigger | Severity |
|---|---|---|
| `wlt1.wallet_registered` | Wallet registration | High |
| `wlt1.wallet_canonicalised` | Address canonicalised | Medium |
| `wlt1.wallet_screening_requested` | Wallet screening | High |
| `wlt1.wallet_screening_completed` | Screening complete | High |
| `wlt1.wallet_high_risk_detected` | High-risk wallet | Critical/High |
| `wlt1.wallet_sanctions_exposure` | Wallet sanctions exposure | Critical |
| `wlt1.payout_destination_registered` | Payout destination | High |
| `wlt1.beneficiary_verified` | Beneficiary verified | High |
| `wlt1.beneficiary_mismatch` | Mismatch | High/Critical |
| `wlt1.whitelist_approval_requested` | Approval requested | High |
| `wlt1.whitelist_approved` | Whitelist approved | High |
| `wlt1.cooling_off_started` | Cooling-off started | Medium/High |
| `wlt1.cooling_off_completed` | Cooling-off completed | Medium |
| `wlt1.cooling_off_overridden` | Cooling-off override | High/Critical |
| `wlt1.destination_activated` | Destination active | High |
| `wlt1.destination_revoked` | Destination revoked | Critical/High |
| `wlt1.destination_use_evaluated` | Use gate evaluated | High |
| `wlt1.destination_use_denied` | Use denied/held | High |
| `wlt1.decision_token_issued` | Destination decision token | Medium/High |
| `wlt1.rescreening_started` | Rescreening | Medium |
| `wlt1.rescreening_completed` | Rescreen complete | Medium/High |
| `wlt1.vendor_result_received` | Vendor result | Medium/High |
| `wlt1.vendor_result_rejected` | Vendor result rejected | High |
| `wlt1.sensitive_destination_read` | Sensitive read | High |
| `wlt1.evidence_exported` | Evidence export | High |
| `wlt1.reconciliation_finding` | Reconciliation finding | High/Critical |
| `wlt1.execution_revalidation_requested` | Execution revalidation | High |
| `wlt1.execution_revalidation_rejected` | Execution revalidation rejected | High/Critical |
| `wlt1.destination_decision_consumed` | Decision consumed | High |
| `wlt1.limit_evaluated` | Limit/velocity evaluated | High |
| `wlt1.limit_breach` | Limit breach | High/Critical |
| `wlt1.inbound_source_screened` | Inbound source screened | High |
| `wlt1.deposit_quarantined` | Deposit quarantined | Critical/High |
| `wlt1.proof_of_control_verified` | Proof-of-control verified | High |
| `wlt1.proof_of_control_failed` | Proof-of-control failed | High |
| `wlt1.address_integrity_checked` | Address integrity checked | High |
| `wlt1.address_poisoning_detected` | Address poisoning risk | Critical/High |
| `wlt1.unsupported_chain_detected` | Unsupported chain/asset | High |
| `wlt1.aml_revocation_signal_received` | AML revocation consumed | Critical/High |
| `wlt1.cooling_off_cancelled_by_risk` | Cooling-off cancelled by new risk | High/Critical |

---

## 2. Critical Alerts

SEC-01 must alert on:

1. Destination use without active whitelist.
2. Revoked destination used downstream.
3. High-risk/sanctions wallet approved without Compliance.
4. Beneficiary mismatch approved without approval.
5. Cooling-off bypass.
6. AML pre-transaction gate missing/stale.
7. Travel Rule missing data treated clear.
8. Direct DB whitelist status edit suspected.
9. Sensitive read/export without SEC-01 audit.
10. Money movement without execution revalidation.
11. Revocation epoch mismatch.
12. Limit breach.
13. Deposit quarantined.
14. Unhosted wallet without proof-of-control attempt.
15. Address poisoning/lookalike detected.
16. AML revocation signal received.
