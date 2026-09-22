---
document_id: ARC-04
title: Role & Permission Matrix
version: v1.3
document_status: APPROVED
implementation_status: N/A
module: N/A
control: RBAC / role governance
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: v1.0, v1.1, v1.2 (archived)
baseline_commit: 6d58ceb
---

# 04 Role and Permission Matrix  
# AIX Institutional Digital Asset, Payment & RWA Platform

> ## v1.3 — RE-BASELINED ON APPROVED DOC 00 v1.5, CHARTER v1.5, MODULE INDEX v1.4 AND SRS v1.3
>
> **Base documents:** `00_..._v1.5`, `01_..._v1.5`, `03_..._v1.4` (37 modules), `02_..._v1.3`,
> `DEC-011`, `DEC-012`, **`DEC-013`**, `STR-03`.
>
> **The rule this version introduces (§3.7).**
>
> > **A permission never activates a capability.**
> >
> > Access requires **permission AND environment capability availability AND product activation
> > AND asset/instrument eligibility AND — in PRODUCTION — the regulatory activation gate.**
>
> Holding an Exchange Trader permission does **not** mean Exchange is production-enabled. It does
> not mean Exchange is enabled in any environment. It means that *if* the capability is available
> and activated, this actor is among those who may use it. **A permission grant is never evidence
> of an activation, and an activation is never evidence of a permission.**
>
> **What is added.** §3.7 the permission/activation separation; §3.8 environment scope; §5.1
> client functional roles and §5.2A subaccount-scoped staff roles (`DEC-011`); §5.4 Exchange,
> RWA, Pay and Issuer roles; §11A instrument-eligibility permissions; §12A AIX Spot order
> permissions; §19A capability-activation permissions; §22 replaced.
>
> **What does not change.** Every role, permission, maker-checker pairing, segregation-of-duties
> conflict and prohibited permission in v1.2 is retained. §27's prohibited-permission list grows;
> nothing is removed from it.
>
> **Permanently prohibited in every environment, for every role including SUPER_ADMIN:** enabling
> MB Spot internal client-to-client matching, an AIX order book for MB Spot, a matching engine for
> MB Spot, market making, principal dealing or AIX principal liquidity (§22.1, §27).
>
> **This document grants no regulatory permission and activates nothing.**

## Document Control

| Item | Details |
|---|---|
| Document name | 04_Role_And_Permission_Matrix_v1.3.md |
| Platform | AIX Institutional Digital Asset, Payment & RWA Platform |
| Document type | SDLC Phase 2 / Access Control and Approval Matrix |
| Version | v1.3 |
| Status | **APPROVED** — re-baselined on Doc 00 v1.5, Charter v1.5, Module Index v1.4, SRS v1.3 and `DEC-013` |
| Prepared for | Product, compliance, architecture, security, development, QA, and operations planning |
| Base document 1 | 00_Licence_Scope_And_Feature_Lock_v1.5.md |
| Base document 2 | 01_Project_Charter_v1.5.md |
| Base document 3 | 03_Master_Module_Index_v1.4.md (37 modules) |
| Base document 4 | 02_Software_Requirement_Specification_v1.3.md |
| Governing decisions | `DEC-011`, `DEC-012`, **`DEC-013`** |
| Supersedes | v1.2 (archived) |

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

### 3.7 A Permission Never Activates a Capability

**New in v1.3. `DEC-013` clause 11; Doc 00 §21A rule 3.**

> **Permissions control *who may act*. Capability states control *whether the action exists,
> where it is available, and whether AIX may perform it at all*. These are different controls
> and must never substitute for one another.**

**The conjunctive access rule:**

```txt
ACCESS GRANTED  ⟺   permission
               AND  environment capability availability   (DEV / TEST / UAT / DEMO / PROD)
               AND  product activation
               AND  asset / instrument eligibility
               AND  production regulatory activation gate  (PRODUCTION only)
```

**Binding rules:**

1. **A permission grant is never evidence of an activation.** Granting `EXCHANGE_TRADER` does not
   enable AIX Exchange in production, in UAT, or anywhere else.
2. **An activation is never evidence of a permission.** A capability being available does not
   grant any actor access to it.
3. **No role, including `SUPER_ADMIN`, may activate a capability by holding a permission.**
   Activation is a separate, governed, maker-checker-approved act (§19A).
4. **A failed capability check must not be reported as a permission failure, and vice versa.**
   Conflating them hides which control denied, which breaks the audit trail.
5. **`CFG-01` owns capability evaluation; `IAM-02` owns permission evaluation.** Neither may be
   implemented inside the other, and neither may be skipped because the other passed.
6. **Permissions for production-gated capabilities may be defined, granted and tested now.**
   Modelling who *would* operate AIX Exchange is not operating it. Grantability and activation are
   separated by `MIG-009`.

### 3.8 Environment Scope of Permissions

**New in v1.3. Doc 00 §1.E; SRS `ENV-SRS-001`…`008`.**

1. **Permission grants are not environment-scoped; capability availability is.** The same role
   definition applies in all five environments; what differs is whether the capability exists to
   be used.
2. **A grant made in a non-production environment does not propagate to PRODUCTION.** Production
   role grants are made through the production governed change path only.
3. **Every control in this document applies identically in DEVELOPMENT, TEST, UAT, DEMO and
   PRODUCTION** — default deny, backend source of truth, least privilege, no self-approval,
   client-side dual authorization, sensitive-read logging, maker-checker and segregation of
   duties. **No control is relaxed for non-production convenience** (Doc 00 §21A rule 7).
4. **Break-glass access is logged identically in every environment** (§20).
5. **Every permission decision records the environment** it was evaluated in.

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
| CLIENT_TRADER | Client Trader | *(new in v1.3, `DEC-011`)* Places and cancels client orders within granted subaccount scope. **Holding it activates no product** (§3.7) |
| CLIENT_FINANCE | Client Finance | *(new in v1.3)* Deposit, withdrawal initiation, statements, reconciliation views within subaccount scope |
| CLIENT_COMPLIANCE | Client Compliance Contact | *(new in v1.3)* Client-side compliance correspondence, document submission, screening outcomes |
| CLIENT_API_OPERATOR | Client API Operator | *(new in v1.3)* Manages the client's own API credentials and webhooks through `API-01` |
| MERCHANT_OWNER | Merchant Owner | *(new in v1.3, AIX Pay)* Merchant organisation owner |
| MERCHANT_USER | Merchant User | *(new in v1.3, AIX Pay)* Restricted merchant operator |
| MERCHANT_APPROVER | Merchant Approver | *(new in v1.3, AIX Pay)* Second approver for settlement destination changes and payout release |
| ISSUER_OWNER | Issuer Owner | *(new in v1.3, AIX RWA)* Issuer organisation owner |
| ISSUER_USER | Issuer User | *(new in v1.3, AIX RWA)* Restricted issuer operator |
| INVESTOR_PARTICIPANT | Investor / Exchange Participant | *(new in v1.3, AIX RWA / AIX Exchange)* Subscribes to offerings and, where eligible and admitted, participates in the Exchange |

**Client-role rules (new in v1.3):**

1. **Client functional roles are scoped to a subaccount** (`DEC-011`, Module Index `ACC-01`).
   A grant narrows; it never widens.
2. **Merchant, issuer and investor roles attach through the existing `CLT-01` membership and
   `IAM-02` authority chain.** No second membership system is created (`DEC-011` rule 4).
3. **No client role activates any product.** §3.7 applies to all of them.

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
| SURVEILLANCE_ANALYST | Market Surveillance Analyst | *(new in v1.3, `SUR-01`)* Order and trade surveillance, suspicious-pattern review across Spot, OTC and Exchange |
| MARKET_OPERATIONS_OFFICER | Market Operations Officer | *(new in v1.3, `EXM-01`)* Exchange market operations, session management. **Trading halts require a checker** (§23) |
| LISTING_OFFICER | Listing / Admission Officer | *(new in v1.3, `EXM-01`)* Prepares instrument admission and listing requests |
| INSTRUMENT_CLASSIFIER | Instrument Classification Officer | *(new in v1.3, `AST-01`)* Records the legal/regulatory classification outcome and its evidence. **Never self-approves** (§3.4) |
| RWA_OPERATIONS_OFFICER | RWA Operations Officer | *(new in v1.3, `RWA-01`…`RWA-04`)* Issuer and asset onboarding, offering, allocation, servicing operations |
| PAY_OPERATIONS_OFFICER | Payment Operations Officer | *(new in v1.3, `PAY-01`)* Merchant operations, payment and payout operations |
| CAPABILITY_ACTIVATION_APPROVER | Capability Activation Approver | *(new in v1.3, `CFG-01`)* Checker for production capability activation (§19A). **Must not also be the maker** |

### 5.2A Staff role scoping

**New in v1.3.** Staff roles may be scoped by **organisation, master account and subaccount**
(`DEC-011`, `IAM-02` extension in Module Index §7). **Scoping narrows only.** A scoped grant can
never confer access outside the scope, and an unscoped grant is not created by combining scoped
ones.

### 5.4 Domain roles and the capability boundary

**New in v1.3.**

| Role | Domain | Note |
|---|---|---|
| `MARKET_OPERATIONS_OFFICER`, `LISTING_OFFICER` | **AIX Exchange — securities only** | These roles exist in the Exchange domain. **They confer nothing in AIX Spot or AIX OTC** |
| `INVESTOR_PARTICIPANT` | AIX RWA / AIX Exchange | Participation is additionally gated by `EXP-01` eligibility |
| `RWA_OPERATIONS_OFFICER`, `ISSUER_*` | AIX RWA | |
| `PAY_OPERATIONS_OFFICER`, `MERCHANT_*` | AIX Pay | |
| `SURVEILLANCE_ANALYST` | Platform-wide | `SUR-01` spans Spot, OTC and Exchange; the **data** is domain-separated even though the role is shared |

**Binding rule.** **No role grants an actor the ability to cause an MB Spot client order to be
matched against another client's order, or to reach an Exchange-domain module from an
MB-domain path** (§22.1, SRS `EXG-SRS-101`…`103`). This holds in every environment, for every
role including `SUPER_ADMIN`, under every configuration.

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
| Enable a **permanently prohibited** capability (§22.1) | **N** | **N** | **N** | **N** | **N** | **N** | **N** | **N** | **N** | V |
| **Activate a production-gated capability in PRODUCTION** *(new in v1.3)* | M | M | R | R | **K required** | K if AML impact | K if ops impact | K if finance impact | **K required** | V |
| **Enable a capability in a NON-PRODUCTION environment** *(new in v1.3)* | M | K/A | R | R | K if compliance impact | K if AML impact | K if ops impact | K if finance impact | V | V |
| **Change an instrument's classification** *(new in v1.3)* | N | N | N | N | **K required** | K if AML impact | N | N | V | V |
| **Change an environment's capability configuration** *(new in v1.3)* | M | K/A | R | R | K if compliance impact | N | N | N | V | V |
| Change audit log settings | N | N | M/K | R | N | N | N | N | V | V |
| Change data retention settings | M | K/A | R security | R technical | K compliance / DPO where privacy impact | K AML where needed | N | N | V | V |
| Change production secrets | N | N | M/K | M/K | N | N | N | N | N | V evidence |
| Production deployment | N | K if authorised | K security | M | K if compliance impact | K if AML impact | K if ops impact | K if finance impact | V | V |

Rules:

1. Feature flags default disabled.
2. **Permanently prohibited capabilities (§22.1) cannot be enabled by admin or super admin, in any environment. There is no approval path.** *(v1.3: v1.2's rule 3 conditioned this on "until Exchange approval", which Doc 00 §6 has since classified as a standing prohibition no approval lifts.)*
3. **Production activation of a gated capability requires the applicable regulatory activation condition to be satisfied, a documentation update, and maker-checker with a Compliance Officer and Management checker** (§19A).
4. Role and permission changes require maker-checker.
5. Super Admin cannot self-approve.
6. Production deployment requires maker-checker.
7. **Enabling a capability in a non-production environment is governed, audited and maker-checkered, but is not a production activation and confers none** (§3.7). *(New in v1.3.)*
8. **No non-production capability configuration may be promoted to PRODUCTION.** *(New in v1.3.)*
9. **An instrument's classification may be changed only by `INSTRUMENT_CLASSIFIER` as maker with a Compliance Officer checker**, never self-approved. *(New in v1.3.)*

---

## 19A. Capability Activation Permissions

**New in v1.3. `DEC-013` clauses 2, 3, 11; Doc 00 §21, §21A.**

**Production activation is its own governed act with its own permission, its own checker and its
own evidence.** It is not a side effect of a feature-flag change, a deployment, or a role grant.

| Action | Maker | Checker | Additional required |
|---|---|---|---|
| Activate a capability in PRODUCTION | `ADMIN` / `SUPER_ADMIN` | **`CAPABILITY_ACTIVATION_APPROVER` + `COMPLIANCE_OFFICER` + `MANAGEMENT`** | Doc 00 §21's thirteen conditions evidenced; the applicable regulatory open question closed and recorded in `DECISION_LOG.md` |
| Deactivate a capability in PRODUCTION | `ADMIN` / `SUPER_ADMIN` / `SECURITY_ADMIN` | Single checker sufficient | **Deactivation is never blocked by a missing checker.** Failing closed must always be available |
| Kill-switch a capability | `SECURITY_ADMIN` / `SUPER_ADMIN` | Post-hoc review required | Heightened audit; `CFG-01` kill switch |
| Enable a capability in DEVELOPMENT / TEST / UAT / DEMO | `ADMIN` | `SUPER_ADMIN` or domain checker | Environment recorded; **confers nothing in PRODUCTION** |
| Change an environment's capability configuration | `ADMIN` | `SUPER_ADMIN` | Environment recorded |

**Rules:**

1. **The maker may never be a checker** for the same activation (§3.4).
2. **Every activation records who, when, on what basis, and under which approval** (SRS `STATE-SRS-005`).
3. **An activation whose regulatory basis is unresolved must be refused**, regardless of who requests it.
4. **Deactivation is always easier than activation.** One authorised actor can close a capability; several are needed to open one.
5. **No permission in this section can reach a §22.1 capability.**
6. **Break-glass does not confer activation.** Break-glass grants emergency *access*, never emergency *activation* (§20).

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
9. Break-glass access must not bypass licence locks, audit logging, the permanently prohibited capabilities in §22.1, or any capability's production activation gate. **Break-glass grants emergency access, never emergency activation** (§19A rule 6). *(v1.3: widened from "future-locked exchange restrictions".)*

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

## 22. Prohibited and Production-Gated Permission Matrices

**Replaced in v1.3.** v1.2's single "Future-Locked Exchange Permission Matrix" denied eleven
items to every role under one heading, which mixed permanent prohibitions with order types
Doc 00 §6 had already reclassified, and gave the securities Exchange **no roles at all**
(`STR-03` L-43). **Nothing is removed. Every `N` below that was an `N` in v1.2 is still an `N`.**

### 22.1 Permanently prohibited — no role, no environment, no override

| Capability | CLIENT | SUPPORT | COMPLIANCE | OPS | FINANCE | ADMIN | SUPER_ADMIN | TECH | MANAGEMENT |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| AIX order book **for MB Spot** | N | N | N | N | N | N | **N** | N | N |
| Matching engine **for MB Spot** | N | N | N | N | N | N | **N** | N | N |
| AIX-operated market depth as an AIX market | N | N | N | N | N | N | **N** | N | N |
| AIX-operated public exchange trading (digital currency) | N | N | N | N | N | N | **N** | N | N |
| **Client-to-client matching / crossing / netting** | N | N | N | N | N | N | **N** | N | N |
| Public market API for an AIX-operated market | N | N | N | N | N | N | **N** | N | N |
| Market maker engine | N | N | N | N | N | N | **N** | N | N |
| Maker/taker fee engine | N | N | N | N | N | N | **N** | N | N |
| Principal dealing / proprietary trading / AIX principal liquidity | N | N | N | N | N | N | **N** | N | N |
| **Reaching an Exchange-domain module from an MB-domain path** | N | N | N | N | N | N | **N** | N | N |

**Rules:**

1. These must not be visible to clients in any environment.
2. These must not be connected to any runtime, in any environment.
3. These must not be enabled by feature flag, configuration, service domain or environment value.
4. **No role can override this matrix. There is no approval that grants it.** Unlike v1.2's rule 4,
   there is no "until Exchange approval" condition — Doc 00 §6 classifies all of these as
   **standing prohibitions that no Exchange approval lifts**.
5. **Break-glass access must not bypass this matrix** (§20).
6. The corresponding permission codes must not exist (§27).

### 22.2 Production-gated capabilities — roles exist, activation is separate

**These are not in §22.1.** Roles may be defined, granted and tested now (§3.7 rule 6); the
capability's production activation is a separate control (§19A).

| Capability | Who may operate it when activated | Production activation |
|---|---|---|
| AIX Exchange — listing / admission | `LISTING_OFFICER` (maker), `COMPLIANCE_OFFICER` (checker) | `DISABLED` — `R1-Q1b` |
| AIX Exchange — market operations, sessions | `MARKET_OPERATIONS_OFFICER` | `DISABLED` — `R1-Q1b` |
| AIX Exchange — **trading halt** | `MARKET_OPERATIONS_OFFICER` (maker), `OPS_MANAGER` or `MANAGEMENT` (checker) | `DISABLED` — `R1-Q1b` |
| AIX Exchange — order entry | `INVESTOR_PARTICIPANT`, subject to `EXP-01` eligibility | `DISABLED` — `R1-Q1b` |
| AIX Exchange — participant admission | `COMPLIANCE_OFFICER` (checker required) | `DISABLED` — `R1-Q1b` |
| AIX Exchange — surveillance | `SURVEILLANCE_ANALYST`, `MLRO` | `DISABLED` — `R1-Q1b` |
| Security-token issuance / secondary market | `RWA_OPERATIONS_OFFICER`, `ISSUER_*`, `INSTRUMENT_CLASSIFIER` | `DISABLED` — `R4-Q2`, `R1-Q1b` |
| RWA issuance, offering, allocation, servicing | `RWA_OPERATIONS_OFFICER`, `ISSUER_*` | `DISABLED` — `R4-Q1`…`R4-Q7` |
| AIX Pay beyond the Doc 00 §5.2 baseline | `PAY_OPERATIONS_OFFICER`, `MERCHANT_*` | **PENDING / FEATURE-LOCKED** — `R5-Q1`, `R5-Q2` |
| Multi-venue smart routing (Model B) | `OPS_OFFICER`, `OPS_MANAGER` | `DISABLED` per venue — Doc 00 §7A |
| Order types Stop, Stop-Limit, IOC, FOK, GTC | `CLIENT_TRADER` | `DISABLED` — `R3-Q3` |
| Execution against displayed depth | `CLIENT_TRADER` | `DISABLED` — `R3-Q2b` |

**Rule.** For every row above: **holding the role is not the activation, and the activation is not
the grant** (§3.7). Both are required, and in PRODUCTION the regulatory gate is required as well.

### 22.3 Out of product scope — no roles, no permissions

Derivatives, futures, perpetuals, margin, leverage, lending, borrowing of client assets, staking,
yield / earn, DeFi yield. **No role in this document has any permission over them, and none may be
created** (`DEC-013` clause 6).

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

### 26.1 Client Transaction Access

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

### 26.2 Withdrawal Access

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

### 26.3 Trade Booking Access

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

### 26.4 Admin Configuration Access

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

**Added in v1.3 — the list grows, nothing is removed:**

```txt
ENABLE_MB_SPOT_INTERNAL_MATCHING
ENABLE_MB_SPOT_ORDER_BOOK
ENABLE_MAKER_TAKER_FEE_ENGINE
ENABLE_AIX_PRINCIPAL_LIQUIDITY
ENABLE_AIX_INVENTORY_POSITION
CALL_EXCHANGE_DOMAIN_FROM_MB_CONTEXT
EXECUTE_MB_ORDER_ON_EXCHANGE_MATCHING_ENGINE
BYPASS_INSTRUMENT_CLASSIFICATION
BYPASS_ASSET_ELIGIBILITY
BYPASS_ENVIRONMENT_CAPABILITY_CHECK
BYPASS_PRODUCTION_ACTIVATION_GATE
ACTIVATE_CAPABILITY_WITHOUT_MAKER_CHECKER
PROMOTE_NON_PRODUCTION_CAPABILITY_STATE
SET_SYNTHETIC_CLASSIFICATION_IN_PRODUCTION
ADMIT_SECURITY_INSTRUMENT_TO_SPOT
ADMIT_SECURITY_INSTRUMENT_TO_OTC
ENABLE_DERIVATIVES
ENABLE_MARGIN_TRADING
ENABLE_LENDING
ENABLE_STAKING
ENABLE_YIELD_PRODUCT
```

**Rules:**

1. **These permissions must not exist in any environment**, including local development.
2. **No role, including `SUPER_ADMIN`, may be granted one**, and no break-glass path may confer one.
3. **A permission code in this list must never be seeded**, even as inactive catalogue data whose
   presence could later be flipped to active.
4. **`CALL_EXCHANGE_DOMAIN_FROM_MB_CONTEXT` and
   `EXECUTE_MB_ORDER_ON_EXCHANGE_MATCHING_ENGINE` are listed explicitly** because the AIX Exchange
   matching engine now exists as a build target. The clearest way to state that it grants AIX Spot
   nothing is to name the permission that would do so and prohibit it (SRS `EXG-SRS-101`…`103`).

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
| AIX Spot | Client Trader, Ops, System | Ops Manager, Compliance where needed |
| Market surveillance (`SUR-01`) | Surveillance Analyst, Compliance | MLRO, Management |
| Asset & Instrument Registry (`AST-01`) | Instrument Classifier, Compliance | Compliance Officer, MLRO |
| AIX Pay (`PAY-01`) | Merchant roles, Pay Operations Officer | Ops Manager, Finance Manager, Compliance |
| AIX RWA (`RWA-01`…`RWA-04`) | Issuer roles, RWA Operations Officer, Investor | Compliance Officer, Ops Manager, Management |
| AIX Exchange (`EXM-01`, `EXO-01`, `EXC-01`, `EXP-01`) | Listing Officer, Market Operations Officer, Investor Participant | Compliance Officer, Ops Manager, Management |
| Capability activation (`CFG-01`) | Admin, Super Admin | **Capability Activation Approver, Compliance Officer, Management** |
| Ledger / Balance | Ledger Service, Finance | Finance Manager, Auditor |
| Deposit / Withdrawal | Client, Client Approver, Ops, Finance, Compliance | Ops Manager, Finance Manager, Compliance |
| Settlement / Reconciliation | Ops, Finance | Ops Manager, Finance Manager |
| Reporting | Compliance, Ops, Finance, Management, Auditor | Domain owner |
| Audit | Security, Auditor, authorised domain leads | Super Admin / Security |
| BCP / DR / Deployment | Tech, Security, Admin | Security, Super Admin, domain checker |
| **Permanently prohibited capabilities** (§22.1) | **No role, ever** | **No approval exists** |

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
19. **Permanently prohibited capability deny tests** — for every §22.1 row, for every role including `SUPER_ADMIN`, in every environment. *(v1.3: replaces "future-locked exchange module deny tests" and widens it.)*
20. Audit log delete/modify prohibition tests.
21. Client-side dual authorization tests.
22. Client approver cannot approve own initiated action tests.
23. LP settlement payment approval tests.
24. Break-glass access and heightened logging tests.
25. Complaints/dispute permission tests.
26. DSAR/privacy permission tests.
27. Regulatory report submission approval tests.
28. Auditor restricted export approval tests.
29. **Permission-does-not-activate tests** — that granting a role for a production-gated capability leaves its activation state unchanged (§3.7). *(New in v1.3.)*
30. **Activation-does-not-grant tests** — that activating a capability grants no actor access to it.
31. **Conjunctive access tests** — that access fails when any one of permission, environment availability, product activation, asset eligibility or the production gate fails.
32. **Denial-attribution tests** — that a capability denial is not reported as a permission denial, and vice versa (§3.7 rule 4).
33. **Capability activation maker-checker tests**, including that the maker cannot be a checker (§19A).
34. **Deactivation-always-available tests** — that failing closed never requires a full checker set (§19A rule 4).
35. **Break-glass-does-not-activate tests** (§19A rule 6).
36. **Non-production promotion block tests** (§3.8 rule 2, §19 rule 8).
37. **Exchange boundary permission tests** — that no role can cause an MB-domain path to reach an Exchange-domain module, in any environment (§22.1, §27).
38. **Prohibited-permission-code absence tests** — that no code in §27 exists in the permission catalogue, active or inactive.
39. **Subaccount scope tests** — that a scoped grant narrows and never widens (§5.2A).
40. **Per-environment control-parity tests** — that every control in §3 applies identically in all five environments (§3.8 rule 3).

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
17. **Exact permission keys for the `securities_market.*` capability namespace** (`MIG-007`). *(New in v1.3.)*
18. **Exact separation of permission grantability from production activation in `IAM-02`** (`MIG-009`).
19. **Exact subaccount-scoped permission model** (`DEC-011`, `ACC-01`, `IAM-02` extension).
20. **Exact Exchange participant admission and eligibility rules** (`EXP-01`).
21. **Exact instrument-classification approval path and evidence standard** (`R4-Q3`).
22. **Exact capability activation evidence pack** required by §19A.
23. **Exact merchant and issuer role hierarchies** (`PAY-01`, `RWA-01`).
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
Review this 04_Role_And_Permission_Matrix_v1.2.md as a principal fintech platform architect and regulated fintech security reviewer.

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

This v1.2 keeps the substantive v1.1 corrections and only fixes Permission Dependency Rules subsection numbering. v1.1 added CLIENT_APPROVER, DPO, client-side dual authorization, complaints/dispute permissions, DSAR/privacy permissions, LP settlement payment approval, break-glass access, missing maker-checker rows, threshold/regulatory reporting permissions, deposit-address assignment, client-agreement publishing, and stricter third-party payout override gating.

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
