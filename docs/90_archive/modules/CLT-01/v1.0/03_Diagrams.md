# CLT-01 Client Onboarding / Client Profile
## 03 Diagrams

## 1. Onboarding Flow

```mermaid
flowchart TD
  A[Start Application] --> B[CFG-01 Onboarding Gate]
  B --> C{Allowed Client Class?}
  C -->|No| D[Hold/Reject]
  C -->|Yes| E[Draft Application]
  E --> F[Submit]
  F --> G[KYC/KYB Handoff]
  F --> H[AML/Sanctions Handoff]
  G --> I[Review]
  H --> I
  I --> J[IAM-02 Approval]
  J --> K[Approved Profile]
```

---

## 2. Retail Lock

```mermaid
flowchart TD
  A[Client Classification] --> B{Retail?}
  B -->|Yes| C[CFG-01 Retail Default Lock]
  C --> D[Hold/Reject]
  B -->|No| E[Proceed to Eligibility]
```

---

## 3. Final Approval

```mermaid
sequenceDiagram
  participant Staff as Staff Reviewer
  participant CLT as CLT-01
  participant CFG as CFG-01
  participant IAM2 as IAM-02
  participant SEC as SEC-01

  Staff->>CLT: Request approval
  CLT->>CFG: Re-check client-class/onboarding gate
  CLT->>IAM2: Create approval
  IAM2-->>CLT: approved/denied
  CLT->>SEC: Audit final decision
```

---

## 4. Mandate Setup

```mermaid
flowchart TD
  A[Client / Staff Requests Mandate] --> B[Verify Authority Evidence]
  B --> C[IAM-02 Permission]
  C --> D[Configure Users + Thresholds]
  D --> E[Client-Side Dual Authorisation]
  E --> F[SEC-01 Audit]
```

---

## 5. Downstream Status Control

```mermaid
flowchart TD
  A[Downstream Module Request] --> B[Read Client Status]
  B --> C{Client Active + Eligible?}
  C -->|No| D[Deny]
  C -->|Yes| E[Continue downstream checks]
```
