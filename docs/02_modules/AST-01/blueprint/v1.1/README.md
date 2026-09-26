---
document_id: AST-01-BP-v1.1
title: AST-01 Blueprint Pack — Asset & Instrument Registry + Regulatory Classification
version: v1.1
document_status: DRAFT
implementation_status: NOT_STARTED
module: AST-01
control: Instrument identity, classification gate, derived product eligibility
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: 2026-09-26
supersedes: none (v1.0 remains reviewed historical evidence; not overwritten)
baseline_commit: 45d9a2f
---

# AST-01 Blueprint Pack v1.1 — **REMEDIATED / AWAITING RE-REVIEW**

Planning only. **No application code, no migration, no test code, no schema change.** Nothing here is accepted, approved for implementation, or promoted. v1.1 remediates the findings of the independent review [`04-review.md`](../../../../03_implementation/tasks/AST-01/04-review.md) (`REMEDIATE`, against v1.0 `78ec1e4`), applying the human decisions approved by Aiman. The finding-by-finding record is [`05-remediation.md`](../../../../03_implementation/tasks/AST-01/05-remediation.md). **v1.0 ([../v1.0/](../v1.0/README.md)) is unchanged and is reviewed historical evidence.**

## Reading order

| # | File | Contents |
|---|---|---|
| 01 | [01_Module_Blueprint.md](01_Module_Blueprint.md) | Ownership, invariants INV-01…17, identity + **lineage**, fiat reference data, classification, **holds as conjunct**, elevated approval, **domain-aware derivation and the total matrix**, token/consumer binding, open-question buckets, SRS field mapping |
| 02 | [02_Workflow.md](02_Workflow.md) | Registration, classification, reclassification and lineage, holds, admission, operational enablement, evaluate/verify, `WF-32` sequencing |
| 04 | [04_API_Specification.md](04_API_Specification.md) | Internal API, fiat `not_applicable` contract, service allow-list, bound tokens |
| 05 | [05_Database_Design.md](05_Database_Design.md) | `ast1` schema, lineage, **authoritative SQL backstop that reads the ledger** |
| 06 | [06_State_Machine.md](06_State_Machine.md) | Nine state machines |
| 07 | [07_Permission_Rules.md](07_Permission_Rules.md) | Roles, permissions, **change-kind authority map** |
| 08 | [08_Audit_Log_Events.md](08_Audit_Log_Events.md) | Events, evidence, retention |
| 09 | [09_Error_Handling.md](09_Error_Handling.md) | Reason codes and thrown errors |
| 10 | [10_Test_Cases.md](10_Test_Cases.md) | Test IDs, incl. exhaustive matrix, backstop, domain-binding and bypass suites |
| 12 | [12_Risk_And_Control_Map.md](12_Risk_And_Control_Map.md) | Risks AR-01…22, controls, regulatory mapping |
| 17 | [17_Dependencies_And_Open_Decisions.md](17_Dependencies_And_Open_Decisions.md) | **Approved human decisions, pending items, DCR-AST1-001…009, implementation-vs-go-live gates** |

## What changed from v1.0

| Area | v1.1 |
|---|---|
| Subjects | `EXCHANGE` → **`SECURITIES_MARKET`** (F15); deposit/withdrawal are **domain-scoped** (`MB_PSO` / `SECURITIES`) (F01) |
| Hard rule | Now covers MB/PSO custody; **SQL backstop reads the ledger, not application-supplied columns** (F04); matrix **total** with exhaustive boot invariant (F10) |
| Securities route | **Real** `SECURITY` instruments derive `NOT_ASSESSED` on securities-route subjects; synthetic instruments build/test the full lifecycle (F03) |
| Tokens | Bound to subject, domain, consumer, instrument, environment, **record id**; service allow-list per subject (F02) |
| Approval | Maker ≠ checker checked only on **IAM-02-attested** identity; governed classification apply disabled until DCR-AST1-001(a)+(d) (F05) |
| Lineage | New lineage model closes `SECURITY→UNRESOLVED→NON_SECURITY`, retire→recreate and replacement-asset bypasses (F06) |
| Holds | A **conjunct** (`INSTRUMENT_ON_HOLD`); never changes the classification; human holds maker-checkered; system integrity denial immediate (F07) |
| Fiat | Reference data only, outside the §12A API; `not_applicable` contract; `GET /currencies/{iso}` (F08) |
| Synthetic | Single source of truth on the instrument; immutable from insert (F09) |
| Open questions | Three-bucket rule (F11); SRS field mapping incl. READ-THROUGH/EXTERNAL owners (F12); attestation bound to the current record (F13); citations and change-kind authority map corrected (F14) |

## What this pack does not do

It classifies **no** asset, approves **no** venue, order type or asset, answers **no** regulatory open question (`R4-Q3`, `R4-Q5`, `R4-Q6`, `R4-Q7`, `R1-Q1b`, `R4-Q2` stay open and are modelled as fail-closed gaps or CFG-01 matters), builds no trading, matching, ledger or RWA issuance, and changes no other module. Cross-module changes are DCRs in file 17, **none implemented**. `HD-5` and `HD-7` were not part of the approved package and are recorded as **pending**, not approved.
