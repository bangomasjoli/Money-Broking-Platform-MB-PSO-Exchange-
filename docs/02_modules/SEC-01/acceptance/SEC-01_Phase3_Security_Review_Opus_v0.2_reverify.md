# SEC-01 Phase 3 — Opus Short Re-Review (v0.2): P3-F1 Closure (+ P3-L1, P3-L3)

| Item | Detail |
|---|---|
| Scope | ONLY the closure of **P3-F1** (must-fix, High) and the two lows closed in the same pass — **P3-L1** and **P3-L3** — from `SEC-01_Phase3_Security_Review_Opus_v0.1.md`. No re-review of the rest of Phase 3 (versioning model, seal verification, external-anchor stub, licence posture), which v0.1 already found sound. |
| Reviewer | Opus — independent post-patch re-verification |
| Method | Full read of the three patched code paths + the similar-field review + fresh disposable Postgres (`tsc -b`, migrations 001→009, all 4 grant files, full suite) + an **independent probe** proving both directions of the fix (post-patch reconstruction matches; pre-patch raw-string hash would NOT have) + direct `psql` grant-boundary reproduction. |
| Verification run | `npx tsc -b` exit 0; fresh `aix_sec1_opusreview_*` DB built/migrated by the reviewer; **325/325 tests, 0 failures**; grant boundaries and append-only posture reproduced under `SET ROLE`; DB dropped, no stray DBs. |

---

## Verdict: P3-F1 is CLOSED. P3-L1 and P3-L3 are CLOSED. The v0.1 blocking condition is cleared.

The must-fix defect from v0.1 is correctly and completely fixed, and the fix is verified to address the real root cause (not merely to make the implementer's own tests pass). **SEC-01 Phase 3 is now an ACCEPTED baseline.** The remaining low, **P3-L2** (partial-range first-row inbound-link blind spot), is unchanged and remains a tracked, non-blocking carry-forward — correctly deferred to when the verification job is productionized, per v0.1's own recommendation. **SEC-01 Phase 4 is now GO** with respect to the integrity-verification control.

---

## P3-F1 — occurred_at_utc hash/reconstruction divergence — CLOSED

The fix applies the exact resolve-once discipline the earlier F1 (`event_category`) fix established. Confirmed by reading the code:

- `occurred_at_utc` is normalized **once** in `ingestAuditEvent` — `new Date(input.occurred_at_utc).toISOString()` (`lib/ingest.ts:187-193`) — and that single `resolvedOccurredAtUtc` value is threaded into **both** the hash (`buildCanonicalFields`, now taking it as an explicit parameter — `:124`, `:143`, `:203-210`) **and** the INSERT's `occurred_at_utc` column (`:252`). There is no second, independent derivation left for the two sides to diverge from — the structural guarantee, not just a coincidence of current values.
- Because the stored value is written as the millisecond-precision `toISOString()` string, and `runIntegrityVerification` reconstructs via `row.occurred_at_utc.toISOString()` (`lib/integrity.ts:176`), the two agree by construction on the DB round-trip. `timestamptz` cannot introduce sub-millisecond precision the hash can't reproduce, because the value written is already millisecond-truncated.
- **Timestamp policy is explicit and sound:** microsecond-precision input is **accepted and truncated to milliseconds** (a normal, legitimate Postgres-native format the control must handle), not rejected. An **unparseable** timestamp fails closed with `SEC1_AUDIT_EVENT_INVALID` (400) (`:188-192`) — previously that error code was defined but unreachable (TypeBox only enforced a 1–64-char string). This satisfies "do not silently accept invalid timestamps" and "do not weaken validation."
- `computeEventHash` is unchanged; existing-row compatibility is preserved (no re-hash, no migration — pre-patch rows keep whatever they hashed).

**Independent empirical proof (reviewer's own probe, live app + fresh DB — not the in-suite tests).** For each caller format I ingested through the real HTTP route, then (a) reconstructed the canonical hash from the stored row and compared it to the stored `event_hash`, and (b) computed what the *pre-patch* code would have hashed (the raw caller string) and checked whether THAT would have matched:

| Caller `occurred_at_utc` | Stored (`toISOString`) | Post-patch reconstruct == stored | Raw-string hash would have matched |
|---|---|---|---|
| `2026-01-01T00:00:00Z` (blueprint sample) | `…T00:00:00.000Z` | **true (clean)** | **false** ← v0.1's false-fail |
| `2026-01-01T00:00:00+00:00` | `…T00:00:00.000Z` | **true (clean)** | **false** ← v0.1's false-fail |
| `2026-01-01T00:00:00.123456Z` (µs) | `…T00:00:00.123Z` | **true (clean)** | **false** ← v0.1's false-fail |
| `new Date().toISOString()` | identical | true (clean) | true (the case that masked the bug) |

This confirms three things at once: the bug was real (raw-string hash mismatches on 3/4 formats), the stored hash is now bound to the **normalized** value (post-patch reconstruction matches), and the `toISOString` coincidence is exactly why the original 316-test suite was green.

**Tamper detection is not weakened** — proven both generally and specifically for the patched field. A general out-of-band tamper (`result` flipped) still yields `fail`/`mismatch_count=1`; and a new regression tampers **`occurred_at_utc` itself** (`UPDATE … SET occurred_at_utc = occurred_at_utc + interval '1 hour'`) and still gets a `hashMismatch` — the normalized field remains fully covered by the detector, not exempted from it. In my fresh-DB run the `integrity_verification_run` table held 5 rows with `result=fail, mismatch_count=1` (five distinct genuine-tamper tests, including the occurred_at_utc-tamper one), confirming true-positive detection is intact.

## P3-L1 — verify-range idempotency now real — CLOSED

`routes/integrity.ts` now honours `beginIdempotent`'s `duplicate` outcome (`:64-76`): a retry with the same `Idempotency-Key` + same body returns the **original** recorded run via the new read-only `getIntegrityVerificationRunById` (`lib/integrity.ts:261-294`) instead of calling `runIntegrityVerification` again. The `!priorRun` path fails closed with `SEC1_AUDIT_PERSIST_FAILED` — and this is safe by construction: `beginIdempotent` and the run INSERT commit in the **same** transaction, so a committed `duplicate` always has a non-null `result_ref` pointing at a real row (the guard is defensive belt-and-braces). Reproduced in the fresh DB: 18 total run rows, 18 distinct `verification_id`s — the replay test's second call added no row.

## P3-L3 — stale grant-file comment — CLOSED

`infra/grants/sec1_runtime_grants.sql:27-32` no longer asserts "nothing this stage ever updates a seal batch row"; it now states the Phase 0-2 grant had no UPDATE and points to the Phase 3 column-level `UPDATE (verification_status)` grant lower in the file. Cosmetic, correctly resolved.

## Similar-field review (v0.1 §9 asked for this) — sound, no new risk found

The implementer reviewed the other two fields whose stored type could plausibly normalize a value, and the analysis is correct:

- **`metadata_redacted` (jsonb):** not at risk. The hash binds `canonicalJson()` over the in-memory, already-parsed JS object, and reconstruction re-parses the stored jsonb and runs it through the **same** `canonicalJson()` (which deep-sorts keys). Both sides go through JS's own number/string canonicalization, and `canonicalJson`'s key-sort neutralizes jsonb's internal key-order/whitespace normalization — there was never a "raw string vs. DB-normalized string" split here the way `occurred_at_utc` had. Proven by a real-round-trip test (nested objects/arrays, trailing-zero float, unicode) verifying clean.
- **`source_emission_sequence` (bigint):** not a hash/reconstruction divergence. node-postgres returns `bigint` as a string and `integrity.ts` converts via `Number(...)`; within `Number.MAX_SAFE_INTEGER` this round-trips exactly (tested at the boundary — I confirmed `9007199254740991` stored and read back identically). Beyond 2^53 precision is already lost at JSON wire-parse time (before this code sees it) — a systemic JSON/JS-number ceiling common to any JSON API, not a divergence this control introduces. Correctly left out of scope (fixing it would need a breaking wire-format change) per the brief's "do not expand scope unless you find the same divergence risk."
- No other `timestamptz` is bound into the hash: `ingested_at_utc` and `run_at_utc` are server-generated `now()` values, never caller input, never hashed. Confirmed.

**One non-blocking observation (not a defect):** `computeIngestPayloadHash` still hashes the **raw** input (`ingest.ts:178`), so two replays of the same `event_id` using different-but-equivalent timestamp *formats* (e.g. `…Z` then `…000Z`) would be treated as an idempotency **conflict** (`SEC1_IDEMPOTENCY_CONFLICT`), not a replay. This is defensible — the raw payloads genuinely differ, and it's the pre-existing Phase 2 duplicate-detection contract, unchanged by this patch — but worth a line in the notes if callers are expected to retry with reformatted timestamps. No action required for acceptance.

## Scope / regression check

- `tsc -b` clean; migrations 001→009 apply; all 4 grant files apply; **325/325 tests** on a reviewer-built fresh Postgres (316 v0.1 baseline unregressed + 9 new: 6 P3-F1 incl. the occurred_at_utc-tamper case, 1 P3-L1, 2 similar-field).
- **Grant boundaries reproduced directly under `SET ROLE role_sec1_runtime`:** `audit_event` UPDATE/DELETE denied (append-only intact); `integrity_verification_run` UPDATE/DELETE denied (append-only evidence); `audit_seal_batch` non-`verification_status` columns denied (column-level grant intact); `role_iam_runtime` denied on schema `sec1` entirely (no leak). The patch widened no grant.
- **Out-of-scope confirmed absent:** no Phase 4, no scheduler/cron, no new endpoints, no external anchor implementation, no search/export/monitoring/retention, no CFG/business-tier code, no Exchange/order-book/matching-engine/market-making/principal-dealing/spread-markup. The changes are confined to `lib/ingest.ts`, `lib/errors.ts`, `lib/canonical.ts` (comment), `lib/integrity.ts`, `routes/integrity.ts`, `infra/grants/sec1_runtime_grants.sql`, and the test file.

## Carry-forward (unchanged from v0.1, non-blocking)

- **P3-L2** — partial-range first-row inbound-link blind spot: still open, correctly deferred to verification-job productionization.
- All previously-deferred Phase 4+ scope (external WORM/TSA, scheduler, monitoring/alerts, evidence export, IAM-02 `sec1.*` registration, interim handoff, correction, retention/legal-hold, recovery, break-glass) remains correctly deferred.

*No code was written in this review. All reproduction ran against a disposable database that was torn down; no stray databases or roles left behind.*
