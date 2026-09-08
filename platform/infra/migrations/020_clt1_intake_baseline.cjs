/* eslint-disable camelcase */

/**
 * 020_clt1_intake_baseline — CLT-01 Phase 1 (blueprint v1.1, `05_Database_Design.md` client
 * tables, adapted to the approved Phase 1 scope). Creates the `clt1` schema and four tables:
 * `client_application` (the only table Phase 1 code actually mutates), `client_profile` (DDL
 * only — zero rows this phase, see below), `client_classification_evidence`, and
 * `consent_record`. No seed data — unlike CFG-01's own Phase 1, CLT-01 has no registry to seed.
 *
 * ---------------------------------------------------------------------------------------
 * `client_profile` — table exists, no Phase 1 code path ever inserts a row.
 * ---------------------------------------------------------------------------------------
 * Approved Phase 1 design decision (CLT-01 Phase 1 planning report, Design Issue 3): inserting a
 * client_profile row before any real approval decision exists would fabricate a client identity
 * ahead of the decision blueprint §5.4 ("Onboarding Is Not Approval") treats as authoritative —
 * final approval is explicitly out of Phase 1 scope, so there is no legitimate trigger to create
 * one yet. The table is created now purely for forward schema compatibility (so the phase that
 * adds final approval needs no new migration for the table itself); `role_clt1_runtime` gets
 * SELECT only (see infra/grants/clt1_runtime_grants.sql), and no route reads or writes it this
 * phase either.
 *
 * ---------------------------------------------------------------------------------------
 * CHECK constraints carry the FULL blueprint value set even though Phase 1 code only ever
 * produces a subset — same forward-compatibility discipline as `cfg1.feature.current_state`'s
 * own CHECK carrying `locked`/`prohibited` values no Phase 3A code path had ever produced yet.
 * ---------------------------------------------------------------------------------------
 *   - client_application.status: Phase 1 code only ever writes draft/submitted/under_review/
 *     cancelled. duplicate_review/pending_kyc/pending_aml/approved/rejected/held belong to later
 *     phases (CDD gate, final approval) that are explicitly out of scope here.
 *   - client_application.client_class_status: Phase 1 code only ever writes 'claimed' — no
 *     verify/reject/hold route exists this phase (approved Phase 1 design decision: verifying
 *     classification evidence is deferred, since no IAM-02 permission model exists yet to gate
 *     who may verify a client's class claim).
 *   - client_classification_evidence.status: Phase 1 code only ever writes 'provided' — same
 *     reason as above, no verify/reject route this phase.
 *
 * `client_application.client_id` is a nullable soft reference to the future `client_profile.
 * client_id`, unpopulated this phase — mirrors `cfg1.feature.licence_profile_id`'s own "add the
 * column now, populate in a later phase" precedent, avoiding a schema-shape ALTER TABLE later.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE SCHEMA IF NOT EXISTS clt1;

    -- client_application — the only table Phase 1 code mutates. One row per onboarding
    -- application, from draft through submission and an administrative under_review marker
    -- (no real review LOGIC exists this phase — see services/clt1/src/lib/applications.ts).
    CREATE TABLE clt1.client_application (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      application_id          varchar(64) NOT NULL UNIQUE,
      applicant_type          varchar(16) NOT NULL
                                 CHECK (applicant_type IN ('individual','corporate','institutional')),
      legal_name              varchar(256) NOT NULL,
      registration_number     varchar(64),
      country_of_incorporation varchar(2),
      applicant_email         varchar(256),
      client_class_claimed    varchar(16) NOT NULL
                                 CHECK (client_class_claimed IN ('institutional','hnwi','professional','retail','unknown')),
      client_class_status     varchar(16) NOT NULL DEFAULT 'claimed'
                                 CHECK (client_class_status IN ('claimed','verified','rejected','held')),
      status                  varchar(20) NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft','submitted','duplicate_review','pending_kyc','pending_aml','under_review','approved','rejected','held','cancelled')),
      client_id               varchar(64),
      cfg_feature_code        varchar(128),
      cfg_decision_id         varchar(64),
      cfg_reason_code         varchar(64),
      cfg_evaluated_at_utc    timestamptz,
      assigned_reviewer       varchar(64),
      submitted_at_utc        timestamptz,
      under_review_at_utc     timestamptz,
      cancelled_at_utc        timestamptz,
      version                 int NOT NULL DEFAULT 1,
      created_by              varchar(64) NOT NULL,
      request_id              varchar(128),
      correlation_id          varchar(128),
      created_at_utc          timestamptz NOT NULL DEFAULT now(),
      updated_at_utc          timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_clt1_client_application_application_id ON clt1.client_application (application_id);
    CREATE INDEX idx_clt1_client_application_status ON clt1.client_application (status);
    CREATE INDEX idx_clt1_client_application_class_status ON clt1.client_application (client_class_claimed, status);

    -- client_profile — DDL only this phase. See migration header comment: zero Phase 1 code path
    -- inserts a row here; created now for forward schema compatibility.
    CREATE TABLE clt1.client_profile (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id               varchar(64) NOT NULL UNIQUE,
      application_id          varchar(64) NOT NULL,
      applicant_type          varchar(16) NOT NULL
                                 CHECK (applicant_type IN ('individual','corporate','institutional')),
      legal_name              varchar(256) NOT NULL,
      registration_number     varchar(64),
      country_of_incorporation varchar(2),
      client_class            varchar(16) NOT NULL
                                 CHECK (client_class IN ('institutional','hnwi','professional','retail','unknown')),
      status                  varchar(16) NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','active_limited','active','suspended','restricted','closed')),
      version                 int NOT NULL DEFAULT 1,
      created_at_utc          timestamptz NOT NULL DEFAULT now(),
      updated_at_utc          timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_clt1_client_profile_client_id ON clt1.client_profile (client_id);
    CREATE INDEX idx_clt1_client_profile_application_id ON clt1.client_profile (application_id);

    -- client_classification_evidence — evidence attachments supporting a claimed client class.
    -- Phase 1 code only ever inserts status='provided' rows (no verify/reject route this phase).
    CREATE TABLE clt1.client_classification_evidence (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      evidence_id        varchar(64) NOT NULL UNIQUE,
      application_id     varchar(64) NOT NULL,
      client_class       varchar(16) NOT NULL
                            CHECK (client_class IN ('institutional','hnwi','professional','retail','unknown')),
      evidence_type      varchar(32) NOT NULL,
      evidence_ref       varchar(256) NOT NULL,
      status             varchar(16) NOT NULL DEFAULT 'provided'
                            CHECK (status IN ('provided','verified','rejected','expired')),
      verified_by        varchar(64),
      verified_at_utc    timestamptz,
      rejection_reason   text,
      created_by         varchar(64) NOT NULL,
      created_at_utc     timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_clt1_classification_evidence_application_id ON clt1.client_classification_evidence (application_id);

    -- consent_record — append-only consent capture. No revoke route this phase (revoked_at_utc
    -- stays unpopulated); consent_type enum intentionally not constrained here — the blueprint's
    -- own final consent-type list is still an open item (Doc00/blueprint cross-reference).
    CREATE TABLE clt1.consent_record (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      consent_id         varchar(64) NOT NULL UNIQUE,
      application_id     varchar(64) NOT NULL,
      consent_type       varchar(32) NOT NULL,
      consent_version    varchar(16) NOT NULL,
      consent_given      boolean NOT NULL,
      given_by           varchar(64) NOT NULL,
      given_at_utc       timestamptz NOT NULL,
      revoked_at_utc     timestamptz,
      source             varchar(32),
      created_at_utc     timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_clt1_consent_record_application_id_type ON clt1.consent_record (application_id, consent_type);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS clt1.consent_record;
    DROP TABLE IF EXISTS clt1.client_classification_evidence;
    DROP TABLE IF EXISTS clt1.client_profile;
    DROP TABLE IF EXISTS clt1.client_application;
    DROP SCHEMA IF EXISTS clt1;
  `);
};
