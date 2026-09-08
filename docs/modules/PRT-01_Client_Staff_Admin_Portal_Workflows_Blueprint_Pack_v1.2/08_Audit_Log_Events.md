# PRT-01 Client / Staff / Admin Portal Workflows
## 08 Audit Log Events

| Event Type | Trigger | Severity |
|---|---|---|
| `prt1.sensitive_view` | Sensitive data viewed | High |
| `prt1.portal_action_submitted` | User action submitted | High |
| `prt1.portal_action_rejected` | Backend rejected | Medium/High |
| `prt1.step_up_requested` | Step-up required | Medium |
| `prt1.export_requested` | Export request | High |
| `prt1.export_approved` | Export approved | High |
| `prt1.export_downloaded` | Export downloaded | High |
| `prt1.message_template_approved` | Template approved | High |
| `prt1.freeze_action_attempted` | Action attempted under freeze | High |
| `prt1.tipping_off_blocked` | Tipping-off risk blocked | Critical/High |
| `prt1.exchange_feature_attempted` | Exchange feature attempted | Critical |
| `prt1.frontend_bypass_attempted` | Hidden-field/frontend bypass | Critical/High |
| `prt1.status_truth_correction` | Status corrected | High |
| `prt1.display_non_regression_failed` | Cached positive suppressed | High/Critical |
| `prt1.overlay_applied` | Freeze/reversal/restatement overlay | High |
| `prt1.object_authorization_denied` | Object-level read denied | High/Critical |
| `prt1.invalidation_event_received` | Push invalidation received | High |
| `prt1.invalidation_subscription_lost` | Subscription lost/stale | Critical/High |
| `prt1.export_disclosure_logged` | Recipient/purpose/basis logged | High |
| `prt1.download_token_issued` | Export token issued | High |
| `prt1.download_token_reused` | Token replay attempt | Critical/High |
| `prt1.quote_binding_failed` | Client-posted economics rejected | Critical |
| `prt1.upload_rejected` | Unsafe upload rejected | High/Critical |
| `prt1.notification_superseded` | Stale notification suppressed | High |
| `prt1.step_up_bound_to_action` | Dynamic step-up | High |
| `prt1.correlation_propagated` | Correlation ID propagated | High |
| `prt1.source_unavailable_degraded_display` | Degraded display shown | High |

## Critical Alerts

1. attempt to enable Exchange UI.
2. attempt to display paid/credited/settled without backend finality.
3. AML tipping-off risk.
4. sensitive export without approval.
5. frontend bypass attempt.
6. BOLA/IDOR attempt.
7. export token replay.
8. client-posted economics tampering.
9. stale-positive status suppressed.
10. invalidation subscription lost.
11. unsafe upload.
12. tipping-off message blocked.
