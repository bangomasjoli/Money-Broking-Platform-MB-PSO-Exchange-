# 04 Review — MIG-004 (round 1)

- **Reviewer:** independent reviewer / GPT / repository inspection (external to the implementing session)
- **Decision:** ACCEPT WITH CONTROLLED CARRY-FORWARDS
- **Human approval required:** true
- **Evidence reviewed:** `03-evidence.md`; commit `5a4f872` (implementation) and `c3ac87d` (evidence); the pushed diff `bdc5dfc..5a4f872` (16 files, +1570/−126); the approved plan `01-plan.md`, including HD-1…HD-4 and the corrected decision precedence recorded there.

## Findings
| ID | Severity | Category | Description | Evidence | Recommended action |
|---|---|---|---|---|---|
| none | BLOCKER 0 · HIGH 0 · MEDIUM 0 · LOW 0 | | The reviewer raised no new findings against the implementation. Three deliberate deviations from the plan's literal text were identified and adjudicated (below); none is a defect. | | |

## Deviations from the approved plan — adjudicated

**1. Migration-level grant hardening (`071_cfg1_environment_scope.cjs`).**
Beyond plan §12's SQL, the migration itself performs the guarded `REVOKE INSERT ON cfg1.feature` + column-scoped `GRANT INSERT` (excluding `environment_scope`) whenever `role_cfg1_runtime` already exists, mirroring migration 070's precedent.
**Ruling: ACCEPT.** This makes the approved no-write-path invariant deployment-order-independent. Under the "grants applied before the migration" ordering, the pre-existing table-level `INSERT` privilege would otherwise extend to the new column — Postgres grants a table-level INSERT to every column, including ones added later. `03-evidence.md`'s migration-071 regression test D proves the block is load-bearing (removing it lets the runtime role write `environment_scope`). This implements the plan's own grant *intent* (§9: "the runtime role therefore cannot set or change `environment_scope` at all") more safely than the literal SQL alone would, under an ordering the plan itself flags as a real deployment sequence.

**2. Verify-audit revocation attribution (`decision-token.ts`, `routes/features.ts`).**
Plan §5 point 4 said the rejected-token audit's `reason_code` would carry `environment_mismatch`. The implementation instead keeps `reason_code` as the existing external error code (`CFG1_DECISION_BINDING_MISMATCH`, unchanged for every rejection reason) and adds the specific internal cause — `environment_mismatch`, `binding_mismatch`, or `environment_unavailable` — as `metadata.revoked_reason`.
**Ruling: ACCEPT.** This preserves the pre-existing, load-bearing meaning of `reason_code` across every other revocation path (kill-switch, config-changed, ordinary binding mismatch) rather than overloading one field with two different vocabularies. The same fact — which specific check caused the revocation — is fully recorded and independently queryable in `metadata.revoked_reason`; nothing is lost, only relocated to the field that was already carrying comparable detail (`decision_id`, `environment`, `asserted_environment`). Not a defect; do not revert.

**3. FND rate-limit ordering test (`fnd-rate-limit-policy-privilege-ordering.test.ts`).**
The test asserted migration `070` was the platform-wide latest migration — a global-head pin that any later migration, from any module, breaks by construction (the same anti-pattern already fixed once for CLT-01, `CLT-FIND-004`, commit `e6cf4c7`). MIG-004's migration 071 tripped it. The fix replaces the pin with a presence check scoped to `070` itself, which is the actual FND-01 control the test owns.
**Ruling: ACCEPT.** Test-only; zero FND-01 runtime behaviour changed; the fix applies an established, already-accepted repository pattern to a second occurrence of the identical defect class.

## Regression adjudication
**BASELINE-EQUIVALENT PRE-EXISTING CLT TEST-ISOLATION FAILURES. ZERO DIFFERENTIAL MIG-004 FAILURES.**

| Run | Total | Pass | Fail | Skip |
|---|---|---|---|---|
| MIG-004, fresh DB, run 1 | 5423 | 5368 | 2 | 53 |
| MIG-004, fresh DB, run 3 | 5423 | 5368 | 2 | 53 |
| Baseline `bdc5dfc`, fresh DB, run a | 5291 | 5233 | 5 | 53 |
| Baseline `bdc5dfc`, fresh DB, run b | 5291 | 5236 | 2 | 53 |

Every failure in every run, on both sides, is in `tests/integration/clt1-db.test.ts` and/or `tests/integration/clt1-principal-membership-route.test.ts`, and the specific failing test names vary run to run — the signature of a race, not a deterministic break. Source inspection confirms the mechanism: `clt1-db.test.ts` runs an **unscoped** `DELETE FROM clt1.client_profile` in a cleanup hook on the shared test database, while `clt1-principal-membership-route.test.ts` concurrently inserts its own prefixed rows into the same table. This is a pre-existing cross-file test-harness isolation defect, unrelated to CFG-01 and to environment availability. The full suite passes 0 new tests fewer and 132 new tests were added, all passing across every run.

**The full suite is not "completely green"** — it carries this pre-existing flake independent of MIG-004, and that should not be described otherwise.

## MIG-004-O1 — pre-existing CLT test-isolation race
**Disposition: REVIEW REQUIRED / SEPARATE CLT TEST-HARNESS TRIAGE.** Not fixed here; does not block MIG-004 acceptance. No new finding ID is registered in this turn — `tasks/README.md`'s "What IS stored" convention governs implementation-record observations, and OPEN_FINDINGS.md registration is a separate governed act the repository does not require to happen automatically inside an acceptance turn. A later, narrowly-scoped CLT-01 task should replace the global `DELETE FROM clt1.client_profile` with ownership/prefix-scoped cleanup (mirroring `clt1-db.test.ts`'s own `WHERE client_id LIKE '${CLIENT_PREFIX}%'` pattern already used elsewhere in that file) — test-only, no CLT-01 production behaviour change.

## MIG-004-O2 — universal deny after migration 071
**Disposition: ACCEPTED DESIGN CONSEQUENCE / NOT A DEFECT.** After migration 071, every `environment_scope` entry defaults `DISABLED` and MIG-004 deliberately ships no write path to change one, so no real capability becomes more available in any environment than it was before. Canonical PRODUCTION is additionally held closed by `production_activation_absent` regardless. This is the intended fail-closed posture (Doc 00 §1.D rule 5, `SYS-RULE-010`), not an omission.

## Findings disposition
- **`CFG-FIND-001` — CLOSE.** Closure basis, each independently proven on a real PostgreSQL database (`03-evidence.md`): CFG-01's own startup-validated `ENVIRONMENT` is the sole authority for evaluation, hashing, logging and token binding; the caller-supplied value is reduced to an assertion; a mismatch denies (`environment_mismatch`) and is audited Critical; the decision log and issued token both bind CFG-01's own environment, never the caller's; a token issued under one environment cannot verify under another; a `prod`-configured CFG-01 cannot be made to evaluate as `dev`/`qa`/`uat`/`demo` by caller assertion (`environment_not_available` when the own PRODUCTION entry disagrees). The trust boundary the finding named no longer exists.
- **`FND-FIND-013` — row stays OPEN; CFG-01 portion CLOSED by MIG-004.** `demo` is accepted by the CFG-01 evaluate schema (proven), sourced from the shared foundation vocabulary with no local duplicate. The WLT-01 portion (its own environment list, the Proof-of-Control message/domain vocabulary, and migrations 001/053's CHECK constraints) is untouched and unclosed, exactly as the approved plan scoped it (WLT-01 changes were explicitly out of MIG-004's scope).
- **`CFG-FIND-002` — unchanged, OPEN / MEDIUM.** MIG-004 deliberately does not remediate it (the seal-hash and decision-time-verification extension is reserved for its own coherent remediation task, per HD-3). Trigger unchanged: before UAT/DEMO use of any environment-gated capability, or before a real `environment_scope` write path is introduced.
- **`FND-FIND-012`, `WLT-FIND-016`** — unchanged; out of MIG-004's scope.

## Escalation decision
none

## Rationale
The implementation matches the approved plan's contract exactly where the plan was prescriptive (schema, CHECK, decision precedence, reason codes, PRODUCTION hold, seal-hash non-extension) and improves on it in three places without changing its intent, each independently justified above. Every mandatory DB-backed proof point in the original task brief has direct evidence from a real PostgreSQL 17 cluster: clean-DB migration, pre-existing-row backfill, malformed-scope rejection (23514/23502), grant-ordering independence, down/up round trip, the full decision matrix across all six deployment identifiers, the trust-boundary and cross-environment-token proofs, and the permanent-prohibition/kill-switch/current_state precedence checks. The regression comparison is apples-to-apples (fresh DB, clean tree, same command, both sides) and shows the change introduces no new failure; the flake it surfaces is independently reproducible on the untouched baseline. No capability was enabled and no production-readiness claim is made or implied.

> This review is a judgement over the evidence and **does not by itself constitute acceptance**. Human approval is recorded in `06-acceptance.md`.
