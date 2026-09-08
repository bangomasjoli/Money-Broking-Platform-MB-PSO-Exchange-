# WDR-01 Withdrawal / Payout Execution Rail
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | WDR-01 |
| Module name | Withdrawal / Payout Execution Rail |
| Pack version | v1.0 |
| Status | Initial module blueprint for Claude Opus review |
| Platform | AIX Money Broking + PSO Platform |
| Licence posture | Money Broking and PSO approved; Exchange pending |
| Module category | Money Tier / Outbound Execution Boundary |
| Depends on | FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2, SEC-01 v1.2, CFG-01 v1.2, CLT-01 v1.2, KYC-01 v1.2, AML-01 v1.2, WLT-01 v1.2, LED-01 v1.2, E2E-01 v1.2, DEP-01 v1.2 |
| Provides outcome to | LED-01, WLT-01, AML-01, Reconciliation, Reporting, Client/Staff Portal |

Accepted baseline:
- FND-01 Platform Foundation v1.2 — Accepted
- IAM-01 Authentication / MFA / Session v1.2 — Accepted
- IAM-02 RBAC / Permission Guard / SoD v1.2 — Accepted
- SEC-01 Audit Log / Security Monitoring v1.2 — Accepted
- CFG-01 Feature Flag / Licence Lock v1.2 — Accepted
- CLT-01 Client Onboarding / Client Profile v1.2 — Accepted
- KYC-01 KYC / KYB Verification v1.2 — Accepted
- AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening v1.2 — Accepted
- WLT-01 Wallet Screening / Payout Destination Whitelist v1.2 — Accepted
- LED-01 Ledger / Settlement / Safeguarding v1.2 — Accepted
- TRD-01 Quote / Trade / LP Execution v1.2 — Accepted
- E2E-01 Cross-Module End-to-End Fund-Flow Review v1.2 — Accepted
- DEP-01 Deposit Execution / Inbound Receipt v1.2 — Accepted


---

## 2. Module Purpose

WDR-01 is the outbound payout execution boundary.

It executes withdrawals/payouts only after WLT-01, AML-01, IAM-02, CFG-01 and LED-01 controls have passed. It submits externally signed/authorised instructions to banks, custodians, chains or payment rails, then returns execution and finality evidence to LED-01.

WDR-01 does not approve the payout, does not screen the destination, and does not post ledger. It executes only controlled instructions.

---

## 3. In Scope

WDR-01 covers:

1. Payout/withdrawal execution request intake.
2. Rail/provider eligibility validation.
3. WLT-01 destination decision validation.
4. AML-01 pre-transaction gate validation.
5. Travel Rule payload validation where applicable.
6. LED-01 reserve/hold validation.
7. CFG-01 licence/feature/kill-switch revalidation.
8. IAM-02 maker-checker and client dual authorisation verification.
9. External rail instruction creation.
10. Provider credential/signing/key reference.
11. Payment file/API/blockchain/custodian instruction transmission.
12. Instruction idempotency and replay protection.
13. Execution status tracking.
14. Rail finality/settlement confirmation.
15. Failed/returned/reversed instruction handling.
16. Late confirmation handling.
17. Payout cancellation where rail permits.
18. External recall/return handling.
19. Reconciliation between request, reserve, WLT/AML decisions, external rail and LED settlement.
20. E2E saga/correlation.
21. SEC-01 audit.

---

## 4. Out of Scope

WDR-01 does not implement:

1. Wallet screening decision.
2. Payout destination whitelist decision.
3. AML/sanctions/PEP/adverse media decision.
4. Travel Rule compliance decision.
5. Ledger posting.
6. Client available balance.
7. Client money/client asset safeguarding.
8. Deposit receipt.
9. Trading/LP execution.
10. Exchange order book.
11. Matching engine.
12. Market making.
13. Principal dealing.
14. AIX inventory.
15. AIX spread markup.

---

## 5. Critical Principles

### 5.1 Execution Boundary Only

WDR-01 executes approved outbound instructions. It does not approve payout eligibility.

Rules:

1. WDR-01 cannot create payout from client balance independently.
2. WDR-01 cannot bypass LED reserve.
3. WDR-01 cannot bypass WLT destination decision.
4. WDR-01 cannot bypass AML pre-transaction gate.
5. WDR-01 cannot post ledger settlement.
6. LED-01 remains source of truth for reserve, settlement and journal.

### 5.2 LED Reserve / Hold Required Before Instruction

No external rail instruction may be sent without valid LED reserve or payout settlement instruction.

Rules:

1. LED reserve must be active and bound to correlation ID.
2. reserve amount, asset/currency, client and destination must match payout request.
3. reserve cannot be expired/released/consumed.
4. WDR-01 must not submit if LED reserve is stale or invalid.
5. reserve remains pinned until terminal execution status or controlled cancellation.

### 5.3 WLT Verify-And-Consume Required

Destination eligibility must be validated through WLT-01.

Rules:

1. WLT decision must be current.
2. WLT decision must be verify-and-consumed for this execution action.
3. decision must bind client, destination, asset, chain/rail, amount, action and correlation.
4. reused WLT decision for different amount/destination/action is blocked.
5. WLT revocation blocks execution and may interrupt in-flight payout.

### 5.4 AML / Sanctions / Travel Rule Gate

WDR-01 must validate AML-01 pre-transaction gate before instruction.

Rules:

1. AML decision must be current.
2. AML decision must bind same client/destination/amount/asset/correlation.
3. sanctions hit or stale AML decision blocks execution.
4. Travel Rule data must be complete where required.
5. missing/incomplete Travel Rule data routes to hold/review.
6. AML/WLT revocation while in-flight triggers interrupt/quarantine/recovery workflow.

### 5.5 CFG / IAM Runtime Controls

WDR-01 must revalidate:

1. CFG-01 payout/withdrawal feature.
2. CFG-01 licence/kill-switch.
3. IAM-02 permission.
4. IAM-02 maker-checker.
5. IAM-02 client dual authorisation where mandate requires.
6. SoD restrictions.

### 5.6 External Rail Provider Trust

Rail/provider instruction must use approved provider and authenticated channel.

Rules:

1. provider must be approved/active.
2. rail/currency/asset/chain must be supported.
3. instruction payload must be signed or authenticated.
4. provider key/credential reference must be valid.
5. file/API sequence and acknowledgement tracked.
6. failed provider authentication blocks instruction.

### 5.7 Idempotency and Replay Protection

Outbound execution must be idempotent.

Rules:

1. unique payout execution reference.
2. unique provider instruction ID where possible.
3. same idempotency key/same payload returns existing result.
4. same idempotency key/different payload rejects.
5. duplicate provider acknowledgement cannot duplicate settlement.
6. timeout is indeterminate and requires provider query-back before retry/release.

### 5.8 Payout Finality / Rail Status Model

WDR-01 must model rail finality per provider/rail.

States may include:

1. created.
2. submitted.
3. acknowledged.
4. processing.
5. executed.
6. pending_finality.
7. final.
8. failed.
9. returned.
10. reversed.
11. cancelled.
12. unknown/reconcile_required.

Rules:

1. provider acknowledgement is not finality unless provider model says so.
2. blockchain broadcast is not finality until confirmation threshold/finality model passes.
3. bank sent status may not equal beneficiary receipt.
4. LED-01 settlement outcome must reflect actual rail evidence.
5. unknown status triggers query-back/reconciliation.

### 5.9 Failed / Returned / Reversed Payout

WDR-01 must detect and report:

1. rejected instruction.
2. provider failure.
3. bank return.
4. blockchain dropped/replaced transaction.
5. custodian reversal.
6. sanctions freeze after instruction.
7. beneficiary rejection.
8. wrong network/unsupported destination failure.

Rules:

1. notify LED-01 immediately.
2. preserve original and return evidence.
3. do not auto-release reserve unless LED decides.
4. reversal/return must bind original correlation/saga.
5. possible return to client balance requires LED ledger decision.

### 5.10 Cancellation

Cancellation is allowed only where rail/provider permits and before irreversible finality.

Rules:

1. cancellation requires IAM maker-checker if manual.
2. provider cancellation status must be confirmed.
3. LED reserve release occurs only via LED.
4. cancelled instruction remains auditable.
5. late execution after cancellation routes to exception.

### 5.11 No Principal Funding

WDR-01 cannot use AIX funds or operational accounts to complete client payout.

Rules:

1. payout funding must come from LED reserved client funds/assets.
2. no operational/suspense account may fund client payout.
3. shortfall routes to exception.
4. WDR-01 cannot "make client whole" outside LED.

### 5.12 E2E Saga / Correlation

Every payout execution must bind to one E2E correlation ID and saga step.

Rules:

1. all WLT/AML/LED/IAM/CFG decisions share same correlation.
2. instruction, provider ack, finality, return and LED settlement share same correlation.
3. orphaned instructions are detected by E2E sweeper.
4. SEC expected-vs-emitted event manifest includes WDR events.

### 5.13 Freeze / Kill-Switch Handling

If freeze or kill-switch occurs:

1. block new instructions.
2. identify in-flight payouts.
3. stop next forward action where possible.
4. query/cancel provider if possible.
5. if irreversible, quarantine/escalate.
6. notify LED-01 and E2E saga.
7. resume only after recovery gate.

### 5.14 Return-To-Source / Refund Dependency

Where DEP-01 or Operations requires return of unmatched/rejected deposit, WDR-01 executes only through same payout controls.

Rules:

1. no direct return shortcut.
2. return to sanctioned/frozen source may be prohibited.
3. WLT/AML/LED controls still required.
4. Compliance/legal review required for restricted source.

---

## 6. Actors

| Actor | Role |
|---|---|
| Client | Initiates/authorises withdrawal |
| Client Approver | Dual authorises where mandate requires |
| Operations User | Monitors exceptions |
| Finance User | Reviews payout reconciliation |
| Compliance Officer / MLRO | Reviews sanctions/AML/Travel Rule holds |
| Super Admin | Limited config only; cannot bypass payout controls |
| Bank Service Account | Receives fiat payout instruction |
| Custodian Service Account | Receives digital asset payout instruction |
| Chain/Broadcast Service | Broadcasts blockchain transfer if applicable |
| WLT-01 Service | Destination verify-and-consume |
| AML-01 Service | Pre-transaction gate / Travel Rule |
| LED-01 Service | Reserve, settlement, journal |
| E2E Saga Service | Correlation/saga/orphan sweeper |
| SEC-01 Service | Audit events |

---

## 7. Dependencies

### 7.1 Upstream

1. FND-01 correlation/idempotency/outbox.
2. IAM-01 authentication/session/MFA.
3. IAM-02 permission, maker-checker, SoD and client dual authorisation.
4. SEC-01 audit.
5. CFG-01 licence/feature/kill-switch.
6. CLT-01 client status/mandate.
7. KYC-01 verified client/beneficiary data.
8. AML-01 pre-transaction gate and Travel Rule.
9. WLT-01 payout destination verify-and-consume.
10. LED-01 reserve/settlement/journal.
11. E2E-01 saga / decision-bundle / evidence.
12. Bank/custodian/chain/payment rail providers.

### 7.2 Downstream

1. LED-01 execution result/finality.
2. WLT-01 destination usage evidence.
3. AML-01 Travel Rule / monitoring evidence.
4. Reconciliation/finance reporting.
5. Client/staff portal payout status.
6. Incident/freeze/recovery module.

---

## 8. Components

| Component | Description |
|---|---|
| Payout Execution Intake Service | Receives authorised payout execution request |
| Decision Bundle Validator | Validates WLT/AML/LED/CFG/IAM coherent bundle |
| WLT Decision Adapter | Validates destination verify-and-consume |
| AML Gate Adapter | Validates AML/Travel Rule |
| LED Reserve Adapter | Validates reserve and reports outcomes |
| Rail Routing Engine | Selects approved rail/provider |
| Provider Instruction Builder | Builds provider payload |
| Provider Authentication Service | Signs/authenticates instruction |
| Provider Transmission Adapter | Sends API/file/custodian/chain instruction |
| Idempotency / Replay Guard | Prevents duplicate instruction |
| Provider Query-Back Service | Resolves timeout/unknown state |
| Payout Finality Engine | Tracks provider/rail finality |
| Cancellation Controller | Cancels where possible |
| Return / Reversal Handler | Handles failed/returned/reversed payouts |
| Freeze / Kill-Switch Handler | Handles freeze propagation |
| E2E Saga Adapter | Updates saga/correlation |
| Reconciliation Jobs | Reconciles payout chain |
| Evidence Export Service | Controlled evidence export |

---

## 9. Functional Requirements

### WDR1-FR-001 Execution Intake

The platform shall receive payout/withdrawal execution request only from authorised workflow or LED-controlled process.

### WDR1-FR-002 Decision Bundle Validation

The platform shall validate coherent WLT/AML/LED/CFG/IAM decision bundle before external instruction.

### WDR1-FR-003 WLT Verify-And-Consume

The platform shall require current WLT destination verify-and-consume decision.

### WDR1-FR-004 AML Gate

The platform shall require current AML pre-transaction gate and Travel Rule status where applicable.

### WDR1-FR-005 LED Reserve Validation

The platform shall require active LED reserve/hold before instruction.

### WDR1-FR-006 CFG/IAM Validation

The platform shall revalidate CFG licence/feature and IAM authorisation before instruction.

### WDR1-FR-007 Rail Routing

The platform shall route only to approved rail/provider.

### WDR1-FR-008 Provider Authentication

The platform shall sign/authenticate provider instruction and validate provider trust.

### WDR1-FR-009 Instruction Idempotency

The platform shall enforce idempotency and replay protection.

### WDR1-FR-010 Provider Transmission

The platform shall transmit instruction to provider and store payload hash.

### WDR1-FR-011 Query-Back

The platform shall resolve timeout/unknown status by provider query-back.

### WDR1-FR-012 Finality Tracking

The platform shall track rail/provider finality and report to LED.

### WDR1-FR-013 Failure / Return / Reversal

The platform shall detect failure, return or reversal and notify LED.

### WDR1-FR-014 Cancellation

The platform shall support controlled cancellation where provider permits.

### WDR1-FR-015 No Principal Funding

The platform shall prohibit payout funding from AIX operational/principal accounts.

### WDR1-FR-016 E2E Saga

The platform shall bind payout execution to E2E correlation/saga.

### WDR1-FR-017 Freeze Handling

The platform shall apply freeze/kill-switch in-flight handling.

### WDR1-FR-018 Reconciliation

The platform shall reconcile request, decisions, reserve, external instruction, finality and LED settlement.

### WDR1-FR-019 Audit

The platform shall emit SEC-01 audit for all critical actions.

### WDR1-FR-020 Return-To-Source Controls

The platform shall route return/refund flows through WLT/AML/LED controls.

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Ledger posting | Prohibited in WDR-01 |
| Destination decision | WLT verify-and-consume required |
| AML gate | Required |
| Travel Rule | Required where applicable |
| LED reserve | Required before instruction |
| Provider trust | Required |
| Idempotency | Required |
| Timeout handling | Query-back required |
| Finality | Per rail/provider |
| Principal funding | Prohibited |
| Correlation ID | Required |
| Audit | SEC-01 integrated |
| Reconciliation | Required |
| Test coverage | Critical controls 100% |

---

## 11. Prohibited Behaviours

WDR-01 must not allow:

1. payout instruction without LED reserve.
2. payout instruction without WLT verify-and-consume.
3. payout instruction without AML gate where required.
4. payout instruction without Travel Rule where required.
5. payout instruction after CFG kill-switch.
6. payout instruction after client freeze.
7. payout instruction to revoked destination.
8. payout instruction with stale WLT/AML decision.
9. payout instruction from WDR-created balance.
10. ledger posting.
11. direct balance edit.
12. operational account funding client payout.
13. Super Admin payout bypass.
14. service account approval.
15. maker-checker bypass.
16. duplicate payout instruction from retry.
17. timeout blind retry.
18. released/expired LED reserve used for payout.
19. provider instruction without authenticated channel.
20. file/API instruction sequence gap ignored.
21. final confirmation before actual rail finality.
22. return/reversal ignored.
23. reserve auto-release by WDR.
24. payout cancellation after irreversible finality treated as cancelled.
25. late execution after cancellation ignored.
26. return-to-source shortcut without payout controls.
27. sanctioned-source return without Compliance/legal review.
28. Exchange order book/matching.
29. AIX principal dealing.
30. AIX spread markup.

---

## 12. Acceptance Criteria

WDR-01 is accepted only if:

1. Execution intake defined.
2. Decision-bundle validation defined.
3. WLT verify-and-consume integration defined.
4. AML/Travel Rule integration defined.
5. LED reserve validation defined.
6. CFG/IAM runtime validation defined.
7. Rail/provider routing defined.
8. Provider authentication defined.
9. Idempotency/replay protection defined.
10. Query-back timeout handling defined.
11. Finality tracking defined.
12. Failure/return/reversal defined.
13. Cancellation defined.
14. No principal funding defined.
15. E2E saga/correlation defined.
16. Freeze/kill-switch handling defined.
17. Reconciliation defined.
18. SEC audit defined.
19. Return-to-source controls defined.
20. Tests defined and passed.

---

## 13. Open Items

1. Final payout rails/providers.
2. Final bank file/API format.
3. Final custodian/chain transfer format.
4. Final Travel Rule provider/schema.
5. Final rail finality models.
6. Final cancellation capability by rail.
7. Final provider query-back endpoints.
8. Final provider key management approach.
9. Final payout SLA and timeout thresholds.
10. Final client notification wording.
11. Final return/refund procedure.
12. Final sanctions freeze legal handling.
