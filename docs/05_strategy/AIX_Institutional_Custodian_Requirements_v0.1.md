---
document_id: STR-04B
title: AIX Provider Requirements — Institutional Digital-Asset Custodian
version: v0.1
document_status: DRAFT / DEC-015 SUPPORTING DOCUMENT
implementation_status: N/A
module: N/A (consumed by WLT-01, AST-01, DEP-01, WDR-01, REC-01, LED-01; arrangement-record owner per STR-04 HD-DEC015-01)
control: Provider-neutral requirements for third-party institutional custody of client digital assets
owner: Unassigned
effective_date: 2026-10-04
last_reviewed: 2026-10-04
supersedes: none
baseline_commit: 43f2f34
---

# AIX Provider Requirements — Institutional Digital-Asset Custodian

> **Provider-neutral. Selects, scores, approves and names no provider.** A vendor of custody
> technology or wallet infrastructure is assessed under §2.1 to establish **who the legal
> custodian is**; supplying technology does not make a vendor a legal custodian (STR-04 §13.2).
> Section references `§n` point to `STR-04`.

**Candidate context (not selection).** Fireblocks is a **candidate** for wallet infrastructure / MPC /
custody orchestration / policy (`STR-04` §5 HB-07). It is **not** assumed to be a legal custodian;
any arrangement involving it is classified under §2.1 (CUS-REQ-001/002) and `STR-04` §13.2. No
capability of any candidate is stated or implied.

## 1. How to use this document

Priority **MUST / SHOULD / INFO** and triggers **LPA / LCA / PA** as in `STR-04A` (`AIX_Bank_PSP_Settlement_Provider_Requirements_v0.1.md`) §1 (LCA = before
live client digital-asset transfer). Custody models: **C1** client subaccount / identifiable
entitlement (preferred); **C2** omnibus segregated pool with AIX client sub-ledger (fallback)
(STR-04 §13–§14). AIX holds **no** client signing key in either model (Doc 00 §8.2).

## 2. Requirements

### 2.1 Legal role and segregation

| ID | Requirement | Priority | Model | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| CUS-REQ-001 | Identity of the **legal custodian** (holder of record) and its regulatory status/licence | MUST | All | LPA | §13.2; EV-11 |
| CUS-REQ-002 | Whether any technology/wallet-infrastructure vendor is involved, and its role; confirmation that AIX does not control client keys | MUST | All | LPA | §13.2 |
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
| CUS-REQ-014 | **Supported assets and networks** list with contract identities; change notification | MUST | All | LPA | AST-01 v1.8 §3.11 |

### 2.3 Movement controls and keys

| ID | Requirement | Priority | Model | Trigger | STR-04 |
|---|---|---|---|---|---|
| CUS-REQ-020 | **Policy engine**: per-asset/amount/destination/velocity rules configurable by AIX | MUST | All | LPA | §13.3, §37.2 |
| CUS-REQ-021 | **Withdrawal controls** with approval quorum (**maker-checker**) at the custodian | MUST | All | LPA | §37.2 |
| CUS-REQ-022 | **Destination whitelisting** synchronisable from AIX decisions | MUST | All | LPA | §13.3 |
| CUS-REQ-023 | **Key model** (MPC / HSM / multisig), key-share holders, key ceremonies, recovery | MUST | All | LPA | §37.2 |
| CUS-REQ-024 | **Signing status** visibility (requested, approved, signed, broadcast, confirmed, failed) | SHOULD | All | LPA | §24 |
| CUS-REQ-025 | **Asset holds / policy locks** to reserve client assets against outflow | SHOULD | All | LPA | §18.5 |
| CUS-REQ-026 | API credentials scoped per environment and function; no client key material ever exposed to AIX | MUST | All | LPA | §37.2 |

### 2.4 Compliance integration

| ID | Requirement | Priority | Model | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| CUS-REQ-030 | **Screening integration** points (inbound source, outbound destination); division of responsibility with AIX AML-01 | MUST | All | LCA | §22 |
| CUS-REQ-031 | **Travel Rule** integration points and supported protocols | MUST | All | LCA | EV-17 |
| CUS-REQ-032 | Quarantine handling for unsupported assets, wrong networks, dust | MUST | All | LPA | §22.3 |

### 2.5 Chain events and settlement

| ID | Requirement | Priority | Model | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| CUS-REQ-040 | **Confirmation/finality** policy per network; **chain reorganisation** handling and notification | MUST | All | LCA | §22.2; EV-18 |
| CUS-REQ-041 | **Settlement transfer API**: deliver to / receive from approved LP SSIs with correlation ids | SHOULD | All | LPA | §25 |
| CUS-REQ-042 | Transfers between client subaccounts and LP settlement accounts recorded with client attribution | MUST | All | LCA | §25.1 |

### 2.6 Statements and reconciliation

| ID | Requirement | Priority | Model | Trigger | STR-04 |
|---|---|---|---|---|---|
| CUS-REQ-050 | **Balance API** per client subaccount / pool / address | MUST | All | LPA | §34 R2 |
| CUS-REQ-051 | **Statements** (daily) and transaction histories, authenticated, with completeness markers | MUST | All | LPA | §34 |
| CUS-REQ-052 | **Reconciliation** support: client-level (C1) or pool-level (C2) records sufficient for 3-way ledger ↔ custodian ↔ chain | MUST | All | LCA | §34 R4 |
| CUS-REQ-053 | Corrections delivered as linked records | SHOULD | All | LPA | §34.3 |

### 2.7 Service and resilience

| ID | Requirement | Priority | Model | Trigger | STR-04 / EV |
|---|---|---|---|---|---|
| CUS-REQ-060 | **Incident notification** commitments (time to notify, content) | MUST | All | LPA | §40 |
| CUS-REQ-061 | **Business continuity** / DR, including key-recovery testing evidence | MUST | All | LPA | — |
| CUS-REQ-062 | **Audit rights** and independent control reports (e.g., SOC-type) | MUST | All | LPA | — |
| CUS-REQ-063 | **Custodian migration** support: in-kind transfer to a successor custodian with full records | MUST | All | LCA | EV-15, EV-25 |
| CUS-REQ-064 | Webhook authenticity, replay protection, IP allowlisting/private connectivity | MUST | All | LPA | §37 |
| CUS-REQ-065 | Regulatory notification AIX must make before use | MUST | All | LPA | EV-24 |

## 3. Outcomes

Per requirement: `SUPPORTED` / `NOT_SUPPORTED` / `UNKNOWN`, evidence, environment demonstrated.
Results determine C1 vs C2 per instrument-network, whether AST-01 `custody_support` may reference
this arrangement as `THIRD_PARTY_CUSTODIAN` (only if CUS-REQ-001/002 show a legal custodian and no
AIX key control — STR-04 §52 FI-AST-1), reservation mode for assets, and open EV items.
**No scoring or selection is performed in DEC-015.**

*STR-04B v0.1 — DRAFT. Provider-neutral. Approves nothing.*
