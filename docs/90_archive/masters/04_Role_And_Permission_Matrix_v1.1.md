# 04 Role and Permission Matrix  
# AIX Money Broking Platform

## Document Control

| Item | Details |
|---|---|
| Document name | 04_Role_And_Permission_Matrix_v1.1.md |
| Platform | AIX Money Broking Platform |
| Document type | SDLC Phase 2 / Access Control and Approval Matrix |
| Version | v1.1 |
| Status | Revised after Claude Opus RBAC review; client-side dual control, complaints/privacy ownership, LP settlement payment approval, break-glass access, maker-checker consistency, reporting permissions, and version traceability clarified |
| Prepared for | Product, compliance, architecture, security, development, QA, and operations planning |
| Base document 1 | 00_Licence_Scope_And_Feature_Lock_v1.3.md |
| Base document 2 | 01_Project_Charter_v1.3.md |
| Base document 3 | 03_Master_Module_Index_v1.2.md |
| Base document 4 | 02_Software_Requirement_Specification_v1.2.md |

---

## 1. Purpose

This document defines the role, permission, maker-checker, and segregation-of-duties model for the AIX Money Broking Platform.

The purpose is to lock access-control rules before API design, module blueprint design, workflow design, and implementation.

This document answers:

1. Who can access each portal?
2. Who can view, create, submit, review, approve, reject, export, configure, or override each workflow?
3. Which actions require maker-checker?
4. Which actions require Compliance / MLRO approval?
5. Which actions require Finance approval?
6. Which actions require Operations approval?
7. Which actions require Super Admin or management approval?
8. Which actions are prohibited for all roles?
9. Which actions must be audit logged?
10. Which actions trigger segregation-of-duties conflict checks?

---

## 2. Scope Baseline

This matrix is based on the accepted platform scope:

```txt
Money Broking licence = approved
PSO licence = approved
Exchange application = pending
MVP client type = institutional and HNWI/professional only
Retail onboarding = disabled by default
Execution model = agency back-to-back
Revenue model = disclosed brokerage fee only
AIX spread markup = blocked
AIX inventory limit = zero
Self-custody = disabled
Third-party custody model = required
Client money safeguarding account = required
Exchange order book = locked
Matching engine = locked
Client-to-client matching = locked
Market making = blocked
Principal dealing = blocked
```

---

## 3. Permission Model Principles

### 3.1 Default Deny

The platform must use default-deny permission enforcement.

Rules:

1. If a permission is missing, access is denied.
2. If a feature flag is disabled, access is denied.
3. If role is unknown, access is denied.
4. If client status is not eligible, access is denied.
5. If module state is invalid, access is denied.
6. If maker-checker is required and not completed, action is denied.
7. If segregation-of-duties conflict exists, action is denied unless approved override exists.
8. If licence lock applies, action is denied.

### 3.2 Backend Source of Truth

Frontend hiding is not permission control.

Requirements:

1. Every protected API must enforce permission at backend.
2. Every high-risk action must check role, permission, feature flag, client status, and workflow state.
3. Backend must enforce maker-checker.
4. Backend must enforce segregation-of-duties.
5. Backend must enforce licence locks.

### 3.3 Least Privilege

Each role receives only the access required to perform its work.

Rules:

1. Support role cannot approve compliance actions.
2. Operations role cannot approve KYC/KYB.
3. Finance role cannot approve KYC/KYB.
4. Compliance role cannot directly edit ledger.
5. Admin cannot approve own high-risk configuration changes.
6. Super Admin is still subject to maker-checker and audit.
7. No role can bypass licence locks.

### 3.4 No Self-Approval

No user may approve an action that the same user created, submitted, initiated, modified, or financially benefits from.

This applies to:

1. Client approval.
2. Payout destination approval.
3. Withdrawal approval.
4. Ledger reversal.
5. Settlement exception closure.
6. Feature flag change.
7. Role/permission change.
8. Asset/pair activation.
9. Vendor approval.
10. Production deployment.

### 3.5 Client-Side Dual Authorization

Institutional and HNWI/professional clients may require mandate-based dual approval for money-out and large trade actions.

Rules:

1. The platform must support a `CLIENT_APPROVER` role or authorised-signatory flag.
2. Client-side dual authorization is required for withdrawals above a configurable threshold.
3. Client-side dual authorization is required for large trades above a configurable threshold.
4. The same client user cannot initiate and approve the same controlled action.
5. Client mandate rules must be configurable per client.
6. Client-side approval must occur before staff-side maker-checker release.
7. Client-side approval must be audit logged.
8. If client-side approval is required but missing, the action must be blocked.

Required error code:

```txt
CLIENT_SIDE_APPROVAL_REQUIRED
```

### 3.6 Sensitive Read Access Logging

Read access must be logged for sensitive records.

Sensitive records include:

1. KYC/KYB documents.
2. Beneficial ownership records.
3. Professional/accredited status evidence.
4. Source of funds / source of wealth documents.
5. Sanctions/PEP results.
6. Wallet screening results.
7. Travel Rule data.
8. AML cases and STR records.
9. Bank account information.
10. Wallet address ownership evidence.
11. Client-money safeguarding records.
12. Audit log exports.

---

## 4. Permission Legend

| Code | Meaning |
|---|---|
| N | No access |
| V | View only |
| C | Create / initiate |
| E | Edit draft / own item |
| S | Submit for review |
| R | Review |
| A | Approve / reject |
| M | Maker action |
| K | Checker action |
| X | Export |
| CFG | Configure |
| OV | Override with approval |
| ADM | Administer |
| AUD | Audit/read sensitive access logged |

Where a cell contains multiple codes, all listed capabilities may apply subject to workflow state, feature flag, and SoD rules.

---

## 5. Platform Roles

### 5.1 Client Roles

| Role ID | Role Name | Description |
|---|---|---|
| CLIENT_OWNER | Client Owner / Authorised Representative | Main authorised client user |
| CLIENT_USER | Client User | Additional client user with restricted access |
| CLIENT_APPROVER | Client Approver / Authorised Signatory | Second client-side approver for withdrawals, large trades, and mandate-controlled actions |
| CLIENT_READONLY | Client Read-Only User | Can view selected records only |

### 5.2 Staff Roles

| Role ID | Role Name | Description |
|---|---|---|
| SUPPORT_AGENT | Customer Support Agent | Handles enquiries and status checking |
| COMPLIANCE_ANALYST | Compliance Analyst | Performs review preparation and case work |
| COMPLIANCE_OFFICER | Compliance Officer | Approves compliance decisions |
| DPO | Data Protection Officer / Privacy Owner | Owns privacy, PDPA, DSAR, and data-subject-rights workflows |
| MLRO | MLRO / Compliance Head | Senior AML and STR authority |
| OPS_OFFICER | Operations Officer | Handles trade, deposit, withdrawal, and settlement operations |
| OPS_MANAGER | Operations Manager | Senior operations checker / escalation |
| FINANCE_OFFICER | Finance Officer | Handles ledger, reconciliation, and finance review |
| FINANCE_MANAGER | Finance Manager | Senior finance checker / safeguarding approval |
| ADMIN | System Admin | User, role, configuration, and system admin |
| SUPER_ADMIN | Super Admin | Highest platform admin, still controlled by maker-checker |
| SECURITY_ADMIN | Security Admin | Security configuration and monitoring |
| TECH_ADMIN | Technical Admin / DevOps | Infrastructure, deployment, and technical operations |
| MANAGEMENT | Management / Director / Principal Officer | High-level approval and read-only management oversight |
| AUDITOR | Internal / External Auditor | Controlled read-only audit access |

### 5.3 System Roles

| Role ID | Role Name | Description |
|---|---|---|
| SYSTEM_JOB | System Job / Worker | Background worker with scoped machine permissions |
| INTEGRATION_SERVICE | Integration Service | Vendor integration service account |
| AUDIT_SERVICE | Audit Service | Append-only audit logging service |
| LEDGER_SERVICE | Ledger Service | Controlled ledger posting service |

System roles must not be used for human login.

---

## 6. Portal Access Matrix

| Portal / Workspace | CLIENT_OWNER | CLIENT_USER | CLIENT_READONLY | SUPPORT | COMPLIANCE | OPS | FINANCE | ADMIN | SUPER_ADMIN | SECURITY | TECH | MANAGEMENT | AUDITOR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Client Portal | V/C/E/S | V/C/E/S limited | V | N | N | N | N | N | N | N | N | N | N |
| Staff Portal | N | N | N | V | V/R/A | V/R/A | V/R/A | V/ADM | V/ADM | V | V | V | V |
| Admin Portal | N | N | N | N | N | N | N | ADM | ADM | CFG | CFG limited | V | V |
| Compliance Workspace | N | N | N | V limited | V/R/A | V limited | V limited | V | V | V security only | N | V | V |
| Operations Workspace | N | N | N | V limited | V limited | V/R/A | V/R | V | V | N | N | V | V |
| Finance Workspace | N | N | N | N | V limited | V limited | V/R/A | V | V | N | N | V | V |
| Management Dashboard | N | N | N | N | V limited | V limited | V limited | N | V | N | N | V | V |
| Audit Log Workspace | N | N | N | N | V limited | V limited | V limited | V | V | V | V technical only | V | V |

---

## 7. Client and Onboarding Permissions

| Action | CLIENT_OWNER | CLIENT_USER | CLIENT_READONLY | SUPPORT | COMPLIANCE_ANALYST | COMPLIANCE_OFFICER | MLRO | OPS | FINANCE | ADMIN | MANAGEMENT | AUDITOR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Register client account | C | N | N | N | N | N | N | N | N | N | N | N |
| Edit own client profile draft | C/E | C/E limited | N | N | N | N | N | N | N | N | N | N |
| Submit onboarding | S | S if authorised | N | N | N | N | N | N | N | N | N | N |
| Upload KYC/KYB documents | C/E/S | C/E/S if authorised | N | N | N | N | N | N | N | N | N | N |
| View onboarding status | V | V | V | V | V | V | V | V limited | V limited | V | V | V |
| Review onboarding | N | N | N | N | R | R/A | R/A senior | N | N | N | V | V |
| Approve / reject onboarding | N | N | N | N | N | A/K | A/K senior | N | N | N | V | V |
| Request more information | N | N | N | N | R/C | R/C | R/C | N | N | N | N | V |
| Change client type | N | N | N | N | M | K | K senior | N | N | N | V | V |
| Approve professional/accredited status | N | N | N | N | R/M | K/A | K/A senior | N | N | N | V | V |
| Approve client agreement version | N | N | N | N | R | A | A senior | N | N | N | V | V |
| Publish client agreement version | N | N | N | N | M/R | K/A | K/A senior | N | N | M config | V | V |
| Suspend / freeze client | N | N | N | N | M | K/A | K/A senior | N | N | N | V | V |
| Close client account | S request | N | N | N | R/M | K/A | K/A senior | R | R | N | K where required | V |

Rules:

1. Client cannot approve own onboarding.
2. Support cannot approve or reject onboarding.
3. Operations cannot approve KYC/KYB.
4. Finance cannot approve KYC/KYB.
5. Professional/accredited status must be approved before transaction access.
6. Client type change requires compliance approval and audit log.
7. Retail onboarding remains disabled by backend feature flag.

---

## 8. Client-Side Authorization Permissions

| Action | CLIENT_OWNER | CLIENT_USER | CLIENT_APPROVER | CLIENT_READONLY | Staff Roles | Auditor |
|---|---:|---:|---:|---:|---:|---:|
| Configure client mandate during onboarding | S | S if authorised | V | V | Compliance R/A | V |
| Submit withdrawal request | C/S | C/S if authorised | V | N | V | V |
| Client-side approve withdrawal | N if initiator | N if initiator | A/K if authorised | N | V | V |
| Submit large trade request | C/S | C/S if authorised | V | N | V | V |
| Client-side approve large trade | N if initiator | N if initiator | A/K if authorised | N | V | V |
| View pending client approvals | V | V if authorised | V/A | V | V limited | V |
| Revoke pending client approval | C own | C own if authorised | C/A | N | V | V |

Rules:

1. The same client user cannot submit and approve the same withdrawal.
2. The same client user cannot submit and approve the same large trade.
3. Client-side approval does not replace staff-side maker-checker.
4. Client-side approval must follow the client's mandate configuration.
5. If no mandate is configured, default threshold-based dual authorization applies for money-out and large trade actions.
6. Client-side approval is required before withdrawal release or large trade execution where threshold is met.
7. Client-side approval events must be audit logged.

---

## 9. Compliance and AML Permissions

| Action | CLIENT | SUPPORT | COMPLIANCE_ANALYST | COMPLIANCE_OFFICER | MLRO | OPS | FINANCE | ADMIN | MANAGEMENT | AUDITOR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| View KYC/KYB records | Own limited | V status only | V/AUD | V/AUD | V/AUD | V limited | V limited | N | V/AUD | V/AUD |
| Run or trigger screening | N | N | C/R | C/R/A | C/R/A | N | N | N | N | V |
| Resolve false-positive screening | N | N | M/R | K/A | K/A senior | N | N | N | V | V |
| Review sanctions/PEP match | N | N | R | R/A | R/A senior | N | N | N | V | V |
| Approve high-risk client | N | N | M/R | K/A | K/A senior | N | N | N | V | V |
| Create AML alert note | N | N | C/E | C/E | C/E | C limited | N | N | N | V |
| Open AML case | N | N | C | C/A | C/A senior | N | N | N | V | V |
| Escalate AML case | N | N | M | K/A | K/A senior | N | N | N | V | V |
| Close AML case no issue | N | N | M | K/A | K/A senior | N | N | N | V | V |
| Close AML case suspicious | N | N | M | K | K/A senior | N | N | N | V | V |
| Create STR workflow | N | N | M | K/R | K/A senior | N | N | N | V restricted | V restricted |
| Approve STR filing decision | N | N | N | M/K | A senior | N | N | N | V restricted | V restricted |
| View STR records | N | N | V restricted | V restricted | V/AUD | N | N | N | V restricted | V restricted |
| Periodic KYC review | N | N | R/M | K/A | K/A senior | N | N | N | V | V |
| Approve jurisdiction exception | N | N | M | K/A | K/A senior | N | N | N | V | V |

Rules:

1. STR records require restricted permission.
2. Support cannot view STR records.
3. AML case close must record reason.
4. High-risk compliance decisions require checker.
5. Sanctions true match must block product access until resolved.
6. Compliance decisions are immutable after finalisation except through new decision record or reversal workflow.

---

## 10. Travel Rule and Wallet Screening Permissions

| Action | CLIENT_OWNER | SUPPORT | COMPLIANCE_ANALYST | COMPLIANCE_OFFICER | MLRO | OPS | FINANCE | ADMIN | AUDITOR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Submit beneficiary/originator data | C/S own | N | N | N | N | N | N | N | V |
| View own Travel Rule status | V limited | V status only | V/AUD | V/AUD | V/AUD | V status | N | N | V/AUD |
| Review Travel Rule data | N | N | R | R/A | R/A senior | V limited | N | N | V |
| Approve Travel Rule exception | N | N | M | K/A | K/A senior | N | N | N | V |
| View wallet screening result | V limited | V status only | V/AUD | V/AUD | V/AUD | V limited | N | N | V |
| Resolve wallet screening disposition | N | N | M/R | K/A | K/A senior | R limited | N | N | V |
| Approve self-hosted wallet handling | N | N | M/R | K/A | K/A senior | N | N | N | V |
| Approve counterparty VASP | N | N | M/R | K/A | K/A senior | N | N | N | V |

Rules:

1. Missing Travel Rule data blocks transfer.
2. High-risk wallet result blocks deposit/withdrawal until reviewed.
3. Self-hosted wallet exception requires compliance approval.
4. Travel Rule data is sensitive and read access must be logged.

---

## 11. Product Access, Asset, and Pair Permissions

| Action | CLIENT | SUPPORT | COMPLIANCE_ANALYST | COMPLIANCE_OFFICER | MLRO | OPS_MANAGER | FINANCE_MANAGER | ADMIN | SUPER_ADMIN | MANAGEMENT | AUDITOR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| View product eligibility | Own | V status | V | V | V | V | V | V | V | V | V |
| Grant product access | N | N | M/R | K/A | K/A senior | N | N | N | N | V | V |
| Remove product access | N | N | M/R | K/A | K/A senior | N | N | N | N | V | V |
| Create asset record | N | N | M/R | R | R | N | N | C/M | C/M | V | V |
| Compliance approve asset | N | N | M/R | K/A | K/A senior | N | N | N | N | V | V |
| Configure asset enforcement | N | N | N | R | R | N | N | M/CFG | K/CFG | V | V |
| Activate asset | N | N | N | K compliance | K compliance | N | N | M | K | V | V |
| Create pair | N | N | N | R | R | M/R | R | M/CFG | K/CFG | V | V |
| Activate pair | N | N | N | K compliance | K compliance | K ops | K finance where money impact | M | K | V | V |
| Override MYR/privacy/algorithmic/securities lock | N | N | N | N | N | N | N | N | N | N | V |

Rules:

1. Asset approval is split:
   - CMP owns compliance review.
   - AST owns technical enforcement.
2. No asset or pair can be activated without compliance approval.
3. MYR pairs, privacy coins, algorithmic stablecoins, and securities tokens remain blocked unless separately approved.
4. No role can override securities token lock without updated licence documentation and approval.

---

## 12. OTC/RFQ and MB Spot Broking Permissions

| Action | CLIENT_OWNER | CLIENT_USER | SUPPORT | COMPLIANCE | OPS_OFFICER | OPS_MANAGER | FINANCE | ADMIN | MANAGEMENT | AUDITOR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| View OTC/RFQ module | V if eligible | V if authorised | V status | V | V | V | V limited | V | V | V |
| Submit RFQ request | C/S if eligible | C/S if authorised | N | N | N | N | N | N | N | V |
| Review RFQ request | N | N | N | V risk | R | R/A | V money | N | V | V |
| Prepare LP-derived quote | N | N | N | N | M/C | M/C | V | N | V | V |
| Approve staff quote | N | N | N | V risk | M | K/A | V | N | V | V |
| Accept quote | S own | S if authorised | N | N | N | N | N | N | N | V |
| Cancel own quote request | C/E own | C/E if authorised | N | N | N | N | N | N | N | V |
| View MB Spot Terminal | V if eligible | V if authorised | V status | V | V | V | V limited | N | V | V |
| Request spot quote | C/S if eligible | C/S if authorised | N | N | N | N | N | N | N | V |
| Confirm spot quote | S if eligible | S if authorised | N | N | N | N | N | N | N | V |
| Force execute trade | N | N | N | N | N | N | N | N | N | N |
| Override quote expiry | N | N | N | N | N | N | N | N | N | N |
| Manual price markup | N | N | N | N | N | N | N | N | N | N |

Rules:

1. No LP execution may fire before pre-funded hold is successful.
2. Staff quote must be LP-derived with disclosed brokerage fee only.
3. Manual markup is prohibited.
4. Quote acceptance must be performed by authorised client user.
5. Large trade must receive client-side second authorization where mandate or threshold requires it.
6. Expired quote cannot be accepted.
7. Re-quote requires fresh client confirmation.
8. Best-execution / fair-pricing check must pass before booking.
9. No public order book, matching engine, or client-to-client matching is allowed.

---

## 13. Deposit, Withdrawal, and Payout Destination Permissions

| Action | CLIENT_OWNER | CLIENT_USER | SUPPORT | COMPLIANCE_ANALYST | COMPLIANCE_OFFICER | MLRO | OPS_OFFICER | OPS_MANAGER | FINANCE_OFFICER | FINANCE_MANAGER | ADMIN | AUDITOR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Submit deposit notification | C/S | C/S if authorised | N | N | N | N | V/R | V/R | V/R | V/R | N | V |
| Match fiat deposit | N | N | N | N | N | N | R/M | K/A | R/M | K/A | N | V |
| Confirm bank receipt | N | N | N | N | N | N | R/M | K | R/M | K/A | N | V |
| Confirm digital asset receipt | N | N | N | R wallet | A if risk | A senior if high risk | R/M | K | V | V | N | V |
| Approve deposit credit | N | N | N | K if compliance hold | K if compliance hold | K senior | M | K | M | K/A | N | V |
| Add payout destination | C/S own | C/S if authorised | N | N | N | N | V | V | V | V | N | V |
| Verify payout destination ownership | N | N | N | R if high risk | A if high risk | A senior exception | M/R | K/A | R | K | N | V |
| Approve payout destination | N | N | N | K high risk | K high risk | K senior exception | M | K/A | R | K | N | V |
| Submit withdrawal request | C/S own | C/S if authorised | N | N | N | N | V | V | V | V | N | V |
| Review withdrawal | N | N | N | R if AML/Travel Rule | A if AML/Travel Rule | A senior if high risk | R/M | K/A | R/M | K/A | N | V |
| Approve withdrawal | N | N | N | K if compliance hold | K if compliance hold | K senior if high risk | M | K/A | M | K/A | N | V |
| Release withdrawal | N | N | N | N | N | N | M | K | M | K/A | N | V |
| Override third-party payout block | N | N | N | N | N | OV senior only if policy-approval feature flag + EDD + documented rationale exist | N | N | N | N | N | V |
| Withdraw to unverified destination | N | N | N | N | N | N | N | N | N | N | N | N |

Rules:

1. Payout destination must be in client's own verified name.
2. Third-party payout is prohibited by default.
3. New payout destination requires cooling-off.
4. Withdrawal cannot proceed to unverified destination.
5. Withdrawal must pass balance, Travel Rule, AML, wallet screening, client-side dual authorization where required, and maker-checker checks.
6. Client cannot approve own withdrawal.
7. Operations and Finance must not release without required approvals.
8. High-risk withdrawal requires compliance review.

---

## 14. Ledger, Balance, and Settlement Permissions

| Action | CLIENT | SUPPORT | COMPLIANCE | OPS_OFFICER | OPS_MANAGER | FINANCE_OFFICER | FINANCE_MANAGER | ADMIN | SUPER_ADMIN | MANAGEMENT | AUDITOR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| View own balance | V own | N | N | N | N | N | N | N | N | N | V audit |
| View client balance | N | V status only | V limited | V | V | V | V | N | V | V | V |
| Create ledger posting directly | N | N | N | N | N | N | N | N | N | N | N |
| System ledger posting | N | N | N | N | N | N | N | N | N | N | V |
| Request ledger reversal | N | N | R if compliance reason | M/R | K/R | M/R | K/A | N | N | V | V |
| Approve ledger reversal | N | N | K if compliance impact | K if ops impact | K/A | M/K | K/A | N | N | V | V |
| View ledger report | N | N | V limited | V limited | V | V | V | N | V | V | V |
| Export ledger report | N | N | N | N | N | M | K/A | N | N | V approved | V approved |
| Create pre-funded hold | System only | N | N | N | N | N | N | N | N | N | V |
| Manually override balance | N | N | N | N | N | N | N | N | N | N | N |
| Complete settlement | N | N | K if compliance condition | M | K/A | M | K/A | N | N | V | V |
| Authorize LP settlement payment | N | N | K if compliance condition | M | K/A | M | K/A | N | N | V | V |
| Close settlement exception | N | N | K if compliance issue | M | K/A | M | K/A | N | N | V | V |
| Close reconciliation break | N | N | K if compliance issue | R | R | M | K/A | N | N | V | V |

Rules:

1. Ledger entries are immutable.
2. Direct balance edit is prohibited.
3. Reversal must use reversing entries.
4. Trial balance must net to zero.
5. Available balance cannot go negative.
6. Hold cannot exceed available balance.
7. Balance hold and ledger posting must be atomic.
8. Settlement completion requires evidence.
9. LP settlement payment requires maker-checker approval.
10. LP settlement payment cannot be released before client-side fund/asset control and DvP/safeguarded sequence checks pass.
11. Settlement sequence must not create AIX principal exposure.
12. Reconciliation breaks require owner, evidence, resolution, and audit log.

---

## 15. Client Money Safeguarding and Reconciliation Permissions

| Action | SUPPORT | COMPLIANCE | OPS_OFFICER | OPS_MANAGER | FINANCE_OFFICER | FINANCE_MANAGER | ADMIN | MANAGEMENT | AUDITOR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| View safeguarding dashboard | N | V | V | V | V/R | V/R/A | N | V | V |
| Run safeguarding computation | N | V | V | V | M/R | K/A | N | V | V |
| Confirm client-money resources | N | N | R | K | M/R | K/A | N | V | V |
| Confirm client-money liabilities | N | V | R | K | M/R | K/A | N | V | V |
| Investigate shortfall | N | R | R | R | M/R | K/A | N | V | V |
| Close shortfall alert | N | K if compliance | K if ops | K if ops | M | K/A | N | V | V |
| Export safeguarding report | N | N | N | N | M | K/A | N | V approved | V approved |
| Override safeguarding result | N | N | N | N | M exceptional | K/A exceptional | N | V | V |

Rules:

1. Client money must be fully backed.
2. Client money must not be used for AIX operations.
3. Any shortfall triggers high-severity alert.
4. Shortfall closure requires Finance Manager and compliance awareness.
5. Manual override requires maker-checker and reason.
6. Safeguarding report exports must be audit logged.

---

## 16. Vendor, LP, Custodian, and Bank Permissions

| Action | SUPPORT | COMPLIANCE_ANALYST | COMPLIANCE_OFFICER | MLRO | OPS_MANAGER | FINANCE_MANAGER | ADMIN | SUPER_ADMIN | SECURITY | TECH | MANAGEMENT | AUDITOR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Create vendor record | N | R | R | R | M/R | M/R | C/M | K | R security | R technical | V | V |
| Upload vendor DD documents | N | C/E | C/E | C/E | C/E | C/E | C/E | C/E | C/E | C/E | V | V |
| Approve vendor due diligence | N | M/R | K/A compliance | K/A senior | K/A ops | K/A finance | N | N | K security | R technical | K final if required | V |
| Approve LP | N | R | K compliance | K senior | K ops | K finance | M config | K config | K security | R technical | K final if required | V |
| Approve custodian | N | R | K compliance | K senior | K ops | K finance | M config | K config | K security | R technical | K final if required | V |
| Approve bank partner | N | R | K compliance | K senior | K ops | K finance | M config | K config | K security | R technical | K final if required | V |
| Enter vendor API key | N | N | N | N | N | N | N | N | M/K | M/K | N | N |
| View vendor API secret | N | N | N | N | N | N | N | N | N | N | N | N |
| Rotate vendor API key | N | N | N | N | N | N | N | N | M/K | M/K | N | V evidence |
| Disable vendor | N | M if compliance risk | K/A | K/A senior | M/K | M/K | M/K | K | K security | K technical | V | V |
| Configure LP market data display | N | R compliance | K compliance | K senior | R | N | M/CFG | K/CFG | R | R | V | V |
| Assign client deposit address | N | R compliance | K if compliance issue | K senior if high risk | M/R | R | M/CFG | K/CFG | K security | R technical | V | V |

Rules:

1. Vendor approval requires due diligence.
2. LP approval requires legal agreement and market-data licence position.
3. Custodian and bank approval are blocking dependencies before production.
4. Secrets must be stored in KMS/vault.
5. No human role should view plaintext production secrets after storage.
6. Vendor disabling must fail safe.

---

## 17. Complaints, Dispute, Privacy, and DSAR Permissions

| Action | CLIENT_OWNER | CLIENT_USER | SUPPORT | COMPLIANCE_ANALYST | COMPLIANCE_OFFICER | MLRO | DPO | MANAGEMENT | AUDITOR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Submit complaint / dispute | C/S own | C/S if authorised | C on behalf | N | N | N | N | V | V |
| View complaint status | V own | V if authorised | V | V | V | V | V | V | V |
| Create complaint record | C own | C if authorised | C | C | C | C | C | V | V |
| Assign complaint owner | N | N | M | M | K/A | K/A senior | R | V | V |
| Resolve complaint / dispute | N | N | M | M/R | K/A | K/A senior | R if privacy impact | V | V |
| Close complaint | N | N | M | M/R | K/A | K/A senior | R if privacy impact | V | V |
| Submit DSAR / privacy request | C/S own | C/S if authorised | C on behalf | N | N | N | N | V | V |
| Verify DSAR requester identity | N | N | M | M/R | K/A | K/A senior | K/A | V | V |
| Handle DSAR / privacy request | N | N | N | R | R | R senior | M/K/A | V | V |
| Approve DSAR response | N | N | N | R | K if compliance issue | K senior | A/K | V | V |
| Reject or limit DSAR due to retention/legal obligation | N | N | N | R | K if compliance issue | K senior | A/K | V | V |
| Export DSAR response package | N | N | N | N | K if compliance issue | K senior | M/K/A | V approved | V approved |

Rules:

1. Complaints and disputes must have owner, status, evidence, resolution, and audit log.
2. Complaint owner cannot close own complaint without checker.
3. Privacy and DSAR workflows are owned by DPO.
4. DSAR response must respect AML, Travel Rule, audit, and legal retention restrictions.
5. DSAR exports require approval and audit log.
6. Sensitive complaint or privacy records require read-access logging.

---

## 18. Reporting, Records, and Export Permissions

| Report / Record | CLIENT_OWNER | SUPPORT | COMPLIANCE | OPS | FINANCE | ADMIN | MANAGEMENT | AUDITOR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Client own statement | V/X own | N | N | N | N | N | N | V audit |
| Client own trade confirmation | V/X own | N | N | N | N | N | N | V audit |
| Client status report | N | V limited | V | V limited | V limited | N | V | V |
| KYC/KYB report | N | N | V/X controlled | N | N | N | V restricted | V restricted |
| AML case report | N | N | V/X restricted | N | N | N | V restricted | V restricted |
| STR report | N | N | V/X highly restricted | N | N | N | V highly restricted | V highly restricted |
| Travel Rule report | N | N | V/X restricted | V limited | N | N | V restricted | V restricted |
| Trade report | V own | V limited | V | V/X | V/X | N | V/X | V/X |
| Ledger report | N | N | V limited | V limited | V/X | N | V/X | V/X |
| Reconciliation report | N | N | V limited | V | V/X | N | V/X | V/X |
| Client-money safeguarding report | N | N | V | V | V/X | N | V/X | V/X |
| Audit log report | N | N | V limited | V limited | V limited | V controlled | V | V/X |
| Vendor report | N | N | V | V | V | V | V | V |
| Management dashboard | N | N | V summary | V summary | V summary | N | V | V |
| Threshold transaction report | N | N | M/R | V limited | V limited | N | V | V |
| Regulatory report / LFSA return | N | N | M/R | R | R | N | K/A | V |

Rules:

1. Sensitive exports require audit log.
2. STR and AML exports require restricted permission.
3. Report access must follow data minimisation.
4. Client can only view own records.
5. Auditor access must be read-only and time-bound where applicable.
6. Threshold transaction report submission requires Compliance Officer or MLRO approval.
7. Regulatory report / LFSA return submission requires authorised Compliance Officer, MLRO, or Management approval.
8. Auditor export of highly restricted STR/AML data requires approval and cannot be self-serve.

---

## 19. Admin, Configuration, and Feature Flag Permissions

| Action | ADMIN | SUPER_ADMIN | SECURITY_ADMIN | TECH_ADMIN | COMPLIANCE_OFFICER | MLRO | OPS_MANAGER | FINANCE_MANAGER | MANAGEMENT | AUDITOR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Create staff user | M | K/A | V | N | N | N | N | N | V | V |
| Disable staff user | M | K/A | V | N | N | N | N | N | V | V |
| Assign role | M | K/A | R | N | R if compliance role | R if MLRO role | R if ops role | R if finance role | V | V |
| Change permission | M | K/A | R | N | R | R | R | R | V | V |
| Configure system settings | M | K/A | R | R technical | R if compliance impact | R if AML impact | R if ops impact | R if finance impact | V | V |
| Configure feature flags | M | K/A | R | R | K if compliance impact | K if AML impact | K if ops impact | K if finance impact | V | V |
| Enable MVP module | M | K/A | R | R | K if compliance impact | K if AML impact | K if ops impact | K if finance impact | V | V |
| Enable Future-Locked Exchange module | N | N | N | N | N | N | N | N | N | V |
| Change audit log settings | N | N | M/K | R | N | N | N | N | V | V |
| Change data retention settings | M | K/A | R security | R technical | K compliance / DPO where privacy impact | K AML where needed | N | N | V | V |
| Change production secrets | N | N | M/K | M/K | N | N | N | N | N | V evidence |
| Production deployment | N | K if authorised | K security | M | K if compliance impact | K if AML impact | K if ops impact | K if finance impact | V | V |

Rules:

1. Feature flags default disabled.
2. Locked exchange flags cannot be enabled by admin or super admin.
3. Future-locked exchange activation requires licence approval and documentation update.
4. Role and permission changes require maker-checker.
5. Super Admin cannot self-approve.
6. Production deployment requires maker-checker.

---

## 20. Break-Glass / Emergency Access Permissions

Break-glass access is only for genuine production incidents where normal access is insufficient and delay would materially harm clients, security, compliance, or platform stability.

| Action | SECURITY_ADMIN | TECH_ADMIN | SUPER_ADMIN | MANAGEMENT | COMPLIANCE_OFFICER / MLRO | AUDITOR |
|---|---:|---:|---:|---:|---:|---:|
| Request break-glass access | M | M | M | N | N | V |
| Grant break-glass access | K/A | K if technical | K/A | K/A notification | K notification if compliance impact | V |
| Use break-glass access | V/AUD | V/AUD | V/AUD | N | N | V |
| Revoke break-glass access | M/K | M/K | K/A | V | V | V |
| Review break-glass session | R | R | R | A | R if compliance impact | V |
| Close break-glass incident review | M | M | K/A | K/A | K if compliance impact | V |

Rules:

1. Break-glass access must be time-boxed.
2. Break-glass access must use named user identity.
3. Shared emergency accounts are prohibited.
4. Break-glass grantor cannot be the same user receiving emergency access.
5. Break-glass access must trigger automatic alerts to Security, Management, and Compliance where relevant.
6. All break-glass actions must have heightened audit logging.
7. Post-incident review is mandatory.
8. Unused break-glass access must expire automatically.
9. Break-glass access must not bypass licence locks, audit logging, or future-locked exchange restrictions.

Required error / event code:

```txt
BREAK_GLASS_ACCESS_USED
```

---

## 21. Audit Log Permissions

| Action | ADMIN | SUPER_ADMIN | SECURITY_ADMIN | COMPLIANCE | OPS | FINANCE | MANAGEMENT | AUDITOR | TECH |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| View own audit events | V | V | V | V | V | V | V | V | V |
| Search audit log | V controlled | V controlled | V/AUD | V limited | V limited | V limited | V | V | V technical |
| Export audit log | N | M/K | M/K | M/K limited | M/K limited | M/K limited | V approved | V/X approved | N |
| Delete audit log | N | N | N | N | N | N | N | N | N |
| Modify audit log | N | N | N | N | N | N | N | N | N |
| Disable audit log | N | N | N | N | N | N | N | N | N |
| Verify audit hash-chain | N | V | V/R | V | V | V | V | V/R | V/R |

Rules:

1. Audit log is append-only.
2. No user can delete audit log.
3. No user can modify audit log.
4. Audit export requires approval.
5. Sensitive audit search is itself audit logged.

---

## 22. Future-Locked Exchange Permission Matrix

| Locked Module | CLIENT | SUPPORT | COMPLIANCE | OPS | FINANCE | ADMIN | SUPER_ADMIN | TECH | MANAGEMENT |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| AIX Public Order Book | N | N | N | N | N | N | N | N | N |
| AIX Matching Engine | N | N | N | N | N | N | N | N | N |
| AIX Public Market Depth | N | N | N | N | N | N | N | N | N |
| Public Exchange Trading | N | N | N | N | N | N | N | N | N |
| Client-to-Client Matching | N | N | N | N | N | N | N | N | N |
| Public Market API | N | N | N | N | N | N | N | N | N |
| Market Maker Engine | N | N | N | N | N | N | N | N | N |
| Maker/Taker Fee Engine | N | N | N | N | N | N | N | N | N |
| Resting Limit Orders | N | N | N | N | N | N | N | N | N |
| Stop-Limit Orders | N | N | N | N | N | N | N | N | N |
| GTC / Post-Only / IOC / FOK Orders | N | N | N | N | N | N | N | N | N |

Rules:

1. Future-locked exchange modules must not be visible to clients.
2. Future-locked exchange modules must not be connected to MVP runtime.
3. Future-locked exchange modules must not be enabled by feature flag in MVP.
4. No role can override this matrix until Exchange approval is granted and upstream documents are updated.

---

## 23. Maker-Checker Matrix

| Action | Maker Role | Checker Role | Minimum Checker Level | Self-Approval Allowed? |
|---|---|---|---|---|
| Client approval | Compliance Analyst / Officer | Compliance Officer / MLRO | Compliance Officer | No |
| Professional/accredited status approval | Compliance Analyst / Officer | Compliance Officer / MLRO | Compliance Officer | No |
| High-risk client approval | Compliance Officer | MLRO | MLRO | No |
| Client type change | Compliance Analyst / Officer | Compliance Officer / MLRO | Compliance Officer | No |
| Account freeze/unfreeze | Compliance Analyst / Officer | Compliance Officer / MLRO | Compliance Officer | No |
| Payout destination approval | Ops / Finance / Compliance where risk | Ops Manager / Finance Manager / Compliance Officer | Manager or Compliance Officer | No |
| Withdrawal approval | Ops / Finance | Ops Manager / Finance Manager | Manager | No |
| High-risk withdrawal approval | Ops / Finance + Compliance | Ops Manager / Finance Manager + Compliance Officer / MLRO | Manager + Compliance | No |
| Deposit credit after compliance hold | Ops / Finance | Ops Manager / Finance Manager + Compliance | Manager + Compliance | No |
| Ledger reversal | Finance / Ops | Finance Manager / Ops Manager | Manager | No |
| Settlement completion | Ops / Finance | Ops Manager / Finance Manager | Manager | No |
| Settlement exception closure | Ops / Finance | Ops Manager / Finance Manager | Manager | No |
| Reconciliation break closure | Finance Officer | Finance Manager | Finance Manager | No |
| Client-money safeguarding shortfall closure | Finance Officer | Finance Manager + Compliance Officer | Finance Manager + Compliance | No |
| Asset approval | Compliance Analyst / Officer | Compliance Officer / MLRO | Compliance Officer | No |
| Asset/pair activation | Admin + Compliance/Operations/Finance | Super Admin + required domain checker | Super Admin + domain checker | No |
| Fee rule change | Admin / Finance | Finance Manager + Compliance where needed | Finance Manager | No |
| Feature flag change | Admin | Super Admin + domain checker | Super Admin | No |
| Role/permission change | Admin | Super Admin / Security Admin | Super Admin or Security Admin | No |
| Vendor approval | Admin / Domain Owner | Compliance + Security + Finance/Ops where relevant | Domain checker | No |
| LP approval | Admin / Ops | Compliance + Finance + Security + Management where required | Multi-domain | No |
| Custodian approval | Admin / Ops/Finance | Compliance + Finance + Security + Management where required | Multi-domain | No |
| Bank approval | Admin / Finance | Compliance + Finance + Management where required | Multi-domain | No |
| Production deployment | Tech Admin | Security Admin + Super Admin + domain checker where needed | Security + Super Admin | No |
| MFA reset | Support/Admin/Security | Security Admin / Super Admin | Security Admin | No |
| Data-retention settings change | Admin / DPO / Compliance | Super Admin + Compliance/DPO where applicable | Super Admin + domain checker | No |
| Audit-log export | Domain owner / Auditor request | Security Admin / Super Admin / Management where required | Security or Management | No |
| Safeguarding override | Finance Officer | Finance Manager + Compliance Officer | Finance Manager + Compliance | No |
| Vendor secret rotation | Security Admin / Tech Admin | Security Admin / Tech Admin not same user | Security or Tech checker | No |
| Client-side withdrawal approval | Client initiator | Different authorised Client Approver | Client Approver | No |
| Client-side large trade approval | Client initiator | Different authorised Client Approver | Client Approver | No |
| LP settlement payment | Ops / Finance | Ops Manager + Finance Manager | Manager + Finance | No |
| Complaint closure | Support / Compliance | Compliance Officer / Management where required | Compliance Officer | No |
| DSAR / privacy response | DPO / Compliance | DPO + Compliance/Management where required | DPO | No |
| Threshold transaction report submission | Compliance Analyst / Officer | Compliance Officer / MLRO | Compliance Officer or MLRO | No |
| Regulatory report / LFSA return submission | Compliance / Finance | MLRO / Management | MLRO or Management | No |
| Deposit address assignment | Ops/Admin | Ops Manager + Security/Compliance where required | Manager/domain checker | No |
| Client agreement version publishing | Compliance/Admin | Compliance Officer / MLRO + Admin checker | Compliance Officer | No |
| Break-glass access grant | Security/Tech/Super Admin | Security Admin + Management/Super Admin | Security + senior checker | No |

---

## 24. Segregation-of-Duties Conflict Matrix

The system must detect and block the following conflicts.

| Conflict ID | Conflict | Rule |
|---|---|---|
| SOD-001 | Maker approves own request | Block |
| SOD-002 | Onboarding reviewer approves same client's high-risk withdrawal | Block or require senior override |
| SOD-003 | User creates payout destination and approves same destination | Block |
| SOD-004 | User submits withdrawal and approves same withdrawal | Block |
| SOD-005 | User creates ledger reversal and approves same reversal | Block |
| SOD-006 | User creates settlement exception and closes same exception | Block or require manager approval |
| SOD-007 | User changes own role or permission | Block |
| SOD-008 | User disables own MFA requirement | Block |
| SOD-009 | User creates feature flag change and approves same change | Block |
| SOD-010 | User deploys to production and approves same deployment | Block |
| SOD-011 | Compliance case owner closes own high-risk suspicious case without senior approval | Block |
| SOD-012 | Finance user closes own reconciliation break without checker | Block |
| SOD-013 | Admin creates vendor and approves vendor | Block |
| SOD-014 | Staff with support-only role accesses restricted AML/STR record | Block |
| SOD-015 | Tech/Admin role accesses plaintext production secret | Block |
| SOD-016 | Onboarding reviewer approves same client's first or large trade | Block or require senior override |
| SOD-017 | Break-glass grantor is the same user receiving emergency access | Block |
| SOD-018 | Complaint owner resolves own complaint without oversight | Block or senior approval |
| SOD-019 | Client withdrawal initiator approves same withdrawal as client approver | Block |
| SOD-020 | LP settlement payment maker approves same LP payment | Block |

Required error code:

```txt
SEGREGATION_OF_DUTIES_CONFLICT
```

---

## 25. Sensitive Action Audit Matrix

Every action below must be audit logged.

| Action Category | Must Log |
|---|---|
| Login / logout | User, IP, device, success/failure |
| MFA | Setup, reset, success/failure |
| Client profile | Create, edit, submit, approve, reject |
| KYC/KYB | Document upload, view, review, decision |
| Screening | Request, result, decision, false-positive resolution |
| AML case | Create, note, evidence, escalation, closure |
| STR workflow | Create, decision, status, export |
| Travel Rule | Data submission, review, exception, block |
| Wallet screening | Address, result, disposition |
| Payout destination | Create, verify, approve, reject, delete/deactivate |
| Deposit | Detect, match, hold, credit, reject |
| Withdrawal | Create, approve, release, reject, fail |
| Quote | Request, price, issue, accept, expire, reject |
| Trade | Booking, confirmation, LP reference, settlement |
| Ledger | Posting, reversal, trial balance check |
| Reconciliation | Run, break, evidence, closure |
| Client-money safeguarding | Computation, shortfall, remediation, report export |
| Feature flag | Create, change, approve, disable |
| Role/permission | Create, change, approve, revoke |
| Vendor | Create, approve, disable, credentials rotation evidence |
| Asset/pair | Create, approve, activate, deactivate |
| Production deployment | Request, approval, execution, rollback |
| Audit log | Search, export, hash verification |
| Client-side approval | Mandate check, request, approval, rejection, expiry |
| Complaint / dispute | Create, assign, evidence, resolution, closure |
| DSAR / privacy | Request, verification, decision, response, export |
| LP settlement payment | Request, approval, release, fail, reversal |
| Break-glass access | Request, grant, use, revoke, review, closure |
| Threshold / regulatory reports | Prepare, review, approve, submit, export |

---

## 26. Permission Dependency Rules

### 23.1 Client Transaction Access

A client may access transaction modules only if:

1. Client type is institutional or HNWI/professional.
2. Retail onboarding lock is enforced.
3. KYC/KYB is approved.
4. Professional/accredited status is verified where applicable.
5. AML risk status is acceptable.
6. Sanctions/PEP screening is clear or resolved.
7. Account is not suspended, frozen, rejected, or closed.
8. Product access is approved.
9. Asset/pair is approved.
10. Transaction monitoring rules are active.
11. Required agreements and disclosures are accepted.

### 23.2 Withdrawal Access

Withdrawal may proceed only if:

1. Client is approved.
2. Client account is not frozen.
3. Destination is verified and in client's own name.
4. Cooling-off period has passed.
5. Travel Rule data is complete where required.
6. Wallet screening passes where relevant.
7. AML status is acceptable.
8. Available balance is sufficient.
9. Client-side dual authorization is completed where threshold or mandate requires it.
10. Maker-checker is completed.
11. No SoD conflict exists.

### 23.3 Trade Booking Access

Trade booking may proceed only if:

1. Client is approved.
2. Product access is approved.
3. Asset/pair is approved.
4. Quote is valid and not expired.
5. Best-execution / fair-pricing check passes.
6. Client-side dual authorization is completed for large trade where threshold or mandate requires it.
7. Pre-funded hold succeeds.
8. LP execution succeeds or matched leg is confirmed.
9. Idempotency check passes.
10. Balance operation is atomic.
11. Audit log is written.

### 23.4 Admin Configuration Access

Admin configuration may proceed only if:

1. User has required role.
2. Feature flag allows module.
3. Maker-checker is completed where required.
4. SoD check passes.
5. Licence lock is not breached.
6. Change is audit logged.

---

## 27. Prohibited Permissions

The following permissions must not exist in MVP.

```txt
ENABLE_PUBLIC_ORDER_BOOK
ENABLE_MATCHING_ENGINE
ENABLE_CLIENT_TO_CLIENT_MATCHING
ENABLE_PUBLIC_EXCHANGE_TRADING
ENABLE_MARKET_MAKER
ENABLE_PRINCIPAL_DEALING
ENABLE_AIX_SPREAD_MARKUP
ENABLE_RETAIL_ONBOARDING_BY_DEFAULT
DIRECT_LEDGER_DELETE
DIRECT_LEDGER_EDIT
DIRECT_BALANCE_EDIT
AUDIT_LOG_DELETE
AUDIT_LOG_MODIFY
AUDIT_LOG_DISABLE
BYPASS_KYC
BYPASS_AML
BYPASS_TRAVEL_RULE
BYPASS_PREFUNDED_HOLD
BYPASS_BEST_EXECUTION
BYPASS_PAYOUT_DESTINATION_VERIFICATION
BYPASS_MAKER_CHECKER
BYPASS_SOD
VIEW_PLAINTEXT_PRODUCTION_SECRET
BYPASS_CLIENT_SIDE_APPROVAL
BYPASS_LP_SETTLEMENT_APPROVAL
BYPASS_BREAK_GLASS_LOGGING
```

---

## 28. Role-to-Module Summary

| Module Group | Primary Roles | Checker / Oversight |
|---|---|---|
| Foundation | Admin, Super Admin, Security, Tech | Super Admin, Security, domain owner |
| IAM / RBAC | Admin, Security Admin | Super Admin, Security Admin |
| Client Onboarding | Client, Compliance | Compliance Officer, MLRO |
| Compliance / AML | Compliance Analyst, Compliance Officer, MLRO | MLRO, Management where required |
| Complaints / Privacy / DSAR | Support, Compliance, DPO | Compliance Officer, DPO, Management where required |
| Vendors | Admin, Compliance, Ops, Finance, Security | Super Admin, Management where required |
| Asset / Market Config | Admin, Compliance, Ops, Finance | Compliance Officer, Super Admin |
| OTC/RFQ | Client, Client Approver, Ops | Ops Manager, Compliance where needed |
| MB Spot Broking | Client, Ops, System | Ops Manager, Compliance where needed |
| Ledger / Balance | Ledger Service, Finance | Finance Manager, Auditor |
| Deposit / Withdrawal | Client, Client Approver, Ops, Finance, Compliance | Ops Manager, Finance Manager, Compliance |
| Settlement / Reconciliation | Ops, Finance | Ops Manager, Finance Manager |
| Reporting | Compliance, Ops, Finance, Management, Auditor | Domain owner |
| Audit | Security, Auditor, authorised domain leads | Super Admin / Security |
| BCP / DR / Deployment | Tech, Security, Admin | Security, Super Admin, domain checker |
| Future Exchange | No MVP role | Locked |

---

## 29. Testing Requirements for Permissions

Permission testing must include:

1. Default-deny tests.
2. Backend permission guard tests.
3. Feature flag deny tests.
4. Maker-checker tests.
5. Self-approval block tests.
6. Segregation-of-duties conflict tests.
7. Sensitive read audit tests.
8. Client own-record isolation tests.
9. Staff cross-role access tests.
10. Admin cannot bypass licence lock tests.
11. Support cannot access restricted AML/STR tests.
12. Operations cannot approve KYC tests.
13. Finance cannot approve KYC tests.
14. Compliance cannot directly edit ledger tests.
15. Direct balance edit prohibited tests.
16. Third-party payout block tests.
17. Pre-funded hold bypass block tests.
18. Best-execution bypass block tests.
19. Future-locked exchange module deny tests.
20. Audit log delete/modify prohibition tests.
21. Client-side dual authorization tests.
22. Client approver cannot approve own initiated action tests.
23. LP settlement payment approval tests.
24. Break-glass access and heightened logging tests.
25. Complaints/dispute permission tests.
26. DSAR/privacy permission tests.
27. Regulatory report submission approval tests.
28. Auditor restricted export approval tests.

---

## 30. Open Items for Module Blueprints

The following must be refined in module blueprints:

1. Exact permission keys.
2. Exact API endpoint permission mapping.
3. Exact database role tables.
4. Exact maker-checker state machine.
5. Exact SoD conflict rules and override levels.
6. Exact sensitive data read-logging events.
7. Exact role hierarchy.
8. Exact management approval thresholds.
9. Exact withdrawal approval thresholds.
10. Exact transaction monitoring escalation thresholds.
11. Exact client-money safeguarding escalation thresholds.
12. Exact production deployment approval workflow.
13. Exact client-side dual authorization threshold.
14. Exact client mandate model.
15. Exact DPO/Privacy owner assignment.
16. Exact break-glass duration, approval path, and post-review workflow.
17. Exact LP settlement payment approval threshold.
18. Exact regulatory report submission workflow.

---

## 31. Additional Permission Parameters

```txt
client_side_dual_authorization = required_for_withdrawal_and_large_trade
client_dual_control_threshold = to_be_defined
client_approver_role = CLIENT_APPROVER
client_initiator_cannot_approve_same_action = true

complaints_module_owner = compliance_with_support_intake
dsar_privacy_owner = DPO
dpo_role_required = true

lp_settlement_payment_approval = maker_checker
lp_settlement_payment_maker = ops_or_finance
lp_settlement_payment_checker = finance_manager_and_ops_manager_where_required

break_glass_access = defined_with_heightened_logging_and_post_review
break_glass_time_boxed = true
break_glass_grantor_cannot_be_recipient = true
break_glass_auto_alert = security_management_compliance

third_party_payout_override = requires_policy_approval_flag_and_edd
third_party_payout_override_default = disabled

threshold_transaction_report_submission = compliance_or_mlro_approval
regulatory_report_submission = mlro_or_management_approval

deposit_address_assignment = maker_checker
client_agreement_version_publishing = maker_checker

makerchecker_matrix_is_single_source_of_truth = true
base_document_versions = reconciled
```

---

## 32. Claude Model Usage

### 32.1 ChatGPT 5.5

Use for:

1. Permission design.
2. Role matrix drafting.
3. Module blueprint planning.
4. API permission mapping.
5. State machine planning.
6. Claude prompt creation.

### 32.2 Claude Opus

Use for:

1. Review of this Role and Permission Matrix.
2. RBAC/security review.
3. Maker-checker review.
4. Segregation-of-duties review.
5. Licence-lock review.
6. Money-movement approval review.

### 32.3 Claude Sonnet

Do not use Sonnet for coding until permission matrix and relevant module blueprint are approved.

### 32.4 Claude Fable

Use later for user-facing permission errors and help text.

---

## 33. Claude Opus Review Prompt

```txt
Review this 04_Role_And_Permission_Matrix_v1.1.md as a principal fintech platform architect and regulated fintech security reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending.
- This document is based on:
  - 00_Licence_Scope_And_Feature_Lock_v1.3.md
  - 01_Project_Charter_v1.3.md
  - 03_Master_Module_Index_v1.2.md
  - 02_Software_Requirement_Specification_v1.2.md
- MVP supports institutional and HNWI/professional clients only.
- Retail onboarding is disabled by default.
- Platform includes onboarding, KYC/KYB, AML, Travel Rule, transaction monitoring, payout destination whitelist, OTC/RFQ, MB Spot Broking Terminal, LP-backed agency execution, pre-funded hold, best-execution check, ledger, deposit, withdrawal, client-money safeguarding, settlement, reconciliation, audit log, maker-checker, reporting, and admin/staff/client portals.
- AIX spread markup, principal dealing, market making, internal matching, client-to-client matching, public order book, matching engine, and public exchange trading are blocked.

This v1.1 added CLIENT_APPROVER, DPO, client-side dual authorization, complaints/dispute permissions, DSAR/privacy permissions, LP settlement payment approval, break-glass access, missing maker-checker rows, threshold/regulatory reporting permissions, deposit-address assignment, client-agreement publishing, and stricter third-party payout override gating.

Review for:
1. Missing roles.
2. Missing permissions.
3. Over-permissioned roles.
4. Under-permissioned roles.
5. Missing maker-checker controls.
6. Missing segregation-of-duties controls.
7. Missing sensitive read audit controls.
8. Missing money-movement approval controls.
9. Missing AML/Travel Rule approval controls.
10. Missing client-money safeguarding approval controls.
11. Missing admin/security controls.
12. Any permission that could accidentally allow exchange-like or principal-dealing behaviour.
13. Any conflict with 00, 01, 03, or 02.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional permissions or parameters to add.
```

---

## 34. Next Document

After this Role and Permission Matrix is reviewed and accepted, the next document should be:

```txt
05_Master_Workflow_Map.md
```

Reason:

Workflow mapping should be created only after roles, permissions, maker-checker, and segregation-of-duties are locked.
