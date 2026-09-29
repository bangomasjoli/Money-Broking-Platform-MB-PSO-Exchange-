---
document_id: AST-01-BP-v1.7
title: AST-01 Blueprint Pack — Asset & Instrument Registry + Regulatory Classification
version: v1.7
document_status: DRAFT
implementation_status: NOT_STARTED
module: AST-01
control: Instrument identity, classification gate, derived product eligibility
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: 2026-09-29
supersedes: none (v1.0, v1.1, v1.2, v1.3, v1.4, v1.5 and v1.6 remain reviewed historical evidence; not overwritten)
baseline_commit: ecaf628
---

# AST-01 Blueprint Pack v1.7 — **REMEDIATED / AWAITING RE-REVIEW**

Planning only. **No application code, no migration, no test code, no schema change.** Nothing here is accepted, approved for implementation, or promoted. **Implementation is not authorised.** v1.7 remediates the round-7 findings **F38 (LOW, carried — still open), F40 (LOW, new), F41 (LOW, supersedes F36)** and the round-7 editorial items of the separate-context review [`04-review-r7.md`](../../../../03_implementation/tasks/AST-01/04-review-r7.md) (`REMEDIATE`, against v1.6 `292face`). The finding-by-finding record is [`05-remediation-r7.md`](../../../../03_implementation/tasks/AST-01/05-remediation-r7.md). **v1.0 ([../v1.0/](../v1.0/README.md)) through v1.6 ([../v1.6/](../v1.6/README.md)) are unchanged and are reviewed historical evidence.** Closed design is preserved as **CLOSED, not reopened**: F29, F30, F31 (original inversion), F32(b), F33, F35, **F37, F39**. F02, F05, F17 and F21 remain external gates, unclosed. F36 is superseded by F41. **OQ-8 remains OPEN / UNDECIDED / NON-BLOCKING.** No round-7 finding requires a human decision.

## Reading order

| # | File | Contents |
|---|---|---|
| 01 | [01_Module_Blueprint.md](01_Module_Blueprint.md) | Ownership, invariants INV-01…27. **INV-17, INV-20, INV-23 extended; §3.6, §3.7, §4.7A restated (F38/F40/F41); citation fixed** |
| 02 | [02_Workflow.md](02_Workflow.md) | **W1 step 4, W11 (editorial: link graph immutable; merges change merge-tree history), W12, W13 (helper-call form, asset re-lock, token revocation)** |
| 04 | [04_API_Specification.md](04_API_Specification.md) | **Underlyings endpoint (trigger-taken locks), §6.1/§6.2 lock steps as helper calls, §8 locking** |
| 05 | [05_Database_Design.md](05_Database_Design.md) | **§1 rules 20, 22–26; §2/§2.1/§2.2 (F41: bootstrap boundary, self-contained rule functions, vector classes, dispatcher, event trigger, PG major version); §4.1–4.3 (helper calls, `trg_underlying_insert_guard`, F37 proof on SQL premises); §5.1 step 2A; §7/§7A (12-helper family, re-lock enumeration, `AS006` four cases, token revocation)** |
| 06 | [06_State_Machine.md](06_State_Machine.md) | Nine state machines; one clarifying row (classification requires `IDENTITY_LOCKED`) — no new state |
| 07 | [07_Permission_Rules.md](07_Permission_Rules.md) | Unchanged authority map — no new authority; `role_ast1_bootstrap` is a platform role, not an application authority |
| 08 | [08_Audit_Log_Events.md](08_Audit_Log_Events.md) | **Three new events (F40, F41)** |
| 09 | [09_Error_Handling.md](09_Error_Handling.md) | **`AST1_LOCK_SET_CHANGED` umbrella for all four `AS006` cases; new `AST1_INSTRUMENT_NOT_IDENTITY_LOCKED`, `AST1_ADDRESS_RULE_FREEZE_VIOLATION`; `AS007` helper list complete** |
| 10 | [10_Test_Cases.md](10_Test_Cases.md) | **`T-LIN-36…41`, `T-ADR-24…27`, `T-LOK-10/11`; rewritten `T-LOK-07(i)–(o)`, `T-ISO-04`, `T-ADR-01/04/13/19…23`; editorial `T-LIN-30/33`** |
| 12 | [12_Risk_And_Control_Map.md](12_Risk_And_Control_Map.md) | Risks AR-01…44 (**new AR-42 F38, AR-43 F40, AR-44 F41**) |
| 17 | [17_Dependencies_And_Open_Decisions.md](17_Dependencies_And_Open_Decisions.md) | DCR-AST1-001…009 unchanged; **OQ-8 still open, unaffected; no human decision from F38/F40/F41** |

## What changed from v1.6

| Finding | Sev | v1.7 |
|---|---|---|
| **AST-01-F38 (carried, still open)** — helper exclusivity restored as a rule but every named normative site still written as raw `SELECT … FOR SHARE/UPDATE`; asset re-lock missing from the re-lock enumeration; stale helper lists; level G without a helper; token acquisition outside the helper contract; `AS006` case (4) missing from the thrown-error row; T-LOK-07(m) unimplementable | LOW | **One governed-lock rule over levels G, 0, 1, 2, 3.** A complete **12-helper family** (adds `lock_governed_change` for level G and `lock_token`/`lock_tokens`/`lock_instrument_tokens`); every helper's literal first operation is the `READ COMMITTED` assertion (`AS007`; T-ISO-04 = exactly the list). **Every raw site rewritten as a helper call** (05 §4.1, §4.2, §7, §7A correction/mint/consume; 04 §6.1/§6.2; 02 W13). The `trg_asset_class_frozen` asset re-lock is an enumerated **idempotent re-lock** (no SQL lock, no level check, no tracker change, no `AS006`), asserted in T-LOK-07(i). **Token revocation** = instrument first, then tokens through the helper in `(instrument_id, token_hash)` order. `AS006` four cases identical in 05, 09, 01, 10 and here; `AST1_LOCK_SET_CHANGED` is the umbrella. T-LOK-07(m) is an implementable static scan with the exact acceptance condition *zero raw governed row-lock statements against G–3 outside the helper implementations* |
| **AST-01-F40 (new)** — F37's recursion premises enforced by workflow only on a raw path (source-`DRAFT` check racing the source's identity lock; unordered FK `KEY SHARE`; no SQL rule refusing a record on a `DRAFT` instrument) | LOW | **`trg_underlying_insert_guard`**: one ordered `BEFORE INSERT` trigger whose first act is `lock_instruments({instrument_id, underlying_instrument_id}, UPDATE)`; then source `DRAFT`, target `IDENTITY_LOCKED`/`RETIRED`, kind, cycle. FK `KEY SHARE`s become subsumed implicit locks. **Record trigger step 2A** refuses any record unless `IDENTITY_LOCKED` (`AST1_INSTRUMENT_NOT_IDENTITY_LOCKED`; `RETIRED` stays non-classifiable — existing policy, not changed). The F37 recursive proof is restated on three **SQL-enforced** premises and holds with the sweep disabled |
| **AST-01-F41 (new, supersedes F36)** — freeze boundary incomplete (dispatcher routing, freeze machinery, dependency closure, table-reading `CHECK`s, vector classes, conditional readiness, dangling function, manifest fallback, PostgreSQL upgrade) | LOW | **Bootstrap-owned freeze machinery + migration-owned, versioned, self-contained rule functions.** Role separation is the boundary (P1 proves the privilege model). Registration refuses rule functions with mutable/unfrozen dependencies (SQL-standard body, `pg_depend` allow-list, `SQLValueFunction` scan, `pg_catalog` search path). Generic registry-lookup dispatcher (no `CASE`) whose results are compared with the direct rule function for every vector. `vector_class` + insert-only requirement table. **Both table-reading `CHECK`s removed**; `trg_instrument_address_canonical` is the authoritative trigger. Always-on readiness trigger; `NULL`-safe assertion failing closed on a dangling function. **One mechanism**: bootstrap-owned `ddl_command_end` + `sql_drop` event trigger (else P1 stops; no manifest fallback). PostgreSQL major version pinned; upgrade = governed, append-only re-baseline |

Round-7 **editorial** items: T-LIN-30 (V constructed non-`DRAFT`), T-LIN-33 (identity lock is case-submit's `UPDATE`), 02 W11 (link graph immutable; merges change merge-tree history), 05 §5.1 2(c) (`IDENTITY_LOCKED` lifecycle vs PostgreSQL row lock), T-ADR-23 (`platform/infra/migrations`, stated as an artefact assertion), 01 §3.6 citation.

## What this pack does not do

It classifies **no** asset, approves **no** venue, order type or asset, answers **no** regulatory open question, builds no trading, matching, ledger or RWA issuance, and changes no other module. Cross-module changes are DCRs in file 17, **none implemented or executed**; DCR-AST1-002 (incl. the WLT-01 contract-identity gap), -004 and -008(c) are external gates (F17, F21, F02, F05) — **unclosed, not claimed closed**. **OQ-8 remains open**; v1.7 adds no draft-correction path. **No human decision arises from F38, F40 or F41.**
