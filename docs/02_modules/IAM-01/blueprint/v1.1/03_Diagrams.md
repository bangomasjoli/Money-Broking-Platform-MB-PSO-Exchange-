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


---

## 7. Step-Up Authentication

```mermaid
sequenceDiagram
  participant M as Downstream Module
  participant IAM as IAM Step-Up Service
  participant U as User
  participant AUD as Audit

  M->>IAM: Verify recent-auth assertion / request step-up
  IAM->>IAM: Check session + account + anomaly
  IAM-->>U: Step-up challenge
  U->>IAM: Password/MFA/WebAuthn response
  IAM->>AUD: step_up_passed
  IAM-->>M: Recent-auth assertion
  M->>IAM: Verify assertion before action
```

---

## 8. Freeze to Session Revocation

```mermaid
flowchart TD
  A[Compliance Freeze Event] --> B[IAM Validate Event]
  B --> C[Find Active Sessions]
  C --> D[Revoke Sessions]
  D --> E[Revoke Refresh Token Families]
  E --> F[Invalidate Step-Up Assertions]
  F --> G[Audit / Security Event]
  H[Refresh Token Request] --> I[Status Re-check]
  I --> J{Frozen?}
  J -->|Yes| K[Deny Refresh]
  J -->|No| L[Continue]
```

---

## 9. Session Hijack / Mid-Session Anomaly

```mermaid
flowchart TD
  A[Access Token Used] --> B[Load Session Binding]
  B --> C[Compare Device/IP/UA Risk]
  C --> D{Anomaly?}
  D -->|No| E[Allow]
  D -->|Medium| F[Require Step-Up]
  D -->|High| G[Revoke Session + Token Family]
  F --> H[Audit]
  G --> H
```

---

## 10. Per-User-Class Session Policy

```mermaid
flowchart LR
  U[User Class] --> P[Session Policy]
  P --> TTL[Access TTL]
  P --> IDLE[Idle Timeout]
  P --> REAUTH[Re-auth Interval]
  P --> MAX[Max Concurrent Sessions]
  P --> STEP[Step-Up Triggers]
```
