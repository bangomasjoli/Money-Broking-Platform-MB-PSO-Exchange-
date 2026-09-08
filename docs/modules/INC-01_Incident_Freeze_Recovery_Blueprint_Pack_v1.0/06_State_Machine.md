# INC-01 Incident / Freeze / Recovery
## 06 State Machine

## 1. Incident State

```mermaid
stateDiagram-v2
  [*] --> open
  open --> triage
  triage --> frozen
  triage --> investigating
  frozen --> investigating
  investigating --> recovering
  recovering --> resume_pending
  resume_pending --> resolved
  resolved --> closed
```

## 2. Freeze Order State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> propagating
  propagating --> active
  propagating --> partial
  propagating --> failed
  active --> release_pending
  release_pending --> released
```

## 3. In-Flight Item State

```mermaid
stateDiagram-v2
  [*] --> identified
  identified --> classified
  classified --> dispositioned
  dispositioned --> monitored
  dispositioned --> exception
  monitored --> resolved
  exception --> resolved
```

## 4. Recovery Plan State

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> approved
  approved --> executing
  executing --> validated
  executing --> rejected
```

## 5. Resume Gate State

```mermaid
stateDiagram-v2
  [*] --> blocked
  blocked --> approved
  approved --> released
```

## 6. Notification Obligation State

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> review
  review --> approved
  approved --> submitted
  submitted --> acknowledged
  draft --> not_required
  review --> not_required
  approved --> late
```
