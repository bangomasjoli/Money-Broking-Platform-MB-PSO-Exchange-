# IAM-02 RBAC / Permission Guard / SoD  
## 06 State Machine

## 1. Permission Decision State

```mermaid
stateDiagram-v2
  [*] --> received
  received --> evaluating
  evaluating --> allowed
  evaluating --> denied
  evaluating --> approval_required
  evaluating --> step_up_required
  evaluating --> sod_blocked
  evaluating --> licence_locked
  allowed --> [*]
  denied --> [*]
```

## 2. Approval Request State

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> approved
  pending --> rejected
  pending --> expired
  pending --> cancelled
  pending --> blocked_by_sod
  approved --> [*]
  rejected --> [*]
  expired --> [*]
  cancelled --> [*]
```

## 3. Role Assignment State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> sod_check
  sod_check --> approval_required
  sod_check --> blocked
  approval_required --> approved
  approval_required --> rejected
  approved --> active
  active --> revoked
  active --> expired
```

## 4. Delegation State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> approved
  requested --> rejected
  approved --> active
  active --> expired
  active --> revoked
```

## 5. Temporary Permission State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> approved
  requested --> rejected
  approved --> active
  active --> expired
  active --> revoked
```

## 6. Break-Glass State

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
  post_review_pending --> review_closed
  post_review_pending --> escalated
```

## 7. Permission Cache State

```mermaid
stateDiagram-v2
  [*] --> valid
  valid --> invalidated
  invalidated --> refreshed
  refreshed --> valid
  invalidated --> fail_closed
```
