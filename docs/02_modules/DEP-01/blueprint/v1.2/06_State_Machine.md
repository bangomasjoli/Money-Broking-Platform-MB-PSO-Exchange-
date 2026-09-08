# DEP-01 Deposit Execution / Inbound Receipt
## 06 State Machine

## 1. Deposit Intent State

```mermaid
stateDiagram-v2
  [*] --> active
  active --> expired
  active --> matched
  active --> cancelled
```

## 2. Receipt State

```mermaid
stateDiagram-v2
  [*] --> received
  received --> authenticated
  received --> rejected
  authenticated --> matched
  authenticated --> unmatched
  authenticated --> ambiguous
  matched --> pending_screening
  pending_screening --> confirmed
  pending_screening --> quarantined
  confirmed --> led_pending
  led_pending --> credit_requested
  credit_requested --> credited
  credit_requested --> rejected
  credited --> recalled
  credited --> reorged
```

## 3. Quarantine Case State

```mermaid
stateDiagram-v2
  [*] --> open
  open --> in_review
  in_review --> resolved
  in_review --> escalated
  in_review --> rejected
```

## 4. Reversal State

```mermaid
stateDiagram-v2
  [*] --> received
  received --> notified_led
  notified_led --> acknowledged
  acknowledged --> resolved
```

## 5. LED Handoff State

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> sent
  sent --> acknowledged
  sent --> rejected
  rejected --> deadlettered
```

## 6. Credit Bundle State

```mermaid
stateDiagram-v2
  [*] --> pending_validation
  pending_validation --> valid
  pending_validation --> stale
  pending_validation --> revoked
  pending_validation --> mismatch
  stale --> quarantined
  revoked --> quarantined
  mismatch --> quarantined
```

## 7. SoF Review State

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> approved
  pending --> rejected
  pending --> escalated
```

## 8. Return Case State

```mermaid
stateDiagram-v2
  [*] --> open
  open --> in_review
  in_review --> permitted
  in_review --> prohibited
  permitted --> sent_via_payout_controls
  sent_via_payout_controls --> closed
  prohibited --> closed
```
