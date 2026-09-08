# SEC-01 Audit Log / Security Monitoring — Phase 3 Independent Security/Compliance Review (Opus, v0.1)

| Item | Detail |
|---|---|
| Module | SEC-01 Audit Log / Security Monitoring (Phase 3 only — internal seal verification, integrity verification run, canonical hash versioning) |
| Artifact | `aix-platform/` — `services/sec1` (`lib/{canonical,seal,integrity,ingest,external-anchor}.ts`, `routes/{seals,integrity}.ts`), migration `009_sec1_integrity_verification`, `sec1_runtime_grants.sql`, on the SEC-01 Phase 0-2 + F1 baseline |
| Reviewer | Principal Fintech Platform Architect (Opus) — independent post-implementation review |
| Scope reviewed | Phase 3 only. Blueprint v1.2. |
| Verification | Own run: `tsc -b` clean; migrations 001→009 apply; 4 grant files apply; **316/316 tests**; grant boundaries reproduced directly under each role; **one High finding (P3-F1) reproduced empirically** against the live app + DB. |

---

## 1. Verdict

**DO NOT ACCEPT (yet).** One **High-severity functional defect (P3-F1)** in Phase 3's *primary* deliverable — the integrity-verification run reports **untampered events as tampered** whenever `occurred_at_utc` is not in JavaScript `Date.toISOString()` millisecond form, **including the exact timestamp format in the blueprint's own API sample** (`"2026-01-01T00:00:00Z"`) and Postgres's native microsecond precision. The entire 316-test suite masks this because every test uses `new Date().toISOString()` for both input and reconstruction.

This is not a peripheral hardening gap or a condition to clear before the next module (the disposition IAM-02/Phase-0-2 F-findings got). It is the headline feature of Phase 3 returning **wrong answers on common real inputs, right now**, with the consumer live. Everything *else* in Phase 3 is sound — the fix is localized (one field's representation normalization) — so once P3-F1 is fixed and re-verified with a regression test covering non-`toISOString` formats, re-acceptance should be fast. But as it stands, the integrity-verification control cannot be accepted as a baseline.

## 2. Verification summary

- `npx node-pg-migrate up` — migrations 001→009 apply clean (009 additive; `canonical_format_version ADD COLUMN … DEFAULT 1` then `SET DEFAULT 2`, backfilling existing rows to v1 exactly as intended).
- 4 grant files apply; `npx tsc -b` exit 0; `npx vitest run` → **27 files, 316 tests, 0 failures** (278 baseline unregressed + 38 new).
- **Runtime-role verification (reproduced directly via `psql SET ROLE`):** `role_sec1_runtime` can `UPDATE` only `verification_status` on `audit_seal_batch` (`seal_method`/`external_anchor_ref`/`trusted_timestamp_ref` all denied); `audit_event` UPDATE/DELETE denied (append-only holds); `integrity_verification_run` is SELECT/INSERT only (UPDATE/DELETE denied); `role_iam_runtime`/`role_iam2_runtime` denied on `sec1.*` entirely (no leak from the Phase 3 grants). Tests connect as `role_sec1_runtime` via a real LOGIN role, not superuser-only.
- **P3-F1 reproduced empirically** (own probe, live app + fresh DB) — see §9.

## 3. Canonical format version status — SOUND (except as consumed by P3-F1)

- `canonical_format_version` persisted; named constants (`CANONICAL_FORMAT_VERSION_V1/V2`, `CURRENT_…`) in `canonical.ts`, no bare literals.
- **The versioning design is correct and elegant:** versioning lives entirely in *which fields the caller populates* on `CanonicalEventFields`, relying on `canonicalJson`'s existing undefined-key filtering, so `computeEventHash` itself is unchanged — a v1 reconstruction (fields omitted) is byte-identical to the pre-Phase-3 formula. I proved this directly: `canonicalJson` output for omitted vs. explicit-`undefined` `classification`/`retention_class` is identical; v1 and v2 hashes differ once populated; a simulated legacy v1 row (with `classification`/`retention_class` in the DB but excluded from its original hash) verifies clean; a v2 row verifies clean; tampering `classification` on a v2 row is caught (`fail`, `mismatch_count=1`).
- **However**, the same reconstruct-from-stored-row path that the versioning model relies on carries P3-F1 for `occurred_at_utc` (§9). The versioning logic is right; a *different* field's representation handling is wrong.
- The F1 (`event_category`) fix from the prior review remains correct and is unaffected.

## 4. Seal verification status — SOUND, and correctly immune to P3-F1

- `verifySealBatch` recomputes `batch_hash` from the stored `event_hash` values over the seal's own recorded range using the exact concatenation/sha256 method `sealBatch` uses; clean range → `valid`, tampered range → `failed` (verified).
- Writes **only** `verification_status` — the three anchor columns are not in the UPDATE's write set, and the column-level grant enforces the same at the DB layer (belt-and-braces). `production_authoritative: false` is unconditional this phase; no external-anchor code path exists to ever make it `true`. Good — no fake WORM/TSA authority.
- **Correctly immune to P3-F1:** seal verification compares stored `event_hash` values and never recomputes an event hash from canonical fields, so the `occurred_at_utc` representation issue cannot affect it. (Scope clarification, not a defect: seal verification therefore proves only "the set of stored `event_hash`es in this range is unchanged," not "each event's content matches its hash" — the latter is integrity-run's job, and both are defeatable by a full-DB-write adversary who recomputes hashes. That is precisely why the blueprint mandates external anchoring and this phase honestly marks internal seals non-authoritative.)

## 5. Integrity verification run status — ARCHITECTURALLY SOUND, FUNCTIONALLY BROKEN BY P3-F1

- Reads the range ordered by `sequence_no`, reconstructs `CanonicalEventFields` per row using **each row's own** `canonical_format_version` (a mixed v1/v2 range is handled correctly — verified), calls the pure `verifyChainSegment`, persists one `integrity_verification_run` row (`result`, `gap_count`, `mismatch_count`, `findings` with exact sequence numbers), and never mutates `audit_event` (verified read-only). The wiring is exactly right.
- **But P3-F1 makes it report false `fail`/`hashMismatch` on legitimate events** whose `occurred_at_utc` representation doesn't survive the DB round-trip identically. Since this is the control's entire purpose, the control is currently unusable on real data. See §9.

## 6. External anchor stub status — SOUND

- `lib/external-anchor.ts` is interface-only: no implementation, no `NullAnchorProvider`, no default export. The single other mention of "external-anchor" in the tree (`seal.ts`) is a doc-comment reference, not an import — confirmed directly. No fake anchor value can be produced. The static boundary test enforces this. Exactly as scoped.

## 7. Grants / append-only status — SOUND

- Column-level `GRANT UPDATE (verification_status) ON sec1.audit_seal_batch` is the right, narrowest mechanism and works (verified: `verification_status` updatable, other columns denied). `integrity_verification_run` SELECT/INSERT only. `audit_event` append-only intact. No leak to other module roles. (Minor: the grants file's original Phase 0-2 comment block on `audit_seal_batch`, lines 27-31, still says "nothing this stage ever updates … a seal batch row," now superseded by the Phase 3 grant added later in the same file — cosmetic staleness, L3 below.)

## 8. Out-of-scope / licence posture — CLEAN

- No scheduler/cron wiring (the one "cron" grep hit is a doc comment); no real WORM/object-lock; no real TSA; no monitoring/alert lifecycle; no search/export; no expected-event reconciliation; no incident break-glass; no audit correction; no retention/legal hold; no business modules; no Exchange/order-book/matching-engine/market-making/principal-dealing/spread-markup. Boot-time `assertNoExchangeRuntime` guard covers the two new routes. Import boundary (F3(c)) intact.

## 9. Findings ranked by severity

### P3-F1 — High — integrity verification false-positives on real `occurred_at_utc` formats (must fix before acceptance)

`lib/ingest.ts` binds the caller's **raw** `occurred_at_utc` string into the canonical hash (`buildCanonicalFields`: `occurred_at_utc: input.occurred_at_utc`), but the column is `timestamptz`, so Postgres **normalizes** the stored value. `lib/integrity.ts::runIntegrityVerification` reconstructs the canonical fields from the stored row via `row.occurred_at_utc.toISOString()` — the *normalized* representation, not the raw string that was hashed. When the two differ, the recomputed `event_hash` differs from the stored one and the row is reported as a **hash mismatch (tamper)** though it is untampered. This is the identical class as the already-fixed F1 (`event_category`), in a different field — and now **live**, because Phase 3 built the reconstruction consumer that Phase 0-2 only had in test code.

**Reproduced empirically (own probe, live app + fresh DB):**
| Caller `occurred_at_utc` | DB round-trip (`toISOString()`) | Integrity result |
|---|---|---|
| `2026-07-12T17:04:49.691Z` (`new Date().toISOString()` — what every test uses) | identical | **pass** |
| `2026-01-01T00:00:00Z` (**the blueprint's own `04_API_Specification` sample format**) | `2026-01-01T00:00:00.000Z` | **FALSE fail, mismatch_count=1** |
| `2026-01-01T00:00:00+00:00` | `2026-01-01T00:00:00.000Z` | **FALSE fail** |
| `2026-01-01T00:00:00.123456Z` (Postgres-native microsecond precision) | `2026-01-01T00:00:00.123Z` | **FALSE fail** |

**Why the 316-test suite is green:** every test uses `new Date().toISOString()` for the ingested value *and* `.toISOString()` for reconstruction, so input format always coincidentally equals reconstruction format. The divergence is structurally invisible to the suite. Real callers (IAM-01/IAM-02/FND-01, or anything following the API sample) will not universally emit JS-millisecond ISO strings.

**Why it blocks acceptance:** integrity verification is Phase 3's central control. As built, it raises Critical `hashMismatch` on legitimate events for the most common timestamp representations, including the blueprint's own sample — making it worse than absent (an alarm that fires constantly trains operators to ignore it, masking genuine tampering).

**Fix (localized — pick one representation and use it for BOTH hash and reconstruction, the same discipline as the F1 fix):** either (a) at ingest, normalize `occurred_at_utc` to a single canonical string (e.g. round-trip through `new Date(input.occurred_at_utc).toISOString()`) and hash *that* normalized value — so the hash binds exactly what the DB will round-trip back; or (b) hash the DB-normalized value read back after insert. Option (a) is cleaner (no extra read; the stored `timestamptz` and the hashed string agree by construction). Note the microsecond case: `timestamptz` holds microseconds but JS `Date`/`toISOString()` only holds milliseconds, so option (a) must also ensure the *stored* column cannot retain sub-millisecond precision the hash can't reproduce (store the normalized millisecond value, or accept and document truncation). **Add regression tests that ingest with non-`toISOString` formats** (`…Z` without millis, `+00:00` offset, microsecond precision) and assert integrity verification returns `pass`. Also audit `metadata_redacted` (jsonb) for the same round-trip-normalization risk (number/whitespace canonicalization by `jsonb`), and consider `source_emission_sequence` beyond `Number.MAX_SAFE_INTEGER` — both lower-likelihood variants of the same "hash a representation the DB won't return identically" class; at minimum add a note/test.

### P3-L1 — Low — required `Idempotency-Key` provides no idempotency on `verify-range`

`routes/integrity.ts` and `routes/seals.ts` require an `Idempotency-Key` but ignore `beginIdempotent`'s return (same pattern as Phase 2). For seal-verify this is harmless (re-running re-verifies, no new rows). For **integrity `verify-range`, a retry with the same key + body creates a *second* `integrity_verification_run` row** (fresh `randomUUID` each call; no business-level dedup exists to save it, unlike Phase 2 ingestion's `(source_module, event_id)`). So the classic idempotency use case — client retries after a network timeout — silently produces duplicate run records instead of returning the original. Not a security issue (append-only evidence; data is correct), but the contract is misleading. Recommend either honoring the duplicate short-circuit (return the prior `verification_id`) or dropping the requirement for these read-mostly operational endpoints and documenting why.

### P3-L2 — Low — partial-range integrity verification has a first-row inbound-link blind spot

`verifyChainSegment` deliberately does not check the first in-range row's `previous_hash` against anything (it can't, mid-stream). Content/`previous_hash` tampering on that first row is still caught via the hash recompute, but a *self-consistent* rewrite of a single-row range starting mid-stream would not be. Mitigated by verifying from `sequence_no = 1`, or by having `runIntegrityVerification` load the row immediately before `from_sequence_no` to seed the link check. Worth addressing when the verification job is productionized.

### P3-L3 — Informational — stale grant-file comment

`sec1_runtime_grants.sql` lines 27-31 (Phase 0-2) still assert seal-batch rows are never updated; superseded by the Phase 3 column-level UPDATE grant added lower in the same file. Cosmetic.

## 10. Go / no-go for SEC-01 Phase 4

**NO-GO until P3-F1 is fixed and re-verified.** Phase 4 (or any downstream reliance on integrity verification) must not build on a control that mis-reports tampering. Sequence: fix P3-F1 (localized) + add non-`toISOString` regression tests → short re-review to confirm closure → then Phase 4. The rest of Phase 3 (versioning model, seal verification, grants, external-anchor discipline, licence posture) is sound and does not need rework.

## 11. Conditions to carry forward

- **P3-F1 (must-fix, blocking):** normalize `occurred_at_utc` so the hashed and reconstructed representations are identical by construction; add regression tests for `…Z`-no-millis, `+00:00`, and microsecond inputs; audit `metadata_redacted` jsonb and large `source_emission_sequence` for the same class.
- **P3-L1:** make `verify-range` idempotency real or drop the requirement.
- **P3-L2:** close the partial-range first-row inbound-link blind spot when the verification job is productionized.
- **P3-L3:** refresh the stale grant-file comment.
- **Carried from prior reviews (unchanged):** L1-classification/retention_class hash-binding is now *done* (Phase 3); L2 metadata value-scanning still deferred (source-side discipline primary); external WORM/TSA, scheduler wiring, monitoring/alerts, evidence export, IAM-02 `sec1.*` registration, interim handoff, correction, retention/legal-hold, recovery, break-glass — all correctly still deferred.
- **Doc-sync note (non-blocking):** `aix-platform-docs/MODULE_STATUS.md` / `PROJECT_HANDOVER.md` still describe SEC-01 as "not yet Opus-reviewed" and pre-Phase-3; they should be reconciled with the current state in a docs pass.

*No code was written in this review. P3-F1 was reproduced against a disposable database and it was torn down.*
