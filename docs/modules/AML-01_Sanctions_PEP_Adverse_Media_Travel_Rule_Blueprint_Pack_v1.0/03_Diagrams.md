# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 03 Diagrams

## 1. Screening Flow

```mermaid
flowchart TD
  A[CLT/KYC Handoff] --> B[Screening Case]
  B --> C[Sanctions / PEP / Adverse Media / Watchlist]
  C --> D{Match?}
  D -->|No| E[Outcome Clear]
  D -->|Possible| F[Analyst Review]
  D -->|True Hit| G[Escalation]
  F --> H{Decision}
  H -->|False Positive| E
  H -->|True Hit| G
  G --> I[CLT Restriction + KYC EDD Trigger]
  E --> J[Publish Outcome to CLT]
```

---

## 2. KYC / AML Boundary

```mermaid
flowchart TD
  A[KYC Pass] --> B[Identity / Entity Verified]
  C[AML Clear] --> D[CLT Combined CDD Gate]
  B --> D
  D --> E{Both OK?}
  E -->|Yes| F[Onboarding May Proceed]
  E -->|No| G[Hold / Reject / Review]
```

---

## 3. True Hit Escalation

```mermaid
flowchart TD
  A[True Hit] --> B[Restrict / Suspend via CLT]
  A --> C[KYC EDD Trigger]
  A --> D[Compliance / MLRO Review]
  D --> E[STR / Suspicion Case]
  E --> F[Tipping-Off Guard]
  F --> G[SEC-01 Audit]
```

---

## 4. Ongoing Rescreening

```mermaid
flowchart TD
  A[List Update / Profile Change / Periodic] --> B[Affected Parties]
  B --> C[Rescreen]
  C --> D{New Match?}
  D -->|No| E[Outcome Remains Clear]
  D -->|Yes| F[Review / Hit Workflow]
```

---

## 5. Travel Rule Screening

```mermaid
flowchart TD
  A[Transfer Party Data] --> B{Required Data Complete?}
  B -->|No| C[Missing Data Outcome]
  B -->|Yes| D[Screen Originator / Beneficiary / VASP]
  D --> E{Hit?}
  E -->|Yes| F[Compliance Review]
  E -->|No| G[Travel Rule Screening Clear]
```
