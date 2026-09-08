# IAM-01 Authentication / MFA / Session  
## 06 State Machine

## 1. User Auth Status

```mermaid
stateDiagram-v2
  [*] --> active
  active --> locked
  active --> suspended
  active --> deactivated
  locked --> active
  suspended --> active
  deactivated --> [*]
```

## 2. Login State

```mermaid
stateDiagram-v2
  [*] --> received
  received --> rate_limited
  received --> credential_check
  credential_check --> failed
  credential_check --> mfa_required
  credential_check --> authenticated
  mfa_required --> mfa_passed
  mfa_required --> mfa_failed
  mfa_passed --> authenticated
  authenticated --> session_issued
  session_issued --> [*]
  failed --> [*]
  rate_limited --> [*]
```

## 3. MFA Factor State

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> active
  pending --> failed
  active --> revoked
  active --> reset_requested
  reset_requested --> reset_approved
  reset_requested --> reset_rejected
  reset_approved --> revoked
```

## 4. MFA Challenge State

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> passed
  pending --> failed
  pending --> expired
  failed --> locked_if_threshold
```

## 5. Session State

```mermaid
stateDiagram-v2
  [*] --> active
  active --> refreshed
  refreshed --> active
  active --> expired
  active --> revoked
  active --> security_revoked
  active --> locked
  expired --> [*]
  revoked --> [*]
  security_revoked --> [*]
```

## 6. Refresh Token State

```mermaid
stateDiagram-v2
  [*] --> active
  active --> used
  used --> replaced
  active --> expired
  active --> revoked
  used --> reuse_detected
  reuse_detected --> token_family_revoked
```

## 7. Password Reset Token State

```mermaid
stateDiagram-v2
  [*] --> active
  active --> used
  active --> expired
  active --> revoked
  used --> [*]
  expired --> [*]
  revoked --> [*]
```

## 8. Service Account State

```mermaid
stateDiagram-v2
  [*] --> active
  active --> rotating
  rotating --> active
  active --> disabled
  disabled --> [*]
```


---

## 9. Step-Up Assertion State

```mermaid
stateDiagram-v2
  [*] --> challenge_pending
  challenge_pending --> passed
  challenge_pending --> failed
  passed --> assertion_active
  assertion_active --> used
  assertion_active --> expired
  assertion_active --> revoked
  assertion_active --> invalidated_by_freeze
  used --> [*]
  expired --> [*]
  revoked --> [*]
```

## 10. Freeze Revocation State

```mermaid
stateDiagram-v2
  [*] --> freeze_event_received
  freeze_event_received --> sessions_identified
  sessions_identified --> sessions_revoked
  sessions_revoked --> refresh_denied
  refresh_denied --> audited
```

## 11. Session Anomaly State

```mermaid
stateDiagram-v2
  [*] --> normal
  normal --> anomaly_detected
  anomaly_detected --> step_up_required
  anomaly_detected --> session_revoked
  step_up_required --> normal
  step_up_required --> session_revoked
```

## 12. MFA Reset Request State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> disabled_until_iam02
  requested --> pending_interim_approval
  pending_interim_approval --> approved
  pending_interim_approval --> rejected
  approved --> completed
  completed --> [*]
  rejected --> [*]
```
