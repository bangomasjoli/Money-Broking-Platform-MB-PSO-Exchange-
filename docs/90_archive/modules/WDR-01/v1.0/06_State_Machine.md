# WDR-01 Withdrawal / Payout Execution Rail
## 06 State Machine

## 1. Payout Execution State

```mermaid
stateDiagram-v2
  [*] --> created
  created --> bundle_validated
  bundle_validated --> submitted
  submitted --> acknowledged
  submitted --> reconcile_required
  acknowledged --> processing
  processing --> final
  processing --> failed
  processing --> returned
  processing --> reversed
  processing --> reconcile_required
  submitted --> cancelled
  acknowledged --> cancelled
```

## 2. Decision Bundle State

```mermaid
stateDiagram-v2
  [*] --> pending_validation
  pending_validation --> valid
  pending_validation --> invalid
  pending_validation --> stale
  pending_validation --> revoked
  pending_validation --> mismatch
```

## 3. Provider Instruction State

```mermaid
stateDiagram-v2
  [*] --> built
  built --> submitted
  submitted --> acknowledged
  submitted --> unknown
  acknowledged --> processing
  processing --> final
  processing --> failed
  processing --> returned
  processing --> reversed
```

## 4. Query-Back State

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> queried
  queried --> terminal
  queried --> escalated
```

## 5. Cancellation State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> accepted
  requested --> rejected
  requested --> too_late
  accepted --> executed_late
```

## 6. Return / Reversal Case State

```mermaid
stateDiagram-v2
  [*] --> open
  open --> notified_led
  notified_led --> in_review
  in_review --> resolved
  in_review --> escalated
```
