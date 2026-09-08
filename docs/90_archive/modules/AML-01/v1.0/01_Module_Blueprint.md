# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | AML-01 |
| Module name | Sanctions / PEP / Adverse Media / Travel Rule Screening |
| Pack version | v1.0 |
| Status | Initial module blueprint for Claude Opus review |
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
17. Tests defined and passed.

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
