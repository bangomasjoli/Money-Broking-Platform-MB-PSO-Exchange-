# KYC-01 KYC / KYB Verification
## 03 Diagrams

## 1. KYC/KYB Outcome Flow

```mermaid
flowchart TD
  A[CLT-01 Handoff] --> B[KYC/KYB Case]
  B --> C[Document Checklist]
  C --> D[Identity / Entity Verification]
  D --> E[UBO / Authorised Party Verification]
  E --> F{All Required Checks Pass?}
  F -->|No| G[Fail / Remediation / EDD]
  F -->|Yes| H[CDD Outcome Pass]
  H --> I[Publish to CLT-01]
```

---

## 2. Handoff vs Outcome

```mermaid
flowchart TD
  A[CLT Handoff Received] --> B[Delivery Ack]
  B --> C[Case Created]
  C --> D[Verification Work]
  D --> E[Outcome Published]
  B -. not outcome .-> F[Cannot Approve Onboarding]
```

---

## 3. UBO Verification

```mermaid
flowchart TD
  A[Entity Case] --> B[Ownership Tree]
  B --> C[Apply UBO Threshold]
  C --> D[UBO Cases]
  D --> E{All UBOs Verified?}
  E -->|No| F[Remediation / EDD]
  E -->|Yes| G[UBO Requirement Pass]
```

---

## 4. Periodic Review

```mermaid
flowchart TD
  A[Review Due / Trigger] --> B[Set Outcome Stale]
  B --> C[Publish Stale to CLT]
  C --> D[Refresh Evidence]
  D --> E[Recompute Outcome]
  E --> F[Publish Updated Outcome]
```

---

## 5. Manual Review

```mermaid
sequenceDiagram
  participant Analyst as KYC Analyst
  participant KYC as KYC-01
  participant IAM2 as IAM-02
  participant SEC as SEC-01
  participant CLT as CLT-01

  Analyst->>KYC: Manual decision request
  KYC->>IAM2: Maker-checker approval
  IAM2-->>KYC: approved/denied
  KYC->>SEC: Audit decision
  KYC->>CLT: Publish outcome
```

---

## 6. UBO Look-Through

```mermaid
flowchart TD
  A[Entity Client] --> B[Ownership Tree]
  B --> C[Intermediate Entity / Trust / Nominee]
  C --> D[Recurse]
  D --> E{Ultimate Natural Person Found?}
  E -->|No| F[EDD or Fail]
  E -->|Yes| G[Verify UBO / Controller]
  G --> H[Aggregate Indirect Ownership]
```

---

## 7. Vendor Reliance

```mermaid
flowchart TD
  A[Vendor Result] --> B{Vendor Accredited?}
  B -->|No| X[Reject]
  B -->|Yes| C{Records Obtainable?}
  C -->|No| X
  C -->|Yes| D{Confidence / Validity OK?}
  D -->|No| E[Remediation / Manual Review]
  D -->|Yes| F[Accept Verification Component]
```

---

## 8. Evidence Store Hash Verification

```mermaid
flowchart TD
  A[Evidence Read / Outcome Use] --> B[Fetch Evidence Hash from Store]
  B --> C[Compare KYC Stored Hash]
  C --> D{Match?}
  D -->|No| E[Block + Critical Alert]
  D -->|Yes| F[Allow Scoped Use]
```

---

## 9. KYC / AML Boundary

```mermaid
flowchart TD
  A[KYC-01 Pass] --> B[Identity / Entity Verified Only]
  C[AML-01 Clear] --> D[Combined CLT CDD Decision]
  B --> D
  D --> E{KYC Pass + AML Clear?}
  E -->|Yes| F[CLT May Approve]
  E -->|No| G[Hold / Reject / Review]
```
