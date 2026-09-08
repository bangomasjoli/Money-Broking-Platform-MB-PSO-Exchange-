# FND-01 Platform Foundation  
## 13 Reconciliation Design

## 1. Purpose

FND-01 does not perform financial reconciliation.

However, it provides foundation reconciliation patterns for platform consistency.

This includes:

1. Runtime configuration reconciliation.
2. Module registry reconciliation.
3. Release artifact reconciliation.
4. Deployment smoke evidence reconciliation.
5. Outbox status reconciliation.
6. Time-source reconciliation.
7. Environment drift reconciliation.
8. Scheduler expected-run reconciliation.
9. Job queue dead-letter reconciliation.
10. Audit/outbox transaction-coupling reconciliation.
11. Async correlation continuity reconciliation.
12. DB grant/RLS baseline reconciliation.

---

## 2. Foundation Reconciliation Types

| Reconciliation | Source A | Source B | Purpose |
|---|---|---|---|
| Release artifact | Build registry | Runtime version endpoint | Prove deployed artifact matches approved release |
| Module registry | Expected module manifest | Runtime module registry | Detect missing/extra module |
| Feature/licence lock | Approved baseline | Runtime config | Detect unsafe flag/lock state |
| Environment config | Approved baseline | Runtime config | Detect drift |
| Outbox status | Outbox table | Monitoring alerts | Detect stuck/dead events |
| Smoke evidence | Smoke run | Evidence repository | Prove deployment checks executed |
| Time source | Server UTC | NTP/drift monitor | Detect clock drift |
| Scheduler runs | scheduled_job | job_run | Detect missed runs |
| Job queue | queued jobs | worker outcomes | Detect stuck/dead-letter jobs |
| DB isolation | approved grants/RLS baseline | runtime grants/RLS config | Detect unsafe DB access |
| Async correlation | source request/event | job/outbox/audit event | Detect trace break |

---

## 3. Release Artifact Reconciliation

### Steps

1. Retrieve approved release ID.
2. Retrieve approved artifact hash.
3. Call `/foundation/version`.
4. Compare runtime artifact hash.
5. Store result.
6. Block deployment if mismatch.

### Expected Result

```txt
approved_artifact_hash == runtime_artifact_hash
```

---

## 4. Module Registry Reconciliation

### Steps

1. Load expected module manifest.
2. Load runtime module registry.
3. Compare module code/version/status.
4. Detect unexpected active module.
5. Detect missing required module.
6. Detect active future-locked Exchange module.
7. Alert/block if Critical.

Critical mismatch:

1. Exchange module active.
2. Matching engine active.
3. Unknown module active.
4. Required foundation module missing.

---

## 5. Config Drift Reconciliation

### Steps

1. Read approved config baseline.
2. Read runtime config reference/hash.
3. Compare.
4. Classify drift.
5. Create drift result.
6. Alert if Critical.

Critical drift:

1. Licence lock disabled.
2. Exchange flag enabled.
3. Audit/outbox disabled.
4. Monitoring disabled.
5. Production points to sandbox vendor.
6. Data residency mismatch.

---

## 6. Outbox Reconciliation

### Steps

1. Query pending outbox events.
2. Query retry and dead-letter events.
3. Compare against alert thresholds.
4. Generate health result.
5. Alert on Critical event stuck/dead-letter.

---

## 7. Smoke Evidence Reconciliation

### Steps

1. Confirm smoke test run exists for release.
2. Confirm all Critical checks passed.
3. Confirm evidence stored.
4. Confirm no unresolved failed smoke check.
5. Link evidence to deployment record.

---

## 8. Tests

1. Artifact mismatch detected.
2. Unexpected active module detected.
3. Exchange module active detected.
4. Feature flag drift detected.
5. Outbox dead-letter detected.
6. Smoke evidence missing detected.
7. Time drift detected.


---

## 9. Scheduler Run Reconciliation

### Steps

1. Read `foundation.scheduled_job`.
2. Calculate expected run windows.
3. Read `foundation.job_run`.
4. Identify missing runs.
5. Compare lateness with `max_lateness_minutes`.
6. Alert on missed Critical/High runs.
7. Store evidence.

---

## 10. Job Queue Reconciliation

### Steps

1. Read queued/running/retry/dead-letter jobs.
2. Identify stuck claimed jobs.
3. Identify retry threshold breaches.
4. Identify dead-letter jobs.
5. Alert based on criticality.
6. Record remediation evidence.

---

## 11. DB Isolation Reconciliation

### Steps

1. Load approved module DB grants.
2. Inspect runtime DB grants.
3. Compare allowed schema access.
4. Verify no cross-schema broad grants.
5. Verify RLS enabled for client-owned tables where required.
6. Alert on deviation.

---

## 12. Async Correlation Reconciliation

### Steps

1. Select source request/event.
2. Trace related job/outbox/audit events.
3. Verify same correlation lineage.
4. Identify missing causation/source references.
5. Alert if Critical async flow loses correlation.
