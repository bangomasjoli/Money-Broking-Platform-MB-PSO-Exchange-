# SEC-01 Audit Log / Security Monitoring  
## 07 Permission Rules

## 1. Permission Namespace

Format:

```txt
sec1.<resource>.<action>
```

---

## 2. SEC-01 Permissions

| Permission | Purpose |
|---|---|
| `sec1.audit_event.ingest` | Internal event ingestion |
| `sec1.audit_event.read` | Read normal audit event |
| `sec1.audit_event.read_sensitive` | Read sensitive audit event |
| `sec1.audit_event.search` | Search audit events |
| `sec1.audit_event.verify_integrity` | Verify hash-chain |
| `sec1.event_schema.read` | Read event schemas |
| `sec1.event_schema.manage` | Manage event schemas |
| `sec1.security_alert.read` | Read alerts |
| `sec1.security_alert.triage` | Triage alerts |
| `sec1.security_alert.close` | Close alerts |
| `sec1.monitoring_rule.read` | Read monitoring rules |
| `sec1.monitoring_rule.manage` | Manage monitoring rules |
| `sec1.evidence_export.request` | Request export |
| `sec1.evidence_export.approve` | Approve export |
| `sec1.evidence_export.download` | Download export |
| `sec1.reconciliation.run` | Run reconciliation |
| `sec1.retention.manage` | Manage retention/archive |
| `sec1.audit_correction.create` | Create append-only correction |
| `sec1.admin.configure` | Configure SEC-01 module |

---

## 3. Prohibited Permissions

These must not exist or must never be grantable:

```txt
sec1.audit_event.delete
sec1.audit_event.modify
sec1.audit.disable
sec1.audit.bypass
sec1.hash_chain.reset_without_governance
sec1.alert.close_without_evidence
sec1.sensitive_read_without_log
sec1.export_without_audit
```

---

## 4. Maker-Checker / Step-Up Required

Required for:

1. Sensitive audit export.
2. Event schema change for critical event type.
3. Monitoring rule change for Critical/High alert.
4. Critical alert closure where configured.
5. Audit correction creation.
6. Retention/legal hold configuration.
7. Hash-chain repair/governance action.
8. Service account ingestion permission change.

---

## 5. SoD Rules

1. Audit event reader cannot approve own audit export if export includes own privileged actions.
2. Audit admin cannot close alert about own action.
3. Monitoring rule editor cannot approve suppression/closure of alerts triggered by own rule change.
4. Evidence export requester cannot be sole approver.
5. Service account cannot approve audit export.
6. Security alert creator cannot be sole closer for Critical alert.
7. Audit correction creator cannot approve own correction.

---

## 6. Read Redaction Rules

Audit data returned depends on permission and classification.

| Data | Normal Read | Sensitive Read |
|---|---|---|
| Event type | Visible | Visible |
| Actor ID | Visible if permitted | Visible |
| Client ID | Redacted if no scope | Visible if scoped |
| Metadata | Redacted | Controlled full/safe metadata |
| Security finding | Limited | Full if permitted |
| Export manifest | Not visible | Visible if authorised |

---

## 7. Licence-Scoped Monitoring

SEC-01 must alert on attempts to use or enable prohibited permissions/features:

1. Public order book.
2. Matching engine.
3. Client-to-client matching.
4. Principal dealing.
5. Market making.
6. AIX spread markup.
7. Public exchange trading.
8. Retail onboarding by default.
9. Audit bypass.
10. Permission bypass.
