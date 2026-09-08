# INC-01 Incident / Freeze / Recovery
## 07 Permission Rules

## 1. Permission Namespace

```txt
inc1.<resource>.<action>
```

## 2. Permissions

| Permission | Purpose |
|---|---|
| `inc1.incident.create` | Create incident |
| `inc1.incident.read` | Read incident |
| `inc1.incident.classify` | Classify incident |
| `inc1.command.assign` | Assign command |
| `inc1.freeze.request` | Request freeze |
| `inc1.freeze.release` | Release freeze |
| `inc1.inflight.disposition` | Disposition in-flight items |
| `inc1.evidence.attach` | Attach evidence |
| `inc1.notification.manage` | Manage notification |
| `inc1.recovery_plan.manage` | Manage recovery plan |
| `inc1.resume_gate.approve` | Approve resume gate |
| `inc1.incident.close` | Close incident |
| `inc1.pir.manage` | Manage post-incident review |
| `inc1.evidence.export` | Export evidence |
| `inc1.admin.configure_severity` | Configure severity matrix |

## 3. Maker-Checker Required

Required for:

1. platform-wide freeze.
2. freeze release.
3. critical incident closure.
4. resume gate approval.
5. regulatory notification submission.
6. evidence export.
7. severity matrix change.
8. post-incident review approval.

## 4. Never Allowed

No role may have:

```txt
inc1.ledger.post
inc1.balance.edit
inc1.source.modify
inc1.audit.delete
inc1.rec.break.clear
inc1.bypass_resume_gate
inc1.bypass_freeze
inc1.exchange_feature.enable
```

## 5. SoD Rules

1. Incident creator cannot solely close critical incident.
2. Freeze requester cannot solely approve release.
3. Evidence exporter cannot solely approve own export.
4. Recovery plan author cannot solely approve resume gate.
5. Security incident involving privileged user requires independent approver.
