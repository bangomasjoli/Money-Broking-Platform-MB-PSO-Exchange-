# LED-01 Ledger / Settlement / Safeguarding
## 03 Diagrams

## 1. Double-Entry Posting

```mermaid
flowchart TD
  A[Posting Request] --> B[Validate Journal Lines]
  B --> C{Debits = Credits?}
  C -->|No| D[Reject]
  C -->|Yes| E[Idempotency Check]
  E --> F[Append Immutable Journal]
  F --> G[Derived Balance Update]
```

---

## 2. Deposit Credit

```mermaid
flowchart TD
  A[Inbound Receipt] --> B[Pending Deposit]
  B --> C[Source Matched + WLT Clear]
  C --> D[Receipt Confirmed]
  D --> E[Safeguarding Check]
  E --> F[Credit Available Balance]
```

---

## 3. Withdrawal / Payout

```mermaid
flowchart TD
  A[Payout Request] --> B[Available Balance]
  B --> C[WLT Verify-And-Consume]
  C --> D[AML Gate]
  D --> E[Reserve/Hold]
  E --> F[Execution]
  F --> G[Settlement Journal]
```

---

## 4. Prefunded Hold / LP Execution

```mermaid
flowchart TD
  A[Trade Request] --> B[Create Prefunded Hold]
  B --> C[LP Execution]
  C --> D{Execution Outcome}
  D -->|Filled| E[DvP Settlement]
  D -->|Failed| F[Release Hold]
  D -->|Slippage| G[Void/Requote/Release]
```

---

## 5. Safeguarding Invariant

```mermaid
flowchart TD
  A[Client Liabilities] --> C{Liabilities <= Safeguarded Assets?}
  B[Bank/Custodian/Chain Assets] --> C
  C -->|Yes| D[OK]
  C -->|No| E[Freeze + Critical Exception]
```
