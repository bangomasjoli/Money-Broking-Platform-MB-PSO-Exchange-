# CLT-01 Client Onboarding / Client Profile
## 06 State Machine

## 1. Application State

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> submitted
  draft --> cancelled
  submitted --> duplicate_review
  submitted --> pending_kyc
  submitted --> pending_aml
  duplicate_review --> under_review
  pending_kyc --> under_review
  pending_aml --> under_review
  under_review --> approved
  under_review --> rejected
  under_review --> held
  approved --> [*]
  rejected --> [*]
```

## 2. Client Profile State

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> active_limited
  active_limited --> active
  active --> suspended
  active --> restricted
  active --> closed
  suspended --> active
  restricted --> active
  suspended --> closed
```

## 3. Mandate State

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> approval_required
  approval_required --> active
  approval_required --> rejected
  active --> expired
  active --> revoked
```

## 4. Duplicate Review State

```mermaid
stateDiagram-v2
  [*] --> open
  open --> duplicate
  open --> not_duplicate
  open --> needs_more_info
  needs_more_info --> open
```

## 5. Profile Change State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> approval_required
  approval_required --> approved
  approval_required --> rejected
  approved --> applied
  requested --> cancelled
```
