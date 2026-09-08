/* eslint-disable camelcase */

/**
 * 043_kyc1_outcome_publication — KYC-01 Phase 2A (application-level authoritative-outcome
 * publication model, approved Phase 2 planning report). Adds exactly ONE new table,
 * `kyc1.outcome_publication` — no change to any Phase 1 table, no new schema, no seed data. No
 * role is created here — `role_kyc1_runtime`'s extended grants are applied separately by
 * `infra/grants/kyc1_runtime_grants.sql`, AFTER this migration (mirrors migration 042's own
 * convention, and AML-01's own migration 034/`aml1_runtime_grants.sql` split for its own
 * `clt_outcome_delivery` table).
 *
 * One row per PUBLICATION ATTEMPT for an application — NOT one row per KYC-01 case.
 * `aggregate_status` is the application-level authoritative CDD outcome
 * (`lib/authoritative-outcome.ts`'s `computeAuthoritativeOutcome`, worst-wins across every KYC-01
 * anchor the application holds), never a single case's own `cdd_outcome.outcome_status` — this is
 * the deliberate fix for the risk the Phase 2 planning report's own "Critical finding" identified:
 * a case-scoped publish would let a later `authorised_party` case's own `pass` silently overwrite
 * an earlier `individual`/`entity` case's own `fail` once delivered into CLT-01's single
 * last-write-wins `cdd_outcome_status` column. `aggregate_status` therefore EXCLUDES `pending` —
 * `routes/outcome-publication.ts`'s publish route never inserts a row when the aggregate is
 * `pending` (`KYC1_OUTCOME_NOT_PUBLISHABLE` is thrown instead, no row created), so `pending` would
 * be a structurally impossible value here, not merely an unreachable one.
 *
 * ---------------------------------------------------------------------------------------
 * D6 (approved) — `status` FORWARD-COMPATIBILITY EXCEPTION, documented explicitly rather than
 * silently narrowed-then-widened later:
 *   - `pending`/`superseded` are LIVE in Phase 2A. `pending` is set at INSERT (no CLT-01 client
 *     exists yet this phase, so nothing ever advances a row past it) and `superseded` is set by a
 *     LATER publish call for the same `application_id` superseding an earlier active row (the
 *     partial unique index below permits at most one non-superseded row per application at a
 *     time — a fresh publish call must supersede-then-insert, never leave two active rows).
 *   - `succeeded`/`failed` become LIVE only in Phase 2B (the CLT-01 delivery attempt itself,
 *     `attempt_count`/`failure_reason_code`/`response_ref`/`delivered_at_utc` all stay at their
 *     Phase-2A defaults/NULL until then). Included in the CHECK now, in the SAME pass that adds
 *     the table, specifically so Phase 2B needs no further schema/grant churn on this table — the
 *     full lifecycle shape is already known, only the code path that reaches the last two values
 *     is deferred. A deliberate exception to this codebase's usual "only add what THIS stage's
 *     code can reach" discipline, not a quiet reversal of it — CHECK constraint here, because a
 *     forward-compatible enum value costs nothing extra to declare early. NOT extended to
 *     `lib/errors.ts`'s error catalogue: a pre-review pass corrected the initial draft, which had
 *     pre-registered `KYC1_OUTCOME_PUBLICATION_INVALID_STATE` on this same reasoning — a
 *     forward-only ERROR CODE with zero call sites is genuinely decorative in a way an unreached
 *     CHECK value is not, so the two are not actually the same exception. That code is added in
 *     Phase 2B instead, alongside the retry route that actually throws it.
 *
 * Duplicate-active-publication prevention: a partial unique index enforces AT MOST ONE
 * non-`superseded` publication per `application_id` — the race-safe backstop mirroring migration
 * 042's own `idx_kyc1_kyc_case_one_active_per_anchor` / AML-01's own
 * `idx_aml1_screening_request_one_inflight_per_subject` precedent. `routes/outcome-publication.ts`
 * explicitly supersedes any existing active row in the SAME transaction, immediately before
 * inserting the new one, so this index should never actually be hit by ordinary application code —
 * it exists as the DB-level guarantee, not merely an application-level convention.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE kyc1.outcome_publication (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      publication_id            varchar(64) NOT NULL UNIQUE,
      application_id            varchar(64) NOT NULL,
      aggregate_status          varchar(24) NOT NULL
                                   CHECK (aggregate_status IN ('pass','fail','remediation_required')),
      contributing_case_ids     jsonb NOT NULL,
      contributing_outcome_ids  jsonb NOT NULL,
      payload_hash              varchar(128) NOT NULL,
      status                    varchar(16) NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending','succeeded','failed','superseded')),
      attempt_count             int NOT NULL DEFAULT 0,
      failure_reason_code       varchar(64),
      response_ref              varchar(128),
      requested_by              varchar(64) NOT NULL,
      version                   int NOT NULL DEFAULT 1,
      request_id                varchar(128),
      correlation_id            varchar(128),
      created_at_utc            timestamptz NOT NULL DEFAULT now(),
      delivered_at_utc          timestamptz
    );

    CREATE UNIQUE INDEX idx_kyc1_outcome_publication_publication_id ON kyc1.outcome_publication (publication_id);
    CREATE INDEX idx_kyc1_outcome_publication_application_id_status ON kyc1.outcome_publication (application_id, status);

    -- At most one non-superseded (i.e. currently active) publication per application_id — see
    -- header comment.
    CREATE UNIQUE INDEX idx_kyc1_outcome_publication_one_active_per_application
      ON kyc1.outcome_publication (application_id)
      WHERE status <> 'superseded';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS kyc1.outcome_publication;
  `);
};
