# CFG-01 Feature Flag / Licence Lock  
## 03 Diagrams

## 1. Runtime Feature Decision

```mermaid
sequenceDiagram
  participant MOD as Downstream Module
  participant CFG as CFG-01
  participant IAM2 as IAM-02
  participant SEC as SEC-01

  MOD->>CFG: Check feature/action
  CFG->>CFG: Load registry + licence profile
  CFG->>CFG: Evaluate prohibited/licence/client/env/version
  CFG->>SEC: Audit sensitive decision
  CFG-->>MOD: allow/deny + decision token
```

---

## 2. Feature Change

```mermaid
flowchart TD
  A[Feature Change Request] --> B[IAM-02 Permission Guard]
  B --> C[Licence + Prohibited Check]
  C --> D{Allowed to Change?}
  D -->|No| E[Block + Audit]
  D -->|Yes| F[IAM-02 Approval + Step-Up]
  F --> G[Update Feature Version]
  G --> H[Invalidate Cache]
  H --> I[SEC-01 Audit]
```

---

## 3. Licence Profile Change

```mermaid
flowchart TD
  A[Licence Evidence Received] --> B[Create Licence Profile Change]
  B --> C[Compliance Approval]
  C --> D[Management/Board Approval if High Risk]
  D --> E[New Licence Profile Version]
  E --> F[Recalculate Feature Locks]
  F --> G[Invalidate Caches]
  G --> H[Reconciliation]
```

---

## 4. Kill-Switch

```mermaid
flowchart TD
  A[Risk Trigger] --> B[Authorised Kill-Switch]
  B --> C[Disable Feature]
  C --> D[Invalidate Cache]
  D --> E[SEC-01 Critical Audit]
  E --> F[Notify / Monitor]
  F --> G[Post-Action Review]
```

---

## 5. Deployment Gate

```mermaid
flowchart TD
  A[Deployment Pipeline] --> B[CFG-01 Deployment Gate]
  B --> C{Registered?}
  C -->|No| X[Block]
  C -->|Yes| D{Licence Allows?}
  D -->|No| X
  D -->|Yes| E{Approval + Tests + Rollback?}
  E -->|No| X
  E -->|Yes| F[Deployment Gate Pass]
```

---

## 6. Interim Handoff

```mermaid
flowchart TD
  A[IAM-02 Interim Lock List] --> D[CFG-01 Reconciler]
  B[SEC-01 Interim Monitoring Assumptions] --> D
  C[Master Doc 00 Scope] --> D
  D --> E{Mismatch?}
  E -->|Yes| F[Critical Finding / Block]
  E -->|No| G[Handoff Complete]
```
