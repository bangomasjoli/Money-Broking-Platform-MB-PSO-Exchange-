# SEC-01 Audit Log / Security Monitoring  
## 08 Audit Log Events

## 1. SEC-01 Own Audit Events

SEC-01 must audit its own administrative and sensitive actions.

| Event Type | Trigger | Severity |
|---|---|---|
| `sec1.audit_event_ingested` | Audit event ingested | Info/Medium |
| `sec1.audit_event_rejected` | Event rejected | High/Critical |
| `sec1.audit_hash_chain_updated` | Hash chain updated | Info |
| `sec1.audit_hash_mismatch_detected` | Hash mismatch | Critical |
| `sec1.audit_sequence_gap_detected` | Sequence gap | Critical |
| `sec1.audit_batch_sealed` | Batch seal created | Medium |
| `sec1.integrity_verification_passed` | Integrity check passed | Info |
| `sec1.integrity_verification_failed` | Integrity check failed | Critical |
| `sec1.sensitive_audit_read` | Sensitive audit read | High |
| `sec1.evidence_export_requested` | Evidence export requested | High |
| `sec1.evidence_export_approved` | Evidence export approved | High |
| `sec1.evidence_export_generated` | Evidence package generated | High |
| `sec1.evidence_export_downloaded` | Evidence export downloaded | High |
| `sec1.security_alert_created` | Security alert created | Medium/High/Critical |
| `sec1.security_alert_triaged` | Alert triaged | Medium |
| `sec1.security_alert_closed` | Alert closed | Medium/High |
| `sec1.critical_alert_closure_approved` | Critical closure approved | High |
| `sec1.monitoring_rule_created` | Rule created | High |
| `sec1.monitoring_rule_updated` | Rule updated | High |
| `sec1.event_schema_created` | Schema created | High |
| `sec1.event_schema_updated` | Schema updated | High |
| `sec1.audit_correction_created` | Append-only correction | Critical/High |
| `sec1.interim_audit_handoff_completed` | IAM handoff completed | High |
| `sec1.interim_audit_handoff_missing_event` | Missing sensitive event | Critical |
| `sec1.audit_persistence_failure` | Audit persistence failed | Critical |
| `sec1.external_seal_anchor_created` | External seal anchor created | High |
| `sec1.external_seal_verification_failed` | External seal mismatch/failure | Critical |
| `sec1.trusted_timestamp_missing` | Trusted timestamp missing | Critical/High |
| `sec1.source_sequence_gap_detected` | Source emission sequence gap | Critical |
| `sec1.expected_event_missing` | Expected sensitive event missing | Critical |
| `sec1.source_module_identity_mismatch` | Ingestion source spoof/mismatch | Critical |
| `sec1.clock_skew_exceeded` | Source clock skew exceeded | High/Critical |
| `sec1.alert_pipeline_backlog` | Alert evaluation backlog | High/Critical |
| `sec1.incident_break_glass_read_requested` | Emergency audit read requested | Critical/High |
| `sec1.incident_break_glass_read_used` | Emergency audit read used | Critical |
| `sec1.recovery_integrity_verified` | Restore integrity verified | High |
| `sec1.recovery_integrity_failed` | Restore integrity failed | Critical |
| `sec1.freeform_backfill_blocked` | Backfill without FND evidence blocked | Critical |
| `sec1.sensitive_action_fail_closed` | Sensitive action blocked due audit failure | Critical |
| `sec1.retention_archive_executed` | Archive action | High |
| `sec1.legal_hold_applied` | Legal hold applied | High |

---

## 2. Security Monitoring Events Consumed

SEC-01 must ingest and monitor events from:

1. IAM-01 login/session/MFA events.
2. IAM-02 permission/approval/SoD/break-glass events.
3. FND outbox/idempotency/job failure events.
4. CFG licence-lock/feature events once CFG-01 is live.
5. KYC/KYB events.
6. AML/sanctions/Travel Rule events.
7. Wallet/payout whitelist events.
8. Quote/trade/LP events.
9. Ledger/settlement/reconciliation events.
10. Production access/deployment events.

---

## 3. Mandatory Fields

All audit events require:

1. event_id.
2. event_type.
3. source_module.
4. severity.
5. occurred_at_utc.
6. request_id.
7. correlation_id.
8. actor_user_id or actor_type/system reference.
9. action.
10. result.
11. entity_type/entity_id where applicable.
12. classification.
13. idempotency_key.

---

## 4. Metadata Restrictions

Never store in audit metadata:

1. Passwords.
2. MFA codes.
3. Refresh/access tokens.
4. Private keys.
5. API secrets.
6. Full card/bank sensitive values.
7. Unmasked STR/suspicious report contents.
8. Full private wallet keys.
9. Plaintext production credentials.

Use references, hashes, masked values, or redacted metadata.
