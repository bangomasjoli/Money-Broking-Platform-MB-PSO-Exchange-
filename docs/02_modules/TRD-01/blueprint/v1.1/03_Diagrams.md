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

---

## 6. Agency Execution Window

```mermaid
flowchart TD
  A[Client Accepts Quote] --> B{Execution Model}
  B -->|Contingent| C[Seek LP Fill]
  C --> D{LP Fill?}
  D -->|Yes| E[Client Fill Mirrors LP Fill]
  D -->|No| F[Void / No Final Client Fill]
  B -->|Firm Atomic| G[Atomic Accept + LP Execute]
  G --> H{Same Firm LP Quote Executed?}
  H -->|Yes| E
  H -->|No| F
```

---

## 7. Fill Conservation

```mermaid
flowchart TD
  A[External LP Fill(s)] --> B[Quantity Sum / VWAP]
  B --> C{Client Fill Conserved?}
  C -->|No| D[Block]
  C -->|Yes| E[Create Client Fill]
  E --> F[LED Settlement Handoff]
```

---

## 8. LP Timeout Resolution

```mermaid
flowchart TD
  A[LP Timeout] --> B[Trade Reconcile Required]
  B --> C[Idempotent LP Query-Back]
  C --> D{LP Terminal State?}
  D -->|Filled| E[Process Fill]
  D -->|Rejected/None| F[Void + Release Hold]
  D -->|Unknown| G[Escalate SLA]
```

---

## 9. No Internalisation

```mermaid
flowchart TD
  A[Client Fill Candidate] --> B{External Approved LP Fill ID?}
  B -->|No| C[Prohibited]
  B -->|Yes| D{LP Fill Quantity Already Used?}
  D -->|Yes| C
  D -->|No| E[Allowed Subject to Conservation]
```
