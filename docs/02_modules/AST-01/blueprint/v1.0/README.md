---
document_id: AST-01-BP-v1.0
title: AST-01 Blueprint Pack — Asset & Instrument Registry + Regulatory Classification
version: v1.0
document_status: DRAFT
implementation_status: NOT_STARTED
module: AST-01
control: Instrument identity, classification gate, derived product eligibility
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: 2026-09-26
supersedes: none
baseline_commit: 43f2f34
---

# AST-01 Blueprint Pack v1.0 — **PLANNED / AWAITING REVIEW**

Planning only. **No application code, no migration, no test code, no schema change** accompanies this pack. `DEC-013` clause 1 authorises the design; it authorises no activation.

## Reading order

| # | File | Contents |
|---|---|---|
| 01 | [01_Module_Blueprint.md](01_Module_Blueprint.md) | Purpose, ownership boundary, invariants, identity model, classification, **the derivation matrix**, custody, precision, transfer restrictions, jurisdictions, environments |
| 02 | [02_Workflow.md](02_Workflow.md) | Registration, classification (`WF-35`), reclassification, hold, admission, operational enablement, eligibility evaluate/verify |
| 04 | [04_API_Specification.md](04_API_Specification.md) | Internal API, request/response shapes, ordering, idempotency |
| 05 | [05_Database_Design.md](05_Database_Design.md) | `ast1` schema, constraints, DB-level backstops, privileges |
| 06 | [06_State_Machine.md](06_State_Machine.md) | Nine state machines and the derived-state mapping to `WF-35` |
| 07 | [07_Permission_Rules.md](07_Permission_Rules.md) | Roles, permissions, maker-checker matrix, tightening-vs-loosening asymmetry |
| 08 | [08_Audit_Log_Events.md](08_Audit_Log_Events.md) | Events, evidence, retention |
| 09 | [09_Error_Handling.md](09_Error_Handling.md) | Error and reason-code catalogue |
| 10 | [10_Test_Cases.md](10_Test_Cases.md) | Test strategy and cases, including the exhaustive security-never-Spot property tests |
| 12 | [12_Risk_And_Control_Map.md](12_Risk_And_Control_Map.md) | Risks, controls, regulatory mapping |
| 17 | [17_Dependencies_And_Open_Decisions.md](17_Dependencies_And_Open_Decisions.md) | **Dependency-change requests, human decisions HD-1…, open regulatory questions** |

Files 03, 11, 13–16 of the standard 16-file pack are intentionally omitted: AST-01 has no reconciliation surface, no go-live checklist that is meaningful before implementation, and its data classification and regulatory mapping are folded into files 05 and 12. A later version may add them.

## The design in one page

1. **Classification is the only source of product eligibility.** There is no `spot_eligible`, `otc_eligible` … column anywhere in the schema. A pure function `deriveProductEligibility(classification, class, environment, …)` computes every product answer at read time. A schema-lint test forbids an eligibility-shaped column outside the append-only decision log (T-SCH-01).
2. **The default is `UNRESOLVED` and it is a derived absence, not a stored flag** someone can forget to set. No approved classification record ⇒ `UNRESOLVED` ⇒ every product answers `NOT_ASSESSED` ⇒ deny.
3. **Classification is an append-only, evidenced, maker-checkered ledger**, bound to a fingerprint of the exact identity that was classified. If identity drifts, the classification stops applying.
4. **Everything else can only narrow.** Compliance product admission, operational state, custody support, transfer restrictions, jurisdiction rules, holds and prohibited-category attributes are *conjuncts*: they can turn a derived `permitted` into a deny, never a deny into an allow. None can manufacture eligibility the classification does not give.
5. **The hard rule is defended in three places:** the matrix constant (asserted at boot and in tests), the evaluate path, and a database CHECK on the decision log and token tables that makes an `allow` for `SECURITY × SPOT/OTC` unrecordable even if the application is wrong.
6. **AST-01 answers one conjunct only** (`PRODUCT_ASSET_ELIGIBILITY_STATE`). It never says "access granted". Permission, environment availability, product activation and the production gate stay with IAM-02 and CFG-01 (Doc 00 §21A rule 2; `DEC-013` clause 11).
7. **Environment comes from AST-01's own validated config**, never from the caller (the lesson of `CFG-FIND-001`). Synthetic instruments fail closed in PRODUCTION and are structurally unpromotable.
8. **A design constraint discovered in the code:** `assertNoExchangeRuntime` rejects any route path containing `exchange`. AST-01 therefore exposes Exchange eligibility only as a payload enum value, never in a route path (see 04 §1.3, 17 DCR-AST1-007).

## What this pack does not do

It classifies **no** asset, approves **no** venue, order type or asset, answers **no** regulatory open question (`R4-Q3`, `R4-Q6`, `R4-Q7` etc. remain open and are modelled as fail-closed gaps, not assumptions), builds no trading, matching, ledger, or RWA issuance, and does not modify any other module. Where another module must change, the change is recorded as a dependency-change request in file 17 and **not** made.
