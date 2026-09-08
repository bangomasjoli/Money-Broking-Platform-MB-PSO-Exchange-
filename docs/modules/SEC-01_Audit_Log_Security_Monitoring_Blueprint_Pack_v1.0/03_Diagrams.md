# SEC-01 Audit Log / Security Monitoring  
## 03 Diagrams

## 1. Audit Event Ingestion

```mermaid
sequenceDiagram
  participant MOD as Source Module
  participant FND as FND Outbox
  participant SEC as SEC-01
  participant STORE as Audit Store
  participant ALERT as Alert Engine

  MOD->>FND: enqueue audit event
  FND->>SEC: deliver event
  SEC->>SEC: validate schema + idempotency
  SEC->>SEC: sequence + hash chain
  SEC->>STORE: immutable persist
  SEC->>ALERT: evaluate rules
```

---

## 2. Hash Chain

```mermaid
flowchart LR
  E1[Event 1] --> H1[Hash 1]
  H1 --> E2[Event 2 includes previous_hash]
  E2 --> H2[Hash 2]
  H2 --> E3[Event 3 includes previous_hash]
  E3 --> H3[Hash 3]
  H3 --> S[Batch Seal]
```

---

## 3. Security Monitoring

```mermaid
flowchart TD
  A[Audit Event] --> B[Security Rule Engine]
  B --> C{Rule Triggered?}
  C -->|No| D[Store Metrics]
  C -->|Yes| E[Create Alert]
  E --> F[Route by Severity]
  F --> G[Notify Reviewer]
  G --> H[Triage]
  H --> I[Close / Escalate Incident]
```

---

## 4. Sensitive Audit Read

```mermaid
sequenceDiagram
  participant U as User
  participant IAM2 as IAM-02
  participant SEC as SEC-01
  participant AUD as SEC-01 Audit Store

  U->>SEC: Search/read/export request
  SEC->>IAM2: Permission/step-up/approval check
  IAM2-->>SEC: allow / deny
  SEC->>AUD: Log sensitive read
  SEC-->>U: Return permitted evidence
```

---

## 5. Interim Audit Handoff

```mermaid
flowchart TD
  A[IAM-01/IAM-02 Local Audit Index] --> B[SEC-01 Handoff Job]
  C[FND Outbox Events] --> B
  B --> D[SEC-01 Authoritative Store]
  B --> E{Missing Sensitive Event?}
  E -->|Yes| F[Critical Alert]
  E -->|No| G[Reconciled]
```

---

## 6. Audit Failure Fail-Closed

```mermaid
flowchart TD
  A[Sensitive Business Action] --> B[Required Audit Event]
  B --> C{Audit Persist/Outbox OK?}
  C -->|Yes| D[Business Commit Allowed]
  C -->|No| E[Fail Closed]
  E --> F[Security Alert]
```
