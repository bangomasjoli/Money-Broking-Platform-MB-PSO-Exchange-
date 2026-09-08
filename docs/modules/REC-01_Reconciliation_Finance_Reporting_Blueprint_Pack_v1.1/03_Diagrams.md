# REC-01 Reconciliation / Finance Reporting
## 03 Diagrams

## 1. Reconciliation Orchestration

```mermaid
flowchart TD
  A[Schedule / Manual Trigger] --> B[Create Run]
  B --> C[Snapshot Sources]
  C --> D[Hash Inputs]
  D --> E[Run Rules]
  E --> F{Breaks?}
  F -->|Yes| G[Create Breaks]
  F -->|No| H[Run Clean]
  G --> I[Audit + Dashboard]
  H --> I
```

## 2. Cross-Module Reconciliation Map

```mermaid
flowchart TD
  LED[LED-01] --> REC[REC-01]
  DEP[DEP-01] --> REC
  WDR[WDR-01] --> REC
  TRD[TRD-01] --> REC
  WLT[WLT-01] --> REC
  AML[AML-01] --> REC
  SEC[SEC-01] --> REC
  E2E[E2E-01] --> REC
  REC --> BRK[Break Management]
  REC --> RPT[Finance Reports]
```

## 3. Break Lifecycle

```mermaid
stateDiagram-v2
  [*] --> open
  open --> assigned
  assigned --> investigating
  investigating --> remediation_pending
  remediation_pending --> closure_requested
  closure_requested --> approved_closed
  closure_requested --> rejected
  investigating --> escalated
```

## 4. Daily Close

```mermaid
flowchart TD
  A[Run Required Suite] --> B[Check Safeguarding]
  B --> C[Check Open Breaks]
  C --> D{Critical Breaks?}
  D -->|Yes| E[Block Close / Escalate]
  D -->|No| F[Finance Sign-Off]
  F --> G[Close Pack]
```

## 5. Population Coverage Proof

```mermaid
flowchart TD
  A[SEC Expected Manifest] --> D[Population Coverage Engine]
  B[E2E Correlation Registry] --> D
  C[Module Sequences] --> D
  D --> E{All Correlations / Sequences Accounted?}
  E -->|No| F[Coverage Break]
  E -->|Yes| G[Full Population Proven]
```

## 6. Consistent As-Of Snapshot

```mermaid
flowchart TD
  A[LED/E2E Sequence Anchor] --> B[DEP Snapshot]
  A --> C[WDR Snapshot]
  A --> D[TRD Snapshot]
  A --> E[LED Snapshot]
  B --> F[REC Run]
  C --> F
  D --> F
  E --> F
```

## 7. Closed-Loop Break Remediation

```mermaid
flowchart TD
  A[Break Open] --> B[Remediation Evidence]
  B --> C[Targeted Re-Reconciliation]
  C --> D{Break Gone?}
  D -->|No| E[Remain Open / Escalate]
  D -->|Yes| F[Maker-Checker Closure]
  F --> G[Recurrence Monitor]
```
