---
document_id: STR-04B
title: AIX Provider Requirements — Institutional Digital-Asset Custodian
version: v0.2
document_status: DRAFT / DEC-015 SUPPORTING DOCUMENT — ROUND-1 REMEDIATED / AWAITING ROUND-2 INDEPENDENT REVIEW
implementation_status: N/A
module: N/A (consumed by WLT-01, AST-01, DEP-01, WDR-01, REC-01, LED-01; shared provider record and custody arrangement owner per STR-04 HD-DEC015-01)
control: Provider-neutral requirements for third-party institutional custody of client digital assets
owner: Unassigned
effective_date: 2026-10-04
last_reviewed: 2026-10-04
supersedes: STR-04B v0.1 as the current draft (v0.1 retained unmodified)
baseline_commit: f9538b0
---

# AIX Provider Requirements — Institutional Digital-Asset Custodian

> **Provider-neutral. Selects, scores, approves and names no provider.** A vendor of custody
> technology or wallet infrastructure is assessed under §2.1 and §2.3A to establish **who the legal
> custodian is and who controls the assets**; supplying technology does not make a vendor a legal
> custodian, and AIX lacking a complete private key does not make an arrangement non-custodial
> (STR-04 v0.2 §13.2, §13.4). Section references `§n` point to `STR-04` v0.2.

**Candidate context (not selection).** Fireblocks is a **candidate** for wallet infrastructure / MPC /
custody orchestration / policy (`STR-04` §5 HB-07). It is **not** assumed to be a legal custodian;
any arrangement involving it is classified under §2.1, §2.3A and `STR-04` §13.2/§13.4. No
capability of any candidate is stated or implied.

**v0.2 changes (Round-1 R04, R13, R16).** Added §2.3A custody-control evidence
(`CUS-REQ-070`…`CUS-REQ-077`), fee schedule and transparency (`CUS-REQ-066`), data protection and
privacy (`CUS-REQ-067`) and data residency (`CUS-REQ-068`); reworded `CUS-REQ-002`, `-020`, `-022`,
`-023`, `-025` so that no requirement asks for an AIX-alone control power; extended §3.

## 1. How to use this document

Priority **MUST / SHOULD / INFO** and triggers **LPA / LCA / PA** as in `STR-04A` v0.2 §1 (LCA =
before live client digital-asset transfer). Custody models: **C1** client subaccount / identifiable
entitlement (preferred); **C2** omnibus segregated pool with AIX client sub-ledger (fallback)
(STR-04 §13–§14). **In either model, no AIX control indicator (STR-04 §13.4.3) may exist** unless
`EV-34` legal analysis concludes the arrangement remains third-party custody. An unanswered MUST
is `UNKNOWN` and fails closed.

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
| CUS-REQ-007 | **Asset return** process on termination or insolvency | MUST | All | LCA | EV-15 |
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
| CUS-REQ-026 | API credentials scoped per environment and function (verify / read / transfer request / address assignment); no client key material ever exposed to AIX | MUST | All | LPA | §35.7, §37.2 |

### 2.3A Custody control evidence (STR-04 §13.4)

Each item requires the custodian's **written** evidence. Any answer showing an AIX control
indicator makes the arrangement self-custody in substance (STR-04 §13.2 row 3) unless `EV-34`
legal analysis concludes otherwise.

| ID | Requirement | Priority | Model | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| **CUS-REQ-070** | Holder of every complete key, key share, MPC share / API co-signer and HSM administration right (K1–K4); confirmation that **AIX holds none** | MUST | All | LPA | §13.4; EV-34 |
| **CUS-REQ-071** | Holders of recovery material and recovery authority, and the controls on recovery destinations (K5, K6); confirmation that **AIX cannot recover client assets to an AIX-controlled destination** | MUST | All | LPA | §13.4; EV-34 |
| **CUS-REQ-072** | Who may create or change transfer policies, thresholds and quorums (K7); confirmation that **no policy change can result in AIX alone being able to move assets** | MUST | All | LPA | §13.4; EV-34 |
| **CUS-REQ-073** | Approval quorum: seats, holders and quorum rule (K9, K10); confirmation that **no AIX seat or combination of AIX seats can release a transfer without the custodian's independent approval** | MUST | All | LPA | §13.4; EV-34 |
| **CUS-REQ-074** | Emergency override / policy-bypass procedure and its holders (K11); any AIX role in it | MUST | All | LPA | §13.4; EV-34 |
| **CUS-REQ-075** | Whitelist and wallet administration holders (K12, K13); confirmation that **AIX has no unilateral whitelist or wallet-administration authority** | MUST | All | LPA | §13.4; EV-34 |
| **CUS-REQ-076** | Written statement whether **any party, or any combination including AIX, can reconstruct signing authority or move assets unilaterally** (K14, K15), and how that is prevented | MUST | All | LPA | §13.4; EV-34 |
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
| CUS-REQ-063 | **Custodian migration** support: in-kind transfer to a successor custodian with full records | MUST | All | LCA | EV-15, EV-25; HD-DEC015-02 |
| CUS-REQ-064 | Webhook authenticity, replay protection, IP allowlisting/private connectivity | MUST | All | LPA | §35.7, §37 |
| CUS-REQ-065 | Regulatory notification AIX must make before use | MUST | All | LPA | EV-24 |
| **CUS-REQ-066** | **Fee schedule and fee transparency**: complete schedule (custody, transfer, network-fee pass-through, address, onboarding, exit), whether fees are debited from client holdings or billed to AIX, and itemised fee events | MUST | All | LPA | §20.6, §20.9 |
| **CUS-REQ-067** | **Data protection and privacy** of client data held or processed by the custodian and any infrastructure vendor (purpose limits, breach notification, sub-processors) | MUST | All | LPA | EV-27 |
| **CUS-REQ-068** | **Data residency** of client data and key material locations | INFO (MUST where applicable rules require it) | All | LPA | EV-27 |

## 3. Outcomes

Per requirement: `SUPPORTED` / `NOT_SUPPORTED` / `UNKNOWN`, evidence, environment demonstrated.
Results determine: C1 vs C2 per instrument-network; whether **any AIX control indicator** exists
(§2.3A — if so, the arrangement is self-custody in substance and cannot be a live custody location
unless `EV-34` concludes otherwise); whether AST-01 `custody_support` may reference this custodian
as `THIRD_PARTY_CUSTODIAN` and therefore whether a custody location may go live under the STR-04
§13.5 consistency rule (FI-AST-1); the asset reservation mode; and the open EV items.
**No scoring or selection is performed in DEC-015.**

*STR-04B v0.2 — DRAFT. Provider-neutral. Approves nothing. v0.1 retained unmodified.*
