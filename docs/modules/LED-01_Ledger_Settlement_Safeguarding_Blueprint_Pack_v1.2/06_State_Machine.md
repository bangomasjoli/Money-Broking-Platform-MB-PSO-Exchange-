# LED-01 Ledger / Settlement / Safeguarding
## 06 State Machine

## 1. Journal State

```mermaid
stateDiagram-v2
  [*] --> draft_validation
  draft_validation --> posted
  draft_validation --> rejected
  posted --> reversed
```

## 2. Deposit State

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> confirmed
  pending --> quarantined
  confirmed --> credited
  credited --> clawback_required
  clawback_required --> reversed
  clawback_required --> shortfall_exception
  quarantined --> confirmed
  quarantined --> rejected
```

## 3. Hold State

```mermaid
stateDiagram-v2
  [*] --> active
  active --> consumed
  active --> released
  active --> expired
  active --> cancelled
```

## 4. Settlement State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> held
  held --> instructed
  instructed --> confirmed
  instructed --> failed
  confirmed --> posted
  failed --> released
```

## 5. Reconciliation Break State

```mermaid
stateDiagram-v2
  [*] --> open
  open --> in_review
  in_review --> resolved
  in_review --> escalated
```

## 6. Freeze State

```mermaid
stateDiagram-v2
  [*] --> active
  active --> released
```

## 7. Atomic Reservation State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> locked_or_version_checked
  locked_or_version_checked --> committed
  locked_or_version_checked --> rejected
  locked_or_version_checked --> conflict
```

## 8. DvP Settlement Group State

```mermaid
stateDiagram-v2
  [*] --> created
  created --> held
  held --> legs_instructed
  legs_instructed --> one_leg_settled_other_pending
  legs_instructed --> settled
  one_leg_settled_other_pending --> settled
  one_leg_settled_other_pending --> unwind_required
  unwind_required --> unwound
  legs_instructed --> failed
```

## 9. Backing Encumbrance State

```mermaid
stateDiagram-v2
  [*] --> free
  free --> encumbered
  encumbered --> consumed
  encumbered --> released
```

## 10. Clawback State

```mermaid
stateDiagram-v2
  [*] --> open
  open --> reversed
  open --> shortfall
  shortfall --> escalated
  reversed --> closed
  escalated --> closed
```

## 11. Journal Chain Verification State

```mermaid
stateDiagram-v2
  [*] --> scheduled
  scheduled --> verified
  scheduled --> mismatch
  mismatch --> frozen
  mismatch --> escalated
```
