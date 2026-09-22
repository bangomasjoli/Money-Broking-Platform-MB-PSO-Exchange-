---
document_id: REV-ARC-04-v1.3
title: Role & Permission Matrix v1.3 — Promotion Review
version: 1.0
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Controlled-document promotion evidence
owner: Unassigned
effective_date: 2026-09-22
last_reviewed: 2026-09-22
supersedes: none
baseline_commit: 6d58ceb
---

# Role & Permission Matrix v1.3 — Promotion Review

**Verdict: ACCEPT.**

**Base documents:** Doc 00 v1.5, Charter v1.5, Module Index v1.4, SRS v1.3.
**Governance basis:** `DEC-013` clause 11. **Derivation:** `v1.2`, controlled revision. `v1.2` archived intact.

## 1. The owner requirement, checked directly

> *"Permissions must never by themselves activate a production-regulated capability. User has
> Exchange Trader permission does NOT mean Exchange is production enabled. Access requires
> permission AND environment capability AND product activation AND asset/instrument eligibility
> AND regulatory production gate."*

**Satisfied in §3.7**, as a numbered permission-model principle alongside default deny, backend
source of truth, least privilege and no self-approval — not as a footnote. The conjunctive rule
is stated as a formula. Six binding rules follow, including that `CFG-01` owns capability
evaluation and `IAM-02` owns permission evaluation, that neither may be implemented inside the
other, and that a capability denial must not be reported as a permission denial. §19A gives
production activation its own permission, its own checker set and its own evidence. §29 tests
30–32 verify both directions and the denial attribution.

## 2. Changes

| § | Change |
|---|---|
| Front matter, banner, Document Control | Version; base documents corrected from stale v1.3/v1.2 references |
| **§3.7 (new)** | A permission never activates a capability — the conjunctive access rule |
| **§3.8 (new)** | Environment scope of permissions |
| §5.1 | Eleven client-side roles added: trader, finance, compliance contact, API operator, merchant ×3, issuer ×2, investor |
| §5.2 | Eight staff roles added: surveillance, market operations, listing, instrument classifier, RWA ops, Pay ops, capability activation approver |
| **§5.2A (new)** | Staff role scoping narrows only |
| **§5.4 (new)** | Domain roles and the capability boundary |
| §19 | Five action rows added; rules 2, 3, 7, 8, 9 restated or added |
| **§19A (new)** | Capability activation permissions |
| §20 | Break-glass rule 9 widened |
| §22 | Replaced with 22.1 permanent / 22.2 production-gated / 22.3 out of scope |
| §27 | Twenty-one prohibited permission codes added; four rules added |
| §28 | Seven module-group rows added; the "Future Exchange" row replaced |
| §29 | Test 19 widened; tests 29–40 added |
| §30 | Open items 17–23 |

## 3. Adversarial checks

| # | Check | Result |
|---|---|---|
| 1 | Could any role enable MB Spot internal matching? | **PASS.** §22.1 all-`N` including `SUPER_ADMIN`; §19 rule 2 states there is no approval path; §27 adds `ENABLE_MB_SPOT_INTERNAL_MATCHING` and `ENABLE_MB_SPOT_ORDER_BOOK`; §20 rule 9 blocks break-glass |
| 2 | Could a role reach an Exchange module from an MB path? | **PASS.** §22.1 final row; §5.4 binding rule; §27 `CALL_EXCHANGE_DOMAIN_FROM_MB_CONTEXT` and `EXECUTE_MB_ORDER_ON_EXCHANGE_MATCHING_ENGINE`; §29 test 37 |
| 3 | Does adding Exchange roles imply Exchange is enabled? | **PASS.** §3.7 rule 1; §22.2's production column on every row; §5.4; §29 test 29 |
| 4 | Could activation be achieved by a permission grant? | **PASS.** §3.7 rule 3; §19A requires three checkers and evidenced §21 conditions |
| 5 | Could break-glass activate a capability? | **PASS.** §19A rule 6; §20 rule 9 |
| 6 | Is any v1.2 role, permission, maker-checker pairing or SoD conflict removed? | **PASS.** All retained; §22.1 preserves every `N` from v1.2's matrix; §27's list is extended only |
| 7 | Is v1.2's "until Exchange approval" override removed correctly? | **PASS.** §22.1 rule 4 states there is no approval that grants it, consistent with Doc 00 §6's STANDING classification. This is a **strengthening**, not a relaxation |
| 8 | Could a non-production grant reach production? | **PASS.** §3.8 rule 2; §19 rule 8; §29 test 36 |
| 9 | Is any control relaxed in non-production? | **PASS.** §3.8 rule 3 requires identical application in all five; §29 test 40 |
| 10 | Could a capability be activated but impossible to deactivate? | **PASS.** §19A rule 4 — deactivation never requires a full checker set; §29 test 34 |
| 11 | Could an instrument be reclassified unilaterally? | **PASS.** §19 rule 9; `INSTRUMENT_CLASSIFIER` never self-approves |
| 12 | Do out-of-scope products gain any role? | **PASS.** §22.3; §27 adds five `ENABLE_*` prohibitions |
| 13 | Does a scoped grant widen access? | **PASS.** §5.2A; §29 test 39 |

## 4. Findings raised and corrected

| # | Finding | Correction |
|---|---|---|
| F1 | §22 gave the securities Exchange **no roles at all** (`STR-03` L-43) | §5.2 adds four Exchange-relevant staff roles; §22.2 maps them with activation held separate |
| F2 | §22 rule 4's "until Exchange approval is granted" implied approval would unlock client-to-client matching | §22.1 rule 4 states there is no approval path, matching Doc 00 §6 |
| F3 | §22's matrix listed resting limit, stop-limit and GTC/post-only/IOC/FOK as locked, after Doc 00 §6 reclassified them | Moved to §22.2 as production-gated order types; **post-only and maker/taker stay prohibited** in §22.1 |
| F4 | Base documents were stale (`00_v1.3`, `01_v1.3`, `03_v1.2`, `02_v1.2`) | Corrected |
| F5 | No permission existed for production capability activation, so it would have defaulted to a feature-flag change | §19A gives it its own maker, three checkers and evidence |
| F6 | §20 rule 9's break-glass carve-out named only "future-locked exchange restrictions" | Widened to §22.1 and to every production activation gate |

## 5. Conclusion

**ACCEPT.** `v1.3` is promoted to APPROVED. `v1.2` is superseded prospectively and archived.
**No code, migration, test, seeded identifier, sealed hash or runtime guard is changed.**
