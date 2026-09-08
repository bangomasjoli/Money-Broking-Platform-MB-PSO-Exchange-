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

## 5. Credit-Request Bundle Revalidation

```mermaid
flowchart TD
  A[Deposit Ready] --> B[Build Bundle]
  B --> C[Revalidate WLT]
  C --> D[Revalidate AML]
  D --> E[Check Finality]
  E --> F[Check Client Eligibility]
  F --> G{Same Correlation/Client/Amount/Asset and Fresh?}
  G -->|No| H[Quarantine]
  G -->|Yes| I[Request LED Credit Evaluation]
```

## 6. Source-of-Funds Binding

```mermaid
flowchart TD
  A[Inbound Source] --> B{Own KYC-Verified Source?}
  B -->|Yes| C[Proceed to Screening]
  B -->|No| D{Approved Third Party?}
  D -->|Yes| E[SoF Review]
  D -->|No| F[Quarantine]
```

## 7. Finality Model

```mermaid
flowchart TD
  A[Receipt Confirmation] --> B{Source Type}
  B -->|Crypto| C[Reorg Depth + Multi-Source Corroboration]
  B -->|Fiat| D[Settlement + Return Window]
  B -->|Custodian| E[Custodian Finality + Independent Truth]
  C --> F{Economic Finality?}
  D --> F
  E --> F
  F -->|No| G[Pending/Hold]
  F -->|Yes| H[Bundle Revalidation]
```
