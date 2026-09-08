# LED-01 Ledger / Settlement / Safeguarding
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | LED-01 |
| Module name | Ledger / Settlement / Safeguarding |
| Pack version | v1.0 |
| Status | Revised after Claude Opus review; atomic reservation, two-leg DvP, preventive safeguarding, FX/residual controls, journal hash-chain, clawback, hold pinning and fee atomicity added |
| Platform | AIX Money Broking + PSO Platform |
| Licence posture | Money Broking and PSO approved; Exchange pending |
| Module category | Money Tier / Ledger / Settlement / Safeguarding |
| Depends on | FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2, SEC-01 v1.2, CFG-01 v1.2, CLT-01 v1.2, KYC-01 v1.2, AML-01 v1.2, WLT-01 v1.2 |
| Provides outcome to | Deposit, Withdrawal, Payout, Quote/Trade, LP Execution, Reconciliation, Finance, Reporting |

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


---

## 2. Module Purpose

LED-01 is the authoritative financial ledger and settlement-control module.

It answers:

```txt
Can this movement be posted, reserved, settled, released, reversed, or reconciled without breaking double-entry integrity, client-money safeguarding, full backing, prefunding, DvP, or AIX no-principal-exposure rules?
```

LED-01 never creates money. It records auditable movements only when source evidence and controls are valid.

---

## 3. In Scope

LED-01 covers:

1. Chart of ledger accounts.
2. Double-entry journal posting.
3. Immutable journal entries.
4. Ledger account balances.
5. Client sub-ledger by asset/currency.
6. Available / held / pending / settled balances.
7. Deposit pending and confirmed credit workflow.
8. Withdrawal / payout debit and settlement workflow.
9. Prefunded hold/reserve workflow.
10. Hold release / expiry / cancellation.
11. Settlement instruction lifecycle.
12. WLT-01 destination decision verify-and-consume.
13. AML-01 pre-transaction gate verification.
14. DvP sequencing.
15. LP execution settlement handoff support.
16. Client money / client asset safeguarding invariant.
17. No direct balance edit.
18. No negative client available balance.
19. No AIX inventory / principal exposure.
20. Fee posting as disclosed brokerage/commission only.
21. Reversal/correction workflow.
22. Manual adjustment maker-checker.
23. Ledger close/cut-off/freeze.
24. Bank/custodian/chain reconciliation.
25. Exception case workflow.
26. Safeguarding report.
27. Audit and evidence export.
28. Incident freeze and recovery controls.

---

## 4. Out of Scope

LED-01 does not implement:

1. KYC/KYB.
2. AML screening.
3. Wallet screening / destination whitelist.
4. Payment rail execution.
5. Blockchain transaction signing.
6. Custody private keys.
7. LP quote pricing.
8. LP order execution.
9. Public exchange order book.
10. Matching engine.
11. Client-to-client matching.
12. Market making.
13. Principal trading.
14. AIX spread markup.
15. FIU/STR filing.

---

## 5. Critical Principles

### 5.1 Immutable Double-Entry Ledger

Every financial event must post as balanced debit and credit entries.

Rules:

1. total debits equal total credits per journal.
2. journal entries are append-only.
3. no update/delete of posted journal.
4. correction requires reversal/new journal.
5. journal has source event, idempotency key, control references, and audit ref.
6. posting fails closed if ledger cannot balance.

### 5.2 No Direct Balance Edit

Balances are derived from immutable journals.

Rules:

1. no direct balance update.
2. no admin balance edit.
3. no DB patch to balance.
4. no service account balance override.
5. correction is reversal + repost only.
6. balance snapshots are derived and reconcilable.

### 5.3 Full Backing / Safeguarding Invariant

Client liabilities must be fully backed by bank/custodian/chain assets.

Invariant:

```txt
sum(client_liabilities_by_asset) <= verified_safeguarded_assets_by_asset
```

Rules:

1. ledger must not credit available balance unless backing evidence exists.
2. pending deposits are not available.
3. credit after confirmed receipt only.
4. withdrawals/payouts reserve before execution.
5. reconciliation breach triggers freeze/escalation.
6. unsupported/unreconciled asset cannot be used.

### 5.4 Prefunded Hold Before Execution

Trading/LP execution and withdrawals must use prefunded holds/reserves.

Rules:

1. hold must be created before LP execution or payout.
2. hold amount cannot exceed available balance.
3. hold reduces available balance immediately.
4. LP execution cannot proceed without valid hold.
5. settlement cannot consume expired/released hold.
6. unused hold is released only after final outcome.
7. partial fill/slippage beyond tolerance routes to release/requote/void according to trade module.

### 5.5 DvP / No AIX Exposure

Settlement must prevent AIX principal exposure.

Rules:

1. AIX inventory must remain zero unless explicitly non-client operational account and approved.
2. AIX must not intermediate with own balance as principal.
3. client debit and asset credit follow DvP state machine.
4. no client credit before confirmed receipt where exposure would be created.
5. LP settlement failure keeps client position pending/held, not funded by AIX.
6. residuals/exposure cannot be absorbed by AIX inventory.

### 5.6 Deposit Credit Control

Deposit attribution does not equal available credit.

Required before available credit:

1. deposit source is matched.
2. inbound source screening is clear or approved.
3. bank/custodian/chain receipt is confirmed.
4. amount, asset/currency, client and reference match.
5. safeguarding/backing check passes.
6. AML/WLT hold/quarantine absent.
7. idempotency check passes.
8. ledger journal posts balanced.

### 5.7 Withdrawal / Payout Settlement Control

Withdrawal/payout requires:

1. client status allowed.
2. available balance sufficient.
3. WLT-01 destination decision verify-and-consume.
4. AML-01 pre-transaction gate current where required.
5. Travel Rule data complete where required.
6. hold/reserve created.
7. maker-checker/client-side approval where required.
8. payment/custodian execution confirmation.
9. final ledger settlement journal.

### 5.8 WLT-01 Destination Decision Consumption

LED-01 must consume WLT-01 execution-time destination decision, not only trust a prior token.

Rules:

1. verify-and-consume at execution time.
2. bind to execution reference.
3. bind amount/asset/currency/action.
4. reject stale/revoked/scope-mismatched decision.
5. fail closed if WLT-01 unavailable unless approved incident mode blocks movement.

### 5.9 AML-01 Pre-Transaction Gate

LED-01 must verify AML-01 pre-transaction gate before movement where required.

Unknown/stale/revoked AML decision blocks settlement.

### 5.10 Client Status / Mandate Binding

Ledger movement must respect CLT-01 client status, KYC/AML state, mandate and freeze.

Rules:

1. suspended/restricted/closed client cannot move funds/assets except approved remediation/return path.
2. mandate approval must be valid where applicable.
3. client-side dual authorisation must be completed where applicable.
4. status change can freeze holds and new movements.

### 5.11 Fees

Fees must be posted only as disclosed brokerage/commission or approved fee schedule.

Rules:

1. no hidden spread markup.
2. no AIX spread revenue.
3. fee journal must identify fee type and client disclosure reference.
4. fee cannot create client negative balance.
5. fee reversal follows ledger reversal controls.

### 5.12 Reversal / Correction

Correction must be controlled.

Rules:

1. posted journal is never edited.
2. reversal references original journal.
3. reason and evidence required.
4. maker-checker approval required.
5. reversal cannot hide safeguarding breach.
6. reversal emits SEC-01 critical/high audit event.

### 5.13 Ledger Close / Freeze

Ledger period close/cut-off protects integrity.

Rules:

1. closed period cannot be posted into except controlled adjustment period.
2. freeze stops new postings by scope.
3. incident freeze can block affected asset/client/rail/module.
4. close/freeze requires approval and audit.
5. emergency freeze cannot be used to bypass reconciliation.

### 5.14 Idempotency and Ordering

Every posting must be idempotent and ordered.

Rules:

1. source event ID and idempotency key required.
2. duplicate source cannot double-post.
3. out-of-order settlement event cannot skip required states.
4. ledger event sequence is monotonic per account/asset/source event.
5. concurrent holds/postings cannot overspend available balance.

### 5.15 Reconciliation Is Mandatory

Ledger must reconcile against:

1. bank accounts.
2. custodian balances.
3. blockchain confirmations.
4. WLT decisions.
5. AML decisions.
6. trade/LP execution records.
7. client sub-ledgers.
8. finance reports.

### 5.16 Deployment and Go-Live Money Controls

LED-01 is a high-risk money-flow module.

Go-live requires:

1. migration integrity.
2. zero opening imbalance.
3. finance/compliance/security signoff.
4. reconciliation evidence.
5. rollback point-of-no-return definition.
6. money-flow quiescence for deployment.
7. incident/freeze playbook.
8. production access restriction.
9. monitoring and alerts.
10. daily hypercare reconciliation.


### 5.17 Atomic Real-Time Available Balance and Reservation

Available balance for holds, payouts and settlements must not be taken from a periodic snapshot.

Rules:

1. Reservation source is authoritative real-time ledger state, not `balance_snapshot`.
2. Balance snapshot is reconciliation/reporting artefact only.
3. Hold creation must atomically check and reserve against live available balance.
4. Per-account serialisation is required using row lock, optimistic version, or equivalent atomic guard.
5. Concurrent holds/postings must be impossible to overspend by construction.
6. Atomic conditional reservation must check:
   - account/client/asset.
   - available amount.
   - active holds.
   - frozen/closed status.
   - balance version.
   - idempotency key.
7. Failed compare-and-set returns insufficient/changed-state error.
8. Any posting that changes available balance increments account balance version.

Parameters:

```txt
available_balance_source = authoritative_realtime_not_snapshot
hold_creation            = atomic_compare_and_set_vs_live_balance
per_account_serialisation = required_row_lock_or_version
snapshot_role            = reconciliation_only_never_reservation
concurrent_overspend     = must_be_impossible_by_construction
```

### 5.18 Two-Leg Linked DvP Settlement

Settlement must model delivery and receipt as linked legs.

Rules:

1. Each DvP settlement has at least two linked legs: deliver leg and receive leg.
2. Each leg has its own asset/currency, amount, rail, execution reference and confirmation state.
3. Atomic completion requires both required legs to satisfy settlement conditions.
4. One-leg-settled/other-pending is explicit in the state machine.
5. Partial-settlement failure must route to compensating unwind or suspense/client position.
6. In-flight positions must not be booked as AIX inventory.
7. Settlement completion must preserve zero AIX principal exposure.
8. DvP journal must bind both legs and hold references.

Parameters:

```txt
settlement_model         = two_leg_linked
partial_settlement_state = one_leg_settled_other_pending
one_leg_fail_unwind      = compensating_to_client_or_suspense
aix_absorbs_inflight_gap = prohibited
```

### 5.19 Preventive Safeguarding and Encumbered Backing

Full backing must be checked on movement path, not only detected later.

Rules:

1. Safeguarded assets are tracked as free and encumbered.
2. Deposit credit consumes/reserves confirmed unencumbered backing atomically.
3. Outbound settlement encumbers backing before movement.
4. Encumbered backing cannot be reused for another liability.
5. Safeguarding invariant is checked before credit, hold, debit, settlement and release.
6. Daily/intraday snapshots are cross-checks, not primary enforcement.
7. Invariant breach blocks movement and freezes affected scope.
8. Unsupported/unconfirmed backing cannot support available balance.

Parameters:

```txt
backing_check      = preventive_at_credit_and_debit_time
backing_model      = free_vs_encumbered
credit_consumes    = unencumbered_confirmed_backing_atomic
invariant_snapshot = cross_check_not_primary_control
```

### 5.20 FX / Cross-Asset Conversion and Rounding Residuals

Money-broking conversion must be represented as a linked cross-asset ledger event.

Rules:

1. Conversion event is modelled as linked A-out/B-in leg pair.
2. Conversion requires DvP settlement and prefunded hold.
3. Rate, quantity, fee and rounding policy must be explicit.
4. AIX economics are disclosed brokerage/commission only.
5. No hidden spread/markup.
6. Rounding residual/dust account must be defined.
7. Residual balance must be bounded, monitored and reconciled every run.
8. Residual cannot be treated as AIX principal profit or inventory.
9. AIX net asset position after conversion must be zero except approved bounded residual policy.

Parameters:

```txt
conversion_event          = modelled_as_linked_leg_pair
rounding_residual_account = defined_bounded_never_aix_principal
aix_net_asset_position    = zero_enforced_post_conversion
aix_economics             = disclosed_brokerage_only
```

### 5.21 Journal Hash-Chain and Tamper Evidence

Financial journals must be tamper-evident.

Rules:

1. Every posted journal is hash-sealed.
2. Each journal stores previous journal hash for the ledger partition.
3. Journal hash covers journal header, journal lines, source event, control refs, prior hash and posting sequence.
4. Reversal preserves original journal in-chain and references it.
5. Chain verification job runs independently.
6. Chain verification failure is Critical and freezes affected scope.
7. Periodic external anchoring is required.
8. DBA/break-glass/service-role changes must be detectable.

Parameters:

```txt
journal_hash_chain      = prev_hash_per_journal
chain_verification_job  = independent_scheduled
external_anchoring      = periodic
reversal_seals_original = in_chain_referenced
```

### 5.22 Hold Pinning During In-Flight Settlement

A hold linked to an instructed/live settlement cannot expire or release independently.

Rules:

1. Settlement `instructed`, `one_leg_settled_other_pending`, or `awaiting_confirmation` pins the hold.
2. Hold expiry is suspended while settlement leg is live.
3. Hold release requires settlement terminal state or approved exception.
4. Double-release is prohibited.
5. Hold pinned state is reconciled against settlement state.

Parameters:

```txt
hold_pinned_while_settlement_inflight = true
```

### 5.23 Post-Credit Clawback / Reorg / Fiat Recall

Confirmed credits may later be reversed due to external rail events.

Rules:

1. Chain reorg, custodian reversal, fiat recall, ACH return or bank correction creates clawback event.
2. Clawback uses controlled reversal/new journal.
3. If credited balance already spent, negative available is not silently allowed.
4. Shortfall routes to client debit/receivable/restricted status/exception according to policy.
5. Clawback must not break journal hash-chain.
6. Safeguarding invariant re-runs immediately.

Parameters:

```txt
post_credit_clawback = reorg_and_fiat_recall_supported
```

### 5.24 Idempotency Scope and Payload Conflict

Idempotency must be precise and conflict-safe.

Rules:

1. Idempotency scope is `(source_module, source_event_id, idempotency_key)`.
2. Same key and same payload returns prior result.
3. Same key and different payload rejects as idempotency conflict.
4. Conflict emits SEC-01 alert.
5. Idempotency payload hash is stored and checked.

Parameters:

```txt
idempotency_scope = source_module+source_event+key
same_key_different_payload = reject_conflict
```

### 5.25 Operational / Clearing / Suspense / Residual Account Bounds

Non-client operational accounts cannot be principal-exposure backdoors.

Rules:

1. Operational, clearing, suspense and residual accounts have explicit purpose and bounds.
2. They cannot fund client settlement.
3. They cannot hide negative client position.
4. They are capped, monitored and reconciled every run.
5. Breach of bound freezes affected flow and escalates.
6. Residual/dust policy must define disposition.

Parameters:

```txt
operational_clearing_bounds = capped_monitored_cannot_fund_client
```

### 5.26 Fee and Settlement Atomicity

Settlement and fees must be atomically consistent.

Rules:

1. Settlement-related fees should post in same atomic journal where possible.
2. If separate journal is unavoidable, saga compensation is required.
3. Settlement cannot be final if required fee posting failed without compensation.
4. Fee cannot create negative balance.
5. Fee failure cannot leave hidden spread/residual.

Parameters:

```txt
fee_settlement_posting = atomic_or_saga_compensated
```

### 5.27 Near-Real-Time Safeguarding Cadence

Daily reconciliation is not enough for money-movement controls.

Rules:

1. Preventive invariant check runs per movement.
2. Intraday safeguarding scans run by configured cadence.
3. Daily full reconciliation remains minimum full-report cadence.
4. Crypto/high-velocity rails require tighter cadence.
5. Critical break freezes affected scope immediately.

Parameters:

```txt
invariant_cadence = per_movement + intraday + daily_full
```

---

## 6. Actors

| Actor | Role |
|---|---|
| Client | Owns balance/liability |
| Client Maker / Approver | Approves client-side movement where mandate applies |
| Operations User | Reviews deposits/withdrawals/settlement cases |
| Finance User | Reviews ledger/reconciliation reports |
| Compliance Officer / MLRO | Reviews AML/safeguarding exceptions |
| Super Admin | Limited admin; cannot edit balance |
| Auditor | Read-only evidence |
| Payment/Custodian Service Account | Sends execution/receipt confirmations |
| WLT-01 Service | Provides destination decision |
| AML-01 Service | Provides pre-transaction decision |
| CLT-01 Service | Provides client status/mandate |
| Trade/LP Module | Provides execution events |
| System Job | Reconciliation, close, snapshots |

---

## 7. Dependencies

### 7.1 Upstream

1. CLT-01 client status and mandate.
2. AML-01 pre-transaction gate.
3. WLT-01 destination verify-and-consume.
4. KYC-01 verified identity where needed.
5. IAM-02 maker-checker/SoD.
6. SEC-01 audit.
7. FND-01 idempotency/outbox.
8. CFG-01 feature/licence lock.
9. Payment/custodian/bank/chain receipt confirmations.
10. Trade/LP execution module.

### 7.2 Downstream

1. Client portfolio/balance views.
2. Settlement/payout execution.
3. Finance reporting.
4. Safeguarding reporting.
5. Reconciliation/reporting.
6. Incident/freeze module.
7. Audit/regulatory evidence.

---

## 8. Components

| Component | Description |
|---|---|
| Ledger Account Service | Account chart and account state |
| Journal Posting Engine | Balanced immutable posting |
| Balance View Engine | Available/held/pending/settled derived balances |
| Hold / Reserve Service | Prefunded holds and releases |
| Deposit Ledger Service | Deposit pending/confirmed/credited |
| Withdrawal Settlement Service | Withdrawal reserve/debit/settlement |
| WLT Decision Adapter | Verify-and-consume WLT decision |
| AML Gate Adapter | Verify AML pre-transaction gate |
| DvP Settlement Controller | Controls delivery-versus-payment sequencing |
| Safeguarding Invariant Engine | Full-backing check |
| Fee Posting Service | Disclosed fee journals |
| Reversal / Correction Workflow | Controlled corrections |
| Ledger Close / Freeze Service | Cut-off/freeze |
| Idempotency / Ordering Guard | Prevents duplicates/out-of-order state |
| Reconciliation Engine | Bank/custodian/chain/sub-ledger recon |
| Exception Case Service | Exceptions and escalation |
| Evidence Export Service | Controlled evidence export |
| Atomic Reservation Engine | Per-account serialisation and conditional hold creation |
| Live Balance Version Service | Authoritative real-time balance/version guard |
| DvP Leg Controller | Linked deliver/receive settlement legs |
| Backing Encumbrance Engine | Free vs encumbered safeguarded asset reservation |
| Conversion Event Engine | FX/cross-asset A-out/B-in conversion events |
| Residual Control Service | Bounded rounding/dust residual account policy |
| Journal Hash Chain Service | Hash-sealed journal sequence and verification |
| External Anchor Publisher | Periodic external anchoring of ledger chain |
| Clawback / Recall Service | Reorg/fiat recall reversal workflow |
| Operational Account Bound Monitor | Caps and monitors operational/clearing/suspense/residual accounts |
| Fee Settlement Atomicity Guard | Atomic/saga fee posting with settlement |

---

## 9. Functional Requirements

### LED1-FR-001 Ledger Account Model

The platform shall define chart of accounts and client sub-ledger account model.

### LED1-FR-002 Double-Entry Journal

The platform shall post only balanced double-entry journals.

### LED1-FR-003 Immutable Journal

The platform shall store journals append-only and prohibit update/delete.

### LED1-FR-004 Derived Balance

The platform shall derive balances from journals and holds.

### LED1-FR-005 Deposit Pending

The platform shall record deposits as pending until confirmed/backed/cleared.

### LED1-FR-006 Deposit Credit

The platform shall credit available balance only after confirmed receipt and controls clear.

### LED1-FR-007 Withdrawal Reserve

The platform shall reserve balance before withdrawal/payout execution.

### LED1-FR-008 WLT Decision Consumption

The platform shall consume WLT-01 verify-and-consume destination decision at execution time.

### LED1-FR-009 AML Gate Verification

The platform shall verify AML-01 pre-transaction gate where required.

### LED1-FR-010 Prefunded Hold

The platform shall create prefunded holds before LP execution or payout.

### LED1-FR-011 Hold Release

The platform shall release unused/expired/cancelled holds under controlled rules.

### LED1-FR-012 DvP Settlement

The platform shall enforce DvP sequencing to prevent AIX exposure.

### LED1-FR-013 Full-Backing Invariant

The platform shall enforce client liabilities fully backed by safeguarded assets.

### LED1-FR-014 No Negative Available Balance

The platform shall prevent negative client available balance.

### LED1-FR-015 Fee Posting

The platform shall post only disclosed brokerage/commission/approved fees.

### LED1-FR-016 Reversal / Correction

The platform shall reverse/correct by new journals only with approval.

### LED1-FR-017 Ledger Close / Freeze

The platform shall support close, cut-off and incident freeze.

### LED1-FR-018 Idempotent Posting

The platform shall prevent duplicate posting via idempotency key/source event ID.

### LED1-FR-019 Reconciliation

The platform shall reconcile ledger against bank/custodian/chain/LP/WLT/AML/source systems.

### LED1-FR-020 Safeguarding Report

The platform shall produce safeguarding/full-backing evidence reports.

### LED1-FR-021 Exception Workflow

The platform shall create exception cases for breaks, mismatches and invariant breaches.

### LED1-FR-022 Sensitive Read / Export

The platform shall log sensitive ledger/evidence read/export through SEC-01.

### LED1-FR-023 No Direct Balance Edit

The platform shall prohibit direct balance edits.

### LED1-FR-024 Deployment Money Controls

The platform shall define deployment freeze, rollback point-of-no-return and hypercare reconciliation.

### LED1-FR-025 Atomic Reservation

The platform shall create holds using atomic conditional reservation against live available balance.

### LED1-FR-026 Live Balance Versioning

The platform shall maintain authoritative real-time balance version for reservation/posting guards.

### LED1-FR-027 Snapshot Is Reconciliation Only

The platform shall prohibit balance snapshots as reservation source.

### LED1-FR-028 Two-Leg DvP

The platform shall model DvP settlements as linked deliver/receive legs.

### LED1-FR-029 Partial Settlement Handling

The platform shall handle one-leg-settled/other-pending state and compensating unwind.

### LED1-FR-030 Preventive Safeguarding

The platform shall check and reserve free/encumbered safeguarded backing per movement.

### LED1-FR-031 Backing Encumbrance

The platform shall track free vs encumbered bank/custodian/chain assets.

### LED1-FR-032 Conversion Event

The platform shall model FX/cross-asset conversion as linked A-out/B-in event.

### LED1-FR-033 Rounding / Residual Policy

The platform shall define bounded residual/dust accounts and enforce zero AIX principal position.

### LED1-FR-034 Journal Hash Chain

The platform shall hash-chain posted journals and independently verify the chain.

### LED1-FR-035 External Anchoring

The platform shall periodically anchor journal hash-chain externally.

### LED1-FR-036 Hold Pinning

The platform shall pin holds while settlement is instructed/in-flight.

### LED1-FR-037 Clawback / Recall

The platform shall support chain reorg, custodian reversal and fiat recall clawback workflow.

### LED1-FR-038 Idempotency Conflict

The platform shall reject same idempotency key with different payload.

### LED1-FR-039 Operational Account Bounds

The platform shall cap, monitor and reconcile operational/clearing/suspense/residual accounts.

### LED1-FR-040 Fee Settlement Atomicity

The platform shall post settlement fees atomically or with compensated saga.

### LED1-FR-041 Intraday Safeguarding

The platform shall run per-movement preventive checks plus intraday safeguarding scans.

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Double-entry balance | Required |
| Journal mutability | Append-only |
| Direct balance edit | Prohibited |
| Client available negative | Prohibited |
| Full backing | Required by asset/currency |
| Prefunded hold | Required before LP/payout |
| DvP sequencing | Required |
| WLT decision consume | Execution-time |
| AML gate | Current where required |
| Idempotency | Required |
| Reconciliation | Daily minimum |
| Safeguarding breach | Freeze/escalate |
| Audit | SEC-01 integrated |
| Atomic reservation | Required |
| Snapshot reservation | Prohibited |
| Per-account serialisation | Required |
| DvP settlement model | Linked two-leg |
| Partial settlement handling | Required |
| Preventive backing check | Per movement |
| Free/encumbered backing | Required |
| Conversion event | Linked cross-asset pair |
| Rounding/residual account | Bounded, monitored, not AIX principal |
| Journal hash chain | Required |
| External anchoring | Periodic |
| Hold pinning | Required while in-flight |
| Clawback/reorg/recall | Required |
| Idempotency conflict | Reject |
| Operational account bounds | Capped/monitored |
| Fee settlement atomicity | Atomic or saga compensated |
| Intraday safeguarding | Required |
| Test coverage | Critical controls 100% |

---

## 11. Prohibited Behaviours

LED-01 must not allow:

1. unbalanced journal posting.
2. journal update/delete after posting.
3. direct balance edit.
4. client available negative balance.
5. available credit before confirmed receipt/backing.
6. deposit auto-credit from quarantined source.
7. payout without reserved funds.
8. payout without WLT verify-and-consume.
9. settlement with stale/revoked AML decision.
10. LP execution without prefunded hold.
11. settlement consuming expired/released hold.
12. DvP sequence skipped.
13. AIX principal funding client settlement.
14. AIX inventory/residual absorption.
15. hidden spread/markup fee.
16. fee creating negative balance.
17. manual adjustment without maker-checker.
18. reversal editing original journal.
19. closed-period posting without approved adjustment.
20. duplicate source event double-posting.
21. out-of-order event skipping state.
22. safeguarding breach ignored.
23. reconciliation break auto-cleared.
24. Super Admin balance override.
25. Break-glass balance edit.
26. service account manual adjustment approval.
27. ledger posting while module/asset/client frozen.
28. WLT/AML/CLT blocked state ignored.
29. sandbox/test ledger mixed with production.
30. Exchange matching/principal trades.
31. Hold created from stale balance snapshot.
32. Concurrent holds overspend available balance.
33. Balance snapshot used as reservation source.
34. Single-leg settlement pretending to be DvP.
35. One-leg-settled exposure booked to AIX inventory.
36. Safeguarding backing reused while encumbered.
37. Deposit credit without atomic unencumbered backing reservation.
38. Cross-asset conversion without linked A-out/B-in legs.
39. Rounding residual absorbed as AIX profit/principal.
40. Journal posted without hash-chain seal.
41. Reversal masking original sealed journal.
42. Hold released while settlement is in-flight.
43. Post-credit chain reorg/fiat recall ignored.
44. Same idempotency key with different payload silently accepted.
45. Operational/clearing/suspense account funds client settlement.
46. Fee journal fails while settlement finalises without compensation.

---

## 12. Acceptance Criteria

LED-01 is accepted only if:

1. Account model defined.
2. Double-entry posting defined.
3. Immutable journals defined.
4. Balance derivation defined.
5. Deposit pending/credit controls defined.
6. Withdrawal reserve/settlement controls defined.
7. WLT verify-and-consume integration defined.
8. AML gate integration defined.
9. Prefunded hold defined.
10. DvP sequencing defined.
11. Full-backing invariant defined.
12. No direct balance edit defined.
13. Fee posting controls defined.
14. Reversal/correction controls defined.
15. Close/freeze controls defined.
16. Idempotency/ordering controls defined.
17. Reconciliation defined.
18. Safeguarding reports defined.
19. Deployment money controls defined.
20. Atomic reservation defined.
21. Live balance versioning defined.
22. Two-leg DvP settlement defined.
23. Partial settlement unwind defined.
24. Preventive safeguarding/free-vs-encumbered backing defined.
25. FX/cross-asset conversion event defined.
26. Rounding/residual policy defined.
27. Journal hash-chain/external anchoring defined.
28. Hold pinning defined.
29. Clawback/reorg/fiat recall defined.
30. Idempotency conflict behaviour defined.
31. Operational/clearing/suspense/residual bounds defined.
32. Fee settlement atomicity defined.
33. Intraday safeguarding cadence defined.
34. Tests defined and passed.

---

## 13. Open Items

1. Final chart of accounts.
2. Final asset/currency list.
3. Final bank/custodian account mapping.
4. Final blockchain confirmation policy.
5. Final hold expiry rules.
6. Final LP settlement event schema.
7. Final DvP state transition details.
8. Final fee schedule/disclosure references.
9. Final reconciliation tolerance policy.
10. Final incident freeze scope matrix.
11. Final ledger close schedule.
12. Final safeguarding report format.
13. Final rollback point-of-no-return.
14. Final production access model.
