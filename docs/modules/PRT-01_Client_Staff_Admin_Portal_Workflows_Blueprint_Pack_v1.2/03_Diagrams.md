# PRT-01 Client / Staff / Admin Portal Workflows
## 03 Diagrams

## 1. Portal Action Control

```mermaid
flowchart TD
  A[User Action] --> B[Session + Permission Check]
  B --> C[Step-Up if Required]
  C --> D[Backend Source Module]
  D --> E[Backend Revalidation]
  E --> F{Allowed?}
  F -->|No| G[Safe Error / Audit]
  F -->|Yes| H[Source Module Outcome]
  H --> I[Truthful Portal Status]
```

## 2. Status Truth

```mermaid
flowchart TD
  LED[LED-01] --> PRT[PRT-01 Display]
  TRD[TRD-01] --> PRT
  DEP[DEP-01] --> PRT
  WDR[WDR-01] --> PRT
  REC[REC-01] --> PRT
  INC[INC-01] --> PRT
```

## 3. Export Control

```mermaid
flowchart TD
  A[Export Request] --> B[Permission]
  B --> C[Masking Policy]
  C --> D{Sensitive?}
  D -->|Yes| E[Maker-Checker]
  D -->|No| F[Generate]
  E --> F
  F --> G[Audit Download]
```

## 4. Display Non-Regression

```mermaid
flowchart TD
  A[Display Request] --> B[Object Authorization]
  B --> C[Fetch Source Status Version]
  C --> D[Check Invalidation Epoch]
  D --> E[Apply Overlay Precedence]
  E --> F{More Favourable Than Source?}
  F -->|Yes| G[Suppress / Show Less Favourable]
  F -->|No| H[Render]
```

## 5. Object-Level Authorization

```mermaid
flowchart TD
  A[User Requests Object] --> B[Session Subject]
  B --> C[Entitlement Scope]
  C --> D[Source Module Call Re-Scoped]
  D --> E{Object Owned / Assigned / Mandated?}
  E -->|No| F[Deny + Audit]
  E -->|Yes| G[Display]
```

## 6. Export Egress Hardening

```mermaid
flowchart TD
  A[Export Request] --> B[Recipient/Purpose/Basis]
  B --> C[Approval]
  C --> D[Source-Side Masking]
  D --> E[Generation Recheck]
  E --> F[Single-Use Token]
  F --> G[Download Recheck]
  G --> H[Watermark + Disclosure Log]
```
