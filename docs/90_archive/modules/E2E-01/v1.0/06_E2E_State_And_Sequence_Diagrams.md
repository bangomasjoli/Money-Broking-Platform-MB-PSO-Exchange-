# E2E-01 Cross-Module End-to-End Fund-Flow Review
## 06 E2E State And Sequence Diagrams

## 1. Global Money Movement State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> eligibility_checked
  eligibility_checked --> controls_cleared
  controls_cleared --> reserved_or_held
  reserved_or_held --> execution_instructed
  execution_instructed --> external_confirmed
  external_confirmed --> ledger_posted
  ledger_posted --> reconciled
  requested --> rejected
  controls_cleared --> held_for_review
  execution_instructed --> failed
  failed --> exception
```

## 2. Cross-Module Fail-Closed State

```mermaid
stateDiagram-v2
  [*] --> action_requested
  action_requested --> decision_check
  decision_check --> allow
  decision_check --> deny
  decision_check --> hold
  decision_check --> stale
  stale --> deny
  hold --> review
```

## 3. End-to-End Trade State Across TRD and LED

```mermaid
flowchart TD
  A[Quote Requested] --> B[LP Quote Evidence]
  B --> C[Client Quote]
  C --> D[Client Accepts]
  D --> E[LED Prefunded Hold]
  E --> F[LP Execution]
  F --> G[External LP Fill]
  G --> H[Fill Conservation]
  H --> I[LED Two-Leg DvP]
  I --> J[LED Settlement Outcome]
  J --> K[Client Confirmation]
```

## 4. End-to-End Deposit State Across WLT and LED

```mermaid
flowchart TD
  A[Inbound Receipt] --> B[Source Screening]
  B --> C{Source Clear?}
  C -->|No| D[Quarantine]
  C -->|Yes| E[Receipt Confirmed]
  E --> F[Free Backing Encumbrance]
  F --> G[Ledger Credit]
  G --> H[Reconciliation]
```

## 5. End-to-End Withdrawal State Across WLT and LED

```mermaid
flowchart TD
  A[Withdrawal Request] --> B[Destination Verify-and-Consume]
  B --> C[AML Gate]
  C --> D[Atomic Reserve]
  D --> E[Execution Instruction]
  E --> F[External Confirmation]
  F --> G[Ledger Settlement]
```
