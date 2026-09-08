# DEP-01 Deposit Execution / Inbound Receipt
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | DEP-01 |
| Module name | Deposit Execution / Inbound Receipt |
| Pack version | v1.0 |
| Status | Revised after Claude Opus review; screening-bundle freshness, source-of-funds binding, finality model, provider-authentication trust model and matching/amount integrity added |
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


### 5.13 Credit-Request Coherent Screening Bundle

DEP-01 must not request LED-01 credit evaluation using stale durable screening references.

At the instant of LED credit evaluation request, DEP-01 must assemble and revalidate a coherent bundle containing:

1. WLT-01 inbound source screening decision.
2. AML-01 source/counterparty decision.
3. confirmation/finality evidence.
4. client eligibility status.
5. deposit match status.
6. E2E point-in-time snapshot.
7. correlation ID.
8. amount, asset/currency, rail/chain.
9. revocation epochs.

Rules:

1. bundle must share same correlation ID.
2. bundle must share same client ID.
3. bundle must share same amount and asset/currency.
4. WLT/AML decisions must be within freshness window.
5. WLT/AML decisions must not be revoked.
6. confirmation/finality evidence must be current.
7. mixed snapshot/bundle is fail-closed.
8. stale stored references are not sufficient.
9. failed bundle validation pulls deposit to quarantine before LED credit.

Parameters:

```txt
credit_request_revalidates   = coherent_bundle_wlt_aml_confirmation
screening_decision_freshness = window_bound_not_durable_ref
decl_deposit_on_revocation   = pull_back_to_quarantine
```

### 5.14 AML / WLT Revocation Subscription for In-Flight Deposits

DEP-01 must subscribe to AML-01 and WLT-01 revocation/new-hit/list-update signals.

Rules:

1. affected in-flight deposit is immediately marked review/quarantine.
2. pending LED credit request is cancelled or blocked.
3. if LED credit already occurred, notify LED-01 clawback/restriction pathway.
4. E2E saga is updated.
5. SEC-01 audit event is emitted.
6. revocation cannot be ignored because original decision ref was clear.

Parameters:

```txt
revocation_subscription = aml_and_wlt_for_inflight_deposits
```

### 5.15 Inbound Source-of-Funds / Own-Source Binding

DEP-01 must treat inbound deposit source as Source-of-Funds evidence.

Rules:

1. inbound source must be compared to the client's KYC-verified own account/wallet where available.
2. own-source match may proceed to screening/finality.
3. third-party source is not auto-credit.
4. unexpected source routes to SoF review.
5. approved third-party source requires Compliance/MLRO review and evidence.
6. large or first deposit requires SoF/SoW evidence linkage according to policy.
7. inbound own-source discipline mirrors WLT outbound own-name discipline.

Parameters:

```txt
inbound_source_binding = client_own_kyc_verified_account_wallet
third_party_source     = flag_for_sof_review_not_auto_credit
sof_sow_evidence       = linked_for_large_or_first_deposit
own_source_symmetry    = mirror_wlt_outbound_own_name
```

### 5.16 Per-Source Finality Model

DEP-01 must not treat confirmation count or provider flag as universal finality.

Crypto finality requires:

1. chain-specific finality model.
2. reorg-depth awareness.
3. configured confirmation threshold.
4. multi-source/indexer corroboration for high-risk assets/amounts.
5. dropped/replaced/reorg event monitoring.
6. chain/custodian status consistency.

Fiat finality requires:

1. value date.
2. settlement status.
3. clearing/return/recall window.
4. risk acceptance if credit requested before return window closes.
5. bank correction/recall monitoring.

Rules:

1. finality signal to LED is evidence, not credit authority.
2. economic finality status must be explicit.
3. insufficient finality blocks LED credit evaluation unless approved risk policy exists.
4. finality model changes are governed by CFG-01.

Parameters:

```txt
crypto_finality        = reorg_depth_aware + multi_source_corroboration
fiat_finality          = return_window_aware_not_just_settled_flag
finality_signal_to_led = evidence_only_after_true_finality
```

### 5.17 Provider Identity and Fabricated-Receipt Protection

Receipt authentication must bind to provider identity and independent truth.

Rules:

1. provider signing identity / HMAC / mTLS or equivalent must be verified.
2. provider keys must have rotation and expiry.
3. source account/feed identity must be allowlisted.
4. file feeds require sequence/completeness checks.
5. missing files/sequences create reconciliation break.
6. fabricated receipt risk must be mitigated by independent bank/chain/custodian truth reconciliation.
7. failed authentication triggers alert/abuse monitoring.
8. a webhook alone is not enough to request credit if independent truth is unavailable.

Parameters:

```txt
receipt_authentication   = provider_signing_identity + key_rotation
file_feed                = completeness_and_missing_sequence_detection
fabricated_receipt_guard = reconcile_to_independent_onchain_or_bank_truth
failed_auth              = alert_and_abuse_monitor
```

### 5.18 Reference / Address / Correlation Integrity

Deposit intent and receipt matching must prevent wrong-correlation binding.

Rules:

1. unique-per-intent reference/address/tag is required where supported.
2. reusable/pooled addresses require strict memo/tag/reference policy.
3. address reuse policy must be explicit.
4. receipt to expired/cancelled intent routes to quarantine/review.
5. wrong or missing memo/tag routes to quarantine/review.
6. correlation ID cannot be inferred loosely.
7. manual correlation override requires maker-checker and evidence.
8. stale/expired intent cannot auto-credit.

Parameters:

```txt
intent_reference       = unique_per_intent
address_reuse_policy   = defined
expired_intent_deposit = quarantine_review_not_auto_credit
```

### 5.19 Amount Disposition Policy

Actual deposit amount must be evaluated against expected amount and policy.

Cases:

1. exact amount.
2. partial deposit.
3. overpayment.
4. underpayment.
5. dust / below minimum.
6. materially unexpected amount.
7. split deposits.
8. multiple deposits to one intent.

Rules:

1. unexpected value routes to review unless policy explicitly allows.
2. overpayment may trigger SoF/AML review.
3. underpayment/partial remains pending or adjusted per policy.
4. dust below minimum is handled by approved disposition.
5. no silent credit of unexpected excess value.
6. amount disposition is included in credit-request bundle.

Parameters:

```txt
amount_disposition = partial_over_under_dust_defined
unexpected_value   = route_to_review
```

### 5.20 Inbound Travel Rule Capture

Where the inbound source is a VASP or Travel Rule applies, DEP-01 must capture and hand off Travel Rule data to AML-01.

Required where available/applicable:

1. originator name.
2. originator account/wallet.
3. originator VASP.
4. beneficiary/client.
5. transaction reference.
6. asset/currency.
7. amount.
8. jurisdiction/source country.
9. missing-data reason.

### 5.21 LED Pending Creation Timing and Orphan Control

LED pending creation must avoid creating unbounded orphaned deposits.

Rules:

1. preferred timing: create LED pending after authenticated and matched receipt.
2. if pending is created before match for operational reasons, it must be labelled unmatched and sweepable.
3. E2E orphan sweeper must reap unmatched LED pending deposits within SLA.
4. spoofed/rejected receipts must not leave active LED pending deposit.
5. LED pending cannot become available balance without credit evaluation.

Parameters:

```txt
led_pending_creation = on_match_or_sweeper_reaped
```

### 5.22 Unmatched / Rejected Deposit Return Path

Returning funds/assets is itself a payout/withdrawal-type controlled action.

Rules:

1. no automatic return-to-source from DEP.
2. return requires WLT/AML/LED payout controls.
3. return to sanctioned/frozen source may be legally prohibited.
4. Compliance/legal review required for sanctioned/high-risk sources.
5. original deposit evidence remains retained.

Parameters:

```txt
unmatched_return_path = via_wlt_aml_led_payout_controls
```

### 5.23 Credit-Time Eligibility Recheck

Client eligibility must be rechecked at credit-request time.

Rules:

1. deposit intent eligibility is not enough.
2. CLT status, KYC freshness, AML status, freeze/restriction and CFG deposit feature are rechecked.
3. deposit for now-frozen/suspended client is quarantined or held.
4. credit-time eligibility is part of coherent bundle.

Parameters:

```txt
credit_time_eligibility = rechecked_frozen_client_quarantined
```

### 5.24 Reversal Binds Original Correlation and Saga

Reorg/recall/reversal must bind back to the original receipt, deposit, correlation and saga.

Rules:

1. reversal event carries original correlation ID.
2. reversal event carries original deposit ID and LED journal/credit ref if any.
3. E2E saga/value conservation is updated.
4. LED clawback/shortfall can trace original client and downstream use.
5. SEC audit links original and reversal events.

Parameters:

```txt
reversal_binds = original_correlation_and_saga
```

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
| Screening Bundle Validator | Revalidates WLT/AML/finality/client bundle at credit request |
| AML/WLT Revocation Subscriber | Pulls in-flight deposits back to quarantine on revocation |
| Source-of-Funds Binder | Binds inbound source to KYC-verified own source or SoF review |
| Finality Model Engine | Per-source finality, reorg/return-window logic |
| Provider Identity Verifier | Signing/mTLS/HMAC/key-rotation authentication |
| File Feed Completeness Monitor | Detects missing/duplicate/out-of-order bank/custodian files |
| Independent Truth Reconciler | Confirms receipt against independent bank/chain/custodian truth |
| Reference Integrity Guard | Enforces unique reference/address and expired-intent policy |
| Amount Disposition Engine | Handles partial/over/under/dust/unexpected amount |
| Inbound Travel Rule Capture Service | Captures inbound Travel Rule data for AML |
| LED Pending Orphan Guard | Controls pending creation and sweeper labels |
| Return Path Controller | Routes returns through WLT/AML/LED payout controls |

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

### DEP1-FR-019 Credit-Request Bundle Revalidation

The platform shall revalidate coherent WLT/AML/confirmation/client bundle at LED credit-request time.

### DEP1-FR-020 AML/WLT Revocation Subscription

The platform shall subscribe to AML/WLT revocation and quarantine affected in-flight deposits.

### DEP1-FR-021 Inbound Source-of-Funds Binding

The platform shall bind inbound source to KYC-verified own source or route to SoF review.

### DEP1-FR-022 SoF/SoW Evidence Linkage

The platform shall link SoF/SoW evidence for large, first or unexpected-source deposits.

### DEP1-FR-023 Per-Source Finality Model

The platform shall apply chain/fiat/custodian-specific finality models before credit evaluation.

### DEP1-FR-024 Crypto Reorg Corroboration

The platform shall support reorg-depth-aware and multi-source corroborated crypto finality.

### DEP1-FR-025 Fiat Return Window

The platform shall track fiat clearing/return/recall window before economic finality.

### DEP1-FR-026 Provider Identity Authentication

The platform shall authenticate receipts using provider identity, signed/mTLS/HMAC mechanisms and key rotation.

### DEP1-FR-027 File Feed Completeness

The platform shall detect missing/out-of-order/duplicate file feed sequences.

### DEP1-FR-028 Independent Truth Reconciliation

The platform shall reconcile credit path to independent bank/chain/custodian truth.

### DEP1-FR-029 Reference Integrity

The platform shall enforce unique-per-intent reference/address/tag where supported and explicit reuse policy.

### DEP1-FR-030 Expired Intent Handling

The platform shall quarantine deposits to expired/cancelled intents.

### DEP1-FR-031 Amount Disposition

The platform shall define partial/over/under/dust/unexpected value handling.

### DEP1-FR-032 Inbound Travel Rule

The platform shall capture inbound Travel Rule data where source is a VASP or policy requires.

### DEP1-FR-033 LED Pending Orphan Control

The platform shall create LED pending only on matched receipt or mark unmatched pendings as sweepable.

### DEP1-FR-034 Controlled Return Path

The platform shall route rejected/unmatched returns through WLT/AML/LED payout controls.

### DEP1-FR-035 Credit-Time Eligibility Recheck

The platform shall recheck client eligibility at credit-request time.

### DEP1-FR-036 Reversal Correlation Binding

The platform shall bind reversals to original correlation, saga, receipt, deposit and LED credit ref.

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
| Credit-request bundle | Coherent and fresh |
| Revocation subscription | AML/WLT in-flight deposits |
| Own-source binding | Required / SoF review |
| Finality model | Per source |
| Provider identity auth | Required |
| File feed completeness | Required |
| Independent truth recon | Required |
| Unique reference policy | Required where supported |
| Amount disposition | Required |
| Inbound Travel Rule | Required where applicable |
| Credit-time eligibility | Required |
| Reversal correlation | Required |
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
26. LED credit evaluation using stale WLT/AML decision refs.
27. LED credit evaluation without coherent screening bundle.
28. In-flight deposit proceeds after AML/WLT revocation.
29. Third-party/unexpected source auto-credit.
30. Large/first deposit auto-credit without required SoF/SoW evidence.
31. Crypto finality based on naive single confirmation count where policy requires deeper model.
32. Fiat deposit treated economically final despite open return/recall window without approved risk acceptance.
33. Receipt accepted from unauthorised provider identity.
34. File-feed sequence gap ignored.
35. Webhook-only fabricated receipt drives credit request without independent truth.
36. Expired/cancelled intent deposit auto-credit.
37. Reused address/reference misbinds wrong correlation.
38. Partial/over/under/dust amount silently credited contrary to policy.
39. Unmatched/rejected deposit auto-returned without WLT/AML/LED payout controls.
40. Reversal event missing original correlation/saga linkage.

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
19. Credit-request coherent bundle revalidation defined.
20. AML/WLT revocation subscription defined.
21. Inbound own-source / SoF binding defined.
22. SoF/SoW evidence linkage defined.
23. Per-source finality model defined.
24. Provider identity / fabricated receipt protection defined.
25. Reference / address / correlation integrity defined.
26. Amount disposition policy defined.
27. Inbound Travel Rule capture defined.
28. LED pending orphan control defined.
29. Controlled return path defined.
30. Credit-time eligibility recheck defined.
31. Reversal correlation/saga binding defined.
32. Tests defined and passed.

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
