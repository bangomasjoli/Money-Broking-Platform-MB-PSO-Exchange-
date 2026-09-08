# CFG-01 Feature Flag / Licence Lock  
## 06 State Machine

## 1. Feature State

```mermaid
stateDiagram-v2
  [*] --> registered
  registered --> disabled
  disabled --> enable_requested
  enable_requested --> approved
  enable_requested --> rejected
  approved --> enabled
  enabled --> disabled
  enabled --> kill_switched
  kill_switched --> disabled
  registered --> locked
  locked --> disabled
  registered --> prohibited
  prohibited --> [*]
```

## 2. Licence Profile State

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> approved
  approved --> active
  active --> suspended
  active --> revoked
  active --> retired
  suspended --> active
  revoked --> retired
```

## 3. Feature Change State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> approval_required
  approval_required --> approved
  approval_required --> rejected
  approved --> applied
  applied --> rolled_back
  requested --> cancelled
```

## 4. Decision Token State

```mermaid
stateDiagram-v2
  [*] --> issued
  issued --> verified
  issued --> expired
  issued --> stale
  issued --> revoked
  verified --> consumed
```

## 5. Deployment Gate State

```mermaid
stateDiagram-v2
  [*] --> checking
  checking --> passed
  checking --> failed
  failed --> blocked
```

## 6. Handoff Reconciliation State

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> matched
  pending --> mismatch
  pending --> missing
  mismatch --> blocked
  missing --> blocked
  matched --> complete
```


## 7. Config Integrity State

```mermaid
stateDiagram-v2
  [*] --> sealed
  sealed --> verified
  sealed --> mismatch_detected
  mismatch_detected --> fail_closed
  mismatch_detected --> critical_alert
  verified --> superseded
```

## 8. Exchange Activation Ceremony State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> evidence_verification
  evidence_verification --> evidence_verified
  evidence_verification --> rejected
  evidence_verified --> approvals_pending
  approvals_pending --> approved
  approvals_pending --> rejected
  approved --> cooldown
  cooldown --> deployment_gate
  deployment_gate --> resealed
  resealed --> activated
```

## 9. Audit Outage Mode State

```mermaid
stateDiagram-v2
  [*] --> inactive
  inactive --> active
  active --> reconciling
  reconciling --> resolved
  active --> expired_blocked
```
