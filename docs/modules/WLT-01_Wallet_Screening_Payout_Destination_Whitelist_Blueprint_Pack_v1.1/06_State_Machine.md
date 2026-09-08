# WLT-01 Wallet Screening / Payout Destination Whitelist
## 06 State Machine

## 1. Destination State

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> pending_screening
  pending_screening --> pending_review
  pending_review --> approved_pending_cooling
  approved_pending_cooling --> active
  active --> restricted
  active --> revoked
  active --> expired
  restricted --> active
  restricted --> revoked
```

## 2. Wallet Screening State

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> clear
  pending --> review_required
  pending --> high_risk
  pending --> hit
  clear --> stale
  review_required --> clear
  review_required --> rejected
```

## 3. Cooling-Off State

```mermaid
stateDiagram-v2
  [*] --> active
  active --> completed
  active --> overridden
  active --> cancelled
```

## 4. Destination Decision State

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> allow
  requested --> deny
  requested --> hold
  allow --> expired
  allow --> revoked
```

## 5. Revocation State

```mermaid
stateDiagram-v2
  [*] --> triggered
  triggered --> revoked
  revoked --> downstream_notified
  downstream_notified --> reconciled
```

## 6. Execution Consumption State

```mermaid
stateDiagram-v2
  [*] --> issued
  issued --> revalidating
  revalidating --> consumed
  revalidating --> rejected
  issued --> expired
  issued --> revoked
```

## 7. Inbound Source State

```mermaid
stateDiagram-v2
  [*] --> detected
  detected --> screening
  screening --> clear
  screening --> quarantine
  quarantine --> released
  quarantine --> escalated
```

## 8. Proof-of-Control State

```mermaid
stateDiagram-v2
  [*] --> required
  required --> pending
  pending --> verified
  pending --> failed
  verified --> expired
```

## 9. Address Integrity State

```mermaid
stateDiagram-v2
  [*] --> input_received
  input_received --> canonicalised
  canonicalised --> reconfirmed
  reconfirmed --> poisoning_screened
  poisoning_screened --> clear
  poisoning_screened --> review_required
  poisoning_screened --> hit
```
