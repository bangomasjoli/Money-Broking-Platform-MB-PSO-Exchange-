---
document_id: STR-04B
title: AIX Provider Requirements — Institutional Digital-Asset Custodian
version: v0.4
document_status: DRAFT / DEC-015 SUPPORTING DOCUMENT — ROUND-3 REMEDIATED / AWAITING ROUND-4 INDEPENDENT ACCEPTANCE-GATE REVIEW
implementation_status: N/A
module: N/A (consumed by WLT-01, AST-01, DEP-01, WDR-01, REC-01, LED-01; shared provider record and custody arrangement owner per STR-04 HD-DEC015-01)
control: Provider-neutral requirements for third-party institutional custody of client digital assets
owner: Unassigned
effective_date: 2026-10-05
last_reviewed: 2026-10-05
supersedes: STR-04B v0.3 as the current draft (v0.1, v0.2 and v0.3 retained unmodified)
baseline_commit: 11b30d7
---

# AIX Provider Requirements — Institutional Digital-Asset Custodian

> **Provider-neutral. Selects, scores, approves and names no provider.** A vendor of custody
> technology or wallet infrastructure is assessed under §2.1 and §2.3A to establish **who the legal
> custodian is and who holds each control facet**; supplying technology does not make a vendor a
> legal custodian, and AIX lacking a complete private key does not by itself make an arrangement
> non-custodial (STR-04 v0.4 §13.2, §13.4). **This document draws no legal conclusion from any
> control fact**: legal / contractual classification is `EV-34`. Section references `§n` point to
> `STR-04` v0.4.

**Candidate context (not selection).** Fireblocks is a **candidate** for wallet infrastructure / MPC /
custody orchestration / policy (`STR-04` §5 HB-07). It is **not** assumed to be a legal custodian;
any arrangement involving it is classified under §2.1, §2.3A and `STR-04` §13.2/§13.4. No
capability of any candidate is stated or implied.

**v0.2 changes (Round-1 R04, R13, R16).** Added §2.3A custody-control evidence
(`CUS-REQ-070`…`CUS-REQ-077`), fee schedule and transparency (`CUS-REQ-066`), data protection and
privacy (`CUS-REQ-067`) and data residency (`CUS-REQ-068`); reworded `CUS-REQ-002`, `-020`, `-022`,
`-023`, `-025` so that no requirement asks for an AIX-alone control power; extended §3.

**v0.3 changes (Round-2 R2-F01, R2-F03, R2-F08).** §2.3A rewritten: each item asks the custodian to
**disclose, document contractually, evidence technically and submit for legal assessment** every AIX
participation or custody control indicator, instead of requiring that "AIX holds none" — an
`EV-34`-assessed arrangement can therefore satisfy it, while every **AIX-alone** power (STR-04
§13.4.2) remains prohibited (`CUS-REQ-071`, `-072`, `-073`, `-075`, `-076`). Added §2.8 exit,
wind-down and migration (`CUS-REQ-080`…`CUS-REQ-084`): servicing existing assets is **not**
conditional on the custodian remaining approved for new business. Added `CUS-REQ-085` (immutable
event ids and raw evidence). Tightened `CUS-REQ-063`, `-066`; extended §3.

**v0.4 changes (Round-3 R3-F01, F02, F05, F08, F09, F11).** `CUS-REQ-026` aligned with the
control-facet model (AIX unilateral signing secret / control prohibited unconditionally; disclosed
non-controlling participation only where documented, technically evidenced and cleared by `EV-34`).
Added `CUS-REQ-086` (event-identity profile), `CUS-REQ-087` (transfer-request submission idempotency /
non-idempotent correlation), `CUS-REQ-088` (per-slice migration evidence), `CUS-REQ-089` (distressed
exit capability, separate from new-business eligibility) and `CUS-REQ-090` (stranded-asset and
recovery evidence; operational termination does not extinguish client claims). Tightened
`CUS-REQ-007`, `-080`, `-083`, `-085`; extended §3.

## 1. How to use this document

Priority **MUST / SHOULD / INFO** and triggers **LPA / LCA / PA** as in `STR-04A` v0.4 §1 (LCA =
before live client digital-asset transfer). Custody models: **C1** client subaccount / identifiable
entitlement (preferred); **C2** omnibus segregated pool with AIX client sub-ledger (fallback)
(STR-04 §13–§14). **In either model:** (i) AIX must not be able, by itself, to reconstruct signing
authority, move client assets, recover them to an AIX-controlled destination, bypass the
custodian's controls or re-policy so that AIX alone can move assets (STR-04 §13.4.2) —
**unconditional**; (ii) every AIX custody control indicator (STR-04 §13.4.3) must be disclosed,
contractually documented, technically evidenced and legally assessed (`EV-34`); until assessed the
arrangement is `CONTROL_ASSESSMENT_REQUIRED` and cannot back a live custody location. An unanswered
MUST is `UNKNOWN` and fails closed.

## 2. Requirements

### 2.1 Legal role and segregation

| ID | Requirement | Priority | Model | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| CUS-REQ-001 | Identity of the **legal custodian** (holder of record) and its regulatory status/licence | MUST | All | LPA | §13.2; EV-11 |
| CUS-REQ-002 | Whether any technology/wallet-infrastructure vendor is involved, and its role; the holder of **each** control facet K1–K17 (STR-04 §13.4.1), evidenced under §2.3A | MUST | All | LPA | §13.2, §13.4; EV-34 |
| CUS-REQ-003 | **Asset segregation**: client assets segregated from custodian's and AIX's own assets | MUST | All | LCA | §13.1 |
| CUS-REQ-004 | **Client subaccounts** (per AIX client or per AIX subaccount) in the custodian's books | SHOULD | C1 | LPA | EV-12 |
| CUS-REQ-005 | **Omnibus** support: segregated client pool; custodian books identify the pool as client assets; AIX sub-ledger is the client attribution | MUST if C2 | C2 | LCA | EV-13 |
| CUS-REQ-006 | **Insolvency treatment** of client assets (custodian insolvency; AIX insolvency), with legal opinion where available | MUST | All | LCA | EV-14 |
| CUS-REQ-007 | **Asset return** process on termination or insolvency (detail: CUS-REQ-083, -089, -090) | MUST | All | LCA | EV-15 |
| CUS-REQ-008 | **Insurance**: scope, limits, exclusions (hot/warm/cold) | MUST (INFO on scope) | All | LCA | EV-16 |

### 2.2 Wallet and address model

| ID | Requirement | Priority | Model | Trigger | STR-04 |
|---|---|---|---|---|---|
| CUS-REQ-010 | Wallet/vault model described (per-client vaults, pooled vaults, hot/warm/cold tiers) | MUST | All | LPA | §15 |
| CUS-REQ-011 | **Unique deposit addresses** per client (or per subaccount) per network | SHOULD | C1 | LPA | §15 |
| CUS-REQ-012 | **Address assignment** API and retirement semantics; addresses never re-assigned to another client | MUST | All | LPA | §15 |
| CUS-REQ-013 | Memo/tag attribution where shared addresses are used | MUST if shared | All | LPA | §14 |
| CUS-REQ-014 | **Supported assets and networks** list with contract identities; change notification | MUST | All | LPA | AST-01 v1.8 §3.11; §13.5 |

### 2.3 Movement controls and keys

| ID | Requirement | Priority | Model | Trigger | STR-04 |
|---|---|---|---|---|---|
| CUS-REQ-020 | **Policy engine**: per-asset/amount/destination/velocity rules, changed only through a **custodian-controlled** change process in which AIX may request but **cannot alone** create or change a policy (K7) | MUST | All | LPA | §13.3, §13.4, §37.2 |
| CUS-REQ-021 | **Withdrawal controls** with an approval quorum (**maker-checker**) at the custodian, independent of AIX | MUST | All | LPA | §37.2 |
| CUS-REQ-022 | **Destination whitelisting** synchronisable from AIX (WLT-01) decisions, applied through custodian-side approval; **no unilateral AIX whitelist authority** (K12) | MUST | All | LPA | §13.3, §13.4 |
| CUS-REQ-023 | **Key model** (MPC / HSM / multisig), key ceremonies and recovery, with the holder of every key, key share and recovery element evidenced under §2.3A | MUST | All | LPA | §13.4, §37.2 |
| CUS-REQ-024 | **Signing status** visibility (requested, approved, signed, broadcast, confirmed, failed) | SHOULD | All | LPA | §24 |
| CUS-REQ-025 | **Asset holds / policy locks** to reserve client assets against outflow, with expiry and extension semantics | SHOULD | All | LPA | §18.5, §18.7 |
| CUS-REQ-026 | API credentials scoped per environment and function (verify / read / transfer request / address assignment). **Unconditional:** no signing secret, key, key share, recovery material or credential that gives AIX — alone or in combination with other AIX-held material — the ability to sign, reconstruct signing authority, move client assets or recover them to an AIX-controlled destination is held by or exposed to AIX (STR-04 §13.4.2). Any other AIX participation that involves key material (e.g., a **disclosed, non-controlling** MPC share or co-signer seat that cannot sign or release alone) is permitted **only** where disclosed under §2.3A, contractually documented, technically evidenced and **cleared by `EV-34`**; until then the arrangement is `CONTROL_ASSESSMENT_REQUIRED` | MUST | All | LPA | §13.4, §35.7, §37.2; EV-34 |

### 2.3A Custody control evidence (STR-04 §13.4)

Each item requires the custodian's **written** evidence. The requirement is satisfied by complete,
evidenced disclosure — **not** by any particular answer — **except** where marked
**unconditional**, which reflects the STR-04 §13.4.2 prohibition of AIX-alone powers. Any disclosed
AIX participation or custody control indicator is a **fact**: it is recorded on the arrangement,
documented in the contract, evidenced technically and submitted for legal assessment (`EV-34`);
until assessed, the arrangement is `CONTROL_ASSESSMENT_REQUIRED` (STR-04 §13.2) and cannot back a
live custody location. **No answer is treated as a legal conclusion that AIX is, or is not, the
custodian.** Absence of any AIX indicator, or an `EV-34` assessment that clears the disclosed
participation, satisfies the item.

| ID | Requirement | Priority | Model | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| **CUS-REQ-070** | Holder of every complete key, key share, MPC share / API co-signer and HSM administration right (K1–K4); **every AIX holding or participation disclosed**, with its scope, contractual terms and technical evidence of what it can and cannot do, for `EV-34` assessment | MUST | All | LPA | §13.4.3; EV-34 |
| **CUS-REQ-071** | Holders of recovery material and recovery authority, and the controls on recovery destinations (K5, K6); every AIX role disclosed and evidenced. **Unconditional:** AIX cannot, by itself, recover client assets to an AIX-controlled destination | MUST | All | LPA | §13.4.2, §13.4.3; EV-34 |
| **CUS-REQ-072** | Who may create or change transfer policies, thresholds and quorums (K7); every AIX role disclosed and evidenced. **Unconditional:** no policy change can result in AIX alone being able to move assets | MUST | All | LPA | §13.4.2, §13.4.3; EV-34 |
| **CUS-REQ-073** | Approval quorum: seats, holders and quorum rule (K9, K10); every AIX seat disclosed. **Unconditional:** no AIX seat or combination of AIX seats can release a transfer without the custodian's independent approval | MUST | All | LPA | §13.4.2, §13.4.3; EV-34 |
| **CUS-REQ-074** | Emergency override / policy-bypass procedure and its holders (K11); any AIX role disclosed, contractually limited and evidenced, for `EV-34` assessment | MUST | All | LPA | §13.4.3; EV-34 |
| **CUS-REQ-075** | Whitelist and wallet administration holders (K12, K13); every AIX role disclosed and evidenced. **Unconditional:** AIX has no **unilateral** whitelist or wallet-administration authority | MUST | All | LPA | §13.4.2, §13.4.3; EV-34 |
| **CUS-REQ-076** | Written statement whether **any party, or any combination including AIX, can reconstruct signing authority or move assets unilaterally** (K14, K15), and how that is prevented. **Unconditional:** AIX alone cannot | MUST | All | LPA | §13.4.2; EV-34 |
| **CUS-REQ-077** | Description of **AIX's participation** (transaction initiation, approval requests, any MPC or quorum workflow) and of **which actions the custodian performs independently** of AIX (K8, K9, K17) | MUST | All | LPA, LCA | §13.4.4; EV-34 |

### 2.4 Compliance integration

| ID | Requirement | Priority | Model | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| CUS-REQ-030 | **Screening integration** points (inbound source, outbound destination); division of responsibility with AIX AML-01 | MUST | All | LCA | §22 |
| CUS-REQ-031 | **Travel Rule** integration points and supported protocols | MUST | All | LCA | EV-17 |
| CUS-REQ-032 | Quarantine handling for unsupported assets, wrong networks, dust | MUST | All | LPA | §22.3 |

### 2.5 Chain events and settlement

| ID | Requirement | Priority | Model | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| CUS-REQ-040 | **Confirmation/finality** policy per network; **chain reorganisation** and custodian-reversal handling and notification | MUST | All | LCA | §17.5, §22.2, §31.4; EV-18, EV-36 |
| CUS-REQ-041 | **Settlement transfer API**: deliver to / receive from approved LP SSIs with correlation ids | SHOULD | All | LPA | §25 |
| CUS-REQ-042 | Transfers between client subaccounts and LP settlement accounts recorded with client attribution | MUST | All | LCA | §25.1 |

### 2.6 Statements and reconciliation

| ID | Requirement | Priority | Model | Trigger | STR-04 |
|---|---|---|---|---|---|
| CUS-REQ-050 | **Balance API** per client subaccount / pool / address, suitable for movement-scoped reads | MUST | All | LPA | §16.7, §34 R2 |
| CUS-REQ-051 | **Statements** (daily) and transaction histories, authenticated, with completeness markers | MUST | All | LPA | §34 |
| CUS-REQ-052 | **Reconciliation** support: client-level (C1) or pool-level (C2) records sufficient for 3-way ledger ↔ custodian ↔ chain | MUST | All | LCA | §34 R4 |
| CUS-REQ-053 | Corrections delivered as linked records | SHOULD | All | LPA | §34.3 |

### 2.7 Service, resilience, fees and data

| ID | Requirement | Priority | Model | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| CUS-REQ-060 | **Incident notification** commitments (time to notify, content) | MUST | All | LPA | §40 |
| CUS-REQ-061 | **Business continuity** / DR, including key-recovery testing evidence | MUST | All | LPA | — |
| CUS-REQ-062 | **Audit rights** and independent control reports (e.g., SOC-type) | MUST | All | LPA | — |
| CUS-REQ-063 | **Custodian migration** support: in-kind transfer to a successor custodian with full records and per-client attribution (detail in §2.8) | MUST | All | LCA | §13.6; EV-15, EV-25; HD-DEC015-02 |
| CUS-REQ-064 | Webhook authenticity, replay protection, IP allowlisting/private connectivity | MUST | All | LPA | §35.7, §37 |
| CUS-REQ-065 | Regulatory notification AIX must make before use | MUST | All | LPA | EV-24 |
| **CUS-REQ-066** | **Fee schedule and fee transparency**: complete schedule (custody, transfer, network-fee pass-through, address, onboarding, exit), whether fees are debited from client holdings or billed to AIX, and itemised fee events; where AIX's own disclosed fees are to be collected from client holdings, the collection authority, source, timing, maximum and disclosure basis (as STR-04A BNK-REQ-052…056) | MUST | All | LPA | §20.6, §20.9, §20.10 |
| **CUS-REQ-067** | **Data protection and privacy** of client data held or processed by the custodian and any infrastructure vendor (purpose limits, breach notification, sub-processors) | MUST | All | LPA | EV-27 |
| **CUS-REQ-068** | **Data residency** of client data and key material locations | INFO (MUST where applicable rules require it) | All | LPA | EV-27 |

### 2.8 Exit, wind-down, return and migration (STR-04 §10.2.1, §13.5, §13.6)

**Servicing existing client assets is never conditional on the custodian remaining approved for
new business.** These items are evidenced **before** live activation so that the exit path exists
before it is needed.

| ID | Requirement | Priority | Model | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| **CUS-REQ-080** | **Wind-down servicing**: after AIX stops new placements with the custodian, after a termination notice by either side, or while the custodian is suspended, de-approved, restricted or under incident, the custodian continues to service existing client assets — client withdrawals to verified destinations, statements, event delivery, reconciliation support — for a defined period. **Operational or contractual termination does not extinguish client claims** to assets still held | MUST | All | LPA, LCA | §10.2.1, §10.2.3, §13.5 Rule B; EV-15 |
| **CUS-REQ-081** | **Return-only mode**: a documented mode in which the custodian returns each client's assets to that client (own-name verified destination or custodian-run return process), with per-client attribution, timelines and evidence | MUST | All | LPA, LCA | §13.6; EV-15 |
| **CUS-REQ-082** | **Migration-only mode**: in-kind transfer of client assets to a successor custodian location, per client, with correlation ids, reconciliation before and after, and no change to control facets that would give AIX unilateral control during migration | MUST | All | LPA, LCA | §13.6; EV-15, EV-25 |
| **CUS-REQ-083** | **Asset return after termination, suspension or insolvency**: legal and operational process, timelines, who instructs, treatment of assets in transit, and the evidence AIX receives — including per-client evidence for assets that **cannot** be returned (CUS-REQ-090) | MUST | All | LCA | §13.6–§13.8; EV-14, EV-15 |
| **CUS-REQ-084** | **Ongoing control evidence**: key-ceremony records, MPC / quorum configuration attestations and policy-administration change logs delivered periodically and on every change, so the K1–K17 record (§2.3A) stays current — including during wind-down | MUST | All | LPA, LCA | §13.4.5; EV-34 |
| **CUS-REQ-085** | **Event evidence**: immutable event ids unique per economic occurrence within a documented namespace (CUS-REQ-086) and unchanged across redeliveries, provider object references, documented redelivery semantics, verifiable signed payloads (historical verification keys available), schema-version change notice | MUST | All | LPA | §34.5, §35.7 |
| **CUS-REQ-086** | **Event-identity profile**: native-id scope and uniqueness (per economic occurrence, not per parent transfer / account), event classes that always carry an id, any warranted fallback discriminator (transfer leg id, chain tx hash + output / log index, statement sequence), and how two otherwise identical events are resolved; a missing required id is a contract / capability breach | MUST | All | LPA | §35.7 |
| **CUS-REQ-087** | **Transfer-request submission idempotency**: whether the custodian honours an AIX idempotency key for transfer requests (window, query by key); otherwise an AIX reference carried in every request and returned by status query and statements, authoritative non-execution evidence (rejection, cancellation, expiry of an unsigned request), and the duplicate-risk controls of the custodian's approval flow | MUST | All | LPA | §35.8.4; §40 rows 56, 70 |
| **CUS-REQ-088** | **Per-slice migration evidence**: for every exit / migration transfer, per client — authenticated source-debit evidence, in-transit status, destination-receipt evidence (including partial receipts), failure and return evidence, with correlation ids linking all of them | MUST | All | LPA, LCA | §13.8; EV-25 |
| **CUS-REQ-089** | **Distressed exit capability (separate from new-business eligibility)**: what the custodian can still do while suspended, de-approved, terminated, under incident, restriction, administration or insolvency — who may instruct returns or migration, whether a **withdrawal-only** mode exists, whether the custodian or an administrator runs returns to client-verified destinations itself, the legal conditions (moratorium, court / administrator consent) and the evidence produced | MUST | All | LPA, LCA | §10.2.2, §13.7; EV-14, EV-15 |
| **CUS-REQ-090** | **Stranded-asset and recovery evidence**: where assets cannot be moved, the last authenticated statement per client / subaccount, the claim process and its acknowledgement, per-client attribution in any administrator process, and evidence of each recovery distribution | MUST | All | LCA | §10.2.3; EV-14 |

## 3. Outcomes

Per requirement: `SUPPORTED` / `NOT_SUPPORTED` / `UNKNOWN`, evidence, environment demonstrated.
Results determine: C1 vs C2 per instrument-network; the arrangement's classification
(`THIRD_PARTY_ELIGIBLE`, `CONTROL_ASSESSMENT_REQUIRED` pending `EV-34`, or
`PROHIBITED_AIX_UNILATERAL_CONTROL` — STR-04 §13.2), with no legal conclusion drawn from any
control fact; whether AST-01 `custody_support` may reference this custodian as
`THIRD_PARTY_CUSTODIAN` and therefore whether a custody location may accept new placements under
STR-04 §13.5 Rule A (FI-AST-1); the exit, return and migration modes available (§2.8), including the
distressed exit capability, per-slice migration evidence and stranded-asset evidence
(`CUS-REQ-088`…`090`) that STR-04 §13.7–§13.8 depend on; the event-identity profile (`CUS-REQ-086`)
and the transfer-request submission profile (`CUS-REQ-087`; `UNVERIFIED` is not activatable); the
asset reservation mode; and the open EV items.
**No scoring or selection is performed in DEC-015.**

*STR-04B v0.4 — DRAFT / DEC-015 SUPPORTING DOCUMENT. Provider-neutral. Approves nothing. No
candidate is claimed to support any requirement. v0.1, v0.2 and v0.3 retained unmodified.*
