---
document_id: AST-01-BP-v1.2
title: AST-01 Blueprint Pack — Asset & Instrument Registry + Regulatory Classification
version: v1.2
document_status: DRAFT
implementation_status: NOT_STARTED
module: AST-01
control: Instrument identity, classification gate, derived product eligibility
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: 2026-09-26
supersedes: none (v1.0 and v1.1 remain reviewed historical evidence; not overwritten)
baseline_commit: ccec2ff
---

# AST-01 Blueprint Pack v1.2 — **REMEDIATED / AWAITING RE-REVIEW**

Planning only. **No application code, no migration, no test code, no schema change.** Nothing here is accepted, approved for implementation, or promoted. v1.2 remediates the round-2 findings **F17–F25** of the independent review [`04-review-r2.md`](../../../../03_implementation/tasks/AST-01/04-review-r2.md) (`REMEDIATE`, against v1.1 `e20b8ca`), applying the human decisions approved by Aiman. The finding-by-finding record is [`05-remediation-r2.md`](../../../../03_implementation/tasks/AST-01/05-remediation-r2.md). **v1.0 ([../v1.0/](../v1.0/README.md)) and v1.1 ([../v1.1/](../v1.1/README.md)) are unchanged and are reviewed historical evidence.**

## Reading order

| # | File | Contents |
|---|---|---|
| 01 | [01_Module_Blueprint.md](01_Module_Blueprint.md) | Ownership, invariants INV-01…20, identity + **canonical resolution (§3.11)** + lineage, fiat/MYR, classification incl. the **production-basis rule**, elevated approval and the **lineage conjunct (§4.7A)**, derivation, allow-list and token binding |
| 02 | [02_Workflow.md](02_Workflow.md) | Registration, classification, reclassification and lineage, holds, admission, evaluate/verify, `WF-32`, **W11 lineage security propagation** |
| 04 | [04_API_Specification.md](04_API_Specification.md) | Internal API, **single-selector instrument reference**, single-transaction `verify-decision`, `payload_hash` binding |
| 05 | [05_Database_Design.md](05_Database_Design.md) | `ast1` schema, identity indexes, lineage immutability, **backstop B1–B11 at mint and consumption, lock order §7A** |
| 06 | [06_State_Machine.md](06_State_Machine.md) | Nine state machines |
| 07 | [07_Permission_Rules.md](07_Permission_Rules.md) | Roles, permissions, change-kind authority map |
| 08 | [08_Audit_Log_Events.md](08_Audit_Log_Events.md) | Events, evidence, retention |
| 09 | [09_Error_Handling.md](09_Error_Handling.md) | Reason codes, thrown errors, **database integrity errors `AS001–AS004`** |
| 10 | [10_Test_Cases.md](10_Test_Cases.md) | Test IDs incl. `T-RES`, `T-CON`, `T-PLD`, `T-LIN`, `T-MYR`, `T-RNP` |
| 12 | [12_Risk_And_Control_Map.md](12_Risk_And_Control_Map.md) | Risks AR-01…26 |
| 17 | [17_Dependencies_And_Open_Decisions.md](17_Dependencies_And_Open_Decisions.md) | Approved decisions (incl. round 2), DCR-AST1-001…009, gates, OQ-8 |

## What changed from v1.1

| Finding | v1.2 |
|---|---|
| **F17** ambiguous resolution | Only canonical identity resolves an instrument (token: chain+network+contract; native: chain+network); `{asset_code, chain, network}` removed; 0 or >1 ⇒ `NOT_ASSESSED`, no token; WLT-01 must supply contract identity (external gate); ambiguous/unregistered inbound ⇒ quarantine, no credit |
| **F18** consumption/TOCTOU | Token binding columns immutable; one-transaction consume; one lock order (instrument before token); SQL backstop re-runs at the consuming `UPDATE`; failure behaviour specified; no autonomous transactions |
| **F19** deterministic lineage | Native identity unique; same-contract recreation abandoned (identity registered once); wrapper/underlying history forces the elevated path; code-hash claim **withdrawn**; lineage fields immutable from creation |
| **F20** siblings | Derived conjunct `LINEAGE_SECURITY_REVIEW_REQUIRED`; tokens revoked; no classification rewritten; cleared only by a newer elevated record |
| **F21 / AST-P-4** MYR | No MYR-pair control exists; digital MYR ⇒ `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED`, no override; consumers fail closed |
| **F22** fiat discriminator | Form, not class; `asset_class` frozen once an instrument exists (governed correction only); non-FIAT `not_applicable` ⇒ deny |
| **F23** binding | `payload_hash` covers client facts and references; token trigger compares `consumer_service`; allow-list frozen with boot invariant + SQL B9 |
| **F24** hygiene | `deployment_environment` trigger-immutable; hold after a backstop trip written by the application in a separate transaction; conjunct-row keys immutable |
| **F25 / AST-R2-HD-01** | Real instrument + non-production classification ⇒ `NOT_ASSESSED`; synthetic instruments are the non-production route |
| Human decisions | `AST-HD-5`, `AST-HD-7`, `AST-P-3`, `AST-P-4`, `AST-R2-HD-01` recorded as approved |

## What this pack does not do

It classifies **no** asset, approves **no** venue, order type or asset, answers **no** regulatory open question (`R4-Q3`, `R4-Q5`, `R4-Q6`, `R4-Q7`, `R1-Q1b`, `R4-Q2` stay open and are modelled as fail-closed gaps or CFG-01 matters), builds no trading, matching, ledger or RWA issuance, and changes no other module. Cross-module changes are DCRs in file 17, **none implemented**; DCR-AST1-002 (incl. the WLT-01 contract-identity gap), -004 and -008(c) are external gates.
