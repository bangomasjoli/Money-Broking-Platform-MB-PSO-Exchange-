/* eslint-disable camelcase */

/**
 * 021_clt1_cdd_final_approval — CLT-01 Phase 2 (blueprint v1.1 `05_Database_Design.md` §2.7/§2.11
 * adapted to the approved Phase 2 scope). Extends `client_application` with CDD-outcome rollup +
 * decision columns, and creates three new tables: `cdd_outcome` (append-only received-outcome
 * log), `handoff_status` (delivery-tracking only, blueprint data rule 12: delivery status is kept
 * separate from outcome status), and `application_decision_request` (a documented extension
 * beyond the blueprint, same class as `cfg1.feature_state_change` — CLT-01's own request/apply
 * maker-checker binding row for the `approve` action only; `reject`/`hold` are single-step
 * IAM-02-permission-gated actions this phase and never use this table, per the approved Phase 2
 * design decision that only the capability-granting action needs the full ceremony).
 *
 * ---------------------------------------------------------------------------------------
 * Canonical CDD outcome-status enum — ONE shared enum across all 4 outcome types.
 * ---------------------------------------------------------------------------------------
 * The blueprint itself uses three different vocabularies across `cdd_outcome.outcome_status`
 * ("pass/clear/fail/hit/rejected/pending/stale/remediation_required"), `aml_sanctions_status`
 * ("clear/hit/pending/stale"), and `risk_rating_status` ("rated/pending/rejected/stale") for what
 * is functionally the same "how did this outcome turn out" concept. Approved Phase 2 design
 * decision: normalise to ONE canonical enum, applied uniformly to every outcome type and every
 * rollup column — `pending, pass, fail, hit, rejected, stale, remediation_required, unavailable,
 * not_required` — with `pass` as the single canonical "good" value regardless of type (an AML
 * "clear" or a risk-rating "rated_and_acceptable" is stored as `pass`). `unavailable`/
 * `not_required` are pragmatic additions beyond the blueprint's own literal list, needed so a
 * gate check has an explicit way to represent "asked and got nothing" vs "not asked yet"
 * (`pending`) without inventing a NULL-handling special case.
 *
 * `client_application` gains four rollup columns (`cdd_outcome_status`, `aml_sanctions_status`,
 * `pep_adverse_media_status`, `risk_rating_status`, one per `cdd_outcome.outcome_type`) — "latest
 * received outcome wins" per type, updated in the same transaction every time a
 * `POST .../outcomes` call inserts a new `cdd_outcome` row. Approval requires all four to read
 * `pass` (services/clt1/src/lib/outcomes.ts).
 *
 * `application_decision_request.client_class_claimed` is a SNAPSHOT taken at request time, not a
 * live join — `approve/apply` recomputes its payload_hash from this STORED row, never from a
 * fresh read of `client_application` (which the apply is about to mutate anyway), mirroring
 * `cfg1.feature_state_change`'s own `feature_name`/`licence_code` snapshot columns exactly.
 *
 * CHECK constraints carry values beyond what Phase 2 code paths actually produce (e.g.
 * `handoff_status.delivery_status` includes `sent/received/failed/deadlettered/completed` even
 * though Phase 2 code only ever writes `pending`; `application_decision_request.status` includes
 * `cancelled/failed` even though a failed apply rolls the row back to `requested` rather than
 * writing a terminal `failed` row) — same forward-compatibility discipline as migration 020's own
 * `client_application.status` CHECK.
 *
 * FK hardening (approved Phase 2 design decision): Phase 1 tables (`client_classification_
 * evidence`, `consent_record`) are left exactly as they were — no retrofit migration touching an
 * already-accepted baseline for a cosmetic gain. All three NEW Phase 2 tables get a real FK to
 * `client_application(application_id)` from day one, since that costs nothing on a table that
 * doesn't exist yet. `client_profile.application_id` also gets an FK now, added retroactively —
 * safe because zero Phase 1 code path ever inserted a `client_profile` row (migration 020's own
 * header comment), so there is no existing data that could violate it.
 */

const CDD_STATUS_ENUM = `('pending','pass','fail','hit','rejected','stale','remediation_required','unavailable','not_required')`;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE clt1.client_application
      ADD COLUMN cdd_outcome_status       varchar(24) NOT NULL DEFAULT 'pending' CHECK (cdd_outcome_status IN ${CDD_STATUS_ENUM}),
      ADD COLUMN aml_sanctions_status     varchar(24) NOT NULL DEFAULT 'pending' CHECK (aml_sanctions_status IN ${CDD_STATUS_ENUM}),
      ADD COLUMN pep_adverse_media_status varchar(24) NOT NULL DEFAULT 'pending' CHECK (pep_adverse_media_status IN ${CDD_STATUS_ENUM}),
      ADD COLUMN risk_rating_status       varchar(24) NOT NULL DEFAULT 'pending' CHECK (risk_rating_status IN ${CDD_STATUS_ENUM}),
      ADD COLUMN approved_at_utc          timestamptz,
      ADD COLUMN rejected_at_utc          timestamptz,
      ADD COLUMN held_at_utc              timestamptz,
      ADD COLUMN approval_id              varchar(64),
      ADD COLUMN rejection_reason         varchar(64),
      ADD COLUMN hold_reason              varchar(64);

    -- cdd_outcome — append-only received-outcome log (blueprint §2.11, adapted). One row per
    -- received outcome; client_application's own rollup columns track "latest wins" per type.
    CREATE TABLE clt1.cdd_outcome (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      outcome_id         varchar(64) NOT NULL UNIQUE,
      application_id     varchar(64) NOT NULL REFERENCES clt1.client_application (application_id),
      client_id          varchar(64),
      source_module      varchar(32) NOT NULL,
      outcome_type       varchar(24) NOT NULL
                            CHECK (outcome_type IN ('kyc_kyb','aml_sanctions','pep_adverse_media','risk_rating')),
      outcome_status     varchar(24) NOT NULL CHECK (outcome_status IN ${CDD_STATUS_ENUM}),
      risk_rating        varchar(16) CHECK (risk_rating IN ('low','medium','high','prohibited')),
      valid_until_utc    timestamptz,
      received_at_utc    timestamptz NOT NULL DEFAULT now(),
      created_by         varchar(64) NOT NULL,
      request_id         varchar(128),
      correlation_id     varchar(128)
    );

    CREATE INDEX idx_clt1_cdd_outcome_application_id_type ON clt1.cdd_outcome (application_id, outcome_type);

    -- handoff_status — delivery/outcome TRACKING only (blueprint §2.7, adapted). No outbound call
    -- of any kind this phase (approved Design Issue 2): every Phase 2 code path only ever writes
    -- delivery_status = 'pending' at creation. outcome_status is intentionally left unpopulated by
    -- Phase 2 code (blueprint data rule 12: "Handoff delivery is separate from outcome status" —
    -- the received-outcome path (clt1.cdd_outcome) is NOT auto-linked back into this table).
    CREATE TABLE clt1.handoff_status (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      handoff_id         varchar(64) NOT NULL UNIQUE,
      application_id     varchar(64) NOT NULL REFERENCES clt1.client_application (application_id),
      client_id          varchar(64),
      target_module      varchar(16) NOT NULL CHECK (target_module IN ('KYC','AML')),
      delivery_status    varchar(16) NOT NULL DEFAULT 'pending'
                            CHECK (delivery_status IN ('pending','sent','received','failed','deadlettered','completed')),
      outcome_status     varchar(24) CHECK (outcome_status IN ${CDD_STATUS_ENUM}),
      retry_count        int NOT NULL DEFAULT 0,
      deadletter_reason  varchar(64),
      sent_at_utc        timestamptz,
      completed_at_utc   timestamptz,
      created_by         varchar(64) NOT NULL,
      created_at_utc     timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_clt1_handoff_status_application_id_target ON clt1.handoff_status (application_id, target_module);

    -- application_decision_request -- CLT-01's own request/apply binding row for the approve
    -- action ONLY (documented extension beyond the blueprint, mirrors cfg1.feature_state_change).
    -- decision is constrained to 'approve' alone: reject/hold are single-step this phase and never
    -- write a row here (approved Phase 2 design decision).
    CREATE TABLE clt1.application_decision_request (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      decision_id           varchar(64) NOT NULL UNIQUE,
      application_id        varchar(64) NOT NULL REFERENCES clt1.client_application (application_id),
      decision              varchar(16) NOT NULL DEFAULT 'approve' CHECK (decision IN ('approve')),
      client_class_claimed  varchar(16) NOT NULL
                               CHECK (client_class_claimed IN ('institutional','hnwi','professional','retail','unknown')),
      reason                varchar(256),
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

    CREATE INDEX idx_clt1_application_decision_request_application_id ON clt1.application_decision_request (application_id, status);

    -- FK hardening: client_profile.application_id -> client_application.application_id. Safe to
    -- add retroactively — zero Phase 1 code path ever inserted a client_profile row (migration
    -- 020's own header comment), so no existing row can violate it.
    ALTER TABLE clt1.client_profile
      ADD CONSTRAINT fk_clt1_client_profile_application_id
      FOREIGN KEY (application_id) REFERENCES clt1.client_application (application_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE clt1.client_profile DROP CONSTRAINT IF EXISTS fk_clt1_client_profile_application_id;
    DROP TABLE IF EXISTS clt1.application_decision_request;
    DROP TABLE IF EXISTS clt1.handoff_status;
    DROP TABLE IF EXISTS clt1.cdd_outcome;
    ALTER TABLE clt1.client_application
      DROP COLUMN IF EXISTS cdd_outcome_status,
      DROP COLUMN IF EXISTS aml_sanctions_status,
      DROP COLUMN IF EXISTS pep_adverse_media_status,
      DROP COLUMN IF EXISTS risk_rating_status,
      DROP COLUMN IF EXISTS approved_at_utc,
      DROP COLUMN IF EXISTS rejected_at_utc,
      DROP COLUMN IF EXISTS held_at_utc,
      DROP COLUMN IF EXISTS approval_id,
      DROP COLUMN IF EXISTS rejection_reason,
      DROP COLUMN IF EXISTS hold_reason;
  `);
};
