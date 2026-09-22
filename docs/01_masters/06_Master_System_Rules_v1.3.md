---
document_id: ARC-06
title: Master System Rules
version: v1.3
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Platform business rules
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: v1.0, v1.1, v1.2 (archived)
baseline_commit: cefdbe9
---

# 06 Master System Rules  
# AIX Institutional Digital Asset, Payment & RWA Platform

> ## v1.3 — RE-BASELINED ON APPROVED DOC 00 v1.5, CHARTER v1.5, MODULE INDEX v1.4, SRS v1.3, ROLE MATRIX v1.3 AND WORKFLOW MAP v1.3
>
> **Base documents:** `00_..._v1.5`, `01_..._v1.5`, `03_..._v1.4` (37 modules), `02_..._v1.3`,
> `04_..._v1.3`, `05_..._v1.3`, `DEC-011`, `DEC-012`, **`DEC-013`**, `STR-03`.
>
> **The rules this version introduces.** Four states that v1.2 collapsed into one become four
> binding, separately enforced rules:
>
> | Rule | Separates |
> |---|---|
> | **`SYS-RULE-006`** | **BUILD STATE** — whether the software exists |
> | **`SYS-RULE-007`** | **ENVIRONMENT STATE** — where it may be exercised |
> | **`SYS-RULE-008`** | **REGULATORY ACTIVATION STATE** — whether AIX may operate it live |
> | **`SYS-RULE-009`** | **PRODUCT / ASSET ELIGIBILITY STATE** — for what, and for whom |
>
> **`SYS-RULE-010`: unknown regulatory production state fails closed.**
>
> **What is corrected.** `LIC-RULE-002` rule 1 — *"No active route may call these modules"* — was
> unconditional and environment-blind, and blocked the securities Exchange product in development
> exactly as in production (`STR-03` L-45). Its locked list also carried order types Doc 00 §6 has
> since reclassified (L-46). It is split into `LIC-RULE-002` (permanent Money Broking venue
> prohibitions) and `LIC-RULE-002A` (production-gated capabilities). **Nothing is unlocked for
> production, and nothing is removed from the prohibition set.**
>
> **What is added.** `LIC-RULE-005` the Exchange domain boundary; `ASSET-RULE-002` the
> classification gate; `CFG-RULE-004` production activation control; `CFG-RULE-005` non-production
> capability control. §25's prohibited-behaviour list grows.
>
> **What does not change.** Every rule in v1.2 is retained with its ID, severity, enforcement
> point, failure behaviour and audit requirement. `SYS-RULE-001` default deny, `SYS-RULE-002`
> backend source of truth and `SYS-RULE-003` fail closed are untouched — they are the spine this
> version builds on.
>
> **Permanently prohibited in every environment, including local development:** MB Spot internal
> client-to-client matching, an AIX order book for MB Spot, crossing or netting client orders,
> market making, principal dealing and AIX principal liquidity (`LIC-RULE-002`, `LIC-RULE-003`).
>
> **This document activates nothing and claims no approval AIX has not received.**

## Document Control

| Item | Details |
|---|---|
| Document name | 06_Master_System_Rules_v1.3.md |
| Platform | AIX Institutional Digital Asset, Payment & RWA Platform |
| Document type | SDLC Phase 2 / Master Rules and Control Logic |
| Version | v1.3 |
| Status | **APPROVED** — re-baselined on Doc 00 v1.5, Charter v1.5, Module Index v1.4, SRS v1.3, Role Matrix v1.3, Workflow Map v1.3 and `DEC-013` |
| Prepared for | Product, compliance, architecture, security, development, QA, operations, finance, and implementation planning |
| Base document 1 | 00_Licence_Scope_And_Feature_Lock_v1.5.md |
| Base document 2 | 01_Project_Charter_v1.5.md |
| Base document 3 | 03_Master_Module_Index_v1.4.md (37 modules) |
| Base document 4 | 02_Software_Requirement_Specification_v1.3.md |
| Base document 5 | 04_Role_And_Permission_Matrix_v1.3.md |
| Base document 6 | 05_Master_Workflow_Map_v1.3.md |
| Governing decisions | `DEC-011`, `DEC-012`, **`DEC-013`** |
| Supersedes | v1.2 (archived) |

---

## 1. Purpose

This document defines the master system rules for the AIX Money Broking Platform.

The purpose is to convert the approved licence scope, SRS, module index, role matrix, and workflow map into enforceable platform-wide rules before data-flow, technical architecture, security architecture, module blueprints, API design, database design, and coding.

This document is the rulebook for:

1. Licence boundary enforcement.
2. Feature flag and module lock logic.
3. Client eligibility and product access.
4. KYC/KYB, AML, Travel Rule, and ongoing monitoring.
5. Money movement and client-money safeguarding.
6. Ledger, balance, pre-funded hold, settlement, and reconciliation.
7. LP-backed agency execution.
8. Payout destination and withdrawal controls.
9. Maker-checker and segregation-of-duties.
10. Audit, records, reporting, privacy, and security.
11. Future-locked Exchange exclusion.
12. Error, testing, and implementation rule mapping.

---

## 2. Scope Baseline

The system rules are based on the accepted platform boundary:

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

## 3. Rule Format

Each rule uses this structure:

| Field | Meaning |
|---|---|
| Rule ID | Unique rule reference |
| Rule Name | Short rule name |
| Rule Type | Licence / Compliance / Money / Security / Workflow / Reporting / Governance |
| Rule Statement | Mandatory system rule |
| Enforcement Point | Where the rule must be enforced |
| Failure Behaviour | What happens if rule fails |
| Audit Required | Whether audit event is required |
| Test Required | Whether test case is required |

---

## 4. Rule Severity

| Severity | Meaning |
|---|---|
| Critical | Breach can create licence, client-money, AML, security, or principal-risk exposure |
| High | Breach can create operational, reporting, or control failure |
| Medium | Breach can create process inconsistency or user-impacting issue |
| Low | Breach is mainly usability or administrative |

Critical and High rules must have:

1. Backend enforcement.
2. Audit event.
3. Negative test case.
4. Permission mapping.
5. Error code.
6. Module blueprint reference.

---

## 5. Global System Rules

### SYS-RULE-001 Default Deny

| Field | Details |
|---|---|
| Rule Type | Security / Governance |
| Severity | Critical |
| Rule Statement | The system must deny access or action unless the role, permission, feature flag, workflow state, client status, and licence boundary explicitly allow it. |
| Enforcement Point | API gateway, backend service, workflow engine |
| Failure Behaviour | Reject action |
| Audit Required | Yes for sensitive action |
| Test Required | Yes |

Error code:

```txt
PERMISSION_DENIED
FEATURE_DISABLED
```

### SYS-RULE-002 Backend Source of Truth

| Field | Details |
|---|---|
| Rule Type | Security |
| Severity | Critical |
| Rule Statement | Frontend UI visibility must not be relied on as access control. Backend permission guard is the source of truth. |
| Enforcement Point | Backend API |
| Failure Behaviour | Reject action |
| Audit Required | Yes for sensitive denial |
| Test Required | Yes |

### SYS-RULE-003 Fail Closed

| Field | Details |
|---|---|
| Rule Type | Security / Money / Compliance |
| Severity | Critical |
| Rule Statement | Unknown state, missing dependency, failed vendor call, missing approval, invalid configuration, or ambiguous rule outcome must fail closed. |
| Enforcement Point | All critical modules |
| Failure Behaviour | Reject or hold workflow |
| Audit Required | Yes |
| Test Required | Yes |

### SYS-RULE-004 Server UTC Time

| Field | Details |
|---|---|
| Rule Type | Technical / Audit |
| Severity | High |
| Rule Statement | All expiry, timestamp, quote validity, audit, ledger, and workflow timing must use server UTC. |
| Enforcement Point | Backend services, database |
| Failure Behaviour | Reject invalid timestamp or normalise to UTC |
| Audit Required | Yes where state transition |
| Test Required | Yes |


### SYS-RULE-005 Input Validation and Rate Limiting

| Field | Details |
|---|---|
| Rule Type | Security / Technical |
| Severity | High |
| Rule Statement | All API requests must be validated, sanitised, size-limited, and rate-limited according to endpoint risk. |
| Enforcement Point | API gateway, backend validators, authentication layer |
| Failure Behaviour | Reject request, throttle, or block source |
| Audit Required | Yes for abuse, security, authentication, or money-critical endpoints |
| Test Required | Yes |

Rules:

1. Every API endpoint must validate request schema.
2. Unknown fields must be rejected or safely ignored according to endpoint policy.
3. Amount, price, asset, wallet, bank, and identity fields must use strict validation.
4. File uploads must enforce type, size, malware scanning, and content validation where applicable.
5. Authentication and sensitive endpoints must be rate-limited.
6. Quote, withdrawal, login, password reset, MFA, payout destination, and document upload endpoints require abuse protection.
7. Suspicious or repeated abuse must create a security event.

Error codes:

```txt
VALIDATION_ERROR
RATE_LIMITED
```

---

### SYS-RULE-006 Build State Is Separate

| Field | Details |
|---|---|
| Rule Type | Governance / Compliance |
| Severity | Critical |
| Rule Statement | **`CAPABILITY_BUILD_STATE`** (`NOT_SPECIFIED` / `SPECIFIED` / `IMPLEMENTED` / `TESTED`) is a separate, independently readable state. It records only whether the software exists and works. **It is never evidence that AIX may operate the capability, in any environment.** A capability reaching `TESTED` satisfies no activation condition. |
| Enforcement Point | Module blueprints, acceptance records, `MODULE_STATUS.md` |
| Failure Behaviour | A build state presented as an activation is a governance violation; reject and escalate |
| Audit Required | Yes |
| Test Required | Yes |

*(New in v1.3. `DEC-013` clause 2; Doc 00 §1.D.1; SRS `STATE-SRS-001`.)*

### SYS-RULE-007 Environment State Is Separate

| Field | Details |
|---|---|
| Rule Type | Security / Compliance |
| Severity | Critical |
| Rule Statement | **`ENVIRONMENT_AVAILABILITY`** is evaluated per environment across **DEVELOPMENT, TEST, UAT, DEMO and PRODUCTION**. Availability in four environments is **never** evidence for the fifth. **No non-production capability state, feature state or configuration may propagate to PRODUCTION** — promotion is an affirmative, governed, maker-checkered act. **An unknown or unrecognised environment is treated as PRODUCTION and fails closed.** A pre-production mirror inherits PRODUCTION's gate, not UAT's. **DEMO is not public production:** a controlled demo must never route a real client order to a real venue, move real client money, settle a real transaction or issue a real instrument. |
| Enforcement Point | `CFG-01`, every service bootstrap, deployment pipeline |
| Failure Behaviour | Deny; treat unknown environment as PRODUCTION |
| Audit Required | Yes — environment recorded in every capability decision |
| Test Required | Yes |

*(New in v1.3. `DEC-013` clause 2; Doc 00 §1.E; SRS `ENV-SRS-001`…`008`.)*

### SYS-RULE-007A No Control Is Relaxed In Non-Production

| Field | Details |
|---|---|
| Rule Type | Security / Compliance |
| Severity | Critical |
| Rule Statement | Audit, permission, KYC/KYB, AML, Travel Rule, ledger and balance integrity, client-side approval, LP settlement approval, maker-checker, segregation of duties and break-glass logging apply **identically in all five environments**. **Build-unlocking a product never unlocks a control.** No control may be disabled, stubbed or bypassed for development, testing, UAT or demo convenience. |
| Enforcement Point | All modules |
| Failure Behaviour | Reject |
| Audit Required | Yes |
| Test Required | Yes — control parity tested per environment |

*(New in v1.3. Doc 00 §21A rule 7.)*

### SYS-RULE-008 Regulatory Activation State Is Separate

| Field | Details |
|---|---|
| Rule Type | Compliance / Licence |
| Severity | Critical |
| Rule Statement | **`PRODUCTION_ACTIVATION_STATE`** (`DISABLED_PENDING_REGULATORY_ACTIVATION` / `DISABLED_PENDING_GOVERNANCE` / `DISABLED_BY_POLICY` / `PROHIBITED_PERMANENT` / `ACTIVE`) is a separate state, set only through the governed activation path with maker-checker and evidenced Doc 00 §21 conditions. **It is never inferred** from implementation status, test results, environment availability, UI configuration, deployment or a permission grant. **Deactivation must always be available to a single authorised actor** — failing closed is never blocked by a missing checker. |
| Enforcement Point | `CFG-01`, `IAM-02` approvals |
| Failure Behaviour | Deny |
| Audit Required | Yes — who, when, on what basis, under which approval |
| Test Required | Yes |

*(New in v1.3. `DEC-013` clauses 2–3; Doc 00 §21, §21A; Workflow `WF-34`.)*

### SYS-RULE-009 Product and Asset Eligibility State Is Separate

| Field | Details |
|---|---|
| Rule Type | Compliance / Money |
| Severity | Critical |
| Rule Statement | **`PRODUCT_ASSET_ELIGIBILITY_STATE`** is evaluated per product × asset/instrument × client × jurisdiction × counterparty and is **derived from** the instrument's classification, never set independently (`ASSET-RULE-002`). It is evaluated in **every** environment. `NOT_ASSESSED` denies. |
| Enforcement Point | `AST-01`, `CFG-01` |
| Failure Behaviour | Deny |
| Audit Required | Yes |
| Test Required | Yes |

*(New in v1.3. Doc 00 §1.D, §12A.)*

### SYS-RULE-010 Unknown Regulatory Production State Fails Closed

| Field | Details |
|---|---|
| Rule Type | Compliance / Licence |
| Severity | Critical |
| Rule Statement | **Where any of the four states in `SYS-RULE-006`…`SYS-RULE-009` is unknown, unreadable, unresolved or absent, the system denies.** Absence of a decision is never permission. An unresolved regulatory question holds the capability's **production activation** closed regardless of build state, environment availability or UI configuration — **and does not block architecture, specification, implementation or testing**. |
| Enforcement Point | `CFG-01` decision engine; all critical modules |
| Failure Behaviour | Deny |
| Audit Required | Yes |
| Test Required | Yes |

*(New in v1.3. `DEC-013` clauses 3–4; Doc 00 §21 fail-closed rules 1 and 3. This rule is a specialisation of `SYS-RULE-003`, not a replacement for it.)*

### SYS-RULE-011 Access Is Conjunctive

| Field | Details |
|---|---|
| Rule Type | Security / Compliance |
| Severity | Critical |
| Rule Statement | Access to a regulated capability requires **permission AND environment capability availability AND product activation AND asset/instrument eligibility AND — in PRODUCTION — the regulatory activation gate.** **A permission never activates a capability, and an activation never grants access.** `CFG-01` owns capability evaluation; `IAM-02` owns permission evaluation; neither may be implemented inside the other, and neither may be skipped because the other passed. A capability denial must not be reported as a permission denial, or the reverse. |
| Enforcement Point | `CFG-01`, `IAM-02`, every guarded route |
| Failure Behaviour | Deny, with the correct denial attributed |
| Audit Required | Yes |
| Test Required | Yes |

*(New in v1.3. `DEC-013` clause 11; Doc 00 §21A rule 3; Role Matrix §3.7.)*

---

## 6. Licence Boundary Rules

### LIC-RULE-001 Money Broking Scope

The platform may support agency-only Money Broking activity for approved client types and approved products.

Rules:

1. AIX acts as broker/intermediary.
2. AIX must not act as principal.
3. AIX must not run market-making.
4. AIX must not run proprietary trading.
5. AIX must not operate public exchange trading in MVP.
6. AIX must not match client orders against other client orders.
7. AIX must not display AIX public order book.

Error code:

```txt
LICENCE_SCOPE_BLOCKED
```

### LIC-RULE-002 Money Broking Venue Prohibition — permanent, every environment

**Rewritten in v1.3.** v1.2's rule carried three defects (`STR-03` L-45, L-46): its heading said
*"until Exchange approval"*, although Doc 00 §6 classifies these as **standing prohibitions no
approval lifts**; its rule 1 was unconditional and environment-blind, blocking the securities
Exchange product in development exactly as in production; and its list carried order types Doc 00
§6 has since reclassified. **Nothing is removed from the prohibition set, and the prohibition is
strengthened from "locked until approval" to "permanently prohibited".**

**Permanently prohibited:**

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

| Field | Details |
|---|---|
| Rule Type | Licence / Compliance |
| Severity | Critical |
| Rule Statement | The capabilities above are prohibited **in DEVELOPMENT, TEST, UAT, DEMO and PRODUCTION**, permanently. `CAPABILITY_BUILD_STATE` must remain `NOT_SPECIFIED`; `PRODUCTION_ACTIVATION_STATE` is `PROHIBITED_PERMANENT`. |
| Enforcement Point | `CFG-01` prohibited-feature registry; `IAM-02`; service bootstrap boundary guard; all MB-domain modules |
| Failure Behaviour | Reject |
| Audit Required | Yes — heightened |
| Test Required | Yes — per capability, per role, per environment |

Rules:

1. **No MB-domain service route may expose any of these capabilities, in any environment.** *(v1.3: scoped to MB-domain. The securities Exchange is a different domain, `LIC-RULE-005`, and its modules are not on this list. The MB-domain prohibition itself is unchanged and unconditional.)*
2. No client UI may expose these capabilities.
3. **No admin, super admin or break-glass path may enable them. There is no approval that grants them** — lifting one would require a different licence basis and a new licence-scope revision, not a feature activation. *(v1.3: v1.2's rules 3, 4 and 6 conditioned this on an Exchange approval.)*
4. No break-glass access may bypass this rule.
5. **No development, test, UAT or demo feature flag or capability state may leak to production.** *(Retained from v1.2 rule 5 and extended to five environments — it matters more under a five-environment model, not less.)*
6. **No configuration, feature flag, capability state, service domain, environment value or approval outcome may reach them.**

Error codes:

```txt
EXCHANGE_MODULE_LOCKED
CAPABILITY_PERMANENTLY_PROHIBITED
```

*(`EXCHANGE_MODULE_LOCKED` is retained unchanged. It is cited across the masters, test names and
acceptance records — Doc 00 §9A.)*

### LIC-RULE-002A Production-Gated Capabilities

**New in v1.3.** These are **not** in `LIC-RULE-002`. Their software is built and tested; their
production activation is closed.

| Field | Details |
|---|---|
| Rule Type | Licence / Compliance |
| Severity | Critical |
| Rule Statement | A production-gated capability may be architected, specified, implemented, tested and made available in DEVELOPMENT, TEST, UAT and DEMO. **Its production activation remains `DISABLED` until the applicable regulatory activation condition is satisfied and Doc 00 §21's conditions are evidenced through the governed activation path** (`WF-34`). |
| Enforcement Point | `CFG-01` |
| Failure Behaviour | Deny in PRODUCTION; permit per environment configuration elsewhere |
| Audit Required | Yes |
| Test Required | Yes |

| Capability | Production gate |
|---|---|
| AIX Exchange securities market (`EXM-01`, `EXO-01`, `EXC-01`, `EXP-01`) | `R1-Q1b` |
| Security-token issuance and secondary market | `R4-Q2`, `R1-Q1b` |
| Non-security RWA issuance and servicing | `R4-Q6`, `R4-Q7` |
| AIX Pay beyond the Doc 00 §5.2 baseline | `R5-Q1`, `R5-Q2` |
| Multi-venue smart routing (Model B) | Per venue — Doc 00 §7A incl. seven-day prior notification |
| Order types Stop, Stop-Limit, IOC, FOK, GTC | `R3-Q3` — implementable behind product/configuration gates |
| Execution against displayed depth | `R3-Q2b` |

**Order types moved out of `LIC-RULE-002` in v1.3.** Doc 00 §6 reclassified resting limit,
stop-limit and GTC/IOC/FOK as **product-rule gates, not licence locks**, because under Model A a
client order held in AIX's own store and routed externally is not exchange behaviour and
LFSA-DMB-2025 ¶6.4(i) expressly requires a cancellation control for unexecuted orders.
**Post-only and maker/taker fee behaviour remain in `LIC-RULE-002`.** No order type is activated.

Error code:

```txt
PRODUCTION_ACTIVATION_GATE_CLOSED
```

### LIC-RULE-003 Principal Dealing Block

The system must prevent AIX from taking principal exposure.

Rules:

1. AIX inventory limit is zero.
2. Naked position is not allowed.
3. AIX must not absorb LP slippage as principal exposure.
4. AIX must not complete a trade if LP execution or settlement sequence creates residual AIX position.
5. Partial fill must result in void, reversal, or re-quote unless fully matched and approved.
6. AIX must not use client money for proprietary obligation.

Error code:

```txt
PRINCIPAL_EXPOSURE_BLOCKED
```

### LIC-RULE-004 Disclosed Brokerage Fee Only

AIX revenue must be disclosed brokerage fee only.

Rules:

1. Brokerage fee must be shown before client confirmation.
2. Fee must be recorded separately from LP price.
3. AIX spread markup is prohibited.
4. Manual staff quote markup is prohibited.
5. Fee reversal is required if trade is voided, failed, reversed, or re-quoted after fee hold/charge.

Error codes:

```txt
SPREAD_MARKUP_BLOCKED
FEE_REVERSAL_REQUIRED
```


### LIC-RULE-005 Exchange Domain Boundary

**New in v1.3.** `DEC-013` clauses 5, 7, 12; Doc 00 §12E.4; Module Index §16A.2; SRS
`EXG-SRS-100`.

> **The AIX Exchange matching engine belongs ONLY to the securities / financial-instrument /
> security-token Exchange domain. It must NOT be reused, reachable or callable as the MB Spot
> client-matching engine.**

| Field | Details |
|---|---|
| Rule Type | Licence / Architecture |
| Severity | Critical |
| Rule Statement | No Money-Broking-domain module — `OMS-01`, `MKD-01`, `LQD-01`, `EXE-01`, `TRD-01`, or `SUR-01` acting in its MB capacity — may call `EXO-01`, `EXM-01`, `EXC-01` or `EXP-01`. No Exchange-domain module may execute an AIX Spot or AIX OTC client order. The boundary holds **identically in all five environments**, under any configuration, capability state, service domain or approval outcome. |
| Enforcement Point | `EXO-01` module-level invariant; service bootstrap boundary guard; `CFG-01` |
| Failure Behaviour | Reject as a **boundary violation**, not an authorisation failure |
| Audit Required | Yes — heightened |
| Test Required | Yes — as `EXO-01` invariant evidence with its own automated tests |

Rules:

1. `OMS-01`'s client order store must **never** hold mutually executable AIX client orders.
2. `EXE-01` is a **router, not a matcher**. No matching capability may be placed inside it.
3. **Execution code must not be shared between `EXE-01` and `EXO-01`.** Shared *platform*
   infrastructure — envelope, audit, idempotency, ledger posting, capability evaluation — is
   consumed from its owning module as normal.
4. **The existence of `EXO-01` grants AIX Spot nothing**, in any environment, under any approval
   outcome. *"Unlock Exchange development" is not permission to turn AIX Spot into an internal
   matching venue.*
5. Exchange capabilities use the reserved **`securities_market.*`** namespace. **The `exchange.*`
   namespace is frozen as the MB-boundary prohibition namespace and must not be reused**
   (`DEC-013` clause 10; Doc 00 §9A).

Error codes:

```txt
MB_DOMAIN_MAY_NOT_CALL_EXCHANGE_DOMAIN
EXCHANGE_DOMAIN_MAY_NOT_EXECUTE_MB_ORDER
```

### ASSET-RULE-001 Prohibited Asset and Product Categories

The system must enforce prohibited asset and product categories as licence-boundary controls.

Prohibited by default in MVP:

1. MYR trading pairs unless separately approved.
2. Privacy coins.
3. Algorithmic stablecoins.
4. **Securities tokens in PRODUCTION**, until the applicable regulatory activation condition is satisfied. *(v1.3: the prohibition is production-scoped. Development, automated testing, UAT and controlled demo against **synthetic instruments** are permitted — `ASSET-RULE-002`, `DEC-013` clause 9. **This is not permission for securities in MB Spot**, which `ASSET-RULE-002` prohibits in every environment.)*
5. Derivatives.
6. Margin trading.
7. Lending.
8. Staking.
9. Yield or earn products.
10. Any product that creates AIX principal, market-making, lending, or investment-management exposure.

Rules:

1. Asset cannot be activated if it falls under prohibited category.
2. Pair cannot be activated if either asset or currency leg is prohibited.
3. Securities token **production activation** requires the applicable regulatory activation condition, documentation update and the governed activation path (`WF-34`). **Development and testing against synthetic instruments do not.**
4. MYR pair support requires separate approval and documentation update.
5. Product configuration must reject derivatives, margin, lending, staking, and yield features.
6. Admin and Super Admin cannot override prohibited asset categories in MVP.
7. Any asset or pair activation must pass Compliance review and technical enforcement.

Error codes:

```txt
ASSET_NOT_ALLOWED
PAIR_NOT_ALLOWED
LICENCE_SCOPE_BLOCKED
```

### ASSET-RULE-002 Instrument Classification Gate

**New in v1.3.** Doc 00 §12A; SRS `AST-SRS-001`, `AST-SRS-001A`; Workflow `WF-35`; module
`AST-01`.

| Field | Details |
|---|---|
| Rule Type | Compliance / Licence |
| Severity | Critical |
| Rule Statement | Every asset and instrument passes **Proposal → Classification → Product Eligibility → Operational Eligibility → Activation** before any product admits it. **Per-product eligibility is derived from the classification outcome and must never be set independently of it.** `UNRESOLVED` is the default state on creation and **fails closed for production activation**. |
| Enforcement Point | `AST-01`; every product module |
| Failure Behaviour | Deny production activation for that instrument |
| Audit Required | Yes |
| Test Required | Yes |

Rules:

1. **An instrument classified `SECURITY / SECURITY TOKEN` must NEVER enter AIX Spot or AIX OTC
   through the Money Broking route — in DEVELOPMENT, TEST, UAT, DEMO or PRODUCTION.** Basis:
   LFSA-MB-2024 fn 1 to ¶1.2 excludes assets bearing the features of securities from the Money
   Broking framework. **This rule is environment-independent and is not affected by the AIX
   Exchange build unlock.**
2. A `SECURITY / SECURITY TOKEN` instrument routes to the securities / Exchange path (`WF-32`).
3. **`UNRESOLVED` classification prevents production activation of that instrument. It does NOT
   prevent** development of the software, testing with synthetic assets, development of
   workflows, or UAT and controlled demo of the platform.
4. Classification is an **affirmative, evidenced, maker-checkered** record. The classifier may
   never self-approve.
5. **A `SYNTHETIC` / `TEST_INSTRUMENT` classification is valid only in DEVELOPMENT, TEST, UAT and
   DEMO. It fails closed in PRODUCTION and is never promotable** into a production
   classification. A real instrument is classified afresh, on evidence.
6. Eligibility flags that drift from classification are a control failure; the system must make
   the drift impossible rather than detectable.

Error codes:

```txt
INSTRUMENT_CLASSIFICATION_UNRESOLVED
INSTRUMENT_NOT_ELIGIBLE_FOR_PRODUCT
SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT
SYNTHETIC_INSTRUMENT_NOT_VALID_IN_PRODUCTION
```

---

## 7. Feature Flag and Configuration Rules

### CFG-RULE-001 Feature Flag Default Disabled

Every module must have backend feature flag control.

Rules:

1. Default state is disabled.
2. Unknown flag state fails closed.
3. Feature flag change requires maker-checker.
4. High-risk flags require domain checker.
5. Future-locked Exchange flags cannot be enabled in MVP.

### CFG-RULE-002 High-Risk Config Maker-Checker

High-risk configuration changes require maker-checker.

High-risk configuration includes:

1. Feature flags.
2. Client type scope.
3. Asset whitelist.
4. Pair activation.
5. Fee rules.
6. LP settings.
7. Custodian settings.
8. Bank settings.
9. Screening vendor settings.
10. AML rule thresholds.
11. Travel Rule settings.
12. Data retention settings.
13. Role and permission settings.
14. Production deployment settings.

### CFG-RULE-003 No Self-Approval

The system must reject self-approval for all high-risk changes.

Error code:

```txt
SEGREGATION_OF_DUTIES_CONFLICT
```


### CFG-RULE-004 Production Activation Control

**New in v1.3.** `DEC-013` clauses 2–3; Doc 00 §21, §21A; Role Matrix §19A; Workflow `WF-34`.

| Field | Details |
|---|---|
| Rule Type | Compliance / Licence / Governance |
| Severity | Critical |
| Rule Statement | Setting a capability's `PRODUCTION_ACTIVATION_STATE` to `ACTIVE` requires: the applicable regulatory open question closed and recorded in `DECISION_LOG.md`; Doc 00 §21's thirteen conditions each evidenced; and maker-checker with a Capability Activation Approver, a Compliance Officer and Management as checkers. **The maker may never be a checker.** |
| Enforcement Point | `CFG-01`, `IAM-02` approvals |
| Failure Behaviour | Reject |
| Audit Required | Yes — who, when, on what basis, under which approval |
| Test Required | Yes |

Rules:

1. **An activation whose regulatory basis is unresolved must be refused**, regardless of who
   requests it.
2. **Deactivation requires one authorised actor and a single checker; the kill switch requires
   one authorised actor with post-hoc review.** Failing closed must never be blocked by a missing
   checker.
3. **Activation is never a side effect** of a feature-flag change, a deployment, a role grant or a
   configuration import.
4. **A request targeting a `LIC-RULE-002` capability is refused outright** — no activation path
   exists.
5. **A request that would promote a non-production capability state is refused** (`SYS-RULE-007`).

Error codes:

```txt
CAPABILITY_ACTIVATION_APPROVAL_REQUIRED
PRODUCTION_ACTIVATION_GATE_CLOSED
CAPABILITY_PERMANENTLY_PROHIBITED
```

### CFG-RULE-005 Non-Production Capability Control

**New in v1.3.**

| Field | Details |
|---|---|
| Rule Type | Security / Governance |
| Severity | High |
| Rule Statement | Enabling a capability in DEVELOPMENT, TEST, UAT or DEMO is a governed, audited, maker-checkered change. **It is not a production activation and confers none.** The environment is recorded in the change record and in every resulting capability decision. |
| Enforcement Point | `CFG-01` |
| Failure Behaviour | Deny; unknown environment treated as PRODUCTION |
| Audit Required | Yes |
| Test Required | Yes |

Rules:

1. **A non-production enablement never propagates to PRODUCTION.**
2. **DEMO must use mock, synthetic or otherwise non-live regulated execution**, unless the
   applicable environment design explicitly permits otherwise.
3. **External DEMO exposure of a production-gated regulated capability fails closed** pending
   `R6-Q1`.
4. **No control is relaxed by a non-production enablement** (`SYS-RULE-007A`).

Error codes:

```txt
CAPABILITY_NOT_AVAILABLE_IN_ENVIRONMENT
ENVIRONMENT_UNKNOWN_FAIL_CLOSED
```

### SOD-RULE-001 Segregation-of-Duties Conflict Matrix Enforcement

The system must enforce the segregation-of-duties conflict matrix defined in the Role and Permission Matrix.

Rules:

1. All SOD-001 to SOD-020 conflicts must be enforced by backend.
2. Workflow approval must check maker, checker, prior reviewer, requester, and beneficiary where applicable.
3. Client-side approval must check that initiator and approver are different authorised users.
4. Staff-side maker-checker must reject same-user approval.
5. Break-glass grantor cannot be recipient.
6. Ledger reversal maker cannot approve same reversal.
7. LP settlement payment maker cannot approve same LP payment.
8. Any SoD override must require senior approval, reason, and audit log where policy allows.
9. Unknown SoD result fails closed.

Error code:

```txt
SEGREGATION_OF_DUTIES_CONFLICT
```

---

## 8. Client Eligibility and Product Access Rules

### CLT-RULE-001 MVP Client Type

Allowed MVP client types:

```txt
institutional
HNWI_professional
```

Rules:

1. Retail client onboarding is disabled by default.
2. Retail client cannot access transaction modules.
3. Client type change requires compliance approval.
4. Professional/accredited status must be verified where applicable.

Error code:

```txt
CLIENT_TYPE_NOT_ALLOWED
```

### CLT-RULE-002 Product Access Gate

Client can access OTC/RFQ, MB Spot Broking, deposit, withdrawal, and statements only if:

1. Client status is approved.
2. Client type is allowed.
3. Professional/accredited status is approved where applicable.
4. KYC/KYB is approved.
5. AML risk status is acceptable.
6. Sanctions/PEP is clear or resolved.
7. Product access is approved.
8. Asset/pair is approved.
9. Required agreements are accepted.
10. Account is not frozen, suspended, rejected, or closed.
11. Transaction monitoring rules are active.

Error codes:

```txt
CLIENT_NOT_APPROVED
CLIENT_SUSPENDED
CLIENT_FROZEN
KYC_REQUIRED
AML_BLOCKED
```

### CLT-RULE-003 Client-Side Dual Authorization

Client-side dual authorization is required for:

1. Withdrawals above threshold.
2. Large trades above threshold.
3. Payout destination addition where mandate or threshold requires.
4. Any client mandate-controlled action.

Rules:

1. Initiator cannot approve the same action.
2. Client Approver must have valid authority.
3. Client-side approval occurs before staff approval or execution.
4. Missing approval blocks workflow.

Error code:

```txt
CLIENT_SIDE_APPROVAL_REQUIRED
```

---

## 9. KYC/KYB, AML, and Ongoing Monitoring Rules

### AML-RULE-001 KYC/KYB Approval Before Transaction

No client may transact before KYC/KYB approval.

Rules:

1. Onboarding submission alone is not approval.
2. More-info status blocks transaction.
3. Rejected client blocks transaction.
4. Suspended/frozen client blocks according to freeze scope.


### AML-RULE-006 Beneficial Ownership, SOF/SOW, and EDD Preconditions

The system must capture and enforce beneficial ownership, source of funds, source of wealth, and enhanced due diligence requirements.

Rules:

1. Corporate/institutional client onboarding requires beneficial ownership and control structure capture.
2. Beneficial owners and authorised representatives must be screened where applicable.
3. Source of funds evidence is required where applicable.
4. Source of wealth evidence is required where applicable.
5. High-risk client, transaction, jurisdiction, wallet exposure, PEP exposure, or unusual activity must trigger EDD where required.
6. EDD must be reviewed and approved before product access or relevant transaction release.
7. Missing beneficial ownership, SOF/SOW, or EDD requirement blocks onboarding or transaction access.
8. All evidence must be retained and access-controlled.

Parameters:

```txt
sof_sow_capture_required = true
beneficial_ownership_required = true
edd_required_for_high_risk = true
```

### AML-RULE-002 Sanctions and PEP Screening

The system must screen clients, beneficial owners, authorised representatives, counterparties, and relevant transaction parties.

Rules:

1. Screening must occur at onboarding.
2. Re-screening must occur on list update.
3. True match blocks transaction until resolved.
4. False-positive resolution must be recorded.
5. High-risk match requires Compliance Officer / MLRO decision.

### AML-RULE-003 Periodic KYC / CDD Refresh

The system must maintain risk-based periodic KYC/CDD refresh.

Rules:

1. Refresh schedule depends on risk level.
2. Due refresh creates task.
3. Overdue refresh restricts product access where configured.
4. Unresolved high-risk refresh may trigger suspension/freeze.
5. Refresh completion requires compliance approval.

Audit events:

```txt
kyc_refresh_due
kyc_refresh_completed
sanctions_rescreen_run
product_access_restricted
```

### AML-RULE-004 Transaction Monitoring

Transaction monitoring must run on deposits, withdrawals, trades, transfers, and relevant balance activity.

Minimum rule types:

1. Velocity.
2. Structuring.
3. Threshold breach.
4. Unusual transaction size.
5. High-risk jurisdiction.
6. High-risk wallet exposure.
7. Rapid in-out movement.
8. Repeated failed withdrawals.
9. Manual compliance rule.
10. Pattern anomaly.

Error code:

```txt
AML_BLOCKED
```

### AML-RULE-005 AML Case and STR Control

Suspicious activity must be escalated to AML case workflow.

Rules:

1. Alert closure requires reason.
2. Case closure requires evidence.
3. Suspicious case requires MLRO review.
4. STR workflow is restricted.
5. STR records are highly restricted.
6. Staff without STR permission cannot view STR records.

---

## 10. Travel Rule and Wallet Screening Rules

### TR-RULE-001 Travel Rule Data Requirement

Digital asset transfer must capture required originator and beneficiary data where applicable.

Rules:

1. Missing required data blocks transfer.
2. Counterparty VASP due diligence is required where applicable.
3. Self-hosted wallet handling is required where applicable.
4. Travel Rule data must be stored securely.
5. Travel Rule read access must be logged.

Error code:

```txt
TRAVEL_RULE_DATA_MISSING
```

### TR-RULE-002 Wallet Screening

Wallet screening is required for relevant digital asset deposits and withdrawals.

Rules:

1. High-risk wallet result blocks workflow until reviewed.
2. Sanctions exposure triggers freeze/suspension review.
3. Mixer/tainted exposure triggers AML case review.
4. Wallet screening result must link to transaction.
5. Wallet screening disposition must be audit logged.

Error code:

```txt
WALLET_SCREENING_BLOCKED
```

---

## 11. Payout Destination and Withdrawal Rules

### PAY-RULE-001 Own-Name Payout Only

Payout destination must be in the client's own verified name.

Rules:

1. Third-party payout is prohibited by default.
2. Exceptional third-party payout requires policy-approval feature flag, EDD, senior compliance approval, documented rationale, and maker-checker.
3. Third-party payout override default is disabled.
4. Withdrawal to unverified destination is blocked.
5. Cooling-off period is hard gate before first use.

Error codes:

```txt
THIRD_PARTY_PAYOUT_BLOCKED
PAYOUT_DESTINATION_NOT_VERIFIED
```

### PAY-RULE-002 Withdrawal Preconditions

Withdrawal may proceed only if:

1. Client is approved.
2. Account is not frozen or suspended for withdrawal.
3. Destination is verified and own-name.
4. Cooling-off period has passed.
5. Client-side approval is completed where required.
6. Travel Rule data is complete where required.
7. Wallet screening passes where required.
8. AML status is acceptable.
9. Available balance is sufficient.
10. Hold is created atomically.
11. Maker-checker approval completed.
12. SoD check passes.

### PAY-RULE-003 Withdrawal Release

Withdrawal release must not occur unless:

1. Payment instruction is approved.
2. Bank/custodian release is authorised.
3. Ledger hold exists.
4. Release is linked to approved withdrawal.
5. Reconciliation path exists.
6. Audit log is written.

---

## 12. Deposit and Suspense Rules

### DEP-RULE-001 Fiat Deposit Credit

Fiat deposit may be credited only after confirmed bank receipt.

Rules:

1. Bank receipt evidence required.
2. Deposit must be matched to client.
3. Unmatched deposit routes to suspense/clearing account.
4. AML review required where risk exists.
5. Ledger credit only after approval.
6. Client-money safeguarding computation updates after credit.

### DEP-RULE-002 Digital Asset Deposit Credit

Digital asset deposit may be credited only after required confirmation.

Rules:

1. Approved deposit address required.
2. On-chain/custodian confirmation required.
3. Wallet screening required.
4. Compliance disposition required where risk exists.
5. Digital deposit credit requires maker-checker.
6. Ledger credit only after confirmation and approval.
7. Custodian reconciliation path required.

### DEP-RULE-003 Unmatched Deposit Handling

Unmatched deposit must not be credited to client balance.

Rules:

1. Route to suspense / clearing account.
2. Create investigation task.
3. Perform AML review if required.
4. Match to client only with evidence.
5. Return only to verified source where return is required.
6. Unresolved unmatched deposit remains in suspense with escalation.
7. Audit events required.

Error code:

```txt
DEPOSIT_UNMATCHED
```

---

## 13. Quote, Pricing, and Best Execution Rules

### QTE-RULE-001 LP-Derived Quote

Quote must be derived from approved LP price source plus disclosed brokerage fee.

Rules:

1. LP source must be approved.
2. LP snapshot must be stored.
3. Brokerage fee must be separate.
4. Manual markup is prohibited.
5. Quote validity uses server UTC.
6. Expired quote cannot be accepted.
7. Re-quote requires fresh client confirmation.

### QTE-RULE-002 Best Execution / Fair Pricing

Best-execution / fair-pricing check must pass before trade booking.

Rules:

1. Quote must be validated against LP reference.
2. Tolerance must be configured.
3. Failure blocks trade.
4. Evidence must be retained.
5. Conflict-of-interest evidence must be retained.
6. Staff quote must remain LP-derived.

Error code:

```txt
BEST_EXECUTION_CHECK_FAILED
```

### QTE-RULE-003 External LP Market Depth

External LP depth may be displayed only as indicative snapshot.

Rules:

1. Label must be `External LP Market Depth`.
2. Display must not be clickable direct order book.
3. Display must not be called AIX Order Book.
4. Market-data licence must be confirmed.
5. No public exchange behaviour.


### FX-RULE-001 FX / Conversion Policy

FX and conversion must follow an approved, timestamped, and auditable policy.

Rules:

1. FX rate source must be approved before production.
2. FX rate must capture source, timestamp, validity window, and server UTC.
3. FX conversion must follow approved rounding policy.
4. FX movement beyond tolerance must trigger void, re-quote, or cancellation.
5. Client reconfirmation is required after re-quote.
6. AIX must not absorb FX movement as principal exposure unless separately approved and documented.
7. FX rate used in quote, trade, ledger, settlement, and report must be traceable.
8. FX-related fee and conversion amounts must be separately recorded where applicable.
9. FX rule failure must block trade booking or settlement.

Error codes:

```txt
FX_RATE_INVALID
FX_REQUOTE_REQUIRED
PRINCIPAL_EXPOSURE_BLOCKED
```

---

## 14. LP Execution and Agency Rules

### LP-RULE-001 Pre-Funded Hold Before LP Execution

LP execution cannot fire unless pre-funded hold is successful.

Rules:

1. Hold must be atomic.
2. Hold must not exceed available balance.
3. Hold must link to quote/trade.
4. Hold failure blocks LP execution.
5. Hold release required on expiry/failure.
6. No LP execution without approved client and product access.

Error code:

```txt
PREFUNDED_HOLD_FAILED
```

### LP-RULE-002 LP Outage Fail Closed

If LP is unavailable, the platform must fail closed.

Rules:

1. No internal fallback pricing.
2. No manual principal quote.
3. No execution without LP confirmation.
4. Client may be shown unavailable/retry/re-quote status.
5. Backup LP failover remains open item until approved and documented.

Error code:

```txt
LP_UNAVAILABLE
```

### LP-RULE-003 Partial Fill / Slippage

Partial fill or slippage beyond tolerance must trigger void, re-quote, or reversal.

Rules:

1. No residual AIX position.
2. No AIX principal absorption.
3. Re-quote requires fresh client confirmation.
4. Fee reversal required where applicable.
5. Audit trail required.

### LP-RULE-004 LP Settlement Payment

LP settlement payment requires:

1. Valid LP execution reference.
2. Confirmed pre-funded hold.
3. Valid DvP / safeguarded settlement sequence.
4. Client-side fund/asset control.
5. Maker-checker approval.
6. Finance/Ops approval.
7. Reconciliation linkage.

Error code:

```txt
LP_SETTLEMENT_PAYMENT_BLOCKED
```

---

## 15. Ledger, Balance, and Idempotency Rules

### LED-RULE-001 Double-Entry Ledger

Every financial movement must post through double-entry ledger.

Rules:

1. Total debit equals total credit.
2. Ledger entries are immutable.
3. No deletion.
4. No direct edit.
5. Reversal uses reversing entries.
6. Source workflow reference required.
7. Source transaction reference required.
8. Idempotency key required where applicable.

Error code:

```txt
LEDGER_IMBALANCE
```

### LED-RULE-002 Client Balance Derived from Ledger

Client balance must be derived from ledger.

Rules:

1. Direct balance edit prohibited.
2. Available balance cannot go negative.
3. Hold cannot exceed available balance.
4. Frozen balance cannot be withdrawn.
5. Held balance cannot be reused.
6. Concurrent balance allocation must be prevented.

Error code:

```txt
INSUFFICIENT_AVAILABLE_BALANCE
```

### LED-RULE-003 Atomic Balance and Ledger Operation

Balance hold and ledger posting must be atomic and concurrency-safe.

Rules:

1. Balance check and hold creation must happen in same transaction.
2. Use serializable isolation, row-level lock, or equivalent safe mechanism.
3. Distinct concurrent operations must not double-allocate same available balance.
4. Ledger posting must not commit if related hold fails.
5. Hold must not commit if related ledger posting fails where part of same event.

Error code:

```txt
CONCURRENCY_CONFLICT
```

### LED-RULE-004 Idempotency

All financial and sensitive operations must be idempotent.

Required idempotent operations:

1. Quote acceptance.
2. Trade booking.
3. Ledger posting.
4. Deposit crediting.
5. Withdrawal submission.
6. Payment instruction.
7. Settlement status update.
8. Reversal posting.
9. Payout destination approval.
10. LP settlement payment.

Error code:

```txt
IDEMPOTENCY_CONFLICT
```


### LED-RULE-005 Asset Precision and Rounding

The system must enforce per-asset precision and rounding policy.

Rules:

1. Every asset must define decimal precision.
2. Every fiat currency must define decimal precision.
3. Every pair must define calculation precision and display precision.
4. Rounding direction must be approved for fee, quote, trade, ledger, and settlement calculations.
5. Ledger posting must use controlled precision.
6. Sub-precision residuals must not leak into client balances.
7. Rounding differences must be posted to an approved rounding account where applicable.
8. Rounding must not break trial balance.
9. Rounding must not create undisclosed AIX spread or principal exposure.
10. Any asset without precision policy is blocked.

Error codes:

```txt
ASSET_PRECISION_INVALID
LEDGER_IMBALANCE
```

---

## 16. Settlement, DvP, and Reconciliation Rules

### SET-RULE-001 Settlement Sequencing / DvP

Settlement must not create AIX exposure.

Rules:

1. No final client ledger credit before confirmed receipt where doing so creates exposure.
2. No LP payment before client-side asset/fund control unless approved DvP/safeguarded mechanism exists.
3. Use suspense/clearing accounts for pending states.
4. Settlement failure triggers void, re-quote, reversal, or exception.
5. Settlement evidence must be retained.

Error code:

```txt
SETTLEMENT_SEQUENCE_INVALID
```

### SET-RULE-002 Reconciliation Requirement

The platform must reconcile:

1. Ledger vs bank.
2. Ledger vs custodian.
3. Ledger vs LP.
4. Client money daily reconciliation.
5. LP three-way reconciliation.
6. Custodian reconciliation.
7. Bank reconciliation.

### SET-RULE-003 Reconciliation Break

Reconciliation break must create exception workflow.

Rules:

1. Break owner required.
2. Evidence required.
3. Resolution reason required.
4. Maker-checker required for closure.
5. Compliance review required if client/AML impact.
6. Ledger adjustment must use reversal/adjustment workflow.
7. No deletion of original record.

Error code:

```txt
RECONCILIATION_BREAK
```

---

## 17. Client-Money Safeguarding Rules

### SAFE-RULE-001 Full-Backing Invariant

Client money liabilities must be fully backed by safeguarded resources.

Rules:

1. Compute client money liability.
2. Compute safeguarded resources.
3. Resources must equal or exceed liability.
4. Shortfall creates high-severity alert.
5. Shortfall requires escalation and remediation.
6. Shortfall closure requires Finance Manager and Compliance review.
7. Go-live requires safeguarding computation to balance.

Error code:

```txt
CLIENT_MONEY_SHORTFALL
```

### SAFE-RULE-002 No Operational Use of Client Money

Client money must not be used for:

1. AIX payroll.
2. Vendor payment.
3. Company debt.
4. Proprietary obligation.
5. Non-client settlement.
6. Principal trading.
7. Market making.
8. Any operating expense.

### SAFE-RULE-003 Safeguarding Report

Safeguarding report must be:

1. Generated daily where required.
2. Linked to reconciliation.
3. Approved where required.
4. Export controlled.
5. Retained for audit.

---

## 18. Account Freeze, Suspension, and Offboarding Rules

### FRZ-RULE-001 Freeze / Suspension Trigger

The system must support freeze, suspension, and partial restriction from:

1. Sanctions hit.
2. AML case.
3. Transaction monitoring alert.
4. Wallet screening high-risk result.
5. Court order.
6. Regulatory directive.
7. Fraud / account takeover.
8. Safeguarding shortfall.
9. Manual compliance decision.

### FRZ-RULE-002 Freeze Scope

Freeze / suspension may apply to:

1. Login.
2. Trade.
3. Deposit.
4. Withdrawal.
5. Payout destination.
6. Full account.
7. Report-only access.

Error codes:

```txt
CLIENT_FROZEN
ACCOUNT_FROZEN
CLIENT_SUSPENDED
```

### OFF-RULE-001 Client Offboarding

Client closure cannot complete if:

1. Any balance remains.
2. Any open trade remains.
3. Any open settlement remains.
4. Any open withdrawal remains.
5. Any reconciliation break remains.
6. AML/STR restriction prevents closure.
7. Balance return destination is not verified own-name.
8. Retention rules are not applied.

---

## 19. Vendor, Custody, Bank, and Secret Rules

### VND-RULE-001 Vendor Approval

Vendor cannot be activated until:

1. Vendor due diligence is complete.
2. Contract/SLA is recorded.
3. Security review is complete.
4. Compliance review is complete.
5. Finance/Ops review is complete for money-critical vendor.
6. Exit plan is recorded.
7. Management approval is obtained where required.

### VND-RULE-002 Secrets

Rules:

1. Production secrets must be stored in KMS/vault.
2. No production secret in code.
3. No production secret in AI prompt.
4. No human role should view plaintext production secret after storage.
5. Secret rotation requires maker-checker.

### VND-RULE-003 Custody Exit / Asset Migration

If custodian is suspended, terminated, replaced, or fails:

1. Custody exit plan must be opened.
2. Client asset return or migration path must be defined.
3. Client asset records must reconcile before migration.
4. Compliance and Finance review required.
5. Client notification required where applicable.
6. Management approval required where material.
7. No client asset may be stranded.

### VND-RULE-004 Backup LP / Failover

Backup LP / failover is not active by default.

Rules:

1. LP outage fails closed.
2. Backup LP is open item until approved.
3. Backup LP requires vendor approval, legal agreement, market-data permission, integration testing, and reconciliation design.
4. Failover cannot create worse pricing or principal exposure.

---

## 20. Privacy, Data Classification, and Records Rules

### DATA-RULE-001 Data Classification

Every PII or sensitive-data module must have `16_Data_Classification.md`.

Sensitive data includes:

1. KYC/KYB.
2. Beneficial ownership.
3. SOF/SOW.
4. Professional/accredited evidence.
5. Screening results.
6. Wallet screening results.
7. Travel Rule data.
8. AML/STR records.
9. Bank account details.
10. Wallet ownership evidence.
11. Client-money safeguarding records.
12. Audit reports.

### DATA-RULE-002 Sensitive Read Logging

Read access must be logged for sensitive records.

### DATA-RULE-003 Data Residency and Privacy

Data residency and privacy rules must be approved before production.

Rules:

1. Hosting location approved.
2. Cross-border vendor processing reviewed.
3. DSAR/privacy workflow defined.
4. Retention conflicts resolved before export or deletion.
5. Data exports require approval where sensitive.

### REC-RULE-001 Records Retention

Records must be retained according to approved retention policy.

Rules:

1. Audit log cannot be deleted.
2. Ledger cannot be deleted.
3. KYC/AML/Travel Rule records follow retention policy.
4. STR records are highly restricted.
5. Legal hold overrides deletion.
6. Archive/retrieval must be controlled.

---

## 21. Reporting and Regulatory Filing Rules

### RPT-RULE-001 Regulatory Report Approval

Regulatory reports and LFSA returns require approval before submission.

Rules:

1. Draft generated.
2. Domain owner review.
3. Compliance/MLRO approval.
4. Management approval where required.
5. Submission evidence retained.
6. Export audit logged.

### RPT-RULE-002 Threshold Transaction Reporting

Threshold transaction report workflow must be owned by compliance.

Rules:

1. Threshold trigger captured.
2. Report prepared.
3. Compliance Officer / MLRO approval.
4. Submission evidence retained.
5. Restricted access.

### RPT-RULE-003 Report Export

Sensitive report export requires:

1. Permission.
2. Data minimisation.
3. Approval where restricted.
4. Audit log.
5. Retention classification.

---

## 22. Admin, IAM, Break-Glass, and Security Rules

### IAM-RULE-001 MFA

Rules:

1. Staff MFA required.
2. Client MFA required for sensitive flows where configured.
3. MFA reset requires maker-checker.
4. MFA bypass is prohibited unless controlled break-glass applies.

### IAM-RULE-002 Role and Permission Changes

Rules:

1. Role change requires maker-checker.
2. Permission change requires maker-checker.
3. User cannot change own permission.
4. Prohibited permission cannot be granted.
5. Permission changes are audit logged.

### SEC-RULE-001 Break-Glass Access

Break-glass access must be:

1. Time-boxed.
2. Named user only.
3. Approved by separate grantor.
4. Heightened audit logged.
5. Auto-alerted to Security, Management, and Compliance where relevant.
6. Post-reviewed.
7. Not allowed to bypass licence locks.

Error code:

```txt
BREAK_GLASS_ACCESS_USED
```

### SEC-RULE-002 Audit Log

Audit log must be:

1. Append-only.
2. Tamper-evident.
3. Not editable.
4. Not deletable.
5. Search/export controlled.
6. Read access to sensitive audit data logged.


### SEC-RULE-003 Encryption in Transit and at Rest

Sensitive and regulated data must be encrypted in transit and at rest.

Rules:

1. All network communication must use TLS or approved equivalent.
2. PII, KYC/KYB, beneficial ownership, SOF/SOW, Travel Rule, bank, wallet, AML, STR, audit, and client-money records must be encrypted at rest where applicable.
3. Encryption keys must be managed through KMS/vault or approved key-management service.
4. Production encryption keys must not be stored in source code.
5. Production encryption keys must not be shared in AI prompts, tickets, documents, or plaintext chat.
6. Key rotation must be supported.
7. Key access must be restricted and audit logged.
8. Data residency and encryption controls must be approved before production.

Error code:

```txt
DATA_RESIDENCY_VIOLATION
```

---

## 23. Complaints and DSAR / Privacy Rules

### CMP-RULE-001 Complaints and Disputes

Complaints workflow must include:

1. Submission.
2. Acknowledgement.
3. Owner assignment.
4. Investigation.
5. Resolution.
6. Approval where required.
7. Closure.
8. Evidence.
9. Audit log.

Complaint owner cannot close own complaint without oversight.

### PRIV-RULE-001 DSAR / Privacy Request

DSAR/privacy workflow must include:

1. Request submission.
2. Identity verification.
3. Data inventory review.
4. Retention/legal conflict review.
5. Response preparation.
6. Approval.
7. Export/release.
8. Closure.
9. Audit log.

DPO owns privacy workflow.

---

## 24. Reliability, BCP-DR, and Go-Live Assurance Rules

### REL-RULE-001 Reliability / BCP-DR

The platform must have reliability, backup, monitoring, and disaster recovery controls before production.

Rules:

1. Backup plan must be documented.
2. Restore test must be completed before go-live.
3. RTO and RPO targets must be defined.
4. System health monitoring must be active.
5. Security monitoring must be active.
6. Critical job failures must alert responsible staff.
7. LP outage must fail closed.
8. Custodian, bank, and vendor outage procedures must be documented.
9. BCP/DR evidence must be retained.
10. Production incident workflow must be linked to audit and reporting.

### GOV-RULE-001 Go-Live Assurance Gate

The platform must not go live unless all mandatory production-readiness gates are met.

Required go-live gates:

1. Compliance / MLRO sign-off.
2. Principal Officer / management sign-off.
3. SRS approved.
4. Module blueprints approved for MVP scope.
5. Security architecture approved.
6. Custody model approved.
7. Client-money safeguarding model approved.
8. Fiat banking partner confirmed.
9. Crypto custodian confirmed.
10. LP legal agreement confirmed.
11. LP market-data licence confirmed.
12. Vendor due diligence completed.
13. Pen test passed or risk-accepted through formal approval with named approver, rationale, residual-risk rating, remediation owner, and target remediation date recorded.
14. DR / backup restore test passed.
15. Ledger trial balance nets to zero.
16. Client-money safeguarding computation balances.
17. Reconciliation path tested.
18. Feature flags verified.
19. Future-locked Exchange modules disabled.
20. Production deployment maker-checker approved.
21. Data residency and privacy controls approved.
22. Monitoring and incident response active.

Error code:

```txt
GO_LIVE_GATE_NOT_MET
```

---

## 25. Prohibited System Behaviours

The system must never allow:

```txt
Public exchange order book
Matching engine
Client-to-client matching
Public exchange trading
Market making
Principal dealing
AIX spread markup
Manual quote markup
Retail onboarding by default
Direct ledger edit
Direct ledger delete
Direct balance edit
Audit log delete
Audit log modify
Bypass KYC
Bypass AML
Bypass Travel Rule
Bypass pre-funded hold
Bypass payout destination verification
Bypass best-execution check
Bypass maker-checker
Bypass client-side approval
Bypass SoD
Bypass LP settlement approval
Bypass break-glass logging
Use client money for AIX operations
Plaintext production secret access
MYR pair without approval
Privacy coin support
Algorithmic stablecoin support
Securities token support without approval
Derivatives
Margin trading
Lending
Staking
Yield / earn product
Unapproved FX rate source
Undefined asset precision
```

**Added in v1.3 — the list grows, nothing is removed.** *(Two entries above are restated below
because their v1.2 wording implied a production-only or approval-conditional scope:
"Securities token support without approval" is production-scoped by `ASSET-RULE-001` item 4 and
`ASSET-RULE-002`; "Public exchange order book" and "Matching engine" mean **for MB Spot** and are
permanent under `LIC-RULE-002`.)*

```txt
MB Spot client order book holding mutually executable client orders
MB-domain module calling an Exchange-domain module
Exchange-domain module executing an AIX Spot or AIX OTC client order
Sharing execution code between EXE-01 and EXO-01
Admitting a security-classified instrument to AIX Spot or AIX OTC
Activating a capability without the governed activation path
Inferring production activation from build state, test results,
  environment availability, deployment or a permission grant
Promoting a non-production capability state to production
Representing build state, environment availability and production
  activation as a single boolean
Relaxing any control in a non-production environment
Using real client PII in development, test, UAT or demo
Using live counterparty, LP or custodian credentials in non-production
Live regulated execution in a controlled demo
Treating an unknown environment as non-production
Using a synthetic or test instrument classification in production
Promoting a synthetic classification to a production classification
Setting product eligibility independently of classification
Blocking cancellation of an unexecuted client order
Reusing the exchange.* namespace for securities Exchange capabilities
Renaming or deleting a seeded prohibited-feature identifier without a
  controlled decision and reseal
Reporting a capability denial as a permission denial, or the reverse
Substituting PRODUCTION_ACTIVATION_GATE_CLOSED for
  CAPABILITY_PERMANENTLY_PROHIBITED, or the reverse
Derivatives, futures, perpetuals, margin, leverage, lending, staking,
  yield or DeFi yield in any environment
```

---

## 26. Master Error Code Set

Minimum system error codes:

```txt
PERMISSION_DENIED
FEATURE_DISABLED
LICENCE_SCOPE_BLOCKED
EXCHANGE_MODULE_LOCKED
PRINCIPAL_EXPOSURE_BLOCKED
SPREAD_MARKUP_BLOCKED
FEE_REVERSAL_REQUIRED
CLIENT_TYPE_NOT_ALLOWED
CLIENT_NOT_APPROVED
CLIENT_SUSPENDED
CLIENT_FROZEN
ACCOUNT_FROZEN
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
IDEMPOTENCY_CONFLICT
QUOTE_EXPIRED
BEST_EXECUTION_CHECK_FAILED
LP_UNAVAILABLE
LP_EXECUTION_FAILED
LP_SETTLEMENT_PAYMENT_BLOCKED
SETTLEMENT_SEQUENCE_INVALID
CLIENT_MONEY_SHORTFALL
RECONCILIATION_BREAK
LEDGER_IMBALANCE
SEGREGATION_OF_DUTIES_CONFLICT
CLIENT_SIDE_APPROVAL_REQUIRED
MAKER_CHECKER_REQUIRED
BREAK_GLASS_ACCESS_USED
ASSET_NOT_ALLOWED
PAIR_NOT_ALLOWED
FX_RATE_INVALID
FX_REQUOTE_REQUIRED
ASSET_PRECISION_INVALID
VALIDATION_ERROR
RATE_LIMITED
DATA_RESIDENCY_VIOLATION
GO_LIVE_GATE_NOT_MET
DATA_EXPORT_RESTRICTED
```

**Added in v1.3 — new codes only; no existing code is renamed or removed.**
`EXCHANGE_MODULE_LOCKED` keeps its name and meaning (Doc 00 §9A).

```txt
CAPABILITY_PERMANENTLY_PROHIBITED
PRODUCTION_ACTIVATION_GATE_CLOSED
CAPABILITY_NOT_AVAILABLE_IN_ENVIRONMENT
ENVIRONMENT_UNKNOWN_FAIL_CLOSED
CAPABILITY_ACTIVATION_APPROVAL_REQUIRED
INSTRUMENT_CLASSIFICATION_UNRESOLVED
INSTRUMENT_NOT_ELIGIBLE_FOR_PRODUCT
SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT
SYNTHETIC_INSTRUMENT_NOT_VALID_IN_PRODUCTION
MB_DOMAIN_MAY_NOT_CALL_EXCHANGE_DOMAIN
EXCHANGE_DOMAIN_MAY_NOT_EXECUTE_MB_ORDER
ORDER_NOT_CANCELLABLE
PRE_TRADE_CONTROL_REJECTED
SUSPICIOUS_ORDER_BLOCKED
ROUTING_POLICY_NO_ELIGIBLE_VENUE
VENUE_NOTIFICATION_PERIOD_NOT_ELAPSED
TRANSFER_RESTRICTION_VIOLATED
INSTRUMENT_NOT_LISTED
TRADING_HALTED
EXCHANGE_SESSION_CLOSED
PARTICIPANT_NOT_ADMITTED
CLEARING_INTERFACE_UNAVAILABLE
MERCHANT_NOT_APPROVED
SETTLEMENT_DESTINATION_NOT_WHITELISTED
ISSUER_DUE_DILIGENCE_INCOMPLETE
INVESTOR_NOT_ELIGIBLE
```

**Error-code rules (new in v1.3):**

1. **A capability denial must not be reported as a permission denial, or the reverse**
   (`SYS-RULE-011`).
2. **`CAPABILITY_PERMANENTLY_PROHIBITED` and `PRODUCTION_ACTIVATION_GATE_CLOSED` are different
   answers and must never be substituted.** The first means *there is no path*; the second means
   *the path exists and is closed*.
3. **`MB_DOMAIN_MAY_NOT_CALL_EXCHANGE_DOMAIN` and `EXCHANGE_DOMAIN_MAY_NOT_EXECUTE_MB_ORDER` are
   boundary violations, not authorisation failures**, and carry heightened audit.

---

## 27. Rule-to-Test Requirement

Every Critical and High rule must have:

1. Positive test.
2. Negative test.
3. Permission denial test.
4. Feature flag test where applicable.
5. Maker-checker test where applicable.
6. SoD test where applicable.
7. Audit event test.
8. Error-code test.
9. Regression test.
10. UAT scenario where user-facing.
11. **Per-environment test** where the rule is environment-sensitive — that it behaves identically in DEVELOPMENT, TEST, UAT, DEMO and PRODUCTION, or, where it is deliberately environment-scoped, that the difference is exactly the one specified. *(New in v1.3.)*
12. **Fail-closed test** for each of the four states in `SYS-RULE-006`…`SYS-RULE-009` — unknown, unreadable, unresolved and absent each deny (`SYS-RULE-010`).
13. **Denial-attribution test** — the correct control is named in the denial (`SYS-RULE-011`).

Security-critical rules must additionally have:

1. Input validation test.
2. Rate limiting / abuse test.
3. Encryption configuration test.
4. Sensitive data access test.
5. Data residency control test where applicable.

Money-critical rules must additionally have:

1. Ledger balancing test.
2. Concurrency test.
3. Idempotency test.
4. Reconciliation test.
5. Reversal test.
6. Safeguarding test where applicable.
7. FX rate / conversion test where applicable.
8. Asset precision and rounding test where applicable.

---

## 28. Rule-to-Module Mapping

| Rule Group | Primary Module Group |
|---|---|
| SYS | FND / IAM / OPS |
| LIC | FND / CFG / OMS / EXE / TRD / **EXM / EXO / EXC / EXP** |
| CFG | FND / OPS / IAM |
| CLT | CLT / CMP |
| AML | CMP |
| TR | CMP / MON |
| PAY | MON / CMP |
| DEP | MON / CMP / VND |
| QTE / FX / ASSET | OMS / MKD / LQD / EXE / TRD / VND / **AST** |
| LP | PRD / VND / MON |
| LED | MON |
| SET | MON |
| SAFE | MON / RPT |
| FRZ / OFF | CMP / CLT / MON |
| VND | VND |
| DATA / REC | RPT / CMP / IAM |
| RPT | RPT |
| IAM / SEC / REL / GOV | IAM / OPS |
| CMP / PRIV | CMP / RPT |

---

## 29. Rule Parameters

```txt
default_deny = true
backend_permission_source_of_truth = true
fail_closed = true
server_utc_required = true
input_validation = required
rate_limiting = required

money_broking_scope = agency_only
mb_spot_venue_capabilities = permanently_prohibited_every_environment
exchange_modules_locked = true
principal_dealing_blocked = true
aix_inventory_limit = 0
naked_position_allowed = false
disclosed_brokerage_fee_only = true
aix_spread_markup_blocked = true
manual_quote_markup_blocked = true
prohibited_asset_categories = myr_privacy_algostable_securities_derivatives_margin_lending_staking_yield

fx_conversion_policy = approved_rate_source_utc_rounding_no_principal_absorption
asset_precision_rounding_policy = per_asset_defined

feature_flag_default = disabled
future_exchange_flag_enable = prohibited_in_mvp

# --- Capability state model (v1.3, DEC-013) ---
capability_states = build_state__environment_state__production_activation_state__product_asset_eligibility_state
single_enabled_boolean = prohibited_as_sole_representation
environments = development_test_uat_demo_production
unknown_environment = treated_as_production_fail_closed
unknown_regulatory_production_state = fail_closed
non_production_state_promotion = prohibited
control_relaxation_in_non_production = prohibited
demo_regulated_execution = mock_synthetic_non_live_only
external_demo_of_gated_capability = fail_closed_pending_R6_Q1
production_activation_path = maker_checker_with_compliance_and_management_checkers
deactivation_path = single_authorised_actor_plus_one_checker
permission_implies_activation = false
activation_implies_permission = false
access_evaluation = conjunctive
securities_exchange_namespace = securities_market_dot_star
exchange_dot_star_namespace = frozen_mb_boundary_prohibition_namespace
mb_domain_to_exchange_domain_call = prohibited_every_environment
exchange_domain_executing_mb_order = prohibited_every_environment
shared_execution_code_exe01_exo01 = prohibited
synthetic_instrument_classification = non_production_only_never_promotable
security_classified_instrument_in_mb_product = prohibited_every_environment
unresolved_classification = blocks_production_activation_not_development
maker_checker_required_for_high_risk = true
self_approval = prohibited
sod_conflict_matrix_enforced = true

client_type_scope = institutional_and_HNWI_professional_only
retail_onboarding_default = disabled
professional_status_verification_required = true
client_side_dual_authorization = required_for_withdrawal_large_trade_and_payout_destination_where_mandate_or_threshold

kyc_required_before_transaction = true
sof_sow_capture_required = true
beneficial_ownership_required = true
edd_required_for_high_risk = true
sanctions_rescreen_on_list_update = required
periodic_kyc_refresh = risk_based_schedule
transaction_monitoring = required

travel_rule_enforcement = required
wallet_screening = required

withdrawal_own_name_only = true
third_party_payout = prohibited_by_default
payout_destination_cooling_off_hard_gate = true

unmatched_deposit_handling = suspense_then_match_or_return
digital_deposit_credit_maker_checker = required

pre_funded_hold_before_lp_execution = true
lp_outage = fail_closed
lp_partial_fill_slippage = void_or_requote_or_reversal
best_execution_check = required_before_booking
lp_settlement_payment_maker_checker = required

double_entry_ledger = required
client_balance_derived_from_ledger = true
direct_balance_edit = prohibited
balance_operations_atomic = true
balance_isolation = serializable_or_row_lock
idempotency_required = true

settlement_sequence_dvp = required
client_money_fully_backed_invariant = true
client_money_operational_use = prohibited
reconciliation_break_workflow = required

account_freeze_workflow = required
client_offboarding_workflow = required
custody_exit_migration_workflow = required
backup_lp_failover = open_item_deferred

encryption_in_transit = required
encryption_at_rest_sensitive = required
sensitive_read_access_logging = required
data_residency = required_before_production
dpo_privacy_owner = required
break_glass_access = controlled_timeboxed_heightened_audit
reliability_bcp_dr = required
go_live_assurance_gate = required
```

---

## 30. Open Items for Later Documents

The following must be defined in later documents:

1. Exact AML thresholds.
2. Exact transaction monitoring rules.
3. Exact Travel Rule threshold.
4. Exact client-side dual authorization threshold.
5. Exact payout destination cooling-off period.
6. Exact LP slippage tolerance.
7. Exact best-execution tolerance.
8. Exact FX rate source and rounding policy.
9. Exact client-money safeguarding formula.
10. Exact reconciliation matching rules.
11. Exact freeze/suspension scope configuration.
12. Exact offboarding SLA.
13. Exact KYC refresh schedule by risk level.
14. Exact data retention years.
15. Exact data residency location.
16. Exact vendor approval thresholds.
17. Exact backup LP / failover policy.
18. Exact custody exit / asset migration plan.
19. Exact API endpoint permission rules.
20. Exact audit event schema.
21. Exact asset precision and rounding policy.
22. Exact approved FX rate source and tolerance.
23. Exact go-live assurance checklist evidence format.
24. Exact RTO/RPO targets.
25. Exact encryption key rotation schedule.
26. **Exact per-environment capability configuration schema and defaults** (`MIG-004`, `MIG-005`). *(New in v1.3.)*
27. **Exact production activation evidence pack per capability** (`CFG-RULE-004`).
28. **Exact `securities_market.*` capability code set and seeded default states** (`MIG-007`).
29. **Exact instrument classification evidence standard and legal classifier of record** (`R4-Q3`).
30. **Exact Exchange market microstructure parameters** — tick size, lot size, price bands, sessions, halt thresholds.
31. **Exact Exchange clearing and settlement counterparties and interfaces.**
32. **Exact Exchange participant admission criteria.**
33. **Exact Pay and RWA fee models** (`R5-Q2`).
34. **Exact RWA custody basis for tokenised instruments** (`R4-Q5`).
35. **Whether external controlled demo of a production-gated regulated capability is permissible** (`R6-Q1`).

---

## 31. Claude Model Usage

### 31.1 ChatGPT 5.5

Use for:

1. Rule refinement.
2. System logic planning.
3. Module blueprint drafting.
4. API rule mapping.
5. Test case generation.
6. Claude prompt creation.

### 31.2 Claude Opus

Use for:

1. Review of this Master System Rules document.
2. Licence-boundary review.
3. Money-control and ledger rule review.
4. AML/Travel Rule rule review.
5. Security/RBAC/audit rule review.
6. Principal-dealing and Exchange-lock review.

### 31.3 Claude Sonnet

Do not use Sonnet for coding until the relevant module blueprint is approved.

### 31.4 Claude Fable

Use later for user-facing rule failure messages and client-facing guidance.

---

## 32. Claude Opus Review Prompt

```txt
Review this 06_Master_System_Rules_v1.2.md as a principal fintech platform architect and regulated fintech control/security reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending.
- This document is based on:
  - 00_Licence_Scope_And_Feature_Lock_v1.3.md
  - 01_Project_Charter_v1.3.md
  - 03_Master_Module_Index_v1.2.md
  - 02_Software_Requirement_Specification_v1.2.md
  - 04_Role_And_Permission_Matrix_v1.2.md
  - 05_Master_Workflow_Map_v1.2.md
- MVP supports institutional and HNWI/professional clients only.
- Retail onboarding is disabled by default.
- Platform includes onboarding, KYC/KYB, AML, Travel Rule, transaction monitoring, payout destination whitelist, OTC/RFQ, MB Spot Broking Terminal, LP-backed agency execution, pre-funded hold, best-execution check, ledger, deposit, withdrawal, client-money safeguarding, settlement, reconciliation, audit log, maker-checker, client-side dual authorization, complaints, DSAR/privacy, break-glass access, account freeze/suspension, offboarding, periodic KYC refresh, reporting, and admin/staff/client portals.
- AIX spread markup, principal dealing, market making, internal matching, client-to-client matching, public order book, matching engine, and public exchange trading are blocked.

This v1.2 keeps the substantive v1.1 corrections and only normalises AML-RULE-001A to AML-RULE-006 and clarifies that any pen-test risk-acceptance branch under the go-live gate must capture approver, rationale, residual-risk rating, remediation owner, and target remediation date. v1.1 added FX / conversion rules, asset precision and rounding rules, prohibited asset/product category rules, completed error codes, encryption in transit/at rest, reliability/BCP-DR, go-live assurance gate, input validation/rate limiting, SoD conflict matrix enforcement, and explicit SOF/SOW, beneficial ownership, and EDD rules.

Review for:
1. Missing system rules.
2. Missing licence-boundary rules.
3. Missing client eligibility/product-access rules.
4. Missing AML/KYC/Travel Rule rules.
5. Missing payout, deposit, withdrawal, and client-money safeguarding rules.
6. Missing quote, LP execution, best-execution, and settlement rules.
7. Missing ledger, balance, idempotency, and concurrency rules.
8. Missing reconciliation and exception rules.
9. Missing RBAC, maker-checker, SoD, audit, and break-glass rules.
10. Missing privacy, records, reporting, or regulatory filing rules.
11. Missing error codes or failure behaviours.
12. Missing testability or rule-to-module mapping.
13. Any rule that could accidentally allow exchange-like or principal-dealing behaviour.
14. Any conflict with 00, 01, 03, 02, 04, or 05.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional rules or parameters to add.
```

---

## 33. Next Document

After this Master System Rules document is reviewed and accepted, the next document should be:

```txt
07_Master_Data_Flow.md
```

Reason:

Data flow should be created after the system rules are locked, so each data movement can be tied to a rule, workflow, permission, audit event, and security control.
