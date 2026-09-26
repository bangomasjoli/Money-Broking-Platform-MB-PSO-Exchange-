# ACC-01 Account Structure
## 03 Diagrams (v0.3)

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
    RS["acc1.account_restriction<br/>bound to owner by composite FK"]
  end
  subgraph LED["LED-01 (sole owner)"]
    LA["led1.ledger_account<br/>account_id + subaccount_id"]
  end
  LE -->|"1 : N capable (policy limit 1)"| MA
  MA -->|"1 : N"| SA
  SA -->|"1 : N"| LA
  MA --> RS
  SA --> RS
  AU -.->|"authority over the client (consumed, never copied)"| LE
```

Composite FKs make a cross-client subaccount **and** a cross-client restriction unrepresentable. The default `general` subaccount is a member like any other; it is structural only and is never a fallback target.

## 2. Create master account (change request → approval → apply) — mirrors CLT-01 approve/apply

```mermaid
sequenceDiagram
  participant M as Maker (staff)
  participant A as ACC-01
  participant I as IAM-02
  participant C as CLT-01
  participant O as Operator (outside ACC-01)
  participant K as Checker
  participant S as SEC-01
  M->>A: POST change-requests {create_master_account, client_id}
  A->>I: permission/check (approval_required counts as baseline pass — NOT an entitlement)
  A->>C: client status via dedicated read-scoped credential (every environment)
  A->>A: store canonical payload + payload_hash = fingerprint(payload)
  A-->>M: change_request_id, approval_payload, payload_hash
  O->>I: POST /iam2/approvals/request {maker_user_id, action, resource, entity_id, client_id, payload}
  Note over I: IAM-02 computes its own fingerprint (sha256:+64 hex)
  K->>I: POST /iam2/approvals/:id/approve  (no entitlement check today — IAM2-FIND-002)
  I-->>K: single-use decision token (current seam returns it to the APPROVE caller, not the maker)
  M->>A: POST .../apply {decision_token, approval_id}  (IAM-01 session principal must equal requested_by — local defence in depth)
  A->>A: recompute payload_hash from STORED payload; pre-checks incl. DEP-* dependency prerequisites (no environment logic)
  A->>I: verify — TARGET contract DCR-ACC-IAM-06 (DEP-IAM-ACTOR-BINDING): authenticated actor assertion + current_payload_hash
  I-->>A: attested {approval_id, authenticated_actor_id, maker, checker, policy_id, payload_hash, action, resource, scope}; token consumed
  Note over A,I: today's execute-verify takes a body actor_id and never verifies approval_id — ACC-01 does NOT fake the proof; real governed apply stays gated
  A->>A: TX: lock, limits (advisory lock), insert master + default subaccount, history, request=applied
  A->>S: audit acc1.master_account_created (fail closed → rollback, request stays 'requested', FRESH approval needed)
```

## 3. Resolve on the hot path (e.g. LED-01 before creating or posting to a ledger account)

```mermaid
sequenceDiagram
  participant L as LED-01 (caller_module derived from secret)
  participant A as ACC-01
  participant C as CLT-01
  L->>A: GET /internal/acc1/subaccounts/{explicit subaccount_id}/resolve
  A->>A: read subaccount, master, restrictions (time-effective)
  A->>C: client status (dedicated read-scoped credential, live, no cache)
  alt any input unreadable
    A-->>L: 200 effective_status="unknown"
  else
    A-->>L: 200 closure_barrier, closure_draining, restriction_status, statuses, effective_status (descriptive), closure/seal versions, explanatory blocked_scopes, applied_restriction_ids, versions, environment
  end
  L->>L: EVALUATION ORDER: (1) closure_barrier=true ⇒ DENY everything; (2) components conjunctive, closing ⇒ closure-drain allow-list only; (3) product policy. unknown ⇒ deny; missing subaccount_id ⇒ deny (never default)
```

## 4. Effective status derivation and the independent closure facts

```mermaid
flowchart LR
  CB["closure_barrier (stored, independent)"] --> C1{"1. barrier = true?"}
  C1 -->|yes| D1["DENY every transaction-producing activity<br/>(never masked by frozen / suspended / restricted)"]
  C1 -->|no| C2
  CS["client-derived<br/>(CLT-01 status;<br/>active_limited/restricted ⇒ report-only)"] --> C2
  MS["master lifecycle +<br/>restriction_status (time-effective)"] --> C2
  SS["subaccount lifecycle +<br/>restriction_status (time-effective)"] --> C2
  C2{"2. every component active?<br/>(closing ⇒ closure-drain allow-list only,<br/>others must still be active)"} -->|no| D2["DENY"]
  C2 -->|yes| C3["3. product / activity policy<br/>(CFG-01, IAM-02, consumer)"]
  W["effective_status = worst-of ...<br/>DESCRIPTIVE ONLY, never the gate"]:::note
  X["any input unreadable"] --> U["unknown → consumers deny"]
  classDef note stroke-dasharray: 4 3
```

## 5. Preventive closure (approved sequence, ACC-R2-HD-01…05)

```mermaid
sequenceDiagram
  participant M as Maker
  participant K as Checker
  participant A as ACC-01
  participant L as LED-01 (attester + poster)
  M->>A: change request close_* → approval → apply
  A->>A: master + DEFAULT subaccount + every listed child = closing (one TX); closure_cycle++
  Note over A,L: DRAIN — only the closure-drain allow-list (balance return to verified own-name destination, already-open withdrawal/settlement, closure-needed recon breaks)
  M->>A: POST close/readiness
  A->>L: pre-seal readiness (drained? balance none/returned, no open items, no unaccounted in-flight, W_pre)
  L-->>A: ready + journal_watermark W_pre + max resolution version
  M->>A: change request seal_closure (binds readiness ids + W_pre)
  K->>A: FINAL HUMAN APPROVAL (immediately before sealing) → apply
  A->>L: fresh readiness re-check (W_pre must be unchanged)
  A->>A: closing → closure_sealed, closure_barrier=true, closure_seal_version++, closure_sealed_at_version = version written
  L->>A: resolve ⇒ closure_barrier=true ⇒ LED-01 refuses EVERY new posting
  M->>A: POST close/attestation  (AFTER the barrier)
  A->>L: attest {seal_version, closure_sealed_at_version, preseal_watermark_ref}
  L-->>A: {seal_version_observed, journal_watermark, committed_after_preseal_watermark=0, max_resolution_version_committed < sealed_at_version, in_flight none/refused_by_fence, clear, as_of}
  M->>A: POST close/complete (machine-verified, NO second checker)
  alt LATEST attestation per attester at current seal_version is clear, barrier still true
    A->>A: CAS closure_sealed → closed (terminal) + history + Critical audit
  else blocked / unreachable / stale / mismatched
    A-->>M: ACC1_CLOSURE_BLOCKED (stays closure_sealed — barred; re-collect or governed abort)
  end
  opt closure cannot safely complete
    M->>A: change request abort_closure (evidence-conditioned)
    K->>A: approval → apply
    A->>A: ONE TX: invalidate evidence, version++, closure_cycle++, clear barrier, recompute operational projection, Critical audit
  end
```

For a master: every child — **the default included** — drains, seals (own final approval), is attested and closes first; the master seals only when **all** children are `closed`, then has its own readiness, final approval, attestation and machine-verified completion. A master with only its default child completes closure end to end.

## 6. Runtime dependency graph

```mermaid
flowchart LR
  ACC[ACC-01] -->|status read (dedicated read credential)| CLT[CLT-01]
  CLT -->|open-accounts (client closure)| ACC
  ACC -->|permission/check, execute-verify (scoped credential)| IAM[IAM-02]
  IAM -->|scope-validate (read seam; never calls back)| ACC
  LED[LED-01] -->|resolve (every posting; barrier first)| ACC
  ACC -->|pre-seal readiness + post-barrier attestation| LED
  CFG[CFG-01] -->|resolve (condition 9)| ACC
  ACC -->|audit| SEC[SEC-01]
```

Readiness never traverses these edges (configuration/contract only). There is **no ACC-01 → CFG-01 edge**: ACC-01 does not read CFG-01 environment scope and implements no environment availability (ACC-R2-HD-06); any future CFG-01 decision about ACC-01 operations is consumed, not duplicated (DCR-ACC-CFG-02) and would also stay out of readiness.
