# TRD-01 Quote / Trade / LP Execution
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | TRD-01 |
| Module name | Quote / Trade / LP Execution |
| Pack version | v1.0 |
| Status | Initial module blueprint for Claude Opus review |
| Platform | AIX Money Broking + PSO Platform |
| Licence posture | Money Broking and PSO approved; Exchange pending |
| Module category | Trading Tier / Money Broking / LP Execution |
| Depends on | FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2, SEC-01 v1.2, CFG-01 v1.2, CLT-01 v1.2, KYC-01 v1.2, AML-01 v1.2, WLT-01 v1.2, LED-01 v1.2 |
| Provides outcome to | LED-01, Settlement, Client Portal, Staff Portal, Reconciliation, Reporting |

Base documents:
- 00_Licence_Scope_And_Feature_Lock_v1.3.md
- 01_Project_Charter_v1.3.md
- 02_Software_Requirement_Specification_v1.2.md
- 03_Master_Module_Index_v1.2.md
- 04_Role_And_Permission_Matrix_v1.2.md
- 05_Master_Workflow_Map_v1.2.md
- 06_Master_System_Rules_v1.2.md
- 07_Master_Data_Flow_v1.2.md
- 08_Master_Technical_Architecture_v1.2.md
- 09_Master_Security_Architecture_v1.2.md
- 10_Master_Testing_Strategy_v1.2.md
- 11_Master_Deployment_Strategy_v1.2.md
- FND-01_Platform_Foundation_Blueprint_Pack_v1.2
- IAM-01_Authentication_MFA_Session_Blueprint_Pack_v1.2
- IAM-02_RBAC_Permission_Guard_SoD_Blueprint_Pack_v1.2
- SEC-01_Audit_Log_Security_Monitoring_Blueprint_Pack_v1.2
- CFG-01_Feature_Flag_Licence_Lock_Blueprint_Pack_v1.2
- CLT-01_Client_Onboarding_Client_Profile_Blueprint_Pack_v1.2
- KYC-01_KYC_KYB_Verification_Blueprint_Pack_v1.2
- AML-01_Sanctions_PEP_Adverse_Media_Travel_Rule_Blueprint_Pack_v1.2
- WLT-01_Wallet_Screening_Payout_Destination_Whitelist_Blueprint_Pack_v1.2
- LED-01_Ledger_Settlement_Safeguarding_Blueprint_Pack_v1.2


---

## 2. Module Purpose

TRD-01 controls the full trade lifecycle from client quote request to LP execution result and settlement handoff.

It answers:

```txt
Can this client request, accept, and execute a quote through an approved LP as agent/back-to-back, with prefunded hold, AML/client eligibility, no AIX principal exposure, no spread markup, and no Exchange feature?
```

TRD-01 is not an Exchange and not a matching engine.

---

## 3. In Scope

TRD-01 covers:

1. Tradeable pair/instrument configuration.
2. LP configuration and approval status.
3. LP connectivity status.
4. Client trade eligibility checks.
5. Quote request intake.
6. LP quote request.
7. Client quote generation.
8. Brokerage/commission disclosure.
9. Quote expiry.
10. Quote acceptance.
11. Prefunded hold request to LED-01.
12. AML-01 pre-transaction gate where required.
13. LP execution submission.
14. LP fill/partial fill/reject/timeout result capture.
15. Slippage tolerance.
16. Requote / void / cancellation.
17. Execution report.
18. Settlement handoff to LED-01.
19. Trade lifecycle state machine.
20. LP outage fail-closed.
21. Reconciliation between quote, LP order, fill and ledger settlement.
22. Audit and evidence export.

---

## 4. Out of Scope

TRD-01 does not implement:

1. public order book.
2. matching engine.
3. client-to-client matching.
4. market maker.
5. principal dealing.
6. AIX inventory.
7. AIX spread markup.
8. derivatives.
9. securities/STO trading.
10. custody/private keys.
11. payment execution.
12. ledger posting.
13. wallet whitelist.
14. AML/KYC screening ownership.
15. FIU/STR filing.
16. public Exchange runtime.

---

## 5. Critical Principles

### 5.1 Licence / Feature Lock Boundary

TRD-01 must operate strictly as Money Broking agency/back-to-back trading.

Prohibited:

1. Exchange order book.
2. matching engine.
3. client-to-client matching.
4. market making.
5. principal dealing.
6. AIX inventory.
7. AIX spread markup.
8. securities/derivatives unless separately approved.
9. public exchange trading.

### 5.2 Agency / Back-to-Back Execution

TRD-01 executes client trade through approved LP as agent/back-to-back.

Rules:

1. AIX is not counterparty as principal.
2. LP is execution counterparty.
3. Client trade requires LP execution path.
4. Client fill must map to LP fill.
5. No LP fill means no final client fill.
6. Partial LP fill requires partial client fill only if policy/client consent permits.
7. Residual cannot be absorbed by AIX inventory.
8. No AIX balance may be used to complete client trade.

### 5.3 No Spread Markup

TRD-01 must not add undisclosed spread markup.

Rules:

1. Client quote must disclose LP-derived price and brokerage/commission/fee.
2. AIX economics are disclosed brokerage/commission only.
3. Rate calculation must preserve evidence of LP quote.
4. Fee is posted through LED-01 under disclosed fee controls.
5. Hidden markup, artificial widening, or principal spread capture is prohibited.

### 5.4 Approved LP Only

LP must be approved, active, configured, and within allowed instruments.

Rules:

1. LP approval status must be active.
2. LP instrument/pair coverage must match.
3. LP connectivity must be healthy.
4. LP outage fails closed.
5. LP cannot be selected if suspended/restricted.
6. LP quote and execution messages must be authenticated and hash captured.

### 5.5 Client Eligibility Before Quote/Trade

Before quote or execution, client must pass:

1. CLT-01 status active/approved.
2. KYC-01 current pass.
3. AML-01 current clear.
4. client class eligible.
5. mandate valid.
6. trading feature enabled by CFG-01.
7. not suspended/frozen/restricted.
8. instrument allowed for client class.
9. limits/risk checks.
10. sufficient available balance or asset before hold.

### 5.6 Quote Validity and Expiry

Quote is time-bound and scope-bound.

Quote binds:

1. client.
2. pair/instrument.
3. side.
4. amount.
5. asset/currency.
6. LP quote reference.
7. LP price.
8. client price.
9. brokerage/commission.
10. validity timestamp.
11. slippage tolerance.
12. quote hash.

Expired quote cannot be accepted.

### 5.7 Prefunded Hold Before LP Execution

LP execution requires LED-01 prefunded hold.

Rules:

1. hold created before LP execution.
2. hold amount covers source asset/currency, fees, tolerance where required.
3. hold is atomic through LED-01.
4. LP execution request must bind hold reference.
5. expired/released hold blocks execution.
6. hold is pinned while execution/settlement in-flight.

### 5.8 AML Pre-Transaction Gate

TRD-01 must verify AML-01 pre-transaction gate where policy requires.

Unknown/stale/revoked AML decision blocks execution.

### 5.9 Trade Acceptance

Trade acceptance requires:

1. unexpired quote.
2. client-side approval where mandate requires.
3. sufficient prefunded hold.
4. AML gate current.
5. client status still eligible.
6. no LP outage.
7. no licence/feature lock breach.
8. quote hash verified.

### 5.10 LP Execution

LP execution must be idempotent and auditable.

Rules:

1. LP execution request uses unique client_order_ref and idempotency key.
2. LP response source authentication and payload hash required.
3. LP order status must be captured.
4. LP fill ID must be captured.
5. duplicate LP result must not duplicate trade.
6. LP timeout results in pending/reconcile, not blind retry that may double execute.
7. cancel/replace must be controlled.

### 5.11 Slippage, Partial Fill and Requote

Slippage beyond tolerance cannot be silently absorbed.

Rules:

1. slippage tolerance must be configured/disclosed.
2. fill outside tolerance routes to requote/void/client confirmation.
3. partial fill follows policy and client consent.
4. unfilled amount hold is released only after terminal result.
5. residual cannot be carried by AIX inventory.
6. no price improvement or worse price can be hidden from client evidence.

### 5.12 Execution Confirmation

Client confirmation must include:

1. trade ID.
2. quote ID.
3. LP execution reference.
4. instrument/pair.
5. side.
6. amount requested.
7. amount filled.
8. price/rate.
9. fee/commission.
10. timestamp.
11. settlement status.
12. cancellation/partial fill reason where applicable.

### 5.13 Settlement Handoff to LED-01

TRD-01 does not post ledger.

It sends controlled settlement handoff to LED-01 with:

1. trade ID.
2. quote ID.
3. LP execution result.
4. hold reference.
5. conversion legs.
6. fill quantities.
7. price/rate.
8. fee disclosure reference.
9. residual/rounding details.
10. evidence hash.
11. SEC-01 audit reference.

### 5.14 Idempotency and Ordering

Every quote, acceptance, LP execution and settlement handoff must be idempotent.

Rules:

1. duplicate client acceptance cannot create duplicate LP order.
2. duplicate LP fill cannot create duplicate client fill.
3. out-of-order LP updates cannot skip required states.
4. same idempotency key/different payload is conflict.
5. retries preserve idempotency.

### 5.15 Reconciliation

TRD-01 must reconcile:

1. client accepted quote.
2. LED prefunded hold.
3. LP execution request.
4. LP execution result.
5. client fill.
6. LED settlement handoff.
7. fee disclosure.
8. residual/rounding.
9. cancelled/expired orders.
10. pending timeouts.

### 5.16 Deployment Controls

TRD-01 is money-flow critical.

Go-live requires:

1. LP connectivity test.
2. instrument/pair allowlist.
3. licence lock test.
4. no Exchange feature proof.
5. mock LP failover/outage test.
6. idempotency/retry test.
7. settlement handoff test.
8. reconciliation evidence.
9. rollback point-of-no-return.
10. money-flow quiescence if deployment affects active execution.

---

## 6. Actors

| Actor | Role |
|---|---|
| Client Trader | Requests/accepts quote |
| Client Approver | Approves trade where mandate requires |
| Operations User | Monitors trades/exceptions |
| Dealer / Trader Staff | Monitors LP execution where allowed |
| Compliance Officer | Reviews AML/licence exceptions |
| Finance User | Reviews fees/reconciliation |
| Super Admin | Limited admin; cannot bypass trade controls |
| LP Service Account | Receives quotes/orders/fills |
| LED-01 Service | Provides hold/settlement controls |
| AML-01 Service | Provides pre-transaction gate |
| CLT-01 Service | Provides client status/mandate |
| System Job | Expiry/reconciliation/timeouts |

---

## 7. Dependencies

### 7.1 Upstream

1. CLT-01 client status/mandate/client class.
2. KYC-01 outcome freshness.
3. AML-01 screening/pre-transaction gate.
4. WLT-01 where destination/withdrawal action involved.
5. LED-01 prefunded hold and settlement handoff.
6. IAM-02 maker-checker/SoD/client dual authorisation.
7. SEC-01 audit.
8. CFG-01 licence/feature lock.
9. FND-01 idempotency/outbox.
10. Approved LP connectivity.

### 7.2 Downstream

1. LED-01 settlement.
2. Client/staff trade views.
3. Reconciliation/reporting.
4. Fee reporting.
5. Compliance evidence.
6. Incident/freeze module.

---

## 8. Components

| Component | Description |
|---|---|
| Instrument / Pair Registry | Allowed instruments and pairs |
| LP Registry | Approved LPs and coverage |
| LP Quote Adapter | Requests and receives LP quotes |
| Quote Engine | Builds client quote and fee disclosure |
| Trade Eligibility Engine | CLT/KYC/AML/CFG/limit checks |
| Quote Acceptance Service | Accepts quote and creates trade |
| LED Hold Adapter | Requests prefunded hold |
| AML Gate Adapter | Verifies AML pre-transaction gate |
| LP Execution Adapter | Sends LP execution order |
| Fill Processing Engine | Handles fill/partial/reject/timeout |
| Slippage / Requote Engine | Applies tolerance and client confirmation |
| Settlement Handoff Service | Sends execution to LED-01 |
| Trade State Machine | Authoritative trade state |
| Fee Disclosure Service | Links fee to quote/trade |
| Reconciliation Jobs | Quote/LP/fill/hold/settlement reconciliation |
| Evidence Export Service | Controlled evidence export |

---

## 9. Functional Requirements

### TRD1-FR-001 Instrument Registry

The platform shall maintain allowed instrument/pair registry.

### TRD1-FR-002 LP Registry

The platform shall maintain approved LP registry and coverage.

### TRD1-FR-003 Client Eligibility

The platform shall validate client status, KYC, AML, mandate, CFG and instrument eligibility.

### TRD1-FR-004 LP Quote Request

The platform shall request quote from approved LP only.

### TRD1-FR-005 Client Quote

The platform shall generate time-bound client quote.

### TRD1-FR-006 Fee Disclosure

The platform shall disclose brokerage/commission/approved fee.

### TRD1-FR-007 Quote Expiry

The platform shall reject expired quote.

### TRD1-FR-008 Quote Acceptance

The platform shall control quote acceptance and client-side approval where required.

### TRD1-FR-009 Prefunded Hold

The platform shall obtain LED-01 prefunded hold before LP execution.

### TRD1-FR-010 AML Gate

The platform shall verify AML-01 pre-transaction gate where required.

### TRD1-FR-011 LP Execution

The platform shall submit execution to approved LP with idempotency.

### TRD1-FR-012 Fill Processing

The platform shall process LP fill, partial fill, reject and timeout.

### TRD1-FR-013 Slippage Control

The platform shall enforce slippage tolerance and requote/void/client confirmation.

### TRD1-FR-014 No Principal / Inventory

The platform shall prevent AIX principal exposure and inventory absorption.

### TRD1-FR-015 No Spread Markup

The platform shall prohibit AIX spread markup and hidden economics.

### TRD1-FR-016 Settlement Handoff

The platform shall send controlled settlement handoff to LED-01.

### TRD1-FR-017 Execution Confirmation

The platform shall provide client execution confirmation.

### TRD1-FR-018 LP Outage Fail-Closed

The platform shall fail closed on LP outage/unavailable route.

### TRD1-FR-019 Idempotency and Ordering

The platform shall enforce idempotency and reject out-of-order state transitions.

### TRD1-FR-020 Reconciliation

The platform shall reconcile quote, hold, LP order, LP fill, client fill and settlement.

### TRD1-FR-021 Evidence Export

The platform shall support sensitive evidence export with SEC-01 logging.

### TRD1-FR-022 No Exchange Features

The platform shall prohibit order book, matching, client-to-client matching and market making.

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Execution model | Agency/back-to-back |
| LP approval | Required |
| Quote expiry | Required |
| Prefunded hold | Required before LP execution |
| AML gate | Required where policy says |
| Principal exposure | Prohibited |
| AIX inventory | Zero |
| Spread markup | Prohibited |
| Client-to-client matching | Prohibited |
| Public order book | Prohibited |
| Matching engine | Prohibited |
| LP outage | Fail closed |
| Slippage control | Required |
| Idempotency | Required |
| Reconciliation | Required |
| Test coverage | Critical controls 100% |

---

## 11. Prohibited Behaviours

TRD-01 must not allow:

1. public order book.
2. matching engine.
3. client-to-client matching.
4. market making.
5. principal dealing.
6. AIX inventory.
7. AIX spread markup.
8. hidden fee/economic benefit.
9. securities/derivatives trade without approval.
10. quote from unapproved LP.
11. quote accepted after expiry.
12. quote accepted without eligible client.
13. LP execution without LED prefunded hold.
14. LP execution with expired/released hold.
15. LP execution with stale AML decision.
16. final client fill without LP fill.
17. partial fill beyond consent/policy.
18. slippage beyond tolerance silently accepted.
19. residual absorbed by AIX.
20. duplicate client acceptance creating duplicate LP order.
21. duplicate LP fill creating duplicate settlement.
22. LP timeout blindly retried causing double execution.
23. settlement handoff without execution evidence.
24. fee posted without disclosure.
25. Super Admin bypass trade controls.
26. Break-glass place trade.
27. Service account approve trade.
28. direct DB trade state edit.
29. LP outage route to unsafe fallback.
30. Exchange locked features enabled.

---

## 12. Acceptance Criteria

TRD-01 is accepted only if:

1. Instrument/pair registry defined.
2. LP registry/coverage defined.
3. Client eligibility defined.
4. LP quote flow defined.
5. Client quote/fee disclosure defined.
6. Quote expiry defined.
7. Quote acceptance defined.
8. LED prefunded hold integration defined.
9. AML gate integration defined.
10. LP execution defined.
11. Fill/partial/reject/timeout handling defined.
12. Slippage/requote/void defined.
13. No principal/inventory/spread controls defined.
14. Settlement handoff to LED-01 defined.
15. Idempotency/ordering defined.
16. Reconciliation defined.
17. No Exchange features defined.
18. Tests defined and passed.

---

## 13. Open Items

1. Final LP list.
2. Final instrument/pair list.
3. Final LP quote/execution API schema.
4. Final quote TTL.
5. Final slippage tolerance by pair/client class.
6. Final partial-fill policy.
7. Final fee schedule/disclosure reference.
8. Final LP outage/manual operation policy.
9. Final settlement handoff schema.
10. Final residual/rounding handoff to LED-01.
11. Final trade limits/risk parameters.
12. Final execution confirmation template.
13. Final LP reconciliation cadence.
