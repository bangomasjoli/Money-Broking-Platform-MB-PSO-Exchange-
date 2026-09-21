---
document_id: REV-ARC-00-v1.5
title: Doc 00 v1.5 — Promotion Review
version: 1.0
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Controlled-document promotion evidence
owner: Unassigned
effective_date: 2026-09-22
last_reviewed: 2026-09-22
supersedes: none
baseline_commit: 056a10f
---

# Doc 00 v1.5 — Promotion Review

**Verdict: ACCEPT.**

**Basis of change:** `DEC-013` (ACCEPTED) — build-unlocked / production-gated capability model.
**Evidence base:** `STR-03` — repository-wide lock review, 72 classified locks, `MIG-001`…`MIG-010`.
**Derivation:** `v1.4` by controlled, section-by-section revision. `v1.4` archived intact.

---

## 1. What changed

| § | Change |
|---|---|
| Front matter, banner, Document Control | Version, derivation, integrity note |
| §1.A | The build direction of the architecture/permission rule added |
| §1.B | New item 9 — the ambiguous single `enabled` boolean |
| §1.C | What "locked" means for a securities capability versus an MB capability |
| **§1.D (new)** | Four-state capability model, including §1.D.4 permanent boundary |
| **§1.E (new)** | Five-environment model |
| §2A | AIX Exchange restated as a target capability; new naming rule 2a |
| §2B | AIX Exchange added as a fifth capability alongside the four pillars |
| §6 | Third lock class — BUILD-UNLOCKED / PRODUCTION-GATED. Seven rows added or restated |
| §9.2 | Per-flag class table added above the frozen list |
| §9A | `securities.token_trading` and `exchange.*` compatibility meanings restated; `securities_market.*` reserved; `MIG-001` constraints |
| §10.1 rule 2 | Production-scoped; Model C reaffirmed as environment-independent |
| §12A | Gate applies in every environment; synthetic/test instrument requirement |
| §12B.2 | Route table gains build and production columns |
| §12C | Software development row added |
| §12D | Full Pay target capability table |
| **§12E (new)** | AIX Exchange — securities market capability |
| §17 | Stale "v1.3" base corrected; re-baseline sequence stated |
| §20.1–§20.5 | Matrices rebuilt with Build / Non-prod env columns; `NOT DESIGNED` abolished as a status |
| **§20.6 (new)** | Out-of-scope products — no build, no environment, no gate |
| §21 | Retitled and production-scoped; condition 14 added; rule 7 added |
| **§21A (new)** | Eight binding rules on build/environment/activation/eligibility |
| §23 | `R6-Q1` added; build/production clarification |
| §25 | Downstream register rewritten; `MIG-001`…`MIG-010` registered |
| §26 | Promotion record and non-approval list |

---

## 2. Adversarial checks

| # | Check | Result |
|---|---|---|
| 1 | Does any change unlock Model C in any environment? | **PASS.** §1.D.4 lists all six MB-boundary capabilities as `NOT_SPECIFIED` / `PROHIBITED_PERMANENT` / `DISABLED in all five`. §7.7 is untouched. §12E.4 states five binding rules keeping the Exchange matching engine out of the MB path. §20.1 carries three **NO BUILD — permanently** rows |
| 2 | Could "unlock Exchange development" be read as permission to build an MB matching engine? | **PASS.** Stated and negated in four places: §1.D.4, §2A rule 2a, §12E.1, §12E.4 rule 5 |
| 3 | Does any change claim a regulatory approval AIX does not hold? | **PASS.** §1.C states the licence position is unchanged. §12C separates development authorisation from regulatory activation. §26 lists what is not approved |
| 4 | Is any fail-closed control weakened? | **PASS.** §9.3 rules 11–13 untouched. §21's thirteen conditions preserved verbatim and one added. §21A rule 5 extends fail-closed to all four states. §21A rule 7 forbids relaxing controls in non-production |
| 5 | Is any seeded identifier renamed or deleted? | **PASS.** None. §9A freezes `exchange.*` permanently; `securities.token_trading` keeps its name; `securities_market.*` is *reserved*, not seeded |
| 6 | Is any runtime guard modified or weakened? | **PASS.** `MIG-001` is specified, explicitly not authorised. §9A states the guard remains active and unweakened and every call site stays MB-domain in all five environments |
| 7 | Does the sealed CFG-01 hash remain valid? | **PASS.** §26 prerequisite 4: neither the licence status nor any prohibited-feature row changes, so both hash inputs are unchanged |
| 8 | Is any regulatory open question answered or softened? | **PASS.** §23 preserves all of them and adds `R6-Q1`. Each now holds *production activation* closed, which is the same production effect |
| 9 | Does scope expand into out-of-scope products? | **PASS.** §20.6 records seven product families as NO BUILD / DISABLED in all five / PROHIBITED |
| 10 | Could a DEMO environment become a live production channel? | **PASS.** §1.E rule 1 and the DEMO row require mock/synthetic/non-live execution; `R6-Q1` holds external DEMO exposure closed |
| 11 | Could a permission grant activate a capability? | **PASS.** §21A rule 3 |
| 12 | Could non-production state promote itself to production? | **PASS.** §1.E rule 3, §21A rule 4, §21 condition 14 |
| 13 | Does the asset classification gate survive? | **PASS.** §12A operates in every environment; synthetic classifications fail closed in production and are never promotable |
| 14 | Are historical statements rewritten? | **PASS.** v1.4 archived intact. v1.4-era correction notes retained verbatim; v1.5 changes are marked as such |

---

## 3. Findings raised and corrected before promotion

| # | Finding | Correction |
|---|---|---|
| F1 | §17 instructed the Charter to use "this v1.3 licence scope" — stale since v1.4 | Corrected to v1.5; the full re-baseline sequence stated |
| F2 | §9A's table header still read "Compatibility meaning under v1.4" | Corrected |
| F3 | The five `exchange.*` codes seeded with `applies_until: "until_formal_exchange_licence_approval"` contradict §6's STANDING classification — the seeded data is **weaker** than the document | Recorded as `MIG-006` in §9A and §25.3. Not actioned; no seeded row is touched |
| F4 | §21 rule 3's "regardless of architectural readiness" is the sentence that blocked architecture | Re-scoped to production with the change and its production-neutrality stated explicitly |
| F5 | Reusing `exchange.matching_engine` for the securities Exchange would silently invert a sealed identifier's meaning | Rejected. `exchange.*` frozen permanently; `securities_market.*` reserved (§12E.5, `MIG-007`) |

---

## 4. Conclusion

**ACCEPT.** `v1.5` is promoted to APPROVED / AUTHORITATIVE. `v1.4` is superseded prospectively
and archived at `90_archive/masters/00_Licence_Scope_And_Feature_Lock_v1.4.md`.

**No code, migration, test, seeded identifier, sealed hash or runtime guard is changed.**
