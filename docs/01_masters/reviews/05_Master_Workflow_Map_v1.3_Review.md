---
document_id: REV-ARC-05-v1.3
title: Master Workflow Map v1.3 — Promotion Review
version: 1.0
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Controlled-document promotion evidence
owner: Unassigned
effective_date: 2026-09-22
last_reviewed: 2026-09-22
supersedes: none
baseline_commit: 1618fdf
---

# Master Workflow Map v1.3 — Promotion Review

**Verdict: ACCEPT.**

**Base documents:** Doc 00 v1.5, Charter v1.5, Module Index v1.4, SRS v1.3, Role Matrix v1.3.
**Governance basis:** `DEC-013`. **Derivation:** `v1.2`, controlled revision. `v1.2` archived intact.

## 1. The owner requirement, checked directly

> *"Workflows may fully describe future Exchange/RWA/Pay production flows. Where activation is
> unresolved, include a PRODUCTION ACTIVATION GATE rather than removing the workflow."*

**Satisfied in §3.7**, as a numbered workflow design principle. Six new workflows describe the
Exchange, RWA, Pay, activation and classification flows in full, each carrying an explicit
`PRODUCTION ACTIVATION GATE` step with its own state, audit event and error code
(`PRODUCTION_ACTIVATION_GATE_CLOSED`). §3.7 rule 4 forbids treating the gate as an implicit
precondition; §37 rule 2 forbids substituting it for `CAPABILITY_PERMANENTLY_PROHIBITED`, which
keeps *"there is no path"* distinguishable from *"the path exists and is closed"*.

## 2. Changes

| § | Change |
|---|---|
| Front matter, banner, Document Control | Version; base documents corrected from stale references |
| **§3.7 (new)** | Production activation gate — seven rules |
| §4 | `WF-29` restated; `WF-30`…`WF-35` added |
| §15 `WF-11` | Retitled **AIX Spot — Client Order and Execution**; §15.4 prohibited paths widened; §15.5 production activation gate; **§15.6 Model A client order lifecycle** with 15 states and 17 steps |
| §33 `WF-29` | Replaced — permanently prohibited capabilities, no workflow, no activation procedure |
| **§33A `WF-30` (new)** | AIX Pay merchant payment lifecycle |
| **§33B `WF-31` (new)** | AIX RWA asset lifecycle, 20 steps |
| **§33C `WF-32` (new)** | Exchange instrument admission and listing |
| **§33D `WF-33` (new)** | Exchange trading, with §33D.4 the boundary |
| **§33E `WF-34` (new)** | Capability production activation |
| **§33F `WF-35` (new)** | Instrument classification |
| §34 | Eight dependency rows and three dependency rules added |
| §35 | Nine state machines added |
| §37 | 26 error codes added; three error-reporting rules. **`EXCHANGE_MODULE_LOCKED` retained unchanged** |
| §38 | Test 25 widened; tests 34–53 added |
| §39 | Open items 17–25 |
| §27, §25 (WF-23, WF-25) | Blocking conditions widened from "future-locked exchange module" |

## 3. Adversarial checks

| # | Check | Result |
|---|---|---|
| 1 | Does `WF-33` create an MB matching path? | **PASS.** §33D.4 states five boundary rules including that `WF-11` and `WF-33` never converge; §38 tests 45–46; §37 adds two boundary-violation error codes |
| 2 | Does replacing `WF-29` weaken a prohibition? | **PASS.** §33.1 lists ten capabilities, one more than v1.2's substantive set; §33.3 blocks in every environment, for every role, under every configuration, through every path, regardless of any Exchange approval |
| 3 | Is removing v1.2's thirteen-step activation list a relaxation? | **PASS — it is a strengthening.** v1.2 implied Exchange approval could unlock client-to-client matching. §33.2 states no activation procedure exists and that lifting one would require a different licence basis |
| 4 | Does widening "resting orders" in `WF-11` §15.4 weaken it? | **PASS.** The prohibition is re-expressed as *mutually executable against another client's order*, which is the capability Doc 00 §7.7 prohibits. LFSA-DMB-2025 ¶6.4(i) requires cancellation of unexecuted orders, so a blanket ban on pending orders contradicted the guidelines the platform is built toward |
| 5 | Could a gated workflow reach production behaviour? | **PASS.** §3.7 rules 3 and 5; §34 dependency rule 2; §38 tests 34, 37 |
| 6 | Could a securities instrument reach Spot or OTC? | **PASS.** `WF-35` §33F.5; `WF-31` §33B.5 item 8; `WF-11` §15.4 item 9; §38 test 43 |
| 7 | Could an unresolved classification block development? | **PASS.** `WF-31` §33B.5 item 1 and `WF-35` §33F.5 both state it blocks production activation only |
| 8 | Could a capability be activated but not deactivated? | **PASS.** `WF-34` §33E.3 — deactivation needs one actor and one checker; the kill switch needs one actor; §38 test 50 |
| 9 | Could break-glass activate a capability? | **PASS.** `WF-25` blocking condition 6; `WF-34` §33E |
| 10 | Is any v1.2 workflow, state, step or blocking condition removed? | **PASS.** All retained. `WF-11`'s quote-and-confirm flow is kept and extended, not replaced |
| 11 | Is `EXCHANGE_MODULE_LOCKED` preserved? | **PASS.** §37 keeps it, with a note that it is cited across masters, tests and acceptance records (Doc 00 §9A) |
| 12 | Could a clearing outage produce provisional matching? | **PASS.** `WF-33` §33D.5 item 7 — fail closed, no provisional matching |
| 13 | Could order cancellation be blocked by a capability gate? | **PASS.** `WF-11` §15.6 states cancellation must always be available; §38 test 39 |

## 4. Findings raised and corrected

| # | Finding | Correction |
|---|---|---|
| F1 | `WF-29` was a lock presented as a workflow; Exchange, RWA and Pay had **no flows at all** (`STR-03` L-44) | Six workflows added; `WF-29` replaced |
| F2 | `WF-29` §33.3's thirteen-step activation list implied Exchange approval could unlock client-to-client matching | Removed as misleading; §33.2 states no activation path exists |
| F3 | `WF-11` §15.4 prohibited "resting orders" outright, contradicting LFSA-DMB-2025 ¶6.4(i) and Doc 00 §6 | Re-expressed as mutually-executable orders; the correction is recorded in place |
| F4 | `WF-11` described only quote-and-confirm, with no Model A client order lifecycle | §15.6 added; §15.4 kept |
| F5 | No workflow existed for production capability activation, so it would have defaulted to a feature-flag change | `WF-34` added |
| F6 | No workflow existed for instrument classification, although Doc 00 §12A makes it the gate in front of every product | `WF-35` added |
| F7 | Base documents were stale | Corrected |

## 5. Conclusion

**ACCEPT.** `v1.3` is promoted to APPROVED. `v1.2` is superseded prospectively and archived.
**No code, migration, test, seeded identifier, sealed hash or runtime guard is changed.**
