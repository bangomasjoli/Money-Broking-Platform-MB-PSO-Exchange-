# TRD-01 Quote / Trade / LP Execution
## 03 Diagrams

## 1. Quote and Execution Flow

```mermaid
flowchart TD
  A[Client Quote Request] --> B[Eligibility + CFG Check]
  B --> C[LP Quote]
  C --> D[Client Quote + Fee Disclosure]
  D --> E{Client Accepts Before Expiry?}
  E -->|No| F[Quote Expired]
  E -->|Yes| G[LED Prefunded Hold]
  G --> H[LP Execution]
  H --> I[Fill Processing]
  I --> J[Settlement Handoff to LED]
```

---

## 2. Agency / Back-to-Back

```mermaid
flowchart TD
  A[Client] --> B[AIX Agent]
  B --> C[Approved LP]
  C --> D[LP Fill]
  D --> E[Client Fill Mirrors LP Fill]
  E --> F[LED DvP Settlement]
```

---

## 3. Prohibited Exchange Features

```mermaid
flowchart TD
  A[Client Orders] --> B{Order Book / Matching?}
  B -->|Yes| X[Prohibited]
  B -->|No| C[LP Quote / Agency Execution]
```

---

## 4. Slippage Handling

```mermaid
flowchart TD
  A[LP Fill] --> B{Within Tolerance?}
  B -->|Yes| C[Accept Fill]
  B -->|No| D[Requote / Void / Client Confirmation]
  D --> E[Release or Adjust Hold]
```

---

## 5. Settlement Handoff

```mermaid
flowchart TD
  A[Accepted Fill] --> B[Build Conversion Legs]
  B --> C[Fee Disclosure]
  C --> D[Residual Details]
  D --> E[Send to LED-01]
```
