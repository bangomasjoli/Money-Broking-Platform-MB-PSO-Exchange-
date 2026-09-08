# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 06 State Machine

## 1. Screening Case State

```mermaid
stateDiagram-v2
  [*] --> open
  open --> screening
  screening --> review
  screening --> completed
  screening --> escalated
  review --> completed
  review --> escalated
  escalated --> completed
  completed --> stale
  stale --> screening
  completed --> closed
```

## 2. Match Candidate State

```mermaid
stateDiagram-v2
  [*] --> possible
  possible --> false_positive
  possible --> true_hit
  possible --> inconclusive
  inconclusive --> possible
```

## 3. AML Outcome State

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> clear
  pending --> hit
  pending --> review_required
  clear --> stale
  stale --> pending
  review_required --> clear
  review_required --> hit
```

## 4. Rescreening State

```mermaid
stateDiagram-v2
  [*] --> running
  running --> completed
  running --> failed
```

## 5. STR Case State

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> review
  review --> approved_to_file
  review --> not_file
  approved_to_file --> closed
  not_file --> closed
```
