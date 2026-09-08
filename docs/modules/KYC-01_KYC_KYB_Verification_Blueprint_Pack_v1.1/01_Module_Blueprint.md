# KYC-01 KYC / KYB Verification
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | KYC-01 |
| Module name | KYC / KYB Verification |
| Pack version | v1.0 |
| Status | Revised after Claude Opus review; UBO look-through, vendor reliance, proofing assurance, KYC/AML boundary, evidence-store contract, identity cross-check, EDD measures and CLT hash alignment added |
| Platform | AIX Money Broking + PSO Platform |
| Licence posture | Money Broking and PSO approved; Exchange pending |
| Module category | Compliance / Customer Due Diligence |
| Depends on | FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2, SEC-01 v1.2, CFG-01 v1.2, CLT-01 v1.2 |
| Provides outcome to | CLT-01, AML-01, Risk, Wallet/Payout, Trading Eligibility |

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


---

## 2. Module Purpose

KYC-01 verifies whether a client or authorised party satisfies customer due diligence requirements.

It answers:

```txt
Is this individual, company, institution, director, controller, authorised party or UBO verified enough to proceed under AIX's onboarding and AML/CFT controls?
```

KYC-01 must publish clear, auditable outcomes to CLT-01:

```txt
pass
fail
pending
stale
remediation_required
```

---

## 3. In Scope

KYC-01 covers:

1. KYC/KYB case creation from CLT-01 handoff.
2. Individual identity verification workflow.
3. Corporate/institutional entity verification workflow.
4. Director/controller/signatory/UBO verification workflow.
5. Document checklist.
6. Document status tracking.
7. Identity/company registry evidence references.
8. Beneficial ownership capture and threshold logic.
9. Authorised-party verification.
10. CDD outcome aggregation.
11. Standard due diligence.
12. Enhanced due diligence routing.
13. Remediation request.
14. Manual review.
15. CDD pass/fail/pending/stale/remediation outcome.
16. Periodic review scheduling.
17. Trigger-based refresh.
18. Outcome publication to CLT-01.
19. Sensitive evidence read/export.
20. Vendor verification result capture.
21. Case lifecycle audit.
22. Reconciliation of KYC cases vs CLT handoffs.

---

## 4. Out of Scope

KYC-01 does not implement:

1. Sanctions screening.
2. PEP/adverse media screening.
3. Transaction monitoring.
4. Travel Rule.
5. Wallet screening.
6. Payout whitelist.
7. Ledger/account balance.
8. Trading/quote/execution.
9. Client onboarding form intake.
10. Client mandate creation.
11. Risk rating engine final decision.
12. Exchange onboarding.
13. Retail onboarding approval.

Those are handled by CLT-01, AML-01, risk, wallet/payout, trading, or future modules.

---

## 5. Critical Principles

### 5.1 CLT-01 Outcome Provider

KYC-01 is the authoritative provider of KYC/KYB CDD outcome to CLT-01.

CLT-01 final approval must not proceed unless KYC-01 outcome is current and satisfactory.

### 5.2 Handoff Delivery Is Not Outcome

Receiving a KYC handoff or opening a KYC case does not mean CDD passed.

KYC-01 must publish separate case lifecycle status and outcome status.

```txt
delivery_status != cdd_outcome_status
```

### 5.3 Identity / Entity Verification Required

KYC-01 must verify:

1. individual identity.
2. corporate / institutional legal existence.
3. authorised representative authority.
4. directors/controllers where applicable.
5. UBOs where applicable.
6. ownership/control structure where applicable.

### 5.4 Beneficial Ownership Threshold

KYC-01 must identify and verify UBOs/controllers according to a configurable threshold.

The threshold must be stored, versioned, and auditable.

```txt
ubo_threshold = to_be_defined
```

### 5.5 Authorised Party Verification

No signatory, director, controller, UBO, client admin, client maker, or client approver may become active in CLT-01 until required KYC verification is complete and satisfactory.

### 5.6 CDD Outcome Must Be Explicit

Every KYC/KYB case must produce one of:

```txt
pass
fail
pending
stale
remediation_required
```

Outcome must include:

1. outcome reason.
2. verification scope.
3. evidence refs.
4. reviewer/approver where manual.
5. expiry/review date.
6. confidence/status from vendor/manual review.
7. SEC-01 audit reference.

### 5.7 Fail / Remediation Rules

KYC-01 must fail or require remediation when:

1. identity cannot be verified.
2. entity cannot be verified.
3. required document missing.
4. document invalid/expired/tampered.
5. ownership/control cannot be established.
6. authorised-party authority cannot be evidenced.
7. UBO threshold not satisfied.
8. inconsistent applicant information.
9. duplicate verified identity conflict.
10. jurisdiction restriction requires block/hold.

### 5.8 Enhanced Due Diligence Routing

KYC-01 must route case to Enhanced Due Diligence when configured triggers apply.

Examples:

1. complex ownership structure.
2. high-risk jurisdiction.
3. trust/foundation/nominee structure.
4. non-face-to-face concern.
5. high-value HNWI/institutional profile.
6. inconsistent documents.
7. manual reviewer concern.
8. politically exposed indicator from downstream AML module when integrated.

### 5.9 Maker-Checker for Manual Overrides

Manual pass, fail override, remediation clearance, UBO exception, duplicate identity exception, and EDD approval require IAM-02 maker-checker and SoD.

Super Admin, break-glass, service account, temporary permission, or direct DB edit cannot approve CDD.

### 5.10 Evidence Integrity

KYC-01 stores evidence references and verification results, not uncontrolled raw documents where a dedicated document/evidence store is expected.

Every evidence reference must be tied to:

1. document type.
2. source.
3. hash/reference.
4. verification result.
5. reviewer/vendor.
6. timestamp.
7. retention class.
8. SEC-01 audit reference.

### 5.11 Periodic Review / Refresh

KYC-01 outcomes expire or become stale according to risk class, document expiry, regulation, or trigger event.

Stale outcome must be sent to CLT-01 and block/limit downstream access according to CLT status policy.

### 5.12 Outcome Publication Contract

KYC-01 must publish outcome to CLT-01 using controlled API/event.

Outcome publication must include:

1. case ID.
2. application/client/party ID.
3. outcome type.
4. outcome status.
5. outcome version.
6. validity/expiry.
7. evidence refs.
8. payload hash.
9. SEC-01 audit ref.

### 5.13 No Trading/Payment Activation

KYC pass does not grant trading, deposits, withdrawals, wallet, payout or Exchange access.

KYC-01 only publishes CDD outcome.

### 5.14 Data Protection

KYC/KYB data is highly sensitive.

Rules:

1. store minimum needed data.
2. encrypt sensitive fields/doc refs.
3. access through IAM-02.
4. sensitive read/export logged in SEC-01.
5. lawful basis and retention class defined.
6. immutable audit retained where required.
7. DSAR/rectification supported through CLT/data-protection process.


### 5.15 UBO Look-Through to Ultimate Natural Persons

KYC-01 must identify the ultimate natural persons who own or control a client.

Rules:

1. Ownership/control must recurse through intermediate entities until natural persons are identified.
2. Indirect ownership must be aggregated across branches.
3. Trust/nominee structures must model settlor, trustee, beneficiary, protector, nominee and controller roles.
4. A branch cannot be marked complete if it stops at an entity, trust, nominee or unknown controller without approved EDD decision.
5. Unable to determine ownership/control results in EDD or fail, never pass.
6. UBO/control verification must cover direct ownership, indirect ownership and control indicators.
7. UBO threshold exceptions require IAM-02 maker-checker and Compliance approval.
8. Pass outcome with any untraced ownership branch is prohibited.

Parameters:

```txt
ubo_lookthrough          = recurse_to_natural_persons
ubo_untraceable          = edd_or_fail_not_pass
ubo_indirect_aggregation = enabled
trust_nominee_roles      = settlor_trustee_beneficiary_protector_modelled
```

### 5.16 Third-Party / Vendor Reliance Framework

KYC-01 may use vendors or registry sources, but reliance must be governed.

Rules:

1. Vendor must be accredited/approved before production use.
2. Vendor reliance must confirm vendor is regulated/supervised or otherwise approved by Compliance.
3. Underlying CDD records must be obtainable on demand.
4. Vendor contract must define response SLA, evidence retention, data protection, audit rights, and record retrieval.
5. Vendor outage mode is fail-closed unless approved manual fallback is activated.
6. Vendor result must have a validity window.
7. Confidence score acceptance threshold must be configured by verification type/client class/risk.
8. Inconclusive result is not pass.
9. High-risk cases may require multi-source corroboration.

Parameters:

```txt
vendor_reliance_framework   = regulated_supervised_records_obtainable
vendor_outage_mode          = fail_closed_or_manual_fallback
vendor_result_validity      = risk_based_window
vendor_confidence_threshold = to_be_defined
multi_source_corroboration  = risk_based
```

### 5.17 Identity-Proofing Assurance

KYC-01 must define assurance level and method, not only boolean verification.

Minimum method controls:

1. document authenticity check.
2. liveness/biometric binding for non-face-to-face onboarding where applicable.
3. address verification where required.
4. identity-vs-application cross-check.
5. entity-vs-application cross-check.
6. source-of-wealth/source-of-funds for high-risk, HNWI or EDD cases.

Rules:

1. Weak proofing method cannot satisfy high-risk/HNWI/remote assurance if stronger method is required.
2. Name/DOB/entity details mismatch with CLT-01 application routes to remediation or EDD, not pass.
3. Assurance level and method must be recorded in verification result.

Parameters:

```txt
identity_proofing_assurance       = defined_by_class_and_risk
liveness_biometric_binding        = required_non_face_to_face
document_authenticity_check       = required
source_of_wealth_funds            = required_edd_high_risk_hnwi
identity_vs_application_crosscheck = mismatch_to_remediation_edd
```

### 5.18 KYC / AML Boundary Contract

KYC-01 verifies identity/entity/ownership. AML-01 owns sanctions, PEP, adverse media, Travel Rule and screening.

Rules:

1. KYC-01 pass means identity/entity/KYB verification only.
2. KYC-01 pass does not mean AML/sanctions/PEP/adverse-media clear.
3. CLT-01 combined CDD approval requires KYC pass plus AML clear/risk outcome according to CLT-01 §5.14.
4. KYC↔AML EDD integration is a hard contract, not optional.
5. AML PEP/adverse-media/sanctions flags must be able to trigger KYC EDD/remediation/stale review.
6. KYC cannot finalize an overall CDD-ready state unless AML dependency status is available to CLT-01.

Parameters:

```txt
kyc_pass_scope       = identity_entity_only_not_screening
kyc_aml_edd_contract = hard_not_when_integrated
combined_cdd_requires = kyc_pass+aml_clear
```

### 5.19 Evidence Store Security Contract

KYC-01 references sensitive documents stored in an approved evidence/document store.

Required evidence-store contract:

1. encryption at rest.
2. encryption in transit.
3. IAM-02-bound access control.
4. SEC-01 sensitive read/export logging.
5. hash re-verification on read.
6. tamper detection on hash mismatch.
7. retention and destruction aligned with CLT-01 data-protection model.
8. legal hold support.
9. access expiry for exported evidence.
10. evidence-store service account scoping.

Rules:

1. Evidence hash stored in KYC-01 must be rechecked against the evidence store before sensitive read/export and during reconciliation.
2. Hash mismatch blocks use and raises Critical SEC-01 alert.
3. Evidence cannot be trusted if evidence-store contract is unavailable/undefined.

Parameters:

```txt
evidence_store_encryption_at_rest = required
evidence_hash_reverified_on_read  = true
evidence_store_access_control     = iam2_bound
evidence_retention_destruction    = defined_aligned_with_clt01
```

### 5.20 Minimum EDD Measures

EDD is not only a routing state. It requires defined measures.

Minimum EDD measures:

1. enhanced ownership verification.
2. source-of-wealth and source-of-funds evidence.
3. senior management or Compliance/MLRO approval.
4. enhanced document/evidence verification.
5. multi-source corroboration where risk-based.
6. enhanced periodic review frequency.
7. reasoned decision and SEC-01 audit trail.

Parameters:

```txt
edd_minimum_measures = enhanced_ownership+sow_sof+senior_approval+enhanced_review
```

### 5.21 Verified Identity Hash Alignment

KYC-01 verified identity hash basis must align with CLT-01 `verified_identity`.

Rules:

1. Same canonical identity basis must be used across KYC-01 and CLT-01.
2. Hash input version must be stored.
3. Duplicate detection must compare against CLT-01 verified identity where applicable.
4. Hash mismatch or identity collision routes to duplicate/EDD review.

Parameters:

```txt
verified_identity_hash_basis = aligned_with_clt01
```

---

## 6. Actors

| Actor | Role |
|---|---|
| Applicant | Provides KYC/KYB information through CLT-01 |
| Authorised Party | Provides identity/authority evidence |
| KYC Analyst | Reviews KYC/KYB case |
| Compliance Officer / MLRO | Approves high-risk/EDD/manual outcomes |
| Operations Manager | Operational review where allowed |
| Super Admin | Limited admin; cannot bypass CDD |
| Auditor | Read-only evidence access |
| Vendor Service Account | Provides verification result |
| CLT-01 Service | Sends handoff and receives outcome |
| System Job | Periodic review, expiry, reconciliation |

---

## 7. Dependencies

### 7.1 Upstream

1. CLT-01 application/profile/party handoff.
2. FND-01 request/correlation ID.
3. IAM-01 step-up.
4. IAM-02 permission, maker-checker, SoD, protected-action registry.
5. SEC-01 audit and sensitive read logging.
6. CFG-01 feature/licence/client-class gates.

### 7.2 Downstream

1. CLT-01 final approval gate.
2. AML/sanctions/PEP module.
3. Risk rating module.
4. Wallet/payout whitelist module.
5. Trading eligibility module.
6. Periodic review / monitoring modules.

---

## 8. Components

| Component | Description |
|---|---|
| KYC Case Service | Creates and manages individual cases |
| KYB Case Service | Creates and manages entity cases |
| Party Verification Service | Handles authorised party/director/controller/UBO cases |
| Document Checklist Service | Tracks required documents and evidence refs |
| Verification Result Aggregator | Aggregates vendor/manual verification results |
| UBO / Ownership Service | Captures ownership/control tree and threshold coverage |
| CDD Outcome Engine | Computes pass/fail/pending/stale/remediation |
| EDD Router | Routes enhanced due diligence cases |
| Manual Review Workflow | Maker-checker-controlled review decisions |
| Outcome Publisher | Sends outcome to CLT-01 |
| Periodic Review Scheduler | Tracks expiry/review |
| Evidence Access Service | Controlled evidence read/export |
| Reconciliation Jobs | Detect handoff/case/outcome inconsistencies |
| Vendor Adapter | Receives external verification responses |
| UBO Look-Through Engine | Recurses ownership/control to ultimate natural persons |
| Trust / Nominee Role Model | Captures settlor/trustee/beneficiary/protector/nominee/controller |
| Vendor Reliance Registry | Stores vendor accreditation, reliance status and record-obtainability controls |
| Proofing Assurance Policy Engine | Enforces assurance method/level by class and risk |
| KYC/AML Boundary Publisher | Publishes identity-only KYC scope and consumes AML-triggered EDD signals |
| Evidence Store Gateway | Verifies evidence hash, access control and retention contract |
| Identity Cross-Check Service | Cross-checks verified identity/entity against CLT application data |
| Verified Identity Hash Service | Aligns canonical hash basis with CLT-01 |

---

## 9. Functional Requirements

### KYC1-FR-001 Case Creation

The platform shall create KYC/KYB cases from CLT-01 handoff.

### KYC1-FR-002 Case Type

The platform shall support individual, entity, and authorised-party verification cases.

### KYC1-FR-003 Document Checklist

The platform shall maintain required document checklist by case type/client class/jurisdiction.

### KYC1-FR-004 Evidence Reference

The platform shall store evidence references and verification results.

### KYC1-FR-005 Individual Verification

The platform shall verify individual identity where required.

### KYC1-FR-006 Entity Verification

The platform shall verify corporate/institutional legal existence where required.

### KYC1-FR-007 UBO Identification

The platform shall identify and verify UBOs/controllers according to configured threshold.

### KYC1-FR-008 Authorised-Party Verification

The platform shall verify authorised parties before authority can activate.

### KYC1-FR-009 CDD Outcome

The platform shall calculate explicit CDD outcome.

### KYC1-FR-010 Outcome Publication

The platform shall publish CDD outcome to CLT-01.

### KYC1-FR-011 EDD Routing

The platform shall route EDD cases based on configured triggers.

### KYC1-FR-012 Manual Review Maker-Checker

The platform shall require IAM-02 maker-checker for manual pass/fail/override/EDD approval.

### KYC1-FR-013 Periodic Review

The platform shall schedule periodic and trigger-based review.

### KYC1-FR-014 Stale Outcome

The platform shall publish stale outcome when review is overdue or evidence expires.

### KYC1-FR-015 Remediation

The platform shall support remediation request and re-submission.

### KYC1-FR-016 Sensitive Read Logging

The platform shall log sensitive evidence read/export through SEC-01.

### KYC1-FR-017 Vendor Result Capture

The platform shall capture vendor verification result with payload hash and source identity.

### KYC1-FR-018 Duplicate Identity Check

The platform shall detect duplicate verified identities and publish finding.

### KYC1-FR-019 Data Protection

The platform shall classify, minimise, retain, and protect KYC/KYB data.

### KYC1-FR-020 Reconciliation

The platform shall reconcile CLT handoffs, KYC cases, outcomes, periodic review, and publications.

### KYC1-FR-021 UBO Look-Through

The platform shall recurse ownership/control through intermediate entities to ultimate natural persons.

### KYC1-FR-022 Indirect Ownership Aggregation

The platform shall aggregate indirect ownership across branches.

### KYC1-FR-023 Trust / Nominee Role Modelling

The platform shall model trust and nominee roles including settlor, trustee, beneficiary, protector, nominee and controller.

### KYC1-FR-024 Untraceable Ownership EDD/Fail

The platform shall route untraceable ownership/control to EDD or fail and shall never pass such case.

### KYC1-FR-025 Vendor Reliance Framework

The platform shall maintain vendor accreditation/reliance controls including regulated/supervised status and record-obtainability.

### KYC1-FR-026 Vendor Degraded Mode

The platform shall fail closed or use approved manual fallback when vendor services are unavailable.

### KYC1-FR-027 Vendor Confidence and Validity

The platform shall enforce confidence thresholds, inconclusive handling, multi-source corroboration and result-validity windows.

### KYC1-FR-028 Identity-Proofing Assurance

The platform shall enforce proofing assurance levels and methods by client class and risk.

### KYC1-FR-029 Remote Liveness / Biometric Binding

The platform shall require liveness/biometric binding where applicable for non-face-to-face onboarding.

### KYC1-FR-030 SoW / SoF for EDD / HNWI

The platform shall require source-of-wealth/source-of-funds evidence for high-risk, HNWI or EDD cases.

### KYC1-FR-031 KYC / AML Boundary

The platform shall define KYC pass as identity/entity verification only and require CLT-01 combined CDD with AML clear.

### KYC1-FR-032 AML-Triggered EDD Contract

The platform shall accept AML/PEP/adverse-media triggers for KYC EDD/remediation/stale review.

### KYC1-FR-033 Evidence Store Contract

The platform shall require evidence-store encryption, IAM-02-bound access, hash re-verification on read and retention/destruction controls.

### KYC1-FR-034 Identity vs Application Cross-Check

The platform shall cross-check verified identity/entity details against CLT application data and route mismatches to remediation/EDD.

### KYC1-FR-035 Verified Identity Hash Alignment

The platform shall align verified identity hash basis with CLT-01.

### KYC1-FR-036 Minimum EDD Measures

The platform shall define and enforce minimum EDD measures including enhanced ownership verification, SoW/SoF and senior approval.

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Outcome explicitness | Required |
| Handoff vs outcome separation | Required |
| UBO threshold | Configured/versioned |
| Manual override | IAM-02 maker-checker |
| Sensitive read/export | SEC-01 logged |
| Outcome publication | Auditable |
| Evidence integrity | Hash/ref required |
| Periodic review | Required |
| Data minimisation | Required |
| Direct DB status update | Prohibited |
| Test coverage | Critical controls 100% |

---

## 11. Prohibited Behaviours

KYC-01 must not allow:

1. CDD pass because handoff exists.
2. CDD pass without required identity/entity verification.
3. CDD pass without required UBO/controller verification.
4. CDD pass with missing required documents.
5. CDD pass with expired/invalid/tampered document.
6. CDD pass with unresolved duplicate verified identity.
7. CDD pass with unresolved ownership/control structure.
8. Manual pass without maker-checker.
9. Super Admin bypass CDD outcome.
10. Break-glass approve CDD.
11. Service account approve manual CDD outcome.
12. Direct DB edit of CDD outcome.
13. Stale outcome treated as pass.
14. KYC pass granting trading/deposit/withdrawal.
15. Sensitive evidence read without SEC-01 logging.
16. Vendor result accepted without source authentication/payload integrity.
17. UBO threshold exception without approval.
18. Remediation clearance without review.
19. Periodic review overdue but outcome remains pass.
20. Raw sensitive documents exposed through ordinary profile read.
21. CDD pass with ownership/control not traced to ultimate natural persons.
22. CDD pass with untraceable trust/nominee/entity branch.
23. CDD pass based on vendor result from non-accredited vendor where reliance is required.
24. CDD pass with inconclusive vendor result.
25. CDD pass below required confidence threshold.
26. CDD pass without required liveness/biometric binding for remote onboarding where applicable.
27. CDD pass without source-of-wealth/source-of-funds where EDD/HNWI/high-risk requires it.
28. KYC pass interpreted as AML/sanctions/PEP clearance.
29. Evidence read/export without hash re-verification against evidence store.
30. Evidence-store hash mismatch ignored.
31. Verified identity mismatch with CLT application treated as pass.
32. KYC duplicate hash basis inconsistent with CLT-01.

---

## 12. Acceptance Criteria

KYC-01 is accepted only if:

1. KYC/KYB case creation defined.
2. Individual/entity/party case types defined.
3. Document checklist defined.
4. Evidence reference and verification result defined.
5. UBO threshold logic defined.
6. Authorised-party verification defined.
7. CDD outcome engine defined.
8. Handoff vs outcome separation defined.
9. Outcome publication to CLT-01 defined.
10. EDD routing defined.
11. Manual review maker-checker defined.
12. Periodic review/stale outcome defined.
13. Vendor result integrity defined.
14. Duplicate identity detection defined.
15. Data protection defined.
16. Reconciliation defined.
17. UBO look-through to natural persons defined.
18. Vendor reliance framework defined.
19. Identity-proofing assurance levels defined.
20. KYC/AML boundary contract defined.
21. Evidence-store security contract defined.
22. Identity cross-check defined.
23. Verified identity hash alignment defined.
24. Minimum EDD measures defined.
25. Tests defined and passed.

---

## 13. Open Items

1. Final UBO threshold.
2. Final document checklist by client type/jurisdiction.
3. Final individual identity verification vendor(s).
4. Final corporate registry verification source(s).
5. Final CDD outcome taxonomy.
6. Final EDD trigger list.
7. Final periodic review frequency by risk class.
8. Final evidence/document storage architecture.
9. Final vendor payload schema.
10. Final duplicate identity matching approach.
11. Final retention schedule for KYC/KYB evidence.
12. Final CLT-01 outcome publication payload.
