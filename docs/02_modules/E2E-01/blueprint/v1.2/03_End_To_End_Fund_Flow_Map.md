# E2E-01 Cross-Module End-to-End Fund-Flow Review
## 03 End-To-End Fund-Flow Map

## 1. Flow A — Client Onboarding to Trading Eligibility

```mermaid
sequenceDiagram
  participant Client
  participant CLT as CLT-01
  participant KYC as KYC-01
  participant AML as AML-01
  participant CFG as CFG-01
  participant IAM as IAM-02
  participant SEC as SEC-01

  Client->>CLT: Submit application/profile
  CLT->>KYC: Request verification
  KYC-->>CLT: KYC pass/fail/stale/remediation
  CLT->>AML: Request screening
  AML-->>CLT: AML clear/review/hit/stale
  CLT->>IAM: Mandate / authorised users / dual auth
  CLT->>CFG: Feature/licence gate
  CLT->>SEC: Audit onboarding outcome
```

Eligibility output:

```txt
client_trading_eligible = CLT approved + KYC current pass + AML current clear + mandate valid + CFG allowed + no restriction
```

## 2. Flow B — Deposit to Available Balance

```mermaid
sequenceDiagram
  participant Bank as Bank/Custodian/Chain
  participant WLT as WLT-01
  participant AML as AML-01
  participant LED as LED-01
  participant SEC as SEC-01

  Bank->>LED: Inbound receipt event
  LED->>WLT: Screen/match inbound source
  WLT->>AML: AML/source gate where required
  AML-->>WLT: Source clear/review/hit
  WLT-->>LED: Source clear/quarantine
  LED->>LED: Confirm receipt + backing
  LED->>LED: Credit available only after safeguards pass
  LED->>SEC: Audit deposit/credit
```

Blocking conditions:

1. source unscreened.
2. source sanctioned/high-risk.
3. source/client mismatch.
4. receipt unconfirmed.
5. backing not free/confirmed.
6. AML/KYC/client restriction.
7. duplicate event.

## 3. Flow C — Wallet / Payout Destination Whitelist

```mermaid
sequenceDiagram
  participant Client
  participant WLT as WLT-01
  participant KYC as KYC-01
  participant AML as AML-01
  participant IAM as IAM-02
  participant SEC as SEC-01

  Client->>WLT: Register wallet/payout destination
  WLT->>KYC: Verify beneficiary/ownership
  WLT->>AML: Destination/counterparty screening
  WLT->>IAM: Maker-checker / client dual auth
  WLT->>WLT: Cooling-off + activation
  WLT->>SEC: Audit whitelist
```

Blocking conditions:

1. missing proof-of-control.
2. beneficiary mismatch.
3. third-party beneficiary unapproved.
4. wallet high-risk/sanctions exposure.
5. cooling-off active.
6. AML revocation.
7. unsupported chain/provider.

## 4. Flow D — Quote / Trade / LP Execution / Settlement

```mermaid
sequenceDiagram
  participant Client
  participant TRD as TRD-01
  participant CFG as CFG-01
  participant AML as AML-01
  participant LED as LED-01
  participant LP as Approved LP
  participant SEC as SEC-01

  Client->>TRD: Request quote
  TRD->>CFG: Licence/feature check
  TRD->>LP: Request LP quote
  LP-->>TRD: LP quote + hash
  TRD-->>Client: Client quote + fee disclosure
  Client->>TRD: Accept quote
  TRD->>CFG: Revalidate licence lock
  TRD->>AML: Pre-transaction gate
  TRD->>LED: Create prefunded hold
  TRD->>LP: Execute against approved LP
  LP-->>TRD: External LP fill
  TRD->>TRD: Fill conservation + price identity
  TRD->>CFG: Settlement-time licence recheck
  TRD->>LED: Settlement handoff with conversion legs
  LED-->>TRD: Settlement outcome
  TRD-->>Client: Confirmation reflecting LED truth
  TRD->>SEC: Audit trade evidence
```

Blocking conditions:

1. unapproved LP.
2. stale quote.
3. client quote validity exceeds LP quote validity.
4. no LED hold.
5. stale AML/CFG decision.
6. LP timeout unresolved.
7. no external LP fill.
8. fill conservation failure.
9. price identity failure.
10. internalisation/synthetic LP fill.
11. LED settlement failure.

## 5. Flow E — Withdrawal / Payout

```mermaid
sequenceDiagram
  participant Client
  participant WLT as WLT-01
  participant AML as AML-01
  participant LED as LED-01
  participant Rail as Bank/Custodian/Rail
  participant SEC as SEC-01

  Client->>LED: Withdrawal/payout request
  LED->>WLT: Verify-and-consume destination decision
  WLT->>AML: Pre-transaction/destination gate
  WLT-->>LED: Destination allow/hold/deny
  LED->>LED: Atomic reserve + backing check
  LED->>Rail: Execution instruction via execution module
  Rail-->>LED: Execution confirmation
  LED->>LED: Settlement journal
  LED->>SEC: Audit payout
```

Blocking conditions:

1. destination not active.
2. WLT decision not execution-revalidated.
3. AML gate stale.
4. insufficient live available balance.
5. backing invariant failure.
6. client/mandate freeze.
7. Travel Rule missing data.
