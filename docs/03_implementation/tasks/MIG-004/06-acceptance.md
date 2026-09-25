# 06 Acceptance — MIG-004

> This is the human acceptance record. It is distinct from the review (`04-review.md`), which recommended acceptance but accepted nothing.

- **Final decision:** ACCEPTED — with controlled carry-forwards
- **Accepted commit:** `5a4f8728684f1f8ee34b6b56b48eb49780aa5263` (evidence recorded at `c3ac87d`)
- **Accepted by (human):** Aiman, 2026-09-25T18:54:44Z
- **Reviewer / model / effort:** independent reviewer / GPT / repository inspection (`04-review.md`, round 1: ACCEPT WITH CONTROLLED CARRY-FORWARDS)
- **Acceptance evidence:** `03-evidence.md` (fresh-DB PostgreSQL validation of migration 071, the private-DB decision matrix, and full-suite regression compared like-for-like against baseline `bdc5dfc`); `04-review.md` (deviation adjudication and regression adjudication).

## Scope accepted
Live `ENVIRONMENT_AVAILABILITY` (Doc 00 §1.D state 2) via `cfg1.feature.environment_scope` and CFG-01 decision-chain step 4, exactly as approved in `01-plan.md` under HD-1…HD-4 and `DEC-014`, with the three deviations in `04-review.md` accepted as improvements-in-intent, not departures from it. No capability enabled; no `environment_scope` write path; `PRODUCTION_ACTIVATION_STATE` (state 3) remains unbuilt and canonical PRODUCTION remains held closed by `production_activation_absent`.

## Findings closed
- `CFG-FIND-001` — **CLOSED** at commit `5a4f872` (register: `docs/OPEN_FINDINGS.md`).
- `FND-FIND-013` — **PARTIALLY CLOSED**: the CFG-01 portion is closed at commit `5a4f872`. The row remains **OPEN** for the WLT-01 portion (its own environment vocabulary, Proof-of-Control message/domain values, migrations 001/053).

## Findings NOT closed (unaffected by this acceptance)
- `CFG-FIND-002` — OPEN / MEDIUM, unchanged. Deliberately not remediated by MIG-004 (HD-3); its own coherent remediation task remains a prerequisite before UAT/DEMO use of any environment-gated capability, or before a real `environment_scope` write path is introduced.
- `FND-FIND-012`, `WLT-FIND-016` — unchanged.

## Accepted observations (explicitly acknowledged by the human)
- **MIG-004-O1** — a pre-existing cross-file test-isolation race between `clt1-db.test.ts` (unscoped `DELETE FROM clt1.client_profile`) and `clt1-principal-membership-route.test.ts` (concurrent inserts), reproduced independently on the untouched baseline. The independent review ruled it `REVIEW REQUIRED / SEPARATE CLT TEST-HARNESS TRIAGE`. Accepted knowingly: it is not caused by MIG-004, does not affect any CFG-01 or environment-availability behaviour, and is not fixed here. A later, narrowly-scoped CLT-01 test-only task should replace the unscoped cleanup with ownership/prefix-scoped cleanup.
- **MIG-004-O2** — after migration 071, every `environment_scope` entry defaults `DISABLED` and no write path exists to change one, so no real capability becomes more available anywhere; canonical PRODUCTION is additionally held closed. Ruled `ACCEPTED DESIGN CONSEQUENCE / NOT A DEFECT` — the intended fail-closed posture, not an omission.

## Carry-forward findings (LOW / MEDIUM)
- `CFG-FIND-002` (MEDIUM) — see above; own remediation task, gates UAT/DEMO of environment-gated capabilities.
- `FND-FIND-013` (LOW, WLT-01 portion) — WLT-01's own task.
- `FND-FIND-012` (LOW) — unrelated, FND-01's own task.

## MIG-005 next-phase status
`MIG-004`'s acceptance closes the `MIG-005` review's stated gate condition on `CFG-FIND-001`. No further Phase-A migration is authorised by this acceptance; the next controlled turn is decided separately.
