/* eslint-disable camelcase */

/**
 * 035_aml1_match_disposition — AML-01 Phase 2B (human match disposition, approved Phase 2B
 * scope). Three additive schema changes:
 *
 *   1. `aml1.screening_match` gains five review columns: `reviewed_by` (the disposition
 *      requester/maker — never the IAM-02 approver, whose identity `execute-verify` never
 *      exposes), `reviewed_at_utc`, `approval_id`, `version`, `updated_at_utc`. `match_status`
 *      already exists with the correct CHECK (`potential_match`/`confirmed_hit`/`dismissed`,
 *      migration 033) — unchanged. `matched_name`/`match_detail`/`score`/`category`/`list_source`/
 *      `screening_result_id`/`screening_match_id`/`created_at_utc` are NOT touched by this
 *      migration and never gain an UPDATE grant (see aml1_runtime_grants.sql) — the PII/evidence
 *      columns stay immutable forever.
 *
 *   2. `aml1.match_disposition_decision_request` — a new request/apply binding table, the same
 *      shape every prior maker-checker table in this codebase uses (mirrors CLT-01's own
 *      `duplicate_candidate_decision_request`, migration 029): one row per disposition attempt,
 *      `payload_hash` snapshotted at request time and recomputed from the stored row at apply
 *      time, `decision_token_hash` (never the raw token) written only on apply. No separate
 *      decision-history table — this table IS the decision record, matching every prior module's
 *      own precedent (documented Phase 2B design decision — do not overbuild).
 *
 *   3. Phase 2A carry-forward fix (Low-1): `aml1.clt_outcome_delivery.delivered_status` gains a
 *      CHECK constraint covering the exact 5 values the outcome-mapping library ever writes
 *      (`pass`/`pending`/`hit` for application-level, `clear`/`review_required` for
 *      authorised-party-level — `hit` is shared by both). Safe on a fresh DB (no existing rows to
 *      violate it) and safe in any already-running environment (every row Phase 2A code has ever
 *      written already falls inside this set, since `lib/clt1-outcome-mapping.ts` is a total
 *      function over a closed TypeScript union with no other possible output).
 *
 * No role created here — `role_aml1_runtime`'s extended grants are applied separately by
 * `infra/grants/aml1_runtime_grants.sql`, AFTER this migration (mirrors migration 033/034's own
 * convention). No seed data. No vendor/list/monitoring table of any kind.
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE aml1.screening_match
      ADD COLUMN reviewed_by      varchar(64),
      ADD COLUMN reviewed_at_utc  timestamptz,
      ADD COLUMN approval_id      varchar(64),
      ADD COLUMN version          int NOT NULL DEFAULT 1,
      ADD COLUMN updated_at_utc   timestamptz NOT NULL DEFAULT now();

    CREATE TABLE aml1.match_disposition_decision_request (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      decision_id           varchar(64) NOT NULL UNIQUE,
      screening_match_id    varchar(64) NOT NULL REFERENCES aml1.screening_match (screening_match_id),
      decision_type         varchar(16) NOT NULL
                               CHECK (decision_type IN ('confirm','dismiss')),
      reason                varchar(128),
      requested_by          varchar(64) NOT NULL,
      approval_id           varchar(64),
      decision_token_hash   varchar(128),
      status                varchar(16) NOT NULL DEFAULT 'requested'
                               CHECK (status IN ('requested','applied','cancelled','failed')),
      payload_hash          varchar(128) NOT NULL,
      request_id            varchar(128),
      correlation_id        varchar(128),
      created_at_utc        timestamptz NOT NULL DEFAULT now(),
      applied_at_utc        timestamptz
    );

    CREATE UNIQUE INDEX idx_aml1_match_disposition_decision_request_decision_id ON aml1.match_disposition_decision_request (decision_id);
    CREATE INDEX idx_aml1_match_disposition_decision_request_match_id ON aml1.match_disposition_decision_request (screening_match_id);
    CREATE INDEX idx_aml1_match_disposition_decision_request_status ON aml1.match_disposition_decision_request (status);

    ALTER TABLE aml1.clt_outcome_delivery
      ADD CONSTRAINT chk_aml1_clt_outcome_delivery_delivered_status
      CHECK (delivered_status IN ('pass','pending','hit','clear','review_required'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE aml1.clt_outcome_delivery
      DROP CONSTRAINT IF EXISTS chk_aml1_clt_outcome_delivery_delivered_status;

    DROP TABLE IF EXISTS aml1.match_disposition_decision_request;

    ALTER TABLE aml1.screening_match
      DROP COLUMN IF EXISTS updated_at_utc,
      DROP COLUMN IF EXISTS version,
      DROP COLUMN IF EXISTS approval_id,
      DROP COLUMN IF EXISTS reviewed_at_utc,
      DROP COLUMN IF EXISTS reviewed_by;
  `);
};
