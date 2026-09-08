/* eslint-disable camelcase */

/**
 * 031_clt1_client_profile_lifecycle — CLT-01 Phase 8 (client_profile lifecycle baseline).
 * Creates `clt1.client_profile_lifecycle_decision_request` only — the request/apply binding table
 * for suspend/reactivate/close, mirroring `application_decision_request` (migration 021) and
 * `authorised_user_decision_request`/`client_mandate_decision_request` (migration 023) exactly:
 * one table, `decision_type` variant within it, not three separate tables per action.
 *
 * `client_profile.status`'s own CHECK constraint (migration 020) already permits `'suspended'`
 * and `'closed'` — it was defined with the full blueprint value set
 * (`'pending','active_limited','active','suspended','restricted','closed'`) for forward
 * compatibility from day one, the same discipline every other CLT-01 CHECK constraint has used
 * since Phase 1. Phase 8 makes `suspended`/`closed` REACHABLE via real routes; it does not alter
 * the CHECK, and does not add any column to `client_profile` — `reason`/`evidence_ref` live only
 * on the decision-request row (approved Phase 8 design decision), never on the profile itself.
 *
 * `client_id` carries a real FK to `clt1.client_profile (client_id)` — the first CLT-01
 * decision-request table able to do so, since `client_profile.client_id` has carried a UNIQUE
 * index since migration 020 (Phase 5/6's polymorphic subject/matched columns could not FK for the
 * same reason `related_party_edge`/`duplicate_candidate` never could).
 */

const APPLY_STATUS_ENUM = `('requested','applied','cancelled','failed')`;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE clt1.client_profile_lifecycle_decision_request (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      decision_id          varchar(64) NOT NULL UNIQUE,
      client_id            varchar(64) NOT NULL REFERENCES clt1.client_profile (client_id),
      decision_type        varchar(16) NOT NULL CHECK (decision_type IN ('suspend','reactivate','close')),
      reason               varchar(256),
      evidence_ref         varchar(128),
      requested_by         varchar(64) NOT NULL,
      approval_id          varchar(64),
      decision_token_hash  varchar(128),
      status               varchar(16) NOT NULL DEFAULT 'requested' CHECK (status IN ${APPLY_STATUS_ENUM}),
      payload_hash         varchar(128) NOT NULL,
      request_id           varchar(128),
      correlation_id       varchar(128),
      created_at_utc       timestamptz NOT NULL DEFAULT now(),
      applied_at_utc       timestamptz
    );

    CREATE INDEX idx_clt1_client_profile_lifecycle_decision_request_client_id_status
      ON clt1.client_profile_lifecycle_decision_request (client_id, status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS clt1.client_profile_lifecycle_decision_request;
  `);
};
