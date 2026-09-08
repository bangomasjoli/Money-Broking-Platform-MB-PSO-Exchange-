# SEC-01 Audit Log / Security Monitoring  
## 06 State Machine

## 1. Audit Event State

```mermaid
stateDiagram-v2
  [*] --> received
  received --> validated
  received --> rejected
  validated --> sequenced
  sequenced --> hashed
  hashed --> persisted
  persisted --> sealed
  persisted --> corrected
  persisted --> archived
  rejected --> alert_created
```

## 2. Security Alert State

```mermaid
stateDiagram-v2
  [*] --> open
  open --> assigned
  assigned --> triaged
  triaged --> closed
  triaged --> escalated
  escalated --> incident_handoff
  closed --> [*]
```

## 3. Evidence Export State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> approval_required
  requested --> approved
  approval_required --> approved
  approval_required --> rejected
  approved --> generating
  generating --> ready
  ready --> downloaded
  ready --> expired
  downloaded --> expired
```

## 4. Integrity Verification State

```mermaid
stateDiagram-v2
  [*] --> scheduled
  scheduled --> running
  running --> passed
  running --> failed
  failed --> alert_created
  passed --> [*]
```

## 5. Interim Audit Handoff State

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> matched
  pending --> ingested
  pending --> missing
  pending --> failed
  missing --> critical_alert
  matched --> reconciled
  ingested --> reconciled
```


## 6. External Seal State

```mermaid
stateDiagram-v2
  [*] --> seal_created
  seal_created --> external_anchor_pending
  external_anchor_pending --> trusted_timestamped
  trusted_timestamped --> externally_anchored
  externally_anchored --> verified
  externally_anchored --> verification_failed
  verification_failed --> critical_alert
```

## 7. Expected Event State

```mermaid
stateDiagram-v2
  [*] --> expected
  expected --> matched
  expected --> late
  expected --> missing
  late --> critical_alert
  missing --> critical_alert
```

## 8. Incident Break-Glass Read State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> approved
  requested --> rejected
  approved --> active_read_only
  active_read_only --> expired
  active_read_only --> revoked
  expired --> post_review_pending
  post_review_pending --> closed
```

## 9. Restore Authority State

```mermaid
stateDiagram-v2
  [*] --> restored_pending
  restored_pending --> verifying_chain
  verifying_chain --> verifying_external_seals
  verifying_external_seals --> verifying_expected_events
  verifying_expected_events --> authoritative
  verifying_expected_events --> blocked
  blocked --> critical_alert
```
