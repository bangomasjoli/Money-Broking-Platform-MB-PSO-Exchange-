---
document_id: STR-04C
title: AIX Provider Requirements — Liquidity Provider / OTC Counterparty
version: v0.3
document_status: DRAFT / DEC-015 SUPPORTING DOCUMENT — ROUND-2 REMEDIATED / AWAITING ROUND-3 INDEPENDENT REVIEW
implementation_status: N/A
module: N/A (consumed by LQD-01, EXE-01, TRD-01, MKD-01, LED-01, WDR-01, DEP-01, REC-01, TRE-01)
control: Provider-neutral requirements for external execution counterparties under Model A / B
owner: Unassigned
effective_date: 2026-10-04
last_reviewed: 2026-10-04
supersedes: STR-04C v0.2 as the current draft (v0.1 and v0.2 retained unmodified)
baseline_commit: b9e8277
---

# AIX Provider Requirements — Liquidity Provider / OTC Counterparty

> **Provider-neutral. Selects, scores, approves and names no provider.** Approving a counterparty
> is a `WF-19` / LQD-01 activation-gate matter, including the notification requirement recorded in
> `DEC-012` clause 2 (¶7.5 seven days prior). AIX acts as **agent / back-to-back**; every client
> fill binds to a distinct external fill (Module Index §19 rule 5). Section references `§n` point
> to `STR-04` v0.3.

**Candidate context (not selection).** Kraken and Binance OTC are **candidates** named by the owner
(`STR-04` §5 HB-08). Neither is approved, contracted, selected, connected or production-permitted,
and **no capability of either is stated or implied** by this document.

**v0.2 changes (Round-1 R03, R07, R16).** `LPC-REQ-010` (legal capacity) raised from MUST (INFO)
to MUST; `LPC-REQ-020` states that AIX corporate prefunding never settles a client obligation;
added §2.6 default, netting and finality (`LPC-REQ-060`…`LPC-REQ-065`) and `LPC-REQ-055`…`058`
(BCP/DR, audit rights, exit/termination/migration, data security and protection); extended §3.

**v0.3 changes (Round-2 R2-F16, R2-F08).** Added `LPC-REQ-066`…`LPC-REQ-070`: application or seizure
of AIX corporate collateral / prefunding after a client-related failure, margin requirements on
AIX (if any), close-out netting scope across AIX's client-related and corporate obligations,
recovery and claims process, and event evidence. Tightened `LPC-REQ-020`, `-057`, `-061`, `-063`;
extended §3. **No candidate is assumed to use any collateral, margin, set-off or close-out
structure**; each item asks what the counterparty's terms actually say.

## 1. How to use this document

Priority **MUST / SHOULD / INFO**; trigger **LPA** before live provider activation (LP
live-routing `ACTIVE`). Answers are recorded as LQD-01 LP/venue arrangement evidence (LQD-01 keeps
the LP/venue arrangement; the shared provider identity / DD / WF-19 record follows HD-DEC015-01 —
STR-04 §53 D-2). An unanswered MUST is `UNKNOWN` and fails closed: in particular,
`settlement_basis`, `claim_holder` and `loss_bearer` remain `UNVERIFIED` and **no live LP
settlement of client obligations** occurs (STR-04 §30.3, §33.3).

## 2. Requirements

### 2.1 Execution

| ID | Requirement | Priority | STR-04 / Decision |
|---|---|---|---|
| LPC-REQ-001 | **RFQ** (request-for-quote) with firm quotes, quote ids, expiry | MUST for OTC | §26; `WF-10` |
| LPC-REQ-002 | **Streaming prices** (indicative and/or executable) with market-data rights stated | SHOULD for Spot | `DEC-012` clause 4(B) |
| LPC-REQ-003 | Order **API** (market/limit as applicable), client-order-id idempotency, status query | MUST | `DEC-012` clause 1 |
| LPC-REQ-004 | Supported **assets/pairs**, contract identities, networks | MUST | AST-01 v1.8 §3.11 |
| LPC-REQ-005 | **Minimum/maximum sizes**, increments, **limits** | MUST | §32 |
| LPC-REQ-006 | **Partial fills**: reporting, aggregation, remaining-quantity semantics, authoritative final unfilled quantity | MUST | §18.3, §32; `DEC-012` clause 1 rule 8 |
| LPC-REQ-007 | **Failed trades / rejects**: deterministic status; **no ambiguous timeouts** (status query must resolve fill vs no-fill authoritatively) | MUST | §18.3, §33.1; §40 rows 16, 36 |
| LPC-REQ-008 | **Cancellation** semantics and races; authoritative cancel confirmation | MUST | §18.3, §31 |
| LPC-REQ-009 | Execution evidence: price, quantity, fees, timestamps per fill; unique execution id (duplicate-fill detection) | MUST | `DEC-012` clause 1 rule 7; §40 row 38 |
| LPC-REQ-010 | **Legal capacity** in which the LP faces AIX for client orders (AIX as disclosed agent / undisclosed agent / principal back-to-back), and who holds the legal claim on an undelivered leg | **MUST** (v0.1: MUST (INFO)) | Doc 00 §10.1 items 3–4; §33.3; EV-30 |

### 2.2 Settlement

| ID | Requirement | Priority | STR-04 / EV |
|---|---|---|---|
| LPC-REQ-020 | **Prefunding / collateral** requirements: whether required, amount, **whose funds** may be accepted (client-funded via a client structure vs AIX corporate), where held, recourse and return terms. **AIX corporate prefunding or collateral is an AIX corporate asset and is never the source of value for a client obligation** (STR-04 §19.4); the LP must state whether its terms would apply AIX prefunding or collateral to client trades (detail: LPC-REQ-066) | MUST | §7.5, §19; EV-19 |
| LPC-REQ-021 | **Credit terms**, if any, and to whom extended (never interpreted as AIX extending credit to clients) | INFO | §19.4; §26 |
| LPC-REQ-022 | **Settlement windows** (T+0/T+1), cut-offs, sequencing (who delivers first) | MUST | §26; EV-20 |
| LPC-REQ-023 | **Settlement accounts / SSIs** for each asset and rail; change control with authenticated notification | MUST | §15; §37.1 |
| LPC-REQ-024 | **Custody interaction**: ability to deliver to / receive from a third-party institutional custodian's client accounts with correlation ids | MUST | §25.1 |
| LPC-REQ-025 | **Direct-bank settlement**: ability to receive USD directly from a client settlement structure at a bank/settlement provider (not only from AIX corporate accounts) | SHOULD (needed for most client-funded paths, §25.4) | §25.4 |
| LPC-REQ-026 | Settlement status reporting per leg, authenticated | MUST | §31 |
| LPC-REQ-027 | Handling of one-leg-settled scenarios, return of mis-delivered assets/cash | MUST | §33.3 |

### 2.3 Fees and conflicts

| ID | Requirement | Priority | STR-04 / Decision |
|---|---|---|---|
| LPC-REQ-030 | Full **fee** schedule; fee per fill reported | MUST | §20.6 |
| LPC-REQ-031 | Any **rebate / payment for order flow / inducement** disclosed in writing | MUST | §20.7; `DEC-012` clause 2 |
| LPC-REQ-032 | **Market-data rights** (display, redistribution, derived data) | MUST if data displayed | `DEC-012` clause 4 |

### 2.4 Reconciliation

| ID | Requirement | Priority | STR-04 |
|---|---|---|---|
| LPC-REQ-040 | Daily **statements**: trades, fees, settlements, balances (AIX corporate account at the LP, if any) | MUST | §34 R5 |
| LPC-REQ-041 | Trade **corrections** process and notification | MUST | §34.3 |

### 2.5 Operations, risk and due diligence

| ID | Requirement | Priority | STR-04 / EV |
|---|---|---|---|
| LPC-REQ-050 | **Outage / failover**: status channel, incident notification, cancel-on-disconnect behaviour | MUST | §40 rows 15–16 |
| LPC-REQ-051 | **Regulatory status** and track record (for `DEC-012` ¶7.5 assessment) | MUST | EV-24 |
| LPC-REQ-052 | **Due diligence** pack: ownership, financials, AML programme, sanctions exposure, security controls, audit reports | MUST | `WF-19` |
| LPC-REQ-053 | **Counterparty risk** information sufficient for LQD-01 exposure and settlement-exposure limits (credit standing, segregation of AIX/client assets at the LP, insolvency treatment) | MUST | §17.4, §33.6 |
| LPC-REQ-054 | API security: authentication, IP allowlisting, key rotation, per-environment credentials, sandbox | MUST | §37 |
| **LPC-REQ-055** | **BCP / disaster recovery** commitments and testing evidence | MUST | — |
| **LPC-REQ-056** | **Audit rights** for AIX and, where required, the regulator | MUST | — |
| **LPC-REQ-057** | **Exit / termination / migration**: termination rights and notice, treatment of open orders and unsettled obligations at termination (each settled or unwound on its own terms, never by applying another client's value), return of prefunded or collateral assets, records and data return | MUST | §19.3, §19.5; WF-19 §23.3 step 9 |
| **LPC-REQ-058** | **Data security and data protection** beyond API security: handling, retention and breach notification for AIX and client data | MUST | EV-27 |

### 2.6 Default, netting and finality

Nothing here is assumed of any LP. Each answer populates the LP arrangement facts
`settlement_basis`, `claim_holder` and the recovery terms used by STR-04 §30.3 and §33.3.

| ID | Requirement | Priority | STR-04 / EV |
|---|---|---|---|
| **LPC-REQ-060** | **Settlement basis** per product and asset: gross per obligation, net payment aggregation, or legal netting; how individual client obligations are identified and discharged inside any net payment | MUST | §30.3; EV-33 |
| **LPC-REQ-061** | **Netting and set-off terms**: whether the LP may net or set off obligations **across different AIX clients**, or against AIX corporate prefunding / collateral / other AIX liabilities; any such right is disclosed for TRE-01 exposure limits and LQD-01 activation review | MUST | §19.4, §19.5, §30.3; EV-33 |
| **LPC-REQ-062** | **Default treatment and close-out**: events of default (either side), close-out mechanics, treatment of unsettled client obligations, and the LP's recourse | MUST | §33.3; EV-31, EV-33 |
| **LPC-REQ-063** | **Credit support / collateral**: what the LP requires, whose assets, where held, segregation, and when it may be applied | MUST | §19.3, §19.5; EV-19, EV-33 |
| **LPC-REQ-064** | **Settlement finality** per leg and rail: when a delivery or payment is final and irreversible; reversal/correction rights after delivery | MUST | §31.4; EV-33, EV-36 |
| **LPC-REQ-065** | **Erroneous confirmation / late fill / trade bust policy**: how the LP treats a fill that contradicts its own earlier no-fill or cancel confirmation | MUST | §18.6; §40 row 37 |
| **LPC-REQ-066** | **Collateral application / seizure**: whether, when and how the LP may apply, seize or set off **AIX corporate** collateral, prefunding or credit support following a failed or defaulted obligation that relates to an AIX client; notice and evidence AIX receives; whether the application discharges the client obligation vis-à-vis the LP; treatment and return of any excess; dispute process | MUST | §19.5; §40 row 54; EV-19, EV-33 |
| **LPC-REQ-067** | **Margin (if applicable)**: whether the LP imposes initial / variation margin or similar requirements on AIX in respect of client-related obligations, and on what terms. (AIX offers **no** margin, leverage or lending to clients — `DEC-013` clause 6; this item concerns only what the LP requires of AIX) | MUST (INFO if none) | §19.3; EV-19 |
| **LPC-REQ-068** | **Close-out netting scope and termination**: on default or termination, whether close-out nets across AIX's client-related and corporate obligations, gross vs net close-out amount, valuation method, and how individual client obligations are identified within it | MUST | §30.3, §33.3; EV-31, EV-33 |
| **LPC-REQ-069** | **Recovery and claims**: after a default, seizure or close-out, the process by which AIX can claim against the LP, the LP can claim against AIX, and whether any claim can be assigned to or pursued directly by the client; insolvency treatment | MUST | §19.5, §33.3; EV-30, EV-31 |
| **LPC-REQ-070** | **Event evidence**: unique immutable ids for confirmations, settlement and collateral notices (unchanged across redeliveries), authenticated delivery, re-verifiable signed payloads | MUST | §34.5, §35.7 |

## 3. Outcomes

Per requirement: `SUPPORTED` / `NOT_SUPPORTED` / `UNKNOWN`, evidence, environment demonstrated.
Results determine which products (Spot/OTC), assets and settlement variants the counterparty may
serve once activated; the obligation sequencing recorded on each settlement; the
**`settlement_basis`** (a basis in which one client's value can discharge another client's
obligation is not usable for client obligations — STR-04 §30.3); the **`claim_holder`** on
undelivered legs; the default and recovery terms feeding **`loss_bearer`** analysis (`EV-31`);
the TRE-01 corporate exposure limits for any AIX corporate prefunding, collateral, margin or
credit support — which never funds a client obligation; and whether the LP's collateral-application,
close-out and set-off terms (LPC-REQ-061, -066…069) are acceptable for client obligations at all
(STR-04 §19.4 item 3, §19.5). **No scoring or selection is performed in DEC-015.**

*STR-04C v0.3 — DRAFT / DEC-015 SUPPORTING DOCUMENT. Provider-neutral. Approves nothing. No
candidate is claimed to support any requirement. v0.1 and v0.2 retained unmodified.*
