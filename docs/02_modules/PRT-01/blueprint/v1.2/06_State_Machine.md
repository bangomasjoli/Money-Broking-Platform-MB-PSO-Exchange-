# PRT-01 Client / Staff / Admin Portal Workflows
## 06 State Machine

## 1. Portal Action State

```mermaid
stateDiagram-v2
  [*] --> created
  created --> submitted
  submitted --> accepted
  submitted --> rejected
  submitted --> failed
```

## 2. Export State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> approved
  requested --> rejected
  approved --> generated
  generated --> downloaded
```

## 3. Message Template State

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> approved
  approved --> retired
```

## 4. Display Status State

```mermaid
stateDiagram-v2
  [*] --> fresh
  fresh --> stale
  stale --> refreshed
```

## 5. Display Truth State

```mermaid
stateDiagram-v2
  [*] --> unknown
  unknown --> source_verified
  source_verified --> overlay_checked
  overlay_checked --> render_allowed
  overlay_checked --> suppress_positive
  unknown --> degraded_unavailable
```

## 6. Invalidation Subscription State

```mermaid
stateDiagram-v2
  [*] --> connected
  connected --> stale
  stale --> revalidating
  revalidating --> connected
  stale --> fail_closed
```

## 7. Download Token State

```mermaid
stateDiagram-v2
  [*] --> issued
  issued --> used
  issued --> expired
  issued --> revoked
```

## 8. Upload Intake State

```mermaid
stateDiagram-v2
  [*] --> quarantined
  quarantined --> scanning
  scanning --> accepted
  scanning --> rejected
```

## 9. Notification State

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> reconciled
  reconciled --> sent
  reconciled --> suppressed
  reconciled --> superseded
```
