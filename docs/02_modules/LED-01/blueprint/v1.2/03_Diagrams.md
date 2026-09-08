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

---

## 6. Atomic Reservation

```mermaid
flowchart TD
  A[Hold Request] --> B[Lock/Version Live Balance]
  B --> C{Available >= Amount?}
  C -->|No| D[Reject]
  C -->|Yes| E[Insert Hold + Increment Version]
  E --> F[Commit Atomically]
```

---

## 7. Two-Leg DvP

```mermaid
flowchart TD
  A[DvP Settlement Group] --> B[Deliver Leg]
  A --> C[Receive Leg]
  B --> D{Both Conditions Met?}
  C --> D
  D -->|Yes| E[Atomic Settlement Journal]
  D -->|One Leg Pending| F[In-Flight Suspense]
  D -->|One Leg Fails| G[Compensating Unwind]
```

---

## 8. Preventive Safeguarding

```mermaid
flowchart TD
  A[Movement Request] --> B[Free / Encumbered Backing Check]
  B --> C{Confirmed Free Backing Available?}
  C -->|No| D[Block + Freeze]
  C -->|Yes| E[Encumber / Reserve Backing]
  E --> F[Post / Continue]
```

---

## 9. Journal Hash Chain

```mermaid
flowchart TD
  A[Prior Journal Hash] --> B[New Journal + Lines + Control Refs]
  B --> C[Compute Journal Hash]
  C --> D[Append Sealed Journal]
  D --> E[External Anchor Periodically]
```

---

## 10. Conversion Residual

```mermaid
flowchart TD
  A[Conversion Event] --> B[Linked A-Out Leg]
  A --> C[Linked B-In Leg]
  B --> D[Round to Sub-Unit]
  C --> D
  D --> E[Residual Account Policy]
  E --> F{AIX Net Position Zero?}
  F -->|No| G[Block / Exception]
  F -->|Yes| H[Post]
```
