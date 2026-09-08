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
