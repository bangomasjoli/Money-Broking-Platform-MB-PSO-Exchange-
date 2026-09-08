# REC-01 Reconciliation / Finance Reporting
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | REC-01 |
| Module name | Reconciliation / Finance Reporting |
| Pack version | v1.0 |
| Status | Revised after Claude Opus review; population completeness, as-of snapshot, external statement trust, REC self-integrity and closed-loop remediation controls added |
| Platform | AIX Money Broking + PSO Platform |
| Licence posture | Money Broking and PSO approved; Exchange pending |
| Module category | Finance / Reconciliation / Reporting |
| Depends on | FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2, SEC-01 v1.2, CFG-01 v1.2, CLT-01 v1.2, KYC-01 v1.2, AML-01 v1.2, WLT-01 v1.2, LED-01 v1.2, TRD-01 v1.2, E2E-01 v1.2, DEP-01 v1.2, WDR-01 v1.2 |
| Provides outcome to | Finance, Compliance, Operations, Management, Audit, Regulatory Evidence Pack |

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


---

## 2. Module Purpose

REC-01 provides platform-wide reconciliation and finance reporting controls.

It consumes records and evidence from accepted modules, runs scheduled and event-driven reconciliation jobs, creates controlled break records, tracks remediation, aggregates safeguarding and liability reports, and produces finance/regulatory/auditor evidence packs.

REC-01 must not become a backdoor to alter source-of-truth data. It reports and reconciles; source modules remediate through controlled workflows.

---

## 3. In Scope

REC-01 covers:

1. Daily reconciliation orchestration.
2. On-demand reconciliation by authorised users.
3. E2E correlation completeness.
4. Saga step completeness.
5. SEC expected-vs-emitted audit completeness.
6. LED journal/hash-chain validation evidence.
7. Client liabilities vs safeguarded assets.
8. Deposit receipt-to-credit reconciliation.
9. Withdrawal request-to-finality reconciliation.
10. Trade quote-to-LP-fill-to-LED-settlement reconciliation.
11. Fee/commission calculation and posting reconciliation.
12. Payout reserve-to-send-to-finality reconciliation.
13. Wallet whitelist/destination use reconciliation.
14. AML/WLT revocation impact reconciliation.
15. External bank/custodian/chain statement reconciliation.
16. Exception/break lifecycle.
17. Finance close reports.
18. Management reports.
19. Regulator/auditor evidence packs.
20. Data export with masking/approval.
21. Reconciliation SLA and escalation.
22. Control dashboard.

---

## 4. Out of Scope

REC-01 does not implement:

1. ledger posting.
2. balance edit.
3. direct remediation by changing source data.
4. client onboarding decision.
5. KYC/KYB decision.
6. AML/sanctions decision.
7. wallet screening decision.
8. deposit credit.
9. withdrawal execution.
10. trade/LP execution.
11. Exchange order book.
12. matching engine.
13. market making.
14. principal dealing.
15. AIX spread markup.

---

## 5. Critical Principles

### 5.1 Detective Control Only

REC-01 is a reconciliation and reporting module.

Rules:

1. REC-01 cannot post ledger.
2. REC-01 cannot edit balances.
3. REC-01 cannot alter source module outcomes.
4. REC-01 cannot clear source exceptions by data mutation.
5. REC-01 may create break records and remediation tasks.
6. Source modules must perform remediation through controlled workflows.

### 5.2 Source-of-Truth Integrity

REC-01 must always identify source of truth by domain.

| Domain | Source of Truth |
|---|---|
| Ledger / balances / journals / safeguarding | LED-01 |
| Trade / LP execution / quote / fill | TRD-01 |
| Deposit receipt | DEP-01 |
| Withdrawal / payout instruction / rail finality | WDR-01 |
| Wallet/destination/source screening | WLT-01 |
| AML / sanctions / Travel Rule | AML-01 |
| Client status / mandate | CLT-01 |
| Audit event evidence | SEC-01 |
| Licence/feature lock | CFG-01 |
| Correlation/saga model | E2E-01 |

### 5.3 Reconciliation Run Integrity

Every reconciliation run must be reproducible and immutable.

Rules:

1. run has unique run ID.
2. run has scope, period, source module versions and parameters.
3. input dataset hashes are stored.
4. output result hash is stored.
5. breaks are immutable except lifecycle status.
6. rerun creates new run, not overwrite.
7. all critical runs audited.

### 5.4 Break Severity and Lifecycle

Break severity must be standardised.

Severity levels:

1. Low.
2. Medium.
3. High.
4. Critical.

Critical break examples:

1. client liabilities exceed safeguarded assets.
2. ledger hash-chain mismatch.
3. unbalanced journal.
4. client fill without LP fill.
5. payout sent without LED reserve.
6. deposit credited without confirmed receipt/source clearance.
7. missing SEC event for critical action.
8. AIX principal exposure.
9. Exchange feature runtime path.
10. duplicate payout/deposit/trade.

### 5.5 Break Clearance Control

Break clearance must be controlled.

Rules:

1. REC-01 cannot auto-clear critical break.
2. auto-close allowed only for predefined low-risk transient breaks with evidence.
3. critical/high break requires owner, root cause, remediation evidence and maker-checker.
4. same user cannot create and approve closure of high/critical break.
5. closure must link to source module remediation.
6. closure is audit logged.
7. unresolved critical breaks block close/go-live where applicable.

### 5.6 Daily Close Control

Daily close must prove:

1. LED journal hash-chain intact.
2. journals balanced.
3. client liabilities fully backed.
4. deposits reconciled.
5. withdrawals reconciled.
6. trades reconciled.
7. fees reconciled.
8. external statements loaded.
9. critical breaks reviewed/escalated.
10. SEC event completeness checked.

### 5.7 Safeguarding Report

Safeguarding report must show by asset/currency:

1. client liabilities.
2. confirmed safeguarded assets.
3. free vs encumbered backing.
4. pending deposits.
5. pending withdrawals.
6. open holds/reserves.
7. residual accounts.
8. exceptions.
9. surplus/deficit.
10. sign-off status.

### 5.8 E2E Correlation Completeness

Every money-flow correlation must reconcile:

1. initiating request.
2. decision bundle.
3. source records.
4. ledger/reserve/settlement records.
5. external provider evidence.
6. SEC expected-vs-emitted audit events.
7. final client-visible status.
8. exceptions/compensation/reversal if any.

### 5.9 Value Conservation

REC-01 must check per-correlation value conservation.

Flows:

1. deposit value.
2. trade/conversion value.
3. withdrawal/payout value.
4. fee/commission value.
5. reversal/recall/clawback value.

Invariant:

```txt
value_in = value_out + disclosed_fee + bounded_residual
aix_net_position = zero
unexplained_suspense = prohibited
```

### 5.10 Audit Completeness

SEC-01 expected-vs-emitted event completeness is mandatory for critical workflows.

Rules:

1. missing expected critical event is at least high severity.
2. missing event on money movement is critical.
3. event sequence mismatch creates break.
4. unaudited break clearance is prohibited.

### 5.11 External Statement Reconciliation

REC-01 must reconcile platform records to external statements/evidence:

1. bank accounts.
2. custodian accounts.
3. blockchain balances/transactions.
4. LP statements.
5. payment provider statements.
6. fee invoices.
7. chargeback/return/reversal reports.

### 5.12 Finance Reporting

REC-01 reports must support:

1. daily movement report.
2. client liability report.
3. safeguarding report.
4. open break report.
5. fee/commission report.
6. deposit report.
7. withdrawal/payout report.
8. trade/LP execution report.
9. residual/suspense report.
10. management dashboard.
11. auditor/regulatory evidence pack.

### 5.13 No Exchange Reporting Path

REC-01 must not introduce Exchange runtime concepts.

Rules:

1. no order book report.
2. no matching engine report.
3. no client-to-client trade report.
4. no market maker P&L report.
5. no principal inventory report.
6. no spread markup report.

### 5.14 Reporting Truthfulness

Reports must state source, period, completeness and open limitations.

Rules:

1. draft/preliminary vs final report clearly labelled.
2. report generated with unresolved critical breaks must show warning.
3. report must show data cut-off time.
4. report must show source versions / run ID.
5. no report may hide material unreconciled breaks.


### 5.15 Population / Coverage Completeness

REC-01 must prove it reconciled the complete population, not merely sampled records.

Authoritative denominator:

```txt
completeness_denominator = SEC-01 expected-event manifest + E2E-01 correlation registry
```

Rules:

1. every money-movement correlation in E2E-01 registry must appear in REC coverage.
2. every expected SEC event sequence for critical workflows must be accounted for.
3. every module monotonic sequence must be checked for gaps.
4. a missing correlation/sequence is an investigated break.
5. all-green run requires full population coverage proof.
6. sampled or partial scope cannot be labelled full reconciliation.
7. unknown denominator blocks final report.

Parameters:

```txt
population_reconciliation = every_correlation_and_sequence_accounted
monotonic_sequence_gap    = investigated_break
all_green_requires        = proven_full_population_coverage
```

### 5.16 Consistent Point-In-Time / As-Of Snapshot

REC-01 must reconcile source modules at a consistent cut-off.

Rules:

1. snapshot cut-off uses shared LED journal sequence or E2E saga sequence where possible.
2. wall-clock period alone is insufficient for cross-module state.
3. each source snapshot records the common as-of anchor.
4. records after the anchor are excluded from that run and included in next run.
5. in-flight / expected-open items are classified separately from breaks.
6. in-flight items become breaks only after SLA expiry or invalid state transition.
7. asynchronous source extract times must not create false critical breaks.

Parameters:

```txt
snapshot_as_of      = shared_led_or_e2e_sequence_not_wallclock_edge
in_flight_class     = reconciling_item_not_break_until_sla
cross_module_cutoff = consistent_as_of_all_sources
```

### 5.17 External Statement Trust Model

External statements are the second source for safeguarding and provider reconciliation and must be trusted independently.

Rules:

1. statement ingestion must authenticate provider identity.
2. statement source must be approved and independently controlled.
3. all safeguarding bank/custodian/wallet accounts must be included.
4. statement as-of date must align to reconciliation cut-off.
5. stale/partial/manual statements create warning or break.
6. Finance/Ops users being reconciled cannot solely upload or certify statement completeness.
7. external statement completeness is required before safeguarding report can be final.
8. forged/staged statement risk is controlled by authenticated feed, source hash and SoD.

Parameters:

```txt
external_statement_auth = provider_identity_bound_authenticated_feed
statement_completeness  = all_safeguarding_accounts
statement_freshness     = as_of_aligned_to_period
statement_ingestion     = segregated_from_reconciled_functions
```

### 5.18 REC Record Integrity and Independence

REC-01 assurance records must be tamper-evident and independently controlled.

Rules:

1. reconciliation runs are hash-chained.
2. break records are hash-chained.
3. final reports and evidence packs are hash-chained.
4. critical run anchors are externally anchored to SEC-01 or approved evidence store.
5. run scope must match mandated population for full reports.
6. narrowed scope must be flagged, justified and approved.
7. reconciliation operator must be independent from direct money movement operation where required.
8. safeguarding sign-off requires four-eyes.

Parameters:

```txt
rec_record_integrity    = hash_chain + external_anchor
run_scope               = mandated_population_enforced_no_selective_blinding
reconciliation_function = independent_sod_from_money_modules
safeguarding_signoff    = four_eyes
```

### 5.19 Closed-Loop Break Remediation

High and critical break closure must prove the break is gone.

Rules:

1. high/critical break closure requires clean re-reconciliation of that specific break.
2. `validation_run_id` must pass and must include the affected break population.
3. recurrence of a closed break auto-escalates.
4. false-positive closure requires independent sign-off.
5. repeated close/reopen triggers senior escalation.
6. break recurrence is tracked by break signature.
7. closure note alone is insufficient.

Parameters:

```txt
critical_closure      = requires_clean_reReconciliation_of_that_break
recurrence_detection  = resolved_break_reappearing_auto_escalates
false_positive        = independent_signoff_required
repeated_close_reopen = senior_escalation
```

### 5.20 Materiality and Tolerance Governance

Tolerance must be governed and cannot mask zero-tolerance breaks.

Rules:

1. materiality/tolerance policy is versioned.
2. tolerance change requires maker-checker and CFG-style governance.
3. zero-tolerance classes cannot use tolerance.
4. reports must show tolerance policy version.
5. tolerance application is audit logged.

Zero-tolerance classes include:

1. safeguarding deficit.
2. sanctions/AML hit ignored.
3. ledger hash-chain mismatch.
4. principal exposure.
5. unauthorised ledger/balance edit.
6. missing SEC event for money movement.
7. Exchange runtime feature path.
8. one reserve funding two payouts.

Parameters:

```txt
materiality_tolerance = governed_versioned_zero_tolerance_classes_protected
```

### 5.21 Severity Mapping and Rule-Set Governance

REC rules and severity mapping determine assurance outcome and must be controlled.

Rules:

1. severity mapping is versioned and approved.
2. reconciliation rule sets are versioned and approved.
3. silent downgrade of critical classes is prohibited.
4. rule change requires maker-checker and audit.
5. first run after rule change must be flagged.
6. historical reports keep original rule version.

Parameters:

```txt
severity_mapping  = versioned_approved_no_silent_downgrade
recon_rule_change = cfg_maker_checker_audited
```

### 5.22 Report Restatement Workflow

Final reports must not be silently edited.

Rules:

1. final report is immutable.
2. later correction creates a restated report version.
3. restated report references superseded report.
4. reason and approving authority recorded.
5. affected recipients/regulators can be notified according to policy.
6. prior version remains retained.

Parameters:

```txt
report_restatement = controlled_versioned_supersede
```

### 5.23 Regulatory Obligations and Filing Deadlines

REC-01 must track scheduled regulatory/finance reporting obligations.

Rules:

1. obligation type, due date, period and required content tracked.
2. submission status tracked.
3. late/at-risk filing escalates.
4. submitted package hash and acknowledgement retained.
5. reports cannot be filed if blocking critical breaks exist unless governance permits with disclosure.

Parameters:

```txt
regulatory_obligations = tracked_deadlines_submission_status
```

---

## 6. Actors

| Actor | Role |
|---|---|
| Finance User | Runs/reviews reconciliation and finance reports |
| Operations User | Reviews operational breaks |
| Compliance Officer / MLRO | Reviews AML/Travel Rule/sanctions breaks |
| Security Officer | Reviews audit/security breaks |
| Management | Reviews dashboard and sign-off |
| Auditor / Regulator | Receives evidence pack |
| REC Service Account | Runs scheduled jobs |
| LED-01 Service | Provides ledger/safeguarding data |
| DEP-01 Service | Provides deposit receipt data |
| WDR-01 Service | Provides payout rail data |
| TRD-01 Service | Provides trade/LP data |
| SEC-01 Service | Provides audit evidence |
| E2E Saga Service | Provides correlation/saga data |

---

## 7. Dependencies

### 7.1 Upstream Data Dependencies

1. FND-01 correlation/idempotency metadata.
2. IAM-02 approval/SoD evidence.
3. SEC-01 audit events and expected-event manifest.
4. CFG-01 feature/licence-lock evidence.
5. CLT-01 client status/mandate.
6. KYC-01 KYC outcome.
7. AML-01 decisions/revocations/Travel Rule.
8. WLT-01 source/destination decisions.
9. LED-01 journals, balances, holds, reserves, safeguarding.
10. TRD-01 quote, trade, LP fill, value conservation.
11. DEP-01 receipt, source, finality, credit bundle.
12. WDR-01 payout instruction, finality, value conservation.
13. E2E-01 correlation/saga/evidence bundle.
14. External statements/evidence.

### 7.2 Downstream Outputs

1. break management tasks.
2. finance reports.
3. management dashboard.
4. regulatory/auditor evidence pack.
5. close sign-off.
6. source module remediation tickets.

---

## 8. Components

| Component | Description |
|---|---|
| Reconciliation Orchestrator | Runs scheduled/on-demand recon jobs |
| Source Data Snapshotter | Captures source datasets and hashes |
| Rule Engine | Applies reconciliation rules |
| Break Management Service | Creates/tracks breaks |
| Break Severity Engine | Scores break severity |
| Break Closure Controller | Maker-checker closure workflow |
| Safeguarding Report Engine | Client liabilities vs assets |
| Value Conservation Engine | Per-correlation value checks |
| Audit Completeness Engine | Expected-vs-emitted SEC event checks |
| E2E Correlation Reconciler | Saga/correlation completeness |
| External Statement Loader | Imports bank/custodian/chain/provider statements |
| Finance Report Generator | Finance reports |
| Regulatory Evidence Pack Builder | Audit/regulatory packs |
| Close Calendar / Sign-Off Service | Daily/period close |
| Dashboard Service | Management dashboard |
| Data Export Controller | Controlled exports |
| Population Coverage Engine | SEC/E2E denominator and sequence coverage proof |
| As-Of Snapshot Coordinator | Shared LED/E2E sequence cut-off control |
| In-Flight Reconciling Item Manager | Tracks expected-open items until SLA |
| External Statement Trust Engine | Auth/completeness/freshness/SoD for external statements |
| REC Integrity Anchor Service | Hash-chain and external anchor for REC records |
| Mandated Scope Controller | Prevents selective run scoping |
| Reconciliation Independence Controller | SoD over recon execution/sign-off |
| Recurrence Detection Engine | Detects reappearing closed breaks |
| Tolerance Policy Engine | Versioned materiality/tolerance controls |
| Severity Mapping Governance Service | Versioned severity rules |
| Rule Change Control Service | Maker-checker over reconciliation rules |
| Report Restatement Service | Versioned report supersession |
| Regulatory Obligation Tracker | Due dates, content, submission status |

---

## 9. Functional Requirements

### REC1-FR-001 Reconciliation Orchestration

The platform shall run scheduled and on-demand reconciliation jobs.

### REC1-FR-002 Source Data Snapshot

The platform shall snapshot source datasets and hashes per run.

### REC1-FR-003 Ledger Reconciliation

The platform shall reconcile LED journals, balances, holds, reserves and safeguarding records.

### REC1-FR-004 Deposit Reconciliation

The platform shall reconcile DEP receipts, WLT/AML decisions, confirmation and LED credit.

### REC1-FR-005 Withdrawal Reconciliation

The platform shall reconcile WDR payout instructions, WLT/AML decisions, LED reserves and rail finality.

### REC1-FR-006 Trade Reconciliation

The platform shall reconcile TRD quotes, LP fills, client fills and LED settlements.

### REC1-FR-007 Fee Reconciliation

The platform shall reconcile disclosed fees, ledger postings, trade/payout/deposit fees and finance reports.

### REC1-FR-008 Safeguarding Report

The platform shall generate client-liability vs safeguarded-asset reports.

### REC1-FR-009 Value Conservation

The platform shall run per-correlation and daily value-conservation checks.

### REC1-FR-010 Audit Completeness

The platform shall reconcile SEC expected-vs-emitted events.

### REC1-FR-011 E2E Correlation

The platform shall reconcile E2E correlation and saga completeness.

### REC1-FR-012 External Statement Loading

The platform shall load and reconcile external bank/custodian/chain/LP/provider statements.

### REC1-FR-013 Break Creation

The platform shall create immutable break records.

### REC1-FR-014 Break Lifecycle

The platform shall manage break assignment, investigation, remediation evidence and closure.

### REC1-FR-015 Break Closure Maker-Checker

The platform shall require maker-checker for high/critical break closure.

### REC1-FR-016 Close Sign-Off

The platform shall manage daily and period close sign-off.

### REC1-FR-017 Report Generation

The platform shall generate finance, management, safeguarding and regulatory reports.

### REC1-FR-018 Evidence Pack

The platform shall generate correlation-bound evidence packs for audit/regulatory review.

### REC1-FR-019 Data Export Controls

The platform shall apply permission, masking and audit controls to exports.

### REC1-FR-020 No Source Mutation

The platform shall prohibit REC-01 from mutating source-of-truth financial records.

### REC1-FR-021 Population Coverage Proof

The platform shall prove reconciliation coverage against SEC expected-event manifest and E2E correlation registry.

### REC1-FR-022 Monotonic Sequence Gap Detection

The platform shall detect gaps in per-module monotonic sequences.

### REC1-FR-023 Consistent As-Of Snapshot

The platform shall reconcile against shared LED/E2E as-of sequence.

### REC1-FR-024 In-Flight Reconciling Item

The platform shall classify legitimate open in-flight items separately from breaks until SLA expiry.

### REC1-FR-025 External Statement Trust

The platform shall authenticate external statements and verify completeness/freshness/independence.

### REC1-FR-026 REC Hash Chain / Anchor

The platform shall hash-chain and externally anchor REC runs, breaks and final reports.

### REC1-FR-027 Mandated Scope Enforcement

The platform shall enforce mandated population scope and flag/approve any narrowed scope.

### REC1-FR-028 Reconciliation Independence

The platform shall enforce SoD over reconciliation execution and safeguarding sign-off.

### REC1-FR-029 Clean Re-Reconciliation Closure

The platform shall require clean re-reconciliation for high/critical break closure.

### REC1-FR-030 Recurrence Detection

The platform shall detect and escalate recurring breaks.

### REC1-FR-031 Materiality / Tolerance Governance

The platform shall govern tolerances and protect zero-tolerance classes.

### REC1-FR-032 Severity Mapping Governance

The platform shall version and approve severity mapping.

### REC1-FR-033 Reconciliation Rule Change Control

The platform shall apply maker-checker/audit to reconciliation rule changes.

### REC1-FR-034 Report Restatement

The platform shall support controlled versioned report restatement.

### REC1-FR-035 Regulatory Obligation Tracking

The platform shall track regulatory reporting obligations, due dates, submissions and acknowledgements.

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Source mutation | Prohibited |
| Ledger posting | Prohibited |
| Balance editing | Prohibited |
| Run reproducibility | Required |
| Input/output hashes | Required |
| Break immutability | Required |
| Critical break auto-clear | Prohibited |
| Daily close | Controlled |
| Evidence retention | Required |
| Audit | SEC-01 integrated |
| Export control | IAM-02 + audit |
| Population coverage | SEC/E2E denominator required |
| As-of snapshot | Shared LED/E2E sequence |
| In-flight class | Required |
| External statement trust | Authenticated/complete/fresh/independent |
| REC self-integrity | Hash-chain + anchor |
| Mandated scope | Enforced |
| Recon independence | SoD/four-eyes |
| Critical closure | Clean re-reconciliation |
| Recurrence detection | Required |
| Tolerance governance | Versioned/zero-tolerance protected |
| Rule governance | Maker-checker |
| Report restatement | Versioned supersession |
| Regulatory obligation tracking | Required |
| Test coverage | Critical controls 100% |

---

## 11. Prohibited Behaviours

REC-01 must not allow:

1. ledger posting.
2. balance editing.
3. changing LED journal.
4. changing DEP receipt.
5. changing WDR provider instruction.
6. changing TRD LP fill.
7. changing WLT/AML decision.
8. editing SEC audit event.
9. deleting reconciliation break.
10. critical break auto-clear.
11. same user closing own high/critical break.
12. report hiding critical break.
13. final close with unresolved unapproved critical break.
14. export without permission/audit.
15. raw sensitive export without masking/approval.
16. source data overwrite by rerun.
17. report without run ID/source period.
18. value-conservation failure ignored.
19. safeguarding deficit ignored.
20. missing SEC critical event ignored.
21. Exchange order book report.
22. matching engine report.
23. principal inventory report.
24. AIX spread markup report.
25. unsupported manual adjustment hidden in report.
26. all-green report without population coverage proof.
27. missing E2E/SEC denominator ignored.
28. monotonic source sequence gap ignored.
29. cross-module run with inconsistent as-of cut-off labelled final.
30. in-flight expected-open item misclassified as clean or ignored past SLA.
31. unauthenticated external statement used for safeguarding.
32. partial safeguarding accounts treated as complete.
33. stale external statement used without warning/break.
34. REC run/break/report hash-chain disabled.
35. selective narrowed scope labelled full population.
36. safeguarding sign-off without four-eyes.
37. high/critical break closed without clean re-reconciliation.
38. recurring break closed as resolved without escalation.
39. false-positive critical break signed off by non-independent user.
40. tolerance applied to zero-tolerance class.
41. severity mapping silently downgraded.
42. reconciliation rule changed without approval/audit.
43. final report silently edited instead of restated.
44. regulatory filing deadline missed without escalation.

---

## 12. Acceptance Criteria

REC-01 is accepted only if:

1. Reconciliation orchestration defined.
2. Source snapshot/hashing defined.
3. Ledger reconciliation defined.
4. Deposit reconciliation defined.
5. Withdrawal reconciliation defined.
6. Trade reconciliation defined.
7. Fee reconciliation defined.
8. Safeguarding report defined.
9. Value conservation defined.
10. Audit completeness defined.
11. E2E correlation completeness defined.
12. External statement reconciliation defined.
13. Break lifecycle defined.
14. Break closure controls defined.
15. Close sign-off defined.
16. Report generation defined.
17. Evidence pack defined.
18. Data export controls defined.
19. No source mutation defined.
20. Population coverage proof defined.
21. Monotonic sequence gap detection defined.
22. Consistent as-of snapshot defined.
23. In-flight reconciling item class defined.
24. External statement trust model defined.
25. REC hash-chain/external anchoring defined.
26. Mandated scope enforcement defined.
27. Reconciliation independence/SoD defined.
28. Clean re-reconciliation closure defined.
29. Recurrence detection defined.
30. Materiality/tolerance governance defined.
31. Severity/rule governance defined.
32. Report restatement workflow defined.
33. Regulatory obligation tracking defined.
34. Tests defined and passed.

---

## 13. Open Items

1. Final chart of accounts / finance report format.
2. Final daily close cut-off time.
3. Final external statement formats.
4. Final regulatory reporting templates.
5. Final management dashboard KPIs.
6. Final break SLA thresholds.
7. Final materiality thresholds.
8. Final auditor evidence format.
9. Final report retention schedule.
10. Final export approval policy.
