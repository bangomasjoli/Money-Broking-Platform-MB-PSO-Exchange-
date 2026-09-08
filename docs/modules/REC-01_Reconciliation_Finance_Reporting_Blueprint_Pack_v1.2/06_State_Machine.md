# REC-01 Reconciliation / Finance Reporting
## 06 State Machine

## 1. Reconciliation Run State

```mermaid
stateDiagram-v2
  [*] --> created
  created --> running
  running --> completed
  running --> failed
  completed --> finalised
```

## 2. Break State

```mermaid
stateDiagram-v2
  [*] --> open
  open --> assigned
  assigned --> investigating
  investigating --> remediation_pending
  remediation_pending --> closure_requested
  closure_requested --> closed
  closure_requested --> rejected
  investigating --> escalated
```

## 3. Evidence Pack State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> approved
  requested --> rejected
  approved --> generated
  generated --> revoked
```

## 4. Daily Close State

```mermaid
stateDiagram-v2
  [*] --> open
  open --> blocked
  open --> signed_off
  blocked --> open
  signed_off --> reopened
```

## 5. Report State

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> final
  final --> revoked
```

## 6. Population Coverage State

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> pass
  pending --> fail
  pending --> partial
  fail --> break_created
```

## 7. In-Flight Reconciling Item State

```mermaid
stateDiagram-v2
  [*] --> open
  open --> carried_forward
  carried_forward --> closed
  carried_forward --> converted_to_break
```

## 8. Policy Version State

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> approved
  approved --> retired
```

## 9. Report Restatement State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> approved
  approved --> restated
  requested --> rejected
```

## 10. Regulatory Obligation State

```mermaid
stateDiagram-v2
  [*] --> scheduled
  scheduled --> in_progress
  in_progress --> ready
  ready --> submitted
  scheduled --> late
  in_progress --> late
```
