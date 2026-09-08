# DEP-01 Deposit Execution / Inbound Receipt
## 03 Diagrams

## 1. Deposit Intent to Credit Evaluation

```mermaid
flowchart TD
  A[Client Deposit Intent] --> B[Deposit Reference / Instruction]
  B --> C[External Receipt]
  C --> D[Authenticate + Deduplicate]
  D --> E[Match Client / Intent]
  E --> F[WLT Source Screening]
  F --> G[AML Gate]
  G --> H[Confirmation Threshold]
  H --> I[LED Credit Evaluation]
  I --> J[LED Credit or Hold]
```

## 2. Mis-Attribution Guard

```mermaid
flowchart TD
  A[Inbound Receipt] --> B{Single Confident Match?}
  B -->|No Match| C[Unmatched Queue]
  B -->|Multiple Matches| D[Quarantine]
  B -->|One Match| E[Pending Screening]
  C --> F[Manual Review]
  D --> F
```

## 3. Source Screening

```mermaid
sequenceDiagram
  participant DEP
  participant WLT
  participant AML
  participant LED

  DEP->>WLT: Inbound source metadata
  WLT->>AML: Source / counterparty screening where required
  AML-->>WLT: Clear / hold / hit
  WLT-->>DEP: Source decision
  DEP->>LED: Update pending deposit status
```

## 4. Reversal / Recall

```mermaid
flowchart TD
  A[Reorg / Recall Event] --> B[Authenticate]
  B --> C[Match Original Deposit]
  C --> D[Notify LED Clawback]
  D --> E[Update DEP Status]
  E --> F[Audit + Reconcile]
```
