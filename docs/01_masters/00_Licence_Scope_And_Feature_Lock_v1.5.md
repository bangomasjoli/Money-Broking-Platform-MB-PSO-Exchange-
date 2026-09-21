---
document_id: ARC-00
title: Licence Scope & Feature Lock
version: v1.5
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Licence scope / feature-lock governance
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: v1.0, v1.1, v1.2, v1.3, v1.4 (archived)
baseline_commit: 056a10f
---

# 00 Licence Scope and Feature Lock  
# AIX Institutional Digital Asset & Tokenized Securities Platform

> ## APPROVED — AUTHORITATIVE
>
> **This is the authoritative Doc 00.** `v1.5` re-baselines the document on **`DEC-013` — the
> build-unlocked / production-gated capability model** (ACCEPTED), supported by the
> repository-wide lock review `STR-03`.
>
> **The governing principle this version introduces:**
>
> > **Unresolved regulation blocks production activation, not software development.**
>
> **`v1.4` is superseded prospectively and archived intact** at
> `90_archive/masters/00_Licence_Scope_And_Feature_Lock_v1.4.md`. It is not rewritten: its
> statements of what was decided, approved or locked at a past time remain accurate for the
> period they describe.
>
> **Derivation.** `v1.5` is derived from `v1.4` by controlled, section-by-section revision — not
> rewritten from scratch — so **every protection in v1.4 is retained unless this document
> explicitly says otherwise and gives a reason** (§8A and §6 record that review). It carries
> forward `DEC-011` (institutional account hierarchy) and `DEC-012` (Model A accepted, Model B
> gated, **Model C blocked**, the order / market-depth terminology rules, the product
> terminology direction, and the Asset & Instrument Registry securities-feature gate), and adds
> `DEC-013` and `STR-03`.
>
> **What changes.** A capability's **build state**, its **availability per environment**, its
> **production activation state** and its **product/asset eligibility** become four separate
> facts (§1.D) across five environments (§1.E). **AIX Exchange** — the securities /
> financial-instrument / security-token market capability — becomes a real target product whose
> architecture, specification, implementation and testing are authorised (§12E), as does the
> full **AIX RWA** asset-lifecycle platform (§12B) and the full **AIX Pay** platform (§12D).
> Capability matrices in §20 gain build-state and environment-availability dimensions.
>
> **What does not change — stated first because it is what matters most.**
> - **Model C remains a standing prohibition in every environment, including local development**
>   (§7.7, §1.D.4). Internal client-to-client matching, an AIX-operated central order book for
>   MB Spot, crossing or netting one client's order against another's, AIX principal dealing,
>   AIX proprietary market making and AIX principal liquidity may not be built, tested, demoed
>   or enabled anywhere, ever.
> - **The securities Exchange matching engine is a different domain and grants MB Spot nothing**
>   (§12E.4).
> - **Derivatives, futures, margin, leverage, lending, staking, yield, privacy coins,
>   algorithmic stablecoins and MYR pairs remain out of scope** (§8.1).
> - **Every fail-closed control survives verbatim** (§9.3, §21). Unknown state denies.
> - **The asset classification gate stands in every environment** (§12A): an asset bearing the
>   features of securities must never enter AIX Spot or AIX OTC through the Money Broking route.
>
> **This document claims no regulatory approval AIX has not received.** It does not approve the
> scope of AIX's Exchange approval, any live securities activity, any RWA issuance or listing in
> production, any specific venue or counterparty, any production order type, or any specific
> asset. Every unresolved question in §23 continues to hold its capability's **production
> activation** closed — §21.
>
> **Integrity note.** CFG-01 vendors a Doc 00 baseline
> (`services/cfg1/src/lib/doc00-baseline.ts`, `DOC00_SOURCE_VERSION = "v1.3"`) whose hash is
> sealed into the database. **The seal remains valid after this promotion**: v1.5 changes
> neither the licence status nor the seeded prohibited-feature registry, so both hash inputs are
> unchanged. The version label is now two versions stale; bumping it would itself change the
> computed hash and require a reseal migration, recorded as `MIG-008` (§25.3), not actioned
> here. **No code, migration, test, seeded identifier, sealed hash or runtime guard is changed
> by this document.**

## Document Control

| Item | Details |
|---|---|
| Document name | 00_Licence_Scope_And_Feature_Lock_v1.5.md |
| Platform | AIX Institutional Digital Asset & Tokenized Securities Platform |
| Document type | SDLC Phase 0 / Licence Scope Control |
| Version | v1.5 |
| Status | **APPROVED / AUTHORITATIVE.** Supersedes v1.4, which is archived |
| Prepared for | Development, architecture, compliance, product, and system design |
| Primary purpose | Lock approved licence scope; separate **build state**, **environment availability**, **production activation** and **product/asset eligibility** into four distinct facts; enforce agency/intermediary execution through approved external counterparties; prohibit internal client-to-client matching in every environment; and define production activation gates |
| Derived from | `v1.4`; `DEC-011`; `DEC-012`; **`DEC-013`**; `STR-01`; `STR-02` (evidence register §0.2); **`STR-03`** (lock review and migration register) |

---

## 1. Purpose

This document defines the licence scope, feature activation rules, locked capabilities, prohibited functions, and development boundaries for the AIX Institutional Digital Asset & Tokenized Securities Platform.

### 1.A Product architecture versus regulatory permission

**The single most important rule in this document.** These are two different things and must never be conflated:

| | Meaning | Governed by |
|---|---|---|
| **Product architecture** | What the platform is *designed and built* to be capable of | This document, `DEC-011`, `DEC-012`, the SRS and module blueprints |
| **Regulatory permission / activation** | What AIX is *permitted to operate*, and what is actually *switched on in production* | AIX's licences and approvals, the capability matrix in §20, and the feature-lock model in §21 |

**A product may exist architecturally while individual capabilities remain disabled pending applicable regulatory approval.** Designing a capability is never permission to operate it. Naming a product is never permission to offer it. Nothing in this document becomes enabled because it is described here.

**`DEC-013` completes this rule in the other direction.** v1.4 established that architecture does not confer permission. v1.5 establishes that the absence of permission does not forbid architecture:

> **Unresolved regulation blocks production activation, not software development.**

A confirmed target capability may be **architected, specified, implemented, tested, and made available in development, automated testing, UAT and controlled demo** while its production activation remains gated. This authorises no live regulated activity, asserts no approval AIX has not received, and removes no classification, licence, eligibility, counterparty or activation control. §1.D gives the state model that makes the two directions coexist safely; §7.7 and §1.D.4 give the boundaries it may never cross.

### 1.B What this document prevents

The purpose is to prevent the platform from being developed as:

1. A generic crypto exchange.
2. An unrestricted trading platform.
3. A proprietary trading platform.
4. A market maker platform.
5. A venue operating an internal client-to-client matching book for digital-currency trading (**Model C**, §7.7) — whether or not any Exchange approval exists.
6. A principal-dealing platform disguised as money broking.
7. A platform that admits an asset bearing the features of securities into a Money Broking product (§12A).
8. A platform where a capability becomes live through an absent or unresolved decision rather than an affirmative one (§21).
9. A platform where a single ambiguous boolean named `enabled` conflates *implemented*, *available in this environment*, *permitted in production* and *actually switched on in production* (§1.D). **That conflation is how a production capability gets activated by accident, and it is also how architecture gets blocked by a question that only concerns production.**

### 1.C Current licence position

The current licence position is:

1. Money Broking licence is approved.
2. Payment System Operator licence is approved.
3. Exchange application is still pending.

Therefore, the system may proceed with approved Money Broking and PSO-related capabilities, but **all securities / financial-instrument Exchange capability, and all digital-currency internal-matching capability, must remain locked** — the former pending the applicable approval, the latter as a standing prohibition under the Money Broking operating model (§7.7).

**Unchanged from v1.3 and v1.4:** the licence position itself. **AIX has not received any approval it did not hold before.** v1.5 changes how the platform's *capabilities* are stated and gated, not what AIX is licensed to do.

**What "locked" now means, precisely.** Where this document says a securities or RWA capability is locked, it means its **production activation** is closed (§1.D.3). It does **not** mean the capability may not be designed, built or tested (§1.D.1, §1.D.2). Where this document says a **Money Broking** capability such as internal client-to-client matching is prohibited, it means prohibited **everywhere, permanently, including in development** (§1.D.4, §7.7). The two are different and are never to be read as the same word.

### 1.D Capability state model — four independent states

**Approved by `DEC-013` clause 2. Binding on every downstream document, module blueprint, capability control and runtime guard.**

**A capability's status is four facts, never one.**

| # | State | Values | Owned by |
|---|---|---|---|
| **1** | **`CAPABILITY_BUILD_STATE`** | `NOT_SPECIFIED` → `SPECIFIED` → `IMPLEMENTED` → `TESTED` | Module blueprints, acceptance records, `MODULE_STATUS.md` |
| **2** | **`ENVIRONMENT_AVAILABILITY`** | per environment (§1.E): `ENABLED` / `DISABLED` / `NOT_APPLICABLE` | CFG-01 environment scope (`MIG-004`) |
| **3** | **`PRODUCTION_ACTIVATION_STATE`** | `DISABLED_PENDING_REGULATORY_ACTIVATION` / `DISABLED_PENDING_GOVERNANCE` / `DISABLED_BY_POLICY` / `PROHIBITED_PERMANENT` / `ACTIVE` | §21 gates; CFG-01 registry and kill switch |
| **4** | **`PRODUCT_ASSET_ELIGIBILITY_STATE`** | `NOT_ASSESSED` / `INELIGIBLE` / `ELIGIBLE`, per product × asset/instrument × client × jurisdiction × counterparty | AST-01 classification (§12A); CFG-01 eligibility |

**Binding rules:**

1. **These four are never collapsed into one boolean.** Where a single boolean named `enabled` already exists in code or configuration, it means state 3 — `PRODUCTION_ACTIVATION_STATE` — and nothing else.
2. **`CAPABILITY_BUILD_STATE = TESTED` is not permission.** It says the software works. It says nothing about whether AIX may operate it.
3. **`ENVIRONMENT_AVAILABILITY = ENABLED` in four environments is never evidence for the fifth.** PRODUCTION is decided only by state 3 and state 4.
4. **State 4 is evaluated in every environment.** A synthetic or test instrument is eligible only where the environment design says so; a real instrument is never eligible on the strength of a test classification.
5. **Unknown, unreadable, unresolved or absent → DENY**, in every state. Absence of a decision is never permission (§21).

**Worked example — the AIX Exchange matching engine (§12E):**

```txt
CAPABILITY_BUILD_STATE          : SPECIFIED  →  IMPLEMENTED  →  TESTED
ENVIRONMENT_AVAILABILITY        : DEVELOPMENT  ENABLED
                                  TEST         ENABLED
                                  UAT          ENABLED
                                  DEMO         ENABLED (synthetic instruments only)
                                  PRODUCTION   DISABLED
PRODUCTION_ACTIVATION_STATE     : DISABLED_PENDING_REGULATORY_ACTIVATION   (R1-Q1b)
PRODUCT_ASSET_ELIGIBILITY_STATE : NOT_ASSESSED for every real instrument
```

#### 1.D.4 The boundary this model may never cross

**Some capabilities have no build state, no environment in which they are available, and no path to activation. They are prohibited everywhere, permanently.**

```txt
CAPABILITY_BUILD_STATE          : NOT_SPECIFIED — and permanently so
ENVIRONMENT_AVAILABILITY        : DISABLED in DEVELOPMENT, TEST, UAT, DEMO and PRODUCTION
PRODUCTION_ACTIVATION_STATE     : PROHIBITED_PERMANENT
PRODUCT_ASSET_ELIGIBILITY_STATE : N/A
```

This applies to, and is not limited to:

1. **MB Spot internal client-to-client matching** — Model C (§7.7);
2. an **AIX-operated central order book for Money Broking Spot**;
3. **crossing, netting or internalising** one AIX client's order against another's;
4. **AIX principal dealing**;
5. **AIX proprietary market making**;
6. **AIX providing its own principal liquidity**.

**No environment value, capability state, feature flag, permission grant, service domain, configuration, kill-switch state or future Exchange approval may permit any of them.** *"Unlock Exchange development" is not, and may never be read as, permission to build any of the six.*

The control-bypass prohibitions (audit, permission, KYC, AML, Travel Rule, ledger and balance direct edit, client approval, LP settlement approval, break-glass logging) are equally permanent in every environment.

### 1.E Environment model

**Approved by `DEC-013` clause 2.** The capability-control architecture supports **five canonical environments**:

| Environment | Purpose | Regulated execution |
|---|---|---|
| **DEVELOPMENT** | Local and shared development | **Mock / synthetic only** |
| **TEST** | Automated unit, integration and end-to-end testing | **Mock / synthetic only** |
| **UAT** | User acceptance testing | **Mock / synthetic only** |
| **DEMO** | Controlled demonstration to named audiences | **Mock / synthetic / non-live only**, unless the applicable environment design explicitly permits otherwise |
| **PRODUCTION** | Live regulated operation | Subject to the full §21 production activation gate |

**Binding rules:**

1. **DEMO is not public production.** A controlled demo must use mock, synthetic or otherwise non-live regulated execution. It must never route a real client order to a real venue, move real client money, settle a real transaction, or issue a real instrument.
2. **Non-production must not use real client PII, live counterparty/LP credentials or live custodian credentials.** Sandbox or mock integrations only.
3. **No non-production configuration, feature state or capability state may propagate to PRODUCTION.** A promotion is an affirmative, governed, maker-checker-approved act, never an inheritance.
4. **Unknown or unrecognised environment is treated as PRODUCTION and fails closed.**
5. **A pre-production mirror of production inherits PRODUCTION's activation gate, not UAT's.** Where an existing environment identifier does not map cleanly onto these five, it fails closed until the mapping is decided (`MIG-005`, §25.3).
6. **`R6-Q1` is open** (§23): whether a controlled demo of a production-gated regulated capability to an **external** audience constitutes holding out an unapproved activity. Until answered, external DEMO exposure of Exchange and RWA capabilities fails closed; internal controlled demo is permitted.

---

This document must be read before preparing:

1. Project Charter.
2. Software Requirement Specification.
3. Master Module Index.
4. Database Design.
5. API Specification.
6. Frontend Page Map.
7. Claude Code implementation prompts.
8. Any production deployment plan.

---

## 2. Regulatory Reference Base

The platform must be designed with reference to the following Labuan FSA regulatory areas.

| Area | Reference |
|---|---|
| Money Broking | Guidelines on the Establishment of Money Broking Business in Labuan IBFC |
| Digital Money Broking Platform | Guidelines on the Management of Digital Money Broking Platform |
| Digital Financial Services | Labuan FSA DFS approval requirements |
| Market Conduct | Guidelines on Market Conduct for Labuan Digital Financial Intermediaries |
| Travel Rule | Guidelines on Travel Rule for Labuan Digital Financial Services |
| AML/CFT/CPF/TFS | Guidelines on AML/CFT/CPF and TFS for Labuan Key Reporting Institutions |
| Digital Currency Admission | Admissibility Framework for Digital Currencies |
| Payment / Settlement | PSO licence scope and relevant LFSA guidance |
| Outsourcing / External Vendors | LFSA external service / outsourcing expectations where applicable |
| Technology / Cyber Risk | Technology management, digital governance, security, access, logging, and monitoring expectations |

### 2.1 Developer Interpretation

For development purposes, the platform must be treated as:

```txt
A regulated Labuan Money Broking + PSO platform
providing institutional digital-currency Spot and OTC products
as intermediary/agent, executed through approved external
counterparties/venues, with payment capability under the PSO licence,
and with tokenisation and securities capability designed but gated
behind classification and applicable regulatory approval.

AIX never matches one client's order against another's.
```

### 2.2 Verified regulatory sources relied on by this version

Registered in full, with paragraph references and official URLs, in `STR-02` §0.2. Independently verified against the published documents.

| Ref | Source | Status |
|---|---|---|
| **LFSA-MB-2024** | Guidelines on the Establishment of Money Broking Business in Labuan IBFC, 9 September 2024 | In force |
| **LFSA-DMB-2025** | Guidelines on the Management of Digital Money Broking Platform (Final) | **Effective 1 January 2027 — see §22** |
| **LFSA-EXCH-WEB** | Labuan FSA Exchange business-area description | Generic; **not** evidence of AIX's own approval scope |

**Rule:** a provision establishes only what it says. Where this document relies on one, it cites it. Where no source establishes a proposition, the proposition is marked unresolved (§23) and the capability fails closed (§21).

---

## 2A. Product Terminology

Approved by `DEC-012` clause 5. **This is platform terminology, not regulatory permission** (§1.A).

| Term | Meaning | Regulatory route |
|---|---|---|
| **AIX Spot** | Digital Money Broking product for **eligible non-security digital currencies** | Money Broking |
| **AIX OTC** | Digital Money Broking **RFQ / institutional block-execution** product for eligible non-security digital currencies / instruments within applicable MB scope | Money Broking |
| **AIX Pay** | Payment product, subject to AIX's **actual PSO scope** and applicable requirements | PSO |
| **AIX RWA** | Real-world-asset tokenisation platform/domain | **Depends on classification** (§12B) |
| **AIX Exchange** | The **securities / financial-instrument / security-token market** capability. **Reserved terminology in v1.4; a confirmed target product capability from v1.5** (§12E) | Securities / Exchange — **production activation unresolved (§23)** |

**Binding naming rules:**

1. **"AIX Exchange" must never be used to describe BTC/USDT-style digital-currency Spot trading.** Spot is Money Broking.
2. Building the AIX Exchange capability **grants no securities permission** and asserts nothing about the scope of AIX's Exchange approval (§12C, §23). `DEC-013` authorises its architecture, specification, implementation and testing; it does not activate it in production.
2a. **"AIX Exchange" must never be used to describe, label or justify any MB Spot capability.** The Exchange domain's existence grants AIX Spot nothing (§12E.4).
3. **Historical records must not be silently rewritten.** Statements in prior versions and other documents describing what was approved or locked at a past time remain historically accurate and stand.
4. **Seeded configuration identifiers are frozen** and are not renamed by this document (§9A).

---

## 2B. Four Strategic Product Pillars

The platform is one institutional core with four product pillars. **Each pillar's architectural existence is independent of its regulatory activation** (§1.A, §20).

| Pillar | Product | Regulatory route | Activation |
|---|---|---|---|
| 1 | **AIX Spot** | Money Broking | Per §20; order types per §11B |
| 2 | **AIX OTC** | Money Broking | Per §20 |
| 3 | **AIX Pay** | PSO | Per §20; unverified features stay **PENDING / FEATURE-LOCKED** (§12D) |
| 4 | **AIX RWA** | Depends on classification | Per §20; **build unlocked**, production activation gated (§12B) |

**Plus one securities-market capability:**

| Pillar | Product | Regulatory route | Activation |
|---|---|---|---|
| 5 | **AIX Exchange** | Securities / financial instrument / security token | Per §20.5; **build unlocked** (`DEC-013` clause 7), **production activation gated** on `R1-Q1b` (§12C, §12E) |

**v1.5 change.** v1.4 recorded AIX Exchange as reserved terminology and not a pillar, because its scope was unresolved. Under `DEC-013` it is a **confirmed target product capability** whose software may be built now. **Its regulatory position is unchanged**: the scope of AIX's own Exchange approval remains unresolved (`R1-Q1b`) and no securities activity is activated in production.

**AIX Exchange is NOT ordinary BTC/USDT Spot.** It is the securities / financial-instrument / security-token market capability. Describing digital-currency Spot as "AIX Exchange" remains prohibited (§2A rule 1).

**Shared institutional core.** The four pillars share one core — identity, RBAC, maker-checker, KYC/KYB/UBO, AML, the Asset & Instrument Registry (§12A), the account hierarchy (§2C), ledger, settlement, reconciliation, audit and the capability-control plane. Pillars must not re-implement core controls independently.

---

## 2C. Institutional Client and Account Scope

**Client scope is unchanged from v1.3:** institutional clients and HNWI / professional clients only; retail onboarding disabled by default (§10.2A). No authoritative approval changing that exists, so v1.4 preserves it.

**Account hierarchy — `DEC-011` (ACCEPTED).** The canonical model is four distinct layers, which must never be collapsed into a single identifier:

```txt
Legal Entity / Client        ← owns the regulatory client relationship and legal ownership
  → Master Account           ← top-level operational account structure
      → Subaccount           ← operational separation (e.g. Trading, Treasury, Payments, RWA)
          → Ledger Account   ← accounting / posting primitive
```

Rules carried from `DEC-011`:

1. The **legal entity** owns the regulatory client relationship. It must **never** itself be treated as a ledger account and must **never** carry financial balances.
2. **Subaccounts are not separate legal clients.** They inherit legal ownership from the parent legal entity.
3. A legal entity may initially have one master account, but the model **must not assume** the relationship can never become one-to-many.
4. Authorised principals attach through the **existing** client-membership and IAM authority chain. A second, parallel organisation-membership system must not be created.

**Product eligibility may be scoped by** legal client, account, subaccount, product, asset, jurisdiction, regulatory status and compliance status (§20, §21). **This document does not design the schema** — that is `CLT-01` / `LED-01` work under `DEC-011`.

**Open, non-blocking:** whether institutional subaccounts attract distinct KYC, reporting or safeguarding treatment (`A2-Q1`), and whether subaccount segregation affects client-money safeguarding obligations (`A2-Q2`) — §23. Neither blocks the architecture; both must be answered **before subaccounts carry client money**.

---

## 3. Current Licence Status

| Licence / Approval | Status | System Treatment |
|---|---|---|
| Money Broking Licence | Approved | Active build scope |
| Payment System Operator Licence | Approved | Active build scope |
| Exchange Application | Pending | Locked until approval |

---

## 4. Licence Boundary Principles

The following principles control the whole platform.

### 4.1 Agency / Broker-Only Principle

AIX must act as broker/intermediary only under the Money Broking operating model.

**Source:** LFSA-MB-2024 ¶1.1 — money broking is **intermediary activity** and **excludes acting as principal, liquidity provider or market maker**. Items 1, 3 and 4 below restate that provision directly.

AIX must not:

1. Act as principal.
2. Take proprietary trading position.
3. Act as market maker.
4. Act as liquidity provider to its own clients under the Money Broking operating model.
5. Earn undisclosed spread margin.
6. Carry naked inventory or market risk.
7. **Match, cross or net one AIX client's order against another AIX client's order.**

**Correction to v1.3 — this is a strengthening, not a relaxation.** v1.3 item 7 read *"Match one AIX client against another AIX client **before Exchange approval**"*, which implied internal client-to-client matching would become permissible once an Exchange approval existed. That implication is wrong under the Money Broking operating model: ¶1.1 confines money broking to intermediary activity irrespective of any Exchange approval, and `DEC-012` clause 3 records internal matching as **BLOCKED / OUT OF SCOPE**, not deferred. The qualifier is therefore removed and the prohibition made standing.

**Scope of the correction.** It governs the Money Broking products (AIX Spot, AIX OTC). Whether a separately approved securities / financial-instrument Exchange capability could operate a matching venue **for securities** is a different question under a different framework, is **not authorised by this document**, and depends on `R1-Q1b` and the applicable securities framework (§12C, §23).

### 4.2 Revenue Model

The approved MVP revenue model is:

```txt
Disclosed brokerage fee / commission only.
```

The following are prohibited:

```txt
AIX spread markup as principal margin.
Hidden spread.
Undisclosed markup.
Principal-risk price absorption.
Market-making revenue.
```

If LP spread exists, it must be treated as LP pricing and disclosed transparently where applicable. AIX revenue must be recorded separately as brokerage fee or commission.

### 4.3 Execution Model

The approved MVP execution model is:

```txt
Agency back-to-back execution.
```

This means:

1. A client trade must be tied to a firm or secured LP leg.
2. AIX must not show an executable client quote unless the LP leg is firm or secured. No softer or undefined execution control is permitted.
3. Every brokered trade must be matched to a completed LP execution or approved counterparty leg.
4. AIX inventory limit is zero.
5. Naked position is not allowed.
6. If LP execution fails, the client trade must not be absorbed by AIX as principal.
7. LP failure handling is locked by this document: if LP execution fails, partially fills, or moves beyond the confirmed quote tolerance, the client trade must be voided, re-quoted, or unwound through reversal entries. AIX must not absorb the difference, hold residual inventory, or carry principal exposure.

---

## 5. Approved Build Scope

The following modules are approved for documentation, system design, and MVP development.

### 5.1 Money Broking Scope

Allowed modules:

1. Client onboarding.
2. KYC/KYB.
3. Beneficial ownership collection.
4. AML risk profile.
5. Source of funds / source of wealth.
6. **AIX OTC** — institutional RFQ / block broking.
7. **AIX Spot** — externally-routed agency execution (Model A, §7.3). *(v1.4: renamed from "MB Spot Broking Terminal" per §2A; same regulatory route.)*
8. Quote and order request to approved external counterparties.
9. Agency/back-to-back trade booking.
10. Disclosed brokerage fee calculation.
11. Client trade history.
12. Trade confirmation.
13. Reporting.
14. Audit log.

### 5.2 PSO Scope

Allowed modules:

1. Deposit workflow.
2. Withdrawal workflow.
3. Payment instruction.
4. Payment status tracking.
5. Settlement tracking.
6. Client money ledger.
7. Payment reconciliation.
8. Payment reference tracking.
9. Payment reports.

### 5.3 Compliance Scope

Allowed modules:

1. KYC/KYB review.
2. AML risk scoring.
3. Sanctions screening.
4. PEP screening.
5. Beneficial ownership.
6. Wallet screening.
7. Travel Rule enforcement.
8. AML case management.
9. STR / regulatory filing workflow.
10. Account freeze.
11. Account suspension.
12. Enhanced due diligence.
13. Compliance notes.
14. Compliance decision log.
15. Periodic CDD/KYC refresh.
16. Sanctions re-screening on list update.
17. Threshold transaction reporting.
18. Tainted-funds / mixer handling.

### 5.4 Platform Foundation Scope

Allowed modules:

1. Authentication.
2. MFA.
3. Role-based access control.
4. Feature flags.
5. Audit log.
6. Maker-checker.
7. Notification.
8. Document management.
9. Admin portal.
10. Staff portal.
11. Client portal.
12. System settings.
13. Reporting.
14. System health monitoring.

---

## 6. Locked Capability Scope

**Revised in v1.4.** v1.3 attributed every lock in this section to one cause — *"the Exchange application is pending"*. That conflated two different kinds of lock, and the conflation is why the platform had no vocabulary for a securities venue (`STR-02` §1.5: of 315 "Exchange" occurrences across the twelve masters, **zero** carried the securities meaning). This version separates them. **No lock is removed.**

**Revised again in v1.5.** v1.4's two lock classes still conflated *may not be operated* with *may not be built*, because neither class carried a build dimension. v1.5 splits the **PENDING APPROVAL** class in two. **No lock is removed, and no STANDING prohibition is touched.**

Three distinct lock classes:

| Class | Meaning | Build state (§1.D.1) | Lifts when |
|---|---|---|---|
| **STANDING PROHIBITION** | Outside the Money Broking operating model as a matter of what money broking *is* | **`NOT_SPECIFIED`, permanently.** Prohibited in every environment, including development | **Never by Exchange approval.** Would require a different licence basis and a new licence-scope revision |
| **BUILD-UNLOCKED / PRODUCTION-GATED** | A confirmed target capability whose production operation needs an approval or a resolved question AIX does not yet have | **May reach `TESTED`.** Available in DEVELOPMENT, TEST, UAT and DEMO per §1.E | **Production only**, when the applicable approval / resolution is obtained **and** the §21 gates pass |
| **PRODUCT-SCOPE PROHIBITION** | Outside the target platform's scope by owner decision | **`NOT_SPECIFIED`.** No development effort authorised | A new owner scope decision and a new licence-scope revision |

| Capability | Status | Class | Reason |
|---|---|---|---|
| AIX internal matching engine (digital currency) | **Locked** | **STANDING** | LFSA-MB-2024 ¶1.1 intermediary-only; `DEC-012` clause 3 |
| Client-to-client matching (digital currency) | **Locked** | **STANDING** | As above. **Corrected from v1.3**, which classed this as pending approval (§4.1) |
| AIX-operated central order book for MB Spot | **Locked** | **STANDING** | Would make AIX a venue operator; `DEC-012` clause 3 |
| Market maker engine | **Locked** | **STANDING** | ¶1.1 excludes market making |
| Principal dealing engine | **Locked** | **STANDING** | ¶1.1 excludes acting as principal |
| AIX providing its own principal liquidity | **Locked** | **STANDING** | ¶1.1 excludes acting as liquidity provider |
| Presenting AIX as operating a public digital-currency exchange | **Locked** | **STANDING** | Terminology and conduct; §2A rule 1, §8 |
| Securities / financial-instrument Exchange capability | **Production locked; build unlocked** | **BUILD-UNLOCKED / PRODUCTION-GATED** | Build authorised by `DEC-013` clause 7 (§12E). Production: Exchange application pending; **scope unresolved — `R1-Q1b`** (§12C, §23). **Changed in v1.5** from a single "Locked" state that forbade design |
| Security-token secondary market | **Production locked; build unlocked** | **BUILD-UNLOCKED / PRODUCTION-GATED** | Build authorised by `DEC-013` clause 7 (§12B, §12E). Production: `R4-Q2` unresolved. **Changed in v1.5** |
| Securities / security-token issuance and lifecycle (AIX RWA) | **Production locked; build unlocked** | **BUILD-UNLOCKED / PRODUCTION-GATED** | Build authorised (§12B). Production: `R4-Q1`…`R4-Q7` unresolved. **Changed in v1.5** |
| AIX Pay capability beyond the §5.2 baseline | **Production locked; build unlocked** | **BUILD-UNLOCKED / PRODUCTION-GATED** | Build authorised (§12D). Production: `R5-Q1`, `R5-Q2` unresolved. **Changed in v1.5** |
| Multi-venue / smart order routing (Model B) | **Production gated per venue; build unlocked** | **BUILD-UNLOCKED / PRODUCTION-GATED** | `DEC-012` clause 2; per-venue gates §7A |
| Derivatives, futures, perpetuals, margin, leverage, lending, staking, yield / earn, DeFi yield | **Locked** | **PRODUCT-SCOPE PROHIBITION** | §8.1. Reaffirmed out of scope by `DEC-013` clause 6. **No development effort authorised** |
| Privacy coins, algorithmic stablecoins where prohibited, MYR pairs where prohibited | **Locked** | **PRODUCT-SCOPE PROHIBITION** | §8.1; AST-01 admissibility locks |
| Public market API for an AIX-operated market | **Locked** | **STANDING** | Follows from the internal-matching prohibition |
| Stop, Stop-Limit, IOC, FOK, GTC order types | **Locked** | **SEPARATELY GOVERNED** | Not a licence lock — product-rule review (§11B). **Reclassified in v1.4**; see below |

**Reclassification of order types — the substantive change in this section.** v1.3 locked *"resting exchange limit orders"*, *"stop-limit order book"*, *"post-only"* and *"good-till-cancelled exchange orders"* as **Exchange order-book behaviour**. That classification was drafted on the assumption that a pending client order implies an exchange book. It does not: under **Model A** a client order is held in AIX's own order store and routed **externally** for execution, and **LFSA-DMB-2025 ¶6.4(i) expressly requires a control for the cancellation of unexecuted orders** — unexecuted client orders are a contemplated feature of a digital money broking platform, not exchange behaviour.

**Therefore:** order types are no longer locked *as exchange behaviour*. They are **separately governed** under §11B — Market, Limit and Cancel are architectural baseline candidates; Stop, Stop-Limit, IOC, FOK and GTC require specific product-rule review before any production activation. **This reclassifies the reason for the gate; it does not switch any order type on.** No order type is enabled by this document.

**`R3-Q1b` remains open** (`STR-02` §2.8): whether v1.3's *"resting exchange limit orders"* lock was ever intended to reach an OMS-pending order routed externally is an AIX-internal drafting question. v1.4 resolves it prospectively in the manner above; it does not assert that v1.3 meant something other than what it said.

### 6.1 Important Design Rule

The platform may display market information sourced from approved external counterparties/venues, but **must not represent that data as an AIX-operated order book**.

Allowed labels:

```txt
External Market Depth
Aggregated Market Depth
```

Prohibited label for digital-currency Spot:

```txt
AIX Order Book
AIX Exchange
```

See §11A for the full three-way distinction between a client order store, external market depth, and an internal matching book.

---

## 7. Externally-Routed Spot and OTC Model

**Provider-neutral.** AIX sources execution and liquidity from **approved external counterparties / liquidity providers / venues**. 

**v1.4 removes the provider-specific assumption in v1.3**, which read *"AIX may use Binance or another approved liquidity provider"* and set `primary_lp = Binance_or_approved_LP` (§7.5). **No provider is named, approved or assumed anywhere in this document.** See §7A for the counterparty abstraction and the approval path a specific provider must pass.

### 7.1 Approved Concept

The interface may present a professional institutional experience with:

1. Chart.
2. Asset pair selector.
3. **External / aggregated market depth** sourced from approved external counterparties, venues or market-data providers.
4. Order entry (§11B order types; activation separately governed).
5. Open orders and order history.
6. Trade history.
7. Asset and account summary.

**LFSA-DMB-2025 ¶5.9 (effective 1 January 2027 — §22)** makes pre-trade information (current bid prices, current offer prices, available asset volume, depth of trading interest, relevant communication methods) **and** post-trade information (price, trade time, volume of completed transactions, disclosed as close to real-time as technically feasible) **accessible during normal trading hours** a target operating requirement. Presenting market depth and post-trade data is therefore an expected capability of the target platform, not merely a permitted one.

### 7.2 Prohibited Terminal Behaviour

The terminal must not:

1. Let a client order rest inside an **AIX-operated matching book**.
2. Match a client order against another AIX client's order.
3. Display or imply an **AIX-operated** order book.
4. Display matching-engine output of an AIX-operated venue.
5. Use a market-maker or maker/taker fee model.
6. Display a trade tape in a way that implies AIX operates a public digital-currency exchange.
7. Redistribute external counterparty, venue or market-data-provider data without the required market-data rights.
8. Present any order type not activated under §11B.

**Changed from v1.3, with reasons:**

- v1.3 item 1 — *"Allow client to click LP depth level to execute directly"* — is **retained as a constraint but reclassified as unresolved**, not as a settled prohibition. It is `R3-Q2b` (§23): LFSA-DMB-2025 ¶5.9 establishes that depth must be *displayed*, and establishes nothing about executing against it. **Until `R3-Q2b` is answered, click-to-execute against displayed depth remains DISABLED** under the fail-closed rule (§21). It is listed in §23, not here, because it is an open question rather than a standing prohibition.
- v1.3 item 7 — *"Use GTC, post-only, stop-limit, or resting limit order behaviour in MVP"* — is replaced by item 8, which routes every order type through §11B's activation gate. **No order type is enabled by this change.**
- Items 1–6 of this list correspond to v1.3 items 2–6 and 8, retained in substance with "AIX order book" made explicit as "AIX-operated" to align with §11A's three-way distinction.

### 7.3 System Execution Model

The backend must follow this model (**Model A — `DEC-012` clause 1**, the target initial architecture for AIX Spot):

```txt
Institutional Client
↓
AIX Spot UI / API
↓
Client Order Store / OMS          ← records the client instruction and its lifecycle
↓
Eligibility and Pre-Trade Controls
↓
Execution Routing
↓
Approved External LP / Counterparty / Venue     ← execution happens HERE, never inside AIX
↓
Fill / Partial Fill
↓
AIX Ledger
↓
AIX Settlement
↓
AIX Reconciliation
```

**Model B — future technical capability (`DEC-012` clause 2, PRODUCTION-GATED):**

```txt
AIX OMS
↓
Market Data Aggregation
↓
Execution Policy
↓
Multi-LP / Smart Router
↓
Approved Venue Adapters
↓
External LPs / Venues
```

**Model B is a technical capability only. No venue is approved merely because the architecture supports it** (§7A). Routing policy must be configurable and auditable, and every routing decision must be reconstructable and disclosable — LFSA-MB-2024 ¶9.7(i) requires disclosure of order-routing procedures, the fair application of routing, third-party routing arrangements and any payment-for-order-flow / inducement arrangements. A simplistic "lowest price always wins" rule is expressly rejected.

The backend must not follow this model (**Model C — `DEC-012` clause 3, BLOCKED / OUT OF SCOPE**):

```txt
Client A order
↓
AIX-operated matching book
↓
Client-to-client execution
↑
Client B order
```

### 7.4 Externally-Routed Execution Rules

1. **Approved external counterparties / LPs / venues** may provide market data and liquidity. **No provider is named or pre-approved** (§7A).
2. External market depth may be displayed as **external / aggregated market depth**, attributed to its source class.
3. **Executing against displayed depth remains DISABLED** pending `R3-Q2b` (§23) — fail closed (§21).
4. Client execution must pass eligibility and pre-trade controls before routing (§7.3; LFSA-DMB-2025 ¶6.4(ii)).
5. AIX must record the external price snapshot relied on.
6. AIX must record the client order / instruction and its lifecycle (LFSA-DMB-2025 ¶5.5).
7. AIX must record the disclosed brokerage fee.
8. AIX must record the external execution reference where applicable.
9. AIX must record slippage where applicable.
10. AIX must not expose any external counterparty or venue API directly to the client.
11. AIX must not present external market depth as an AIX-operated order book.
12. **AIX must not operate an internal matching engine.** *(v1.3 qualifier "before Exchange approval" removed — §4.1.)*
13. **AIX must not match one AIX client against another AIX client.** *(Same correction.)*
14. External counterparty / venue outage must fail closed.
15. No internal fallback price source is allowed when the external source is unavailable.
16. **Sufficient funds must be available before execution** — LFSA-DMB-2025 ¶5.2 (target requirement, §22). This elevates the existing pre-funded model from an AIX-internal control to a target regulatory requirement.
17. Orders must be **executed promptly and on best available terms**, and must not be improperly withdrawn, delayed or withheld — LFSA-DMB-2025 ¶5.5 (target requirement, §22).
18. **Every execution must retain evidence of:** client instruction; pre-trade checks; routing decision; selected counterparty/venue; price; quantity; fees; timestamps; fill(s); settlement; reconciliation — `DEC-012` clause 1 rule 7. Retention **at least six years** (LFSA-DMB-2025 ¶5.12, §22).
19. **Partial fills must be supported** (`DEC-012` clause 1 rule 8) under the conservation and no-absorption rules in §7.6.

### 7.6 LP Partial Fill, Slippage, and Failure Rules

1. LP partial fill must not create AIX residual inventory.
2. LP fill worse than confirmed client quote must not be absorbed by AIX.
3. If LP execution is incomplete, rejected, expired, or outside approved price tolerance, the client trade must be voided or re-quoted.
4. If a ledger record has already been created before failure confirmation, the system must post reversal ledger entries. Original ledger entries must not be deleted.
5. Any re-quote must require new client confirmation.
6. Client must be informed that the previous quote is no longer executable.
7. Slippage may be recorded for evidence, but AIX must not carry the financial difference as principal exposure.
8. Partial-fill behaviour must be fail-closed by default.


### 7.5 LP Model Parameters

**v1.4 — provider-neutral.** The v1.3 line `primary_lp = Binance_or_approved_LP` is **removed**: no provider may be hard-coded into the licence-scope baseline. Specific providers are governed outside the platform architecture through the approval path in §7A.

```txt
liquidity_model = external_counterparty_routed
approved_counterparties = governed_externally_see_section_7A
primary_lp = REMOVED_IN_v1.4_no_provider_named
displayed_depth_source = approved_external_counterparty_or_market_data_provider
displayed_depth_type = external_aggregated_depth
depth_executable = disabled_pending_R3-Q2b
internal_orderbook = disabled
internal_matching_engine = disabled
client_to_client_matching = disabled
aix_market_making = disabled
aix_principal_dealing = disabled

lp_due_diligence_required = true
lp_api_integration_required = true
lp_order_reference_required = true
lp_execution_report_required = true
lp_slippage_record_required = true
lp_outage_behaviour = fail_closed_no_internal_fallback
lp_rate_limit_handling_required = true
lp_price_snapshot_required = true
lp_price_deviation_limit_pct = to_be_defined
lp_counterparty_exposure_limit = to_be_defined
lp_three_way_reconciliation_required = true
lp_secret_management = kms_vault
lp_environment = sandbox_in_nonprod_only
lp_market_data_redistribution_licensed = required
best_available_terms_evidence = required
```

### 7.7 Model C — Internal Client-to-Client Matching: HARD LOCK

**Status: BLOCKED / OUT OF SCOPE** — `DEC-012` clause 3.

```txt
Client A order  →  [ AIX internal matching mechanism ]  ←  Client B order
                            PROHIBITED
```

No architecture approval is granted for any of the following:

1. An **AIX-operated central client-to-client order book** for Money Broking Spot.
2. **Crossing Client A against Client B**, in whole or in part.
3. An **internal matching engine** for Money Broking Spot.
4. **AIX market making.**
5. **AIX principal liquidity.**
6. **Proprietary dealing** under this architecture.

**Basis.** LFSA-MB-2024 ¶1.1 confines money broking to **intermediary activity** and excludes acting as principal, liquidity provider or market maker. **No provision in any verified source supports internal matching.** This is therefore a **standing prohibition** (§6), not a lock awaiting an approval.

**Capability framing — this is the accurate form of the prohibition.** What is prohibited is the **capability**: maintaining a structure in which independent AIX client orders are **mutually executable**, and matching, crossing or netting one client's order against another's. It is *not* prohibited to record a client's own order (§11A class 1) or to represent externally sourced market depth (§11A class 2). Neither makes client orders mutually executable inside AIX.

**Existing locks are unchanged.** This document does not weaken any runtime or configuration control. The boot-time route guard, the CFG-01 prohibited-feature registry and its `exchange.`-prefix mutation guard, and the seeded feature locks all remain exactly as they are (§9A, §25).

---

## 7A. Approved External Counterparty / LP / Venue Model

**Provider-neutral abstraction.** The licence-scope baseline recognises exactly one abstraction:

```txt
APPROVED EXTERNAL COUNTERPARTY / LP / VENUE
```

**No named provider appears in this document, and none is approved by it.** v1.3's `primary_lp = Binance_or_approved_LP` is removed (§7.5). Naming a provider in the licence-scope baseline would make a commercial selection into a governance fact.

**Basis.** LFSA-MB-2024 ¶7.5 expressly includes **liquidity providers** among permitted counterparties, and requires that applicable counterparties be appropriately regulated / of good track record and subject to due diligence. ¶9.3 requires due diligence covering clients, principal broker / liquidity provider and trading-platform providers, **proportionate to exposure**. ¶9.7(i) requires disclosure of order-routing procedures, the fair application of routing, third-party routing arrangements, and payment-for-order-flow / inducement arrangements. ¶9.5 requires that AIX make clear **the capacity in which it acts** and disclose relevant conflicts involving service providers / LPs.

**A specific provider is governed outside the platform architecture** and must pass, at minimum:

| # | Gate |
|---|---|
| 1 | Due diligence, proportionate to exposure (¶9.3) |
| 2 | Counterparty assessment — appropriately regulated / good track record (¶7.5) |
| 3 | Legal agreement |
| 4 | Operational approval |
| 5 | Regulatory eligibility for the assets and activity concerned |
| 6 | **Notification to Labuan FSA within seven days prior to commencement** of the new arrangement (¶7.5) |
| 7 | Technical onboarding |
| 8 | Testing |
| 9 | Activation control (§21 feature-lock) |

**Gate 6 is an external dependency with a waiting period, not a configuration toggle.** A venue must not be activatable for routing until due diligence is recorded **and** the notification period has elapsed. The venue registry must therefore carry a notification-status dimension and refuse activation before it clears.

**Model B does not approve any venue.** `DEC-012` clause 2 accepts multi-venue routing as a **technical capability, production-gated**. Architectural support for a venue is not approval of that venue. Routing policy must be configurable and auditable, every routing decision reconstructable and disclosable, and **"lowest price always wins" is expressly rejected** — routing must be able to weigh price, available quantity/depth, fees, expected slippage where measurable, venue health, counterparty exposure/limit, supported assets, settlement capability, regulatory eligibility and operational availability.

**Open:** whether any specific external venue or LP is acceptable for AIX is unresolved — `R3-Q6`, §23.

---

## 8. Prohibited Scope

The following features must not be developed or activated unless separately approved by management and regulator where required.

### 8.1 Trading and Product Prohibitions

1. Principal dealing under the MB module.
2. Proprietary trading.
3. Market making.
4. Derivatives.
5. Securities token trading.
6. Margin trading for digital assets.
7. Lending or borrowing of client assets.
8. Staking service.
9. Yield product.
10. Algorithmic stablecoin support.
11. Privacy coin support.
12. Unapproved asset listing.
13. MYR trading pair.
14. **An AIX-operated order book or matching venue for digital-currency trading.** *(v1.3 read "AIX exchange order book before approval"; the "before approval" qualifier is removed — §4.1, §7.7, §8A. **Standing prohibition, stronger than v1.3.**)*
15. **Internal client-to-client matching — matching, crossing or netting one AIX client's order against another's.** *(Same correction; standing prohibition.)*
16. AIX spread markup as principal revenue.
17. Price Target Request as executable resting order.

### 8.2 Custody Prohibitions

1. Self-custody wallet service.
2. Private key custody by AIX unless separately approved.
3. Client asset commingling.
4. Company asset and client asset mixing.
5. Off-ledger balance adjustment.
6. Manual balance editing without ledger transaction.

### 8.3 System Prohibitions

1. Balance update without ledger entry.
2. Sensitive admin action without audit log.
3. Trade booking without approved client status.
4. Withdrawal without compliance and settlement checks.
5. Quote acceptance after expiry.
6. Feature activation from frontend only.
7. Staff approval of own maker-checker request.
8. Production activation of locked exchange features.
9. API bypass of disabled features.
10. Deletion of audit logs.
11. Direct client access to LP account.
12. Hidden or undisclosed spread.
13. Internal fallback pricing during LP outage.
14. Client quote execution without firm/secured LP leg.
15. Carrying unhedged/naked position.

### 8A. Prohibition Review — every v1.3 prohibition individually classified

**Mandatory review.** No lock is removed because the product strategy changed. Each v1.3 prohibition in §8.1–§8.3 and §6 was assessed individually:

| Class | Meaning |
|---|---|
| **A** | **STILL VALID** — preserved verbatim |
| **B** | **VALID BUT REWORDED** — same force, clearer or corrected expression |
| **C** | **SUPERSEDED** by `DEC-011` / `DEC-012` |
| **D** | **HISTORICAL** — requires a later controlled migration |
| **E** | **REGULATORY QUESTION** — remains locked while unresolved |
| **F** | **NEW LOCK** required by the new direction |

#### §8.1 Trading and product prohibitions

| # | Prohibition | Class | Note |
|---|---|---|---|
| 1 | Principal dealing under the MB module | **A** | LFSA-MB-2024 ¶1.1. Preserved |
| 2 | Proprietary trading | **A** | Preserved |
| 3 | Market making | **A** | ¶1.1. Preserved |
| 4 | Derivatives | **A** | Preserved — no verified source permits them |
| 5 | Securities token trading | **E** | **Remains locked.** `R4-Q2` unresolved. §12B, §12C |
| 6 | Margin trading for digital assets | **A** | Preserved |
| 7 | Lending or borrowing of client assets | **A** | Preserved |
| 8 | Staking service | **A** | Preserved |
| 9 | Yield product | **A** | Preserved |
| 10 | Algorithmic stablecoin support | **A** | Preserved. Admissibility remains an asset-gate decision (§12A) |
| 11 | Privacy coin support | **A** | Preserved. Same |
| 12 | Unapproved asset listing | **B** | Preserved and **strengthened** — now routed through the Asset & Instrument Registry gate (§12A) |
| 13 | MYR trading pair | **A** | Preserved |
| 14 | AIX exchange order book before approval | **B** | **Corrected.** Reworded as a **standing** prohibition on an AIX-operated matching book (§7.7), not one lapsing on Exchange approval. **Stronger, not weaker** |
| 15 | Internal client-to-client matching before Exchange approval | **B** | **Corrected identically** — standing prohibition (§4.1, §7.7) |
| 16 | AIX spread markup as principal revenue | **A** | Preserved |
| 17 | Price Target Request as executable resting order | **B** | Preserved in substance; order-type activation now governed by §11B. **No order type is enabled** |

#### §8.2 Custody prohibitions

| # | Prohibition | Class | Note |
|---|---|---|---|
| 1–6 | Self-custody wallet service; AIX private-key custody unless approved; client asset commingling; company/client asset mixing; off-ledger balance adjustment; manual balance editing without ledger transaction | **A** | **All preserved verbatim.** `DEC-011` reinforces 5 and 6: balances live in the ledger, never on a client identity record (§2C) |

#### §8.3 System prohibitions

| # | Prohibition | Class | Note |
|---|---|---|---|
| 1–15 | All fifteen | **A** | **All preserved.** Item 4 (withdrawal without compliance and settlement checks), item 7 (staff self-approval), item 8 (production activation of locked features) and item 9 (API bypass of disabled features) are load-bearing for §21's fail-closed model |

#### New locks required by the new direction

| # | New lock | Class | Basis |
|---|---|---|---|
| F1 | **Admitting an asset with securities features into a Money Broking product** | **F** | LFSA-MB-2024 fn 1 to ¶1.2 — §12A |
| F2 | **Activating a venue before due diligence and the seven-day prior notification have completed** | **F** | LFSA-MB-2024 ¶7.5 — §7A gate 6 |
| F3 | **Product activation on unresolved asset classification** — must fail closed | **F** | §12A, §21 |
| F4 | **Executing against displayed market depth** while `R3-Q2b` is unresolved | **F/E** | §7.2, §23 |
| F5 | **Activating any order type not passed through product-rule review** | **F** | §11B |
| F6 | **Enabling an AIX Exchange capability on terminology alone** | **F** | §12C — reserving a name grants nothing |

**Net effect: no prohibition weakened; two corrected to be stronger (§8.1 items 14–15); six new locks added.**

---

## 9. Feature Flags

The platform must implement backend-enforced feature flags.

Frontend hiding is not enough. If a feature is disabled, the backend API must also block access.

### 9.1 Enabled MVP Feature Flags

```txt
feature_client_onboarding = enabled
feature_kyc_kyb = enabled
feature_document_upload = enabled
feature_compliance_review = enabled
feature_beneficial_ownership = enabled
feature_source_of_funds = enabled
feature_source_of_wealth = enabled

feature_otc_rfq = enabled
feature_mb_spot_broking_terminal = enabled
feature_spot_broking_request = enabled
feature_external_lp_market_depth = enabled
feature_lp_backed_quote = enabled
feature_agency_back_to_back_execution = enabled
feature_trade_booking = enabled
feature_disclosed_brokerage_fee = enabled

feature_deposit = enabled
feature_withdrawal = enabled
feature_payment_instruction = enabled
feature_payment_settlement = enabled
feature_reconciliation = enabled

feature_double_entry_ledger = enabled
feature_audit_log = enabled
feature_maker_checker = enabled
feature_reports = enabled
feature_notifications = enabled

feature_travel_rule_enforcement = enabled
feature_wallet_screening = enabled
feature_aml_case_management = enabled
feature_account_freeze = enabled
feature_account_suspension = enabled
```

### 9.2 Disabled / Locked Feature Flags

**These are documentation identifiers, frozen (§9A). v1.5 renames none of them and disables nothing new.** Read them under §1.D: each states a **`PRODUCTION_ACTIVATION_STATE`**, not a build state. The classification below is new in v1.5 and is drawn from `STR-03` §2.1.

| Flag | Class (§6) | Meaning under v1.5 |
|---|---|---|
| `feature_exchange_orderbook`, `feature_matching_engine`, `feature_market_depth_as_aix_exchange`, `feature_public_exchange_trading`, `feature_public_market_api`, `feature_client_to_client_matching` | **STANDING PROHIBITION** | `PROHIBITED_PERMANENT`. An **AIX-operated digital-currency matching/venue capability** (§7.7, §9A). Disabled in **every** environment, permanently. **Not** the securities Exchange (§12E) |
| `feature_market_making`, `feature_proprietary_trading`, `feature_aix_spread_markup`, `feature_internal_fallback_pricing`, `feature_executable_price_target_request` | **STANDING PROHIBITION** | `PROHIBITED_PERMANENT` in every environment |
| `feature_securities_token` | **BUILD-UNLOCKED / PRODUCTION-GATED** | `DISABLED_PENDING_REGULATORY_ACTIVATION` in PRODUCTION. May be available in DEVELOPMENT / TEST / UAT / DEMO **against synthetic instruments only** (§9A, `MIG-003`) |
| `feature_derivatives`, `feature_margin_trading`, `feature_staking`, `feature_yield_product` | **PRODUCT-SCOPE PROHIBITION** | Out of scope. No development effort |
| `feature_self_custody_wallet`, `feature_privacy_coin`, `feature_algorithmic_stablecoin`, `feature_MYR_trading_pair` | **PRODUCT-SCOPE PROHIBITION / admissibility lock** | Unchanged |

```txt
feature_exchange_orderbook = disabled
feature_matching_engine = disabled
feature_market_depth_as_aix_exchange = disabled
feature_public_exchange_trading = disabled
feature_public_market_pair_listing = disabled
feature_public_market_api = disabled
feature_client_to_client_matching = disabled

feature_derivatives = disabled
feature_margin_trading = disabled
feature_securities_token = disabled
feature_market_making = disabled
feature_proprietary_trading = disabled
feature_self_custody_wallet = disabled
feature_staking = disabled
feature_yield_product = disabled

feature_MYR_trading_pair = disabled
feature_privacy_coin = disabled
feature_algorithmic_stablecoin = disabled
feature_aix_spread_markup = disabled
feature_executable_price_target_request = disabled
feature_internal_fallback_pricing = disabled
```

### 9.3 Feature Flag Enforcement Rules

1. Feature flags must be stored in the database.
2. Feature flags must be enforced by backend middleware or service guard.
3. Frontend must also hide disabled features, but frontend is not the source of truth.
4. Admin changes to feature flags must require permission.
5. High-risk feature flag changes must require maker-checker approval.
6. Every feature flag change must create an audit log.
7. Locked exchange features must not be enabled by normal admin users.
8. Locked exchange features require management and regulatory approval confirmation before activation.
9. Backend API must reject disabled-feature requests with `FEATURE_DISABLED`.
10. Locked feature API routes should not be publicly documented until enabled.
11. Feature flag default state must be disabled.
12. Unknown feature flag state must fail closed.
13. System fail-safe default must be deny.

### 9A. Frozen Identifiers and Their Compatibility Meaning

**Rule: identifiers are frozen. This document renames nothing.**

Several seeded feature-lock and configuration identifiers now carry names that read oddly under v1.4's terminology — chiefly because they use "exchange" in the digital-currency-order-book sense that §2A reserves for securities. **Renaming any of them would break governance and integrity**: they are seeded into the CFG-01 prohibited-feature registry, bound into a sealed configuration hash, and cited as licence-lock evidence in test names and acceptance records.

**Therefore: KEEP THE IDENTIFIER. Document its compatibility meaning. Create a future migration requirement.**

| Frozen identifier / name | Reads as | **Compatibility meaning under v1.5** |
|---|---|---|
| `exchange.public_order_book`, `exchange.matching_engine`, `exchange.client_to_client_matching`, `exchange.public_exchange_trading`, `exchange.public_market_depth` | Exchange-approval-pending locks | **An AIX-operated digital-currency matching/venue capability.** A **standing** prohibition under §7.7 in every environment, not one lapsing on Exchange approval. **Not the securities Exchange** (§12E). The seeded `applies_until: "until_formal_exchange_licence_approval"` is now materially misleading in the direction of being **too weak** and is corrected to `permanent` by `MIG-006` — recorded, not actioned (`STR-03` §7.1) |
| `exchange.market_maker`, `exchange.principal_dealing` | Exchange-namespaced | Already `permanent` in the registry; LFSA-MB-2024 ¶1.1 prohibitions. Unchanged |
| The `exchange.*` **namespace** as a whole, and CFG-01's structural `exchange.` prefix mutation block | Exchange-namespaced | **Frozen permanently as the MB-boundary prohibition namespace** (`DEC-013` clause 10). **Not reused for the securities Exchange.** The prefix block stays unconditional in every environment |
| `securities.token_trading` | Permanent prohibition | **Name unchanged; compatibility meaning restated in v1.5.** It means **live securities / security-token trading in the AIX PRODUCTION environment**. `PRODUCTION`: **fail closed** pending `R4-Q2` and `R1-Q1b`. `DEVELOPMENT` / `TEST` / `UAT` / `DEMO`: may be enabled for AIX Exchange and AIX RWA work **against synthetic instruments only**. **This is not permission for securities in MB Spot** — §12A stands in every environment. Migration `MIG-003`, held behind `R1-Q4` |
| `securities_market.*` *(reserved, not seeded)* | New namespace | **Reserved for AIX Exchange capabilities** (`MIG-007`). Chosen so that the frozen `exchange.` prefix block is never touched. Every code in it is seeded default-disabled and production-gated when the migration lands. **Not created by this document** |
| `feature_exchange_orderbook`, `feature_matching_engine`, `feature_market_depth_as_aix_exchange`, `feature_public_exchange_trading`, `feature_public_market_api`, `feature_client_to_client_matching` (§9.2) | Doc 00 flag names | Documentation identifiers for the same standing prohibition |
| `EXCHANGE_MODULE_LOCKED` | Error / state code | The locked-capability error code. Meaning unchanged |
| The boot-time route-guard fragment list (incl. `exchange`, `order-book`, `matching-engine`, `client-to-client`) | Path-string guard | A **terminology-based tripwire**, not a capability control. Retained in full and **not weakened** |

**Consequence for the securities Exchange capability.** The boot-time route guard refuses any route path containing `exchange`, `order-book`, `orderbook`, `matching-engine`, `matching_engine`, `client-to-client`, `market-maker`, `market_maker`, `market-making`, `principal-dealing`, `principal_dealing`, `spread-markup`, `spread_markup`, `maker-taker` or `maker_taker`. It is **environment-blind and domain-blind**: as written it would refuse to boot an AIX Exchange service in local development. Under `DEC-013` clause 8 that is a development blocker and its migration is specified as **`MIG-001`** (`STR-03` §5) — **specified, not authorised, and not implemented here**.

**Until `MIG-001` lands the guard remains active and unweakened, and every existing call site remains an MB-domain service with the fragment list enforced unconditionally in all five environments.** Three constraints bind the migration and are stated here because they are licence-scope facts, not implementation detail:

1. **The exported name `assertNoExchangeRuntime` is retained** as a deprecated alias (class E — it is named in six service bootstraps, eleven test files and multiple acceptance records).
2. **`PROHIBITED_EXCHANGE_FRAGMENTS` is retained unchanged**, including the `exchange` fragment, and stays unconditional for every MB-domain service in every environment.
3. **The invariant `MB_SPOT_INTERNAL_MATCHING = permanently prohibited` is preserved independently of domain and environment** (§1.D.4). No domain value, environment value or capability state may let an MB-domain service expose a client-to-client matching surface.

**Sequencing aid, not an evasion.** If AIX Exchange routes mount under a prefix that avoids the frozen fragments — `/securities-market/…` — the Exchange product can be specified and substantially built before `MIG-001` lands. Route naming must never be used to slip a venue surface past the guard; the matching-engine and order-book surfaces will require the domain-aware guard.

**Migration requirement (future, not authorised now).** Any rename of a frozen identifier requires its own controlled decision covering: re-derivation of the CFG-01 vendored Doc 00 baseline and seal; a migration for seeded registry rows; updates to dependent tests and acceptance records; and an assessment of whether regulator notification is required given these identifiers are cited as licence-lock evidence (`R1-Q4`, §23).

---

## 10. Core System Rules

### 10.1 Licence Boundary Rules

1. The platform must operate within approved MB and PSO scope.
2. **Securities / financial-instrument Exchange capability must remain disabled IN PRODUCTION pending the applicable approval** (§12C). Its software may be built, tested and made available in DEVELOPMENT / TEST / UAT / DEMO (§12E). **Internal client-to-client matching for Money Broking products is a standing prohibition in every environment and is NOT unlocked by any Exchange approval, any capability state, or the existence of the Exchange matching engine** (§7.7, §1.D.4, §12E.4). *(v1.4 correction, retained: v1.3 read "Exchange features must remain disabled until Exchange approval is granted", which conflated the two and implied approval would unlock internal matching — §4.1, §8A. v1.5 adds the production scoping.)*
3. AIX acts as broker/intermediary under the MB module.
4. AIX must not act as principal, market maker, or proprietary trader under the MB module.
5. **The system must not allow AIX-operated order matching. Standing prohibition — not conditional on any approval** (§7.7). *(v1.4 correction: v1.3 read "before approval".)*
6. **Spot must operate as externally-routed agency execution under Model A** (§7.3): client orders recorded in the AIX OMS, pre-trade controlled, and routed to approved external counterparties/venues for execution. *(v1.4 correction: v1.3 mandated quote-and-confirm as the only flow; that predates `DEC-012` and LFSA-DMB-2025 ¶5.5/¶6.4(i), which contemplate recorded, unexecuted, cancellable client orders. Quote-and-confirm remains valid for OTC/RFQ — §10.5.)*
7. Payment and settlement features must not become custody service unless separately approved.
8. LP market data must be labelled as external LP market depth, not AIX order book.
9. AIX revenue must be disclosed brokerage fee, not principal spread.
10. AIX inventory limit must be zero.

### 10.2 Client Eligibility Rules

1. Client must complete onboarding before using transaction modules.
2. Client must pass KYC/KYB before trading.
3. Client must have approved status before RFQ or spot broking request.
4. Rejected client cannot trade.
5. Suspended client cannot trade, deposit, or withdraw.
6. Frozen client cannot withdraw.
7. Client risk profile must be created before transaction approval.
8. Beneficial ownership must be collected for corporate clients.
9. Source of funds must be captured where required.
10. Source of wealth must be captured where required.
11. Client type scope must be defined before production.
12. Jurisdiction allowlist must be defined before production.
13. Sanctioned-country blocking must be enforced.
14. Per-trade and daily transaction limits must be enforced.

### 10.2A Client Type Scope Lock

The MVP client type scope is:

```txt
Institutional clients and high-net-worth / professional clients only.
Retail client onboarding is disabled by default.
```

Rules:

1. Retail client onboarding must remain disabled unless separately approved.
2. Corporate and institutional clients must complete KYB and beneficial ownership checks.
3. High-net-worth / professional clients must complete enhanced suitability and source-of-wealth checks where required.
4. The client type must be stored as a controlled field in the client profile.
5. Product access must be filtered by client type.
6. Any future retail access must require separate approval, documentation update, risk assessment, and feature flag change.


### 10.3 AML/KYC Rules

1. Every client must go through CDD.
2. High-risk clients must go through EDD.
3. PEP screening status must be recorded.
4. Sanctions screening status must be recorded.
5. Wallet screening status must be recorded where digital asset transfers are involved.
6. Suspicious activity must create a compliance case.
7. Compliance must be able to freeze or suspend account.
8. Compliance decisions must record user, date, reason, and evidence.
9. AML status must be checked before trade booking and withdrawal.
10. Transaction monitoring rules must be supported in the system.
11. KYC/CDD periodic refresh must be configured by risk rating.
12. Sanctions re-screening must run on list updates.
13. STR / regulatory filing workflow must exist.
14. Threshold transaction reporting must exist.
15. Digital asset deposits must go through wallet screening disposition.
16. Tainted-funds or mixer exposure must trigger quarantine or compliance review.

### 10.4 Travel Rule Enforcement Rules

1. Digital asset transfers must support Travel Rule data capture.
2. Originator information must be stored where applicable.
3. Beneficiary information must be stored where applicable.
4. Wallet address must be linked to the client where possible.
5. Counterparty VASP or financial institution data must be stored where applicable.
6. Transfer must not proceed if required Travel Rule data is missing.
7. Post-facto Travel Rule submission must not be the intended design.
8. Travel Rule records must be audit-ready.
9. Travel Rule exceptions must be recorded.
10. Travel Rule data must be protected as sensitive information.
11. Travel Rule threshold must be configured before production.
12. Self-hosted / unhosted wallet handling must be defined.
13. Counterparty VASP due diligence must be required where applicable.
14. Sunrise-issue handling must be defined.
15. Missing Travel Rule data must block transfer where required.

### 10.5 OTC/RFQ Rules

1. Only approved clients can create RFQ.
2. RFQ must include asset pair, side, amount, and quote type.
3. RFQ must have status.
4. Quote must have expiry timestamp.
5. Expired quote cannot be accepted.
6. Quote must show disclosed brokerage fee.
7. Quote must record price source or LP quote.
8. Quote must record whether it is firm or indicative.
9. Client acceptance must be timestamped.
10. Accepted RFQ must create trade booking.
11. Trade booking must trigger ledger process.
12. RFQ cannot skip required status sequence.
13. For executable quote, LP leg must be firm or secured first.
14. LP failure must not create AIX principal exposure.

### 10.6 AIX Spot Rules

> **v1.4:** retitled from "MB Spot Broking Rules" (§2A terminology). Rules below are retained from v1.3 except items 1 and 3, corrected for Model A. **No rule is weakened** — items 10, 11 and 13 remain and are reinforced by §7.7.

1. **Spot must use externally-routed agency execution (Model A, §7.3).** Client orders are recorded in the AIX OMS, pass pre-trade controls, and are routed externally for execution. *(v1.4 correction: v1.3 mandated brokered quote-and-confirm as the only flow.)*
2. Spot must not operate as a full public exchange.
3. **The client instruction must be affirmative and recorded** before any execution is sought (LFSA-DMB-2025 ¶5.5). Where a quote-and-confirm flow is used, the client must confirm before trade booking. *(v1.4: generalised from v1.3's confirm-only wording to cover a recorded client order.)*
4. Price, fee, and settlement details must be shown before confirmation or order submission.
5. Trade confirmation must be generated after booking.
6. Spot broking request must create audit log.
7. Spot broking trade must use ledger entries.
8. Spot broking cannot use locked matching engine.
9. External LP depth may be displayed only as external indicative market data.
10. Client order must not rest inside an AIX order book.
11. Client order must not match against another AIX client.
12. LP execution reference must be recorded where applicable.
13. **External market depth must be non-executable and non-clickable** while `R3-Q2b` is unresolved (§7.2, §23) — fail closed.
14. Quote expiry must use server-authoritative UTC time.
15. Quote acceptance after expiry must be blocked.
16. LP outage disables quoting and execution.
17. No internal fallback quote source is allowed.
18. Price Target Request, if retained, must be alert-only and non-resting.
19. LP partial fill must not create AIX residual position.
20. LP slippage beyond approved tolerance must void or re-quote the client trade.
21. Any re-quote must require fresh client confirmation.
22. Failed LP execution must trigger trade void or ledger reversal, not AIX principal absorption.


### 10.7 Payment and Settlement Rules

1. Deposit must be linked to client account.
2. Withdrawal must be reviewed before processing.
3. Settlement must have status.
4. Settlement must have reference number.
5. Settlement proof must be stored where applicable.
6. Failed settlement must be escalated.
7. Settlement completion must require permission.
8. High-risk settlement must require maker-checker.
9. Payment and settlement must be reconciled.
10. Client money and company money must be separated in ledger.
11. Client money daily reconciliation is required.
12. Three-way reconciliation is required where LP execution is involved.

### 10.8 Ledger Rules

1. Every balance movement must use double-entry ledger.
2. Direct balance editing is prohibited.
3. Total debit must equal total credit.
4. Ledger transaction must have clear source module.
5. Ledger transaction must have reference ID.
6. Ledger reversal must not delete original entry.
7. Ledger reversal must create new reversing entries.
8. Pending balance, available balance, and frozen balance must be separated.
9. Ledger entries must be immutable after posting.
10. Ledger reports must be exportable.
11. Asset precision and rounding policy must be defined.
12. FX rate must be captured where fiat/digital asset conversion is involved.
13. System-wide trial balance must net to zero.
14. Ledger posting must be idempotent.
15. On-chain deposit confirmation threshold must be configured.
16. Suspense and clearing accounts must exist where required.
17. Ledger reversal path must exist for failed LP execution.
18. Reversal entries must be linked to the original trade, LP execution reference, and failure reason.
19. Partial-fill unwind must preserve full audit trail.


### 10.9 Audit Log Rules

1. Every sensitive action must create audit log.
2. Audit logs must not be deleted.
3. Audit logs must capture before and after values where applicable.
4. Audit logs must capture user ID.
5. Audit logs must capture role.
6. Audit logs must capture IP address.
7. Audit logs must capture user agent.
8. Audit logs must capture timestamp.
9. Audit logs must capture module and action.
10. Audit logs must be searchable by authorised staff.
11. Audit log must be append-only.
12. Audit log must be tamper-evident using hash-chain or equivalent.
13. Audit log retention years must be configured.
14. Read access to sensitive PII must be logged.
15. Admin must not be able to modify their own audit trail.

### 10.10 Maker-Checker Rules

1. Sensitive actions must support maker-checker.
2. Staff cannot approve own request.
3. Settlement approval may require checker.
4. Withdrawal approval may require checker.
5. Feature flag change may require checker.
6. Fee configuration change may require checker.
7. Role permission change may require checker.
8. Ledger reversal must require checker.
9. Account freeze or unfreeze may require checker.
10. Checker decision must be logged.

### 10.11 Best Execution / Fair Pricing Rules

1. Best execution / fair pricing policy is required.
2. LP price snapshot must be retained.
3. Client quote must be retained.
4. LP execution report must be retained.
5. Price deviation limit must be enforced.
6. Quote rejection due to price movement must be recorded.
7. Client must see disclosed brokerage fee before confirmation.
8. Evidence must be retained for audit and client dispute handling.

---

## 11. UI Naming Control

The platform must use terminology that reflects MB/PSO scope and avoids implying that AIX is already operating a public exchange.

### 11.1 Preferred UI Terms

**Revised in v1.4.** v1.3's table was written for a quote-and-confirm product and avoided order vocabulary entirely. Under Model A the platform records **client orders** — a concept LFSA-DMB-2025 ¶5.5 and ¶6.4(i) use directly — so avoiding the word "order" would now be less accurate, not more conservative. What must still be avoided is language implying **AIX operates a venue**.

| Use This | Avoid This | Why |
|---|---|---|
| AIX Spot | AIX Exchange *(for digital currency)* | §2A rule 1 — "AIX Exchange" is reserved for securities capability |
| AIX Spot / institutional terminal | Exchange Terminal | Implies AIX operates a venue |
| External Market Depth / Aggregated Market Depth | AIX Order Book | §11A — depth is externally sourced |
| Client Order | *(no change needed)* | ¶5.5 vocabulary. **Changed from v1.3**, which mandated "Instant Quote" instead of "Market Order" |
| Open Orders | *(no change needed)* | ¶6.4(i) contemplates unexecuted orders. **Changed from v1.3**, which mandated "Open Requests" |
| Order History | Order Book History | "Order book" implies a venue |
| Trade History | Exchange Trade Feed | Implies AIX venue activity |
| Price Alert | Price Target Request as execution instruction | Preserved from v1.3 |
| Order Validity / Time in Force *(only for an activated order type)* | — | **Changed from v1.3's "Quote Validity"**, but only usable once §11B activates a type carrying it |
| External Market Activity | AIX Market Activity | Preserved |
| Brokered Trade | Matched Trade | "Matched" implies internal matching |
| Disclosed Brokerage Fee | AIX Spread | Preserved |

**The vocabulary change enables no capability.** Being permitted to *call* something an open order does not activate any order type — that is §11B.

### 11.2 Disabled UI Concepts

**Permanently prohibited** — these imply AIX operates a venue or acts as principal:

1. AIX-operated order book.
2. Maker/taker fee model.
3. Market maker panel.
4. Internal matching engine status.
5. Public trade tape implying AIX venue execution.
6. Any presentation of AIX as a digital-currency exchange.

**Disabled pending resolution** — not permanent prohibitions, but **fail closed** until answered (§21, §23):

7. Click-to-trade depth ladder / executing against displayed depth — `R3-Q2b`.

**Disabled pending order-type activation** (§11B) — not licence locks:

8. Stop, Stop-Limit, IOC, FOK, GTC, post-only.
9. Executable price target request.

**Reclassified in v1.4.** v1.3 listed items 8–9 alongside the venue prohibitions as "MVP disabled". They are now correctly separated: a venue prohibition is permanent; an unactivated order type is a product-rule gate. **Neither is enabled by this reclassification.**

### 11.3 Interface Disclaimer Requirement

The AIX Spot interface must display a clear note such as:

```txt
Market data shown is external market data sourced from approved counterparties or market-data providers. It is not an AIX-operated order book. AIX acts as intermediary: orders are routed for execution to approved external counterparties and are subject to eligibility checks, pre-trade controls and available funds.
```

---

## 11A. Order Records, Market Depth and Matching — the three-way distinction

Approved by `DEC-012` clause 4. These three are routinely conflated under the words "order book", and **conflating them is how an internal matching book gets built by accident.**

| | Concept | What it is | Status |
|---|---|---|---|
| **1** | **Client Order Store / OMS** | Records an AIX client's own instructions and their lifecycle. **Does not imply internal matching** | **PERMITTED** — required by Model A and by LFSA-DMB-2025 ¶5.5 / ¶5.12 |
| **2** | **External / Aggregated Market Depth** | Bid / offer / available quantity / depth information sourced from approved external counterparties, venues or market-data providers. **Does not imply an AIX internal order book** | **PERMITTED** as market data; ¶5.9 makes it a target requirement |
| **3** | **Internal Matching Book** | A structure in which independent AIX client orders are **mutually executable** and matched or crossed by AIX | **PROHIBITED** — Model C, §7.7 |

**Rules:**

1. No permission for (3) may be derived from the existence of (1) or (2).
2. "Market Depth" and "Aggregated Market Depth" refer to (2) only and never imply (3).
3. Whether a client may *execute against* displayed depth is separate and unresolved — `R3-Q2b`, §23. Until answered: **disabled**.

**Policy reframing — do not merely delete a protection.** v1.3 and the `TRD-01` blueprint express the protection as *"no order book data structures may exist"*. Read literally that would prohibit (1) and (2), which Model A requires and ¶5.5/¶5.9 expect. **The protection is therefore reframed, not removed:**

> **PERMITTED:** client order records; OMS state; externally sourced market depth.
> **PROHIBITED:** an AIX client-to-client matching book — i.e. any structure in which independent AIX client orders are mutually executable, and any matching, crossing or netting of one client's order against another's.

The prohibition's **force is unchanged**; its object moves from *any structure resembling a book* to *the capability of internal matching*.

**Downstream drafting requirement — recorded only, not actioned.** `TRD-01` v1.2 §5.21 rule 7 carries the literal wording and must be re-scoped in the same way when `TRD-01` is re-baselined. **`TRD-01` is not modified by this document** (§25).

---

## 11B. Order-Type Policy

**A classification, not an approval.** `DEC-012` clause 7.

| Tier | Order types | Basis |
|---|---|---|
| **Architectural baseline candidates** | **Market**, **Limit**, **Cancel** | Client orders with price and quantity (¶6.4(i)), prompt execution on best available terms (¶5.5), and cancellation of unexecuted orders (¶6.4(i)) are established concepts. The minimum set an OMS must express to satisfy the cited controls |
| **Future — requires specific product-rule / regulatory review** | **Stop**, **Stop-Limit**, **IOC**, **FOK**, **GTC** *(where persistence semantics require review)* | Nothing in the verified sources addresses time-in-force or conditional-order semantics |

**Production activation of every order type — including the baseline candidates — remains subject to product-rule and regulatory review.** Being an architectural baseline candidate is not activation.

**Definition — "Limit Order" under Model A:**

> A **price-conditioned client instruction recorded by the AIX OMS and routed externally for execution when eligible/executable under the applicable execution policy.**
>
> It is **NOT** an order resting on an AIX-operated internal client-to-client matching engine.

That distinction is what makes a limit order compatible with the intermediary model.

**Stop-loss caution — do not overstate.** LFSA-MB-2024 ¶9.2 refers to risk-mitigating measures **such as stop loss orders**. That is a **risk-management reference**. It must **not** be represented as regulatory approval of a specific stop-order implementation, product or execution mechanism.

---

## 12. Development Rules

### 12.1 General Development Rules

1. Do not build active exchange order-book features.
2. Do not build active matching engine.
3. Do not expose locked features in production.
4. Do not bypass feature flags.
5. Do not update balances directly.
6. Do not skip audit logs.
7. Do not allow client access to another client’s data.
8. Do not allow staff action without permission check.
9. Do not allow expired quote acceptance.
10. Do not allow rejected or suspended clients to trade.
11. Do not implement AIX spread markup.
12. Do not implement internal fallback pricing.

### 12.2 Backend Rules

1. Backend must enforce all feature flags.
2. Backend must enforce all permissions.
3. Backend must validate client status before transaction modules.
4. Backend must check AML status where required.
5. Backend must create audit logs for sensitive actions.
6. Backend must use ledger service for financial postings.
7. Backend must reject locked feature API calls.
8. Backend must protect Travel Rule and AML data.
9. Backend must validate all request bodies.
10. Backend must return consistent error codes.
11. Backend must separate external LP market data from internal execution records.
12. Backend must store LP price snapshots for trade evidence.
13. Backend must use idempotency keys for financial operations.
14. Backend must use server-authoritative UTC for quote expiry.
15. Backend must fail safe by default.

### 12.3 Frontend Rules

1. Frontend must hide disabled features.
2. Frontend must show account status clearly.
3. Frontend must show quote expiry clearly.
4. Frontend must show fee and settlement details before confirmation.
5. Frontend must prevent duplicate submission.
6. Frontend must display compliance pending status.
7. Frontend must not expose internal system settings to client.
8. Frontend must not store secrets.
9. Frontend must not calculate final ledger balances.
10. Frontend must show proper error messages from backend.
11. Frontend must label LP data as external LP market depth.
12. Frontend must not label external LP depth as AIX order book.
13. Frontend must not allow clickable execution from LP depth.
14. Frontend must not rely on client-side clock for expiry.

### 12.4 Database Rules

1. Use soft delete where required.
2. Do not delete financial records.
3. Do not delete audit logs.
4. Use indexes for high-volume tables.
5. Use unique references for transactions.
6. Store timestamps for all key events.
7. Separate client account, ledger account, and user account.
8. Separate client funds and company funds in ledger design.
9. Store feature flag changes.
10. Store approval decisions.
11. Store LP price snapshot and execution reference.
12. Store brokerage fee, quote expiry, acceptance time, and settlement reference.
13. Store idempotency keys for financial operations.
14. Store audit hash-chain values or tamper-evidence metadata.
15. Encrypt PII/KYC/Travel Rule sensitive data at rest.

### 12.5 Production Safety Rules

1. Locked Exchange features must remain disabled in production.
2. Production feature flag change must require authorised approval.
3. Production database changes must use migration.
4. Production secrets must not be stored in code.
5. Production logs must not expose passwords, tokens, or sensitive documents.
6. Production deployment must include rollback plan.
7. Production access must be limited.
8. Production admin actions must be logged.
9. Production system must have monitoring.
10. Production release must pass testing checklist.
11. Production uses real LP keys only after approval.
12. Non-production uses LP sandbox only.
13. Non-production must not use real PII.
14. Secrets must be stored in KMS or vault.
15. Data residency requirement must be confirmed before production.

---

## 12A. Asset & Instrument Eligibility — the platform-wide classification gate

Approved by `DEC-012` clause 6. **This gate is platform-wide. It is NOT RWA-only.**

**Basis.** LFSA-MB-2024 **fn 1 to ¶1.2**: digital assets permitted to be traded under the Money Broking framework **must not have the features of securities as defined under section 2 LFSSA**. An asset bearing securities features is therefore **categorically outside** the Money Broking framework — so the securities-features test must be applied before *any* asset enters a Money Broking product, not only before an RWA is issued. A listing decision taken without it could silently take AIX outside the framework it operates under.

**Canonical flow:**

```txt
Asset / Instrument Proposed
  → Regulatory / Legal Classification
  → Product Eligibility
  → Operational Eligibility
  → Activation
```

**Classification outcomes:**

| Outcome | Consequence |
|---|---|
| **NON-SECURITY DIGITAL ASSET** | **May be considered** for AIX Spot / OTC — subject to admissibility (§9.1 asset rules, privacy-coin / algorithmic-stablecoin / MYR locks) and every other requirement in this document |
| **SECURITY / SECURITY TOKEN** | **Must NOT enter AIX Spot / OTC through the Money Broking route.** Routed to the applicable securities / Exchange governance path (§12C), which is itself locked and unresolved |
| **UNRESOLVED** | **FAIL CLOSED. No product activation.** The default state on asset creation |

**"Unresolved" is the default and the most important state.** An asset must not reach activation through an absent decision. Classification is an affirmative, evidenced, approval-bound record — not a field someone forgets to set.

**Eligibility flags derive from classification.** Per-product eligibility (Spot / OTC / Pay / RWA / secondary market) must be **derived from** the classification outcome, never set independently of it.

**The gate operates in every environment (v1.5).** §1.D.4-grade permanence: an asset bearing the features of securities must never enter AIX Spot or AIX OTC through the Money Broking route in DEVELOPMENT, TEST, UAT, DEMO or PRODUCTION. Build-unlocking the securities Exchange changes nothing here.

**Synthetic and test instruments (v1.5).** Development, automated testing, UAT and controlled demo of AIX RWA and AIX Exchange require instruments to exist before any real instrument is classified. The registry must therefore support a **synthetic / test instrument** classification that is **valid only in non-production environments and fails closed in PRODUCTION** (`MIG-010`, §25.3). A synthetic classification is never evidence about a real asset, and must never be promotable into a production classification.

**No asset is classified by this document.** It defines the gate, not any outcome.

---

## 12B. AIX RWA — Asset Lifecycle Platform and Classification Boundary

**AIX RWA is a confirmed target product pillar, not a hypothetical feature.** It is a full real-world-asset **tokenisation and asset-lifecycle platform** (§2B). Its *architecture* is in scope for design now; its *capabilities* are individually gated by classification and applicable regulatory approval (§1.A). Treating RWA as a single feature, or as merely a classification gate, would understate it and produce the wrong module architecture downstream.

### 12B.1 Scope — the asset lifecycle AIX RWA must be able to support

Recorded so that downstream documents size the domain correctly. **Architectural scope; not an activation list. No stage is enabled by this document.**

| Stage | Scope |
|---|---|
| **Issuer management** | Issuer onboarding; issuer due diligence (KYB / UBO), reusing the shared compliance core |
| **Asset onboarding** | Asset intake, asset verification and supporting evidence |
| **Regulatory classification** | The mandatory gate (§12B.2) — **precedes everything downstream** |
| **Structuring** | Asset/offering structuring within the classified route |
| **Token configuration** | Token parameters, supply model, transfer-restriction configuration |
| **Smart-contract orchestration** | Deployment and lifecycle control of the on-chain representation, within the custody constraint below |
| **Offering** | Offering setup and terms |
| **Subscription** | Investor subscription intake |
| **Investor eligibility** | Eligibility determination, reusing client classification and compliance status |
| **Allocation** | Allocation of subscribed amounts |
| **Issuance** | Issuance and initial holder recording |
| **Holder registry** | Holder / investor records over the asset's life |
| **Transfers and restrictions** | Transfer processing with enforced transfer restrictions |
| **Servicing** | Ongoing asset servicing |
| **Corporate actions** | Corporate-action processing |
| **Distributions** | Distributions to holders |
| **Redemption** | Redemption and retirement |
| **Reporting** | Issuer, holder and regulatory reporting |
| **Secondary-market eligibility** | Whether, and by which route, secondary trading is permitted — **gated, see §12B.2** |

**Shared-core reuse is mandatory.** RWA must not re-implement identity, KYB/UBO, AML, the account hierarchy (§2C), the Asset & Instrument Registry (§12A), ledger, settlement, reconciliation or audit. It consumes them.

### 12B.2 Classification boundary

**`RWA` does not mean `security`.** Asserting that equivalence would be wrong in both directions: it would block legitimate non-security tokenisation, and it would obscure the cases that genuinely are securities.

**Canonical gate:**

```txt
RWA Proposal
  → Classification
      SECURITY / SECURITY TOKEN  → securities / STO path
                                 → Exchange path where applicable AND approved
      NON-SECURITY               → applicable non-security framework
      UNRESOLVED                 → HOLD / DISABLED
```

**Current status of each route:**

| Route | Build state (§1.D.1) | Production activation (§1.D.3) |
|---|---|---|
| **Security / security token** | **UNLOCKED — may reach `TESTED`** (`DEC-013` clause 7). Available in DEVELOPMENT / TEST / UAT / DEMO against synthetic instruments | **`DISABLED_PENDING_REGULATORY_ACTIVATION`.** `securities.token_trading` fails closed in PRODUCTION; basis for lifting it unresolved — `R4-Q2`, `R1-Q1b` (§9A) |
| **Non-security** | **UNLOCKED — may reach `TESTED`** | **`DISABLED_PENDING_REGULATORY_ACTIVATION`.** `R4-Q6` (issuance basis), `R4-Q7` (secondary-trading route) |
| **Unresolved classification** | Software may be built and tested | **HOLD / DISABLED — fail closed** (§21). Unchanged, and unchangeable |

**v1.5 change.** v1.4 recorded the security-token route as `LOCKED` with no build dimension, which forbade designing it. `DEC-013` clause 7 unlocks the build. **The production position is unchanged in every respect.**

**Unresolved classification does NOT prevent** development of the RWA software, testing with synthetic assets, development of workflows, or UAT and controlled demo of the platform. **It prevents live activation of that asset or instrument** — permanently, until classification is affirmatively resolved.

**`R4-Q1` … `R4-Q7` remain unresolved** (§23). This document establishes the **lock architecture** without pretending those questions are answered.

**The distinction that matters:** AIX RWA's **scope is confirmed** (§12B.1) and its architecture is to be designed and owned by real modules. **No RWA issuance, offering, holder-registry, distribution, redemption, listing or trading capability is activated by this document** — each passes classification (§12B.2) and the §21 gates. Designing the lifecycle is not operating it.

**Custody constraint carried forward:** self-custody remains prohibited and third-party custody required (§8.2), which constrains any future RWA token custody design (`R4-Q5`).

---

## 12C. Securities / AIX Exchange Boundary

**"AIX Exchange" is reserved terminology** for the securities / financial-instrument Exchange capability (§2A). Two things must be held apart:

| | Status |
|---|---|
| **Platform terminology** | **Approved** — `DEC-012` clause 5 |
| **Software development of the capability** | **AUTHORISED** — `DEC-013` clause 7. Architecture, specification, implementation and testing; DEVELOPMENT / TEST / UAT / DEMO availability (§12E) |
| **Actual regulatory activation in production** | **NOT approved.** Subject to AIX's approval conditions, the applicable securities framework, and any required LFSA / MOF approvals |

**No securities trading capability becomes enabled because the software exists.** Reserving a name grants nothing; building a capability grants nothing (§8A new lock F6, §1.A).

**What is and is not established:**

- **[Established — LFSA-EXCH-WEB]** Labuan Exchanges are described *generically* as venues for listing/trading financial instruments, including equities, investment funds, debt instruments, digital securities and security tokens. This supports the terminology direction.
- **[NOT established]** The precise scope of **AIX's own** Exchange approval. The generic business-area description must **not** be used to infer it. This is **`R1-Q1b`**, unresolved (§23).

**Consequence.** Until `R1-Q1b` is answered, **no AIX document may assert what AIX's Exchange approval covers, and no securities capability may be activated in production.** Building the capability asserts nothing about the approval and must never be presented as though it did.

**Unchanged and unaffected by any future Exchange outcome:** §7.7's internal-matching prohibition for **Money Broking** products (§1.D.4). An Exchange approval, of any scope, would not unlock Model C.

---

## 12D. Payment / PSO Boundary — AIX Pay

**AIX Pay is a strategic product pillar operating under the PSO licence.**

**Do not assume that every crypto-payment-gateway feature is permitted.** The approved PSO scope in §5.2 is the baseline; it is not a licence for an arbitrary merchant-acquiring product set.

**Rule for any capability beyond the §5.2 baseline:**

> A payment capability that is not verified as within AIX's actual PSO scope must be represented in **production** as **PENDING / FEATURE-LOCKED**, never as **ENABLED**.

**v1.5: AIX Pay development is not limited to currently active production functionality.** The full enterprise payment platform may be architected, specified, implemented and tested, and made available in DEVELOPMENT, TEST, UAT and controlled DEMO (`DEC-013` clauses 1 and 7). **Production activation of anything beyond the §5.2 baseline remains gated** on PSO-scope verification (`R5-Q1`) and the §21 conditions.

**Target capabilities — architectural scope, not an activation list:**

| Group | Capabilities |
|---|---|
| Merchant | Merchant onboarding; merchant organisation; merchant users and roles |
| Acceptance | Payment intent; hosted checkout; API checkout; QR; invoices; payment status lifecycle |
| Assets | Digital-asset payments; conversion orchestration where applicable |
| Money movement | Settlement; payout; refund; whitelisted settlement destinations |
| Commercial | Fee engine |
| Integration | API keys; webhooks |
| Control | Reconciliation; merchant reporting; maker-checker; risk controls |

Each remains **`DISABLED_PENDING_REGULATORY_ACTIVATION`** in PRODUCTION until its PSO-scope basis is verified and its gates pass (§20.3, §21).

**Two structural cautions:**

1. **A hosted checkout is a public, pre-authentication surface** — materially larger than the platform's current authenticated surface, and subject to the platform's perimeter posture and its open pre-authentication findings. Any such surface requires its own perimeter analysis before exposure.
2. **Fee models beyond the disclosed brokerage fee** (§4.2) have no verified basis in this document. Payment and RWA fee mechanics are different from broking revenue and require their own basis.

**Third-party product websites are not regulatory authority** and must never be cited as the basis for a payment capability.

---

## 12E. AIX Exchange — Securities Market Capability

**New in v1.5. Authorised by `DEC-013` clause 7. Supported by `STR-03` §9.**

**AIX Exchange is a real target product capability, not a placeholder.** Its architecture must not be left undeveloped merely because production regulatory activation is pending (§1.A, §1.D).

### 12E.1 What AIX Exchange is, and is not

| | |
|---|---|
| **Is** | The **securities / financial-instrument / security-token** market capability |
| **Is not** | Ordinary BTC/USDT digital-currency Spot. That is **AIX Spot**, Money Broking, Model A, externally routed (§7) |
| **Is not** | A replacement, extension or alternative execution path for AIX Spot or AIX OTC |
| **Is not** | Permission for securities in MB Spot (§12A) |

### 12E.2 Build and activation position

| Dimension | State |
|---|---|
| `CAPABILITY_BUILD_STATE` | **May reach `TESTED`.** Architecture, specification, implementation and testing authorised |
| `ENVIRONMENT_AVAILABILITY` | **DEVELOPMENT / TEST / UAT / DEMO: may be ENABLED** per §1.E, with mock/synthetic non-live execution only. **PRODUCTION: DISABLED** |
| `PRODUCTION_ACTIVATION_STATE` | **`DISABLED_PENDING_REGULATORY_ACTIVATION`** — `R1-Q1b` (scope of AIX's own Exchange approval) and `R4-Q2` unresolved |
| `PRODUCT_ASSET_ELIGIBILITY_STATE` | **`NOT_ASSESSED`** for every real instrument. Synthetic instruments only in non-production (`MIG-010`) |

### 12E.3 Target capabilities — architectural scope, not an activation list

| Group | Capabilities |
|---|---|
| Admission | Instrument admission; listing; listing status; securities / security-token market configuration |
| Trading | Order entry; **central order book**; **matching engine**; execution; price/time priority |
| Market data | Exchange market data; market depth; trade history; order history |
| Operations | Market operations; trading halts; trading calendar and sessions |
| Participation | Client / investor eligibility; market permissions; transfer restrictions at the market boundary |
| Post-trade | Clearing / settlement interfaces; corporate-action interaction; holder-registry and transfer-control handoff |
| Control | Surveillance; reporting; audit / evidence |
| Integration | Exchange APIs |

**No capability in this table is activated in production by this document.**

### 12E.4 The matching-engine boundary — binding, permanent, environment-independent

> **The Exchange matching engine belongs ONLY to the securities / financial-instrument / security-token Exchange domain.**
>
> **It must NOT be reused, reachable or callable as the MB Spot client-matching engine.**

Binding architectural rules:

1. **No Money-Broking-domain module may call the Exchange order book or matching engine.** Not `OMS-01`, not `EXE-01`, not `TRD-01`, not `MKD-01`, not `LQD-01`, not `SUR-01`.
2. **`OMS-01`'s client order store must never become a book of mutually executable AIX client orders** (§11A class C, §7.7).
3. **`EXE-01` is a router, not a matcher.** Placing a matching capability inside it would put a venue inside the MB Spot execution path — precisely the structural failure §7.7 exists to prevent.
4. **The Exchange matching engine's existence grants AIX Spot nothing, in any environment, under any approval outcome.**
5. **Model C remains a standing prohibition** (§7.7, §1.D.4). *"Unlock Exchange development" is not permission to turn AIX Spot into an internal matching venue.*

### 12E.5 Identifier namespace

**The `exchange.*` namespace is frozen as the MB-boundary prohibition namespace and is NOT reused** (`DEC-013` clause 10, §9A). Every `exchange.*` identifier in this repository refers to the old MB client-matching concept; **none** refers to the securities Exchange. A new namespace **`securities_market.*`** is reserved (`MIG-007`), chosen so that CFG-01's structural `exchange.` prefix block stays unconditional and untouched. **Nothing is seeded by this document.**

### 12E.6 Module ownership

The existing Spot modules are the **external-routing** architecture and do not own a venue capability. Four Exchange-domain modules are authorised through governed versioning of the Master Module Index (`DEC-013` clause 12): **`EXM-01`** Exchange Market & Instrument Administration, **`EXO-01`** Exchange Order Book & Matching Engine, **`EXC-01`** Exchange Clearing & Settlement Interface, **`EXP-01`** Exchange Participation & Eligibility. **MODULE ≠ SERVICE.**

### 12E.7 RWA → Exchange secondary-market route

```txt
RWA asset  →  AST-01 classification = SECURITY / SECURITY TOKEN
           →  RWA-02 issuance complete
           →  AST-01 secondary-market eligibility (derived from classification)
           →  EXM-01 Exchange admission / listing
           →  EXP-01 investor eligibility + transfer restrictions
           →  EXO-01 Exchange trading
           →  EXC-01 clearing / settlement interface
           →  LED-01 settlement  +  RWA-04 holder registry / transfer control
           →  RPT-01 reporting
```

**Architecture built now; production activation gated at every arrow.** No instrument reaches admission without a resolved `SECURITY / SECURITY TOKEN` classification, and no admission reaches production without `R1-Q1b` and `R4-Q2` answered.

---

## 13. MVP Boundary

> **Retained from v1.3; partially superseded.** This section records the v1.3 MVP boundary. Where it refers to the **"MB Spot Broking Terminal"**, read **AIX Spot** (§2A) operating under **Model A** (§7.3). Where it describes quote-and-confirm as the only execution interaction, the normative position is now §7.3 and §11B. The **exclusions** in §13.2 remain in force except where §6, §8A and §11B explicitly reclassify an item. Nothing here enables a capability.


The MVP must focus on approved MB and PSO functions only.

### 13.1 MVP Includes

1. Authentication.
2. MFA.
3. User management.
4. Role and permission.
5. Client onboarding.
6. KYC/KYB.
7. Beneficial ownership.
8. Document upload.
9. Compliance review.
10. Client approval workflow.
11. OTC/RFQ request.
12. RFQ quote handling.
13. RFQ acceptance or rejection.
14. MB Spot Broking Terminal.
15. External LP Market Depth display.
16. LP-backed quote request.
17. Agency/back-to-back trade booking.
18. Deposit request.
19. Withdrawal request.
20. Payment instruction.
21. Settlement tracking.
22. Double-entry ledger.
23. Audit log.
24. Maker-checker.
25. Feature flags.
26. Admin portal.
27. Staff portal.
28. Client portal.
29. Reports.
30. Travel Rule enforcement.
31. AML case management.
32. Account freeze and suspension.
33. Approved asset whitelist.
34. Jurisdiction controls.
35. Transaction limits.
36. Best execution evidence.
37. Institutional / HNWI professional client type scope.
38. Retail onboarding disabled by default.

### 13.2 MVP Excludes

1. Full AIX exchange order book.
2. AIX matching engine.
3. AIX market depth as exchange.
4. Public exchange trading.
5. Public exchange API.
6. Market maker function.
7. Proprietary trading.
8. Securities token trading.
9. Derivatives.
10. Margin trading.
11. Self-custody wallet.
12. Staking.
13. Yield product.
14. Algorithmic stablecoin.
15. Privacy coin.
16. MYR trading pair.
17. Client-to-client matching.
18. Resting public exchange orders.
19. AIX spread markup.
20. Internal fallback pricing.
21. Executable price target request.
22. Retail client onboarding in MVP.

### 13.3 MVP Success Criteria

The MVP is considered successful when:

1. Client can register.
2. Client can complete onboarding.
3. Client can submit KYC/KYB.
4. Compliance can approve or reject client.
5. Approved client can submit OTC/RFQ request.
6. Staff can issue quote.
7. Client can accept valid quote before expiry.
8. Client can use MB Spot Broking Terminal to request and confirm brokered spot quote.
9. System can store external LP price snapshot.
10. System can store client quote and LP execution reference where applicable.
11. System can book agency/back-to-back trade.
12. Ledger entries are created correctly.
13. Settlement status can be tracked.
14. Deposit and withdrawal workflow works.
15. Reports can be generated.
16. All sensitive actions are logged.
17. Disabled exchange features remain inaccessible.
18. Rejected or suspended clients cannot trade.
19. Travel Rule enforcement fields and blocking rules are available for relevant digital asset transfers.
20. AIX inventory remains zero.
21. No AIX spread markup is applied.
22. LP outage fails closed.

---

## 14. High-Level Licence Boundary Diagram

> **Retained from v1.3 for traceability.** The normative licence boundary is §1.C, §6, §7.7 and §20. Where this diagram shows Exchange-pending locks covering internal matching, that lock is now **standing**, not pending (§4.1, §7.7).


```mermaid
flowchart TD
    A[AIX Platform] --> B[Approved MB Scope]
    A --> C[Approved PSO Scope]
    A --> D[Pending Exchange Scope - Locked]

    B --> B1[OTC/RFQ]
    B --> B2[MB Spot Broking Terminal]
    B --> B3[Agency Back-to-Back Trade Booking]
    B --> B4[Disclosed Brokerage Fee]

    C --> C1[Deposit]
    C --> C2[Withdrawal]
    C --> C3[Payment Instruction]
    C --> C4[Settlement]
    C --> C5[Reconciliation]

    D --> D1[Public Order Book]
    D --> D2[Matching Engine]
    D --> D3[AIX Market Depth]
    D --> D4[Public Exchange Trading]

    D1 -. locked .-> X[Disabled by Feature Flag]
    D2 -. locked .-> X
    D3 -. locked .-> X
    D4 -. locked .-> X
```

---

## 15. Spot Execution Diagram (retained from v1.3)

> **Superseded by §7.3.** This diagram shows the v1.3 quote-and-confirm flow. The normative Spot execution architecture is **Model A** (§7.3), with **Model B** as a production-gated capability and **Model C** prohibited (§7.7). Retained for traceability; **read §7.3 for the current position**.


```mermaid
flowchart TD
    A[Client opens MB Spot Broking Terminal] --> B[Select asset pair]
    B --> C[Enter buy/sell amount]
    C --> D[System checks KYC/AML/client status]
    D --> E{Approved?}
    E -- No --> F[Block request]
    E -- Yes --> G[Fetch External LP Indicative Snapshot]
    G --> H[Check LP price deviation and availability]
    H --> I{LP available and firm?}
    I -- No --> J[Disable quote / fail closed]
    I -- Yes --> K[Generate client quote with disclosed brokerage fee]
    K --> L[Show quote and server UTC expiry]
    L --> M{Client accepts before expiry?}
    M -- No --> N[Quote expired]
    M -- Yes --> O[Confirm LP execution / matched leg]
    O --> P{LP execution success?}
    P -- No --> Q[Void / reject client trade, no principal absorption]
    P -- Yes --> R[Record LP execution reference]
    R --> S[Create brokered trade]
    S --> T[Post double-entry ledger]
    T --> U[Start settlement workflow]
    U --> V[Generate trade confirmation]
```

---

## 16. Initial Developer Parameters

These parameters must be included in later SRS, database design, API design, and Claude Code prompt.

```txt
licence_money_broking_status = approved
licence_pso_status = approved
licence_exchange_status = pending

platform_role = broker_intermediary
execution_model = agency_back_to_back
revenue_model = disclosed_brokerage_fee
principal_dealing = blocked
proprietary_trading = blocked
market_making = blocked
principal_spread_markup = blocked
lp_spread_disclosure = required_pre_trade
aix_inventory_limit = 0
naked_position_allowed = false
lp_leg_firm_before_client_quote = true
lp_hedge_failure_handling = void_or_requote_or_reversal_no_principal_absorption
lp_partial_fill_handling = void_or_requote_no_residual_inventory
lp_slippage_beyond_tolerance = void_or_requote
client_reconfirmation_required_on_requote = true

client_onboarding_required = true
kyc_kyb_required = true
beneficial_ownership_required = true
source_of_funds_required = true
source_of_wealth_required = conditional
pep_screening_required = true
sanctions_screening_required = true
wallet_screening_required = true
travel_rule_enforcement_required = true

liquidity_model = external_counterparty_routed
approved_counterparties = governed_externally_see_section_7A
primary_lp = REMOVED_IN_v1.4_no_provider_named
displayed_depth_source = approved_external_counterparty_or_market_data_provider
displayed_depth_type = external_aggregated_depth
depth_executable = disabled_pending_R3-Q2b
internal_orderbook = disabled
internal_matching_engine = disabled
client_to_client_matching = disabled
aix_market_making = disabled
aix_principal_dealing = disabled

lp_due_diligence_required = true
lp_api_integration_required = true
lp_order_reference_required = true
lp_execution_report_required = true
lp_slippage_record_required = true
lp_outage_behaviour = fail_closed_no_internal_fallback
lp_rate_limit_handling_required = true
lp_price_snapshot_required = true
lp_price_deviation_limit_pct = to_be_defined
lp_counterparty_exposure_limit = to_be_defined
lp_three_way_reconciliation_required = true
lp_secret_management = kms_vault
lp_environment = sandbox_in_nonprod_only
lp_market_data_redistribution_licensed = required
best_available_terms_evidence = required

travel_rule_enforcement = true
travel_rule_threshold = to_be_defined
self_hosted_wallet_handling = required
counterparty_vasp_dd_required = true
travel_rule_block_on_missing_data = true

kyc_periodic_refresh_required = true
sanctions_rescreen_on_list_update = true
str_regulatory_filing_workflow = true
threshold_transaction_reporting = true
deposit_wallet_screening_required = true
aml_record_retention_years = to_be_defined

asset_precision_policy_required = true
fx_rate_capture_required = true
system_trial_balance_zero_invariant = true
ledger_idempotency_required = true
deposit_confirmation_threshold_required = true
client_money_daily_reconciliation = true

audit_log_append_only = true
audit_log_tamper_evidence = hash_chain
audit_read_access_logging = true
audit_retention_years = to_be_defined

approved_asset_whitelist = to_be_defined
approved_fiat_scope = to_be_defined
client_type_scope = institutional_and_HNWI_professional_only
jurisdiction_allowlist = to_be_defined
sanctioned_country_block = true
per_trade_limit = to_be_defined
daily_transaction_limit = to_be_defined

feature_flag_default_state = disabled
fail_safe_default = deny
quote_expiry_time_source = server_utc
pii_encryption_at_rest = true
data_residency = to_be_confirmed
best_execution_policy_required = true

double_entry_ledger_required = true
audit_log_required = true
maker_checker_required = true
feature_flag_required = true
backend_feature_flag_enforcement = true

exchange_orderbook = disabled
matching_engine = disabled
market_depth_as_aix_exchange = disabled
public_exchange_trading = disabled

otc_rfq = enabled
mb_spot_broking_terminal = enabled
spot_broking_request = enabled
external_lp_market_depth = enabled
lp_backed_quote = enabled
payment_settlement = enabled
deposit_withdrawal = enabled
reconciliation = enabled

myr_trading_pair = disabled
privacy_coin = disabled
algorithmic_stablecoin = disabled
securities_token = disabled
derivatives = disabled
margin_trading = disabled
self_custody_wallet = disabled
```

---

## 17. Instruction for Next SDLC Document

After this document is accepted, the next document to prepare is:

```txt
01_Project_Charter.md
```

The Project Charter must use this **v1.5** licence scope as its accepted base. **(v1.5 correction: this line read "v1.3", which was already stale in v1.4.)**

The re-baseline sequence set by §25.1 is: **Charter `v1.5` → Module Index `v1.4` → SRS `v1.3` → Role & Permission Matrix `v1.3` → Master Workflow Map `v1.3` → Master System Rules `v1.3`** → module blueprints → the `MIG-001`…`MIG-010` controlled code migrations.

No database design, API design or implementation of a capability should start until this document and the downstream masters covering that capability are accepted.

---

## 18. Claude Model Usage for This Document

### 18.1 Claude Opus

Use Claude Opus to review this document because it involves licence boundary, architecture, compliance, and high-risk product design.

### 18.2 Claude Sonnet

Do not use Claude Sonnet yet. Coding has not started.

### 18.3 Claude Fable

Do not use Claude Fable yet. UX copy is not the current priority.

---

## 19. Claude Opus Review Prompt (historical — v1.3)

> **HISTORICAL ARTEFACT. Retained verbatim, not rewritten.** The prompt below is the review prompt used for **v1.3** and refers to v1.3's product framing (including a named liquidity provider and the Exchange-pending classification of internal matching). It is **not** a live instruction and is **not** the review prompt for v1.4.
>
> It is preserved because it is part of v1.3's review trail and rewriting it would falsify that record (§26).
>
> **A v1.4 review prompt must be written for the v1.4 governance review** and must cover: the product/permission separation (§1.A); the standing Model C prohibition (§7.7); provider neutrality (§7A); the asset classification gate (§12A); the order-type gate (§11B); the 1 January 2027 temporal rule (§22); the unresolved questions (§23); and the frozen-identifier register (§9A).


```txt
Review this 00_Licence_Scope_And_Feature_Lock_v1.3.md document as a principal fintech architect.

Context:
- Money Broking licence is approved.
- PSO licence is approved.
- Exchange application is pending.
- Platform will support OTC/RFQ, MB Spot Broking Terminal, LP-backed agency/back-to-back execution, onboarding, KYC/KYB, ledger, payment, settlement, audit log, admin portal, staff portal, client portal, and reporting.
- Binance or another approved LP may provide external indicative market depth and liquidity.
- AIX revenue model is disclosed brokerage fee only, not spread markup.
- AIX must keep inventory limit at zero and avoid naked principal position.
- Exchange order-book, internal matching engine, market depth as AIX exchange, client-to-client matching, and public exchange trading must remain disabled until Exchange approval is granted.
- Platform must include Travel Rule enforcement, AML/KYC, audit log, maker-checker, feature flags, best execution evidence, and double-entry ledger.

This v1.3 has applied the second review corrections: client type scope locked to institutional and HNWI/professional only, §4.3.2 soft wording removed, and LP partial-fill/slippage failure rules added.

Review for:
1. Missing feature flags.
2. Missing system restrictions.
3. Risk of accidentally building an exchange.
4. Risk of acting as principal instead of broker.
5. Missing audit and ledger controls.
6. Missing AML/KYC and Travel Rule controls.
7. Missing LP integration controls.
8. Missing developer instructions.
9. Missing MVP boundary controls.
10. Unsafe UI wording.
11. Any unresolved contradiction with agency/back-to-back execution.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional parameters to add.
```

---

## 20. Licence / Capability Matrix

**Authoritative capability view.** A single "enabled/disabled" column would be misleading, because build state, environment availability, regulatory basis and production activation are independent (§1.A, §1.D). Each capability therefore records all of them.

**Legend (revised in v1.5).**
- **Build** — `CAPABILITY_BUILD_STATE` target authorised by this document: **BUILD** (may reach `TESTED`) / **NO BUILD** (must remain `NOT_SPECIFIED`, permanently).
- **Non-prod env** — availability in DEVELOPMENT / TEST / UAT / DEMO under §1.E: **AVAILABLE** (mock/synthetic non-live only) / **DISABLED**.
- **Regulatory** — APPROVED SCOPE / PENDING / UNRESOLVED / PROHIBITED.
- **Production** — `PRODUCTION_ACTIVATION_STATE`: ENABLED / DISABLED / NOT BUILT / PROHIBITED_PERMANENT.
- **Production gate** — what must pass before production activation.

**`NOT DESIGNED` is no longer used as a status.** v1.4 recorded it for the securities capabilities, and recording it forbade designing them — the defect `DEC-013` corrects (`STR-03` L-22, L-23). Where a capability must never be designed, this version says **NO BUILD** and says why.

### 20.1 AIX Spot — regulatory route: Money Broking

| Capability | Build | Non-prod env | Regulatory | Production | Production gate |
|---|---|---|---|---|---|
| Trading interface / terminal UI | **BUILD** | AVAILABLE | APPROVED SCOPE | NOT BUILT | §21 gates |
| Market data, charts, external/aggregated market depth | **BUILD** | AVAILABLE | APPROVED SCOPE (¶5.9) | NOT BUILT | §21 gates |
| Client order store / OMS, order lifecycle, open orders | **BUILD** | AVAILABLE | APPROVED SCOPE (¶5.5, ¶6.4) | NOT BUILT | §21 gates |
| Pre-trade controls, suspicious-order detection, sufficient-funds | **BUILD** | AVAILABLE | APPROVED SCOPE (¶6.4(i), ¶6.4(ii)) | NOT BUILT | §21 gates |
| Order types — Market, Limit, Cancel | **BUILD** | AVAILABLE | APPROVED SCOPE (¶5.5, ¶6.4(i)) | **DISABLED** | Product-rule review §11B |
| Order types — Stop, Stop-Limit, IOC, FOK, GTC | **BUILD behind a product/configuration gate** | AVAILABLE | **UNRESOLVED** (`R3-Q3`) | **DISABLED** | Specific product-rule review §11B |
| Partial fills, split fills | **BUILD** | AVAILABLE | APPROVED SCOPE | NOT BUILT | §21 gates |
| Execution routing to one approved external venue | **BUILD** (Model A) | AVAILABLE (mock venue) | APPROVED SCOPE (¶9.7(i)) | NOT BUILT | Venue gates §7A |
| Multi-LP / multi-venue smart routing | **BUILD** (Model B) | AVAILABLE (mock venues) | APPROVED SCOPE (¶9.7(i)) | **DISABLED** | **Per-venue** §7A; routing disclosure |
| Trading API | **BUILD** | AVAILABLE | APPROVED SCOPE | NOT BUILT | §21 gates |
| Trade history, order history | **BUILD** | AVAILABLE | APPROVED SCOPE (¶5.12) | NOT BUILT | §21 gates; six-year retention |
| Market surveillance | **BUILD — required control** | AVAILABLE | APPROVED SCOPE (¶6.4(i)) | NOT BUILT | §21 gates |
| Reporting | **BUILD** | AVAILABLE | APPROVED SCOPE | NOT BUILT | §21 gates |
| Post-trade transparency | **BUILD** | AVAILABLE | APPROVED SCOPE (¶5.9) | NOT BUILT | §21 gates |
| Execute against displayed depth | **BUILD behind a product gate** | AVAILABLE | **UNRESOLVED** (`R3-Q2b`) | **DISABLED** | Fail closed until resolved |
| **Internal client-to-client matching** | **NO BUILD — permanently** | **DISABLED in all five** | **PROHIBITED** (¶1.1) | **PROHIBITED_PERMANENT** | **None exists. §7.7, §1.D.4** |
| **AIX-operated central order book for MB Spot** | **NO BUILD — permanently** | **DISABLED in all five** | **PROHIBITED** (¶1.1) | **PROHIBITED_PERMANENT** | **None exists. §7.7, §1.D.4** |
| **AIX market making / principal liquidity / principal dealing** | **NO BUILD — permanently** | **DISABLED in all five** | **PROHIBITED** (¶1.1) | **PROHIBITED_PERMANENT** | **None exists. §7.7, §1.D.4** |

### 20.2 AIX OTC — regulatory route: Money Broking

| Capability | Build | Non-prod env | Regulatory | Production | Production gate |
|---|---|---|---|---|---|
| RFQ intake, eligibility, LP sourcing, quote comparison | **BUILD** | AVAILABLE | APPROVED SCOPE | NOT BUILT | Venue gates §7A; §21 |
| Executable quote, client acceptance, pre-funded hold | **BUILD** | AVAILABLE | APPROVED SCOPE | NOT BUILT | §21 gates |
| Execution, DvP, settlement, reconciliation, reporting | **BUILD** | AVAILABLE | APPROVED SCOPE | NOT BUILT | §21 gates |
| Multi-LP and counterparty infrastructure | **BUILD** | AVAILABLE (mock counterparties) | APPROVED SCOPE (¶7.5) | **DISABLED** | **Per-counterparty** §7A, incl. seven-day notification |
| **Internal matching of client RFQs** | **NO BUILD — permanently** | **DISABLED in all five** | **PROHIBITED** | **PROHIBITED_PERMANENT** | **None exists. §7.7, §1.D.4** |

### 20.3 AIX Pay — regulatory route: PSO

| Capability | Build | Non-prod env | Regulatory | Production | Production gate |
|---|---|---|---|---|---|
| §5.2 baseline (deposit, withdrawal, payment instruction, status, settlement tracking, client-money ledger, reconciliation, references, reports) | **BUILD** | AVAILABLE | APPROVED SCOPE | NOT BUILT | §21 gates |
| Merchant onboarding, merchant organisation, merchant users and roles | **BUILD** | AVAILABLE | **UNRESOLVED** (`R5-Q1`, §12D) | **PENDING / FEATURE-LOCKED** | PSO-scope verification + §21 |
| Payment intent, hosted checkout, API checkout, QR, invoices, status lifecycle | **BUILD** | AVAILABLE | **UNRESOLVED** (`R5-Q1`) | **PENDING / FEATURE-LOCKED** | PSO-scope verification + §21 |
| Digital-asset payments, conversion orchestration where applicable | **BUILD** | AVAILABLE | **UNRESOLVED** (`R5-Q1`) | **PENDING / FEATURE-LOCKED** | PSO-scope verification + §21 |
| Settlement, payout, refund, whitelisted settlement destinations | **BUILD** | AVAILABLE | **UNRESOLVED** (`R5-Q1`) | **PENDING / FEATURE-LOCKED** | PSO-scope verification + §21 |
| Fee engine | **BUILD** | AVAILABLE | **UNRESOLVED** (`R5-Q2`) | **PENDING / FEATURE-LOCKED** | Fee-model basis + §21 |
| API keys, webhooks, reconciliation, merchant reporting, maker-checker, risk controls | **BUILD** | AVAILABLE | **UNRESOLVED** (`R5-Q1`) | **PENDING / FEATURE-LOCKED** | PSO-scope verification + §21 |
| Public hosted checkout **surface exposure** | **BUILD** | AVAILABLE (not internet-exposed) | **UNRESOLVED** | **DISABLED** | **Perimeter analysis** + open pre-auth findings closed + §21 |

### 20.4 AIX RWA — regulatory route: depends on classification

| Capability | Build | Non-prod env | Regulatory | Production | Production gate |
|---|---|---|---|---|---|
| Classification gate itself | **BUILD** | AVAILABLE | — *(a control, not an activity)* | NOT BUILT | §12A |
| Issuer onboarding, issuer KYB / UBO / due diligence | **BUILD** | AVAILABLE | **UNRESOLVED** (`R4-Q1`) | **DISABLED** | §12B, §21 |
| Asset onboarding, asset evidence / verification | **BUILD** | AVAILABLE | **UNRESOLVED** (`R4-Q1`) | **DISABLED** | §12B, §21 |
| Structuring, token configuration, smart-contract orchestration | **BUILD** | AVAILABLE (testnet/mock only) | **UNRESOLVED** (`R4-Q1`, `R4-Q5`) | **DISABLED** | §12B, §8.2 custody constraint, §21 |
| Offering, subscription, investor eligibility, allocation | **BUILD** | AVAILABLE | **UNRESOLVED** (`R4-Q1`) | **DISABLED** | §12B, §21 |
| Issuance, token / holder registry, transfer controls | **BUILD** | AVAILABLE | **UNRESOLVED** (`R4-Q4`) | **DISABLED** | §12B, §21 |
| Asset servicing, corporate actions, distributions, redemption | **BUILD** | AVAILABLE | **UNRESOLVED** (`R4-Q1`) | **DISABLED** | §12B, §21 |
| Non-security token issuance / servicing | **BUILD** | AVAILABLE | **UNRESOLVED** (`R4-Q6`) | **DISABLED** | §12B, §21 |
| Non-security secondary trading | **BUILD** | AVAILABLE | **UNRESOLVED** (`R4-Q7`) | **DISABLED** | §12B, §21 |
| **Security-token issuance / secondary market** | **BUILD** *(changed in v1.5 from NOT DESIGNED)* | AVAILABLE — **synthetic instruments only** | **UNRESOLVED** (`R4-Q2`, `R1-Q1b`) | **DISABLED** | `securities.token_trading` production lock (§9A); Exchange route §12E |
| Secondary-market eligibility → Exchange admission | **BUILD** | AVAILABLE | **UNRESOLVED** (`R4-Q7`, `R1-Q1b`) | **DISABLED** | §12E.7, §21 |
| Reporting (issuer, holder, regulatory) | **BUILD** | AVAILABLE | **UNRESOLVED** | **DISABLED** | §21 |

### 20.5 AIX Exchange — regulatory route: securities / financial-instrument Exchange

**Rewritten in v1.5.** v1.4 recorded a single row, `NOT DESIGNED`. `DEC-013` clause 7 authorises the build; **the production position is unchanged**.

| Capability | Build | Non-prod env | Regulatory | Production | Production gate |
|---|---|---|---|---|---|
| Platform terminology | — | — | Approved (`DEC-012` cl. 5) | N/A | §2A |
| Instrument admission / listing / listing status | **BUILD** | AVAILABLE — synthetic instruments | **UNRESOLVED** (`R1-Q1b`) | **DISABLED** | §12C approval + §21 |
| Securities / security-token market configuration | **BUILD** | AVAILABLE | **UNRESOLVED** (`R1-Q1b`) | **DISABLED** | §12C approval + §21 |
| Order entry | **BUILD** | AVAILABLE | **UNRESOLVED** (`R1-Q1b`) | **DISABLED** | §12C approval + §21 |
| **Central order book** | **BUILD — securities domain only** | AVAILABLE | **UNRESOLVED** (`R1-Q1b`) | **DISABLED** | §12C approval + §21. **§12E.4 boundary binds permanently** |
| **Matching engine** | **BUILD — securities domain only** | AVAILABLE | **UNRESOLVED** (`R1-Q1b`) | **DISABLED** | §12C approval + §21. **§12E.4 boundary binds permanently** |
| Execution | **BUILD** | AVAILABLE — non-live only | **UNRESOLVED** (`R1-Q1b`) | **DISABLED** | §12C approval + §21 |
| Exchange market data / market depth | **BUILD** | AVAILABLE | **UNRESOLVED** (`R1-Q1b`) | **DISABLED** | §12C approval + §21 |
| Trade history / order history | **BUILD** | AVAILABLE | **UNRESOLVED** (`R1-Q1b`) | **DISABLED** | §12C approval + §21; six-year retention |
| Surveillance | **BUILD** | AVAILABLE | **UNRESOLVED** (`R1-Q1b`) | **DISABLED** | §12C approval + §21 |
| Market operations / trading halts | **BUILD** | AVAILABLE | **UNRESOLVED** (`R1-Q1b`) | **DISABLED** | §12C approval + §21 |
| Client / investor eligibility, market permissions, transfer restrictions | **BUILD** | AVAILABLE | **UNRESOLVED** (`R1-Q1b`) | **DISABLED** | §12C approval + §21 |
| Exchange APIs | **BUILD** | AVAILABLE | **UNRESOLVED** (`R1-Q1b`) | **DISABLED** | §12C approval + §21; perimeter analysis |
| Clearing / settlement interfaces | **BUILD** | AVAILABLE (mock infrastructure) | **UNRESOLVED** (`R1-Q1b`) | **DISABLED** | §12C approval + §21 |
| Corporate-action interaction | **BUILD** | AVAILABLE | **UNRESOLVED** (`R1-Q1b`) | **DISABLED** | §12C approval + §21 |
| Reporting, audit / evidence | **BUILD** | AVAILABLE | **UNRESOLVED** (`R1-Q1b`) | **DISABLED** | §12C approval + §21 |
| **Reuse of the Exchange matching engine by any MB-domain module** | **NO BUILD — permanently** | **DISABLED in all five** | **PROHIBITED** (¶1.1) | **PROHIBITED_PERMANENT** | **None exists. §12E.4, §7.7, §1.D.4** |

### 20.6 Out-of-scope products — no build, no environment, no gate

`DEC-013` clause 6. **No development effort is authorised on any of these**, and none has a production gate because none has a path to production.

| Capability | Build | Non-prod env | Production |
|---|---|---|---|
| Derivatives, perpetual futures, futures | **NO BUILD** | **DISABLED in all five** | **PROHIBITED** (§8.1) |
| Margin trading, leveraged trading | **NO BUILD** | **DISABLED in all five** | **PROHIBITED** (§8.1) |
| Lending / borrowing of client assets | **NO BUILD** | **DISABLED in all five** | **PROHIBITED** (§8.1) |
| Staking, yield / earn products, DeFi yield | **NO BUILD** | **DISABLED in all five** | **PROHIBITED** (§8.1) |
| Privacy coins | **NO BUILD** | **DISABLED in all five** | **PROHIBITED** (§8.1) |
| Algorithmic stablecoins where currently prohibited | **NO BUILD** | **DISABLED in all five** | **PROHIBITED** (§8.1) |
| MYR trading pairs where currently prohibited | **NO BUILD** | **DISABLED in all five** | **PROHIBITED** (§8.1) |
| Self-custody wallet service | **NO BUILD** | **DISABLED in all five** | **PROHIBITED** (§8.2) |

---

## 21. Production Activation Gate and Fail-Closed Model

**Retitled in v1.5. The content below is preserved in full and is now explicitly scoped to PRODUCTION activation** (`PRODUCTION_ACTIVATION_STATE`, §1.D.3). §21A adds the environment and build dimensions. **No condition is removed and no condition is weakened.**

**In PRODUCTION the platform fails closed. A capability is active only when every applicable condition affirmatively passes.**

Conditions, all of which must pass where applicable:

| # | Condition |
|---|---|
| 1 | Licence scope covers the activity |
| 2 | Regulatory approval obtained where required |
| 3 | Product approval |
| 4 | Asset classification resolved (§12A) |
| 5 | Asset admissibility (§9.1 asset rules and locks) |
| 6 | Client eligibility (§10.2, §2C) |
| 7 | Jurisdiction permitted |
| 8 | Compliance status satisfactory (KYC/KYB/AML) |
| 9 | Account / subaccount status active (§2C) |
| 10 | Counterparty / venue approved and notification complete (§7A) |
| 11 | Operational readiness |
| 12 | Required maker-checker approval obtained |
| 13 | Production feature flag enabled |
| 14 | **Environment is PRODUCTION and the capability's production activation has been affirmatively granted through the governed change path** *(new in v1.5 — §21A)* |

**Fail-closed rules:**

1. **Unknown or unresolved → DENY.** Absence of a decision is never permission.
2. **Default state of every flag is disabled** (§9.3 rules 11–13, preserved).
3. An unresolved regulatory question (§23) holds its capability's **production activation** closed regardless of build state, environment availability or UI configuration. *(v1.5: the words "regardless of architectural readiness" are re-scoped to production — they previously blocked architecture itself, `STR-03` L-25. The production effect is identical.)*
4. **Configuration is not authorisation.** A feature flag controls availability, not who may act; authority is a separate control.
5. **Hiding a capability in the UI is not a control.** The backend is the source of truth.
6. **Enabling a capability is one gate among many** and does not by itself make anything production-ready.
7. **Build state is not a gate that can be passed.** `CAPABILITY_BUILD_STATE = TESTED` satisfies none of conditions 1–14. Working software is not an approval.

---

## 21A. Build, Environment, Activation and Eligibility — binding rules

**New in v1.5. `DEC-013` clauses 2, 3, 5 and 11.**

**Rule 1 — four states, four separate controls.** Every regulated capability records `CAPABILITY_BUILD_STATE`, `ENVIRONMENT_AVAILABILITY`, `PRODUCTION_ACTIVATION_STATE` and `PRODUCT_ASSET_ELIGIBILITY_STATE` (§1.D). No document, schema, configuration or API may represent them as one field.

**Rule 2 — access requires all of them, conjunctively.**

```txt
ACCESS GRANTED  ⟺   permission
               AND  environment capability availability
               AND  product activation
               AND  asset / instrument eligibility
               AND  production regulatory gate (§21, PRODUCTION only)
```

**Rule 3 — a permission never activates anything.** Holding "Exchange Trader" does not mean Exchange is production-enabled. It does not mean Exchange is enabled in any environment. It means that *if* the capability is available and activated, this actor is among those who may use it. A permission grant is **never** evidence of an activation, and an activation is **never** evidence of a permission.

**Rule 4 — non-production availability is never evidence for production.** Enabling a capability in DEVELOPMENT, TEST, UAT and DEMO establishes nothing about PRODUCTION. Promotion to PRODUCTION is an affirmative, governed, maker-checker-approved act against §21's conditions.

**Rule 5 — unknown state fails closed in every dimension.** Unknown environment → treated as PRODUCTION. Unknown activation state → DENY. Unknown eligibility → DENY. Unreadable configuration → DENY. Missing classification → DENY (§12A).

**Rule 6 — permanent prohibitions are not states in this model.** The capabilities in §1.D.4 have no build state, no environment in which they are available and no activation path. They cannot be reached by satisfying conditions; there is no set of conditions that reaches them.

**Rule 7 — controls are never environment-relaxed.** Audit, permission, KYC/KYB, AML, Travel Rule, ledger and balance integrity, client approval, LP settlement approval and break-glass logging may not be bypassed in DEVELOPMENT, TEST, UAT or DEMO any more than in PRODUCTION. *Build-unlocking a product never unlocks a control.*

**Rule 8 — evidence obligations follow the capability, not the environment.** Where a capability carries a record-retention, disclosure or audit obligation in production, its non-production implementation must be built to produce that evidence, so that activation is not blocked by a control that was never built.

---

## 22. Effective-Date Treatment — Guidelines on the Management of Digital Money Broking Platform

**TEMPORAL RULE — binding on this and every downstream document.**

| | Statement |
|---|---|
| **Effective date** | **1 January 2027** |
| **Current status** | **NOT yet effective.** No AIX document may describe these guidelines as currently effective before 1 January 2027 |
| **Permitted use** | As the **target mandatory operating requirement** for a platform intended to operate from that date |

**Why both statements matter.** AIX is designing a platform intended to operate under these guidelines, so the architecture should be built toward compliance with them. That is forward design, not a claim of present obligation. Misstating them as currently in force would be a factual error in a regulatory control document.

**Target requirements to build toward** (LFSA-DMB-2025, effective 1 January 2027):

| ¶ | Requirement |
|---|---|
| 2.1 | Applies to Labuan money brokers operating technology-enabled platforms facilitating trading/exchanging of digital currencies on behalf of clients |
| 5.2 | **Sufficient funds available before execution** |
| 5.5 | **Client order recording**; prompt execution; no improper delay or withholding; **best available terms** |
| 5.9 | **Pre-trade information** — current bid prices, current offer prices, available asset volume, depth of trading interest, relevant communication methods. **Post-trade information** — price, trade time, volume of completed transactions, **disclosed as close to real-time as technically feasible**. Both **accessible during normal trading hours** |
| 5.12 | **Record retention — at least six years** for detailed order and trade records |
| 6.4(i) | **Order price/quantity controls**; **suspicious-order detection and blocking**; **cancellation of unexecuted orders** |
| 6.4(ii) | **Automated pre-trade controls** before execution |
| — | **Post-trade monitoring** |

**Distinction to preserve everywhere:** *current regulatory position* (§1.C, §3) versus *target mandatory operating requirements effective 1 January 2027* (this section).

---

## 23. Regulatory Open Questions

**These are unresolved. Each holds its capability's PRODUCTION ACTIVATION closed under §21. No model, implementation turn or document may answer them.** Full analysis: `STR-02` §6.

**v1.5 clarification (`DEC-013` clause 4).** An unresolved question holds `PRODUCTION_ACTIVATION_STATE` at `DISABLED_PENDING_REGULATORY_ACTIVATION`. It does **not** hold `CAPABILITY_BUILD_STATE` at `NOT_SPECIFIED`. The software may be architected, specified, implemented and tested; it may not be operated live. **None of these questions is answered, narrowed or softened by this document.**

| ID | Question | Holds disabled |
|---|---|---|
| **R1-Q1b** | Does AIX's own Exchange approval cover securities, digital-currency order-book activity, or both? | All securities capability (§12C) |
| **R1-Q2** | Does AIX's Exchange lock constrain AIX Spot at all under a Digital Money Broking reading? | Doc 00 §6 final wording |
| **R1-Q3** | May "AIX Exchange" name a securities venue before that licence is granted? | Public product naming |
| **R1-Q4** | Does renaming licence-lock identifiers require regulator notification? | Identifier migration (§9A) |
| **R3-Q1b** | Was v1.3's "resting exchange limit orders" lock intended to reach an OMS-pending order routed externally? | *(AIX-internal drafting question; resolved prospectively by §6)* |
| **R3-Q2b** | May a client execute against displayed market depth? | Click-to-trade (§7.2, §11.2) |
| **R3-Q3** | Which order types are approved **as products**? | All order types (§11B) |
| **R3-Q6** | Is any specific external venue or LP acceptable for AIX? | Every venue activation (§7A) |
| **R4-Q1** | Regulatory basis for issuing/servicing tokenized RWAs from Labuan | AIX RWA (§12B) |
| **R4-Q2** | Basis for lifting the permanent `securities.token_trading` prohibition | Security-token route |
| **R4-Q3** | Legal classifier of record and binding evidence standard for the securities-features test | §12A operation |
| **R4-Q4** | Is an RWA holder registry a regulated securities register? | Holder registry |
| **R4-Q5** | Custody basis for RWA tokens | RWA token lifecycle |
| **R4-Q6** | May non-security RWA tokens be issued under existing licences? | Non-security RWA route |
| **R4-Q7** | Does non-security RWA secondary trading fall under MB, Exchange or neither? | RWA secondary market |
| **R5-Q1** | Does the PSO licence cover merchant acquiring, checkout, invoicing and refunds beyond §5.2? | AIX Pay beyond baseline (§12D) |
| **R5-Q2** | What fee models are permitted for Pay and RWA, given disclosed-brokerage-fee-only? | Fee engine |
| **A2-Q1** | Are institutional subaccounts subject to distinct KYC / reporting / safeguarding treatment? | Subaccount operating rules |
| **A2-Q2** | Does subaccount segregation affect client-money safeguarding obligations? | Subaccounts carrying client money |
| **R6-Q1** | *(new in v1.5)* Does a controlled demo of a production-gated regulated capability to an **external** audience constitute holding out an unapproved activity? | External DEMO exposure of Exchange and RWA capabilities (§1.E rule 6) |
| **R-MODEL-C** | May AIX ever match one client's order against another's? **No verified provision supports it** | **Model C — standing lock (§7.7). Not a question awaiting an unlock:** it is recorded as a standing prohibition (§1.D.4) and is listed here for completeness only |

---

## 24. Go-Live Gates

No capability reaches production until its own gates pass. These are in addition to §21.

| # | Gate |
|---|---|
| 1 | This document approved and promoted (it is a **candidate**; §26) |
| 2 | Downstream masters re-baselined for the capability concerned (§25) |
| 3 | Module blueprint accepted and implementation independently accepted |
| 4 | Asset classification resolved for every asset in scope (§12A) |
| 5 | Counterparty/venue gates complete, including the seven-day prior notification (§7A) |
| 6 | Applicable regulatory open questions (§23) answered for the capability |
| 7 | Compliance, AML, KYC/KYB controls operational |
| 8 | Ledger, settlement and reconciliation proven end-to-end |
| 9 | Maker-checker and segregation-of-duties enforced with real role grants |
| 10 | Perimeter and exposure posture satisfied; outstanding pre-authentication findings closed before any internet exposure |
| 11 | Record retention meeting the six-year requirement operational (§22) |
| 12 | Production feature flag enabled through the governed change path |

---

## 25. Downstream Impact Register

**Nothing below is edited by this document.** Impact is recorded, not actioned.

### 25.1 Master documents

| Document | Status | Reason |
|---|---|---|
| **01 Project Charter** | **REBASELINE NOW → `v1.5`** | §6.3 and §10.2 lock order types already reclassified by §11B (`STR-03` L-28); §12.6 locks **Market Surveillance**, which `SUR-01` now owns and LFSA-DMB-2025 ¶6.4(i) requires (`STR-03` L-34); §26.1 environment matrix has no UAT and no DEMO (`STR-03` L-35); AIX Exchange is now a fifth capability |
| **03 Master Module Index** | **REBASELINE NOW → `v1.4`** | Four Exchange-domain modules (§12E.6); §17 securities rows need the build/production split; §13's "no internal matching module" must be re-scoped to **MB Spot** |
| **02 SRS** | **REBASELINE NOW → `v1.3`** | §19 "Future-Locked Exchange Requirements" is a placeholder that cannot be implemented (`STR-03` L-42); requirements must distinguish `IMPLEMENTED_CAPABILITY`, `ENVIRONMENT_AVAILABILITY` and `PRODUCTION_REGULATORY_ACTIVATION` |
| **04 Role & Permission Matrix** | **REBASELINE NOW → `v1.3`** | §22 "Future-Locked Exchange Permission Matrix" has no roles (`STR-03` L-43); §21A rule 3 must be stated as a permission-model principle |
| **05 Master Workflow Map** | **REBASELINE NOW → `v1.3`** | §33 WF-29 is a placeholder (`STR-03` L-44); Exchange, RWA and Pay flows must carry a PRODUCTION ACTIVATION GATE step rather than be omitted |
| **06 Master System Rules** | **REBASELINE NOW → `v1.3`** | `LIC-RULE-002` rule 1 is environment-blind and blocks the Exchange product in development (`STR-03` L-45); its locked list carries stale order types (L-46); binding rules are needed for the four states |
| **07 Master Data Flow** | **CAN WAIT** | Market data, venue flows, Exchange order-book and matching data flows |
| **08 Master Technical Architecture** | **CAN WAIT** | OMS/router topology; Exchange domain topology; environment topology |
| **09 Master Security Architecture** | **CAN WAIT** | API keys, webhook signing, checkout perimeter, Exchange API perimeter |
| **10 Master Testing Strategy** | **CAN WAIT** | Venue simulation, order-lifecycle testing, synthetic-instrument test strategy, per-environment capability testing |
| **11 Master Deployment Strategy** | **CAN WAIT** | Five-environment model, venue connectivity, promotion controls (§1.E rule 3) |

**Sequence:** Doc 00 → Charter → Module Index → SRS → Role Matrix → Workflow Map → System Rules → module blueprints → controlled code migrations.

### 25.2 Module blueprints

| Module | Status | Reason |
|---|---|---|
| **TRD-01** | **MUST REBASELINE BEFORE IMPLEMENTATION** | §5.21 rule 7 re-scoping (§11A); client-order state machine; routing policy; venue health; split fills; best-execution reasoning; subaccount scope. **§5.23's multi-LP selection model must be preserved** |
| **LED-01** | **MUST REBASELINE BEFORE IMPLEMENTATION** | **`LED-01` may not freeze its migration or schema design until it consumes `DEC-011`.** `client_id` appears as a scoping column in 9 of its 23 specified tables with no subaccount dimension. It must **not** be blindly replaced: legal owner, operational scope and accounting destination are different dimensions |
| **DEP-01** | MUST REBASELINE BEFORE IMPLEMENTATION | Merchant inbound and RWA subscription inflows |
| **PRT-01** | MUST REBASELINE BEFORE IMPLEMENTATION | Four-pillar information architecture differs from the current product |
| **REC-01** | CAN WAIT | Multi-venue and merchant settlement reconciliation |
| **WDR-01** | CAN WAIT | Independently blocked on KMS |
| **E2E-01** | CAN WAIT | Must eventually cover four pillars' flows |
| **CLT-01, IAM-02, CFG-01** | Extension, not rebaseline | Account hierarchy (`DEC-011`), scoped permissions, multi-dimensional eligibility. **v1.5 adds:** `CFG-01` owns `ENVIRONMENT_AVAILABILITY` and `PRODUCTION_ACTIVATION_STATE` (`MIG-004`); `IAM-02` must separate grantability from activation (`MIG-009`) |
| **AST-01** | **NEW — must specify the synthetic/test instrument classification** | `MIG-010`: a classification valid only in non-production and failing closed in PRODUCTION (§12A) |
| **EXM-01, EXO-01, EXC-01, EXP-01** | **NEW — blueprints required** | Exchange domain (§12E.6). `EXO-01` carries the §12E.4 boundary as a blueprint-level invariant |
| **RWA-01…RWA-04** | **NEW — blueprints required** | Full lifecycle, build-unlocked (§12B) |
| **PAY-01** | **NEW — blueprint required** | Full payment platform, build-unlocked (§12D) |
| **SUR-01** | **NEW — blueprint required** | Required control, not a locked future module (`STR-03` L-34). Extends to the Exchange domain |
| **FND-01** | **Extension** | `MIG-001` (domain/environment-aware boundary guard), `MIG-005` (five-environment model) |
| **IAM-01, SEC-01, KYC-01, AML-01, WLT-01** | **NO CHANGE from this document** | Product-neutral or unaffected |

### 25.3 Code, configuration and guards — recorded conflicts, no action

**Even where this document's terminology now differs from the codebase, nothing is changed here.**

**Migration register.** Full analysis and constraints: `STR-03` §4–§8. **Each requires its own approved task record. None is authorised by this document.**

| ID | Migration | Class | Status |
|---|---|---|---|
| **MIG-001** | `assertNoExchangeRuntime` → domain- and environment-aware boundary guard (§9A, `STR-03` §5). Name retained as a deprecated alias; fragment list retained; every existing call site stays MB-domain and unconditional | F | **Specified. Not authorised.** Blocks Exchange *implementation*, not Exchange architecture or SRS work |
| **MIG-002** | CFG-01 `exchange.` prefix mutation block — **keep unconditional**; the Exchange uses a non-colliding namespace instead | F | Specified |
| **MIG-003** | `securities.token_trading` — `applies_until` `permanent` → production-activation-gated; all three seeded copies byte-identically (§9A, `STR-03` §6) | F | **Specified. Held behind `R1-Q4`** |
| **MIG-004** | CFG-01 `cfg1.feature.environment_scope` — add the column; make decision-chain step 4 live. **The environment dimension does not exist in the schema today**; `environment` is accepted, hashed and logged but never evaluated | F | **Specified. Blocks the capability-state model in code** |
| **MIG-005** | Foundation `Environment` type → the five canonical environments, adding `demo`; decide the pre-production mirror's mapping, which inherits PRODUCTION's gate | F | Specified. Precedes `MIG-004` |
| **MIG-006** | The five `exchange.*` codes carrying `until_formal_exchange_licence_approval` → `permanent`, matching §6's STANDING classification | F | Specified |
| **MIG-007** | Reserve and seed the `securities_market.*` namespace, default-disabled and production-gated (§12E.5) | F | Specified |
| **MIG-008** | CFG-01 vendored Doc 00 baseline re-derivation and reseal (`DOC00_SOURCE_VERSION`) | F | **Specified. Must accompany any of `MIG-003` / `MIG-006` / `MIG-007`** |
| **MIG-009** | IAM-02 — separate permission *grantability* from production activation (§21A rule 3) | F | Specified |
| **MIG-010** | AST-01 — synthetic / test instrument classification, valid only in non-production, failing closed in PRODUCTION (§12A) | F | Specified. Blocks RWA and Exchange automated testing |

**Ordering:** `MIG-005` → `MIG-004` precedes all others. `MIG-008` lands in the same controlled change as any of `MIG-003`, `MIG-006`, `MIG-007`.

**Unchanged, recorded conflicts:**

| Item | Conflict | Action |
|---|---|---|
| Boot-time route guard | Environment- and domain-blind; would refuse to boot an Exchange service in local development | **None now.** `MIG-001`. **Guard remains active and unweakened in every environment** |
| CFG-01 seeded prohibited-feature identifiers | Names use "exchange" in the digital-currency sense | **None now.** Frozen; compatibility meanings §9A |
| CFG-01 `exchange.` prefix mutation block | Blocks any `exchange.`-prefixed code from mutation in every environment | **None now, and none intended.** Correct as written; `MIG-002` keeps it unconditional |
| IAM-02 seeded `exchange.*` permission catalogue rows | Catalogue data, not a runtime surface | **None now.** `MIG-009` addresses only grantability semantics |
| CFG-01 vendored Doc 00 baseline (`DOC00_SOURCE_VERSION = "v1.3"`) and sealed hash | Version label now two versions stale; hash inputs unchanged, seal valid | **None now.** `MIG-008` |
| Module blueprints and UI text using v1.3/v1.4 terminology | Class C terminology | **None now.** Controlled migration per document |

---

## 26. Change Control

**Status of this document: APPROVED / AUTHORITATIVE.** `v1.4` is superseded and archived.

**Promotion record** — all prerequisites satisfied:

| # | Prerequisite | Status |
|---|---|---|
| 1 | Governance basis | **DONE** — `DEC-013` (ACCEPTED), owner platform-development decision |
| 2 | Review/certification evidence per the register's authority rule | **DONE** — `reviews/00_Licence_Scope_And_Feature_Lock_v1.5_Review.md`; lock evidence `STR-03` |
| 3 | `DOCUMENT_REGISTER.md` updated; `v1.4` archived to `90_archive/masters/` | **DONE** |
| 4 | CFG-01 vendored Doc 00 baseline re-derived **if** licence status or prohibited-feature scope changed | **NOT REQUIRED** — **neither changed.** The licence position is identical to v1.4 and no seeded prohibited-feature row is added, removed or altered. Both hash inputs are unchanged and the sealed hash remains correct. Version-label bump is `MIG-008` (§25.3) |
| 5 | Downstream `REBASELINE NOW` documents scheduled (§25) | **IN PROGRESS** — Charter `v1.5`, Module Index `v1.4`, SRS `v1.3`, Role Matrix `v1.3`, Workflow Map `v1.3`, System Rules `v1.3` follow immediately |

**On approval this version supersedes v1.4 prospectively.** It does not rewrite historical facts: prior statements of what was approved or locked at a past time remain accurate for the period they describe.

**This document does not approve, and must never be cited as approving:**

- any regulatory approval AIX has not actually received;
- the scope of AIX's Exchange approval (`R1-Q1b`);
- any live securities listing, trading, clearing or settlement;
- any RWA issuance, offering, distribution, listing or secondary trading in production;
- any specific venue, counterparty, order type, asset or instrument;
- Model C, principal dealing or proprietary market making, in any environment;
- any expansion into derivatives, futures, margin, leverage, lending, staking or yield;
- any change to code, migrations, tests, seeded identifiers, sealed hashes or runtime guards.

**What it does approve is software development.** The capabilities marked **BUILD** in §20 may be architected, specified, implemented, tested and made available in DEVELOPMENT, TEST, UAT and controlled DEMO. Their production activation remains closed.

**Amendment.** Any change to this document requires a new version and the same promotion path. Unresolved questions in §23 may be closed only by external regulatory or legal confirmation, recorded in `DECISION_LOG.md`.
