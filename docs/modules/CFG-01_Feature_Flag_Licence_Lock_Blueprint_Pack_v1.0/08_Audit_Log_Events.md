# CFG-01 Feature Flag / Licence Lock  
## 08 Audit Log Events

## 1. CFG-01 Events

| Event Type | Trigger | Severity |
|---|---|---|
| `cfg1.feature_decision_allow` | Sensitive feature allowed | Medium |
| `cfg1.feature_decision_deny` | Feature denied | Medium/High |
| `cfg1.feature_decision_prohibited` | Prohibited feature requested | Critical |
| `cfg1.licence_locked_feature_blocked` | Licence lock blocked feature | Critical/High |
| `cfg1.exchange_pending_feature_blocked` | Exchange pending lock blocked feature | Critical |
| `cfg1.feature_created` | Feature registry created | High |
| `cfg1.feature_updated` | Feature registry updated | High |
| `cfg1.feature_enable_requested` | Enable requested | High |
| `cfg1.feature_enabled` | Feature enabled | High/Critical |
| `cfg1.feature_disabled` | Feature disabled | High |
| `cfg1.kill_switch_activated` | Kill-switch activated | Critical/High |
| `cfg1.kill_switch_deactivated` | Kill-switch deactivated | High |
| `cfg1.licence_profile_change_requested` | Licence profile change requested | Critical/High |
| `cfg1.licence_profile_activated` | Licence profile activated | Critical/High |
| `cfg1.prohibited_feature_changed` | Prohibited registry changed | Critical |
| `cfg1.deployment_gate_passed` | Gate passed | Medium |
| `cfg1.deployment_gate_blocked` | Gate blocked | High/Critical |
| `cfg1.handoff_reconciliation_completed` | Handoff completed | High |
| `cfg1.handoff_reconciliation_mismatch` | Handoff mismatch | Critical |
| `cfg1.feature_drift_detected` | Runtime/deployment drift | High/Critical |
| `cfg1.feature_cache_invalidated` | Cache invalidated | Medium |
| `cfg1.stale_feature_decision_blocked` | Stale token/cache blocked | High |
| `cfg1.evidence_export_requested` | Evidence export requested | High |
| `cfg1.evidence_export_generated` | Evidence generated | High |

---

## 2. Mandatory Event Metadata

Events must include:

1. feature_code.
2. feature_config_version.
3. licence_profile_id/version where applicable.
4. actor_user_id or system actor.
5. action.
6. decision/reason code.
7. environment.
8. client_id/client_class where applicable.
9. approval_id where applicable.
10. request_id.
11. correlation_id.
12. effective_at_utc where applicable.
13. SEC-01 audit ref.

---

## 3. Critical Alerts

SEC-01 must alert on:

1. Attempt to enable prohibited feature.
2. Attempt to enable Exchange feature while Exchange pending.
3. Licence profile change without evidence.
4. Kill-switch deactivation without approval.
5. Runtime action uses stale feature allow.
6. Deployment attempts unregistered feature.
7. IAM permission attempts to override licence lock.
8. Handoff reconciliation mismatch.
9. Feature drift in production.
10. Attempt to disable audit/IAM/SEC/licence safety controls.
