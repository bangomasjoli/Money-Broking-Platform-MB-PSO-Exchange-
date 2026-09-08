# IAM-02 RBAC / Permission Guard / SoD  
## 03 Diagrams

## 1. Runtime Permission Guard

```mermaid
sequenceDiagram
  participant API as Protected API
  participant FND as FND Context
  participant IAM1 as IAM-01 Session/Step-Up
  participant IAM2 as IAM-02 Permission Guard
  participant AUD as Audit Publisher

  API->>FND: Request context
  API->>IAM1: Validate session
  API->>IAM2: Check permission(action, resource, context)
  IAM2->>IAM2: Role/permission lookup
  IAM2->>IAM2: Licence lock + SoD check
  IAM2->>IAM1: Verify step-up if required
  IAM2->>AUD: Permission decision event if sensitive
  IAM2-->>API: allow / deny / approval_required
```

---

## 2. Maker-Checker Approval

```mermaid
flowchart TD
  A[Maker initiates action] --> B[Permission Guard]
  B --> C{Approval required?}
  C -->|No| D[Proceed]
  C -->|Yes| E[Create approval request]
  E --> F[Select eligible approver]
  F --> G[Check not maker]
  G --> H[Check SoD]
  H --> I[Step-up if required]
  I --> J{Approve?}
  J -->|Yes| K[Approval recorded]
  J -->|No| L[Rejected]
  K --> M{Threshold met?}
  M -->|Yes| N[Proceed]
  M -->|No| F
```

---

## 3. SoD Assignment Check

```mermaid
flowchart LR
  A[Proposed Role/Permission] --> B[Load Current Roles]
  B --> C[Load SoD Matrix]
  C --> D{Conflict?}
  D -->|No| E[Allow / Proceed to Approval]
  D -->|Yes| F[Block or Risk Acceptance]
```

---

## 4. Break-Glass

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> approved
  requested --> rejected
  approved --> active
  active --> expired
  active --> revoked
  expired --> post_review_pending
  revoked --> post_review_pending
  post_review_pending --> closed
```

---

## 5. Permission Revocation Propagation

```mermaid
flowchart TD
  A[Role/Permission Revoked] --> B[Invalidate Permission Cache]
  B --> C[Block Future Permission Check]
  C --> D[Notify IAM-01 if session revalidation required]
  D --> E[Audit Event]
  E --> F[Reconciliation Job]
```

---

## 6. Client-Side Dual Authorization

```mermaid
sequenceDiagram
  participant M as Client Maker
  participant IAM2 as IAM-02 Approval
  participant A as Client Approver
  participant IAM1 as IAM-01 Step-Up
  participant MOD as Business Module

  M->>MOD: Initiate sensitive action
  MOD->>IAM2: Create client approval
  IAM2->>A: Approval task
  A->>IAM1: Step-up
  IAM1-->>IAM2: Recent-auth assertion valid
  IAM2->>IAM2: Not maker + SoD check
  IAM2-->>MOD: Approved
```


---

## 7. Approval-to-Execution Binding

```mermaid
sequenceDiagram
  participant M as Maker/Module
  participant IAM2 as IAM-02
  participant A as Approver
  participant EXEC as Executing Module

  M->>IAM2: Create approval with payload
  IAM2->>IAM2: Canonicalise + hash payload
  A->>IAM2: Approve with step-up
  IAM2-->>M: Approval approved
  EXEC->>IAM2: Execute with approval_id + current_payload_hash + decision_token
  IAM2->>IAM2: Verify hash, cache version, session, approval, SoD
  IAM2-->>EXEC: execution_authorised / blocked
```

---

## 8. Protected-Action Registry

```mermaid
flowchart TD
  A[Module Sensitive Action] --> B[Protected Action Registry]
  B --> C[Permission Code]
  B --> D[Approval Policy]
  B --> E[Step-Up Requirement]
  B --> F[Licence Lock Status]
  B --> G[Test Coverage]
  H[Runtime Action] --> I{Registered?}
  I -->|No| J[Fail Closed]
  I -->|Yes| K[Permission Guard]
```

---

## 9. SoD Matrix Versioning / Meta-SoD

```mermaid
flowchart TD
  A[SoD Rule Change] --> B[Version + Diff Hash]
  B --> C[Security Approval]
  B --> D[Compliance Approval]
  C --> E[Meta-SoD Check]
  D --> E
  E --> F{Editor also role/permission assigner?}
  F -->|Yes| G[Block]
  F -->|No| H[Apply New Matrix Version]
  H --> I[Integrity Reconciliation]
```

---

## 10. Break-Glass Ceiling

```mermaid
flowchart TD
  A[Break-Glass Request] --> B[Check Emergency Category]
  B --> C[Check Permission Whitelist]
  C --> D{Contains IAM2 Admin / SoD / Licence / Exchange?}
  D -->|Yes| E[Block]
  D -->|No| F[Check Duration + Concurrent Limit]
  F --> G[Approval + Step-Up]
  G --> H[Time-Boxed Grant]
```
