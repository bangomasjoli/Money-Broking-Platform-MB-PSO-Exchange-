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
