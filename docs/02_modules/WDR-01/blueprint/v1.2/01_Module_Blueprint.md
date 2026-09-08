# WDR-01 Withdrawal / Payout Execution Rail
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | WDR-01 |
| Module name | Withdrawal / Payout Execution Rail |
| Pack version | v1.2 |
| Status | Accepted / final verified; v1.2 is cosmetic final rollup only, no substantive control change from v1.1 |
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


### 5.15 Atomic Revalidate-And-Transmit

WDR-01 must revalidate the coherent decision bundle at the exact transmission point.

Rules:

1. bundle validation before build is not sufficient.
2. immediately before provider transmission, WDR-01 must recheck:
   - WLT decision current and not revoked.
   - AML decision current and not revoked.
   - Travel Rule payload current and complete.
   - CFG feature and kill-switch current.
   - IAM approval/current mandate/dual-authorisation current.
   - LED reserve active, pinned, unexpired and not released.
   - client/destination/amount/asset/correlation match.
3. Recheck and transition to `submitted` must be one atomic critical section.
4. stale bundle at send fails closed with no provider transmission.
5. point of no return is guarded and audit logged.

Parameters:

```txt
send_time_revalidation = atomic_bundle_recheck_in_send_critical_section
recheck_covers         = wlt_aml_revocation_epoch + cfg_killswitch + led_reserve_pinned
stale_bundle_at_send   = fail_closed_no_transmit
point_of_no_return     = guarded
```

### 5.16 Outbound Value Conservation

Every payout must conserve value across reserve, provider instruction, rail/network fee, finality and LED settlement.

Invariant:

```txt
reserved_amount = amount_sent + disclosed_fee + bounded_residual
aix_principal_absorption = prohibited
```

Rules:

1. `amount_sent`, `fee_amount`, `fee_asset`, `residual_amount` and `final_beneficiary_amount` must be captured.
2. network/gas/rail fee payer must be explicitly defined.
3. fee cannot be funded from AIX operational/principal account.
4. partial payout disposition must be defined.
5. rail-side FX/slippage disposition must be defined and never silently absorbed by AIX.
6. LED settlement must reconcile to WDR value-conservation record.
7. unexplained residual is a critical reconciliation break.

Parameters:

```txt
payout_conservation     = reserved = sent + disclosed_fee + bounded_residual
network_fee_disposition = defined_client_or_policy_never_principal
partial_payout          = defined_disposition
rail_side_fx            = defined_owner_never_aix_absorbed
```

### 5.17 Last-Mile Beneficiary Integrity

The signed provider instruction must exactly match the WLT-consumed canonical destination.

Rules:

1. WLT canonical destination hash must be bound into provider instruction.
2. destination, amount, asset, chain/rail and beneficiary details in signed payload must equal WLT decision.
3. payload hash must cover full beneficiary details, not only metadata.
4. tamper evidence must be preserved from build to provider receipt.
5. high-value payouts require independent/four-eyes verification of beneficiary details.
6. any mismatch blocks send.

Parameters:

```txt
instruction_destination = equals_wlt_consumed_canonical_destination
payload_tamper_evidence = build_to_provider_receipt
high_value_beneficiary  = independent_or_four_eyes_verification
```

### 5.18 Batch / File Payout Execution

WDR-01 must support batch/file payout rails without losing item-level control.

Rules:

1. batch envelope required for file-based payouts.
2. each payout item has its own item ID, correlation ID, LED reserve and finality state.
3. batch-level and item-level idempotency required.
4. outbound file checksum/manifest required.
5. file completeness and item count must be verified before send.
6. provider acknowledgement of file does not imply item finality.
7. partial-batch failure is handled item-by-item.
8. retry must not resend already successful items.

Parameters:

```txt
batch_envelope          = per_item_finality + partial_batch_handling
idempotency_scope       = batch_level_and_item_level
outbound_file_integrity = checksum_manifest_completeness
```

### 5.19 One-Reserve-One-Successful-Send / Double-Pay Protection

A single LED reserve can back at most one successful external send.

Rules:

1. LED reserve must be exclusively bound to one payout execution before send.
2. atomic send lock binds reserve to provider instruction.
3. duplicate logical payout request cannot create a second send.
4. logical payout dedup uses correlation + client + destination + amount + asset + action.
5. provider instruction cannot be duplicated across execution records.
6. successful send consumes the reserve-binding status.
7. replayed request returns existing execution or fails conflict.

Parameters:

```txt
reserve_to_instruction = exclusive_one_successful_send
logical_payout_dedup   = correlation+client+destination+amount
duplicate_request      = cannot_produce_second_send
```

### 5.20 Compare-And-Set State Transitions

All payout state transitions must use `status_version` compare-and-set.

Rules:

1. out-of-order provider event is parked/reconciled.
2. finality before acknowledgement does not overwrite incorrectly.
3. late finality after cancel/timeout routes to exception.
4. manual state transition requires maker-checker.
5. transition conflict triggers retry/park, not silent overwrite.

Parameters:

```txt
state_transition = status_version_compare_and_set
```

### 5.21 Executed-Late Disposition

If provider executes after local cancellation or after cancellation accepted too early, it is actual money movement.

Rules:

1. mark as `executed_late`.
2. notify LED as actual external settlement / money left.
3. create exception case.
4. do not show as simply cancelled.
5. do not release reserve as if no execution occurred.

Parameters:

```txt
executed_late = reconcile_as_settled_plus_exception
```

### 5.22 Provider Signing-Key Governance

Outbound signing keys/credentials are security-critical.

Rules:

1. key material stored only in secrets manager/HSM/custody facility.
2. WDR stores references, never secrets.
3. key rotation, expiry, revocation and activation require maker-checker.
4. expired/revoked key blocks instruction.
5. key usage is audit logged.
6. provider identity and key are bound to provider route.

Parameters:

```txt
provider_signing_keys = rotation_expiry_revocation_hsm
```

### 5.23 Travel Rule Payload Consistency At Send

Travel Rule payload sent to rail/provider must match AML-cleared data.

Rules:

1. originator/beneficiary data in provider payload must equal AML-cleared Travel Rule payload.
2. counterparty VASP unreachable/sunrise issue routes to hold/review according to policy.
3. payload mismatch blocks send.
4. final sent payload hash is retained.

Parameters:

```txt
travel_rule_payload = matches_aml_cleared_data
```

### 5.24 Pinned-Reserve SLA and Stuck-Payout Escalation

A payout cannot remain unknown forever.

Rules:

1. max pending SLA by rail/provider.
2. query-back cadence by status.
3. stuck payout escalates to Ops/Finance/Compliance.
4. LED reserve remains pinned until LED decides.
5. E2E orphan sweeper detects instruction/reserve stuck beyond SLA.

Parameters:

```txt
pinned_reserve_sla = max_pending + stuck_escalation + orphan_sweep
```

### 5.25 Client-Facing Status Truthfulness

Client/staff payout status must reflect rail finality and LED outcome.

Rules:

1. provider acknowledgement cannot be shown as paid/complete.
2. `paid` or `complete` requires rail finality and LED outcome.
3. return/reversal corrects prior status.
4. late execution after cancel is disclosed as exception according to approved client communication.
5. status history is audit retained.

Parameters:

```txt
client_status = reflects_rail_finality_and_led_truth
```

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
| Atomic Send Gate | Revalidates bundle in same critical section as transmission |
| Payout Value Conservation Engine | Proves reserve = sent + fee + residual |
| Beneficiary Integrity Guard | Binds signed payload to WLT canonical destination |
| High-Value Beneficiary Verification Service | Four-eyes check for high-value beneficiary details |
| Batch Envelope Service | Manages batch/file payout envelopes |
| Item Finality Tracker | Tracks per-item finality inside batch |
| Reserve Send Lock | Enforces one-reserve-one-successful-send |
| Logical Payout Dedup Engine | Deduplicates correlation/client/destination/amount |
| State CAS Guard | Compare-and-set state transition control |
| Signing Key Governance Service | Key reference/rotation/expiry/revocation control |
| Travel Rule Payload Consistency Checker | Ensures sent data matches AML-cleared payload |
| Stuck Payout SLA Monitor | Detects long-pending payout/reserve |

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

### WDR1-FR-021 Atomic Revalidate-And-Transmit

The platform shall revalidate the decision bundle in the same critical section as provider transmission.

### WDR1-FR-022 Send-Time Revocation Check

The platform shall check WLT/AML revocation epochs and CFG kill-switch at send time.

### WDR1-FR-023 Payout Value Conservation

The platform shall enforce reserved amount equals sent amount plus disclosed fee plus bounded residual.

### WDR1-FR-024 Network Fee / FX / Partial Disposition

The platform shall define network fee, partial payout and rail-side FX disposition without AIX absorption.

### WDR1-FR-025 Last-Mile Beneficiary Integrity

The platform shall bind signed instruction destination/amount/asset to WLT canonical destination.

### WDR1-FR-026 Payload Tamper Evidence

The platform shall maintain tamper evidence from build through provider receipt.

### WDR1-FR-027 Batch Envelope

The platform shall support batch/file payout envelopes.

### WDR1-FR-028 Per-Item Finality

The platform shall track per-item finality in batch payouts.

### WDR1-FR-029 Batch and Item Idempotency

The platform shall enforce batch-level and item-level idempotency.

### WDR1-FR-030 One-Reserve-One-Send

The platform shall enforce one LED reserve to at most one successful external send.

### WDR1-FR-031 Logical Payout Dedup

The platform shall deduplicate logical payout requests across execution records.

### WDR1-FR-032 State CAS

The platform shall enforce status_version compare-and-set on payout transitions.

### WDR1-FR-033 Executed-Late Handling

The platform shall treat late execution after cancellation as actual settlement plus exception.

### WDR1-FR-034 Signing Key Governance

The platform shall govern provider signing keys with rotation, expiry, revocation and HSM/secrets boundary.

### WDR1-FR-035 Travel Rule Payload Consistency

The platform shall verify sent Travel Rule payload matches AML-cleared data.

### WDR1-FR-036 Pinned-Reserve SLA

The platform shall define max pending SLA, query-back cadence and stuck-payout escalation.

### WDR1-FR-037 Client Status Truthfulness

The platform shall ensure client-facing status reflects rail finality and LED truth.

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
| Send-time revalidation | Atomic with transmission |
| Outbound value conservation | Required |
| Beneficiary integrity | WLT canonical destination bound |
| Batch/file support | Envelope + item finality |
| Double-pay protection | One reserve one successful send |
| State transitions | CAS guarded |
| Executed-late | Settlement + exception |
| Signing key governance | HSM/secrets boundary |
| Travel Rule payload consistency | Required |
| Pinned-reserve SLA | Required |
| Client status truth | Rail + LED outcome |
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
31. provider transmission without send-time revalidation.
32. transmission after bundle stale/revoked.
33. payout value delta absorbed by AIX.
34. network/rail fee funded from AIX operational account.
35. partial payout without disposition.
36. rail-side FX slippage silently absorbed.
37. signed payload destination differs from WLT canonical destination.
38. high-value payout sent without required beneficiary verification.
39. batch file without manifest/checksum.
40. batch retry resends successful items.
41. one LED reserve funds two successful sends.
42. duplicate logical payout creates second execution.
43. state transition without status_version CAS.
44. executed-late shown as simply cancelled.
45. expired/revoked signing key used.
46. Travel Rule payload differs from AML-cleared data.
47. reserve pinned indefinitely without SLA escalation.
48. client-facing status says paid before rail finality and LED outcome.

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
20. Atomic revalidate-and-transmit defined.
21. Outbound value conservation defined.
22. Last-mile beneficiary integrity defined.
23. Batch/file payout execution defined.
24. One-reserve-one-successful-send defined.
25. Logical payout dedup defined.
26. State CAS transitions defined.
27. Executed-late disposition defined.
28. Provider signing-key governance defined.
29. Travel Rule payload consistency defined.
30. Pinned-reserve SLA defined.
31. Client-facing status truthfulness defined.
32. Tests defined and passed.

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

## 14. Final Verification Note

WDR-01 v1.2 is accepted / final verified.

v1.1 resolved:
1. Atomic send-time bundle revalidation.
2. WLT / AML revocation epoch check at point of send.
3. CFG kill-switch recheck at point of send.
4. LED reserve pinned / valid / unexpired recheck.
5. Exclusive reserve-to-instruction send lock.
6. Logical payout dedup across execution records.
7. Outbound value conservation.
8. Network fee / partial payout / rail-side FX disposition.
9. No AIX operational or principal funding.
10. Signed payload bound to WLT canonical destination.
11. Last-mile beneficiary integrity guard.
12. High-value beneficiary four-eyes verification.
13. Batch / file payout envelope.
14. Batch-level and item-level idempotency.
15. Per-item batch finality.
16. Batch checksum / manifest completeness.
17. State transition compare-and-set guard.
18. Executed-late disposition as actual settlement plus exception.
19. Provider signing-key governance.
20. Travel Rule payload consistency at send.
21. Pinned-reserve SLA and stuck-payout escalation.
22. Client-facing payout status reflects rail finality and LED truth.

v1.2 is a cosmetic final rollup only.

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
- WDR-01 Withdrawal / Payout Execution Rail v1.2 — Accepted

