# IAM-01 Authentication / MFA / Session  
## 03 Diagrams

## 1. Login Flow

```mermaid
sequenceDiagram
  participant U as User
  participant API as API Gateway
  participant FND as FND Context/Rate Limit
  participant AUTH as IAM Auth Service
  participant MFA as MFA Service
  participant SES as Session Service
  participant AUD as Audit Publisher

  U->>API: Login
  API->>FND: Context + rate limit
  FND->>AUTH: Request
  AUTH->>AUTH: Verify password/account status
  AUTH->>MFA: MFA required?
  MFA-->>U: Challenge
  U->>MFA: Response
  MFA->>AUTH: Verified
  AUTH->>SES: Issue session
  AUTH->>AUD: Login success event
  AUTH-->>U: Session response
```

---

## 2. Password Reset

```mermaid
flowchart TD
  A[Request reset] --> B[Rate limit]
  B --> C[Generate token if eligible]
  C --> D[Store token hash]
  D --> E[Send notification]
  E --> F[User submits token + new password]
  F --> G[Verify token]
  G --> H[Validate password policy]
  H --> I[Store password hash]
  I --> J[Revoke sessions]
  J --> K[Audit + notify]
```

---

## 3. Session State

```mermaid
stateDiagram-v2
  [*] --> unauthenticated
  unauthenticated --> mfa_pending
  mfa_pending --> authenticated
  authenticated --> refreshed
  refreshed --> authenticated
  authenticated --> revoked
  authenticated --> expired
  authenticated --> locked
  revoked --> [*]
  expired --> [*]
  locked --> [*]
```

---

## 4. Refresh Token Rotation

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Session Service
  participant DB as Token Store
  participant SEC as Security Alert

  C->>S: Refresh token
  S->>DB: Validate token hash
  DB-->>S: Valid
  S->>DB: Rotate token
  S-->>C: New access + refresh token

  C->>S: Reused old token
  S->>DB: Detect reuse
  S->>DB: Revoke token family
  S->>SEC: Alert
```

---

## 5. MFA Reset

```mermaid
flowchart TD
  A[MFA reset requested] --> B[Identity verification]
  B --> C[Create reset request]
  C --> D[Maker-checker approval via IAM-02]
  D --> E{Approved?}
  E -->|No| F[Rejected]
  E -->|Yes| G[Invalidate MFA]
  G --> H[Revoke sessions]
  H --> I[Require re-enrolment]
  I --> J[Audit + notify]
```

---

## 6. Service Account Auth

```mermaid
flowchart LR
  SVC[Service] --> WID[Workload Identity / Credential]
  WID --> IAM[Service Account Auth]
  IAM --> SCOPE[Scope Check]
  SCOPE --> CTX[Service Auth Context]
  CTX --> API[Protected Internal API]
```
