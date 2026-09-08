/* eslint-disable camelcase */

/**
 * 037_aml1_provider_attempt — AML-01 Phase 3B (two-phase screening lifecycle + provider adaptor
 * boundary, approved Phase 3B scope). Three additive schema changes:
 *
 *   1. `aml1.screening_provider_attempt` — a new table implementing the two-phase (insert-pending
 *      -> provider call OUTSIDE any transaction -> update-terminal) pattern this codebase already
 *      established for CLT-01 outcome delivery (migration 034) and AML-01's own match disposition
 *      (migration 035): one row per screening ATTEMPT, `status` `pending` -> `succeeded`/`failed`.
 *      `provider_id`/`provider_adaptor_version` identify WHICH provider (and adaptor build)
 *      answered; `provider_list_version` is the provider's OWN sanctions/PEP/adverse-media list/
 *      data version (distinct from `provider_adaptor_version` — a later re-screening-trigger phase
 *      can compare this across attempts to detect a list refresh); `provider_reference_id` is the
 *      provider's own opaque case/search id (an audit handle, never raw evidence);
 *      `request_payload_hash`/`response_payload_hash` are `fingerprint()`s of the MINIMIZED
 *      provider payload and the provider's raw response respectively — the RAW payload/response
 *      bodies themselves are never retained (approved Phase 3 planning report §6/§7 D4).
 *
 *   2. `aml1.screening_subject_snapshot` gains `subject_nature` (`individual`/`entity`,
 *      CALLER-SUPPLIED, never derived by AML-01 — Phase 3B decision D2) — gates provider-payload
 *      minimization (`lib/screening.ts`'s `buildProviderScreeningPayload`): `registration_number`
 *      is sent to a provider ONLY for `entity` subjects, `date_of_birth`/`nationality` ONLY for
 *      `individual` subjects.
 *
 *   3. `aml1.screening_match.score` becomes NULLABLE (Phase 3B decision D3) — `NULL` represents a
 *      provider that supplied no confidence score for a match, never a misleading `0.000` sentinel.
 *      `matched_name`/`match_detail`/`category`/`list_source`/`screening_result_id`/
 *      `screening_match_id`/`created_at_utc` are all untouched.
 *
 * No role created here — `role_aml1_runtime`'s extended grants are applied separately by
 * `infra/grants/aml1_runtime_grants.sql`, AFTER this migration (mirrors every prior AML-01
 * migration's own convention). No seed data. No vendor credential table, no raw-evidence table, no
 * monitoring table, no risk_signal table — all deliberately out of Phase 3B scope.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE aml1.screening_provider_attempt (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id                  varchar(64) NOT NULL UNIQUE,
      screening_request_id        varchar(64) NOT NULL REFERENCES aml1.screening_request (screening_request_id),
      provider_id                 varchar(64) NOT NULL,
      provider_adaptor_version    varchar(64) NOT NULL,
      provider_list_version       varchar(64),
      provider_reference_id       varchar(128),
      request_payload_hash        varchar(128) NOT NULL,
      response_payload_hash       varchar(128),
      status                      varchar(24) NOT NULL DEFAULT 'pending'
                                     CHECK (status IN ('pending','succeeded','failed')),
      failure_reason_code         varchar(64),
      latency_ms                  integer,
      attempt_count                int NOT NULL DEFAULT 1,
      checked_at_utc               timestamptz,
      created_at_utc               timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_aml1_screening_provider_attempt_attempt_id ON aml1.screening_provider_attempt (attempt_id);
    CREATE INDEX idx_aml1_screening_provider_attempt_request_id ON aml1.screening_provider_attempt (screening_request_id);
    CREATE INDEX idx_aml1_screening_provider_attempt_status ON aml1.screening_provider_attempt (status);
    CREATE INDEX idx_aml1_screening_provider_attempt_provider_id ON aml1.screening_provider_attempt (provider_id);
    CREATE INDEX idx_aml1_screening_provider_attempt_list_version ON aml1.screening_provider_attempt (provider_list_version) WHERE provider_list_version IS NOT NULL;

    ALTER TABLE aml1.screening_subject_snapshot
      ADD COLUMN subject_nature varchar(16)
        CHECK (subject_nature IN ('individual','entity'));

    ALTER TABLE aml1.screening_match
      ALTER COLUMN score DROP NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE aml1.screening_match
      ALTER COLUMN score SET NOT NULL;

    ALTER TABLE aml1.screening_subject_snapshot
      DROP COLUMN IF EXISTS subject_nature;

    DROP TABLE IF EXISTS aml1.screening_provider_attempt;
  `);
};
