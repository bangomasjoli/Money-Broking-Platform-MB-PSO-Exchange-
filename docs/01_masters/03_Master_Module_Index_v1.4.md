---
document_id: ARC-03
title: Master Module Index
version: v1.4
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Module index / build order
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: v1.0, v1.1, v1.2, v1.3 (archived)
baseline_commit: 01bfa3c
---

# 03 Master Module Index  
# AIX Institutional Digital Asset & RWA Platform

> ## v1.4 — RE-BASELINED ON APPROVED DOC 00 v1.5 AND CHARTER v1.5
>
> **Base documents:** `00_Licence_Scope_And_Feature_Lock_v1.5.md` (APPROVED),
> `01_Project_Charter_v1.5.md` (APPROVED), `DEC-011`, `DEC-012`, **`DEC-013`**, **`STR-03`**.
>
> **What changes in v1.4.** Four **Exchange-domain modules** are added — `EXM-01`, `EXO-01`,
> `EXC-01`, `EXP-01` (§16A) — taking the module count from **33 to 37**. Module status vocabulary
> gains a **build/activation** dimension (§5.4). §17's locked-capability table is split into
> permanent prohibitions, production gates and product-scope prohibitions. §13's
> "no internal matching module" statement is **re-scoped to MB Spot**, because a securities
> Exchange matching engine is now a target capability in a **different domain**. Build sequence,
> dependency rules and parallel tracks are extended.
>
> **Why four new modules, and why not inside the Spot modules.** `OMS-01`, `MKD-01`, `LQD-01`,
> `EXE-01`, `TRD-01` and `SUR-01` are the **external-routing** architecture: an AIX client's own
> order store, data sourced *from* other venues, connections *to* other venues, a decision about
> *which* external venue, and records of external fills. **Not one of them owns instrument
> admission, a central order book, a matching engine, trading halts, market operations or a
> clearing/settlement interface.** `EXE-01` is a router, not a matcher; putting a matching engine
> inside it would place a venue capability inside the MB Spot execution path — the exact
> structural failure Doc 00 §7.7 exists to prevent (`STR-03` §9).
>
> **Traceability preserved. No accepted module is renumbered.** Every implemented and every
> blueprinted module keeps its existing code (`FND-01`, `IAM-01`, `IAM-02`, `SEC-01`, `CFG-01`,
> `CLT-01`, `AML-01`, `KYC-01`, `WLT-01`, `LED-01`, `TRD-01`, `DEP-01`, `WDR-01`, `REC-01`,
> `INC-01`, `PRT-01`, `E2E-01`), as do the sixteen introduced by v1.3. Accepted work is not
> invalidated.
>
> **One taxonomy, retained from v1.3.** The implementation module codes are the sole module
> identifiers; v1.2's conceptual groups remain demoted to descriptive **capability groups** (§5).
>
> **MODULE ≠ SERVICE.** A module is an ownership boundary for a coherent capability and its
> governance. Several modules may be implemented in one service; no module implies a
> microservice. **Four Exchange modules do not imply four Exchange services.**
>
> **Build is not activation.** Listing a module grants no regulatory permission. Doc 00 v1.5
> §1.A and §1.D govern this document throughout: a module's **build state**, its **environment
> availability**, its **production activation state** and its **product/asset eligibility** are
> four separate facts, and Doc 00 §21's production gates apply to every capability listed here.
>
> **What does not change.** **No internal matching module exists for MB Spot, and none may be
> created** (§13, §17). The Exchange matching engine belongs to `EXO-01` and the securities
> domain only; **no MB-domain module may call it, in any environment** (§16A, §19 rule 5A). Model
> C, principal dealing and proprietary market making remain permanently prohibited, and
> derivatives, margin, lending, staking and yield remain out of scope.

## Document Control

| Item | Details |
|---|---|
| Document name | 03_Master_Module_Index_v1.4.md |
| Platform | AIX Institutional Digital Asset & RWA Platform |
| Document type | SDLC Phase 2 / Master Module Control |
| Version | v1.4 |
| Status | **APPROVED** — re-baselined on Doc 00 v1.5 and Charter v1.5; internally reviewed against both |
| Prepared for | Product, compliance, architecture, development, testing, and implementation planning |
| Base document 1 | 00_Licence_Scope_And_Feature_Lock_v1.5.md |
| Base document 2 | 01_Project_Charter_v1.5.md |
| Governing decisions | `DEC-011` (account hierarchy), `DEC-012` (Spot execution architecture), **`DEC-013`** (build-unlocked / production-gated capability model) |
| Module count | **37** (33 from v1.3 + `EXM-01`, `EXO-01`, `EXC-01`, `EXP-01`) |
| Supersedes | v1.3 (archived) |

---

## 1. Purpose of This Document

This document defines the complete module index for the AIX Money Broking Platform.

The purpose is to lock every platform module before writing the full Software Requirement Specification.

This document answers:

1. What modules exist in the platform?
2. Which modules are in MVP?
3. Which modules are locked future modules?
4. Which modules are compliance-critical?
5. Which modules are money-movement-critical?
6. Which modules must be completed before other modules?
7. Which modules require their own blueprint pack?
8. Which modules must never be partially wired into MVP because they belong to Exchange scope?
9. Which Claude model should be used for review or implementation?

---

## 2. Source Scope

This module index is based on the accepted platform scope:

```txt
00_Licence_Scope_And_Feature_Lock_v1.5.md
01_Project_Charter_v1.5.md
```

*(v1.4 correction: this block read `v1.3` for both, which was already stale in v1.3.)*

Core accepted scope:

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
MB Spot order book = permanently prohibited, every environment
MB Spot matching engine = permanently prohibited, every environment
Client-to-client matching = permanently prohibited, every environment
Market making = permanently prohibited
Principal dealing = permanently prohibited
```

**Build / activation scope (`DEC-013`, new in v1.4):**

```txt
Capability states = CAPABILITY_BUILD_STATE
                    ENVIRONMENT_AVAILABILITY
                    PRODUCTION_ACTIVATION_STATE
                    PRODUCT_ASSET_ELIGIBILITY_STATE
Environments = DEVELOPMENT, TEST, UAT, DEMO, PRODUCTION
Confirmed target capabilities = build authorised before production activation
Production activation = fail closed
AIX Exchange (securities market) = build unlocked, production gated
AIX RWA full lifecycle = build unlocked, production gated
AIX Pay full platform = build unlocked, production gated
Securities in MB Spot = prohibited in every environment
Derivatives / margin / lending / staking / yield = out of scope, no build
```

---

## 3. Module Classification

Each module is classified using the following labels.

| Label | Meaning |
|---|---|
| MVP | Must be designed for MVP |
| MVP-Critical | Required before MVP can safely launch |
| Compliance-Critical | Required for AML/KYC/Travel Rule/licence control |
| Money-Critical | Required for client assets, ledger, payment, settlement, or reconciliation |
| Security-Critical | Required for security, audit, access, or production control |
| Vendor-Critical | Depends on external vendor or regulated service provider |
| Optional-Later | Not required for MVP but may be planned later |

**`Future-Locked` is retired as a classification in v1.4.** It conflated *must never exist* with
*must not be activated in production yet*, which is the defect `DEC-013` corrects. A module is
now classified by capability (the labels above) and separately carries a build/activation status
(§5.4). Capabilities that must never exist are **not modules** and are listed in §17.

---

## 4. Required Blueprint Pack per Module

Every active MVP module must have its own module blueprint pack.

### 4.1 Standard Blueprint Pack

Each active MVP module folder must contain:

```txt
01_Module_Blueprint.md
02_Workflow.md
03_Diagrams.md
04_API_Specification.md
05_Database_Design.md
06_State_Machine.md
07_Permission_Rules.md
08_Audit_Log_Events.md
09_Error_Handling.md
10_Test_Cases.md
11_Claude_Prompt.md
```

### 4.2 High-Risk Module Additions

For high-risk modules, add:

```txt
12_Risk_And_Control_Map.md
13_Reconciliation_Design.md
14_Go_Live_Checklist.md
```

High-risk modules include:

1. Ledger.
2. Client Balance.
3. Deposit.
4. Withdrawal.
5. Settlement.
6. Custody.
7. LP Adapter.
8. OTC/RFQ.
9. MB Spot Broking.
10. Travel Rule.
11. AML Case Management.
12. Feature Flags.
13. Maker-Checker.
14. Audit Log.
15. Transaction Monitoring.
16. Payout Destination Whitelist.
17. Professional / Accredited Status Verification.
18. Reconciliation Break Management.

### 4.3 Compliance-Critical Module Additions

Every module classified as `Compliance-Critical` must include:

```txt
15_Regulatory_Mapping.md
```

This file must map the module to:

1. Licence scope.
2. AML/KYC/Travel Rule requirement where applicable.
3. Client asset / market conduct requirement where applicable.
4. Internal policy or SOP requirement.
5. Related system rule.
6. Related audit log event.
7. Related report or evidence record.

This applies to all Compliance-Critical modules, not only the high-risk list.

### 4.4 PII / Sensitive-Data Module Additions

Every module that handles client PII, KYC/KYB data, Travel Rule data, wallet data, bank data, documents, compliance notes, or sensitive internal records must include:

```txt
16_Data_Classification.md
```

This file must define:

1. Data classification.
2. PII/sensitive fields.
3. Encryption requirement.
4. Access control requirement.
5. Read-access logging requirement.
6. Retention rule.
7. Export/download restriction.
8. Masking/redaction rule.
9. Data deletion or archival rule where legally allowed.
10. Privacy/PDPA handling note.

This applies to all PII or sensitive-data modules, not only the high-risk list.

### 4.5 Combined Requirement Rule

If a module is both Compliance-Critical and PII-sensitive, it must include both:

```txt
15_Regulatory_Mapping.md
16_Data_Classification.md
```

---

## 5. Module Identity and Capability Groups

### 5.1 Module identifiers — authoritative

**A module identifier is one of the codes listed in §6–§16.** Identifiers are stable, traceable to acceptance evidence, and are never reused or renumbered for presentation.

### 5.2 Capability groups — descriptive only

Capability groups organise modules for reading. **They are not identifiers and must never be cited as module codes.**

| Group | Target domain |
|---|---|
| Platform Foundation | Foundation, configuration, capability control |
| Institutional Identity / Client / Accounts | Identity, RBAC, client, account structure |
| Compliance & Financial Crime | KYC, KYB, AML, screening, Travel Rule |
| Asset & Instrument Management | Asset registry, classification, eligibility |
| Wallet / Custody | Custody orchestration, destination control |
| Ledger / Treasury | Double-entry ledger, treasury, fees |
| Payments / Settlement | Deposits, withdrawals, settlement, reconciliation, merchant payments |
| Spot Trading | Order management, market data, routing, execution — **external routing only** |
| OTC | RFQ / block execution |
| RWA | Issuer, asset, token lifecycle |
| **Securities Exchange** | **Instrument admission, central order book, matching, market operations, participation, clearing/settlement interface — securities domain only** |
| Market Surveillance / Risk | Trade and order surveillance, trading risk |
| API / Integration | Institutional API, credentials, webhooks |
| Reporting / Regulatory Reporting | Client, issuer, internal and regulatory reporting |
| Staff Operations | Staff and admin operational surfaces |
| Institutional Client Portal | Client-facing surfaces |
| Platform / SRE / Security | Audit, monitoring, incident, deployment perimeter |

### 5.3 Module status vocabulary

| Status | Meaning |
|---|---|
| **ACCEPTED** | Implementation accepted; baseline exists |
| **PARTIAL** | Implementation accepted to a stated phase |
| **BLUEPRINT** | Blueprint pack exists; no implementation |
| **EXTEND** | Existing module whose scope grows under this re-baseline |
| **NEW** | Module introduced by this re-baseline; no blueprint yet |
| **BLOCKED** | Cannot proceed pending an external dependency |

### 5.4 Build and activation status — separate from module status

**New in v1.4. `DEC-013` clause 2; Doc 00 §1.D.** Module status above records **delivery
progress**. It says nothing about whether a capability may operate. Every module additionally
carries:

| Dimension | Values |
|---|---|
| **Build authorisation** | **BUILD** (may be architected, specified, implemented and tested) / **NO BUILD** (must remain unspecified, permanently) |
| **Non-production availability** | DEVELOPMENT / TEST / UAT / DEMO — per environment |
| **Production activation** | `DISABLED_PENDING_REGULATORY_ACTIVATION` / `DISABLED_PENDING_GOVERNANCE` / `DISABLED_BY_POLICY` / `PROHIBITED_PERMANENT` / `ACTIVE` |

**Rules:**

1. **Every module in §6–§16A is BUILD-authorised.** A module that must never exist is not listed
   as a module — see §17.
2. **`ACCEPTED` never means production-activated.** It means implementation was accepted.
3. **A module's production activation is `CFG-01`'s to evaluate**, not the module's own, and is
   governed by Doc 00 §21's conditions.
4. **Unknown state fails closed** in every dimension.

---

## 6. Platform Foundation

| ID | Module | Status | Classification | Scope | Key dependencies |
|---|---|---|---|---|---|
| **FND-01** | Platform Foundation | **ACCEPTED** | Security-Critical | Envelope, request context, idempotency, outbox, audit publisher, module registry, scheduler, shared rate-limit engine, boot-time licence guard | — |
| **CFG-01** | Feature Flag / Licence Lock / **Capability Eligibility** | **ACCEPTED → EXTEND** | Compliance-Critical / Security-Critical | Existing: licence profiles, sealed prohibited-feature registry, feature decision engine, kill switch. **Extension:** multi-dimensional capability eligibility (Doc 00 §21's thirteen conditions — product, licence, asset, jurisdiction, client class, regulatory approval, compliance status, account status, counterparty approval, operational readiness, maker-checker, feature flag) | FND-01, IAM-02, AST-01, ACC-01 |

**CFG-01 extension rationale.** Doc 00 §21 requires a capability gate spanning product, asset, client and venue dimensions. CFG-01 already owns the decision engine, the sealed registry and the fail-closed posture; a second capability-control plane would split that authority. Its current input is a single feature code plus advisory context, so the dimensions are an extension, not configuration.

---

## 7. Institutional Identity, Client and Accounts

| ID | Module | Status | Classification | Scope | Key dependencies |
|---|---|---|---|---|---|
| **IAM-01** | Authentication / MFA / Session | **ACCEPTED** | Security-Critical | Login, MFA, session, step-up, internal session introspection | FND-01 |
| **IAM-02** | RBAC / Permission Guard / SoD | **ACCEPTED → EXTEND** | Security-Critical | Existing: roles, permissions, guard, approvals, segregation of duties. **Extension:** organisation- and **subaccount-scoped permissions** (narrowing-only), client-side functional roles (Trader, Finance, Compliance, Approver, API Operator, Viewer) | IAM-01, CLT-01, ACC-01 |
| **CLT-01** | Client Onboarding / Client Profile / **Legal Entity** | **ACCEPTED → EXTEND** | Compliance-Critical | Existing: applications, legal-entity profile, authorised users and parties, mandates, lifecycle, IAM binding. **Extension:** merchant and issuer client profiles. **Sole owner of legal entity and membership** (`DEC-011`) | IAM-01, KYC-01 |
| **ACC-01** | **Account Structure — Master Account & Subaccount** | **NEW** | Money-Critical / Compliance-Critical | Master account and subaccount identity, lifecycle, ownership by legal entity, subaccount-scoped eligibility surface. **Owns accounts only** | CLT-01, IAM-02 |

**ACC-01 and `DEC-011`.** `DEC-011` requires extending CLT-01 rather than creating a duplicate **organisation identity** domain, and identifies the missing piece as *"the account layer between the entity and the ledger, not the entity"*. ACC-01 is that account layer and is **not** an identity domain: legal entity and membership remain solely CLT-01's, and ACC-01 consumes them. The four layers stay distinct — **legal entity (CLT-01) → master account (ACC-01) → subaccount (ACC-01) → ledger account (LED-01)** — and are never collapsed into one identifier.

---

## 8. Compliance and Financial Crime

| ID | Module | Status | Classification | Scope | Key dependencies |
|---|---|---|---|---|---|
| **KYC-01** | KYC / KYB Verification | **ACCEPTED** | Compliance-Critical | Case lifecycle, checklists, CDD outcomes, roster binding. Serves client, merchant and **issuer** due diligence | CLT-01 |
| **AML-01** | Sanctions / PEP / Adverse Media / Travel Rule | **ACCEPTED → EXTEND** | Compliance-Critical | Existing: screening, matches, risk signals, periodic rescreening, Travel Rule. **Extension:** transaction monitoring (KYT) — *note: AML-01's current "monitoring" is periodic rescreening, not transaction monitoring* | CLT-01, KYC-01 |
| **SEC-01** | Audit Log / Security Monitoring | **ACCEPTED** | Security-Critical | Append-only audit, tiered redaction, security alerts, sensitive-read evidence | FND-01 |

---

## 9. Asset and Instrument Management

| ID | Module | Status | Classification | Scope | Key dependencies |
|---|---|---|---|---|---|
| **AST-01** | **Asset & Instrument Registry + Regulatory Classification** | **NEW** | Compliance-Critical / Money-Critical | Asset and instrument identity and metadata (class, jurisdiction, issuer, underlying, network, contract address, precision, custody support); **the securities-feature classification gate** (Doc 00 §12A); per-product eligibility **derived from** classification (Spot / OTC / Pay / RWA / secondary market); admissibility locks; deposit, withdrawal and listing status; transfer restrictions | CFG-01, KYC-01 |

**Why classification lives inside AST-01.** Doc 00 §12A places the securities-feature gate at the registry level and requires eligibility flags to be **derived from** the classification outcome, never set independently. Splitting them into two modules would allow eligibility to drift from classification — precisely the failure the gate exists to prevent. **Unresolved classification is the default state and fails closed.**

**Platform-wide, not RWA-only.** LFSA-MB-2024 fn 1 to ¶1.2 excludes assets bearing the features of securities (section 2 LFSSA) from the Money Broking framework, so every asset admitted to Spot or OTC passes this gate.

---

## 10. Wallet and Custody

| ID | Module | Status | Classification | Scope | Key dependencies |
|---|---|---|---|---|---|
| **WLT-01** | Wallet Screening / Payout-Destination Whitelist / **Custody Orchestration** | **PARTIAL → EXTEND** | Compliance-Critical / Money-Critical | Existing: destination registration, screening, proof of control, cooling-off, revocation, limits, public client surface. **Extension:** custody orchestration; destination scoping to subaccount | AML-01, CLT-01, ACC-01 |

---

## 11. Ledger, Treasury and Fees

| ID | Module | Status | Classification | Scope | Key dependencies |
|---|---|---|---|---|---|
| **LED-01** | Ledger / Settlement / Safeguarding | **BLUEPRINT → EXTEND** | Money-Critical | Double-entry ledger, journals, balances, holds and reservations, settlement, DvP, safeguarding positions, period close. **Sole source of balances** | ACC-01, AST-01, FND-01 |
| **TRE-01** | Treasury | **NEW** | Money-Critical | Platform-side asset and liquidity position management, funding of venue accounts, internal transfers | LED-01, ACC-01 |
| **FEE-01** | Fee Engine | **NEW** | Money-Critical | Fee schedules and calculation across Spot, OTC, Pay and RWA; disclosed-fee evidence | LED-01, AST-01, ACC-01 |

**`LED-01` is gated on `DEC-011`.** `LED-01` **may not freeze its migration or schema design until it consumes `DEC-011`**. Its blueprint uses `client_id` as a scoping column in 9 of its 23 specified tables with no subaccount dimension. `client_id` must **not** be blindly replaced: **legal owner (`client_id`), operational scope (`subaccount_id`) and accounting destination (`ledger_account_id`) are different dimensions**, and some tables need more than one. Each table must be decided deliberately and the reasoning recorded.

---

## 12. Payments and Settlement

| ID | Module | Status | Classification | Scope | Key dependencies |
|---|---|---|---|---|---|
| **DEP-01** | Deposit Execution / Inbound Receipt | **BLUEPRINT → EXTEND** | Money-Critical | Inbound receipt, crediting, source screening. **Extension:** merchant inbound payments, RWA subscription inflows | LED-01, WLT-01, AML-01 |
| **WDR-01** | Withdrawal / Payout Execution Rail | **BLUEPRINT / BLOCKED** | Money-Critical | Outbound payout execution. **Blocked on KMS** as a platform prerequisite | LED-01, WLT-01, IAM-02 |
| **REC-01** | Reconciliation / Finance Reporting | **BLUEPRINT → EXTEND** | Money-Critical | Internal, counterparty and custodian reconciliation; breaks. **Extension:** multi-venue execution reconciliation, merchant settlement reconciliation | LED-01, TRD-01, PAY-01 |
| **PAY-01** | **Merchant & Payment Gateway** | **NEW** | Money-Critical / Compliance-Critical | Merchant onboarding surface, merchant account, payment intent, checkout, payment processing, merchant API surface, API credentials, webhooks, payout, refund, merchant transaction history | LED-01, FEE-01, ACC-01, CLT-01, API-01 |

**PAY-01 boundary.** PAY-01 consumes the shared ledger, compliance, settlement, reconciliation and fee modules; it **does not duplicate** them. Every capability beyond Doc 00 §5.2's approved PSO baseline is **`PENDING / FEATURE-LOCKED`** until its PSO-scope basis is verified (Doc 00 §12D). A public checkout surface requires its own perimeter analysis before exposure.

---

## 13. Spot Trading

| ID | Module | Status | Classification | Scope | Key dependencies |
|---|---|---|---|---|---|
| **OMS-01** | **Order Management & Pre-Trade Controls** | **NEW** | Money-Critical / Compliance-Critical | Client order store and lifecycle (including **unexecuted and cancellable** orders), order price/quantity controls, suspicious-order detection and blocking, automated pre-trade controls, sufficient-funds check, order records with ≥ 6-year retention | ACC-01, AST-01, CFG-01, LED-01 |
| **MKD-01** | **Market Data** | **NEW** | Compliance-Critical | External market-data ingestion, normalisation and **aggregated market depth**; pre-trade and post-trade information surfaces; market-data rights and redistribution control | LQD-01 |
| **LQD-01** | **Liquidity Provider & Venue Management** | **NEW** | Compliance-Critical / Vendor-Critical | **Provider-neutral** LP/venue registry, venue adapters, venue capability and health, asset and settlement capability, regulatory eligibility, counterparty exposure limits, **and the venue activation gate including the seven-days-prior notification requirement** | CFG-01, AST-01 |
| **EXE-01** | **Execution Routing** | **NEW** | Money-Critical | Execution policy, routing decision, **smart order routing** across approved venues, routing evidence and its **disclosability**, split-fill policy | LQD-01, MKD-01, OMS-01 |
| **TRD-01** | Trade Execution & Evidence *(Spot and OTC)* | **BLUEPRINT → EXTEND** | Money-Critical | Existing: quote/RFQ lifecycle, trade records, fills, slippage, partial fills, fill-conservation, no-internalisation, execution-time licence revalidation, settlement handoff, **multi-LP selection evidence (§5.23 — preserved)**. **Extension:** client-order-driven execution under Model A, split fills across venues, best-execution reasoning, subaccount scope | EXE-01, LED-01, AST-01 |
| **SUR-01** | **Market Surveillance & Trading Risk** | **NEW** | Compliance-Critical | Order and trade surveillance, suspicious-pattern detection, trading risk limits, post-trade monitoring | OMS-01, TRD-01, SEC-01 |

**No internal matching module exists FOR MB SPOT, and none may be created.** Model C is a **standing prohibition in every environment** (Doc 00 §7.7, §1.D.4), not a deferred capability. There is deliberately **no** MB-domain module for an AIX-operated order book, client-to-client crossing, matching engine, market making or principal liquidity.

**v1.4 re-scoping — read this carefully.** §16A introduces `EXO-01`, which **does** own a central order book and a matching engine. That is **a different domain**: securities / financial instruments / security tokens, under the Exchange regulatory route, not Money Broking. The statement above is re-scoped to **MB Spot** so that it continues to prohibit Model C without accidentally prohibiting the securities Exchange — the same drafting correction `DEC-012` clause 4 made for order-book *terminology*, now applied to module ownership.

**The boundary that makes the re-scoping safe (§19 rule 5A, Doc 00 §12E.4):**

> **No module in this section may call `EXO-01`.** Not `OMS-01`, not `MKD-01`, not `LQD-01`, not
> `EXE-01`, not `TRD-01`, not `SUR-01`. The Exchange matching engine's existence grants AIX Spot
> nothing, in any environment, under any approval outcome.

**`OMS-01`'s client order store must never hold mutually executable AIX client orders.** **`EXE-01` is a router, not a matcher.**

**All six modules in this section are BUILD-authorised** (§5.4) and available in DEVELOPMENT / TEST / UAT / DEMO against mock venues. Production activation follows Doc 00 §20.1 and the per-venue gates in §7A.

**Order types are not activated by this index.** Market / Limit / Cancel are architectural baseline candidates; Stop, Stop-Limit, IOC, FOK and GTC require specific product-rule review before production activation and may be **implemented behind product/configuration gates** (Doc 00 §11B, §20.1).

---

## 14. OTC

| ID | Module | Status | Scope |
|---|---|---|---|
| **TRD-01** *(shared)* | Trade Execution & Evidence | RFQ / block execution: quote request, external quote sourcing, LP selection with recorded reasoning, quote acceptance, pre-funded hold, execution, DvP handoff, confirmation |
| **LQD-01** *(shared)* | LP & Venue Management | Approved counterparty sourcing for RFQ |
| **LED-01**, **REC-01**, **FEE-01** *(shared)* | — | Holds, DvP settlement, reconciliation, fees |

**OTC has no separate product module.** Its RFQ lifecycle is `TRD-01`'s existing accepted blueprint scope (quote lifecycle, pre-funded hold, DvP, settlement handoff, three-way reconciliation), and it shares venue connectivity and execution evidence with Spot. Creating a parallel OTC execution module would duplicate that work and risk divergent execution-integrity rules. Internal matching is prohibited in OTC exactly as in Spot.

---

## 15. RWA

Four modules covering the full nineteen-stage lifecycle (Doc 00 §12B.1). **Consolidated deliberately: MODULE ≠ SERVICE, and nineteen capabilities do not require nineteen modules.**

| ID | Module | Status | Classification | Scope | Key dependencies |
|---|---|---|---|---|---|
| **RWA-01** | **Issuer & Asset Onboarding** | **NEW** | Compliance-Critical | Issuer management, issuer due diligence, asset onboarding, asset verification and supporting evidence, classification request into AST-01 | CLT-01, KYC-01, AST-01 |
| **RWA-02** | **Structuring, Token Configuration & Issuance** | **NEW** | Compliance-Critical / Money-Critical | Structuring, token configuration, transfer-restriction configuration, smart-contract orchestration, issuance and initial holder recording | RWA-01, AST-01, LED-01, WLT-01 |
| **RWA-03** | **Offering, Subscription & Allocation** | **NEW** | Money-Critical | Offering setup and terms, subscription intake, investor eligibility determination, allocation | RWA-02, ACC-01, LED-01, CFG-01 |
| **RWA-04** | **Holder Registry & Asset Servicing** | **NEW** | Compliance-Critical / Money-Critical | Holder registry, transfers with enforced restrictions, servicing, corporate actions, distributions, redemption | RWA-02, LED-01, ACC-01 |

**RWA reuses the shared core.** Identity, KYB/UBO, AML, account hierarchy, asset registry, ledger, settlement, reconciliation and audit are consumed, never re-implemented.

**All four RWA modules are BUILD-authorised** (§5.4, `DEC-013` clause 7) and available in DEVELOPMENT / TEST / UAT / DEMO **against synthetic assets** (`MIG-010`). *(v1.4 change: v1.3 gated the build as well as the activation.)*

**Every RWA capability's PRODUCTION ACTIVATION is gated.** Classification precedes everything (Doc 00 §12B.2). The **securities route's production activation** is closed pending `R4-Q2` and `R1-Q1b`; the non-security route pending `R4-Q6`/`R4-Q7`; **unresolved classification fails closed in production**. Secondary-market eligibility is an `AST-01` flag derived from classification and routes to `EXM-01` admission (§16A.5).

**Unresolved classification does not prevent** development of the RWA software, testing with synthetic assets, development of workflows, or UAT and controlled demo. **It prevents live activation of that asset.**

**Regulatory and holder reporting** is `RPT-01`'s, not a fifth RWA module.

---

## 16. Platform Surfaces, Reporting and Assurance

| ID | Module | Status | Classification | Scope | Key dependencies |
|---|---|---|---|---|---|
| **API-01** | **Institutional API & Integration** | **NEW** | Security-Critical | Institutional API surface, **client-facing API credentials**, webhooks, API-layer rate limiting and versioning | IAM-01, IAM-02, ACC-01, FND-01 |
| **RPT-01** | **Reporting & Regulatory Reporting** | **NEW** | Compliance-Critical | Client, issuer, internal and regulatory reporting; statements; evidence export | LED-01, TRD-01, REC-01, SEC-01 |
| **PRT-01** | Client / Staff / Admin Portal Workflows | **BLUEPRINT → EXTEND** | MVP | Institutional client portal, staff operations and admin surfaces. **Extension:** four-product information architecture, subaccount-aware navigation | All product modules |
| **INC-01** | Incident / Freeze / Recovery | **BLUEPRINT** | Security-Critical | Incident handling, freeze, recovery | SEC-01, LED-01 |
| **E2E-01** | Cross-Module End-to-End Fund-Flow Assurance | **BLUEPRINT → EXTEND** | Money-Critical | End-to-end fund-flow assurance. **Extension:** four-product flows | All money modules |

---

## 16A. AIX Exchange — Securities Market Domain

**New in v1.4. `DEC-013` clause 12; Doc 00 §12E; `STR-03` §9.**

**Domain:** securities / financial instruments / security tokens. **Not** digital-currency Spot.

All four are **NEW**, **BUILD-authorised** (§5.4), available in DEVELOPMENT / TEST / UAT / DEMO
against synthetic instruments with non-live execution, and **production activation DISABLED**
pending `R1-Q1b` and Doc 00 §21.

| ID | Module | Status | Classification | Scope | Key dependencies |
|---|---|---|---|---|---|
| **EXM-01** | **Exchange Market & Instrument Administration** | **NEW** | Compliance-Critical | Instrument admission and listing; listing status and lifecycle; securities / security-token market configuration; trading calendar and sessions; **trading halts**; market operations | AST-01, CFG-01, RWA-02 |
| **EXO-01** | **Exchange Order Book & Matching Engine** | **NEW** | Money-Critical / Compliance-Critical | Exchange order entry; **central order book**; **matching engine**; execution generation; price/time priority; Exchange market data and market depth; Exchange order and trade history | EXM-01, EXP-01, AST-01, CFG-01 |
| **EXC-01** | **Exchange Clearing & Settlement Interface** | **NEW** | Money-Critical | Post-trade Exchange-domain clearing and settlement interfacing; corporate-action interaction; holder-registry and transfer-control handoff to `RWA-04` and `AST-01` | EXO-01, LED-01, RWA-04, AST-01 |
| **EXP-01** | **Exchange Participation & Eligibility** | **NEW** | Compliance-Critical | Investor / participant eligibility for the Exchange; market permissions; **transfer restrictions at the market boundary**; participant admission | CLT-01, ACC-01, KYC-01, AST-01, CFG-01, IAM-02 |

### 16A.1 Why four, and why not more

**MODULE ≠ SERVICE, and a venue's capabilities do not require a module each.** Four ownership
boundaries are the minimum that keeps four genuinely different concerns apart: **what may be
listed** (EXM-01), **how orders meet** (EXO-01), **what happens after a match** (EXC-01), and
**who may participate** (EXP-01).

**Deliberately not created:**

| Not created | Owner instead | Reason |
|---|---|---|
| Exchange surveillance module | **`SUR-01` extends** | Surveillance logic is shared; only the domain differs. A second surveillance module would split detection authority |
| Exchange reporting module | **`RPT-01` extends** | Reporting is a platform capability |
| Exchange API module | **`API-01` extends** | One institutional API surface, credentials and webhook platform |
| Exchange asset registry | **`AST-01`** | The Asset & Instrument Registry is platform-wide by Doc 00 §12A; a second registry would let eligibility drift from classification |
| Exchange ledger / settlement | **`LED-01`** | Sole source of balances |
| Exchange client / account identity | **`CLT-01`, `ACC-01`** | No second identity domain |

### 16A.2 The boundary — binding, permanent, environment-independent

> **`EXO-01` belongs ONLY to the securities Exchange domain. It must NOT be reused, reachable or
> callable as the MB Spot client-matching engine.**

1. **No Money-Broking-domain module may call `EXO-01`** — not `OMS-01`, `MKD-01`, `LQD-01`,
   `EXE-01`, `TRD-01` or `SUR-01` acting in its MB capacity (§19 rule 5A).
2. **`EXO-01` may not be invoked to execute an AIX Spot or AIX OTC client order**, in any
   environment, under any configuration.
3. **Model C remains permanently prohibited** (§17, Doc 00 §7.7, §1.D.4). The existence of
   `EXO-01` grants AIX Spot nothing.
4. **The boundary is not environment-conditional.** It holds identically in DEVELOPMENT, TEST,
   UAT, DEMO and PRODUCTION.
5. **`EXO-01`'s blueprint must carry this boundary as a module-level invariant** with its own
   test evidence, not as prose.

### 16A.3 Identifier namespace

**The `exchange.*` capability namespace is frozen as the MB-boundary prohibition namespace and is
NOT reused** (`DEC-013` clause 10; Doc 00 §9A, §12E.5). Exchange capabilities use the reserved
**`securities_market.*`** namespace (`MIG-007`), and Exchange routes mount under a prefix that
avoids the frozen boot-guard fragments. **Nothing is seeded or renamed by this index.**

### 16A.4 Code migrations these modules depend on

| ID | Requirement | Effect if absent |
|---|---|---|
| `MIG-005` → `MIG-004` | Five-environment model and `CFG-01` environment scope | A capability can only be enabled everywhere or nowhere |
| `MIG-007` | `securities_market.*` namespace seeded | No capability control for Exchange |
| `MIG-010` | Synthetic / test instrument classification | No instruments to test against |
| `MIG-001` | Domain- and environment-aware boundary guard | **`EXO-01` cannot boot** — architecture and specification proceed, implementation does not |
| `MIG-009` | Permission grantability separated from activation | Exchange roles cannot be modelled safely |

**None is authorised by this index.** Each is a controlled implementation task (Doc 00 §25.3).

### 16A.5 RWA → Exchange secondary-market route

```txt
RWA-01 → AST-01 classification = SECURITY / SECURITY TOKEN → RWA-02 issuance
  → RWA-03 offering/allocation → RWA-04 holder registry
  → AST-01 secondary-market eligibility (derived from classification, never set independently)
  → EXM-01 admission / listing → EXP-01 investor eligibility + transfer restrictions
  → EXO-01 Exchange trading → EXC-01 clearing / settlement interface
  → LED-01 settlement postings + RWA-04 holder registry update / transfer control
  → RPT-01 reporting
```

**Built now; production activation gated at every arrow.**

---

## 17. Locked and Prohibited Capabilities

**Split into three in v1.4.** v1.3's single table conflated capabilities that must never exist
with capabilities whose *production activation* is gated. The first must never become modules;
the second **are** modules (§15, §16A) whose activation is closed.

### 17.1 Capabilities that must never become modules — permanent, every environment

| Capability | Status | Basis |
|---|---|---|
| AIX-operated order book **for digital currency / MB Spot** | **STANDING PROHIBITION** | Doc 00 §7.7, §1.D.4; LFSA-MB-2024 ¶1.1 |
| Internal client-to-client matching / crossing / netting | **STANDING PROHIBITION** | Doc 00 §7.7, §4.1, §1.D.4 |
| **Matching engine for MB Spot** | **STANDING PROHIBITION** | Doc 00 §7.7. **`EXO-01` is the securities Exchange matching engine and is a different domain (§16A.2)** |
| AIX market making | **STANDING PROHIBITION** | LFSA-MB-2024 ¶1.1 |
| AIX principal liquidity / principal dealing | **STANDING PROHIBITION** | LFSA-MB-2024 ¶1.1 |
| Public market API **for an AIX-operated digital-currency market** | **STANDING PROHIBITION** | Doc 00 §6 |
| Reuse of `EXO-01` by any MB-domain module | **STANDING PROHIBITION** | Doc 00 §12E.4; §16A.2; §19 rule 5A |

`CAPABILITY_BUILD_STATE = NOT_SPECIFIED`, permanently. **DISABLED in DEVELOPMENT, TEST, UAT,
DEMO and PRODUCTION.** `PRODUCTION_ACTIVATION_STATE = PROHIBITED_PERMANENT`. **No Exchange
approval of any scope unlocks any of them.**

### 17.2 Capabilities that ARE modules, with production activation gated

**These are not in §17.1. They are built now** (`DEC-013` clause 7).

| Capability | Module | Build | Production |
|---|---|---|---|
| Securities / financial-instrument Exchange | `EXM-01`, `EXO-01`, `EXC-01`, `EXP-01` | **BUILD** | **DISABLED** pending `R1-Q1b`, Doc 00 §21 |
| Security-token issuance and secondary market | `RWA-02`, `RWA-04`, `AST-01`, `EXM-01`, `EXO-01` | **BUILD** — synthetic instruments only | **DISABLED** pending `R4-Q2`, `R1-Q1b`; `securities.token_trading` production lock |
| Non-security RWA issuance and servicing | `RWA-01`…`RWA-04` | **BUILD** | **DISABLED** pending `R4-Q6`, `R4-Q7` |
| AIX Pay beyond the Doc 00 §5.2 baseline | `PAY-01` | **BUILD** | **PENDING / FEATURE-LOCKED** pending `R5-Q1`, `R5-Q2` |
| Multi-venue / smart order routing (Model B) | `EXE-01`, `LQD-01` | **BUILD** | **DISABLED per venue** — §7A gates incl. seven-day notification |

*(v1.3 listed the first two rows in the locked table with no build dimension. That is the
development blocker `DEC-013` removes. **The production position is unchanged.**)*

### 17.3 Out of product scope — no modules, no development effort

| Capability | Status | Basis |
|---|---|---|
| Derivatives, perpetual futures, futures | **PROHIBITED — out of scope** | Doc 00 §8.1, §20.6; `DEC-013` clause 6 |
| Margin trading, leveraged trading | **PROHIBITED — out of scope** | Doc 00 §8.1, §20.6 |
| Lending / borrowing of client assets | **PROHIBITED — out of scope** | Doc 00 §8.1, §20.6 |
| Staking, yield / earn, DeFi yield | **PROHIBITED — out of scope** | Doc 00 §8.1, §20.6 |
| Privacy coins, algorithmic stablecoins, MYR pairs | **PROHIBITED** | Doc 00 §8.1; `AST-01` admissibility locks |
| Self-custody wallet service | **PROHIBITED** | Doc 00 §8.2 |

**Superseded taxonomy.** v1.2's `FUT-01`…`FUT-12` future-locked group is superseded by §17.1–§17.3. `FUT-09`–`FUT-11` (resting limit, stop-limit, GTC/post-only/IOC/FOK) were **order-type classifications, not licence locks**, and are governed by Doc 00 §11B's product-rule gate; they may be implemented behind product/configuration gates.

---

## 18. Recommended Build Sequence

Derived from the dependency relationships in §6–§16, not assumed.

```txt
PHASE A — Foundation / control plane                 [ACCEPTED]
  FND-01 → IAM-01 → IAM-02 → SEC-01 → CFG-01

PHASE B — Client / compliance tier                   [ACCEPTED / PARTIAL]
  CLT-01 → KYC-01 → AML-01 → WLT-01

PHASE C — NEW INSTITUTIONAL FOUNDATIONS              [must precede the money tier]
  ACC-01  (master account / subaccount)
  AST-01  (asset registry + classification gate)
  CFG-01 extension (capability eligibility)
  IAM-02 extension (subaccount-scoped permissions)

PHASE D — Money tier
  LED-01 (consumes DEC-011 — schema not frozen before Phase C)
  FEE-01 → TRE-01
  DEP-01 → REC-01 foundations
  WDR-01 [BLOCKED on KMS]

PHASE E — Execution tier
  LQD-01 → MKD-01 → OMS-01 → EXE-01 → TRD-01 → SUR-01

PHASE F — Product tier
  PAY-01                          (Pay)
  RWA-01 → RWA-02 → RWA-03 → RWA-04   (RWA)

PHASE F2 — Securities Exchange tier          [NEW in v1.4]
  EXP-01 → EXM-01 → EXO-01 → EXC-01
  requires: AST-01, CFG-01 environment scope, LED-01, RWA-02/RWA-04 for
            security-token instruments

PHASE G — Platform surfaces
  API-01 · RPT-01 · PRT-01
  (API-01, RPT-01 and SUR-01 each extend into the Exchange domain)

PHASE H — Assurance / resilience
  E2E-01 · INC-01

PHASE I — Integrated testing, UAT, controlled demo, go-live readiness
```

**Why Phase C precedes Phase D.** Each Phase C module changes either the identity of a ledger account or the gate in front of a posting. Deciding them after `LED-01` ships converts a document change into an account-identity migration across live double-entry records, balances, holds and reservations.

**Why Phase F2 follows Phase F.** The Exchange is last among the products **not because it is optional** — `DEC-013` clause 7 confirms it — but because it depends on the Asset & Instrument Registry for classification and admission, on the ledger and settlement tier for post-trade, and on the RWA issuance path for the security-token instruments it will list. Building it earlier would mean building it against interfaces that do not yet exist.

**Why `EXP-01` precedes `EXO-01`.** Eligibility and transfer restrictions must exist before orders can be entered. An Exchange that matches first and checks participation afterwards is a control failure, not a sequencing preference.

**Capability-control plane precedes everything.** `MIG-005` → `MIG-004` (five environments and `CFG-01` environment scope) is Phase A work. Without it a capability can only be enabled in all five environments or none, which defeats the entire build-unlocked / production-gated model.

---

## 19. Module Dependency Rules

1. **No money movement without ledger.** No module may alter a balance except through `LED-01`.
2. **No execution without eligibility.** `OMS-01` and `TRD-01` must pass `CFG-01` capability evaluation and `AST-01` asset eligibility before routing.
3. **No asset without classification.** No product may admit an asset whose `AST-01` classification is unresolved — **fail closed**.
4. **No venue without approval.** `EXE-01` may route only to venues `LQD-01` records as approved, due-diligenced and **notification-complete**.
5. **No internalisation in Money Broking.** No MB-domain module may match one AIX client's order against another's. Every AIX Spot and AIX OTC client fill binds to a distinct **external** venue or counterparty fill.
5A. **Exchange domain isolation.** **No MB-domain module may call `EXO-01`, `EXM-01`, `EXC-01` or `EXP-01`, and no Exchange-domain module may execute an AIX Spot or AIX OTC client order.** The boundary holds identically in all five environments and under any approval outcome (§16A.2, Doc 00 §12E.4). `EXO-01`'s blueprint carries this as a module-level invariant with its own test evidence.
5B. **No securities instrument in a Money Broking product.** No instrument whose `AST-01` classification is `SECURITY / SECURITY TOKEN` may be admitted to AIX Spot or AIX OTC, in any environment (Doc 00 §12A).
6. **No duplicate identity.** `CLT-01` is the sole owner of legal entity and membership; `ACC-01` owns accounts only.
7. **No duplicate capability control.** `CFG-01` is the sole capability-eligibility authority.
8. **Product modules consume shared core.** `PAY-01` and `RWA-01`…`RWA-04` must not re-implement ledger, compliance, settlement or reconciliation.
9. **Audit is mandatory.** Every sensitive action emits `SEC-01` audit evidence.
10. **Maker-checker where required.** Governed mutations route through `IAM-02` approval.
11. **No permission activates a capability.** A permission grant is one input; access additionally requires environment availability, product activation, asset/instrument eligibility and — in PRODUCTION — the regulatory gate (Doc 00 §21A rule 3). *(New in v1.4.)*
12. **No control is relaxed in a non-production environment.** Audit, permission, KYC/KYB, AML, Travel Rule, ledger and balance integrity, client approval, LP settlement approval and break-glass logging apply identically in all five (Doc 00 §21A rule 7). *(New in v1.4.)*
13. **No non-production state promotes itself.** Capability state does not propagate between environments; promotion is a governed, maker-checker-approved act (Doc 00 §1.E rule 3). *(New in v1.4.)*
14. **Synthetic instruments are non-production only.** A synthetic or test classification fails closed in PRODUCTION and is never promotable into a production classification (`MIG-010`). *(New in v1.4.)*

---

## 20. Parallel Development Readiness

**Once Phase C and the `LED-01` core of Phase D are stable**, the following tracks have disjoint module ownership and may proceed concurrently. This is a statement of readiness, not an instruction to parallelise.

| Track | Modules | Shared dependencies (must be stable first) |
|---|---|---|
| **Execution** | LQD-01, MKD-01, OMS-01, EXE-01, TRD-01, SUR-01 | ACC-01, AST-01, CFG-01, LED-01 |
| **Payments** | PAY-01, DEP-01 | ACC-01, LED-01, FEE-01, CLT-01 |
| **RWA** | RWA-01 → RWA-04 | ACC-01, AST-01, LED-01, KYC-01 |
| **Securities Exchange** | EXP-01, EXM-01, EXO-01, EXC-01 | ACC-01, AST-01, CFG-01 environment scope, LED-01; RWA-02/RWA-04 for security-token instruments |
| **Platform surfaces** | API-01, RPT-01, PRT-01 | IAM-02, ACC-01 |
| **Assurance** | E2E-01, INC-01 | consumes all; sequence last |

**Ownership rule for concurrent work.** A track owns its modules exclusively. A change needed in a shared dependency (`ACC-01`, `AST-01`, `CFG-01`, `LED-01`, `IAM-02`) is **not** made inside a product track — it is raised as a change against the owning module and sequenced. This is what keeps concurrent tracks from colliding.

**Cross-track rule for the Exchange track (new in v1.4).** The Execution track and the Securities Exchange track have **disjoint module ownership and must not share execution code**. A utility extracted from `EXE-01` for reuse in `EXO-01`, or vice versa, is a design error: the two domains differ in regulatory route, permitted behaviour and permanence of prohibition, and shared execution code is the most likely route by which an MB matching capability could appear (§16A.2). Shared *platform* infrastructure — envelope, audit, idempotency, ledger posting, capability evaluation — is consumed from its owning module as normal.

**Extension tracks.** `SUR-01`, `RPT-01`, `API-01` and `AST-01` each extend into the Exchange domain. Those extensions are changes against the owning module, sequenced by that module's track — not work done inside the Exchange track.

---

## 21. Recommended Folder Structure

> **v1.3:** the authoritative layout is the live repository's `docs/` tree
> (`DOCUMENT_REGISTER.md` §6), not this illustrative listing. Master filenames below are
> updated to current versions; the rest is retained from v1.2 as an illustration only.

```txt
docs/01_masters/
  00_Licence_Scope_And_Feature_Lock_v1.5.md
  01_Project_Charter_v1.5.md
  02_Software_Requirement_Specification_v1.2.md
  03_Master_Module_Index_v1.4.md
  04_Role_And_Permission_Matrix.md
  05_Master_Workflow_Map.md
  06_Master_System_Rules.md
  07_Master_Data_Flow.md
  08_Master_Technical_Architecture.md
  09_Master_Security_Architecture.md
  10_Master_Testing_Strategy.md
  11_Master_Deployment_Strategy.md

  modules/
    01_foundation/
    02_identity_access_security/
    03_client_onboarding/
    04_compliance_aml/
    05_vendor_integrations/
    06_assets_market_config/
    07_product_broking/
    08_money_ledger_settlement/
    09_reporting_records/
    10_portals/
    11_operations_governance/
    12_securities_exchange/     (EXM-01, EXO-01, EXC-01, EXP-01 — v1.4)
```

Each module folder must follow the blueprint pack format stated in Section 4.

---

## 22. Additional Module Parameters

```txt
transaction_monitoring_engine = required
transaction_monitoring_rules = velocity_structuring_threshold_pattern
transaction_alert_to_case_link = required

withdrawal_destination_whitelist_required = true
withdrawal_destination_types = bank_account_and_crypto_wallet
withdrawal_new_destination_cooling_off = required
withdrawal_destination_maker_checker = required

professional_status_verification_required = true
retail_onboarding_lock_dependency = professional_status_verification

pre_funding_required_before_lp_execution = true
client_negative_balance = prohibited
hold_amount_cannot_exceed_available_balance = true
lp_execution_requires_prefunded_hold = true

vendor_integration_precedes_money_movement = true
custodian_bank_lp_integration_before_deposit_settlement = true

reconciliation_break_management = required
reconciliation_break_escalation = required
reconciliation_break_audit_trail = required

asset_whitelist_owner = AST_enforce_CMP_review
per_module_regulatory_mapping = required_for_all_compliance_critical_modules
per_module_data_classification = required_for_all_pii_sensitive_modules

complaints_dispute_management_module = optional_later
data_subject_rights_privacy_module = optional_later
```

---

## 23. Claude Model Usage

### 23.1 ChatGPT 5.5

Use for:

1. Master module design.
2. SDLC documentation.
3. Module blueprint drafting.
4. Workflow and state-machine planning.
5. Database/API planning.
6. Security and compliance mapping.
7. Claude prompt creation.

### 23.2 Claude Opus

Use for:

1. Review of this Master Module Index.
2. Review of high-risk modules.
3. Licence boundary review.
4. Ledger/custody/settlement review.
5. AML/Travel Rule review.
6. Security/RBAC/audit review.

### 23.3 Claude Sonnet

Use later for:

1. Coding module skeletons.
2. Backend implementation.
3. Frontend implementation.
4. Test implementation.
5. Refactoring.

Do not use Sonnet yet for coding until module blueprints are approved.

### 23.4 Claude Fable

Use later for:

1. UX wording.
2. Error messages.
3. Client-facing explanations.
4. Empty states.
5. Onboarding guidance.

---

## 24. Claude Opus Review Prompt (historical — v1.2)

> **HISTORICAL ARTEFACT. Retained verbatim, not rewritten.** The prompt below reviewed **v1.2**
> and reflects v1.2's product framing (single Money Broking product, "MB Spot Broking Terminal",
> the superseded `FUT-xx` future-locked grouping). It is **not** a live instruction and is not
> the review prompt for v1.3. It is preserved because it is part of v1.2's review trail.
>
> **A v1.3 review prompt must cover:** the single-taxonomy resolution (§5); accepted-ID
> preservation; the four product pillars having real module ownership; shared-core ownership
> without duplication; the absence of any internal-matching module (§13, §17); standing
> prohibitions versus pending-approval locks (§17); `DEC-011`'s effect on `ACC-01`/`LED-01`;
> `DEC-012`'s effect on `TRD-01`/`OMS-01`/`EXE-01`; and the parallel-development ownership rule
> (§20).


```txt
Review this 03_Master_Module_Index_v1.2.md as a principal fintech platform architect.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending.
- This module index is based on:
  - 00_Licence_Scope_And_Feature_Lock_v1.3.md
  - 01_Project_Charter_v1.3.md
- Platform must support OTC/RFQ, MB Spot Broking Terminal, external LP-backed agency/back-to-back execution, onboarding, KYC/KYB, AML, Travel Rule enforcement, ledger, payment, settlement, audit log, maker-checker, reporting, admin/staff/client portals, custody/vendor/bank integration, and governance controls.
- AIX revenue model is disclosed brokerage fee only.
- AIX spread markup, principal dealing, market making, internal matching, and client-to-client matching are blocked.
- Exchange order book, matching engine, public market depth, and public exchange trading must remain locked.
- MVP client scope is institutional and HNWI/professional only. Retail onboarding is disabled by default.

Review for:
1. Missing modules.
2. Modules that should be merged or split.
3. Wrong module sequencing.
4. Missing dependencies.
5. Missing licence boundary controls.
6. Missing money-movement controls.
7. Missing custody/client-money safeguarding controls.
8. Missing AML/Travel Rule controls.
9. Missing audit/RBAC/security controls.
10. Any module that may accidentally allow exchange-like or principal-dealing behaviour.
11. Any Future-Locked Exchange module that should not be documented or wired yet.
12. Whether the blueprint pack structure is sufficient.

Do not write code.

This v1.2 includes the v1.1 fixes, corrects the Module Blueprint Priority List numbering, makes Regulatory Mapping mandatory for all Compliance-Critical modules, makes Data Classification mandatory for all PII/sensitive-data modules, and reconciles Phase C build sequencing with CLT-14, CMP-21, and the other MVP-Critical compliance modules.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional modules or parameters to add.
```

---

## 25. Next Document

After this Master Module Index is reviewed and accepted, the next document should be:

```txt
02_Software_Requirement_Specification.md
```

Reason:

The SRS can now be written using a controlled 37-module catalogue and dependency structure.

**Re-baseline sequence (Doc 00 v1.5 §25.1):** SRS `v1.3` → Role & Permission Matrix `v1.3` →
Master Workflow Map `v1.3` → Master System Rules `v1.3` → module blueprints (including the four
new Exchange blueprints) → the `MIG-001`…`MIG-010` controlled code migrations.
