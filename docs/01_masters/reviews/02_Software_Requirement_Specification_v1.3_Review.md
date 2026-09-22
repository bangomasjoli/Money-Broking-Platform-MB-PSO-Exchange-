---
document_id: REV-ARC-02-v1.3
title: SRS v1.3 — Promotion Review
version: 1.0
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Controlled-document promotion evidence
owner: Unassigned
effective_date: 2026-09-22
last_reviewed: 2026-09-22
supersedes: none
baseline_commit: cf96bf2
---

# SRS v1.3 — Promotion Review

**Verdict: ACCEPT.**

**Base documents:** Doc 00 v1.5, Charter v1.5, Module Index v1.4 (37 modules).
**Governance basis:** `DEC-013`. **Derivation:** `v1.2`, controlled revision. `v1.2` archived intact.

## 1. Changes

| § | Change |
|---|---|
| Front matter, banner, Document Control | Version; base documents corrected from three-versions-stale references |
| §1 | Purpose item 10 restated; item 13 added |
| §2 | Scope baseline restated; build/activation baseline added; traceability note corrected to Module Index v1.4 |
| **§2A (new)** | Requirement state model — `IMPLEMENTED_CAPABILITY`, `ENVIRONMENT_AVAILABILITY`, `PRODUCTION_REGULATORY_ACTIVATION`; `STATE-SRS-001`…`007` |
| **§2B (new)** | Environment model; `ENV-SRS-001`…`008` |
| §3 | Product description extended to Pay, RWA and Exchange; the venue prohibition restated |
| §7 | Constraints reclassified; 9a and 23–28 added |
| §13 | `AST-SRS-001` rewritten as the full instrument registry; `AST-SRS-001A` synthetic instruments added |
| §14 `PRD-SRS-005` | Retitled **AIX Spot Trading Interface**; extended by §14A |
| **§14A (new)** | `SPT-SRS-001`…`018` — AIX Spot order and execution |
| **§14B (new)** | `PAY-SRS-001`…`022` — AIX Pay |
| **§14C (new)** | `RWA-SRS-001`…`024` — AIX RWA lifecycle |
| **§14D (new)** | `EXG-SRS-001`…`022` and `EXG-SRS-100`…`106` — AIX Exchange and its boundary |
| §19 | Replaced with 19.1 permanent prohibitions / 19.2 production-gated / 19.3 corrections / 19.4 out of scope |
| §22 | State machines 19–29 added |
| §23 | API requirements 11–13 added |
| §25 | Testing requirements 30–41 added |
| §26 | Go-live 19, 19a, 19b, 19c |
| §28 | Open items 25–33 |
| §31 | v1.2 review prompt marked historical |

## 2. The owner requirement, checked directly

> *"The SRS must distinguish wherever relevant: `IMPLEMENTED_CAPABILITY`,
> `ENVIRONMENT_AVAILABILITY`, `PRODUCTION_REGULATORY_ACTIVATION`. Do not treat these as one
> boolean. Requirements must support Dev, Test, UAT, Demo, Production with production-specific
> gates."*

**Satisfied.** §2A defines the three states and forbids a single `enabled` field as their sole
representation (`STATE-SRS-001`). §2B defines the five environments. Every requirement table in
§14A–§14D carries a production-activation column distinct from its implementation requirement.
§19.2 lists the production-gated capabilities with their gates. `STATE-SRS-007` requires gated
capabilities to be **fully implemented and tested including their evidence obligations**, so
activation is configuration rather than a build project.

## 3. Adversarial checks

| # | Check | Result |
|---|---|---|
| 1 | Does any new requirement permit MB Spot internal matching? | **PASS.** `SPT-SRS-004`, `SPT-SRS-017`, `SPT-SRS-018`, §7 constraints 1–6, §19.1 items 1–10 |
| 2 | Could `EXG-SRS-*` be reached from an MB-domain module? | **PASS.** `EXG-SRS-101`…`106`; `EXG-SRS-104` requires automated invariant evidence; `EXG-SRS-105` forbids shared execution code |
| 3 | Does the Exchange boundary survive in non-production? | **PASS.** `EXG-SRS-103` states it holds identically in all five environments |
| 4 | Could a securities instrument reach Spot/OTC? | **PASS.** `AST-SRS-001` requirement 4; §7 constraint 9a; `RWA-SRS-022` routes to `EXM-01`, not Spot |
| 5 | Could a synthetic classification become a production classification? | **PASS.** `AST-SRS-001A` requirements 2–4 |
| 6 | Does any requirement claim an approval AIX lacks? | **PASS.** Every gated capability names its unresolved question |
| 7 | Is any v1.2 requirement removed? | **PASS.** Verified — all `FND`, `IAM`, `CLT`, `CMP`, `VND`, `AST`, `PRD`, `MON`, `RPT`, `PRT`, `OPS` and `NFR` requirements retained. `PRD-SRS-005` retitled, its content preserved and marked extended-not-replaced |
| 8 | Is any control relaxed for non-production? | **PASS.** `ENV-SRS-006`; §7 constraint 26 |
| 9 | Could a permission activate a capability? | **PASS.** `STATE-SRS-003`; §23 requirement 13 |
| 10 | Does removing "surveillance" from the locked list weaken anything? | **PASS.** It was mis-locked. `SPT-SRS-014` makes it a required control citing ¶6.4(i); `EXG-SRS-020` extends it |
| 11 | Does scope expand into out-of-scope products? | **PASS.** §19.4 states no requirements exist for them; §7 constraints 7, 8, 23 |
| 12 | Are go-live gates weakened? | **PASS.** Gate 19 strengthened from "Exchange-locked modules disabled" to unreachability verification in every environment; 19a–19c added |

## 4. Findings raised and corrected

| # | Finding | Correction |
|---|---|---|
| F1 | Base documents cited `00_v1.3`, `01_v1.3`, `03_v1.2` — three versions stale | Corrected throughout, including the §2 traceability note |
| F2 | §19 gave the securities Exchange **no requirements at all**, making it unbuildable (`STR-03` L-42) | §14D adds 28 requirements; §19 replaced |
| F3 | §19 item 12 locked **market surveillance**, which LFSA-DMB-2025 ¶6.4(i) requires | `SPT-SRS-014`, `EXG-SRS-020`; §19.3 records the correction |
| F4 | §19 items 9–11 locked order types already reclassified by Doc 00 §6 into §11B | §19.3; `SPT-SRS-006`/`007`. Post-only and maker/taker remain prohibited |
| F5 | `AST-SRS-001`'s eight fields could not carry a security token, tokenised fund or tokenised debt instrument | Rewritten with nine field groups and eleven instrument types |
| F6 | §7's "in MVP" phrasing read as a delivery-phase exclusion rather than a permanent boundary | Constraints 1–6 restated as permanent and environment-independent |

## 5. Conclusion

**ACCEPT.** `v1.3` is promoted to APPROVED. `v1.2` is superseded prospectively and archived.
**No code, migration, test, seeded identifier, sealed hash or runtime guard is changed.**
