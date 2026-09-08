# FND-01 Platform Foundation  
## 03 Diagrams

## 1. Foundation Context Diagram

```mermaid
flowchart TB
  CP[Client Portal] --> API[API Gateway]
  SP[Staff Portal] --> API
  AP[Admin Portal] --> API

  API --> CTX[Request Context]
  CTX --> VAL[Validation]
  VAL --> AUTH[Auth Handoff]
  AUTH --> RBAC[Permission Guard Handoff]
  RBAC --> FLAG[Feature Flag / Licence Lock Interface]
  FLAG --> MOD[Domain Modules]

  MOD --> AUD[Audit Publisher]
  MOD --> OUT[Outbox Interface]
  MOD --> IDEMP[Idempotency Interface]
  MOD --> LOG[Structured Logs]
  MOD --> MET[Metrics / Traces]

  MOD --> DB[(Module-Owned Schemas)]
  AUD --> AUDSTORE[(Audit Store - external module)]
  OUT --> QUEUE[(Queue / Outbox)]
```

---

## 2. Request Lifecycle

```mermaid
sequenceDiagram
  participant U as User / Service
  participant API as API Gateway
  participant F as FND Request Context
  participant V as Validator
  participant G as Guard Interfaces
  participant M as Module Handler
  participant A as Audit Publisher

  U->>API: Request
  API->>F: Create request_id / correlation_id
  F->>V: Validate payload
  V->>G: Auth/RBAC/Flag/Licence checks
  G-->>M: Allowed
  M->>A: Emit audit if sensitive
  M-->>API: Result
  API-->>U: Standard response
```

---

## 3. Module Boundary Model

```mermaid
flowchart LR
  subgraph ClientModule[Client Module]
    CS[Client Service]
    CDB[(client schema)]
  end

  subgraph ComplianceModule[Compliance Module]
    CMS[Compliance Service]
    CMDB[(compliance schema)]
  end

  subgraph LedgerModule[Ledger Module]
    LS[Ledger Service]
    LDB[(ledger schema)]
  end

  CS -->|Service Interface / Event| CMS
  CMS -->|Service Interface / Event| LS

  CS -. prohibited .-> CMDB
  CMS -. prohibited .-> LDB
  CS -. prohibited .-> LDB
```

---

## 4. Foundation Startup

```mermaid
stateDiagram-v2
  [*] --> Initialising
  Initialising --> ConfigValidation
  ConfigValidation --> DependencyValidation
  DependencyValidation --> ModuleRegistration
  ModuleRegistration --> Ready
  ConfigValidation --> Failed
  DependencyValidation --> Failed
  ModuleRegistration --> Failed
  Ready --> [*]
  Failed --> [*]
```

---

## 5. Deployment Smoke Flow

```mermaid
flowchart TD
  A[Start Smoke Test] --> B[Check Version / Artifact]
  B --> C[Check Health]
  C --> D[Check Readiness]
  D --> E[Check Server UTC]
  E --> F[Check Licence Locks]
  F --> G[Check Module Registry]
  G --> H[Check Audit Publisher]
  H --> I[Check Outbox]
  I --> J[Check Log Scrubbing]
  J --> K[Check Exchange Components Absent]
  K --> L{All Pass?}
  L -->|Yes| M[Smoke Passed]
  L -->|No| N[Smoke Failed / Block Deploy]
```

---

## 6. Configuration Drift Detection

```mermaid
flowchart TD
  A[Scheduled / Deployment Trigger] --> B[Read Approved Baseline]
  B --> C[Read Runtime Config]
  C --> D[Compare Critical Config]
  D --> E{Drift?}
  E -->|No| F[Record No Drift]
  E -->|Yes| G[Classify Drift]
  G --> H{Critical?}
  H -->|Yes| I[Alert + Block / Incident]
  H -->|No| J[Report + Remediate]
```
