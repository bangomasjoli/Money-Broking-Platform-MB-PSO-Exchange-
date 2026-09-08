# TRD-01 Quote / Trade / LP Execution
## 08 Audit Log Events

| Event Type | Trigger | Severity |
|---|---|---|
| `trd1.quote_requested` | Client quote request | High |
| `trd1.lp_quote_requested` | LP quote requested | High |
| `trd1.lp_quote_received` | LP quote received | High |
| `trd1.client_quote_created` | Client quote created | High |
| `trd1.quote_accepted` | Quote accepted | High |
| `trd1.led_hold_requested` | LED hold request | High |
| `trd1.led_hold_confirmed` | Hold confirmed | High |
| `trd1.aml_gate_verified` | AML gate verified | High |
| `trd1.lp_execution_submitted` | LP execution sent | High |
| `trd1.lp_update_received` | LP update | High |
| `trd1.lp_fill_received` | LP fill | High |
| `trd1.client_fill_created` | Client fill | High |
| `trd1.slippage_exceeded` | Slippage exceeded | Critical/High |
| `trd1.partial_fill_review` | Partial fill review | High |
| `trd1.trade_voided` | Trade voided | High |
| `trd1.settlement_handoff_sent` | LED handoff | High |
| `trd1.reconciliation_break_created` | Recon break | High/Critical |
| `trd1.prohibited_exchange_feature_attempt` | Exchange feature attempt | Critical |
| `trd1.principal_exposure_attempt` | Principal exposure attempt | Critical |
| `trd1.spread_markup_attempt` | Spread markup attempt | Critical |
| `trd1.evidence_exported` | Evidence export | High |
| `trd1.execution_model_selected` | Contingent/atomic execution model selected | High |
| `trd1.price_identity_checked` | Price construction identity checked | High |
| `trd1.fill_conservation_checked` | Fill conservation checked | High |
| `trd1.fill_conservation_failed` | Conservation failed | Critical |
| `trd1.lp_timeout_queryback_started` | LP timeout query-back | High |
| `trd1.late_fill_blocked` | Late fill guard blocked settlement | Critical/High |
| `trd1.internalisation_attempt` | Internal crossing/netting attempt | Critical |
| `trd1.cfg_revalidated_execution` | CFG revalidated at LP execution | High |
| `trd1.cfg_revalidated_settlement` | CFG revalidated at settlement | High |
| `trd1.best_execution_recorded` | LP selection evidence | High |
| `trd1.positive_slippage_passed_client` | Price improvement passed to client | High |
| `trd1.partial_hold_release_coordinated` | LED partial residual hold release | High |
| `trd1.trade_state_version_conflict` | CAS state conflict | High/Critical |
| `trd1.led_settlement_outcome_synced` | LED settlement truth synced | High |

## Critical Alerts

SEC-01 must alert on:

1. LP execution without LED hold.
2. client fill without LP fill.
3. slippage outside tolerance accepted.
4. principal exposure attempt.
5. spread markup attempt.
6. Exchange feature attempt.
7. duplicate LP fill creating duplicate settlement.
8. LP timeout blind retry.
9. settlement handoff without execution evidence.
10. principal window attempt.
11. fill conservation failure.
12. price identity failure.
13. internalisation/netting attempt.
14. stale CFG decision at execution/settlement.
15. client confirmation marked settled before LED confirmation.
