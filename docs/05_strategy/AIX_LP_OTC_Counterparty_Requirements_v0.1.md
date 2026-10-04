---
document_id: STR-04C
title: AIX Provider Requirements — Liquidity Provider / OTC Counterparty
version: v0.1
document_status: DRAFT / DEC-015 SUPPORTING DOCUMENT
implementation_status: N/A
module: N/A (consumed by LQD-01, EXE-01, TRD-01, MKD-01, LED-01, WDR-01, DEP-01, REC-01, TRE-01)
control: Provider-neutral requirements for external execution counterparties under Model A / B
owner: Unassigned
effective_date: 2026-10-04
last_reviewed: 2026-10-04
supersedes: none
baseline_commit: 43f2f34
---

# AIX Provider Requirements — Liquidity Provider / OTC Counterparty

> **Provider-neutral. Selects, scores, approves and names no provider.** Approving a counterparty
> is a `WF-19` / LQD-01 activation-gate matter, including the notification requirement recorded in
> `DEC-012` clause 2 (¶7.5 seven days prior). AIX acts as **agent / back-to-back**; every client
> fill binds to a distinct external fill (Module Index §19 rule 5). Section references `§n` point
> to `STR-04`.

**Candidate context (not selection).** Kraken and Binance OTC are **candidates** named by the owner
(`STR-04` §5 HB-08). Neither is approved, contracted, selected, connected or production-permitted,
and **no capability of either is stated or implied** by this document.

## 1. How to use this document

Priority **MUST / SHOULD / INFO**; trigger **LPA** before live provider activation (LP
live-routing `ACTIVE`). Answers are recorded as LQD-01 LP/venue arrangement evidence (LQD-01 remains the LP/venue owner; STR-04 §53 D-2).

## 2. Requirements

### 2.1 Execution

| ID | Requirement | Priority | STR-04 / Decision |
|---|---|---|---|
| LPC-REQ-001 | **RFQ** (request-for-quote) with firm quotes, quote ids, expiry | MUST for OTC | §26; `WF-10` |
| LPC-REQ-002 | **Streaming prices** (indicative and/or executable) with market-data rights stated | SHOULD for Spot | `DEC-012` clause 4(B) |
| LPC-REQ-003 | Order **API** (market/limit as applicable), client-order-id idempotency, status query | MUST | `DEC-012` clause 1 |
| LPC-REQ-004 | Supported **assets/pairs**, contract identities, networks | MUST | AST-01 v1.8 §3.11 |
| LPC-REQ-005 | **Minimum/maximum sizes**, increments, **limits** | MUST | §32 |
| LPC-REQ-006 | **Partial fills**: reporting, aggregation, remaining-quantity semantics | MUST | §32; `DEC-012` clause 1 rule 8 |
| LPC-REQ-007 | **Failed trades / rejects**: deterministic status; **no ambiguous timeouts** (status query must resolve fill vs no-fill) | MUST | §33.1; §40 row 16 |
| LPC-REQ-008 | **Cancellation** semantics and races | MUST | §31 |
| LPC-REQ-009 | Execution evidence: price, quantity, fees, timestamps per fill | MUST | `DEC-012` clause 1 rule 7 |
| LPC-REQ-010 | Confirmation that the LP will not treat AIX client orders as AIX principal orders where the arrangement is agency, or a clear statement of the legal capacity in which AIX faces the LP | MUST (INFO) | Doc 00 §10.1 items 3–4 |

### 2.2 Settlement

| ID | Requirement | Priority | STR-04 / EV |
|---|---|---|---|
| LPC-REQ-020 | **Prefunding** requirements: whether required, amount, **whose funds** may be accepted (client-funded via settlement provider vs AIX corporate), where held, return terms | MUST | §7.5, §19; EV-19 |
| LPC-REQ-021 | **Credit terms**, if any, and to whom extended (never interpreted as AIX extending credit to clients) | INFO | §19.4; §26 |
| LPC-REQ-022 | **Settlement windows** (T+0/T+1), cut-offs, sequencing (who delivers first) | MUST | §26; EV-20 |
| LPC-REQ-023 | **Settlement accounts / SSIs** for each asset and rail; change control with authenticated notification | MUST | §15; §37.1 |
| LPC-REQ-024 | **Custody interaction**: ability to deliver to / receive from a third-party institutional custodian's client accounts with correlation ids | MUST | §25.1 |
| LPC-REQ-025 | **Direct-bank settlement**: ability to receive USD directly from a client settlement structure at a bank/settlement provider (not only from AIX corporate accounts) | SHOULD | §25.4 |
| LPC-REQ-026 | Settlement status reporting per leg, authenticated | MUST | §31 |
| LPC-REQ-027 | Handling of one-leg-settled scenarios, return of mis-delivered assets/cash | MUST | §33.3 |

### 2.3 Fees and conflicts

| ID | Requirement | Priority | STR-04 / Decision |
|---|---|---|---|
| LPC-REQ-030 | Full **fee** schedule; fee per fill reported | MUST | §20.5 |
| LPC-REQ-031 | Any **rebate / payment for order flow / inducement** disclosed in writing | MUST | §20.6; `DEC-012` clause 2 |
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
| LPC-REQ-053 | **Counterparty risk** information sufficient for LQD-01 exposure limits (credit standing, segregation of AIX/client prefunded assets at the LP, insolvency treatment) | MUST | §33.6 |
| LPC-REQ-054 | API security: authentication, IP allowlisting, key rotation, per-environment credentials, sandbox | MUST | §37 |

## 3. Outcomes

Per requirement: `SUPPORTED` / `NOT_SUPPORTED` / `UNKNOWN`, evidence, environment demonstrated.
Results determine which products (Spot/OTC), assets and settlement variants the counterparty may
serve once activated, the obligation sequencing recorded on each settlement, and the TRE-01
corporate exposure limits where AIX corporate prefunding is involved.
**No scoring or selection is performed in DEC-015.**

*STR-04C v0.1 — DRAFT. Provider-neutral. Approves nothing.*
