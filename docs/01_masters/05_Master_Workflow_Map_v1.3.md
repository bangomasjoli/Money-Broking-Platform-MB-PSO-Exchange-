---
document_id: ARC-05
title: Master Workflow Map
version: v1.3
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Cross-module workflow map
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: v1.0, v1.1, v1.2 (archived)
baseline_commit: 1618fdf
---

# 05 Master Workflow Map  
# AIX Institutional Digital Asset, Payment & RWA Platform

> ## v1.3 — RE-BASELINED ON APPROVED DOC 00 v1.5, CHARTER v1.5, MODULE INDEX v1.4, SRS v1.3 AND ROLE MATRIX v1.3
>
> **Base documents:** `00_..._v1.5`, `01_..._v1.5`, `03_..._v1.4` (37 modules), `02_..._v1.3`,
> `04_..._v1.3`, `DEC-011`, `DEC-012`, **`DEC-013`**, `STR-03`.
>
> **The rule this version introduces (§3.7).**
>
> > **A workflow whose production activation is unresolved is described in full and carries a
> > `PRODUCTION ACTIVATION GATE` step. It is not omitted.**
>
> v1.2 handled unresolved capability by **not having a workflow** — `WF-29` was a lock, not a
> flow. A workflow that does not exist cannot be built, tested or walked through in UAT, and the
> flows most in need of design review were the ones with no design (`STR-03` L-44).
>
> **What is added.** §3.7 the production activation gate step; **`WF-30`** AIX Pay merchant
> payment lifecycle; **`WF-31`** AIX RWA asset lifecycle; **`WF-32`** Exchange instrument
> admission and listing; **`WF-33`** Exchange trading; **`WF-34`** capability production
> activation; **`WF-35`** instrument classification. `WF-11` retitled and extended for the Model A
> client order lifecycle. `WF-29` replaced.
>
> **What does not change.** Every workflow, state, step and blocking condition in v1.2 is
> retained. Audit-first, maker-checker, segregation of duties, client-side dual authorization and
> money-movement integrity apply to every new workflow.
>
> **What has no workflow, permanently:** MB Spot internal client-to-client matching, an AIX order
> book for MB Spot, crossing or netting client orders, market making, principal dealing and AIX
> principal liquidity (§33.1). **There is no activation flow for them, because there is no
> approval that grants them.**
>
> **This document activates nothing and claims no approval AIX has not received.**

## Document Control

| Item | Details |
|---|---|
| Document name | 05_Master_Workflow_Map_v1.3.md |
| Platform | AIX Institutional Digital Asset, Payment & RWA Platform |
| Document type | SDLC Phase 2 / Master Workflow Control |
| Version | v1.3 |
| Status | **APPROVED** — re-baselined on Doc 00 v1.5, Charter v1.5, Module Index v1.4, SRS v1.3, Role Matrix v1.3 and `DEC-013` |
| Prepared for | Product, compliance, architecture, security, operations, finance, QA, and implementation planning |
| Base document 1 | 00_Licence_Scope_And_Feature_Lock_v1.5.md |
| Base document 2 | 01_Project_Charter_v1.5.md |
| Base document 3 | 03_Master_Module_Index_v1.4.md (37 modules) |
| Base document 4 | 02_Software_Requirement_Specification_v1.3.md |
| Base document 5 | 04_Role_And_Permission_Matrix_v1.3.md |
| Governing decisions | `DEC-011`, `DEC-012`, **`DEC-013`** |
| Supersedes | v1.2 (archived) |

---

## 1. Purpose

This document defines the master workflow map for the AIX Money Broking Platform.

The purpose is to convert the approved licence scope, SRS, module index, and role/permission matrix into controlled end-to-end workflows before module blueprint design and API design.

This document answers:

1. What are the main platform workflows?
2. What are the required workflow states?
3. Which role performs each workflow step?
4. Which steps require maker-checker?
5. Which steps require segregation-of-duties checks?
6. Which steps must be audit logged?
7. Which steps require client-side dual authorization?
8. Which steps require compliance review?
9. Which steps involve money movement, ledger posting, settlement, or reconciliation?
10. Which workflow paths are blocked because Exchange approval is pending?

---

## 2. Scope Baseline

This workflow map is based on the accepted platform boundary:

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

## 3. Workflow Design Principles

### 3.1 Default Deny

All workflows must fail closed.

A workflow cannot proceed if:

1. Required permission is missing.
2. Required feature flag is disabled.
3. Required client status is not met.
4. Required maker-checker approval is missing.
5. Required client-side approval is missing.
6. Required compliance approval is missing.
7. Required Travel Rule data is missing.
8. Required wallet screening is not clear.
9. Required balance hold fails.
10. Required DvP / settlement sequence is not satisfied.
11. A segregation-of-duties conflict is detected.
12. Workflow would breach licence lock.

### 3.2 Audit-First Workflow

Every workflow must create audit events for:

1. Creation.
2. Submission.
3. Review.
4. Approval.
5. Rejection.
6. State transition.
7. Exception.
8. Cancellation.
9. Reversal.
10. Export.
11. Override.
12. Break-glass access.

### 3.3 Maker-Checker

Maker-checker applies to all high-risk actions including:

1. Client approval.
2. Professional/accredited status approval.
3. Account freeze, suspension, restriction, or unfreeze.
4. Payout destination approval.
5. Withdrawal approval.
6. LP settlement payment.
7. Ledger reversal.
8. Settlement exception closure.
9. Reconciliation break closure.
10. Client-money safeguarding shortfall closure.
11. Vendor approval.
12. Asset/pair activation.
13. Feature flag change.
14. Role/permission change.
15. Production deployment.
16. Break-glass access.
17. Client offboarding approval.
18. Periodic KYC refresh closure where high-risk or overdue.

### 3.4 Segregation-of-Duties

The same user cannot create and approve the same sensitive action.

The workflow engine must check SoD before approval.

### 3.5 Client-Side Dual Authorization

For institutional and HNWI/professional clients:

1. Withdrawals above threshold require second client-side approval.
2. Large trades above threshold require second client-side approval.
3. Client initiator cannot approve the same action.
4. Client-side approval occurs before staff-side approval.
5. Client mandate rules override default threshold rules where configured.

### 3.6 Money-Movement Integrity

Money movement workflows must enforce:

1. Atomic balance and ledger operations.
2. No negative balance.
3. Hold cannot exceed available balance.
4. Pre-funded hold before LP execution.
5. No final client ledger credit before confirmed bank/custodian receipt where doing so creates exposure.
6. No LP payment before client-side control and DvP/safeguarded sequence checks pass.
7. Client money fully backed at all times.
8. Reconciliation and break management.

---

### 3.7 Production Activation Gate

**New in v1.3. `DEC-013` clauses 1–4; Doc 00 §21, §21A.**

> **Where a capability's production activation is unresolved, the workflow is described in full
> and carries a `PRODUCTION ACTIVATION GATE` step. The workflow is not removed.**

**Why.** A workflow that does not exist cannot be specified, implemented, tested, walked through
in UAT or reviewed by compliance. Omitting the flows whose regulatory position is unsettled means
the flows carrying the most regulatory risk get the least design scrutiny.

**Rules:**

1. **Every workflow reaching a production-gated capability carries an explicit
   `PRODUCTION ACTIVATION GATE` step**, placed where the capability would first take effect.
2. **In DEVELOPMENT, TEST, UAT and DEMO the gate evaluates the environment capability
   configuration**, and the workflow may proceed with mock, synthetic or non-live execution.
3. **In PRODUCTION the gate evaluates Doc 00 §21's conditions and fails closed** on unknown,
   unresolved, unreadable or absent state.
4. **The gate is a workflow step with its own state, its own audit event and its own error
   code** (§37 `PRODUCTION_ACTIVATION_GATE_CLOSED`). It is not an implicit precondition.
5. **Passing the gate in one environment never satisfies it in another.**
6. **A workflow that reaches a permanently prohibited capability does not exist** (§33). There is
   no gate, because there is nothing to gate.
7. **Every control step applies in every environment** — audit, maker-checker, segregation of
   duties, client-side dual authorization and money-movement integrity are never skipped for
   non-production convenience.

---

## 4. Master Workflow Groups

| Workflow Group | Name |
|---|---|
| WF-01 | Client Registration and Onboarding |
| WF-02 | Professional / Accredited Status Verification |
| WF-03 | KYC/KYB and Compliance Approval |
| WF-04 | Client Agreement and Consent |
| WF-05 | Product Access Approval |
| WF-06 | Payout Destination Whitelist |
| WF-07 | Fiat Deposit |
| WF-08 | Digital Asset Deposit |
| WF-09 | Withdrawal |
| WF-10 | OTC/RFQ |
| WF-11 | MB Spot Broking Terminal |
| WF-12 | LP Execution and Settlement |
| WF-13 | Ledger Posting and Reversal |
| WF-14 | Reconciliation and Break Management |
| WF-15 | Client-Money Safeguarding |
| WF-16 | Transaction Monitoring and AML Case |
| WF-17 | Travel Rule and Wallet Screening |
| WF-18 | Asset and Pair Approval |
| WF-19 | Vendor / LP / Custodian / Bank Approval |
| WF-20 | Reporting and Regulatory Filing |
| WF-21 | Complaints and Dispute |
| WF-22 | DSAR / Privacy |
| WF-23 | Admin Configuration and Feature Flags |
| WF-24 | User / Role / Permission Management |
| WF-25 | Break-Glass Access |
| WF-26 | Account Freeze / Suspension / Unfreeze |
| WF-27 | Client Offboarding / Account Closure |
| WF-28 | Periodic KYC Refresh and Sanctions Re-Screening |
| WF-29 | **Permanently Prohibited Capabilities — no workflow exists** *(replaced in v1.3)* |
| **WF-30** | **AIX Pay — Merchant Payment Lifecycle** *(new in v1.3)* |
| **WF-31** | **AIX RWA — Asset Lifecycle** *(new in v1.3)* |
| **WF-32** | **AIX Exchange — Instrument Admission and Listing** *(new in v1.3)* |
| **WF-33** | **AIX Exchange — Trading** *(new in v1.3)* |
| **WF-34** | **Capability Production Activation** *(new in v1.3)* |
| **WF-35** | **Instrument Classification** *(new in v1.3)* |

---

## 5. WF-01 Client Registration and Onboarding

### 5.1 Workflow Purpose

To allow eligible institutional and HNWI/professional clients to register, submit onboarding data, and enter compliance review.

Retail onboarding is disabled by default.

### 5.2 Primary Actors

| Step | Actor |
|---|---|
| Registration | Client Owner / Authorised Representative |
| Document submission | Client Owner / Client User |
| Initial review | Compliance Analyst |
| Final approval | Compliance Officer / MLRO |
| Support status view | Support Agent |

### 5.3 Workflow States

```txt
draft
submitted
under_review
more_info_required
resubmitted
approved
rejected
suspended
closed
```

### 5.4 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Client registers account | Client Owner | Email/MFA setup |
| 2 | Client selects client type | Client Owner | Retail disabled by default |
| 3 | Client completes profile | Client Owner | Validation |
| 4 | Client uploads documents | Client Owner / Client User | Secure document storage |
| 5 | Client submits onboarding | Client Owner | Audit log |
| 6 | Compliance reviews submission | Compliance Analyst | Sensitive read audit |
| 7 | Compliance requests more info or prepares decision | Compliance Analyst | Audit log |
| 8 | Compliance Officer approves/rejects | Compliance Officer / MLRO | Maker-checker where required |
| 9 | Client status updates | System | Backend status enforcement |
| 10 | Product access remains blocked until all gates complete | System | Default deny |

### 5.5 Blocking Conditions

The workflow must block if:

1. Retail client type is selected.
2. Required KYC/KYB fields are missing.
3. Required documents are missing.
4. Sanctions true match unresolved.
5. Professional/accredited status is not verified where required.
6. Client agreement is not accepted.
7. Compliance approval is missing.

---

## 6. WF-02 Professional / Accredited Status Verification

### 6.1 Workflow Purpose

To verify that the client is institutional, HNWI, or professional and eligible under MVP client-scope rules.

### 6.2 Workflow States

```txt
not_started
evidence_required
submitted
under_review
approved
rejected
expired
refresh_required
```

### 6.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Eligibility evidence requested | System / Compliance | Client type scope |
| 2 | Client uploads evidence | Client Owner | Secure document storage |
| 3 | Compliance reviews evidence | Compliance Analyst | Sensitive read audit |
| 4 | Compliance prepares decision | Compliance Analyst | Maker |
| 5 | Compliance Officer / MLRO approves | Compliance Officer / MLRO | Checker |
| 6 | System applies eligibility status | System | Product access gate |
| 7 | Refresh date scheduled where required | System | Periodic review |

### 6.4 Blocking Conditions

Transaction access must remain blocked if status is:

```txt
not_started
evidence_required
submitted
under_review
rejected
expired
refresh_required
```

---

## 7. WF-03 KYC/KYB and Compliance Approval

### 7.1 Workflow Purpose

To complete client due diligence and approve or reject the client.

### 7.2 Required Sub-Workflows

1. KYC/KYB review.
2. Beneficial ownership review.
3. SOF/SOW review.
4. Sanctions screening.
5. PEP screening.
6. Jurisdiction control.
7. AML risk scoring.
8. EDD where required.
9. Compliance decision log.

### 7.3 Workflow States

```txt
pending_review
screening_in_progress
edd_required
more_info_required
decision_pending
approved
rejected
suspended
frozen
```

### 7.4 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Screening triggered | System / Compliance | Vendor screening |
| 2 | AML risk score generated | System | Risk rules |
| 3 | Compliance reviews alerts | Compliance Analyst | Sensitive read audit |
| 4 | EDD initiated if required | Compliance Analyst | EDD workflow |
| 5 | Compliance decision prepared | Compliance Analyst | Maker |
| 6 | Compliance Officer / MLRO approves | Compliance Officer / MLRO | Checker |
| 7 | Client status updated | System | Backend enforcement |
| 8 | Product access remains blocked until Product Access Approval | System | Default deny |

### 7.5 Blocking Conditions

The workflow blocks if:

1. Sanctions match is unresolved.
2. PEP risk requires escalation.
3. High-risk jurisdiction is not approved.
4. EDD is required but incomplete.
5. SOF/SOW evidence is missing.
6. AML risk is unacceptable.
7. Compliance approval is missing.

---

## 8. WF-04 Client Agreement and Consent

### 8.1 Workflow Purpose

To capture agency terms, risk disclosure, privacy notice, and client consent.

### 8.2 Workflow States

```txt
not_published
published
accepted
reacceptance_required
expired
withdrawn
```

### 8.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Agreement version drafted | Compliance / Admin | Maker |
| 2 | Agreement version approved | Compliance Officer / MLRO | Checker |
| 3 | Agreement version published | Admin / Compliance | Maker-checker |
| 4 | Client reviews document | Client Owner | Sensitive action log |
| 5 | Client accepts agreement | Client Owner | Timestamp, IP, version |
| 6 | System stores consent record | System | Immutable consent record |
| 7 | Re-acceptance required if version changes | System | Product access gate |

### 8.4 Blocking Conditions

Product access is blocked if:

1. Required agreement is not accepted.
2. Required risk disclosure is not accepted.
3. Privacy notice consent is missing where required.
4. Agreement version is expired or withdrawn.

---

## 9. WF-05 Product Access Approval

### 9.1 Workflow Purpose

To approve client access to OTC/RFQ, MB Spot Broking, deposit, withdrawal, and reporting modules.

### 9.2 Workflow States

```txt
not_requested
pending_review
approved
rejected
suspended
revoked
```

### 9.3 Access Gates

Product access requires:

1. Client status approved.
2. Client type eligible.
3. Professional/accredited status verified.
4. KYC/KYB approved.
5. AML status acceptable.
6. Sanctions/PEP clear or resolved.
7. Required agreements accepted.
8. Product-specific limits configured.
9. Asset/pair eligibility configured.
10. Transaction monitoring active.

### 9.4 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Product access requested or triggered | Client / Compliance | Product flag |
| 2 | Eligibility gates checked | System | Backend guard |
| 3 | Compliance reviews product access | Compliance Analyst | Maker |
| 4 | Compliance Officer approves | Compliance Officer / MLRO | Checker |
| 5 | Product access flag activated | System | Audit log |
| 6 | Portal modules become visible | System | Backend still source of truth |

---

## 10. WF-06 Payout Destination Whitelist

### 10.1 Workflow Purpose

To register and verify client-owned bank accounts and crypto wallet addresses before withdrawal.

Third-party payout is prohibited by default.

### 10.2 Workflow States

```txt
draft
submitted
client_side_approval_required
client_side_approved
verification_pending
cooling_off
approved
rejected
suspended
deactivated
```

### 10.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Client submits payout destination | Client Owner / Client User | Client permission |
| 2 | System checks client-side dual authorization need | System | Client mandate/threshold |
| 3 | Client Approver approves destination addition if required | Client Approver | Client-side SoD |
| 4 | System checks destination type | System | Bank or wallet |
| 5 | Ownership evidence collected | Client | Own-name requirement |
| 6 | Wallet screening triggered where wallet | System | Blockchain analytics |
| 7 | Travel Rule linkage prepared where applicable | System | Travel Rule |
| 8 | Ops / Finance / Compliance reviews | Ops / Finance / Compliance | Maker |
| 9 | Checker approves | Ops Manager / Finance Manager / Compliance | Checker |
| 10 | Cooling-off period starts | System | Configured threshold |
| 11 | Destination becomes active after cooling-off | System | Audit log |
| 12 | Withdrawal can use destination only after cooling-off | System | Backend guard |

### 10.4 Blocking Conditions

The workflow blocks if:

1. Destination is not in client's own verified name.
2. Third-party payout is attempted.
3. Ownership evidence is missing.
4. Client-side approval is required but missing.
5. Wallet screening is high-risk and unresolved.
6. Travel Rule data is missing where required.
7. Cooling-off period has not passed.
8. Maker-checker approval is missing.

Error code:

```txt
THIRD_PARTY_PAYOUT_BLOCKED
PAYOUT_DESTINATION_NOT_VERIFIED
```

---

## 11. WF-07 Fiat Deposit

### 11.1 Workflow Purpose

To recognise fiat client money received into a safeguarded client-money account and credit client ledger only after bank confirmation.

### 11.2 Workflow States

```txt
notified
pending_bank_confirmation
unmatched
suspense_held
matched
compliance_hold
credited
rejected
returned
reversed
reconciliation_break
```

### 11.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Client submits deposit notice or bank import detects receipt | Client / System | Bank reference |
| 2 | Bank receipt confirmed | Finance / Ops | Bank statement evidence |
| 3 | Deposit matched to client if reference is valid | Ops / Finance | Maker |
| 4 | If unmatched, deposit routes to suspense / clearing account | System / Finance | Safeguarding control |
| 5 | Unmatched deposit investigated | Finance / Ops / Compliance | Evidence + AML review |
| 6 | Deposit matched to client or returned to verified source | Finance / Ops | Maker-checker |
| 7 | Compliance hold checked | System / Compliance | AML rules |
| 8 | Deposit approved for credit | Ops/Finance + Checker | Maker-checker |
| 9 | Ledger posts client money credit | Ledger Service | Double-entry |
| 10 | Client balance updates | System | Atomic ledger/balance |
| 11 | Reconciliation updated | System | Bank vs ledger |
| 12 | Safeguarding computation updates | System | Full-backing invariant |

### 11.4 Blocking Conditions

Final client ledger credit is blocked if:

1. Bank receipt is not confirmed.
2. Deposit is unmatched and investigation is incomplete.
3. Suspense / clearing account posting fails.
4. Return-to-source evidence is missing where deposit is returned.
5. AML/compliance hold exists.
6. Ledger posting fails.
7. Reconciliation rule fails.
8. Crediting would create incorrect safeguarding computation.

---

## 12. WF-08 Digital Asset Deposit

### 12.1 Workflow Purpose

To detect digital asset deposits through third-party custodian or approved infrastructure and credit client ledger only after custodian/on-chain confirmation and wallet screening.

### 12.2 Workflow States

```txt
address_assigned
detected
pending_confirmation
wallet_screening
unmatched
suspense_held
compliance_hold
confirmed
credited
rejected
returned
quarantined
reversed
reconciliation_break
```

### 12.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Deposit address assigned | Ops/Admin/System | Maker-checker where required |
| 2 | Deposit detected | Custodian / Node Provider | Vendor integration |
| 3 | On-chain confirmations monitored | System | Confirmation threshold |
| 4 | Wallet screening performed | System / Vendor | Blockchain analytics |
| 5 | Compliance disposition applied | Compliance | Approve/hold/quarantine/reject |
| 6 | If client cannot be identified, deposit routes to suspense / clearing account | System / Finance | Safeguarding control |
| 7 | Unmatched deposit investigated and matched or returned to verified source where possible | Finance / Ops / Compliance | Evidence + AML review |
| 8 | Custodian receipt confirmed | System | Custodian evidence |
| 9 | Digital deposit credit approved | Ops/Finance + Compliance where required | Maker-checker |
| 10 | Ledger credit posted | Ledger Service | Double-entry |
| 11 | Client balance updated | System | Atomic ledger/balance |
| 12 | Reconciliation updated | System | Custodian vs ledger |

### 12.4 Blocking Conditions

Deposit credit is blocked if:

1. Deposit address is not approved.
2. Confirmation threshold is not met.
3. Wallet screening is high-risk and unresolved.
4. Deposit is unmatched and investigation is incomplete.
5. Suspense / clearing account posting fails.
6. Return-to-source evidence is missing where deposit is returned.
7. Custodian receipt is not confirmed.
8. Digital deposit credit maker-checker is incomplete.
9. Compliance hold is active.
10. Ledger posting fails.

---

## 13. WF-09 Withdrawal

### 13.1 Workflow Purpose

To process fiat or digital asset withdrawal only to verified client-owned payout destinations with client-side approval, compliance checks, maker-checker, and balance control.

### 13.2 Workflow States

```txt
draft
submitted
client_side_approval_required
client_side_approved
screening
compliance_review
ops_review
finance_review
approved
held
released
completed
rejected
failed
reversed
```

### 13.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Client submits withdrawal | Client Owner / Client User | Permission |
| 2 | System validates client status | System | Product access gate |
| 3 | System validates payout destination | System | Own-name whitelist |
| 4 | System checks client-side dual approval need | System | Mandate/threshold |
| 5 | Client Approver approves if required | Client Approver | Client-side SoD |
| 6 | Available balance checked | System | Atomic balance check |
| 7 | Withdrawal hold created | Ledger Service | Atomic hold |
| 8 | Travel Rule and wallet screening performed where required | System / Compliance | Compliance gate |
| 9 | Transaction monitoring checks | System | AML gate |
| 10 | Ops / Finance reviews withdrawal | Ops / Finance | Maker |
| 11 | Compliance reviews if high-risk | Compliance / MLRO | Compliance gate |
| 12 | Checker approves | Ops Manager / Finance Manager / Compliance | Checker |
| 13 | Bank/custodian release initiated | Ops / Finance / System | Approved destination |
| 14 | Ledger updates settlement status | Ledger Service | Double-entry |
| 15 | Reconciliation updates | System | Bank/custodian vs ledger |
| 16 | Client notified | System | Notification |

### 13.4 Blocking Conditions

Withdrawal blocks if:

1. Client is not approved.
2. Client is frozen or suspended.
3. Destination is not verified.
4. Destination is third-party.
5. Client-side approval is required but missing.
6. Balance is insufficient.
7. Hold creation fails.
8. Travel Rule data is missing.
9. Wallet screening unresolved.
10. AML risk unacceptable.
11. Maker-checker incomplete.
12. SoD conflict detected.

---

## 14. WF-10 OTC/RFQ

### 14.1 Workflow Purpose

To support agency-only OTC/RFQ using LP-derived pricing and disclosed brokerage fee.

### 14.2 Workflow States

```txt
requested
under_review
priced
issued
client_side_approval_required
accepted
expired
rejected
requote_required
failed
booked
settlement_pending
settled
cancelled
```

### 14.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Client submits RFQ | Client Owner / Client User | Product access gate |
| 2 | Eligibility gates checked | System | Compliance/product/access |
| 3 | Pre-trade risk checks run | System | AML/limits |
| 4 | LP price requested | Ops/System | LP adapter |
| 5 | Quote prepared from LP price + disclosed fee | Ops/System | No manual markup |
| 6 | Best-execution check performed | System | Tolerance |
| 7 | Quote issued to client | Ops/System | Server UTC expiry |
| 8 | Client accepts quote | Client | Confirmation |
| 9 | Client-side approval required if large trade | System | Mandate/threshold |
| 10 | Client Approver approves if required | Client Approver | Client-side SoD |
| 11 | Pre-funded hold created | Ledger Service | Atomic hold |
| 12 | LP execution fires only after hold | System | Agency control |
| 13 | LP execution result recorded | System | LP reference |
| 14 | Trade booked | System | Audit + idempotency |
| 15 | Settlement workflow starts | System | DvP sequence |

### 14.4 Blocking Conditions

OTC/RFQ blocks if:

1. Client not approved.
2. Product access missing.
3. Asset/pair not approved.
4. Quote expired.
5. Best-execution check fails.
6. Client-side approval missing where required.
7. Pre-funded hold fails.
8. LP unavailable.
9. LP slippage beyond tolerance.
10. Workflow would create AIX principal exposure.

---

## 15. WF-11 AIX Spot — Client Order and Execution

> **v1.3: retitled from "MB Spot Broking Terminal"** (Doc 00 §2A). The quote-and-confirm states
> and steps below are **retained** and remain valid. §15.6 adds the **Model A client order
> lifecycle** (`DEC-012`; SRS `SPT-SRS-*`), which is the normative flow where the two differ.

### 15.1 Workflow Purpose

To provide institutional Spot execution **as intermediary**, through a client order store and
external execution routing — **without** an AIX order book, matching engine or client-to-client
matching, in any environment.

### 15.2 Workflow States

```txt
quote_requested
quote_priced
quote_issued
client_side_approval_required
quote_accepted
quote_expired
quote_rejected
requote_required
lp_execution_pending
lp_executed
trade_booked
settlement_pending
settled
failed
cancelled
```

### 15.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Client requests spot quote | Client | Product access gate |
| 2 | Eligibility gates checked | System | KYC/AML/product |
| 3 | LP indicative price pulled | System | LP adapter |
| 4 | Quote created with disclosed fee | System | No spread markup |
| 5 | Quote displayed to client | System | Not order book |
| 6 | Client confirms quote | Client | Confirmation |
| 7 | Client-side approval required if large trade | System | Mandate/threshold |
| 8 | Client Approver approves if required | Client Approver | Client-side SoD |
| 9 | Pre-funded hold created | Ledger Service | Atomic hold |
| 10 | LP execution triggered | System | Only after hold |
| 11 | LP result received | System | LP reference |
| 12 | Partial fill/slippage evaluated | System | Void/re-quote |
| 13 | Trade booked | System | Ledger + audit |
| 14 | Settlement workflow starts | System | DvP |

### 15.4 Prohibited Paths

The workflow must not include, **in any environment**:

1. Client-to-client matching, crossing, netting or internalisation.
2. An AIX order book holding **mutually executable** client orders.
3. A matching engine for MB Spot.
4. Any call into an Exchange-domain module (`EXO-01`, `EXM-01`, `EXC-01`, `EXP-01`).
5. Market making.
6. Maker/taker fees.
7. AIX spread markup.
8. Principal execution or AIX principal liquidity.
9. Admission of an instrument classified `SECURITY / SECURITY TOKEN`.

**v1.3 correction to item 2 of v1.2's list.** v1.2 prohibited *"resting orders"* outright. Doc 00
§6 reclassified this: under Model A a client order **held in AIX's own order store and routed
externally** is not exchange behaviour, and LFSA-DMB-2025 ¶6.4(i) expressly requires a control
for the cancellation of **unexecuted** orders. What remains prohibited is an order resting in a
book where it is **mutually executable against another client's order** — which is item 2 as now
written. **This narrows a word, not a prohibition.**

### 15.5 Production Activation Gate

| Capability | Gate |
|---|---|
| Market, Limit, Cancel order types | Product-rule review (Doc 00 §11B) |
| Stop, Stop-Limit, IOC, FOK, GTC | `R3-Q3` — implementable behind product/configuration gates |
| Execution against displayed depth | `R3-Q2b` |
| Multi-venue smart routing (Model B) | Per-venue, Doc 00 §7A incl. seven-day prior notification |
| Any specific external venue | `R3-Q6` |

**In DEVELOPMENT / TEST / UAT / DEMO** this workflow runs against **mock venues** with no live
execution.

### 15.6 Model A Client Order Lifecycle

**New in v1.3.** `DEC-012`; SRS `SPT-SRS-001`…`SPT-SRS-018`; modules `OMS-01`, `MKD-01`,
`LQD-01`, `EXE-01`, `TRD-01`, `SUR-01`.

**States:**

```txt
order_draft
order_submitted
pre_trade_checks_pending
pre_trade_rejected
order_accepted
order_open                  (unexecuted, cancellable — LFSA-DMB-2025 ¶6.4(i))
order_routing
order_partially_filled
order_filled
order_cancel_requested
order_cancelled
order_expired
order_rejected
settlement_pending
settled
failed
```

**Steps:**

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Client submits an order (Market / Limit / Cancel) | `CLIENT_TRADER` | Product access gate; subaccount scope |
| 2 | Capability evaluation | `CFG-01` | Permission AND environment AND product AND instrument eligibility AND production gate (§3.7) |
| 3 | Instrument eligibility checked | `AST-01` | **Securities-classified instruments refused** |
| 4 | Automated pre-trade controls | `OMS-01` | Price/quantity thresholds; suspicious-order detection and blocking (¶6.4) |
| 5 | Sufficient-funds check | `LED-01` | ¶5.2 — before execution |
| 6 | Order recorded in the client order store | `OMS-01` | ¶5.5; **never mutually executable against another client's order** |
| 7 | Order visible as open and **cancellable** | `OMS-01` | ¶6.4(i) |
| 8 | Client-side approval if above threshold | `CLIENT_APPROVER` | Client-side SoD |
| 9 | Pre-funded hold created | `LED-01` | Atomic hold |
| 10 | Execution policy evaluated | `EXE-01` | Price, depth, fees, slippage, venue health, exposure, settlement capability, regulatory eligibility, availability. **"Lowest price wins" prohibited** |
| 11 | Routed to an approved external venue | `LQD-01` → venue adapter | Venue approved, due-diligenced, **notification-complete** |
| 12 | Fills received, possibly partial or split | `TRD-01` | Fill conservation; each client fill binds to a distinct external venue fill |
| 13 | Routing decision evidence recorded | `EXE-01` | **Reconstructable and disclosable** (¶9.7(i), ¶9.5) |
| 14 | Trade booked | `TRD-01` | Ledger + audit |
| 15 | Surveillance evaluates order and trade | `SUR-01` | Post-trade monitoring |
| 16 | Settlement workflow starts | `LED-01` | DvP — `WF-12` |
| 17 | Records retained ≥ 6 years | `SEC-01`, `RPT-01` | ¶5.12 |

**Cancellation path:** `order_open` → `order_cancel_requested` → `order_cancelled`, with the
hold released atomically. **Cancellation of an unexecuted order must always be available**
(¶6.4(i)) and must never be blocked by a capability gate.

---

## 16. WF-12 LP Execution and Settlement

### 16.1 Workflow Purpose

To execute LP-backed agency trades while preventing AIX principal exposure.

### 16.2 Workflow States

```txt
ready_for_lp_execution
prefunded_hold_confirmed
lp_execution_requested
lp_executed
lp_partial_fill
lp_failed
requote_required
trade_booked
lp_payment_pending
lp_payment_approved
settlement_pending
settled
failed
reversed
```

### 16.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Pre-funded hold confirmed | System | Required before LP |
| 2 | LP execution requested | System | LP adapter |
| 3 | LP response received | System | LP reference |
| 4 | Slippage/partial fill checked | System | Void/re-quote |
| 5 | Trade booked if valid | System | Ledger + audit |
| 6 | Settlement sequence determined | System | DvP rules |
| 7 | LP settlement payment prepared | Ops/Finance | Maker |
| 8 | LP settlement payment approved | Finance Manager / Ops Manager | Checker |
| 9 | LP payment released only if client-side control satisfied | System/Ops/Finance | DvP/safeguarding |
| 10 | Settlement evidence recorded | System | Bank/custodian/LP |
| 11 | Reconciliation updated | System | Three-way reconciliation |
| 12 | Settlement complete | Ops/Finance | Maker-checker where required |

### 16.4 Blocking Conditions

LP settlement payment is blocked if:

1. Pre-funded hold is missing.
2. Client-side control is not confirmed.
3. DvP/safeguarded sequence is not satisfied.
4. LP execution reference missing.
5. Client ledger state invalid.
6. Settlement evidence missing.
7. Maker-checker incomplete.
8. Payment would create AIX principal exposure.

---

## 17. WF-13 Ledger Posting and Reversal

### 17.1 Workflow Purpose

To ensure every financial movement is posted through immutable double-entry ledger with controlled reversal.

### 17.2 Workflow States

```txt
posting_requested
validated
posted
posting_failed
reversal_requested
reversal_review
reversed
reversal_rejected
```

### 17.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Source event requests ledger posting | System | Idempotency |
| 2 | Ledger validates debit/credit | Ledger Service | Double-entry |
| 3 | Balance and ledger operation runs atomically | Ledger Service | Row lock/serializable |
| 4 | Posting committed | Ledger Service | Immutable entry |
| 5 | Trial balance checked | System | Invariant |
| 6 | Reversal requested if needed | Ops/Finance | Maker |
| 7 | Reversal reviewed | Finance Manager / Ops Manager | Checker |
| 8 | Reversing entry posted | Ledger Service | No deletion |
| 9 | Audit trail updated | Audit Service | Append-only |

### 17.4 Blocking Conditions

Ledger posting blocks if:

1. Debit and credit do not balance.
2. Idempotency conflict exists.
3. Concurrent balance conflict exists.
4. Hold exceeds available balance.
5. Posting would create negative balance.
6. Source workflow state is invalid.

---

## 18. WF-14 Reconciliation and Break Management

### 18.1 Workflow Purpose

To reconcile ledger against bank, custodian, and LP records and manage breaks.

### 18.2 Workflow States

```txt
scheduled
running
matched
break_detected
assigned
under_investigation
resolved
escalated
closed
reopened
```

### 18.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Reconciliation run starts | System / Finance | Schedule/manual |
| 2 | Bank/custodian/LP records imported | System | Vendor data |
| 3 | Ledger compared | System | Matching rules |
| 4 | Break detected if mismatch | System | Alert |
| 5 | Break assigned | Finance Officer | Owner |
| 6 | Investigation evidence added | Finance/Ops | Audit |
| 7 | Compliance involved if AML/client impact | Compliance | Compliance review |
| 8 | Resolution proposed | Finance Officer | Maker |
| 9 | Finance Manager approves closure | Finance Manager | Checker |
| 10 | Reversal or adjustment workflow triggered if needed | Ledger Service | Controlled reversal |
| 11 | Report updated | System | Audit |

### 18.4 Blocking Conditions

Break closure blocks if:

1. No owner.
2. No evidence.
3. No resolution reason.
4. Required checker missing.
5. Compliance impact not reviewed.
6. Ledger adjustment lacks reversal workflow.

---

## 19. WF-15 Client-Money Safeguarding

### 19.1 Workflow Purpose

To ensure client money liabilities are fully backed by safeguarded resources.

### 19.2 Workflow States

```txt
scheduled
calculated
balanced
shortfall_detected
investigating
remediation_required
remediated
closed
escalated
```

### 19.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Safeguarding computation runs | System / Finance | Daily requirement |
| 2 | Client money liability computed | System | Ledger |
| 3 | Safeguarded resources computed | System | Bank/custodian |
| 4 | Full-backing invariant checked | System | No shortfall |
| 5 | Shortfall alert created if mismatch | System | High severity |
| 6 | Finance investigates | Finance Officer | Maker |
| 7 | Compliance notified | Compliance | Oversight |
| 8 | Remediation/top-up workflow initiated | Finance Manager / Management | Approval |
| 9 | Shortfall closure approved | Finance Manager + Compliance | Checker |
| 10 | Report retained | System | Audit |

### 19.4 Blocking Conditions

Shortfall closure blocks if:

1. Client money resources do not fully back liabilities.
2. Investigation evidence missing.
3. Remediation not documented.
4. Finance Manager approval missing.
5. Compliance awareness missing.

---

## 20. WF-16 Transaction Monitoring and AML Case

### 20.1 Workflow Purpose

To monitor transactions and escalate suspicious activity to AML case workflow.

### 20.2 Workflow States

```txt
rule_active
alert_generated
alert_triage
case_opened
under_investigation
escalated
request_info
closed_no_issue
closed_suspicious
filed
```

### 20.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Transaction monitoring rule runs | System | AML rules |
| 2 | Alert generated | System | Severity |
| 3 | Compliance triages alert | Compliance Analyst | Sensitive read audit |
| 4 | AML case opened if needed | Compliance Analyst | Case workflow |
| 5 | Investigation performed | Compliance | Evidence |
| 6 | Escalation to MLRO if suspicious | Compliance Officer | Maker |
| 7 | MLRO decides STR workflow | MLRO | Checker/senior |
| 8 | Case closed or filed | Compliance/MLRO | Audit |
| 9 | Account freeze/suspension triggered if required | Compliance | Maker-checker |

### 20.4 Blocking Conditions

Alert/case closure blocks if:

1. No closure reason.
2. Required evidence missing.
3. High-risk case lacks senior approval.
4. STR decision not recorded where suspicious.
5. SoD conflict exists.

---

## 21. WF-17 Travel Rule and Wallet Screening

### 21.1 Workflow Purpose

To capture required transfer data and screen wallets before digital asset transfers.

### 21.2 Workflow States

```txt
data_required
data_submitted
screening_pending
review_required
approved
blocked
exception_requested
exception_approved
rejected
```

### 21.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Transfer triggers Travel Rule check | System | Threshold/config |
| 2 | Originator/beneficiary data captured | Client/System | Validation |
| 3 | Counterparty VASP checked | System/Compliance | VASP DD |
| 4 | Wallet screening runs | Vendor/System | Blockchain analytics |
| 5 | Compliance reviews exceptions/high risk | Compliance | Maker |
| 6 | Compliance Officer/MLRO approves exception | Compliance Officer/MLRO | Checker |
| 7 | Transfer allowed or blocked | System | Backend enforcement |
| 8 | Evidence retained | System | Retention |

### 21.4 Blocking Conditions

Transfer blocks if:

1. Required Travel Rule data missing.
2. Counterparty VASP not approved where required.
3. Wallet screening high-risk unresolved.
4. Self-hosted wallet rule not satisfied.
5. Compliance exception approval missing.

---

## 22. WF-18 Asset and Pair Approval

### 22.1 Workflow Purpose

To approve assets and pairs for broking while enforcing prohibited asset categories.

### 22.2 Workflow States

```txt
draft
compliance_review
approved
configured
activated
rejected
suspended
deactivated
```

### 22.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Asset/pair record created | Admin/Ops | Maker |
| 2 | Compliance admissibility review | Compliance | CMP review |
| 3 | Compliance approval | Compliance Officer/MLRO | Checker |
| 4 | Technical configuration | Admin | AST enforcement |
| 5 | Pair limits and fees configured | Admin/Finance | Maker-checker |
| 6 | Activation approved | Super Admin + domain checkers | Maker-checker |
| 7 | Feature flag / product gate updated | System/Admin | Licence lock |
| 8 | Audit log updated | Audit Service | Append-only |

### 22.4 Blocking Conditions

Activation blocks if:

1. Asset is not compliance-approved.
2. Pair uses unapproved asset.
3. Privacy coin rule triggered.
4. Algorithmic stablecoin rule triggered.
5. Securities token rule triggered.
6. MYR pair lock triggered.
7. Maker-checker missing.
8. Feature flag disabled.

---

## 23. WF-19 Vendor / LP / Custodian / Bank Approval

### 23.1 Workflow Purpose

To approve vendors and external providers before production use.

### 23.2 Workflow States

```txt
draft
due_diligence
security_review
compliance_review
finance_review
management_review
approved
rejected
suspended
terminated
```

### 23.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Vendor record created | Admin/Domain Owner | Maker |
| 2 | DD documents uploaded | Domain Owner | Evidence |
| 3 | Security review | Security Admin | Security gate |
| 4 | Compliance review | Compliance Officer/MLRO | Compliance gate |
| 5 | Finance/Ops review if money-critical | Finance/Ops | Money gate |
| 6 | Management approval if critical vendor | Management | Final approval |
| 7 | API secrets stored in KMS/vault | Security/Tech | No plaintext view |
| 8 | Vendor activated | Admin/Super Admin | Maker-checker |
| 9 | Exit plan recorded | Domain Owner | Vendor governance |
| 10 | If custodian exit is triggered, asset migration / client asset return plan is opened | Ops / Finance / Compliance / Custodian | Custody exit control |

### 23.4 Blocking Conditions

Vendor activation blocks if:

1. DD incomplete.
2. Contract/SLA missing.
3. Security review missing.
4. Compliance review missing.
5. Finance/Ops review missing for money-critical vendor.
6. Exit plan missing.
7. Outsourcing/regulatory notification unresolved where required.
8. Custody exit / asset migration plan missing where custodian is suspended, terminated, or replaced.

---

## 24. WF-20 Reporting and Regulatory Filing

### 24.1 Workflow Purpose

To produce internal, management, client, compliance, and regulatory reports.

### 24.2 Workflow States

```txt
draft
generated
under_review
approved
submitted
exported
rejected
archived
```

### 24.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Report generated | System / Domain Owner | Permission |
| 2 | Sensitive data minimised | System | Data classification |
| 3 | Report reviewed | Domain Owner | Maker |
| 4 | Compliance/MLRO approves regulatory report | Compliance/MLRO | Checker |
| 5 | Management approves where required | Management | Final approval |
| 6 | Report submitted/exported | Authorised user | Audit log |
| 7 | Report archived | System | Retention |

### 24.4 Blocking Conditions

Report submission/export blocks if:

1. User lacks permission.
2. Sensitive export approval missing.
3. STR/AML export is not approval-gated.
4. Regulatory report lacks MLRO/management approval.
5. Retention rule not applied.

---

## 25. WF-21 Complaints and Dispute

### 25.1 Workflow Purpose

To capture, investigate, resolve, and report complaints or disputes.

### 25.2 Workflow States

```txt
submitted
acknowledged
assigned
under_review
waiting_client_response
resolved
closed
escalated
reopened
```

### 25.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Complaint submitted | Client/Support | Case record |
| 2 | Complaint acknowledged | Support/Compliance | Timestamp |
| 3 | Owner assigned | Support/Compliance | Maker |
| 4 | Investigation performed | Owner | Evidence |
| 5 | Compliance involved if regulated issue | Compliance | Oversight |
| 6 | Resolution proposed | Owner | Maker |
| 7 | Resolution approved | Compliance/Management where required | Checker |
| 8 | Complaint closed | Owner/Checker | SoD check |
| 9 | Report retained | System | Records retention |

### 25.4 Blocking Conditions

Complaint closure blocks if:

1. No owner.
2. No resolution.
3. Complaint owner tries to close own complaint without oversight.
4. Regulated issue lacks compliance review.
5. Required evidence missing.

---

## 26. WF-22 DSAR / Privacy

### 26.1 Workflow Purpose

To handle data-subject-rights and privacy requests under approved privacy and retention rules.

### 26.2 Workflow States

```txt
submitted
identity_verification
under_review
retention_conflict_review
approved
rejected
response_prepared
response_approved
closed
```

### 26.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Privacy/DSAR request submitted | Client/Support | Case record |
| 2 | Identity verified | DPO/Compliance | Verification |
| 3 | Data inventory reviewed | DPO | Privacy control |
| 4 | Retention/legal conflict checked | DPO/Compliance | AML/Travel Rule retention |
| 5 | Response prepared | DPO | Maker |
| 6 | Response approved | DPO + Compliance/Management where needed | Checker |
| 7 | Response exported/released | DPO | Audit log |
| 8 | Request closed | DPO | Audit |

### 26.4 Blocking Conditions

DSAR response blocks if:

1. Identity not verified.
2. Retention/legal conflict unresolved.
3. Sensitive export approval missing.
4. DPO approval missing.
5. Required audit log missing.

---

## 27. WF-23 Admin Configuration and Feature Flags

### 27.1 Workflow Purpose

To control configuration changes, feature flags, and licence locks.

### 27.2 Workflow States

```txt
draft
submitted
domain_review
approved
rejected
applied
rolled_back
```

### 27.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Config change drafted | Admin | Maker |
| 2 | Domain checker assigned | System | Impact area |
| 3 | Compliance/Finance/Ops/Security review where required | Domain Checker | Checker |
| 4 | Super Admin approval | Super Admin | Checker |
| 5 | Change applied | System/Admin | Audit |
| 6 | Rollback plan recorded for high-risk change | Admin | Safety |
| 7 | Post-change verification | Domain Owner | Evidence |

### 27.4 Blocking Conditions

Configuration change blocks if:

1. Feature flag disabled.
2. Licence lock breached.
3. Maker-checker missing.
4. Domain checker missing.
5. Super Admin self-approval attempted.
6. Change would enable a permanently prohibited capability (`WF-29` §33.1), or would activate a production-gated capability without `WF-34`. *(v1.3: widened.)*

---

## 28. WF-24 User / Role / Permission Management

### 28.1 Workflow Purpose

To manage staff users, roles, permissions, MFA, and access rights.

### 28.2 Workflow States

```txt
draft
submitted
security_review
approved
rejected
applied
revoked
```

### 28.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | User/role change requested | Admin/Security | Maker |
| 2 | Security review | Security Admin | Checker |
| 3 | Super Admin approval if high-risk | Super Admin | Checker |
| 4 | Change applied | System | Audit |
| 5 | User notified where required | System | Notification |
| 6 | Access reviewed periodically | Security/Admin | Access review |

### 28.4 Blocking Conditions

Role/permission change blocks if:

1. User changes own permission.
2. Maker-checker missing.
3. Security review missing.
4. Change grants prohibited permission.
5. Change enables licence-locked action.

---

## 29. WF-25 Break-Glass Access

### 29.1 Workflow Purpose

To allow controlled emergency access without informal secret-sharing or standing over-permissioning.

### 29.2 Workflow States

```txt
requested
approved
active
expired
revoked
under_review
closed
```

### 29.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Break-glass requested | Security/Tech/Super Admin | Reason required |
| 2 | Senior approval granted | Security/Admin/Management | Checker |
| 3 | Access time-boxed | System | Expiry |
| 4 | Automatic alerts sent | System | Security/Management/Compliance |
| 5 | Emergency access used | Named user | Heightened audit |
| 6 | Access revoked or expires | System/Security | Time-box |
| 7 | Post-incident review completed | Security/Management | Mandatory |
| 8 | Incident record closed | Security/Management | Evidence |

### 29.4 Blocking Conditions

Break-glass blocks if:

1. Request reason missing.
2. Grantor is same as recipient.
3. Expiry not defined.
4. Audit logging unavailable.
5. Request attempts to bypass licence lock.
6. Request attempts to reach a permanently prohibited capability (`WF-29` §33.1). **Break-glass grants emergency access, never emergency activation** (`WF-34`). *(v1.3: widened.)*

---

## 30. WF-26 Account Freeze / Suspension / Unfreeze

### 30.1 Workflow Purpose

To provide a first-class compliance and money-control workflow for freezing, suspending, restricting, or unfreezing client accounts independently of AML cases.

### 30.2 Trigger Sources

Freeze, suspension, or restriction may be triggered by:

1. Sanctions hit.
2. PEP / high-risk escalation.
3. AML case.
4. Transaction monitoring alert.
5. Wallet screening high-risk exposure.
6. Court order.
7. Regulatory directive.
8. Fraud or account-takeover alert.
9. Client-money safeguarding shortfall.
10. Operational incident.
11. Break-glass incident review.
12. Manual compliance decision.

### 30.3 Workflow States

```txt
requested
under_review
active_full_freeze
active_partial_restriction
active_suspension
lift_requested
lift_under_review
lifted
rejected
expired
closed
```

### 30.4 Freeze / Restriction Scope

The workflow must support scope-level controls:

```txt
login_block
trade_block
deposit_block
withdrawal_block
payout_destination_block
report_only_access
full_account_freeze
```

### 30.5 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Freeze/suspension request created | Compliance/System/Ops/Finance | Trigger source |
| 2 | Scope and reason defined | Compliance | Required reason |
| 3 | Effective time defined | Compliance | Immediate or scheduled |
| 4 | Maker submits request | Compliance Analyst / Officer | Maker |
| 5 | Checker approves | Compliance Officer / MLRO | Checker |
| 6 | System applies restriction | System | Backend enforcement |
| 7 | Affected workflows blocked according to scope | System | Default deny |
| 8 | Notification issued where permitted | System/Compliance | Confidentiality control |
| 9 | Lift request created when issue resolved | Compliance | Maker |
| 10 | Lift approved | Compliance Officer / MLRO | Checker |
| 11 | System removes restriction | System | Audit log |

### 30.6 Blocking Conditions

Freeze/unfreeze workflow blocks if:

1. Reason is missing.
2. Scope is missing.
3. Maker-checker incomplete.
4. SoD conflict detected.
5. Lift requested without resolution evidence.
6. Regulatory or court restriction still active.

---

## 31. WF-27 Client Offboarding / Account Closure

### 31.1 Workflow Purpose

To close client accounts safely without stranding client money, open positions, unresolved settlements, or regulated records.

### 31.2 Workflow States

```txt
closure_requested
under_review
closure_blocked
position_closeout_required
balance_return_required
records_retention_applied
approved_for_closure
closed
rejected
```

### 31.3 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Closure requested | Client / Compliance / Management | Request reason |
| 2 | Client status and obligations checked | System | Open workflow scan |
| 3 | Open trades, holds, withdrawals, settlements checked | System | No stranded money |
| 4 | Remaining client balance identified | Finance | Ledger evidence |
| 5 | Balance returned only to verified own-name payout destination | Finance/Ops | Payout whitelist |
| 6 | Product access revoked | System/Compliance | Backend gate |
| 7 | Payout destinations deactivated | System/Ops | Audit |
| 8 | Records retention policy applied | System/DPO/Compliance | Retention |
| 9 | Closure prepared | Compliance/Finance | Maker |
| 10 | Closure approved | Compliance Officer / Finance Manager / Management where required | Checker |
| 11 | Account closed | System | Audit log |

### 31.4 Blocking Conditions

Client closure blocks if:

1. Available, pending, held, or frozen balance remains.
2. Open trade exists.
3. Open settlement exists.
4. Open withdrawal exists.
5. Reconciliation break unresolved.
6. AML/STR restriction prevents closure.
7. Balance return destination is not verified in client's own name.
8. Retention requirements are not applied.
9. Maker-checker incomplete.

---

## 32. WF-28 Periodic KYC Refresh and Sanctions Re-Screening

### 32.1 Workflow Purpose

To maintain ongoing AML monitoring after onboarding.

### 32.2 Trigger Sources

This workflow may be triggered by:

1. Risk-based periodic review schedule.
2. Sanctions-list update.
3. PEP-list update.
4. Material client profile change.
5. Large or unusual transaction.
6. Wallet screening escalation.
7. Regulatory request.
8. Manual compliance review.

### 32.3 Workflow States

```txt
scheduled
due
screening_running
refresh_required
under_review
more_info_required
approved
restricted
suspended
completed
overdue
```

### 32.4 Workflow Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Review scheduled by risk profile | System | Risk-based schedule |
| 2 | Re-screening runs on list update | System / Vendor | Screening vendor |
| 3 | Refresh due notice issued | System/Compliance | Notification |
| 4 | Client submits updated information where required | Client | Document workflow |
| 5 | Compliance reviews refresh | Compliance Analyst | Sensitive read audit |
| 6 | Compliance decision prepared | Compliance Analyst | Maker |
| 7 | Compliance Officer / MLRO approves | Compliance Officer / MLRO | Checker |
| 8 | If overdue or adverse result, product access restricted | System/Compliance | Product access revocation |
| 9 | If unresolved high-risk issue, account suspended or frozen | Compliance | Freeze workflow |
| 10 | Review completed | System | Audit |

### 32.5 Blocking Conditions

Periodic review blocks continued transaction access if:

1. Refresh is overdue.
2. Updated KYC/KYB evidence is missing.
3. Sanctions match unresolved.
4. PEP/high-risk escalation unresolved.
5. EDD required but incomplete.
6. Compliance approval missing.


---

## 33. WF-29 Permanently Prohibited Capabilities — No Workflow Exists

**Replaced in v1.3.** v1.2's `WF-29` was a lock presented as a workflow. It mixed capabilities
that must never exist with order types Doc 00 §6 has since reclassified, and its thirteen-step
"future activation" procedure implied that an Exchange approval could unlock client-to-client
matching. **Doc 00 §6 classifies those as standing prohibitions that no approval lifts.**

### 33.1 Capabilities with no workflow, permanently

```txt
AIX order book for MB Spot
Matching engine for MB Spot
AIX-operated market depth presented as an AIX market
AIX-operated public exchange trading for digital currency
Client-to-client matching / crossing / netting / internalisation
Public market API for an AIX-operated market
Market maker engine
Maker/taker fee engine
Principal dealing / proprietary trading / AIX principal liquidity
Reaching an Exchange-domain module from an MB-domain path
```

### 33.2 Workflow rule

**There is no workflow for these, and no activation procedure exists for them.**

This is not "no workflow yet". Lifting any of them would require a **different licence basis and
a new licence-scope revision** (Doc 00 §6), not a feature activation, a documentation update or
an Exchange approval. The thirteen-step activation list in v1.2 §33.3 is therefore **removed as
misleading**, not as a relaxation.

### 33.3 Blocking conditions — absolute

Any attempt to reach a §33.1 capability blocks unconditionally:

1. In **every** environment — DEVELOPMENT, TEST, UAT, DEMO and PRODUCTION.
2. For **every** role, including `SUPER_ADMIN` (Role Matrix §22.1).
3. Under **every** configuration, feature flag, capability state, service domain and environment value.
4. Through **every** path, including break-glass (Role Matrix §20 rule 9).
5. Regardless of any Exchange approval, of any scope.

Error code: `LICENCE_SCOPE_BLOCKED` / `EXCHANGE_MODULE_LOCKED` (§37).

### 33.4 What is NOT in this section

**These have workflows** and are described in full below: AIX Exchange (`WF-32`, `WF-33`), AIX
RWA (`WF-31`), AIX Pay (`WF-30`) and the production-gated Spot order types (`WF-11` §15.5). They
are **production-gated, not prohibited** (§3.7).

**v1.2 items now correctly located:**

| v1.2 §33.2 item | v1.3 treatment |
|---|---|
| Resting Limit Orders | `WF-11` §15.4 item 2 and §15.6 — a client order held in AIX's own store and routed externally is not a prohibited resting order; one mutually executable against another client's order is |
| Stop-Limit Orders | `WF-11` §15.5 — production-gated, `R3-Q3` |
| GTC / Post-Only / IOC / FOK Orders | `WF-11` §15.5 — production-gated, `R3-Q3`. **Post-only and maker/taker remain in §33.1** |

---

## 33A. WF-30 AIX Pay — Merchant Payment Lifecycle

**New in v1.3.** Doc 00 §12D, §20.3; SRS `PAY-SRS-*`; module `PAY-01`.

### 33A.1 Purpose

To onboard merchants and process, settle, pay out and reconcile merchant payments under the PSO
licence.

### 33A.2 States

```txt
merchant_applied → merchant_kyb_pending → merchant_approved → merchant_active
                                        → merchant_rejected → merchant_suspended

payment_intent_created → awaiting_payment → payment_detected → payment_confirmed
                       → conversion_pending → conversion_complete
                       → settled_to_merchant → payout_pending → paid_out
                       → expired / failed / refund_requested → refunded
```

### 33A.3 Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Merchant applies | `MERCHANT_OWNER` | `CLT-01` application |
| 2 | Merchant KYB / UBO / due diligence | `KYC-01`, `AML-01` | Never re-implemented in `PAY-01` |
| 3 | Compliance approves the merchant | `COMPLIANCE_OFFICER` | Maker-checker |
| 4 | Merchant account and subaccount created | `ACC-01` | `DEC-011` hierarchy |
| 5 | Settlement destinations whitelisted | `WLT-01` | Screening, proof of control, cooling-off |
| 6 | API credentials and webhooks issued | `API-01` | `CLIENT_API_OPERATOR` / `MERCHANT_OWNER` |
| 7 | **PRODUCTION ACTIVATION GATE** | `CFG-01` | **Doc 00 §5.2 baseline vs beyond-baseline capability; `R5-Q1`, `R5-Q2`** |
| 8 | Payment intent created | Merchant / API | Instrument must be Pay-eligible in `AST-01` |
| 9 | Checkout presented — hosted, API or QR | `PAY-01` | **Hosted checkout is a pre-auth surface; perimeter analysis required before exposure** |
| 10 | Payment detected and confirmed | `DEP-01` | Source screening; Travel Rule where applicable |
| 11 | Conversion orchestrated where applicable | `EXE-01` → external venue | **No internal or synthetic pricing** |
| 12 | Fees calculated and disclosed | `FEE-01` | Disclosed-fee evidence |
| 13 | Ledger posted | `LED-01` | Double entry; sole source of balances |
| 14 | Settlement to merchant | `LED-01` | Client-money safeguarding respected |
| 15 | Payout released | `PAY_OPERATIONS_OFFICER` maker, `MERCHANT_APPROVER` / `FINANCE_MANAGER` checker | Whitelisted destination only; maker-checker |
| 16 | Refund where requested | `PAY-01` | Ledger reversal **and** fee reversal |
| 17 | Reconciliation | `REC-01` | Merchant settlement reconciliation |
| 18 | Merchant reporting | `RPT-01` | |

### 33A.4 Blocking conditions

1. Merchant KYB incomplete or expired.
2. Instrument not Pay-eligible in `AST-01`, or classification unresolved.
3. Settlement destination not whitelisted or still in cooling-off.
4. **Production activation gate closed** for a beyond-baseline capability.
5. Maker-checker missing on payout release or fee-schedule change.
6. Hosted checkout exposed before perimeter analysis and pre-authentication findings closure.
7. Conversion attempted through an internal or synthetic price.

---

## 33B. WF-31 AIX RWA — Asset Lifecycle

**New in v1.3.** Doc 00 §12B; SRS `RWA-SRS-*`; modules `RWA-01`…`RWA-04`, `AST-01`.

### 33B.1 Purpose

To take a real-world asset from issuer onboarding through classification, structuring, issuance,
servicing and redemption, with secondary-market eligibility routed to `WF-32` where applicable.

### 33B.2 Canonical flow

```txt
Issuer Onboarding → Issuer KYB / UBO / Due Diligence → Asset Onboarding
  → Asset Evidence / Verification → REGULATORY / LEGAL CLASSIFICATION  (WF-35)
  → Structuring → Token Configuration → Smart Contract Orchestration
  → Offering → Subscription → Investor Eligibility → Allocation → Issuance
  → Token / Holder Registry → Transfer Controls → Asset Servicing
  → Corporate Actions → Distributions → Reporting → Redemption
  → Secondary Market Eligibility → AIX Exchange where applicable  (WF-32)
```

### 33B.3 States

```txt
issuer_applied → issuer_dd_pending → issuer_approved / issuer_rejected
asset_proposed → asset_evidence_pending → asset_verified
classification_pending → classified_security / classified_non_security / classification_unresolved
structuring → token_configured → contract_deployed
offering_open → subscription_received → investor_eligibility_checked
allocated → issued → holder_registered
servicing_active → corporate_action_pending → distribution_pending
redemption_requested → redeemed → retired
secondary_market_eligible → admitted_to_exchange
```

### 33B.4 Steps and gates

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Issuer onboarding | `ISSUER_OWNER` | `CLT-01` |
| 2 | Issuer KYB / UBO / due diligence | `KYC-01`, `AML-01` | Shared core; never re-implemented |
| 3 | Asset onboarding and evidence | `RWA_OPERATIONS_OFFICER` | Evidence retention |
| 4 | **Regulatory / legal classification** | `INSTRUMENT_CLASSIFIER` maker, `COMPLIANCE_OFFICER` checker | **`WF-35`. This precedes everything downstream** |
| 5 | Structuring within the classified route | `RWA_OPERATIONS_OFFICER` | Route-specific |
| 6 | Token configuration and transfer restrictions | `RWA-02` | |
| 7 | Smart-contract orchestration | `RWA-02` | **Third-party custody required** (Doc 00 §8.2, `R4-Q5`). **Non-production: testnet or mock only** |
| 8 | **PRODUCTION ACTIVATION GATE** | `CFG-01` | **`R4-Q1`…`R4-Q7`; security route additionally `R4-Q2`, `R1-Q1b`** |
| 9 | Offering setup and terms | `RWA-03` | |
| 10 | Subscription intake | `INVESTOR_PARTICIPANT` | |
| 11 | Investor eligibility | `RWA-03`, `CLT-01`, `AST-01` | Client classification and compliance status |
| 12 | Allocation | `RWA_OPERATIONS_OFFICER` | Maker-checker |
| 13 | Issuance and initial holder recording | `RWA-02`, `RWA-04` | Ledger posting through `LED-01` |
| 14 | Holder registry maintained | `RWA-04` | `R4-Q4` unresolved — production gated |
| 15 | Transfers with enforced restrictions | `RWA-04` | |
| 16 | Servicing, corporate actions, distributions | `RWA-04` | Ledger + audit |
| 17 | Reporting — issuer, holder, regulatory | `RPT-01` | |
| 18 | Redemption and retirement | `RWA-04` | Maker-checker |
| 19 | Secondary-market eligibility set | `AST-01` | **Derived from classification, never set independently** |
| 20 | Where `SECURITY / SECURITY TOKEN` — route to Exchange admission | `EXM-01` | **`WF-32`. Never to AIX Spot or AIX OTC** |

### 33B.5 Blocking conditions

1. **Classification unresolved → production activation blocked** for that instrument. Development, synthetic testing, workflow development, UAT and controlled demo are **not** blocked.
2. Issuer due diligence incomplete.
3. Asset evidence missing or unverified.
4. Investor ineligible.
5. Transfer restriction violated.
6. **Production activation gate closed.**
7. Self-custody attempted for a tokenised instrument (Doc 00 §8.2).
8. **Any attempt to route a security-classified instrument to AIX Spot or AIX OTC** — blocks in every environment.

---

## 33C. WF-32 AIX Exchange — Instrument Admission and Listing

**New in v1.3.** Doc 00 §12E; SRS `EXG-SRS-001`…`006`; modules `EXM-01`, `EXP-01`, `AST-01`.

### 33C.1 Purpose

To admit a classified security or security token to the AIX Exchange and manage its listing
lifecycle.

### 33C.2 States

```txt
admission_requested → admission_review → admission_approved / admission_rejected
listed_pending_activation → listed_active
listing_suspended → trading_halted → trading_resumed
listing_withdrawn → delisted
```

### 33C.3 Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Admission requested | `LISTING_OFFICER` | Instrument must be classified `SECURITY / SECURITY TOKEN` in `AST-01` |
| 2 | Classification verified | `AST-01` | **Unresolved classification refuses admission** |
| 3 | Secondary-market eligibility verified | `AST-01` | Derived from classification |
| 4 | Admission review | `COMPLIANCE_OFFICER` | Maker-checker; `LISTING_OFFICER` may not self-approve |
| 5 | Market configuration set | `EXM-01` | Tick size, lot size, sessions, price bands — open items, SRS §28 |
| 6 | Participant eligibility rules bound | `EXP-01` | Transfer restrictions at the market boundary |
| 7 | **PRODUCTION ACTIVATION GATE** | `CFG-01` | **`R1-Q1b`, `R4-Q2`; Doc 00 §21 conditions; `WF-34`** |
| 8 | Listing activated | `MARKET_OPERATIONS_OFFICER` | Audit evidence |
| 9 | Trading halt where required | `MARKET_OPERATIONS_OFFICER` maker, `OPS_MANAGER` / `MANAGEMENT` checker | Reason, authority and evidence recorded |
| 10 | Delisting / withdrawal | `LISTING_OFFICER` maker, `COMPLIANCE_OFFICER` checker | Holder impact assessed; `RWA-04` notified |

### 33C.4 Blocking conditions

1. Classification unresolved, absent, or not `SECURITY / SECURITY TOKEN`.
2. Secondary-market eligibility not derived from a resolved classification.
3. Maker-checker missing on admission.
4. **Production activation gate closed** — `R1-Q1b` unresolved.
5. Market configuration incomplete.
6. Participant eligibility rules unbound.

---

## 33D. WF-33 AIX Exchange — Trading

**New in v1.3.** Doc 00 §12E; SRS `EXG-SRS-007`…`022`, `EXG-SRS-100`; modules `EXO-01`,
`EXP-01`, `EXC-01`, `SUR-01`, `LED-01`, `RWA-04`.

### 33D.1 Purpose

To match eligible participants' orders in an admitted securities instrument, and to settle the
resulting trades.

### 33D.2 States

```txt
participant_admission_requested → participant_eligible / participant_rejected
exchange_order_submitted → exchange_order_accepted → exchange_order_open
  → exchange_order_partially_matched → exchange_order_matched
  → exchange_order_cancelled / exchange_order_expired / exchange_order_rejected
execution_generated → clearing_pending → settlement_pending → settled
holder_registry_updated → reported
```

### 33D.3 Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Participant admission | `EXP-01`, `COMPLIANCE_OFFICER` | Investor eligibility, jurisdiction, compliance status |
| 2 | Market permissions granted | `EXP-01` | Narrowing only |
| 3 | **PRODUCTION ACTIVATION GATE** | `CFG-01` | **`R1-Q1b`; Doc 00 §21. Non-production: synthetic instruments, non-live execution** |
| 4 | Order submitted | `INVESTOR_PARTICIPANT` | Instrument listed and active; session open |
| 5 | Eligibility and transfer restrictions evaluated | `EXP-01` | **Before the order reaches the book** |
| 6 | Order entered into the central order book | `EXO-01` | **Securities domain only** |
| 7 | Matching by deterministic price/time priority | `EXO-01` | Auditable and reproducible |
| 8 | Execution generated | `EXO-01` | Full execution evidence |
| 9 | Surveillance evaluates order and trade | `SUR-01` | Shared logic, **domain-separated data** |
| 10 | Clearing / settlement interface invoked | `EXC-01` | Counterparties and interfaces are open items |
| 11 | Settlement posted | `LED-01` | Double entry |
| 12 | Holder registry and transfer controls updated | `RWA-04`, `AST-01` | |
| 13 | Reporting | `RPT-01` | |
| 14 | Records retained ≥ 6 years | `SEC-01` | |

### 33D.4 The boundary — blocking conditions that never lift

1. **No MB-domain module may invoke any step of this workflow.** Not `OMS-01`, `MKD-01`, `LQD-01`, `EXE-01`, `TRD-01`, or `SUR-01` acting in its MB capacity (SRS `EXG-SRS-101`).
2. **No step of this workflow may execute an AIX Spot or AIX OTC client order** (SRS `EXG-SRS-102`).
3. **The boundary holds identically in all five environments**, under any configuration, capability state or approval outcome (SRS `EXG-SRS-103`).
4. **`WF-11` and `WF-33` never converge.** A Spot order never enters the Exchange book; an Exchange order never routes to an external LP through `EXE-01`.
5. **The existence of this workflow grants AIX Spot nothing.** *"Unlock Exchange development" is not permission to turn AIX Spot into an internal matching venue.*

### 33D.5 Other blocking conditions

1. Participant not eligible or not admitted.
2. Instrument not listed, or listing suspended / halted.
3. Transfer restriction violated.
4. Session closed.
5. **Production activation gate closed.**
6. Surveillance hold.
7. Clearing / settlement interface unavailable — **fail closed**, no provisional matching.

---

## 33E. WF-34 Capability Production Activation

**New in v1.3.** `DEC-013` clauses 2, 3; Doc 00 §21, §21A; Role Matrix §19A.

### 33E.1 Purpose

To activate a production-gated capability in PRODUCTION through a governed, evidenced,
maker-checkered act — and to make deactivation always available.

### 33E.2 States

```txt
activation_requested → evidence_pack_assembled → compliance_review
  → management_review → activation_approved → activated
  → activation_rejected / activation_withdrawn
deactivation_requested → deactivated
kill_switch_engaged → post_hoc_review
```

### 33E.3 Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Activation requested | `ADMIN` / `SUPER_ADMIN` | Names the capability and the environment |
| 2 | Applicable regulatory open question verified closed | Requester | **Recorded in `DECISION_LOG.md`.** An unresolved question refuses the request outright |
| 3 | Evidence pack assembled | Requester | Doc 00 §21's thirteen conditions, each evidenced |
| 4 | Compliance review | `COMPLIANCE_OFFICER` | Checker |
| 5 | Capability activation review | `CAPABILITY_ACTIVATION_APPROVER` | Checker |
| 6 | Management review | `MANAGEMENT` | Checker |
| 7 | Activation applied | `CFG-01` | **Maker may never be a checker** |
| 8 | Audit evidence written | `SEC-01` | Who, when, on what basis, under which approval |
| 9 | Downstream documentation updated | Governance | Doc 00, module blueprints where affected |

**Deactivation** requires one authorised actor and a single checker; the **kill switch** requires
one authorised actor with post-hoc review. **Failing closed is never blocked by a missing
checker.**

### 33E.4 Blocking conditions

1. Applicable regulatory open question unresolved.
2. Any Doc 00 §21 condition unevidenced.
3. Maker is also a checker.
4. Target capability is in `WF-29` §33.1 — **refused outright; no activation path exists**.
5. Request attempts to **promote** a non-production capability state (Doc 00 §1.E rule 3).
6. Environment unknown or unmapped — treated as PRODUCTION, fails closed.

---

## 33F. WF-35 Instrument Classification

**New in v1.3.** Doc 00 §12A; SRS `AST-SRS-001`, `AST-SRS-001A`; module `AST-01`.

### 33F.1 Purpose

To determine an instrument's legal and regulatory classification before any product admits it.

### 33F.2 Canonical flow

```txt
Asset / Instrument Proposed → Classification → Product Eligibility
  → Operational Eligibility → Activation
```

### 33F.3 States

```txt
proposed → evidence_pending → classification_in_review
  → classified_non_security / classified_security_or_security_token
  → classification_unresolved            (the DEFAULT on creation)
  → classified_synthetic_test            (non-production only)
eligibility_derived → operationally_eligible → activated
```

### 33F.4 Steps

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Instrument proposed | `RWA_OPERATIONS_OFFICER` / `ADMIN` | Default state is `classification_unresolved` |
| 2 | Evidence gathered | Proposer | Legal classifier of record — `R4-Q3` open |
| 3 | Classification recorded | `INSTRUMENT_CLASSIFIER` maker | **Never self-approved** |
| 4 | Classification approved | `COMPLIANCE_OFFICER` checker | Maker-checker |
| 5 | Product eligibility **derived** | `AST-01` | Spot / OTC / Pay / RWA / Exchange — **never set independently** |
| 6 | Operational eligibility evaluated | `AST-01`, `CFG-01` | Deposit, withdrawal, listing status, transfer restrictions |
| 7 | **PRODUCTION ACTIVATION GATE** | `CFG-01` | `WF-34` |

### 33F.5 Outcomes

| Outcome | Consequence |
|---|---|
| **NON-SECURITY** | May be considered for AIX Spot / OTC, subject to admissibility locks and every other requirement |
| **SECURITY / SECURITY TOKEN** | **Must never enter AIX Spot or AIX OTC through the Money Broking route**, in any environment. Routed to the securities / Exchange path (`WF-32`) |
| **UNRESOLVED** | **Production activation prohibited — fail closed.** The default state. Does **not** block development, synthetic testing, workflow development, UAT or demo |
| **SYNTHETIC / TEST** | **Valid only in DEVELOPMENT / TEST / UAT / DEMO. Fails closed in PRODUCTION. Never promotable** into a production classification |

### 33F.6 Blocking conditions

1. Classification unresolved → production activation blocked for that instrument.
2. Maker-checker missing or self-approved.
3. Product eligibility set independently of classification.
4. Synthetic classification present in PRODUCTION.
5. Attempt to promote a synthetic classification to a production classification.
6. Security-classified instrument proposed for Spot or OTC admission.

---

## 34. Cross-Workflow Dependency Map

| Upstream Workflow | Downstream Workflow |
|---|---|
| Client Registration and Onboarding | KYC/KYB, Professional Status, Client Agreement |
| Professional Status Verification | Product Access |
| KYC/KYB Approval | Product Access |
| Client Agreement and Consent | Product Access |
| Product Access | OTC/RFQ, AIX Spot, Deposit, Withdrawal, AIX Pay, AIX RWA |
| Payout Destination Whitelist | Withdrawal |
| Fiat Deposit | Ledger, Reconciliation, Safeguarding |
| Digital Asset Deposit | Wallet Screening, Ledger, Custodian Reconciliation |
| OTC/RFQ | Pre-Funded Hold, LP Execution, Trade Booking, Settlement |
| AIX Spot (`WF-11`) | Pre-Funded Hold, LP Execution, Trade Booking, Settlement, Surveillance |
| LP Execution | LP Settlement Payment, Reconciliation |
| Ledger Posting | Balance, Reconciliation, Reports |
| Reconciliation | Break Management, Safeguarding |
| Client-Money Safeguarding | Go-Live Gate, Finance/Compliance Reports, Account Freeze / Suspension |
| Transaction Monitoring | AML Case, Account Freeze / Suspension |
| Travel Rule / Wallet Screening | Withdrawal, Deposit, AML Case, Account Freeze / Suspension |
| Vendor Approval | LP, Custodian, Bank, Screening, Cloud Integrations |
| Reporting | Regulatory Filing, Audit |
| Account Freeze / Suspension | Product Access, Withdrawal, Deposit, Trade, Offboarding |
| Periodic KYC Refresh / Re-Screening | Product Access Revocation, Account Freeze / Suspension |
| Client Offboarding | Balance Return, Product Access Revocation, Records Retention |
| Admin Config | Feature Flags, Asset/Pair Activation |
| Role Management | Permission Enforcement |
| Break-Glass | Incident Review, Audit |
| **Instrument Classification (`WF-35`)** | **Product Eligibility, AIX Spot, AIX OTC, AIX Pay, AIX RWA, Exchange Admission — everything** |
| **Capability Production Activation (`WF-34`)** | **Every production-gated workflow step** |
| **AIX Pay (`WF-30`)** | Deposit, Conversion, Ledger, Settlement, Payout, Reconciliation, Merchant Reporting |
| **AIX RWA (`WF-31`)** | Instrument Classification, Ledger, Holder Registry, Exchange Admission, Reporting |
| **Exchange Admission (`WF-32`)** | Exchange Trading, Participant Eligibility, Holder Registry |
| **Exchange Trading (`WF-33`)** | Clearing/Settlement Interface, Ledger, Holder Registry, Surveillance, Reporting |
| **Merchant / Issuer Onboarding** | KYC/KYB, Account Structure, Product Access |

**Dependency rules added in v1.3:**

1. **`WF-35` precedes every product admission.** No workflow may admit an instrument whose
   classification is unresolved to production.
2. **`WF-34` precedes every production-gated step.** No workflow reaches production behaviour
   without it.
3. **`WF-11` and `WF-33` have no dependency edge in either direction, and must never acquire
   one.** A Spot order never enters the Exchange book; an Exchange order never routes through
   `EXE-01` (§33D.4).

---

## 35. Master Workflow State Requirements

**Added in v1.3:** client order lifecycle (`WF-11` §15.6); merchant onboarding and payment intent
(`WF-30`); RWA asset lifecycle and offering/subscription (`WF-31`); Exchange instrument admission
and listing status (`WF-32`); Exchange order lifecycle, participant admission and trading halt
(`WF-33`); capability production activation (`WF-34`); instrument classification (`WF-35`).

The following workflows must have formal state machines in their module blueprints:

1. Client onboarding.
2. Professional/accredited status verification.
3. KYC/KYB review.
4. AML case.
5. Transaction monitoring alert.
6. Account freeze / suspension / unfreeze.
7. Payout destination.
8. Client-side approval.
9. Quote lifecycle.
10. Trade booking.
11. LP execution.
12. LP settlement payment.
13. Deposit.
14. Withdrawal.
15. Settlement.
16. Ledger reversal.
17. Reconciliation break.
18. Client-money safeguarding shortfall.
19. Maker-checker request.
20. Feature flag change.
21. Vendor approval.
22. Asset approval.
23. STR/regulatory filing workflow.
24. Complaint/dispute.
25. DSAR/privacy request.
26. Break-glass access.
27. Unmatched deposit / suspense handling.
28. Client offboarding / account closure.
29. Periodic KYC refresh and sanctions re-screening.
30. Custody exit / asset migration under WF-19 Vendor / LP / Custodian / Bank Approval.

---

## 36. Master Audit Event Requirements

Every workflow must define audit events in module blueprints.

Minimum audit events:

```txt
workflow_created
workflow_submitted
workflow_reviewed
workflow_approved
workflow_rejected
workflow_cancelled
workflow_expired
workflow_failed
workflow_reversed
maker_checker_requested
maker_checker_approved
maker_checker_rejected
sod_conflict_detected
client_side_approval_requested
client_side_approval_approved
client_side_approval_rejected
sensitive_read_accessed
report_exported
break_glass_requested
break_glass_granted
break_glass_used
break_glass_revoked
account_frozen
account_unfrozen
deposit_unmatched
deposit_suspense_held
deposit_returned
client_offboarding_started
client_balance_returned
client_closed
kyc_refresh_due
kyc_refresh_completed
sanctions_rescreen_run
product_access_restricted
```

Money workflows must additionally include:

```txt
balance_checked
balance_held
hold_released
ledger_posted
ledger_reversed
settlement_started
settlement_completed
reconciliation_run
reconciliation_break_detected
client_money_shortfall_detected
lp_payment_requested
lp_payment_approved
lp_payment_released
```

---

## 37. Master Error Codes

The workflow engine must support these minimum error categories:

```txt
FEATURE_DISABLED
PERMISSION_DENIED
CLIENT_NOT_APPROVED
CLIENT_SUSPENDED
CLIENT_FROZEN
ACCOUNT_FROZEN
CLIENT_SIDE_APPROVAL_REQUIRED
SEGREGATION_OF_DUTIES_CONFLICT
MAKER_CHECKER_REQUIRED
KYC_REQUIRED
AML_BLOCKED
TRAVEL_RULE_DATA_MISSING
WALLET_SCREENING_BLOCKED
PAYOUT_DESTINATION_NOT_VERIFIED
THIRD_PARTY_PAYOUT_BLOCKED
DEPOSIT_UNMATCHED
INSUFFICIENT_AVAILABLE_BALANCE
PREFUNDED_HOLD_FAILED
CONCURRENCY_CONFLICT
QUOTE_EXPIRED
BEST_EXECUTION_CHECK_FAILED
LP_UNAVAILABLE
LP_EXECUTION_FAILED
LP_SETTLEMENT_PAYMENT_BLOCKED
SETTLEMENT_SEQUENCE_INVALID
CLIENT_MONEY_SHORTFALL
RECONCILIATION_BREAK
LEDGER_IMBALANCE
BREAK_GLASS_ACCESS_REQUIRED
EXCHANGE_MODULE_LOCKED
```

**Added in v1.3** — new codes only; **no existing code is renamed or removed**.
`EXCHANGE_MODULE_LOCKED` keeps its name and meaning (Doc 00 §9A: the locked-capability error
code, cited across the masters, test names and acceptance records).

```txt
PRODUCTION_ACTIVATION_GATE_CLOSED
CAPABILITY_NOT_AVAILABLE_IN_ENVIRONMENT
ENVIRONMENT_UNKNOWN_FAIL_CLOSED
CAPABILITY_ACTIVATION_APPROVAL_REQUIRED
CAPABILITY_PERMANENTLY_PROHIBITED
INSTRUMENT_CLASSIFICATION_UNRESOLVED
INSTRUMENT_NOT_ELIGIBLE_FOR_PRODUCT
SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT
SYNTHETIC_INSTRUMENT_NOT_VALID_IN_PRODUCTION
ORDER_NOT_CANCELLABLE
PRE_TRADE_CONTROL_REJECTED
SUSPICIOUS_ORDER_BLOCKED
ROUTING_POLICY_NO_ELIGIBLE_VENUE
VENUE_NOTIFICATION_PERIOD_NOT_ELAPSED
MERCHANT_NOT_APPROVED
SETTLEMENT_DESTINATION_NOT_WHITELISTED
ISSUER_DUE_DILIGENCE_INCOMPLETE
INVESTOR_NOT_ELIGIBLE
TRANSFER_RESTRICTION_VIOLATED
INSTRUMENT_NOT_LISTED
TRADING_HALTED
EXCHANGE_SESSION_CLOSED
PARTICIPANT_NOT_ADMITTED
CLEARING_INTERFACE_UNAVAILABLE
MB_DOMAIN_MAY_NOT_CALL_EXCHANGE_DOMAIN
EXCHANGE_DOMAIN_MAY_NOT_EXECUTE_MB_ORDER
```

**Error-reporting rules (new in v1.3):**

1. **A capability denial must not be reported as a permission denial, and vice versa** (Role
   Matrix §3.7 rule 4). Conflating them hides which control denied.
2. **`CAPABILITY_PERMANENTLY_PROHIBITED` and `PRODUCTION_ACTIVATION_GATE_CLOSED` are different
   answers** and must never be substituted for one another. The first means *there is no path*;
   the second means *the path exists and is closed*.
3. **`MB_DOMAIN_MAY_NOT_CALL_EXCHANGE_DOMAIN` and `EXCHANGE_DOMAIN_MAY_NOT_EXECUTE_MB_ORDER` are
   boundary violations, not authorisation failures**, and must be raised as such with heightened
   audit.

---

## 38. Testing Requirements for Workflows

Workflow testing must include:

1. Happy-path tests.
2. Rejection-path tests.
3. Expiry tests.
4. Maker-checker tests.
5. Segregation-of-duties tests.
6. Client-side dual authorization tests.
7. Sensitive read-audit tests.
8. Permission-denied tests.
9. Feature-flag-denied tests.
10. Workflow state-transition tests.
11. Concurrent action tests.
12. Idempotency tests.
13. Ledger posting tests.
14. Hold/release tests.
15. DvP sequence tests.
16. LP outage tests.
17. LP settlement payment block tests.
18. Reconciliation break tests.
19. Client-money shortfall tests.
20. Third-party payout block tests.
21. Best-execution failure tests.
22. Travel Rule missing-data tests.
23. Wallet screening block tests.
24. Break-glass access tests.
25. **Permanently prohibited capability block tests** — every `WF-29` §33.1 capability, every role including `SUPER_ADMIN`, every environment, every path including break-glass. *(v1.3: replaces "future-locked Exchange block tests" and widens it.)*
26. Account freeze / suspension / unfreeze workflow tests.
27. Unmatched deposit suspense and return tests.
28. Client offboarding / closure tests.
29. Periodic KYC refresh and sanctions re-screening tests.
30. Payout destination client-side approval tests.
31. Digital deposit credit maker-checker tests.
32. Custody exit / asset migration tests.
33. LP failover deferred-open-item tests.
34. **Production activation gate tests** — that a gated step blocks in PRODUCTION while its gate is closed, and proceeds in DEVELOPMENT / TEST / UAT / DEMO per the environment configuration (§3.7). *(New in v1.3.)*
35. **Gate-attribution tests** — that `CAPABILITY_PERMANENTLY_PROHIBITED` and `PRODUCTION_ACTIVATION_GATE_CLOSED` are never substituted for one another (§37 rule 2).
36. **Environment fail-closed tests** — unknown or unmapped environment treated as PRODUCTION.
37. **Non-production promotion block tests** — no capability state propagates to PRODUCTION.
38. **Client order lifecycle tests** — submission, pre-trade rejection, open, partial fill, split fill, **cancellation of an unexecuted order**, expiry, hold release (`WF-11` §15.6).
39. **Cancellation-always-available tests** — that cancelling an unexecuted order is never blocked by a capability gate (¶6.4(i)).
40. **Routing evidence tests** — every routing decision reconstructable and disclosable.
41. **Venue notification tests** — that a venue cannot be activated for routing before the seven-day prior notification period has elapsed.
42. **Classification gate tests** — that an unresolved classification blocks production activation and does **not** block development, synthetic testing, UAT or demo (`WF-35`).
43. **Securities-exclusion tests** — that a `SECURITY / SECURITY TOKEN` instrument cannot be admitted to AIX Spot or AIX OTC, in every environment.
44. **Synthetic instrument tests** — fails closed in PRODUCTION; never promotable (`WF-35` §33F.5).
45. **Exchange boundary tests** — that no MB-domain module can invoke any `WF-33` step, and that no `WF-33` step can execute a Spot or OTC client order (§33D.4). **Required as `EXO-01` invariant evidence.**
46. **`WF-11`/`WF-33` non-convergence tests** — that no code path joins the two workflows.
47. **Exchange admission tests** — that admission refuses an unresolved or non-security classification (`WF-32`).
48. **Trading halt tests** — maker-checker, reason and authority recorded, resumption controlled.
49. **Capability activation maker-checker tests** — maker cannot be a checker; unresolved regulatory question refuses the request (`WF-34`).
50. **Deactivation-always-available tests** — one authorised actor can close a capability (`WF-34` §33E.3).
51. **Merchant payment lifecycle tests** — intent, checkout, confirmation, conversion, settlement, payout, refund with fee reversal (`WF-30`).
52. **RWA lifecycle tests against synthetic assets**, issuer onboarding through redemption and secondary-market eligibility (`WF-31`).
53. **Per-environment control-parity tests** — that audit, maker-checker, SoD, client-side dual authorization and money-movement integrity apply identically in all five environments (§3.7 rule 7).

---

## 39. Open Items for Module Blueprints

The following items must be finalised in module blueprints:

1. Exact state machine per workflow.
2. Exact API endpoint per workflow transition.
3. Exact permission key per transition.
4. Exact maker-checker rule per transition.
5. Exact SoD rule per transition.
6. Exact audit event per transition.
7. Exact database tables and status fields.
8. Exact notification templates.
9. Exact timeout / expiry values.
10. Exact client-side dual authorization thresholds.
11. Exact transaction monitoring thresholds.
12. Exact Travel Rule threshold.
13. Exact payout destination cooling-off period.
14. Exact LP slippage tolerance.
15. Exact best-execution tolerance.
16. Exact reconciliation matching rules.
17. **Exact production activation evidence pack per capability** (`WF-34` §33E.3). *(New in v1.3.)*
18. **Exact per-environment capability configuration** (`MIG-004`).
19. **Exact Exchange market microstructure parameters** — tick size, lot size, price bands, auction and session definitions, halt thresholds (`WF-32` §33C.3 step 5).
20. **Exact Exchange clearing and settlement counterparties and interfaces** (`WF-33` §33D.3 step 10).
21. **Exact participant admission criteria** (`WF-33` §33D.3 step 1).
22. **Exact instrument classification evidence standard and legal classifier of record** (`R4-Q3`).
23. **Exact merchant payment state timeouts and expiry values** (`WF-30`).
24. **Exact RWA offering, subscription and allocation rules** (`WF-31`).
25. **Whether external controlled demo of a production-gated regulated capability is permissible** (`R6-Q1`).
17. Exact client-money safeguarding computation formula.
18. Exact break-glass expiry duration.
19. Exact regulatory report approval path.
20. Exact freeze/suspension scope rules.
21. Exact unmatched deposit investigation SLA.
22. Exact deposit return-to-source process.
23. Exact client offboarding balance-return workflow.
24. Exact periodic KYC refresh schedule by risk level.
25. Exact sanctions re-screening trigger source.
26. Exact custody exit / asset migration workflow.
27. Exact backup LP / failover policy.

---

## 40. Additional Workflow Parameters

```txt
account_freeze_workflow = required
account_freeze_trigger_sources = sanctions_court_regulatory_fraud_aml_safeguarding
account_freeze_scope = login_trade_deposit_withdrawal_payout_full
account_unfreeze_maker_checker = required

unmatched_deposit_handling = suspense_then_match_or_return
deposit_unmatched_state = required
deposit_return_to_verified_source = required
suspense_clearing_account_required = true

client_offboarding_workflow = required
closure_blocks_if_balance_or_open_settlement = true
closure_balance_return_destination = verified_own_name_only
closure_records_retention_applied = required

periodic_kyc_refresh = risk_based_schedule
sanctions_rescreen_on_list_update = required
product_access_restrict_if_refresh_overdue = required
suspend_or_freeze_if_refresh_unresolved = required

payout_destination_client_side_dual_auth = required_for_institutional_mandate
payout_destination_cooling_off_hard_gate = true

digital_deposit_credit_maker_checker = required
custody_exit_migration_workflow = required
lp_failover_backup_lp = open_item_deferred
```

---

## 41. Claude Model Usage

### 41.1 ChatGPT 5.5

Use for:

1. Workflow refinement.
2. State machine planning.
3. Module blueprint drafting.
4. API workflow mapping.
5. Audit event mapping.
6. Claude prompt creation.

### 41.2 Claude Opus

Use for:

1. Review of this Master Workflow Map.
2. Workflow security review.
3. Money-movement workflow review.
4. AML/Travel Rule workflow review.
5. Maker-checker / SoD workflow review.
6. Licence-boundary review.

### 41.3 Claude Sonnet

Do not use Sonnet for coding until the relevant module blueprint is approved.

### 41.4 Claude Fable

Use later for workflow messages, status wording, client-facing guidance, and error text.

---

## 42. Claude Opus Review Prompt

```txt
Review this 05_Master_Workflow_Map_v1.2.md as a principal fintech platform architect and regulated fintech workflow/security reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending.
- This document is based on:
  - 00_Licence_Scope_And_Feature_Lock_v1.3.md
  - 01_Project_Charter_v1.3.md
  - 03_Master_Module_Index_v1.2.md
  - 02_Software_Requirement_Specification_v1.2.md
  - 04_Role_And_Permission_Matrix_v1.2.md
- MVP supports institutional and HNWI/professional clients only.
- Retail onboarding is disabled by default.
- Platform includes onboarding, KYC/KYB, AML, Travel Rule, transaction monitoring, payout destination whitelist, OTC/RFQ, MB Spot Broking Terminal, LP-backed agency execution, pre-funded hold, best-execution check, ledger, deposit, withdrawal, client-money safeguarding, settlement, reconciliation, audit log, maker-checker, client-side dual authorization, complaints, DSAR/privacy, break-glass access, reporting, and admin/staff/client portals.
- AIX spread markup, principal dealing, market making, internal matching, client-to-client matching, public order book, matching engine, and public exchange trading are blocked.

This v1.2 keeps the substantive v1.1 corrections and only fixes numbering / consistency items: WF-26 subsection numbering, LP settlement payment duplicate in the state-machine list, and custody exit / asset migration now tied explicitly to WF-19 termination. v1.1 added Account Freeze / Suspension / Unfreeze, Client Offboarding / Account Closure, Periodic KYC Refresh and Sanctions Re-Screening, unmatched deposit suspense handling, payout-destination client-side dual authorization, digital deposit credit maker-checker, aligned error codes, custody exit / asset migration open item, and backup LP / failover open item.

Review for:
1. Missing workflows.
2. Missing workflow states.
3. Wrong workflow sequence.
4. Missing maker-checker steps.
5. Missing segregation-of-duties steps.
6. Missing client-side dual authorization steps.
7. Missing AML/Travel Rule steps.
8. Missing custody/client-money safeguarding steps.
9. Missing ledger/settlement/DvP/reconciliation steps.
10. Missing vendor/LP/custodian/bank workflow steps.
11. Missing audit events.
12. Missing error states.
13. Any workflow that could accidentally allow exchange-like or principal-dealing behaviour.
14. Any conflict with 00, 01, 03, 02, or 04.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional workflow requirements or parameters to add.
```

---

## 43. Next Document

After this Master Workflow Map is reviewed and accepted, the next document should be:

```txt
06_Master_System_Rules.md
```

Reason:

System rules should be written after workflows are mapped, so every rule can be tied to a workflow gate, role, permission, audit event, and test case.
