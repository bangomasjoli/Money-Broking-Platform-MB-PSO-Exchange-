# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | AML-01 |
| Module name | Sanctions / PEP / Adverse Media / Travel Rule Screening |
| Pack version | v1.2 |
| Status | Accepted / final verified; v1.2 is cosmetic final rollup only, no substantive control change from v1.1 |
| Platform | AIX Money Broking + PSO Platform |
| Licence posture | Money Broking and PSO approved; Exchange pending |
| Module category | Compliance / AML-CFT / Screening |
| Depends on | FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2, SEC-01 v1.2, CFG-01 v1.2, CLT-01 v1.2, KYC-01 v1.2 |
| Provides outcome to | CLT-01, KYC-01, Risk, Wallet/Payout, Trading Eligibility, Reporting/STR |

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


---

## 2. Module Purpose

AML-01 determines whether a client, applicant, authorised party, beneficial owner, counterparty, wallet party, Travel Rule participant, or transaction-related party has AML/CFT screening concerns.

It answers:

```txt
Is this party clear, a possible match requiring review, a true hit, or subject to escalation/STR controls?
```

AML-01 must publish clear, auditable outcomes to CLT-01:

```txt
clear
hit
pending
stale
review_required
```

AML-01 also sends EDD/remediation triggers to KYC-01.

---

## 3. In Scope

AML-01 covers:

1. Screening case creation from CLT-01/KYC-01 handoff.
2. Client screening.
3. Authorised-party screening.
4. Director/controller/UBO screening.
5. Sanctions screening.
6. PEP screening.
7. Adverse media screening.
8. Internal watchlist screening.
9. Country/jurisdiction screening.
10. Screening vendor/result capture.
11. Screening list/version capture.
12. Match scoring and threshold configuration.
13. False-positive review.
14. True-hit escalation.
15. Screening outcome publication to CLT-01.
16. EDD trigger publication to KYC-01.
17. Ongoing rescreening.
18. List update rescreening.
19. Travel Rule originator/beneficiary data validation and screening support.
20. STR case preparation and escalation controls.
21. Tipping-off protection.
22. Screening evidence read/export.
23. Reconciliation of screening cases/outcomes/publications.
24. Vendor failure/degraded mode handling.
25. Sensitive audit and security monitoring events.

---

## 4. Out of Scope

AML-01 does not implement:

1. KYC/KYB identity verification.
2. Wallet risk scoring itself.
3. Transaction monitoring rule engine.
4. Ledger/account balances.
5. Trading/quote/execution.
6. Payout whitelist approval.
7. FIU portal submission integration unless later module owns it.
8. Legal advice.
9. Exchange matching/order-book features.
10. Direct client onboarding approval.

---

## 5. Critical Principles

### 5.1 Screening Outcome Provider

AML-01 is the authoritative provider of AML screening outcomes to CLT-01.

CLT-01 final approval must not proceed unless AML-01 outcome is current and satisfactory.

### 5.2 KYC Pass Is Not AML Clear

KYC-01 verifies identity/entity. AML-01 provides sanctions/PEP/adverse-media/watchlist screening.

A KYC pass must never be treated as AML clear.

```txt
combined_cdd = kyc_pass + aml_clear + risk_acceptable
```

### 5.3 Handoff Delivery Is Not Screening Outcome

Receiving a screening handoff or opening a screening case does not mean the party is clear.

AML-01 must maintain separate:

```txt
delivery_status
screening_case_status
screening_outcome_status
```

### 5.4 Sanctions Hit Hard Block

A true sanctions hit hard-blocks onboarding and must trigger restriction/escalation.

Rules:

1. Sanctions true hit cannot be overridden by Super Admin.
2. Sanctions true hit cannot be bypassed by break-glass.
3. Sanctions true hit cannot be cleared by service account.
4. Sanctions true hit requires Compliance/MLRO escalation.
5. Client/party status feedback must be sent to CLT-01.
6. EDD/remediation trigger must be sent to KYC-01 where applicable.

### 5.5 PEP / Adverse Media Risk Treatment

PEP or adverse-media match may be:

```txt
clear
false_positive
review_required
edd_required
reject
```

High-risk PEP/adverse-media outcome must trigger EDD or rejection according to policy.

### 5.6 List Version and Screening Evidence

Every screening result must capture:

1. list/provider.
2. list version.
3. screening timestamp.
4. search input hash.
5. candidate match IDs.
6. score.
7. threshold.
8. reviewer decision.
9. outcome reason.
10. evidence reference.
11. SEC-01 audit reference.

### 5.7 False Positive Control

False-positive clearance requires reviewer evidence and reason.

Repeat false positives should be controlled using versioned allow/false-positive decision references, but must be revalidated when list/provider/input materially changes.

### 5.8 True Hit Control

True hits require:

1. status restriction.
2. Compliance/MLRO review.
3. potential STR case.
4. tipping-off protection.
5. downstream freeze/block signal.
6. SEC-01 Critical audit.
7. management escalation where policy requires.

### 5.9 Ongoing Monitoring / Rescreening

AML-01 must rescreen:

1. on list update.
2. periodically by risk class.
3. on client profile change.
4. on authorised-party/UBO change.
5. on jurisdiction change.
6. before key high-risk actions where policy requires.
7. on wallet/counterparty event where downstream module requires.

### 5.10 Travel Rule Screening Support

AML-01 supports Travel Rule checks by validating and screening originator/beneficiary party data where required.

Travel Rule support includes:

1. required data completeness check.
2. originator and beneficiary screening.
3. VASP/counterparty screening where applicable.
4. missing/incomplete data outcome.
5. Travel Rule screening outcome publication.
6. audit evidence.

### 5.11 STR and Tipping-Off Protection

AML-01 must support suspicious case escalation while preventing tipping-off.

Rules:

1. STR suspicion data is highly restricted.
2. STR-related alerts must not be visible to client-facing users.
3. Client notification must be suppressed where tipping-off risk exists.
4. STR draft/preparation requires Compliance/MLRO permission.
5. STR case access requires SEC-01 sensitive read logging.
6. STR decision and filing status must be audited.
7. Operational blocks should use safe reason codes.

### 5.12 Vendor / List Integrity

AML-01 may use screening vendors/lists, but must verify:

1. vendor/list source is approved.
2. result source is authenticated.
3. result payload hash is stored.
4. list version is captured.
5. list update triggers rescreening.
6. vendor outage is fail-closed or approved manual fallback.
7. provider confidence/score threshold is configured.

### 5.13 Outcome Publication Contract

AML-01 must publish outcome to CLT-01 and trigger to KYC-01 using controlled API/event.

Outcome publication must include:

1. case ID.
2. party/client/application ID.
3. screening type.
4. outcome status.
5. list version.
6. validity/expiry.
7. reason code.
8. evidence refs.
9. payload hash.
10. SEC-01 audit reference.

### 5.14 No Transaction Activation

AML clear does not grant trading, deposits, withdrawals, wallet, payout or Exchange access.

AML-01 only publishes screening outcome and restriction/escalation signals.

### 5.15 Data Protection

AML screening data is highly sensitive.

Rules:

1. store minimum required data.
2. restrict STR/suspicion data.
3. apply role-based redaction.
4. log sensitive read/export in SEC-01.
5. define retention class and lawful basis.
6. support legal hold.
7. avoid client-visible tipping-off indicators.


### 5.16 Real-Time Pre-Transaction Sanctions Gate

AML-01 sanctions screening is not only onboarding or periodic monitoring.

A synchronous pre-transaction sanctions gate is mandatory before funds, assets, transfers, settlements, payouts, Travel Rule transfers, or payment movements proceed.

Rules:

1. Payment/settlement/MON/withdrawal/deposit/wallet/payout/Travel Rule flows must call AML-01 or verify a current AML-01 transaction-screening decision before movement.
2. Sanctions gate must evaluate client, counterparty, beneficiary, originator, VASP/counterparty, wallet-associated party where applicable, and newly listed parties.
3. Unknown, stale, missing, incomplete, pending, or failed sanctions decision denies or holds the transaction.
4. Sanctions true hit hard-blocks the transaction and triggers CLT-01 restriction and KYC-01 EDD/remediation signal where applicable.
5. A pre-transaction clear is action-scoped, counterparty-scoped, amount/context-scoped where required, and short-lived.
6. Pre-transaction screening does not post ledger, execute trade, settle funds, or approve payout by itself.
7. This gate is a hard contract with MON/settlement/payment/Travel Rule modules.

Parameters:

```txt
sanctions_screening              = pre_transaction_synchronous_gate
transaction_screening_contract   = hard_with_mon_settlement_and_travel_rule
pre_transaction_decision_ttl      = to_be_defined
pre_transaction_unknown_or_stale  = deny_or_hold
```

### 5.17 List-Update Rescreening SLA and Interim Blocking

Sanctions list updates require hard SLA handling.

Rules:

1. Every sanctions list update creates a rescreening run.
2. Affected active clients/parties/counterparties must be blocked or restricted in the interim until rescreened according to policy.
3. If rescreening exceeds SLA, Critical alert is emitted.
4. If list freshness cannot be verified, screening outcomes using that list are stale.
5. List update must invalidate impacted AML decision tokens/outcomes.
6. New transactions for affected parties must call pre-transaction gate after list update.

Parameters:

```txt
list_update_rescreen_sla_seconds = to_be_defined
list_update_interim              = block_affected_until_rescreened
list_freshness_assurance         = required
```

### 5.18 Sanctions List Coverage and Matching Quality

AML-01 must define mandatory sanctions list coverage and matching quality.

Required coverage baseline:

1. UN.
2. OFAC.
3. EU.
4. UK/HMT.
5. MAS.
6. Malaysia/MOHA.
7. Any additional jurisdiction/regulator list configured by Compliance.

Matching-quality standard:

1. aliases.
2. fuzzy matching.
3. transliteration.
4. name variations.
5. date of birth corroboration.
6. nationality/country corroboration.
7. ID/document reference where available.
8. entity registration number where available.
9. scoring threshold and non-suppressible threshold floor.
10. multi-source corroboration where risk-based.

Parameters:

```txt
sanctions_list_coverage = un_ofac_eu_uk_mas_malaysia_moha
matching_quality        = alias_fuzzy_transliteration_variations
match_threshold_floor   = cannot_suppress_true_match
```

### 5.19 Ownership-Based Sanctions / 50 Percent Rule

AML-01 must screen ownership/control exposure using KYC-01 ownership graph.

Rules:

1. AML-01 consumes KYC-01 UBO look-through tree.
2. Every UBO/controller resolved to a natural person must be screened.
3. Any newly discovered UBO/controller triggers screening.
4. Ownership must aggregate direct and indirect ownership.
5. Entity is treated as sanctioned/restricted if ownership/control rule threshold is met by sanctioned persons according to configured policy.
6. The 50 percent ownership rule must be supported.
7. Untraced ownership branch cannot be considered clear.
8. If KYC-01 ownership graph is stale, incomplete, or unavailable, sanctions outcome is pending/review_required, not clear.

Parameters:

```txt
ownership_based_sanctions_50pct = enabled_using_kyc_ubo_tree
screening_scope_from_kyc        = all_ubos_to_natural_persons
```

### 5.20 STR Statutory Clock and Pending-Transaction Handling

AML-01 owns suspicion case timing until the reporting module/FIU integration is implemented.

Rules:

1. Suspicion formation starts an internal statutory clock.
2. Suspicion-to-MLRO review deadline must be recorded.
3. MLRO filing/not-filing decision deadline must be recorded.
4. FIU/BNM filing owner and statutory filing deadline must be defined.
5. Escalation occurs before deadline breach.
6. Transaction handling while STR is pending must be policy-controlled:
   - proceed with monitoring.
   - hold.
   - block.
   - escalate.
7. Client-facing reason must not tip off.
8. STR/FIU filing integration boundary must be explicit until reporting module takes ownership.

Parameters:

```txt
str_filing_owner               = defined
str_filing_deadline            = statutory_sla
suspicion_to_mlro_clock        = defined
transaction_during_pending_str = policy_defined_no_tipping_off
```

### 5.21 Sanctions False-Positive Governance

Sanctions false positives require elevated governance.

Rules:

1. Sanctions false-positive decision requires dual Compliance/MLRO review.
2. Sanctions false-positive approvers must be distinct.
3. Standing false-positive/allowlist decision requires periodic re-attestation.
4. Standing false-positive decision must be invalidated by material list/input/profile change.
5. False-positive decision cannot lower match threshold below floor.
6. Low-risk adverse-media false-positive control cannot be reused for sanctions false positives.
7. Sanctions false-positive clearance is evidence-based, reasoned, audit logged, and time-bound.

Parameters:

```txt
sanctions_false_positive_review = dual_compliance_mlro
standing_fp_reattestation       = periodic
match_threshold_floor           = cannot_suppress_true_match
```

### 5.22 Screening Input Quality Gate

AML-01 cannot clear a party based on insufficient identity data.

Minimum screening input dataset must be defined by party type.

Baseline individual dataset:

1. full name.
2. date of birth where available/required.
3. nationality/country where available/required.
4. ID/document reference hash where available.
5. aliases/transliterations where available.

Baseline entity dataset:

1. legal name.
2. registration number where available.
3. jurisdiction/country.
4. aliases/trading names where available.
5. UBO/controller list where applicable.

Rules:

1. Name-only screening cannot be clear unless policy explicitly allows low-risk limited use.
2. Incomplete input results in pending/review_required, never clear.
3. Input quality status must be recorded in screening result.
4. Input must be sourced from KYC-01 verified data where available.
5. Material input change requires re-screening and false-positive revalidation.

Parameters:

```txt
min_screening_input_dataset = name_dob_nationality_id_by_party_type
incomplete_input            = review_not_clear
```

### 5.23 AML Outcome Tamper-Evidence and Freshness Contract

AML outcomes that gate onboarding or transactions are security-critical decisions.

Rules:

1. AML outcome payload must be hash-sealed.
2. AML outcome publication to CLT-01 includes payload hash.
3. CLT-01 must verify payload hash/version before using outcome.
4. AML outcome has validity window.
5. New hit, list update, profile change, ownership change, or sanctions list freshness failure revokes/invalidates prior clear outcome.
6. Outcome revocation must be published to CLT-01 and relevant downstream modules.
7. SEC-01 audit evidence must link outcome computation, publication and revocation.

Parameters:

```txt
aml_outcome_freshness = validity_window+revoke_on_new_hit
clt_payload_hash_verification = required
```

### 5.24 PEP Depth / RCA / Declassification

PEP screening must distinguish depth and persistence.

Rules:

1. Foreign PEP and domestic PEP must be distinguished.
2. RCA coverage must include relatives and close associates.
3. PEP declassification / persistence period after leaving office must be defined.
4. PEP result may be clear, false_positive, review_required, edd_required, or reject according to policy.
5. PEP/RCA match triggers EDD or risk review where required.

Parameters:

```txt
pep_scope = foreign_domestic_rca
pep_declassification_persistence = to_be_defined
```

### 5.25 Country / High-Risk Jurisdiction Screening

AML-01 must define country and jurisdiction screening source and handling.

Rules:

1. High-risk jurisdiction source must be configured.
2. FATF grey/black list handling must be defined.
3. Country match may trigger EDD, restriction, rejection, or enhanced monitoring.
4. Country list update triggers affected-party rescreening.
5. Jurisdiction changes from CLT-01/KYC-01 trigger rescreening.

Parameters:

```txt
high_risk_jurisdiction_source = fatf_grey_black+configured_internal
country_jurisdiction_handling = edd_restrict_reject_or_enhanced_monitoring
```

### 5.26 De-Listing / Removal Controlled Unblock

List removal does not automatically unblock a client/party.

Rules:

1. De-listing creates review task.
2. Controlled unblock requires Compliance/MLRO approval where prior hit caused restriction.
3. Historical STR/suspicion evidence remains restricted.
4. Outcome may change only after rescreening and approval.
5. Downstream status unblock must be published to CLT-01.

Parameters:

```txt
delisting_unblock = controlled_review_approval
```

### 5.27 Travel Rule Threshold and Sunrise Handling

Travel Rule applicability must be policy-defined.

Rules:

1. De-minimis/applicability threshold must be defined.
2. Required Travel Rule fields must be defined by transaction type.
3. Counterparty VASP not Travel-Rule-capable triggers sunrise handling.
4. Sunrise handling may route to review, hold, enhanced due diligence, or reject.
5. Missing/incomplete Travel Rule data cannot be treated as clear.

Parameters:

```txt
travel_rule_threshold = de_minimis_defined
travel_rule_sunrise   = counterparty_vasp_incapable_handling
```

---

## 6. Actors

| Actor | Role |
|---|---|
| AML Analyst | Reviews screening matches |
| Compliance Officer / MLRO | Approves true hit, PEP/adverse media decisions, STR escalation |
| Operations Manager | Operational review where allowed |
| Super Admin | Limited admin; cannot bypass screening |
| Auditor | Read-only evidence access |
| Vendor Service Account | Provides screening result |
| CLT-01 Service | Sends handoff and receives AML outcome |
| KYC-01 Service | Receives EDD/remediation trigger |
| Wallet/Payout Service | Future screening consumer |
| Travel Rule Service | Future Travel Rule data provider/consumer |
| System Job | Rescreening, list update, reconciliation |

---

## 7. Dependencies

### 7.1 Upstream

1. CLT-01 party/client/application handoff.
2. KYC-01 verified identity/entity/party data.
3. FND-01 request/correlation ID.
4. IAM-01 step-up.
5. IAM-02 permission, maker-checker, SoD, protected-action registry.
6. SEC-01 audit and sensitive read logging.
7. CFG-01 feature/licence gate.
8. Screening vendor/list provider.

### 7.2 Downstream

1. CLT-01 final approval gate and status feedback.
2. KYC-01 EDD/remediation/stale trigger.
3. Risk rating module.
4. Wallet/payout whitelist module.
5. Trading eligibility module.
6. Transaction monitoring module.
7. STR/reporting module.

---

## 8. Components

| Component | Description |
|---|---|
| Screening Case Service | Creates and manages screening cases |
| Sanctions Screening Service | Sanctions screening |
| PEP Screening Service | PEP screening |
| Adverse Media Screening Service | Adverse-media screening |
| Watchlist Screening Service | Internal/regulatory watchlist screening |
| Travel Rule Screening Service | Originator/beneficiary/counterparty screening support |
| List Version Registry | Screening list/provider version control |
| Vendor Result Inbox | Receives vendor results |
| Match Scoring Engine | Applies thresholds and match logic |
| Match Review Workflow | False-positive/true-hit review |
| Outcome Engine | Computes clear/hit/pending/stale/review_required |
| Outcome Publisher | Publishes outcome to CLT-01 |
| KYC Trigger Publisher | Sends EDD/remediation trigger to KYC-01 |
| Ongoing Rescreening Scheduler | List update/periodic/profile-change rescreening |
| STR Case Escalation Service | Restricted suspicion escalation |
| Tipping-Off Guard | Suppresses unsafe client-facing signals |
| Evidence Access Service | Controlled evidence read/export |
| Reconciliation Jobs | Detect screening/outcome/publication drift |
| Pre-Transaction Sanctions Gate | Synchronous sanctions decision before movement of funds/assets |
| List Update SLA Controller | Rescreening SLA, interim blocking and list freshness |
| Sanctions Coverage Policy Engine | Enforces list coverage and matching-quality baseline |
| Ownership-Based Sanctions Engine | Applies 50% rule using KYC-01 UBO graph |
| Screening Input Quality Gate | Blocks clear on incomplete/thin party data |
| STR Clock Manager | Suspicion-to-MLRO and FIU filing deadline tracking |
| Sanctions False-Positive Reattestation Engine | Dual review, threshold floor and periodic re-attestation |
| AML Outcome Seal Service | Hash-seals outcomes and manages freshness/revocation |
| PEP/RCA Policy Engine | Foreign/domestic/RCA/declassification handling |
| Country Risk Screening Engine | FATF/high-risk jurisdiction screening |
| De-Listing Review Engine | Controlled unblock after list removal |
| Travel Rule Threshold / Sunrise Engine | De-minimis and counterparty capability handling |

---

## 9. Functional Requirements

### AML1-FR-001 Screening Case Creation

The platform shall create screening cases from CLT-01/KYC-01 handoff.

### AML1-FR-002 Screening Types

The platform shall support sanctions, PEP, adverse media, watchlist, country/jurisdiction, and Travel Rule screening support.

### AML1-FR-003 Handoff vs Outcome Separation

The platform shall model handoff delivery separately from screening outcome.

### AML1-FR-004 Sanctions Screening

The platform shall screen required parties against approved sanctions lists.

### AML1-FR-005 PEP Screening

The platform shall screen required parties against approved PEP sources.

### AML1-FR-006 Adverse Media Screening

The platform shall screen required parties against approved adverse-media sources.

### AML1-FR-007 UBO / Authorised Party Screening

The platform shall screen authorised parties, directors, controllers and UBOs.

### AML1-FR-008 List Version Capture

The platform shall capture list/provider version and screening timestamp.

### AML1-FR-009 Match Scoring

The platform shall apply match score threshold and decision workflow.

### AML1-FR-010 False Positive Review

The platform shall support false-positive review with evidence and reason.

### AML1-FR-011 True Hit Escalation

The platform shall escalate true hits to Compliance/MLRO.

### AML1-FR-012 AML Outcome

The platform shall compute screening outcome.

### AML1-FR-013 Outcome Publication

The platform shall publish outcome to CLT-01.

### AML1-FR-014 KYC EDD Trigger

The platform shall send EDD/remediation trigger to KYC-01 where required.

### AML1-FR-015 Ongoing Rescreening

The platform shall rescreen on list update, profile change, periodic schedule, or trigger event.

### AML1-FR-016 Travel Rule Screening Support

The platform shall validate and screen Travel Rule originator/beneficiary/counterparty data where required.

### AML1-FR-017 STR Case Escalation

The platform shall support restricted STR/suspicion case escalation workflow.

### AML1-FR-018 Tipping-Off Protection

The platform shall suppress unsafe client-facing notifications and use safe operational reason codes.

### AML1-FR-019 Sensitive Read Logging

The platform shall log sensitive screening/STR evidence read/export through SEC-01.

### AML1-FR-020 Reconciliation

The platform shall reconcile handoffs, screening cases, list versions, outcomes, publications, STR restrictions and sensitive reads.

### AML1-FR-021 Pre-Transaction Sanctions Gate

The platform shall provide a synchronous pre-transaction sanctions screening gate for MON/settlement/payment/Travel Rule flows.

### AML1-FR-022 List-Update SLA / Interim Blocking

The platform shall enforce list-update rescreening SLA and interim blocking of affected parties until rescreened.

### AML1-FR-023 Sanctions Coverage Policy

The platform shall define mandatory sanctions list coverage including UN, OFAC, EU, UK/HMT, MAS and Malaysia/MOHA.

### AML1-FR-024 Matching Quality Standard

The platform shall enforce alias, fuzzy, transliteration, name variation, DOB/nationality/ID corroboration and threshold-floor controls.

### AML1-FR-025 Ownership-Based Sanctions / 50 Percent Rule

The platform shall screen KYC-01 UBO/control graph and apply ownership-based sanctions including 50 percent rule.

### AML1-FR-026 Screening Input Quality Gate

The platform shall require minimum screening input dataset by party type and prevent clear outcome on incomplete input.

### AML1-FR-027 STR Statutory Clock

The platform shall track suspicion formation, MLRO review deadline, FIU filing deadline and escalation.

### AML1-FR-028 Pending STR Transaction Handling

The platform shall define proceed/hold/block/escalate policy for transactions during pending STR without tipping off.

### AML1-FR-029 Sanctions False-Positive Dual Review

The platform shall require dual Compliance/MLRO review for sanctions false-positive decisions.

### AML1-FR-030 Standing False-Positive Reattestation

The platform shall require periodic re-attestation and material-change revalidation of standing false-positive decisions.

### AML1-FR-031 AML Outcome Seal and Freshness

The platform shall hash-seal AML outcome payloads, define validity window, revoke on new hit and require CLT payload-hash verification.

### AML1-FR-032 PEP/RCA Depth

The platform shall distinguish foreign/domestic PEP, RCA and declassification/persistence handling.

### AML1-FR-033 Country/Jurisdiction Screening

The platform shall define FATF/high-risk jurisdiction sources and EDD/restrict/reject/enhanced-monitoring handling.

### AML1-FR-034 De-Listing Controlled Unblock

The platform shall require controlled review/approval before unblocking after list removal.

### AML1-FR-035 Travel Rule Threshold and Sunrise

The platform shall define Travel Rule de-minimis/applicability threshold and counterparty VASP sunrise handling.

### AML1-FR-036 List Freshness Assurance

The platform shall verify sanctions/PEP/watchlist freshness and mark outcomes stale if freshness cannot be proven.

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Sanctions true hit | Hard block |
| Handoff vs outcome separation | Required |
| KYC pass not AML clear | Required |
| Screening list version | Captured |
| Result payload hash | Required |
| Vendor source authentication | Required |
| False-positive reason | Required |
| True-hit escalation | Required |
| STR/tipping-off protection | Required |
| Ongoing rescreening | Required |
| Sensitive read/export | SEC-01 logged |
| Manual decision | IAM-02 maker-checker |
| Pre-transaction sanctions gate | Required |
| List update SLA/interim block | Required |
| List coverage | UN/OFAC/EU/UK/HMT/MAS/Malaysia-MOHA baseline |
| Ownership 50% rule | Required using KYC-01 UBO graph |
| Input-quality gate | Incomplete input = review/pending, not clear |
| STR statutory clock | Required |
| Sanctions FP dual review | Required |
| Standing FP re-attestation | Required |
| Outcome seal/freshness | Required |
| PEP/RCA depth | Required |
| Travel Rule threshold/sunrise | Required |
| Test coverage | Critical controls 100% |

---

## 11. Prohibited Behaviours

AML-01 must not allow:

1. AML clear because handoff exists.
2. KYC pass treated as AML clear.
3. Client approval with pending/stale AML outcome.
4. Sanctions true hit cleared by Super Admin.
5. Sanctions true hit cleared by break-glass.
6. Service account false-positive or true-hit decision.
7. Manual false-positive clearance without reason/evidence.
8. True-hit decision without Compliance/MLRO escalation.
9. STR/suspicion data visible to client-facing users.
10. Client notification that tips off suspicious case.
11. Screening result accepted without list/provider version.
12. Vendor result accepted without source authentication/payload hash.
13. List update without rescreening.
14. Stale screening outcome treated as clear.
15. Travel Rule data missing but screening treated as clear.
16. Sensitive screening/STR read without SEC-01 logging.
17. Direct DB edit of screening outcome.
18. AML clear granting trading/deposit/withdrawal.
19. False-positive rule reused after material list/input change without revalidation.
20. Safe operational block reason exposing STR suspicion.
21. Transaction proceeds without synchronous sanctions gate where required.
22. Affected party transacts after list update before rescreening/interim clearance.
23. AML clear without mandated sanctions list coverage.
24. Ownership-based sanctions ignored despite KYC-01 UBO graph.
25. AML clear on incomplete/thin screening input.
26. Name-only screening treated as clear where minimum dataset required.
27. STR case without suspicion/MLRO/FIU filing clock.
28. Pending STR transaction handled without no-tipping-off policy.
29. Sanctions false-positive cleared without dual Compliance/MLRO review.
30. Standing sanctions false-positive never re-attested.
31. Match threshold lowered below non-suppressible floor.
32. AML outcome used without payload hash/validity verification.
33. New hit/list update does not revoke prior clear outcome.
34. PEP RCA ignored or PEP declassification undefined.
35. Country/high-risk jurisdiction source missing but country outcome clear.
36. De-listing automatically unblocks without review/approval.
37. Travel Rule threshold/sunrise undefined but Travel Rule outcome clear.

---

## 12. Acceptance Criteria

AML-01 is accepted only if:

1. Screening case creation defined.
2. Handoff vs outcome separation defined.
3. Sanctions/PEP/adverse-media/watchlist screening defined.
4. List/provider version capture defined.
5. Match scoring/threshold defined.
6. False-positive review defined.
7. True-hit escalation defined.
8. Outcome engine defined.
9. Outcome publication to CLT-01 defined.
10. EDD trigger to KYC-01 defined.
11. Ongoing rescreening defined.
12. Travel Rule screening support defined.
13. STR/tipping-off protection defined.
14. Vendor/list integrity defined.
15. Sensitive read/export defined.
16. Reconciliation defined.
17. Pre-transaction sanctions gate defined.
18. List-update SLA and interim blocking defined.
19. Sanctions list coverage and matching quality defined.
20. Ownership-based 50 percent rule defined.
21. Screening input-quality gate defined.
22. STR statutory clock and pending-transaction policy defined.
23. Sanctions false-positive dual review and re-attestation defined.
24. AML outcome seal/freshness contract defined.
25. PEP/RCA depth defined.
26. Country/high-risk jurisdiction screening defined.
27. De-listing controlled unblock defined.
28. Travel Rule threshold/sunrise defined.
29. Tests defined and passed.

---

## 13. Open Items

1. Final sanctions/PEP/adverse media vendor(s).
2. Final sanctions list sources.
3. Final PEP/adverse media sources.
4. Final match threshold policy.
5. Final false-positive revalidation rule.
6. Final STR workflow owner and FIU filing integration.
7. Final Travel Rule required data fields.
8. Final Travel Rule counterparty/VASP screening source.
9. Final rescreening frequency by risk class.
10. Final list update SLA.
11. Final operational safe reason codes.
12. Final retention schedule for AML/screening/STR evidence.

## 14. Final Verification Note

AML-01 v1.2 is accepted / final verified.

v1.1 resolved:
1. Real-time pre-transaction sanctions gate.
2. List-update SLA and interim blocking.
3. Mandated sanctions list coverage and matching quality.
4. Ownership-based sanctions / 50 percent rule using KYC-01 UBO graph.
5. STR statutory clock and pending-transaction policy.
6. Sanctions false-positive dual review and re-attestation.
7. Screening-input-quality gate.
8. AML outcome seal/freshness/revocation.
9. PEP/RCA/country/de-listing controls.
10. Travel Rule threshold/sunrise handling.

v1.2 is a cosmetic final rollup only.
