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
