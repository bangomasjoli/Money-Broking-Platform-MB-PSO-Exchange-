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

## Critical Alerts

1. attempt to enable Exchange UI.
2. attempt to display paid/credited/settled without backend finality.
3. AML tipping-off risk.
4. sensitive export without approval.
5. frontend bypass attempt.
