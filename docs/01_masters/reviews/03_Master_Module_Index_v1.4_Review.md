---
document_id: REV-ARC-03-v1.4
title: Master Module Index v1.4 — Promotion Review
version: 1.0
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Controlled-document promotion evidence
owner: Unassigned
effective_date: 2026-09-22
last_reviewed: 2026-09-22
supersedes: none
baseline_commit: 01bfa3c
---

# Master Module Index v1.4 — Promotion Review

**Verdict: ACCEPT.**

**Base documents:** Doc 00 v1.5, Charter v1.5. **Governance basis:** `DEC-013` clause 12.
**Architecture assessment:** `STR-03` §9. **Derivation:** `v1.3`, controlled revision. `v1.3` archived intact.

## 1. Module count

**33 → 37.** Added: `EXM-01`, `EXO-01`, `EXC-01`, `EXP-01`. **No module renumbered, renamed or
removed.** Verified by unique-identifier extraction: 37 distinct codes.

## 2. Changes

| § | Change |
|---|---|
| Front matter, banner, Document Control | Version, base documents, module count |
| §2 | Source scope corrected from the stale `v1.3` filenames; build/activation scope block added |
| §3 | `Future-Locked` retired as a classification |
| §5.2 | Capability group **Securities Exchange** added |
| **§5.4 (new)** | Build and activation status, separate from module status |
| §13 | "No internal matching module" **re-scoped to MB Spot**, with the `EXO-01` boundary stated |
| §15 | RWA modules build-authorised against synthetic assets |
| **§16A (new)** | AIX Exchange securities market domain — four modules, the boundary, the namespace, the migration dependencies, the RWA→Exchange route |
| §17 | Split into 17.1 permanent / 17.2 modules with gated activation / 17.3 out of product scope |
| §18 | **Phase F2** securities Exchange tier; sequencing rationale |
| §19 | Rule 5 re-scoped to MB; rules 5A, 5B, 11, 12, 13, 14 added |
| §20 | Securities Exchange track; cross-track no-shared-execution-code rule; extension-track rule |
| §21 | Folder listing updated |
| §25 | Re-baseline sequence stated |

## 3. Adversarial checks

| # | Check | Result |
|---|---|---|
| 1 | Does adding `EXO-01` create an MB matching path? | **PASS.** §16A.2 states five binding rules; §19 rule 5A names every forbidden caller both ways; §17.1 lists reuse of `EXO-01` by an MB-domain module as a standing prohibition; §13 restates it; the boundary is required as a module-level invariant with test evidence in `EXO-01`'s blueprint |
| 2 | Could re-scoping §13 to "MB Spot" weaken the Model C prohibition? | **PASS.** §13, §16A.2, §17.1 and §19 rule 5A each restate it. The re-scoping mirrors `DEC-012` clause 4's terminology correction, which exists for the same reason |
| 3 | Is any accepted module renumbered or invalidated? | **PASS.** 37 distinct codes; all 33 prior codes present unchanged |
| 4 | Are the four new modules justified, or is this microservice proliferation? | **PASS.** §16A.1 states the four concerns and lists six capabilities deliberately **not** given modules (surveillance, reporting, API, asset registry, ledger, identity). MODULE ≠ SERVICE restated |
| 5 | Could an Exchange module duplicate a shared-core control? | **PASS.** §16A.1's table routes each to its owning module; §19 rules 6, 7, 8 unchanged; §20's extension-track rule |
| 6 | Could shared code leak a venue capability into MB Spot? | **PASS.** §20's cross-track rule forbids sharing execution code between `EXE-01` and `EXO-01` and names the reason |
| 7 | Does any change activate a capability? | **PASS.** §5.4 rule 2, §17.2, §16A — production activation DISABLED throughout |
| 8 | Does retiring `Future-Locked` remove a lock? | **PASS.** §3 states the replacement explicitly; §17.1 holds the permanent prohibitions and is stronger than the label was |
| 9 | Does scope expand into out-of-scope products? | **PASS.** §17.3 |
| 10 | Can the Exchange be built before its prerequisites? | **PASS.** §16A.4 lists five migration dependencies and states that without `MIG-001` `EXO-01` cannot boot; §18 Phase F2 sequencing |
| 11 | Is a securities instrument admissible to Spot/OTC? | **PASS.** §19 rule 5B, in every environment |

## 4. Findings raised and corrected

| # | Finding | Correction |
|---|---|---|
| F1 | §2 source scope named `00_..._v1.3.md` and `01_..._v1.3.md` — stale since v1.3 itself | Corrected to v1.5 and flagged as a correction |
| F2 | §13's unqualified "no internal matching module exists, and none may be created" would have prohibited `EXO-01` | Re-scoped to MB Spot with the boundary stated four ways |
| F3 | §3's `Future-Locked` label conflated "must never exist" with "not yet activated" | Retired, with §17.1/§17.2 replacing it |
| F4 | §17's single table gave securities capabilities no build dimension | Split into §17.1/§17.2/§17.3 |
| F5 | §21's folder listing named `12_future_locked_exchange/` | Renamed to `12_securities_exchange/` — illustrative listing only, no repository path changes |

## 5. Conclusion

**ACCEPT.** `v1.4` is promoted to APPROVED. `v1.3` is superseded prospectively and archived.
**Final module count: 37.** **No code, migration, test, seeded identifier, sealed hash or runtime
guard is changed.**
