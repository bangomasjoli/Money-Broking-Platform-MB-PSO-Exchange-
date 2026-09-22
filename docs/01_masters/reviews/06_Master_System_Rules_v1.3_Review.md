---
document_id: REV-ARC-06-v1.3
title: Master System Rules v1.3 — Promotion Review
version: 1.0
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Controlled-document promotion evidence
owner: Unassigned
effective_date: 2026-09-22
last_reviewed: 2026-09-22
supersedes: none
baseline_commit: cefdbe9
---

# Master System Rules v1.3 — Promotion Review

**Verdict: ACCEPT.**

**Base documents:** Doc 00 v1.5, Charter v1.5, Module Index v1.4, SRS v1.3, Role Matrix v1.3,
Workflow Map v1.3. **Governance basis:** `DEC-013`.
**Derivation:** `v1.2`, controlled revision. `v1.2` archived intact.

## 1. The owner requirement, checked directly

> *"Create binding rules separating BUILD STATE, ENVIRONMENT STATE, REGULATORY ACTIVATION STATE,
> PRODUCT/ASSET ELIGIBILITY STATE. Unknown regulatory production state: FAIL CLOSED."*

**Satisfied by four Critical rules plus two supporting ones**, each in the document's standard
rule format with enforcement point, failure behaviour, audit and test requirements:

| Rule | Separates |
|---|---|
| `SYS-RULE-006` | Build state |
| `SYS-RULE-007` | Environment state |
| `SYS-RULE-008` | Regulatory activation state |
| `SYS-RULE-009` | Product / asset eligibility state |
| **`SYS-RULE-010`** | **Unknown regulatory production state → fail closed** |
| `SYS-RULE-011` | Access is conjunctive; permission never activates, activation never grants |

`SYS-RULE-007A` additionally forbids relaxing any control in a non-production environment —
*build-unlocking a product never unlocks a control*. `SYS-RULE-010` is written as a
specialisation of `SYS-RULE-003`, not a replacement, so the existing fail-closed spine is
untouched.

## 2. Changes

| § | Change |
|---|---|
| Front matter, banner, Document Control | Version; base documents corrected from stale references |
| §5 | `SYS-RULE-006`…`011` and `SYS-RULE-007A` added. `SYS-RULE-001`…`005` untouched |
| §6 `LIC-RULE-002` | Rewritten as **Money Broking Venue Prohibition — permanent, every environment** |
| **§6 `LIC-RULE-002A` (new)** | Production-gated capabilities with their gates |
| **§6 `LIC-RULE-005` (new)** | Exchange domain boundary |
| §6 `ASSET-RULE-001` | Item 4 and rule 3 production-scoped |
| **§6 `ASSET-RULE-002` (new)** | Instrument classification gate |
| **§7 `CFG-RULE-004` (new)** | Production activation control |
| **§7 `CFG-RULE-005` (new)** | Non-production capability control |
| §25 | 24 prohibited behaviours added; two v1.2 entries restated for scope |
| §26 | 26 error codes added; three error-code rules. **`EXCHANGE_MODULE_LOCKED` retained** |
| §27 | Test requirements 11–13 added |
| §28 | `LIC` and `QTE/FX/ASSET` module mappings updated for the 37-module set |
| §29 | Capability state model parameters added |
| §30 | Open items 26–35 |

## 3. `LIC-RULE-002`: what changed and why it is a strengthening

v1.2's rule carried three defects:

| Defect | v1.3 |
|---|---|
| Heading said *"locked until Exchange approval and documentation update"*, and rules 3, 4 and 6 conditioned the lock on an approval — although Doc 00 §6 classifies these as **standing prohibitions no approval lifts** | Retitled **permanent, every environment**. Rule 3 states there is no approval that grants them and that lifting one would require a different licence basis |
| Rule 1 — *"No active route may call these modules"* — was unconditional and environment-blind, blocking the securities Exchange in development exactly as in production (`STR-03` L-45) | Rule 1 is scoped to **MB-domain** services and remains unconditional for them in all five environments. The Exchange is a different domain, governed by `LIC-RULE-005` |
| The locked list carried resting limit, stop-limit and GTC/post-only/IOC/FOK order types, after Doc 00 §6 reclassified them (`STR-03` L-46) | Moved to `LIC-RULE-002A` as production-gated. **Post-only and maker/taker remain prohibited** |

**The prohibition set is not reduced.** v1.2 listed eleven items of which three were order types;
v1.3's `LIC-RULE-002` lists ten prohibited capabilities, adding *reaching an Exchange-domain
module from an MB-domain path* — a capability that did not exist to prohibit in v1.2.

## 4. Adversarial checks

| # | Check | Result |
|---|---|---|
| 1 | Does scoping `LIC-RULE-002` rule 1 to MB-domain create a bypass? | **PASS.** `LIC-RULE-005` governs the Exchange domain with its own boundary, its own error codes and a required `EXO-01` module-level invariant. §25 prohibits sharing execution code between `EXE-01` and `EXO-01`. Domain is a compile-time property, never runtime-configurable (Doc 00 §9A constraint 4) |
| 2 | Could an MB module reach the Exchange matching engine? | **PASS.** `LIC-RULE-002` item 10; `LIC-RULE-005`; §25; two dedicated error codes raised as boundary violations with heightened audit |
| 3 | Is the fail-closed spine intact? | **PASS.** `SYS-RULE-001`, `002`, `003` untouched; `SYS-RULE-010` specialises `003` rather than replacing it; §29 keeps `default_deny`, `fail_closed` |
| 4 | Could a capability be activated without approval? | **PASS.** `CFG-RULE-004` — unresolved regulatory basis refuses the request; maker may not be a checker; activation is never a side effect of a flag change or deployment |
| 5 | Could a capability be activated but not deactivated? | **PASS.** `SYS-RULE-008` and `CFG-RULE-004` rule 2 |
| 6 | Could a non-production state reach production? | **PASS.** `SYS-RULE-007`; `CFG-RULE-005` rule 1; §25 |
| 7 | Could a control be stubbed in development? | **PASS.** `SYS-RULE-007A`; §25; §27 test 11 |
| 8 | Could a security instrument reach Spot or OTC? | **PASS.** `ASSET-RULE-002` rule 1, stated as environment-independent and explicitly not affected by the Exchange build unlock |
| 9 | Does production-scoping `ASSET-RULE-001` item 4 weaken it? | **PASS.** Production remains closed; non-production is limited to **synthetic instruments**; `ASSET-RULE-002` rule 1 independently bars securities from MB products everywhere |
| 10 | Could a synthetic classification reach production? | **PASS.** `ASSET-RULE-002` rule 5; §25; dedicated error code |
| 11 | Is any v1.2 rule removed or weakened? | **PASS.** All rule IDs retained. `LIC-RULE-003` principal dealing and `LIC-RULE-004` disclosed fee untouched. `LIC-RULE-002`'s rule 5 on flag leakage retained and extended to five environments |
| 12 | Is `EXCHANGE_MODULE_LOCKED` preserved? | **PASS.** §26 and `LIC-RULE-002` both keep it |
| 13 | Could the two gate codes be confused? | **PASS.** §26 rule 2 forbids substituting `CAPABILITY_PERMANENTLY_PROHIBITED` and `PRODUCTION_ACTIVATION_GATE_CLOSED`; §27 test 13 |
| 14 | Do out-of-scope products gain anything? | **PASS.** `ASSET-RULE-001` unchanged for them; §25 adds an explicit every-environment prohibition |
| 15 | Could order cancellation be blocked? | **PASS.** §25 prohibits blocking cancellation of an unexecuted client order (LFSA-DMB-2025 ¶6.4(i)) |

## 5. Findings raised and corrected

| # | Finding | Correction |
|---|---|---|
| F1 | `LIC-RULE-002` rule 1 blocked the Exchange product in development as in production | Scoped to MB-domain; `LIC-RULE-005` added for the Exchange domain |
| F2 | `LIC-RULE-002`'s "until Exchange approval" framing implied approval could unlock client-to-client matching | Retitled permanent; rule 3 states no approval path exists |
| F3 | `LIC-RULE-002`'s list carried order types already reclassified by Doc 00 §6 | Moved to `LIC-RULE-002A`; post-only and maker/taker retained as prohibited |
| F4 | No rule separated build, environment, activation and eligibility state | `SYS-RULE-006`…`011` |
| F5 | No rule governed production activation, so it would have defaulted to `CFG-RULE-002`'s general config maker-checker | `CFG-RULE-004` with three required checkers |
| F6 | No rule expressed the classification gate, although Doc 00 §12A makes it the gate in front of every product | `ASSET-RULE-002` |
| F7 | §28's module mapping still referenced the `FUT` and `PRD` conceptual groups retired by Module Index v1.3 | Updated to the 37-module implementation codes |
| F8 | Base documents were stale | Corrected |

## 6. Conclusion

**ACCEPT.** `v1.3` is promoted to APPROVED. `v1.2` is superseded prospectively and archived.
**No code, migration, test, seeded identifier, sealed hash or runtime guard is changed.**
