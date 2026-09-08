# CLT-01 Client Onboarding / Client Profile
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | CLT-01 |
| Module name | Client Onboarding / Client Profile |
| Pack version | v1.1 |
| Status | Revised after Claude Opus review; CDD outcome gating, authorised-party screening, ongoing monitoring, verified class evidence, data-protection depth, mandate schema, revocation propagation, uniqueness and related-party graph added |
| Platform | AIX Money Broking + PSO Platform |
| Licence posture | Money Broking and PSO approved; Exchange pending |
| Module category | Client / Onboarding / Profile / Mandate |
| Depends on | FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2, SEC-01 v1.2, CFG-01 v1.2 |
| Handoffs to | KYC/KYB, AML/Sanctions, Wallet/Payout Whitelist, Account/Portfolio, Trading Eligibility |

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


---

## 2. Module Purpose

CLT-01 is the controlled intake and profile layer for clients.

It must make sure that AIX only creates client profiles and onboarding applications that are compatible with the approved Money Broking + PSO scope.

CLT-01 answers:

```txt
Who is applying, what type of client are they, are they eligible to proceed under AIX's current licence scope, who can act for them, and what onboarding status controls apply?
```

---

## 3. In Scope

CLT-01 covers:

1. Client application intake.
2. Individual and corporate/institutional applicant profile.
3. Client type classification.
4. Client-class classification.
5. Institutional / HNWI / Professional eligibility capture.
6. Retail default lock enforcement through CFG-01.
7. Client profile creation.
8. Client profile amendment.
9. Client account lifecycle status.
10. Authorised user and representative setup.
11. Client mandate setup.
12. Client-side dual authorisation setup.
13. Client consent capture.
14. Terms acknowledgement capture.
15. Client communication preference.
16. Country / residency capture.
17. Source market / onboarding channel capture.
18. Document checklist references.
19. Handoff to KYC/KYB.
20. Handoff to AML/sanctions screening.
21. Handoff to risk scoring.
22. Client onboarding approval/rejection/suspension.
23. Onboarding evidence and audit trail.
24. Duplicate client detection.
25. Client data classification.
26. Client profile export/read controls.
27. Onboarding status dashboard data.

---

## 4. Out of Scope

CLT-01 does not implement:

1. Identity verification / document authenticity verification.
2. KYB ownership/control verification.
3. Sanctions screening.
4. PEP/adverse media screening.
5. Travel Rule.
6. Wallet screening.
7. Payout destination verification.
8. Ledger/account balance.
9. Deposits/withdrawals.
10. Trading/quote/execution.
11. Risk scoring engine.
12. Legal advice or licence approval.
13. Public retail onboarding.
14. Exchange client onboarding.
15. Client money safeguarding.

Those are downstream modules.

---

## 5. Critical Principles

### 5.1 Licence Scope First

Client onboarding cannot bypass licence scope.

Before onboarding proceeds, CLT-01 must consult CFG-01 to check:

1. onboarding feature enabled.
2. client class allowed.
3. retail default lock.
4. Exchange-related onboarding lock.
5. jurisdiction/country restriction where configured.
6. environment status.

### 5.2 Retail Default Lock

Retail onboarding is disabled by default.

Any applicant classified as retail must be blocked, rejected, or held according to policy unless CFG-01 explicitly allows retail under approved licence/governance.

```txt
retail_default = locked
```

### 5.3 Institutional / HNWI / Professional Gate

MVP onboarding must support only eligible institutional, HNWI, professional, or approved non-retail client classes.

Eligibility classification must be captured before onboarding can proceed to downstream checks.

### 5.4 Onboarding Is Not Approval to Trade

A client profile or onboarding application does not mean the client can trade, deposit, withdraw, or access products.

Trading/payment/withdrawal eligibility requires downstream modules and final onboarding approval.

### 5.5 Client Profile Is Controlled Data

Client profile data is sensitive.

Rules:

1. Create/update requires IAM-02 permission.
2. Sensitive update requires maker-checker where policy says.
3. Sensitive read/export is audited through SEC-01.
4. Data minimisation applies.
5. PII must be protected and classified.

### 5.6 Four-Eyes for Final Approval

Final onboarding approval requires maker-checker.

Requester/reviewer cannot approve own application.

High-risk client profile approval may require Compliance approval.

### 5.7 No Silent Client-Class Upgrade

Client class cannot be silently upgraded from retail/ineligible to institutional/HNWI/professional.

Class change requires:

1. evidence reference.
2. maker-checker.
3. Compliance approval where required.
4. SEC-01 audit.
5. re-check through CFG-01.

### 5.8 Client Mandate Controls

Corporate/institutional clients must define authorised users, roles, and mandate rules.

Mandate controls must include:

1. authorised representative.
2. maker/checker setup where required.
3. approval thresholds.
4. client-side dual authorisation.
5. signatory evidence references.
6. effective date and expiry/review date.

### 5.9 Handoff Integrity

CLT-01 handoffs to KYC/KYB, AML, risk, wallet, payout, and trading eligibility must be explicit and auditable.

No downstream module should assume onboarding status without checking current client status and feature/licence gates.

### 5.10 Client Lifecycle Status Is Binding

Client status must control downstream access.

Examples:

1. draft cannot trade.
2. submitted cannot trade.
3. pending KYC cannot trade.
4. rejected cannot trade.
5. suspended cannot trade/withdraw unless policy explicitly permits limited remediation action.
6. closed cannot transact.

### 5.11 Duplicate and Related Party Detection

CLT-01 must detect potential duplicate client records and related applicants using safe matching attributes.

Duplicate detection result must not be used as final adverse decision without reviewer confirmation.

### 5.12 Audit and Evidence

Every material onboarding action must emit SEC-01 audit event.

Examples:

1. application created.
2. client class selected.
3. client class changed.
4. authorised user added.
5. mandate changed.
6. application submitted.
7. application approved/rejected/suspended.
8. sensitive profile read/export.

---

## 6. Actors

| Actor | Role |
|---|---|
| Applicant | Creates or submits onboarding application |
| Client Admin | Manages client-side users/mandate after approval |
| Client Maker | Initiates client-side actions under mandate |
| Client Approver | Approves client-side actions under mandate |
| Staff User | Reviews application |
| Operations Manager | Operational review/approval |
| Compliance Officer / MLRO | Compliance review/approval |
| Super Admin | Limited admin; cannot bypass licence/KYC/AML |
| Auditor | Read-only evidence |
| System Job | Reconciliation, expiry, reminder |
| Service Account | Scoped downstream integration |

---

## 7. Dependencies

### 7.1 Upstream

1. FND-01 request/correlation ID.
2. FND-01 audit/outbox and scheduler.
3. IAM-01 authenticated session / step-up.
4. IAM-02 permission guard, maker-checker, SoD, protected-action registry.
5. SEC-01 authoritative audit and sensitive read logging.
6. CFG-01 licence/feature/client-class gating.

### 7.2 Downstream

1. KYC/KYB verification module.
2. AML/sanctions/PEP screening module.
3. Risk scoring module.
4. Wallet screening module.
5. Payout whitelist module.
6. Account/portfolio module.
7. Trading eligibility module.
8. Ledger/settlement modules.
9. Notification module.

---

## 8. Components

| Component | Description |
|---|---|
| Application Intake Service | Creates and updates onboarding applications |
| Client Profile Service | Creates controlled client profile |
| Client Classification Engine | Determines applicant/client type and class |
| Licence Gate Adapter | Calls CFG-01 for onboarding/client-class allowance |
| Onboarding Workflow Engine | Manages lifecycle status |
| Authorised User Service | Manages client representatives/users |
| Mandate Service | Stores client mandate and thresholds |
| Client Dual Authorisation Setup | Configures client-side maker/checker |
| Consent / Terms Service | Captures consents and acknowledgements |
| Document Checklist Service | Tracks required document refs |
| Duplicate Detection Service | Flags possible duplicates |
| Handoff Publisher | Sends auditable handoff to downstream modules |
| Sensitive Read Logger | Triggers SEC-01 sensitive read event |
| Reconciliation Jobs | Detect stale, incomplete, or inconsistent onboarding |
| Evidence Export Service | Controlled export of client onboarding evidence |

---

## 9. Functional Requirements

### CLT1-FR-001 Application Intake

The platform shall allow eligible applicants to start onboarding applications subject to CFG-01 feature/client-class checks.

### CLT1-FR-002 Retail Default Lock

The platform shall block or hold retail applicants by default.

### CLT1-FR-003 Client Type Capture

The platform shall capture whether applicant is individual, corporate, institutional, HNWI, professional, or other configured type.

### CLT1-FR-004 Client-Class Classification

The platform shall classify client class before allowing progression to downstream onboarding.

### CLT1-FR-005 CFG-01 Gate

The platform shall call CFG-01 for onboarding/client-class feature availability.

### CLT1-FR-006 Client Profile Creation

The platform shall create client profile only after required intake fields and licence/client-class gates pass.

### CLT1-FR-007 Onboarding Lifecycle

The platform shall maintain onboarding lifecycle statuses.

### CLT1-FR-008 Final Approval Maker-Checker

The platform shall require maker-checker for final onboarding approval.

### CLT1-FR-009 Client Class Change Control

The platform shall require approval and audit for client-class change.

### CLT1-FR-010 Authorised User Setup

The platform shall allow controlled setup of authorised users and representatives.

### CLT1-FR-011 Client Mandate Setup

The platform shall support mandate rules, thresholds, and client-side dual authorisation setup.

### CLT1-FR-012 Handoff to KYC/KYB

The platform shall create auditable handoff to KYC/KYB module.

### CLT1-FR-013 Handoff to AML/Sanctions

The platform shall create auditable handoff to AML/sanctions module.

### CLT1-FR-014 Sensitive Read Logging

The platform shall log sensitive profile read/export through SEC-01.

### CLT1-FR-015 Duplicate Detection

The platform shall detect possible duplicate clients and route for review.

### CLT1-FR-016 Profile Amendment

The platform shall control profile amendments through permission, approval, and audit.

### CLT1-FR-017 Status-Based Access Control

The platform shall expose current client status for downstream eligibility checks.

### CLT1-FR-018 Evidence Export

The platform shall support controlled evidence export of onboarding profile and decisions.

### CLT1-FR-019 Consent Capture

The platform shall capture client consents and terms acknowledgements.

### CLT1-FR-020 Reconciliation

The platform shall reconcile incomplete applications, stale statuses, duplicate flags, and handoff status.

### CLT1-FR-021 CDD Outcome Gate

The platform shall require satisfactory current KYC/KYB, AML/sanctions, PEP/adverse-media and risk rating outcomes before final onboarding approval.

### CLT1-FR-022 Handoff Delivery vs Outcome Separation

The platform shall model handoff delivery separately from CDD/screening/risk outcome status.

### CLT1-FR-023 Sanctions / Prohibited Hit Hard Block

The platform shall hard-block onboarding approval for sanctions hit, failed CDD, prohibited PEP/adverse-media result or rejected/prohibited risk rating.

### CLT1-FR-024 Authorised-Party Screening

The platform shall require individual KYC/sanctions/PEP screening for authorised signatories, directors, controllers, UBOs, client admins and client approvers before authority is active.

### CLT1-FR-025 UBO Identification Threshold

The platform shall capture and enforce configured UBO/controller identification threshold.

### CLT1-FR-026 Ongoing Monitoring Feedback

The platform shall accept downstream KYC/AML/risk feedback and update client status where required.

### CLT1-FR-027 Periodic Review

The platform shall schedule periodic and trigger-based client review.

### CLT1-FR-028 Verified Class Evidence Gate

The platform shall treat unverified client class as retail-locked/held until verified and approved.

### CLT1-FR-029 Handoff Failure Handling

The platform shall retry, dead-letter, escalate and block progression for failed/stuck KYC/AML/risk handoffs.

### CLT1-FR-030 Mandate Schema Validation

The platform shall validate client mandate rules against a controlled schema consistent with IAM-02 client-side dual authorisation.

### CLT1-FR-031 Authorised-User Revocation Propagation

The platform shall immediately propagate authorised-user/mandate revocation to IAM-02 authority/session/cache controls.

### CLT1-FR-032 Client Uniqueness

The platform shall prevent two active clients with the same verified identity unless exception approved.

### CLT1-FR-033 Related Party Graph

The platform shall maintain a related-party graph for AML, duplicate, concentration and associated-party analysis.

### CLT1-FR-034 Data Protection Requests

The platform shall support DSAR, rectification, erasure/restriction, pseudonymisation and downstream notices according to legal/regulatory basis.

### CLT1-FR-035 Retention and Destruction

The platform shall define retention period by data class and audited post-retention destruction/pseudonymisation process.

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Retail default | Locked |
| Unknown client class | Hold / deny progression |
| Unknown CFG feature state | Deny progression |
| Profile sensitive read | SEC-01 logged |
| Final approval | IAM-02 maker-checker |
| Client-class upgrade | Approval + evidence |
| Duplicate detection | Required |
| Handoff integrity | Required |
| Audit | SEC-01 required |
| Data minimisation | Required |
| PII protection | Required |
| Test coverage | Critical controls 100% |

---

## 11. Prohibited Behaviours

CLT-01 must not allow:

1. Retail onboarding by default.
2. Client-class upgrade without evidence/approval.
3. Final onboarding approval by same staff who submitted/reviewed where SoD says no.
4. Onboarding approval without KYC/KYB handoff.
5. Onboarding approval without AML/sanctions handoff.
6. Trading access from onboarding profile alone.
7. Deposit/withdrawal access from onboarding profile alone.
8. Exchange onboarding while Exchange pending.
9. Client profile creation without CFG-01 gate.
10. Sensitive profile read without SEC-01 logging.
11. Profile amendment without permission/audit.
12. Authorised user addition without mandate control.
13. Client-side approval bypass.
14. Duplicate flag ignored without review.
15. Ineligible jurisdiction onboarding where restricted.
16. Service account creating approved client directly.
17. Break-glass approving onboarding or client-class upgrade.
18. Super Admin bypassing licence/KYC/AML gates.
19. Direct DB edit of client status.
20. Client status stale cache used for downstream trading eligibility.
21. Final approval based only on handoff delivery rather than satisfactory outcomes.
22. Approval with sanctions hit, failed CDD, prohibited PEP/adverse-media result or rejected risk rating.
23. Mandate authority for unscreened signatory/director/controller/UBO.
24. Active client remains active after downstream critical hit.
25. HNWI/professional/institutional progression based only on unverified evidence.
26. Failed handoff ignored or treated as complete.
27. Free-form unvalidated mandate rules used for client-side approval.
28. Authorised-user revocation not propagated to IAM-02.
29. Two active client profiles for same verified identity without approved exception.
30. DSAR/erasure request deleting immutable audit or AML-required records before retention expires.

---

## 12. Acceptance Criteria

CLT-01 is accepted only if:

1. Client application intake defined.
2. Client type/class classification defined.
3. Retail default lock defined.
4. CFG-01 gate defined.
5. Client profile lifecycle defined.
6. Final maker-checker approval defined.
7. Client class change control defined.
8. Mandate/authorised user setup defined.
9. Client-side dual authorisation setup defined.
10. KYC/KYB handoff defined.
11. AML/sanctions handoff defined.
12. Sensitive read logging defined.
13. Duplicate detection defined.
14. Status-based downstream control defined.
15. Reconciliation defined.
16. CDD/screening/risk outcome gate defined.
17. Handoff delivery vs outcome separation defined.
18. Authorised-party screening defined.
19. Ongoing monitoring feedback defined.
20. Verified class evidence gate defined.
21. Data-protection model defined.
22. Mandate schema and revocation propagation defined.
23. Client uniqueness and related-party graph defined.
24. Tests defined and passed.

---

## 13. Open Items

1. Final client-class taxonomy.
2. Final HNWI/professional eligibility evidence requirements.
3. Final client onboarding form fields.
4. Final country/jurisdiction restriction list.
5. Final client mandate threshold defaults.
6. Final authorised user roles.
7. Final client-side approval threshold policy.
8. Final onboarding SLA and reminder policy.
9. Final document checklist.
10. Final duplicate matching rules.
11. Final evidence export format.
12. Final downstream module handoff payload schema.


### 5.14 CDD Outcome Gate

Final onboarding approval and any active client status require actual satisfactory outcomes, not handoff existence.

Required outcomes before final approval:

1. KYC/KYB outcome is complete, current and satisfactory.
2. AML/sanctions outcome is clear.
3. PEP/adverse-media outcome is clear or formally cleared under policy.
4. Risk rating outcome exists and is acceptable.
5. Authorised-party screening outcomes are complete for required parties.
6. Duplicate/related-party critical findings are resolved.

Rules:

1. `handoff_status = completed` means message delivery lifecycle only.
2. Delivery status and outcome status must be separate.
3. Sanctions hit, failed CDD, prohibited PEP/adverse-media result, or rejected/prohibited risk rating hard-blocks onboarding.
4. Super Admin, break-glass, service account, client-class override or manual status override cannot bypass this gate.

Parameters:

```txt
onboarding_approval_gate = kyc_kyb_pass+aml_sanctions_clear+risk_rated
sanctions_or_pep_hit = hard_block_no_onboard
handoff_result_modelled = pass_fail_hit_distinct_from_delivery
```

### 5.15 Authorised-Party and UBO Screening

Corporate/institutional onboarding must screen natural persons who can own, control or act for the client.

Applies to:

1. authorised signatories.
2. client admins.
3. client makers.
4. client approvers.
5. directors.
6. controllers.
7. beneficial owners / UBOs.
8. mandate holders.

Rules:

1. Each required authorised party must have individual identity/KYC reference.
2. Each required authorised party must have sanctions/PEP outcome.
3. Authority cannot become active until screening is pass/clear.
4. Later hit on an authorised party restricts that party and may restrict/suspend the client.
5. UBO identification threshold must be defined.

Parameters:

```txt
authorised_party_screening = each_signatory_director_ubo_kyc_sanctions
ubo_identification_threshold = to_be_defined
```

### 5.16 Ongoing Monitoring and Bidirectional Status Feedback

CLT-01 must accept downstream status feedback after onboarding.

Triggers:

1. sanctions re-hit.
2. PEP/adverse media hit.
3. AML transaction monitoring alert.
4. KYC/KYB expiry or periodic review failure.
5. risk rating increase.
6. authorised-party or UBO hit.
7. jurisdiction restriction change.
8. mandate expiry/revocation.
9. CFG-01 licence/client-class gate change.

Rules:

1. Downstream KYC/AML/risk modules can force CLT status to review_required, restricted or suspended.
2. Critical hit must block downstream access before further activity.
3. Reinstatement requires remediation evidence and maker-checker approval.
4. Periodic-review schedule must be maintained.

Parameters:

```txt
ongoing_monitoring = downstream_status_change_can_suspend_client
perpetual_kyc_trigger_review = enabled
periodic_review_scheduling = to_be_defined
```

### 5.17 Verified Class Evidence Gate

Eligible-class progression requires verified evidence.

Rules:

1. Self-declaration is not enough.
2. Evidence merely `provided` is not enough.
3. Unverified class is treated as retail-locked/held.
4. HNWI/professional/institutional classification requires verified evidence and approval where required.
5. CFG-01 must be re-checked using the verified class.

Parameters:

```txt
class_progression_requires = verified_classification_evidence_maker_checker
unverified_class = treated_as_retail_locked
```

### 5.18 Data Protection Model

CLT-01 is a PII system of record.

Required:

1. lawful-basis map by data category.
2. consent withdrawal handling for consent-based processing.
3. AML/CFT/legal-obligation retention not dependent on withdrawable consent.
4. DSAR access and rectification process.
5. erasure/restriction process reconciled with immutable SEC-01 audit and AML/regulatory retention.
6. pseudonymisation where deletion is not permitted or after retention.
7. cross-border storage/transfer basis for PSO/client data.
8. retention period by data class.
9. audited post-retention destruction or pseudonymisation.

Parameters:

```txt
pii_lawful_basis = defined_obligation_or_consent
dsar_rectification_erasure = reconciled_with_immutable_audit_pseudonymise
cross_border_storage_basis = defined_for_pso_client_data
retention_period_by_class = to_be_defined
destruction_process = defined_post_retention
```

### 5.19 Active Limited Definition

`active_limited` is non-transactional.

Permitted:
1. profile remediation.
2. document completion.
3. mandate setup.
4. compliance review.
5. read-only access where allowed.

Not permitted:
1. trading.
2. deposit.
3. withdrawal.
4. settlement.
5. wallet/payout activation.
6. Exchange access.

### 5.20 Mandate Schema and IAM-02 Client Dual Authorisation

Mandate rules must use a validated schema aligned with IAM-02 WF-IAM02-10.

Rules:

1. client maker cannot approve own action.
2. schema defines action scope, thresholds, approval count, approver role and expiry/review.
3. authorised-user/mandate revocation immediately propagates to IAM-02 authority/session/cache invalidation.

Parameters:

```txt
mandate_rules_schema = validated_consistent_with_iam02_client_dual_auth
authorised_user_revocation = immediate_propagation
```
