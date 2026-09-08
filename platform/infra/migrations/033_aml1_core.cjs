/* eslint-disable camelcase */

/**
 * 033_aml1_core — AML-01 Phase 1 (point-in-time screening record & deterministic stub adaptor,
 * approved Phase 1 scope). Creates the `aml1` schema and four tables:
 * `screening_request` (workflow row, NO PII), `screening_subject_snapshot` (the declared-identity
 * PII captured at screen time — deliberately isolated in its own table so all screening PII lives
 * in exactly one place, simplifying redaction/safe-response/future sensitive-read gating),
 * `screening_result` (append-only, one per completed screen), and `screening_match` (append-only,
 * zero-or-more per result). No seed data — AML-01 has no registry to seed, mirrors CLT-01's own
 * Phase 1 precedent. No role is created here — `role_aml1_runtime` is created by
 * `infra/grants/aml1_runtime_grants.sql`, applied by a privileged role AFTER this migration.
 *
 * ---------------------------------------------------------------------------------------
 * CHECK constraints carry the FULL forward-compatible value set even though Phase 1 code only
 * ever writes a subset — same discipline CLT-01's own migration 020 established for
 * `client_application.status` etc.:
 *   - screening_request.provenance: Phase 1 code only ever writes 'declared_identity'.
 *     'kyc_verified_identity' is reserved for the phase that lands after KYC-01 exists — AML-01
 *     Phase 1 screens CLT-01's DECLARED identity, not a KYC-verified one (approved design
 *     decision — see planning report §3/§9).
 *   - screening_request.status: Phase 1 code only ever writes 'requested' (at INSERT) then
 *     transitions synchronously, in the SAME transaction, to 'completed' or 'failed'. There is no
 *     separate request-lifecycle phase this phase (synchronous screening only), so no
 *     AML1_SCREENING_REQUEST_INVALID_STATE code exists yet — see lib/errors.ts header.
 *   - screening_request.subject_type: Phase 1 allows 'client_application'/'authorised_party' only
 *     (the two CLT-01 entity types AML-01 can be asked to screen this phase) — no wallet/address/
 *     transaction subject type (WLT-01/transaction-screening scope, not this module).
 *   - screening_result.overall_status: Phase 1 code only ever writes 'clear'/'potential_match'.
 *     'confirmed_hit' needs human disposition (deferred to Phase 2+); 'error' is reserved,
 *     unreachable this phase (a provider-unavailable outcome fails the REQUEST, not the result —
 *     no `screening_result` row is ever written for a failed screen).
 *   - screening_match.category: 'sanctions'/'pep'/'adverse_media' — the three blueprint-named
 *     match categories AML-01's own name implies; no wallet/transaction match category.
 *   - screening_match.match_status: Phase 1 code only ever writes 'potential_match' (an unreviewed
 *     surfaced match). 'confirmed_hit'/'dismissed' require human disposition, deferred to Phase 2+.
 *
 * `screening_request.subject_ref` is an OPAQUE, UNVERIFIED caller-supplied reference this phase —
 * AML-01 does not call out to CLT-01 to confirm it exists (no CLT-01 HTTP client yet; approved
 * Phase 1 design decision D2). It is not a real FK (no cross-schema FK to `clt1.*` — AML-01 has no
 * grant into the `clt1` schema, same posture every module maintains toward every other module's
 * schema).
 *
 * `screening_result.provider_ref` records which (stub, this phase) screening provider produced the
 * result — `'stub-v1'` — so a later real-vendor phase can distinguish stub-produced historical
 * rows from real-provider rows without a schema change.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE SCHEMA IF NOT EXISTS aml1;

    -- screening_request — workflow row only, NO PII. One row per screening attempt (a re-screen
    -- of the same subject is a legitimately new row — no update-in-place of an existing screen).
    CREATE TABLE aml1.screening_request (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      screening_request_id  varchar(64) NOT NULL UNIQUE,
      subject_type          varchar(24) NOT NULL
                               CHECK (subject_type IN ('client_application','authorised_party')),
      subject_ref           varchar(64) NOT NULL,
      provenance            varchar(24) NOT NULL
                               CHECK (provenance IN ('declared_identity','kyc_verified_identity')),
      status                varchar(16) NOT NULL DEFAULT 'requested'
                               CHECK (status IN ('requested','completed','failed')),
      requested_by          varchar(64) NOT NULL,
      version               int NOT NULL DEFAULT 1,
      request_id            varchar(128),
      correlation_id        varchar(128),
      created_at_utc        timestamptz NOT NULL DEFAULT now(),
      completed_at_utc      timestamptz
    );

    CREATE UNIQUE INDEX idx_aml1_screening_request_screening_request_id ON aml1.screening_request (screening_request_id);
    CREATE INDEX idx_aml1_screening_request_subject ON aml1.screening_request (subject_type, subject_ref);
    CREATE INDEX idx_aml1_screening_request_status ON aml1.screening_request (status);

    -- screening_subject_snapshot — the declared-identity PII captured AT SCREEN TIME, append-only
    -- (immutable once written — a re-screen writes a NEW snapshot row, never edits an old one).
    -- Deliberately isolated from screening_request so every screening PII column lives in exactly
    -- one table, simplifying redaction, safe-response projection, and any future sensitive-read
    -- gating (mirrors the isolation discipline CLT-01's own client_application PII columns
    -- established, one level further by putting PII in its own table entirely).
    CREATE TABLE aml1.screening_subject_snapshot (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      screening_request_id  varchar(64) NOT NULL REFERENCES aml1.screening_request (screening_request_id),
      subject_type          varchar(24) NOT NULL
                               CHECK (subject_type IN ('client_application','authorised_party')),
      name                  varchar(256) NOT NULL,
      registration_number   varchar(64),
      country               varchar(2),
      date_of_birth         date,
      nationality           varchar(2),
      provenance            varchar(24) NOT NULL
                               CHECK (provenance IN ('declared_identity','kyc_verified_identity')),
      created_at_utc        timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_aml1_screening_subject_snapshot_request_id ON aml1.screening_subject_snapshot (screening_request_id);

    -- screening_result — append-only, at most one row per COMPLETED screen (a failed/
    -- provider-unavailable screen never gets a result row — see screening_request.status='failed').
    CREATE TABLE aml1.screening_result (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      screening_result_id   varchar(64) NOT NULL UNIQUE,
      screening_request_id  varchar(64) NOT NULL REFERENCES aml1.screening_request (screening_request_id),
      overall_status        varchar(16) NOT NULL
                               CHECK (overall_status IN ('clear','potential_match','confirmed_hit','error')),
      provider_ref          varchar(64) NOT NULL,
      screened_at_utc       timestamptz NOT NULL,
      created_at_utc        timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_aml1_screening_result_screening_result_id ON aml1.screening_result (screening_result_id);
    CREATE INDEX idx_aml1_screening_result_request_id ON aml1.screening_result (screening_request_id);

    -- screening_match — append-only, zero-or-more rows per result. matched_name/match_detail are
    -- the most sensitive columns in this schema (a real name/allegation tied to a real person) —
    -- never returned by the default safe-response projection (see lib/screening.ts).
    CREATE TABLE aml1.screening_match (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      screening_match_id    varchar(64) NOT NULL UNIQUE,
      screening_result_id   varchar(64) NOT NULL REFERENCES aml1.screening_result (screening_result_id),
      category              varchar(24) NOT NULL
                               CHECK (category IN ('sanctions','pep','adverse_media')),
      match_status           varchar(16) NOT NULL DEFAULT 'potential_match'
                               CHECK (match_status IN ('potential_match','confirmed_hit','dismissed')),
      score                 numeric(4,3) NOT NULL,
      list_source           varchar(64) NOT NULL,
      matched_name          varchar(256) NOT NULL,
      match_detail          text,
      created_at_utc        timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_aml1_screening_match_screening_match_id ON aml1.screening_match (screening_match_id);
    CREATE INDEX idx_aml1_screening_match_result_id ON aml1.screening_match (screening_result_id);
    CREATE INDEX idx_aml1_screening_match_category ON aml1.screening_match (category);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS aml1.screening_match;
    DROP TABLE IF EXISTS aml1.screening_result;
    DROP TABLE IF EXISTS aml1.screening_subject_snapshot;
    DROP TABLE IF EXISTS aml1.screening_request;
    DROP SCHEMA IF EXISTS aml1;
  `);
};
