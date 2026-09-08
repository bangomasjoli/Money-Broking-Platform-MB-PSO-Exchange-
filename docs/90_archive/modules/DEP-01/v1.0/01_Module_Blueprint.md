# DEP-01 Deposit Execution / Inbound Receipt
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | DEP-01 |
| Module name | Deposit Execution / Inbound Receipt |
| Pack version | v1.0 |
| Status | Initial module blueprint for Claude Opus review |
| Platform | AIX Money Broking + PSO Platform |
| Licence posture | Money Broking and PSO approved; Exchange pending |
| Module category | Money Tier / Deposit Execution Boundary |
| Depends on | FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2, SEC-01 v1.2, CFG-01 v1.2, CLT-01 v1.2, KYC-01 v1.2, AML-01 v1.2, WLT-01 v1.2, LED-01 v1.2, E2E-01 v1.2 |
| Provides outcome to | WLT-01, AML-01, LED-01, Reconciliation, Reporting |

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


---

## 2. Module Purpose

DEP-01 is the inbound deposit execution boundary.

It detects and records external inbound receipt events from bank/custodian/blockchain sources, deduplicates them, extracts source information, matches them to client/deposit intent, and hands off to WLT-01 / AML-01 / LED-01.

DEP-01 does not decide whether a deposit is clear for credit. It provides authenticated receipt evidence and matching data.

---

## 3. In Scope

DEP-01 covers:

1. Deposit intent/reference creation.
2. Fiat deposit instruction/reference display.
3. Crypto deposit address/reference display from approved custody/address source.
4. Bank webhook/file/API receipt ingestion.
5. Custodian webhook/API receipt ingestion.
6. Blockchain confirmation event ingestion.
7. Inbound receipt authentication and payload hash.
8. Duplicate/replay detection.
9. Source account/wallet extraction where available.
10. Client/reference matching.
11. Mis-attribution detection.
12. Receipt confirmation status.
13. Reorg/recall/reversal detection.
14. WLT-01 inbound source screening handoff.
15. AML-01 source gate handoff where required.
16. LED-01 pending deposit creation.
17. LED-01 deposit credit request only after clear statuses.
18. Quarantine routing.
19. Deposit exception workflow.
20. Deposit reconciliation.
21. SEC-01 audit.
22. E2E saga/correlation integration.

---

## 4. Out of Scope

DEP-01 does not implement:

1. Available balance credit.
2. Double-entry ledger posting.
3. Client money/client asset safeguarding.
4. Wallet risk scoring decision.
5. AML sanctions/PEP/adverse-media decision.
6. FIU/STR filing.
7. Custody private keys.
8. Blockchain signing.
9. Withdrawal/payout execution.
10. Trading/LP execution.
11. Exchange order book.
12. Matching engine.
13. Client-to-client matching.
14. AIX inventory.
15. AIX spread markup.

---

## 5. Critical Principles

### 5.1 No Ledger Credit in DEP-01

DEP-01 must never credit available balance or post ledger.

Rules:

1. DEP-01 may create pending deposit events.
2. DEP-01 may request LED-01 pending deposit creation.
3. DEP-01 may request LED-01 credit evaluation after WLT/AML/source/backing status is clear.
4. LED-01 alone decides and posts ledger credit.
5. DEP-01 must not maintain client available balance.

### 5.2 Authenticated External Receipt Evidence

Every receipt must be authenticated and hash captured.

Rules:

1. webhook/API/file source must be authenticated.
2. source payload hash stored.
3. source event ID stored.
4. source timestamp stored.
5. provider/account/source channel stored.
6. unauthenticated receipt cannot be matched or credited.
7. source evidence is immutable and audit-linked.

### 5.3 Deduplication and Replay Protection

Inbound receipt events must be idempotent.

Rules:

1. `(source_provider, source_event_id, source_transaction_ref)` must be unique.
2. same event/same payload returns existing record.
3. same event/different payload is conflict.
4. replayed event cannot create duplicate pending deposit.
5. duplicate chain confirmations update confirmation count, not deposit amount.

### 5.4 Deposit Matching and Mis-Attribution Guard

Deposit matching must be conservative.

Matching keys may include:

1. client-specific reference.
2. virtual account / sub-account.
3. custody address/tag/memo.
4. bank sender account.
5. amount.
6. asset/currency.
7. expected window.
8. deposit intent ID.

Rules:

1. ambiguous match routes to review/quarantine.
2. no match routes to unmatched deposit queue.
3. multiple candidate clients cannot auto-credit.
4. source mismatch cannot auto-credit.
5. DEP-01 must not force match to clear reconciliation.

### 5.5 Source Extraction for WLT / AML

DEP-01 must capture inbound source details where available.

Crypto source data:

1. source address.
2. tx hash.
3. chain/network.
4. asset.
5. amount.
6. confirmations.
7. VASP/custodian metadata where available.

Fiat source data:

1. sender account/IBAN/account number hash.
2. sender name.
3. bank identifier.
4. payment reference.
5. currency.
6. amount.
7. value date.
8. remitter country where available.

### 5.6 Confirmation Policy

Deposit confirmation is external-source-specific.

Rules:

1. fiat bank receipt may have pending/settled/recalled/corrected states.
2. crypto receipt requires configured confirmation threshold by chain/asset.
3. custodian receipt follows custodian confirmation model.
4. unconfirmed receipt cannot be available balance.
5. confirmation threshold change requires approval.
6. confirmation is evidence for LED-01, not credit authority.

### 5.7 WLT / AML / LED Handoff

DEP-01 must hand off, not decide.

Required handoffs:

1. WLT-01 inbound source screening.
2. AML-01 source/counterparty gate where required.
3. LED-01 pending deposit creation.
4. LED-01 credit evaluation after WLT/AML/confirmation status clear.
5. E2E saga update.

### 5.8 Quarantine and Exception

Deposit must be quarantined/held if:

1. source unscreened.
2. source high risk/sanctioned.
3. source/client mismatch.
4. no matching client.
5. multiple matching clients.
6. unsupported chain/asset.
7. confirmation insufficient.
8. payload authentication failed.
9. value differs materially from deposit intent.
10. client is frozen/suspended/restricted.

### 5.9 Reorg / Recall / Reversal

DEP-01 must notify LED-01 of external reversal events.

Events:

1. chain reorg.
2. dropped/replaced transaction.
3. custodian reversal.
4. fiat recall.
5. bank correction.
6. chargeback/return.
7. duplicate correction.

Rules:

1. reversal event is not ignored after credit.
2. LED-01 clawback flow is triggered.
3. DEP-01 preserves original and reversal evidence.
4. client-facing status must not hide reversal.

### 5.10 E2E Saga / Correlation

Every deposit event must bind to an E2E correlation ID.

Rules:

1. deposit intent creates or receives correlation ID.
2. external receipt attaches to correlation if matched.
3. unmatched deposit receives temporary correlation and case ID.
4. all handoffs share same correlation ID.
5. SEC audit events use same correlation ID.
6. orphaned pending deposits are detected by E2E sweeper.

### 5.11 Fail-Closed Vendor / Source Outage

If bank/custodian/chain source is unavailable or unreliable:

1. no automatic credit.
2. deposit remains pending.
3. degraded status is audit logged.
4. manual evidence requires maker-checker.
5. operations cannot bypass WLT/AML/LED.

### 5.12 Data Minimisation

DEP-01 stores source data required for matching, screening, evidence and reconciliation, with hashing/masking where possible.

---

## 6. Actors

| Actor | Role |
|---|---|
| Client | Initiates deposit intent / sends funds/assets |
| Operations User | Reviews unmatched/quarantined deposits |
| Finance User | Reviews deposit reconciliation |
| Compliance Officer / MLRO | Reviews source risk/AML deposit issues |
| Super Admin | Limited config only; cannot credit balance |
| Bank Service Account | Sends fiat receipt events |
| Custodian Service Account | Sends custody receipt events |
| Chain Indexer Service | Sends blockchain confirmation events |
| WLT-01 Service | Screens inbound source |
| AML-01 Service | Performs source/counterparty AML gate |
| LED-01 Service | Creates pending deposit and ledger credit |
| E2E Saga Service | Tracks deposit saga/correlation |
| SEC-01 Service | Receives audit events |

---

## 7. Dependencies

### 7.1 Upstream

1. FND-01 correlation/idempotency/outbox.
2. IAM-01 authenticated staff/client sessions.
3. IAM-02 permission/maker-checker.
4. SEC-01 audit.
5. CFG-01 deposit feature/licence lock.
6. CLT-01 client status/mandate.
7. KYC-01 verified client identity.
8. AML-01 source/counterparty gate.
9. WLT-01 inbound source screening.
10. LED-01 pending deposit / credit / clawback.
11. E2E-01 saga / evidence bundle.
12. Bank/custodian/chain providers.

### 7.2 Downstream

1. WLT-01 inbound source screening.
2. AML-01 AML gate.
3. LED-01 pending deposit / credit / clawback.
4. Reconciliation/finance reporting.
5. Client/staff portal deposit status.
6. Incident/freeze/recovery module.

---

## 8. Components

| Component | Description |
|---|---|
| Deposit Intent Service | Creates client deposit intent/reference |
| Deposit Instruction Service | Shows approved deposit rail/address/reference |
| Fiat Receipt Ingestion Adapter | Ingests bank statements/webhooks/API |
| Custodian Receipt Ingestion Adapter | Ingests custodian deposit events |
| Chain Receipt Ingestion Adapter | Ingests blockchain tx confirmations |
| Receipt Authentication Service | Verifies source authenticity |
| Receipt Deduplication Engine | Prevents duplicate/replay events |
| Source Extraction Service | Extracts source account/wallet metadata |
| Deposit Matching Engine | Matches receipt to client/intent |
| Mis-Attribution Guard | Prevents ambiguous/wrong client attribution |
| WLT Source Screening Adapter | Sends source data to WLT-01 |
| AML Source Gate Adapter | Sends source/counterparty data to AML-01 |
| LED Pending Deposit Adapter | Creates pending deposit in LED-01 |
| LED Credit Request Adapter | Requests credit evaluation after clear status |
| Reversal / Recall Detector | Captures reorg/recall/reversal events |
| Quarantine Case Service | Manages held/unmatched deposits |
| Deposit Reconciliation Jobs | Reconciles source/WLT/AML/LED events |
| Evidence Export Service | Controlled evidence export |

---

## 9. Functional Requirements

### DEP1-FR-001 Deposit Intent

The platform shall create deposit intent/reference for client deposits.

### DEP1-FR-002 Receipt Ingestion

The platform shall ingest fiat, custodian and chain receipt events.

### DEP1-FR-003 Receipt Authentication

The platform shall authenticate receipt source and hash payload.

### DEP1-FR-004 Deduplication

The platform shall prevent duplicate/replayed receipt events.

### DEP1-FR-005 Source Extraction

The platform shall extract source account/wallet metadata where available.

### DEP1-FR-006 Deposit Matching

The platform shall match deposits conservatively to client/intent/reference.

### DEP1-FR-007 Mis-Attribution Guard

The platform shall quarantine ambiguous, unmatched or mismatched deposits.

### DEP1-FR-008 Confirmation Tracking

The platform shall track confirmation/settlement status by source type.

### DEP1-FR-009 WLT Handoff

The platform shall send inbound source data to WLT-01 for screening.

### DEP1-FR-010 AML Handoff

The platform shall send source/counterparty data to AML-01 where required.

### DEP1-FR-011 LED Pending Deposit

The platform shall request LED-01 pending deposit creation.

### DEP1-FR-012 LED Credit Evaluation

The platform shall request LED-01 credit evaluation only after clear source and confirmation status.

### DEP1-FR-013 Quarantine

The platform shall quarantine deposits with unresolved risk/match/confirmation issues.

### DEP1-FR-014 Reversal / Recall

The platform shall detect reorg/recall/reversal and notify LED-01 clawback.

### DEP1-FR-015 Reconciliation

The platform shall reconcile external receipt, DEP record, WLT/AML decisions and LED deposit state.

### DEP1-FR-016 Audit

The platform shall emit SEC-01 audit events for all critical deposit actions.

### DEP1-FR-017 E2E Saga

The platform shall bind deposit flow to E2E correlation ID and saga step records.

### DEP1-FR-018 No Ledger Credit

The platform shall prohibit DEP-01 from posting ledger or crediting available balance.

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Ledger credit | Prohibited in DEP-01 |
| Receipt authentication | Required |
| Payload hash | Required |
| Deduplication | Required |
| Mis-attribution guard | Required |
| Source screening | WLT/AML handoff |
| Confirmation threshold | Configured / approved |
| Quarantine | Required |
| Reorg/recall detection | Required |
| Idempotency | Required |
| Correlation ID | Required |
| Audit | SEC-01 integrated |
| Reconciliation | Required |
| Test coverage | Critical controls 100% |

---

## 11. Prohibited Behaviours

DEP-01 must not allow:

1. ledger posting.
2. available balance credit.
3. direct balance edit.
4. auto-credit from unauthenticated receipt.
5. duplicate receipt double-credit.
6. ambiguous deposit auto-match.
7. unmatched deposit auto-credit.
8. source mismatch auto-credit.
9. unconfirmed crypto receipt credit request.
10. recalled/reorged receipt ignored.
11. WLT screening bypass.
12. AML gate bypass where required.
13. LED credit request before WLT/AML/confirmation clear.
14. manual evidence credit without maker-checker.
15. Super Admin deposit credit.
16. service account match override.
17. source payload mutation.
18. deleting original receipt evidence.
19. unsupported asset/chain auto-credit.
20. frozen client deposit credited.
21. missing correlation ID.
22. SEC audit failure ignored.
23. Exchange feature activation.
24. AIX principal/inventory use.
25. AIX spread markup.

---

## 12. Acceptance Criteria

DEP-01 is accepted only if:

1. Deposit intent/reference defined.
2. Receipt ingestion defined.
3. Receipt authentication defined.
4. Deduplication defined.
5. Source extraction defined.
6. Deposit matching defined.
7. Mis-attribution guard defined.
8. Confirmation tracking defined.
9. WLT handoff defined.
10. AML handoff defined.
11. LED pending deposit handoff defined.
12. LED credit evaluation handoff defined.
13. Quarantine workflow defined.
14. Reversal/recall detection defined.
15. Reconciliation defined.
16. E2E saga/correlation integration defined.
17. SEC audit defined.
18. No ledger credit in DEP defined.
19. Tests defined and passed.

---

## 13. Open Items

1. Final bank integration method.
2. Final custodian integration method.
3. Final chain/indexer provider.
4. Final virtual account/reference model.
5. Final supported asset/chain list.
6. Final confirmation threshold per chain/asset.
7. Final fiat settlement/finality status definitions.
8. Final source metadata availability by provider.
9. Final deposit SLA/quarantine SLA.
10. Final manual evidence acceptance policy.
11. Final deposit instruction wording.
12. Final client notification wording.
