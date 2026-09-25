# ACC-01 Account Structure
## 03 Diagrams

## 1. Hierarchy and ownership of each layer

```mermaid
flowchart TD
  subgraph CLT["CLT-01 (sole owner)"]
    LE["clt1.client_profile<br/>Legal Entity — client_id"]
    AU["clt1.authorised_user<br/>Membership (iam_user_id)"]
  end
  subgraph ACC["ACC-01 (sole owner)"]
    MA["acc1.master_account<br/>master_account_id, client_id"]
    SA["acc1.subaccount<br/>subaccount_id, master_account_id, client_id"]
  end
  subgraph LED["LED-01 (sole owner)"]
    LA["led1.ledger_account<br/>account_id + subaccount_id"]
  end
  LE -->|"1 : N capable (policy limit 1)"| MA
  MA -->|"1 : N"| SA
  SA -->|"1 : N"| LA
  AU -.->|"authority over the client (consumed, never copied)"| LE
```

Composite FK `(master_account_id, client_id)` from `subaccount` to `master_account` makes a cross-client subaccount unrepresentable.

## 2. Create master account (change request → approval → apply)

```mermaid
sequenceDiagram
  participant M as Maker (staff)
  participant A as ACC-01
  participant I as IAM-02
  participant C as CLT-01
  participant S as SEC-01
  participant K as Checker
  M->>A: POST change-requests {create_master_account, client_id}
  A->>I: permission/check acc1.master_account.create
  I-->>A: allow | approval_required (both pass baseline)
  A->>C: GET /internal/clt1/clients/{id}/status
  C-->>A: status, client_class
  A->>A: store request + payload_hash (requested)
  A->>S: audit acc1.change_requested
  M->>I: raise approval(payload_hash)
  K->>I: approve (different user)
  M->>A: POST .../apply {decision_token}
  A->>A: claim (applying)
  A->>I: execute-verify(approval_id, token, payload_hash)
  I-->>A: execution_authorised
  A->>C: re-read client status (pre-tx)
  A->>A: TX: lock, limits (advisory lock), insert master (+default subaccount), history, request=applied
  A->>S: audit acc1.master_account_created (fail closed)
```

## 3. Resolve on the hot path (e.g. LED-01 before creating or posting to a ledger account)

```mermaid
sequenceDiagram
  participant L as LED-01 (caller_module derived from secret)
  participant A as ACC-01
  participant C as CLT-01
  L->>A: GET /internal/acc1/subaccounts/{id}/resolve
  A->>A: read subaccount, master, active restrictions
  A->>C: client status (live)
  alt any input unreadable
    A-->>L: 200 effective_status="unknown"
  else
    A-->>L: 200 client_id, master_account_id, purpose, effective_status, blocked_scopes, versions, environment
  end
  L->>L: deny unless effective_status permits the activity class
```

## 4. Effective status derivation

```mermaid
flowchart LR
  CS["client-derived<br/>(CLT-01 status)"] --> W
  MS["master.status +<br/>active restrictions"] --> W
  SS["subaccount.status +<br/>active restrictions"] --> W
  W{"worst-of<br/>closed > frozen > suspended ><br/>closing > restricted > active"} --> E["effective_status + blocked_scopes"]
  X["any input unreadable"] --> U["unknown → consumers deny"]
```

## 5. Closure

```mermaid
sequenceDiagram
  participant M as Maker
  participant A as ACC-01
  participant L as LED-01 (attester)
  M->>A: change request close_subaccount → approval → apply
  A->>A: status = closing
  M->>A: POST close/complete
  A->>L: readiness(subaccount_id)
  alt clear (all attesters, fresh)
    A->>A: status = closed (terminal) + history + Critical audit
  else blocked / unreachable / unconfigured
    A-->>M: ACC1_CLOSURE_BLOCKED (stays closing)
  end
```
