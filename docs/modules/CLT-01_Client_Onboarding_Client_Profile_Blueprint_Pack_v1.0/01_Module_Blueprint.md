# CLT-01 Client Onboarding / Client Profile
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | CLT-01 |
| Module name | Client Onboarding / Client Profile |
| Pack version | v1.0 |
| Status | Initial module blueprint for Claude Opus review |
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
16. Tests defined and passed.

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
