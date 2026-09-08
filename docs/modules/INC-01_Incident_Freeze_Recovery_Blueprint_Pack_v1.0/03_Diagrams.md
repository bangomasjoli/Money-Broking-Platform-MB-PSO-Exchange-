# INC-01 Incident / Freeze / Recovery
## 03 Diagrams

## 1. Incident Response Flow

```mermaid
flowchart TD
  A[Incident Trigger] --> B[Intake]
  B --> C[Severity Classification]
  C --> D{Freeze Required?}
  D -->|Yes| E[Freeze Propagation]
  D -->|No| F[Monitor / Investigate]
  E --> G[Money-Flow Quiescence]
  G --> H[Recovery Plan]
  H --> I[Resume Gate]
  I --> J[Closure + PIR]
```

## 2. Freeze Propagation

```mermaid
flowchart TD
  INC[INC-01] --> CFG[CFG-01]
  INC --> IAM[IAM-01/IAM-02]
  INC --> CLT[CLT-01]
  INC --> AML[AML-01]
  INC --> WLT[WLT-01]
  INC --> LED[LED-01]
  INC --> DEP[DEP-01]
  INC --> WDR[WDR-01]
  INC --> TRD[TRD-01]
  INC --> REC[REC-01]
```

## 3. In-Flight Money Flow Stages

```mermaid
stateDiagram-v2
  [*] --> before_hold
  before_hold --> hold_or_reserve
  hold_or_reserve --> external_sent
  external_sent --> external_final
  external_final --> ledger_settled
  external_sent --> return_or_reversal
```

## 4. Resume Gate

```mermaid
flowchart TD
  A[Recovery Plan] --> B[Source Safe State]
  B --> C[REC Validation]
  C --> D[SEC Evidence]
  D --> E[Approvals]
  E --> F[Release Freeze]
```
