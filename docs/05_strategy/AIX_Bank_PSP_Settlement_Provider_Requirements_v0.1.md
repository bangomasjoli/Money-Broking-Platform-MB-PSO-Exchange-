---
document_id: STR-04A
title: AIX Provider Requirements — Bank / PSP / Settlement Provider
version: v0.1
document_status: DRAFT / DEC-015 SUPPORTING DOCUMENT
implementation_status: N/A
module: N/A (consumed by WLT-01, DEP-01, WDR-01, REC-01, LED-01; arrangement-record owner per STR-04 HD-DEC015-01)
control: Provider-neutral requirements for fiat banking, virtual-account and settlement providers
owner: Unassigned
effective_date: 2026-10-04
last_reviewed: 2026-10-04
supersedes: none
baseline_commit: 43f2f34
---

# AIX Provider Requirements — Bank / PSP / Settlement Provider

> **Provider-neutral. Selects, scores, approves and names no provider.** Candidate institutions
> are assessed against this document in a separate due-diligence workflow (`WF-19`). Nothing here
> states that any institution has any capability. Companion to `STR-04` (DEC-015 architecture);
> section references `§n` point to `STR-04`.

**Candidate context (not selection).** Maybank, CIMB and Bank Muamalat are **candidates** named by
the owner (`STR-04` §5 HB-08). None is selected, contracted, approved, integrated or assessed here,
and **no capability of any of them is stated or implied** by this document.

## 1. How to use this document

- **Priority:** **MUST** — required for the rail to be used live for the stated scope;
  **SHOULD** — strongly preferred; absence requires a documented fallback (STR-04 names it);
  **INFO** — information AIX must obtain, regardless of answer.
- **Rail:** F1 provider-controlled client VA + direct settlement; F2 independent/tri-party
  settlement agent; F3 AIX safeguarded client-money account (STR-04 §10, §12).
- **Trigger:** LPA before live provider activation; LCF before live client fiat; PA before
  production activation of the consuming capability.
- Each answer is recorded as provider-arrangement evidence (STR-04 §36, HD-DEC015-01) with document references; an
  unanswered MUST is `UNKNOWN` and fails closed for the operation that needs it (STR-04 §35.4).

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
| BNK-REQ-007 | **Segregation** of client funds from AIX corporate funds and from other bank customers' funds, at the level the structure provides | MUST | All | LCF | §17 |
| BNK-REQ-008 | **Withdrawal authority**: who may move funds out of the account/VA, under what controls; whether the client can withdraw independently of AIX | MUST | F1, F2 | LCF | §10.3; EV-04 |
| BNK-REQ-009 | **Settlement-instruction authority**: whether AIX may instruct payment to approved counterparties from the client structure, under what mandate | MUST (for direct settlement) | F1, F2 | LCF | EV-05 |
| BNK-REQ-010 | **Insolvency treatment** (bank insolvency; AIX insolvency) of funds in each structure, with legal opinion where available | MUST | All | LCF | EV-10 |

### 2.2 Virtual accounts and attribution

| ID | Requirement | Priority | Rail | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| BNK-REQ-020 | Unique **virtual account** per client (or per client × currency) with provisioning, suspension and closure via API | SHOULD (MUST for F1) | F1 | LPA | §11 |
| BNK-REQ-021 | Fallback **unique payment reference** attribution where VAs are unavailable | MUST if no VAs | F1, F2 | LPA | §11 |
| BNK-REQ-022 | VA never re-assigned to another client | MUST | F1 | LPA | §11.4 |
| BNK-REQ-023 | Inbound remitter data (name, account, bank, reference) delivered with each receipt | MUST | All | LPA | §21 |
| BNK-REQ-024 | Handling of payments to closed/unknown VAs (reject, hold, return) described | MUST | F1 | LPA | §21.4 |

### 2.3 Balances, reservations and events

| ID | Requirement | Priority | Rail | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| BNK-REQ-030 | **Balance API**: ledger and **available** balance per underlying account and per VA | MUST | All | LPA | §16.3 |
| BNK-REQ-031 | **Reservation / hold API**: place a hold on a client VA/account balance with AIX correlation id | SHOULD (MUST where client withdrawal authority is independent or joint) | F1, F2 | LPA | §18; EV-08 |
| BNK-REQ-032 | **Reservation release / reduce / convert-to-payment** API | SHOULD (MUST with BNK-REQ-031) | F1, F2 | LPA | §18 |
| BNK-REQ-033 | Hold expiry semantics and notification | MUST with BNK-REQ-031 | F1, F2 | LPA | §18.3 |
| BNK-REQ-034 | **Transaction feed**: every credit/debit with provider event id, value date, status | MUST | All | LPA | §21 |
| BNK-REQ-035 | **Deposit confirmation** that is authenticated and final (or with stated finality semantics) | MUST | All | LPA | §21.3 |
| BNK-REQ-036 | **Webhooks** with signatures; and **polling** for gap-fill | SHOULD webhooks; MUST polling or file | All | LPA | §37.1 |
| BNK-REQ-037 | Event ordering/sequence numbers or equivalent | SHOULD | All | LPA | §34.3 |

### 2.4 Payments and settlement

| ID | Requirement | Priority | Rail | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| BNK-REQ-040 | **Direct counterparty settlement**: pay an approved LP/counterparty SSI directly from the client structure on AIX instruction | SHOULD | F1, F2 | LPA | §25.4; EV-09 |
| BNK-REQ-041 | **Wire / SWIFT** capability, message types, beneficiary validation | MUST (one rail) | All | LPA | §23 |
| BNK-REQ-042 | **Cut-off times**, value dating, holiday calendars | MUST | All | LPA | §26 |
| BNK-REQ-043 | **Finality** of incoming and outgoing payments; recall windows | MUST | All | LPA | §33.4 |
| BNK-REQ-044 | **Returns** and **return-to-source** process and API | MUST | All | LPA | §21.4 |
| BNK-REQ-045 | **Reversal / recall** events delivered as authenticated events | MUST | All | LPA | §40 row 8 |
| BNK-REQ-046 | Idempotent payment instruction submission (AIX idempotency key honoured) | SHOULD | All | LPA | §37.1 |
| BNK-REQ-047 | **Provider-side maker-checker** for payment release, configurable thresholds | SHOULD | All | LPA | §37.1 |
| BNK-REQ-048 | Payment **screening responsibilities**: what the bank screens (sanctions, fraud) vs what AIX must screen | MUST (INFO) | All | LPA | §21.2 |

### 2.5 Fees

| ID | Requirement | Priority | Rail | Trigger | STR-04 |
|---|---|---|---|---|---|
| BNK-REQ-050 | Complete fee schedule; whether fees are debited from client structures or billed to AIX | MUST | All | LPA | §20.5, §20.8 |
| BNK-REQ-051 | Itemised fee events in the transaction feed | SHOULD | All | LPA | §34 R8 |

### 2.6 Statements and reconciliation

| ID | Requirement | Priority | Rail | Trigger | STR-04 |
|---|---|---|---|---|---|
| BNK-REQ-060 | Daily **statements** per underlying account and per VA (MT940/camt.053 or equivalent API) | MUST | All | LPA | §34 R1 |
| BNK-REQ-061 | Intraday statements / balance reports | SHOULD | All | LPA | §34 |
| BNK-REQ-062 | Statement authenticity (signed/authenticated channel) and completeness markers | MUST | All | LPA | §34.3 |
| BNK-REQ-063 | Corrections delivered as linked correction records | SHOULD | All | LPA | §34.3 |

### 2.7 Service, resilience and security

| ID | Requirement | Priority | Rail | Trigger | STR-04 |
|---|---|---|---|---|---|
| BNK-REQ-070 | **API SLA** (availability, latency), sandbox parity with production | MUST | All | LPA | §46.3 |
| BNK-REQ-071 | **Outage handling**: status page, incident notification, manual fallback channel | MUST | All | LPA | §40 rows 1–2 |
| BNK-REQ-072 | **BCP / DR** commitments and testing evidence | MUST | All | LPA | — |
| BNK-REQ-073 | **Security**: API authentication, mTLS option, IP allowlisting/private connectivity, webhook signing with key rotation, replay protection | MUST | All | LPA | §37.1 |
| BNK-REQ-074 | Credential separation per environment and per function (read vs instruct) | MUST | All | LPA | §37.1 |
| BNK-REQ-075 | **Audit rights** for AIX and, where required, the regulator | MUST | All | LPA | — |
| BNK-REQ-076 | **Data residency** of client data | INFO | All | LPA | EV-27 |
| BNK-REQ-077 | **Exit / migration plan**: transfer of client structures and funds to another provider with full statements | MUST | All | LCF | EV-25 |
| BNK-REQ-078 | Regulatory status of the provider and any notification AIX must make before use | MUST | All | LPA | EV-24 |

## 3. Outcomes

For each candidate, the assessment records per requirement: `SUPPORTED` / `NOT_SUPPORTED` /
`UNKNOWN`, evidence reference, environment demonstrated (mock / sandbox / production). The result
determines (a) which rail(s) the provider can serve, (b) the reservation mode (external / fallback
/ not available — STR-04 §18.4), (c) the cash-leg variant (direct / two-step — STR-04 §25.4), and
(d) which EV items remain open. **No scoring or selection is performed in DEC-015.**

*STR-04A v0.1 — DRAFT. Provider-neutral. Approves nothing.*
