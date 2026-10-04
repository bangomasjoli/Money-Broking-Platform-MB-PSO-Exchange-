---
document_id: STR-04A
title: AIX Provider Requirements — Bank / PSP / Settlement Provider
version: v0.3
document_status: DRAFT / DEC-015 SUPPORTING DOCUMENT — ROUND-2 REMEDIATED / AWAITING ROUND-3 INDEPENDENT REVIEW
implementation_status: N/A
module: N/A (consumed by DEP-01, WDR-01, REC-01, LED-01, FEE-01, reservation requesters and the provider adapter; shared provider record, client-asset holding arrangement and provider / resource registry owner per STR-04 HD-DEC015-01)
control: Provider-neutral requirements for fiat banking, virtual-account and settlement providers
owner: Unassigned
effective_date: 2026-10-04
last_reviewed: 2026-10-04
supersedes: STR-04A v0.2 as the current draft (v0.1 and v0.2 retained unmodified)
baseline_commit: b9e8277
---

# AIX Provider Requirements — Bank / PSP / Settlement Provider

> **Provider-neutral. Selects, scores, approves and names no provider.** Candidate institutions
> are assessed against this document in a separate due-diligence workflow (`WF-19`). Nothing here
> states that any institution has any capability. Companion to `STR-04` v0.3 (DEC-015
> architecture); section references `§n` point to `STR-04` v0.3.

**Candidate context (not selection).** Maybank, CIMB and Bank Muamalat are **candidates** named by
the owner (`STR-04` §5 HB-08). None is selected, contracted, approved, integrated or assessed here,
and **no capability of any of them is stated or implied** by this document.

**v0.2 changes (Round-1 R02, R11, R16).** Added BNK-REQ-011…014 (client direct instruction
authority, legal orders, set-off, freezes), BNK-REQ-025…026 (per-VA debit limitation and debit
attribution), BNK-REQ-038…039 (hold enforceability, hold conversion), BNK-REQ-049 (uninstructed
debit events) and BNK-REQ-079 (data protection); tightened BNK-REQ-031/033/043; extended §3.

**v0.3 changes (Round-2 R2-F01, F02, F08, F15).** Added BNK-REQ-015 (client-specific vs
account-wide scope of legal orders), BNK-REQ-052…056 (fee-collection authority: fee debit, fee
sweep, source pool, timing, maximum amount, disclosure / consent basis), BNK-REQ-057…058 (immutable
provider event ids, redelivery semantics, raw event evidence), BNK-REQ-064 (balance evidence that
distinguishes "unavailable / stale" from "zero") and BNK-REQ-080 (wind-down servicing and
return-only / migration-only support — an exit must never trap client funds); tightened
BNK-REQ-034, -036, -077; extended §3.

## 1. How to use this document

- **Priority:** **MUST** — required for the rail to be used live for the stated scope;
  **SHOULD** — strongly preferred; absence requires a documented fallback (STR-04 names it);
  **INFO** — information AIX must obtain, regardless of answer.
- **Rail:** F1 provider-controlled client VA + direct settlement; F2 independent/tri-party
  settlement agent; F3 AIX safeguarded client-money account (STR-04 §10, §12).
- **Trigger:** LPA before live provider activation; LCF before live client fiat; PA before
  production activation of the consuming capability.
- Each answer is recorded as evidence on the shared provider record or the client-asset holding
  arrangement (STR-04 §36.4, HD-DEC015-01) with document references; an unanswered MUST is
  `UNKNOWN` / `UNVERIFIED` and fails closed for the operation that needs it (STR-04 §10.2, §35.4).
- **A technical capability is not a legal fact.** A hold API (BNK-REQ-031) does not prove that a
  hold is enforceable (BNK-REQ-038). Both are needed where STR-04 §10.3 requires a hold.

## 2. Requirements

### 2.1 Currency and legal structure

| ID | Requirement | Priority | Rail | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| BNK-REQ-001 | USD accounts and USD payments (domestic and cross-border as applicable) | MUST | All | LPA | §10.6 |
| BNK-REQ-002 | Multi-currency support roadmap (accounts, VAs, payments) | INFO | All | LPA | §10.6 |
| BNK-REQ-003 | Written description of the **legal account structure**: what the underlying account is, in whose name, under which designation (client money / trust / escrow / settlement / corporate) | MUST | All | LPA | §10.2; EV-01, EV-02 |
| BNK-REQ-004 | **Account holder** identity for each structure offered | MUST | All | LPA | EV-02 |
| BNK-REQ-005 | **Beneficial ownership** treatment of client funds (individual / collective / designated) and the bank's written acknowledgement of it | MUST | F1, F2, F3 | LCF | EV-03, EV-06 |
| BNK-REQ-006 | **Client-money treatment**: whether the bank acknowledges the funds as client money not available to set-off, lien or counterclaim against AIX | MUST | F1, F3 | LCF | EV-06, EV-07 |
| BNK-REQ-007 | **Segregation** of client funds from AIX corporate funds and from other bank customers' funds, at the level the structure provides; which accounts form one legally fungible pool (STR-04 §9.6.1) | MUST | All | LCF | §9.6, §17 |
| BNK-REQ-008 | **Withdrawal authority**: who may move funds out of the account/VA, under what controls; whether the client can withdraw independently of AIX | MUST | F1, F2 | LCF | §10.3; EV-04 |
| BNK-REQ-009 | **Settlement-instruction authority**: whether AIX may instruct payment to approved counterparties from the client structure, under what mandate | MUST (for direct settlement) | F1, F2 | LCF | EV-05 |
| BNK-REQ-010 | **Insolvency treatment** (bank insolvency; AIX insolvency) of funds in each structure, with legal opinion where available | MUST | All | LCF | EV-10 |
| **BNK-REQ-011** | **Client direct instruction authority**: whether the client (or any party other than AIX) can instruct debits **directly** at the bank — over its own VA only, or over the whole underlying account — and whether AIX is notified | MUST | F1, F2 | LCF | §10.2, §10.3, §23.1; EV-04, EV-28 |
| **BNK-REQ-012** | **Legal-order treatment**: whether garnishment, freezing or attachment orders against AIX, against one client, or against the account can reach client funds in the structure; scope (VA vs whole account); notice to AIX; priority relative to holds | MUST | All | LCF | §17.2, §40 row 44; EV-32 |
| **BNK-REQ-013** | **Set-off treatment**: confirmation that the bank has no set-off, lien or counterclaim over client funds for AIX's or any other party's liabilities — or the exact scope of any such right | MUST | All | LCF | §17.2, §40 row 45; EV-06, EV-32 |
| **BNK-REQ-014** | **Freeze treatment**: when the bank may block or freeze an account or VA, at what scope, with what notice, and how frozen funds are reported | MUST | All | LCF | §40 row 43; EV-32 |
| **BNK-REQ-015** | **Scope of legal restrictions**: whether an order, garnishment or freeze directed at **one client's** interest is applied only to that client's VA / attributable funds or to the underlying account as a whole; how the bank notifies AIX, with the VA / client attribution needed to record a client-specific restriction (STR-04 §16.8 fact 5) separately from an account-wide one (fact 4) | MUST | All | LCF | §16.8, §40 rows 44, 58; EV-32 |

### 2.2 Virtual accounts and attribution

| ID | Requirement | Priority | Rail | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| BNK-REQ-020 | Unique **virtual account** per client (or per client × currency) with provisioning, suspension and closure via API | SHOULD (MUST for F1) | F1 | LPA | §11 |
| BNK-REQ-021 | Fallback **unique payment reference** attribution where VAs are unavailable | MUST if no VAs | F1, F2 | LPA | §11 |
| BNK-REQ-022 | VA never re-assigned to another client | MUST | F1 | LPA | §11.4 |
| BNK-REQ-023 | Inbound remitter data (name, account, bank, reference) delivered with each receipt | MUST | All | LPA | §21 |
| BNK-REQ-024 | Handling of payments to closed/unknown VAs (reject, hold, return) described | MUST | F1 | LPA | §21.4 |
| **BNK-REQ-025** | **Per-VA debit limitation**: whether every debit against a VA is limited by the bank to **that VA's own credited balance**, and whether the bank reports per-VA balances. If not, a written statement that it is not | **MUST for F1 pooled structures** — without it the pool is `UNSUPPORTED` unless only AIX can instruct debits (`AIX_EXCLUSIVE_INSTRUCTION`, STR-04 §9.6.4) | F1 | LPA, LCF | §9.6.4; EV-28 |
| **BNK-REQ-026** | **Attribution of provider-originated debits** (fees, set-off, legal orders, corrections) to the VA / client concerned | MUST | All | LPA | §9.6.4, §23.1; EV-28 |

### 2.3 Balances, holds and events

| ID | Requirement | Priority | Rail | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| BNK-REQ-030 | **Balance API**: ledger and **available** balance per underlying account and per VA, suitable for movement-scoped reads within a configured freshness window | MUST | All | LPA | §16.3, §16.7 |
| BNK-REQ-031 | **Hold API**: place a hold on a client VA/account balance with AIX correlation id (`reservation_id`) | SHOULD (MUST where the client or any other party can debit without AIX — STR-04 §10.3) | F1, F2 | LPA | §18; EV-08 |
| BNK-REQ-032 | **Hold release / reduce** API | SHOULD (MUST with BNK-REQ-031) | F1, F2 | LPA | §18 |
| BNK-REQ-033 | Hold expiry semantics, **extension / renewal API**, and advance notification of expiry | MUST with BNK-REQ-031 | F1, F2 | LPA | §18.5 |
| BNK-REQ-034 | **Transaction feed**: every credit/debit with provider event id, provider object / transaction reference, value date, status | MUST | All | LPA | §21, §35.7 |
| BNK-REQ-035 | **Deposit confirmation** that is authenticated and final (or with stated finality semantics) | MUST | All | LPA | §21.3 |
| BNK-REQ-036 | **Webhooks** with signatures; and **polling** for gap-fill; ability to re-fetch a past event by id | SHOULD webhooks; MUST polling or file | All | LPA | §35.7, §37.1 |
| BNK-REQ-037 | Event ordering/sequence numbers or equivalent | SHOULD | All | LPA | §34.3 |
| **BNK-REQ-038** | **Hold enforceability and priority** — written legal position on whether a hold binds the account holder (including the client acting under its own mandate) and how it ranks against bank set-off, legal orders, account freezes, recalls and provider corrections | **MUST wherever a hold is relied on** (STR-04 §10.3); until evidenced, a hold is `TECHNICAL_ONLY` and treated as no hold | F1, F2 | LPA, LCF | §10.2, §10.3; EV-32 |
| **BNK-REQ-039** | **Hold conversion to payment**: convert a bound hold into a payment to an approved counterparty or own-name destination without an intermediate release | SHOULD (MUST for pools where the client has direct instruction authority) | F1, F2 | LPA | §18, §23, §25.4 |

### 2.4 Payments and settlement

| ID | Requirement | Priority | Rail | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| BNK-REQ-040 | **Direct counterparty settlement**: pay an approved LP/counterparty SSI directly from the client structure on AIX instruction | SHOULD | F1, F2 | LPA | §25.4; EV-09 |
| BNK-REQ-041 | **Wire / SWIFT** capability, message types, beneficiary validation | MUST (one rail) | All | LPA | §23 |
| BNK-REQ-042 | **Cut-off times**, value dating, holiday calendars | MUST | All | LPA | §26 |
| BNK-REQ-043 | **Finality** of incoming and outgoing payments; **recall windows** and recall grounds | MUST | All | LPA, LCF | §17.5, §31.4; EV-36 |
| BNK-REQ-044 | **Returns** and **return-to-source** process and API | MUST | All | LPA | §21.4 |
| BNK-REQ-045 | **Reversal / recall** events delivered as authenticated events | MUST | All | LPA | §40 row 8 |
| BNK-REQ-046 | Idempotent payment instruction submission (AIX idempotency key honoured) | SHOULD | All | LPA | §37.1 |
| BNK-REQ-047 | **Provider-side maker-checker** for payment release, configurable thresholds | SHOULD | All | LPA | §37.1 |
| BNK-REQ-048 | Payment **screening responsibilities**: what the bank screens (sanctions, fraud) vs what AIX must screen | MUST (INFO) | All | LPA | §21.2 |
| **BNK-REQ-049** | **Uninstructed debit events**: every debit AIX did not instruct (client direct, fee, set-off, legal order, correction) delivered as an authenticated event with a reason code and VA attribution | MUST | All | LPA | §23.1, §35.7; EV-28 |
| **BNK-REQ-057** | **Immutable provider event ids and redelivery semantics**: one immutable id per business event, **unchanged across redeliveries**; documented redelivery behaviour (which headers / timestamps / signatures change per attempt); provider sequence or version where offered; never the same id for different economic content; advance notice of event-schema / API version changes | MUST | All | LPA | §35.7; §40 rows 6, 57 |
| **BNK-REQ-058** | **Raw event evidence**: signed payloads verifiable after receipt, including historical verification-key availability across key rotation, so AIX can re-verify retained raw evidence; statement of any personal data in payloads | MUST | All | LPA | §34.5, §35.7; EV-27 |

### 2.5 Fees

| ID | Requirement | Priority | Rail | Trigger | STR-04 |
|---|---|---|---|---|---|
| BNK-REQ-050 | Complete fee schedule; whether **bank** fees are debited from client structures or billed to AIX (billing to AIX preferred — STR-04 §20.9) | MUST | All | LPA | §20.6, §20.9 |
| BNK-REQ-051 | Itemised fee events in the transaction feed | SHOULD | All | LPA | §34 R8 |
| **BNK-REQ-052** | **AIX fee-debit authority**: whether AIX may instruct a debit of an earned, disclosed **AIX** fee from a client structure, under which mandate, and the bank's written confirmation | MUST where AIX collects fees from the pool (`COLLECT_DISCLOSED_FEE`) | F1, F2 | LCF | §10.2, §20.10; EV-05 |
| **BNK-REQ-053** | **Fee-sweep authority and source scope**: whether AIX may instruct transfer of an accumulated fee payable from a client pool to AIX's corporate account; which **source accounts / pools / VAs** the authority covers | MUST with BNK-REQ-052 | F1, F2, F3 | LCF | §16.4 X2, §20.10; EV-05 |
| **BNK-REQ-054** | **Timing**: when fee collection may be instructed (per event, daily, monthly) and any bank-side restrictions | MUST with BNK-REQ-052 | F1, F2, F3 | LCF | §20.4, §20.10 |
| **BNK-REQ-055** | **Maximum authorised amount**: per-item and per-period limits on AIX-instructed fee debits, and whether the bank enforces them | MUST with BNK-REQ-052 | F1, F2, F3 | LCF | §20.10 |
| **BNK-REQ-056** | **Client disclosure / consent basis** the bank requires before honouring fee instructions (client mandate, agreement clause, standing authority) | MUST with BNK-REQ-052 | F1, F2, F3 | LCF | §20.10; EV-05 |

### 2.6 Statements and reconciliation

| ID | Requirement | Priority | Rail | Trigger | STR-04 |
|---|---|---|---|---|---|
| BNK-REQ-060 | Daily **statements** per underlying account and per VA (MT940/camt.053 or equivalent API) | MUST | All | LPA | §34 R1 |
| BNK-REQ-061 | Intraday statements / balance reports | SHOULD | All | LPA | §34 |
| BNK-REQ-062 | Statement authenticity (signed/authenticated channel) and completeness markers | MUST | All | LPA | §34.3 |
| BNK-REQ-063 | Corrections delivered as linked correction records | SHOULD | All | LPA | §34.3 |
| **BNK-REQ-064** | **Balance evidence status**: balance and statement responses distinguish **unavailable / stale / partial** data from a genuine zero or reduced balance, with as-of timestamps, so an outage is never read as a loss (STR-04 §16.8) | MUST | All | LPA | §16.8, §17.2 |

### 2.7 Service, resilience, security and data

| ID | Requirement | Priority | Rail | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| BNK-REQ-070 | **API SLA** (availability, latency), sandbox parity with production | MUST | All | LPA | §46.3 |
| BNK-REQ-071 | **Outage handling**: status page, incident notification, manual fallback channel | MUST | All | LPA | §40 rows 1–2 |
| BNK-REQ-072 | **BCP / DR** commitments and testing evidence | MUST | All | LPA | — |
| BNK-REQ-073 | **Security**: API authentication, mTLS option, IP allowlisting/private connectivity, webhook signing with key rotation, replay protection | MUST | All | LPA | §35.7, §37.1 |
| BNK-REQ-074 | Credential separation per environment and per function (read / instruct / VA lifecycle) | MUST | All | LPA | §35.7, §37.1 |
| BNK-REQ-075 | **Audit rights** for AIX and, where required, the regulator | MUST | All | LPA | — |
| BNK-REQ-076 | **Data residency** of client data | INFO (MUST where applicable rules require it) | All | LPA | EV-27 |
| BNK-REQ-077 | **Exit / migration plan**: transfer of client structures and funds to another provider with full statements | MUST | All | LCF | EV-15, EV-25 |
| BNK-REQ-078 | Regulatory status of the provider and any notification AIX must make before use | MUST | All | LPA | EV-24 |
| **BNK-REQ-079** | **Data protection and privacy** of client data held or processed by the provider (purpose limits, breach notification, sub-processors) | MUST | All | LPA | EV-27 |
| **BNK-REQ-080** | **Wind-down servicing**: after AIX stops new business with the provider, after a termination notice by either side, or while the provider is suspended or restricted, the provider continues to **service existing client funds** — payments to clients' own-name destinations, return to clients, migration to a successor provider, statements and event delivery — for a defined period and under a **return-only / migration-only** mode, **not conditional on continued approval for new business**; behaviour on provider insolvency described | MUST | All | LPA (evidence before activation), LCF | §10.2.1, §13.6; EV-15, EV-25 |

## 3. Outcomes

For each candidate, the assessment records per requirement: `SUPPORTED` / `NOT_SUPPORTED` /
`UNKNOWN`, evidence reference, environment demonstrated (mock / sandbox / production). The result
determines (a) which rail(s) the provider can serve; (b) the resource-pool definition and
**allocation mode** (`PROVIDER_PER_VA_ENFORCED` / `AIX_EXCLUSIVE_INSTRUCTION` / `UNSUPPORTED` —
STR-04 §9.6.4); (c) **provider hold authority** (`NONE` / `TECHNICAL_ONLY` / `ENFORCEABLE`) and so
whether a pool's resources can fund trading at all (STR-04 §10.3); (d) the reservation mode
(bound hold / internal-only fallback / not available — STR-04 §18.4); (e) the cash-leg variant
(direct / two-step / conditional — STR-04 §25.4); (f) whether AIX may collect disclosed fees from
the pool (`COLLECT_DISCLOSED_FEE`, BNK-REQ-052…056) or must use the fallback route (STR-04 §20.10);
(g) whether the provider's event feed supports the STR-04 §35.7 dedupe hierarchy (BNK-REQ-057);
(h) the wind-down / exit servicing available (BNK-REQ-080); and (i) which EV items remain open.
**No scoring or selection is performed in DEC-015.**

*STR-04A v0.3 — DRAFT / DEC-015 SUPPORTING DOCUMENT. Provider-neutral. Approves nothing. No
candidate is claimed to support any requirement. v0.1 and v0.2 retained unmodified.*
