/* eslint-disable camelcase */

/**
 * 048_kyc1_publication_roster_binding — KYC-01 Phase 4B (authoritative roster completeness,
 * publication binding, atomic delivery integration). Adds five nullable columns to the EXISTING
 * `kyc1.outcome_publication` table (migration 043) — no new table, no change to any other KYC-01
 * table, no seed data.
 *
 * Depends on CLT-01 Phase 4A (`GET /internal/clt1/applications/:application_id/kyc-roster`, the
 * PII-free application-keyed roster contract) and CLT-01 Phase 4A.1 (migration
 * `047_clt1_atomic_kyc_roster_binding.cjs`, the shared advisory-lock + `expected_roster_hash`
 * atomic receipt contract CLT-01 accepted as a coordinated prerequisite). This migration is
 * KYC-01's own side of that binding — it does not touch, and cannot touch, any `clt1.*` table.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIVE NEW COLUMNS — one application-level publication's roster evidence, INSERT-once
 * ---------------------------------------------------------------------------------------
 *   `roster_hash`             — the CLT-owned digest (`@aix/foundation` `fingerprint()`, CLT-01's
 *                                Phase 4A roster route's own output) this publication was validated
 *                                against. Sent back to CLT-01 verbatim as `expected_roster_hash` on
 *                                delivery (migration 047's own contract) — never recomputed by
 *                                KYC-01 as the authoritative value; KYC-01 only format-validates it.
 *   `required_party_count`    — how many CLT `authorised_party` rows were REQUIRED coverage at
 *                                publish time (`authority_status` ∈ {pending, active, restricted,
 *                                suspended} — the approved Phase 4B compliance decision; `rejected`/
 *                                `revoked` are terminal-excluded).
 *   `evaluated_party_count`   — how many of those required parties this publication actually
 *                                evaluated (always EQUAL to `required_party_count` for a genuine
 *                                Phase 4B publication — see the CHECK constraint below; publication
 *                                is refused outright, no row ever inserted, when any required party
 *                                lacks coverage — see `routes/outcome-publication.ts`).
 *   `contributing_party_ids`  — the OPAQUE CLT `authorised_party_id` values (never `party_reference`,
 *                                never a name, never any PII) this publication's primary+required-
 *                                party aggregate was computed from. Deterministically sorted by
 *                                `lib/authoritative-outcome.ts`'s own `computeRosterBoundOutcome`
 *                                (codepoint order — the same locale-independent comparator CLT-01's
 *                                own Phase 4A roster route already uses for the identical reason),
 *                                so hashing/diffing two publications' evidence is order-independent
 *                                by construction. Sort order and duplicate-freedom are APPLICATION-
 *                                guaranteed, not DB-enforced — see the note below the CHECK block.
 *   `roster_fetched_at_utc`   — when CLT-01's roster was read for this publication (operational
 *                                diagnostic; not itself security-load-bearing — `roster_hash` is
 *                                what delivery actually re-validates against).
 *
 * All five are NULLABLE for exactly one reason: every publication row created before this migration
 * (Phase 2A/2B) has no roster evidence at all — NULL is that row's genuine historical state, not a
 * migration artifact to be backfilled or guessed at. `routes/outcome-publication.ts`'s delivery
 * route treats a NULL `roster_hash` as an unconditional, pre-CLT-HTTP-call refusal
 * (`reason_code: "legacy_publication_unbound"`) — a legacy publication can never be delivered; the
 * only remedy is a FRESH `publish-outcome` call, which (post-048) always populates all five fields
 * or is refused outright. No historical row is ever retrofitted or mutated to add these fields after
 * the fact — see the immutability note below and `infra/grants/kyc1_runtime_grants.sql`.
 *
 * ---------------------------------------------------------------------------------------
 * ALL-OR-NONE BINDING — one CHECK, not five independent NULL checks
 * ---------------------------------------------------------------------------------------
 * A publication with SOME of the five fields set and others NULL would be a structurally impossible
 * state no application code path ever produces (a genuine Phase 4B publication computes and inserts
 * all five together, in the SAME `INSERT`, inside the SAME transaction) — the CHECK constraint below
 * makes that impossibility a database-enforced invariant, not merely an application convention.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS, AND IS NOT, ENFORCED AS A DATABASE CONSTRAINT (explicit per-rule reasoning, not a
 * blanket choice)
 * ---------------------------------------------------------------------------------------
 * ENFORCED IN THE DATABASE (cheap, readable, genuinely defense-in-depth against a future
 * application-code bug — Postgres 17, `jsonb_typeof`/`jsonb_array_length` are ordinary immutable
 * built-ins, safe and standard in a CHECK constraint):
 *   - the all-or-none binding itself;
 *   - `roster_hash` format (`^sha256:[0-9a-f]{64}$`) when present;
 *   - `required_party_count`/`evaluated_party_count` bounds (`0..500`, matching CLT-01's own
 *     Phase 4A `KYC_ROSTER_MAX_PARTIES` cap) when present;
 *   - `contributing_party_ids` is a genuine JSON array (`jsonb_typeof(...) = 'array'`) when present;
 *   - `evaluated_party_count = required_party_count` — ALWAYS true for a genuine Phase 4B
 *     publication (the publish route refuses outright rather than ever inserting a row with partial
 *     coverage — see `lib/authoritative-outcome.ts`'s `computeRosterBoundOutcome`), so this is a
 *     real, cheap invariant to enforce, not a tautology added for its own sake;
 *   - `jsonb_array_length(contributing_party_ids) = required_party_count` — the array's LENGTH is
 *     likewise always exactly the required-party count for the identical reason.
 *
 * DELIBERATELY LEFT TO APPLICATION CODE + TESTS, NOT A DATABASE CONSTRAINT (assessed and rejected,
 * not merely omitted):
 *   - that `contributing_party_ids`'s elements are STRICTLY SORTED by codepoint order;
 *   - that `contributing_party_ids` contains no DUPLICATE value.
 *   Both are real properties this migration's own header comment promises, but expressing "these
 *   JSON array elements are strictly increasing text values" as a portable, readable Postgres CHECK
 *   requires an ugly correlated subquery unnesting the array with `jsonb_array_elements_text` and a
 *   window-function lag-comparison — real SQL, but a maintenance burden for a property application
 *   code ALREADY guarantees deterministically and cannot get wrong without a genuine bug: the array
 *   is built by ONE call site (`computeRosterBoundOutcome`), from a `Set`-deduplicated, freshly
 *   `.sort()`-ed list, never from arbitrary caller input (`contributing_case_ids`/
 *   `contributing_outcome_ids` — migration 043 — already established this exact precedent: no DB
 *   sort/uniqueness constraint on those `jsonb` columns either, application-guaranteed instead).
 *   Proven by dedicated unit tests on `computeRosterBoundOutcome` and integration tests asserting
 *   the stored column's actual contents after a real publish call — not merely assumed.
 *
 * ---------------------------------------------------------------------------------------
 * IMMUTABILITY
 * ---------------------------------------------------------------------------------------
 * All five columns are INSERT-once publication evidence — `infra/grants/kyc1_runtime_grants.sql`'s
 * existing column-scoped UPDATE grant on `outcome_publication` (`status, attempt_count,
 * failure_reason_code, response_ref, delivered_at_utc, version`) is UNCHANGED by this migration and
 * does NOT list any of these five columns — `role_kyc1_runtime` can INSERT them (the existing
 * table-level, non-column-scoped `INSERT` grant already covers any new column automatically) but can
 * never UPDATE any of them, mirroring `contributing_case_ids`/`contributing_outcome_ids`/
 * `payload_hash`'s own existing immutability on this exact table.
 */

const SHA256_HASH_CHECK = `(roster_hash IS NULL OR roster_hash ~ '^sha256:[0-9a-f]{64}$')`;
const PARTY_COUNT_BOUNDS_CHECK = `(
  (required_party_count IS NULL OR (required_party_count >= 0 AND required_party_count <= 500))
  AND (evaluated_party_count IS NULL OR (evaluated_party_count >= 0 AND evaluated_party_count <= 500))
)`;
const CONTRIBUTING_IDS_ARRAY_CHECK = `(contributing_party_ids IS NULL OR jsonb_typeof(contributing_party_ids) = 'array')`;
const ALL_OR_NONE_CHECK = `(
  (roster_hash IS NULL AND required_party_count IS NULL AND evaluated_party_count IS NULL AND contributing_party_ids IS NULL AND roster_fetched_at_utc IS NULL)
  OR
  (roster_hash IS NOT NULL AND required_party_count IS NOT NULL AND evaluated_party_count IS NOT NULL AND contributing_party_ids IS NOT NULL AND roster_fetched_at_utc IS NOT NULL)
)`;
const EVALUATED_EQUALS_REQUIRED_CHECK = `(evaluated_party_count IS NULL OR evaluated_party_count = required_party_count)`;
const CONTRIBUTING_LENGTH_EQUALS_REQUIRED_CHECK = `(contributing_party_ids IS NULL OR jsonb_array_length(contributing_party_ids) = required_party_count)`;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE kyc1.outcome_publication
      ADD COLUMN roster_hash varchar(128),
      ADD COLUMN required_party_count int,
      ADD COLUMN evaluated_party_count int,
      ADD COLUMN contributing_party_ids jsonb,
      ADD COLUMN roster_fetched_at_utc timestamptz;

    ALTER TABLE kyc1.outcome_publication
      ADD CONSTRAINT chk_kyc1_outcome_publication_roster_hash_format
        CHECK ${SHA256_HASH_CHECK},
      ADD CONSTRAINT chk_kyc1_outcome_publication_party_count_bounds
        CHECK ${PARTY_COUNT_BOUNDS_CHECK},
      ADD CONSTRAINT chk_kyc1_outcome_publication_contributing_ids_is_array
        CHECK ${CONTRIBUTING_IDS_ARRAY_CHECK},
      ADD CONSTRAINT chk_kyc1_outcome_publication_roster_binding_all_or_none
        CHECK ${ALL_OR_NONE_CHECK},
      ADD CONSTRAINT chk_kyc1_outcome_publication_evaluated_equals_required
        CHECK ${EVALUATED_EQUALS_REQUIRED_CHECK},
      ADD CONSTRAINT chk_kyc1_outcome_publication_contributing_length_equals_required
        CHECK ${CONTRIBUTING_LENGTH_EQUALS_REQUIRED_CHECK};
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE kyc1.outcome_publication
      DROP CONSTRAINT IF EXISTS chk_kyc1_outcome_publication_contributing_length_equals_required,
      DROP CONSTRAINT IF EXISTS chk_kyc1_outcome_publication_evaluated_equals_required,
      DROP CONSTRAINT IF EXISTS chk_kyc1_outcome_publication_roster_binding_all_or_none,
      DROP CONSTRAINT IF EXISTS chk_kyc1_outcome_publication_contributing_ids_is_array,
      DROP CONSTRAINT IF EXISTS chk_kyc1_outcome_publication_party_count_bounds,
      DROP CONSTRAINT IF EXISTS chk_kyc1_outcome_publication_roster_hash_format,
      DROP COLUMN IF EXISTS roster_fetched_at_utc,
      DROP COLUMN IF EXISTS contributing_party_ids,
      DROP COLUMN IF EXISTS evaluated_party_count,
      DROP COLUMN IF EXISTS required_party_count,
      DROP COLUMN IF EXISTS roster_hash;
  `);
};
