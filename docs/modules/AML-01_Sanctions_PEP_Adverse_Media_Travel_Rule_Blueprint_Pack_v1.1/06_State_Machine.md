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

## 6. Pre-Transaction Screening State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> clear
  requested --> hold
  requested --> block
  requested --> review_required
  clear --> expired
```

## 7. List Update State

```mermaid
stateDiagram-v2
  [*] --> received
  received --> interim_block_active
  interim_block_active --> rescreening
  rescreening --> completed
  rescreening --> sla_breached
  completed --> released
  sla_breached --> escalated
```

## 8. STR Clock State

```mermaid
stateDiagram-v2
  [*] --> suspicion_formed
  suspicion_formed --> mlro_review_due
  mlro_review_due --> filing_due
  filing_due --> filed
  filing_due --> not_file_decision
  filing_due --> deadline_breached
```

## 9. False Positive Attestation State

```mermaid
stateDiagram-v2
  [*] --> active
  active --> reattestation_due
  reattestation_due --> active
  reattestation_due --> expired
  active --> revoked
```

## 10. De-Listing Review State

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> approved
  pending --> rejected
  approved --> unblock_published
```
