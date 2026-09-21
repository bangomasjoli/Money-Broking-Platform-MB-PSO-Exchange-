---
document_id: REV-ARC-01-v1.5
title: Project Charter v1.5 — Promotion Review
version: 1.0
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Controlled-document promotion evidence
owner: Unassigned
effective_date: 2026-09-22
last_reviewed: 2026-09-22
supersedes: none
baseline_commit: 079d88c
---

# Project Charter v1.5 — Promotion Review

**Verdict: ACCEPT.**

**Base document:** Doc 00 v1.5 (APPROVED). **Governance basis:** `DEC-013`. **Lock evidence:** `STR-03`.
**Derivation:** `v1.4` by controlled, section-by-section revision. `v1.4` archived intact.

## 1. Changes

| § | Change |
|---|---|
| Front matter, banner, Document Control | Version; base document Doc 00 v1.5 |
| §3 | Two lock classes → three (standing / build-unlocked production-gated / product-scope) |
| §4 | Vision restated: the build direction of the architecture-permission rule; AIX Exchange added; objectives 12–13 |
| §6.3 | Retitled **Money Broking Venue Prohibitions — permanent, every environment**. Order types moved out (stale since Doc 00 v1.4 §6) |
| **§6.4 (new)** | Build-unlocked / production-gated scope table |
| **§6.5 (new)** | Out-of-scope products — no build, no environment, no gate |
| §10.1 | Product scope expanded: full Spot capability set, AIX Pay, AIX RWA, AIX Exchange |
| §10.2 | Flat 24-item list split into 10.2A permanent / 10.2B out of product scope / 10.2C production-gated / 10.2D client scope / 10.2E delivery scope |
| §12.6 | Retitled **Prohibited and Gated Modules**; **Market Surveillance removed from the locked list** |
| §12A | Derived from Doc 00 v1.5 and `DEC-013` |
| §12A.4 | AIX Pay build-unlocked; PSO boundary governs production |
| §12A.5 | AIX RWA build-unlocked; classification gate restated as a production gate |
| **§12A.6 (new)** | AIX Exchange — four Exchange modules, RWA secondary-market route, the §12E.4 matching-engine boundary |
| §16.5 | Change-control items 11–13 |
| §26.1 | Four environments → five, with twelve rules |
| §27 | Build priority extended to fifteen steps |

## 2. Findings raised and corrected

| # | Finding | Correction |
|---|---|---|
| F1 | §6.3 items 9–10 locked resting limit / stop-limit / GTC / post-only / maker-taker as exchange order-book behaviour — **stale since Doc 00 v1.4 §6** reclassified order types into §11B (`STR-03` L-28) | Separated. Maker/taker fee behaviour stays prohibited on revenue-model grounds. **No order type is activated** |
| F2 | §12.6 locked **Market Surveillance** as a future module, contradicting Master Module Index v1.3 §13 (`SUR-01`, NEW) and LFSA-DMB-2025 ¶6.4(i), which requires suspicious-order detection (`STR-03` L-34) | Removed from the locked list and stated as a required control in scope |
| F3 | §26.1 listed four environments with no UAT and no DEMO, while the capability model requires five (`STR-03` L-35) | Rewritten with five environments and twelve rules |
| F4 | §10.2 conflated permanent prohibitions, product-scope exclusions, production gates and delivery sequencing in one flat list | Split into five subsections; nothing removed from the platform's prohibitions |
| F5 | §2's "AIX Exchange is reserved terminology" understated a confirmed delivery target after `DEC-013` | Restated as a build target with production activation gated |

## 3. Adversarial checks

| # | Check | Result |
|---|---|---|
| 1 | Does any change unlock Model C in any environment? | **PASS.** §6.3 nine permanent prohibitions; §10.2A nine items; §12.6 six modules that must never exist; §12A.2 Model C row unchanged; §12A.6 four binding boundary rules |
| 2 | Could the Exchange modules be read as an MB matching path? | **PASS.** §12A.6 states the boundary four ways and names every MB module forbidden to call `EXO-01` |
| 3 | Is any governance control weakened? | **PASS.** The v1.4 preservation clause is carried forward and extended by §26.1 rule 10 — no control is relaxed in non-production |
| 4 | Does any change claim an approval AIX lacks? | **PASS.** §12A.6 and §6.4 state production DISABLED pending `R1-Q1b`; §2 states reserving/building grants nothing |
| 5 | Does scope expand into out-of-scope products? | **PASS.** §6.5 and §10.2B |
| 6 | Is the client-type scope preserved? | **PASS.** §10.2D retail onboarding excluded; §8 unchanged |
| 7 | Is the revenue model preserved? | **PASS.** Maker/taker remains prohibited (§6.3, §10.2A item 9); §7.2 unchanged |
| 8 | Are custody and safeguarding models preserved? | **PASS.** §9 unchanged; self-custody prohibition carried into §12A.5 |
| 9 | Could a demo become a live channel? | **PASS.** §26.1 rules 6 and 12 |
| 10 | Are historical statements rewritten? | **PASS.** v1.4 archived intact; every v1.5 change is marked as such |

## 4. Conclusion

**ACCEPT.** `v1.5` is promoted to APPROVED. `v1.4` is superseded prospectively and archived.
**No code, migration, test, seeded identifier, sealed hash or runtime guard is changed.**
