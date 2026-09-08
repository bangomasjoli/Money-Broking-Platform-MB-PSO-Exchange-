/* eslint-disable camelcase */

/**
 * 023_clt1_authorised_users_mandates — CLT-01 Phase 3 (blueprint v1.1 `05_Database_Design.md`
 * §2.4/§2.5, adapted to the approved Phase 3 scope). Creates `clt1.authorised_user` and
 * `clt1.client_mandate` (the operational concepts only — `clt1.authorised_party`, the
 * screening/UBO-linked blueprint table, is deliberately deferred entirely, not partially built),
 * plus their own request/apply binding tables (`clt1.authorised_user_decision_request`,
 * `clt1.client_mandate_decision_request`, both documented extensions beyond the blueprint,
 * mirroring `clt1.application_decision_request`'s exact shape from migration 021). Also closes
 * Phase 2 carry-forward L2: adds `UNIQUE(application_id)` to `clt1.client_profile`.
 *
 * ---------------------------------------------------------------------------------------
 * `clt1.authorised_user` — operational signing-authority record, NOT identity verification.
 * ---------------------------------------------------------------------------------------
 * `role` is the blueprint's own real enum (`client_admin`/`client_maker`/`client_approver`/
 * `viewer`) — not the task brief's own suggested list (`director`/`beneficial_owner`/`trader`/
 * etc.), which is actually `clt1.authorised_party.party_type` from the deferred table, conflated
 * in the brief's own framing. `user_reference` is a DECLARED string (name/email/external
 * reference) — never a foreign key to `iam.user_identity`. Confirmed by direct inspection of
 * `services/iam/src`: `user_type` does have a `'client'` value in its CHECK constraint, but the
 * ONLY code path that ever inserts a `user_identity` row is the one-time bootstrap admin — there
 * is no client-user registration route anywhere in the accepted IAM-01 build. Connecting to a
 * real client login here would be connecting to something that cannot yet be created.
 * `user_reference` is stored-but-never-returned PII-adjacent data, exact precedent as Phase 1's
 * `legal_name`/`applicant_email`. No screening columns (`identity_verification_status`/
 * `sanctions_pep_status`/`screening_outcome_ref`/`authority_evidence_ref` from the blueprint's
 * full column list) are added — deferred alongside the screening engine itself, not invented as
 * dead columns.
 *
 * The row does not exist in any "pending" state — mirroring `client_profile`'s own precedent
 * exactly, `add/apply` inserts it directly at `status='active'`; there is nothing to be pending
 * on the row itself, since the proposal lives entirely in `authorised_user_decision_request`.
 *
 * ---------------------------------------------------------------------------------------
 * `clt1.client_mandate` — no `'draft'`/`'approval_required'`/`'rejected'` row-state, deliberately.
 * ---------------------------------------------------------------------------------------
 * The blueprint's own Mandate State diagram (`06_State_Machine.md` diagram 3) shows
 * `draft -> approval_required -> {active, rejected}`. This migration deliberately does NOT model
 * that per-row state machine — mirroring `client_profile`'s own accepted deviation, the
 * `client_mandate` row is created only at a successful `create/apply`, directly as `'active'`.
 * The `draft`/`approval_required` prefix is realised entirely by `client_mandate_decision_
 * request`'s own `requested -> applied` lifecycle, not by a half-approved row in the real table.
 * `iam2_dual_auth_policy_ref` is kept nullable for blueprint-schema fidelity and is NEVER
 * populated this phase — direct inspection of the accepted IAM-02 implementation (permission
 * guard, approval/execute-verify, maker-checker/SoD, step-up — Phases 0-5) confirms there is no
 * "WF-IAM02-10" policy object, no policy concept at all. The blueprint references an IAM-02
 * contract that was never built. Real dual-authorisation for Phase 3 is achieved entirely through
 * CLT-01's own maker-checker (request/apply + execute-verify) on `create`/`update` — not through
 * any IAM-02-side policy, which does not exist to reference.
 *
 * `rules` is constrained to `jsonb_typeof(rules) = 'object'` as a defense-in-depth backstop —
 * full key/shape validation (six allowed keys only, no arbitrary JSON) is TypeBox's job at the
 * API boundary (services/clt1/src/lib/mandates.ts), consistent with how this codebase treats
 * Postgres CHECK as a backstop, not the primary schema authority.
 *
 * Partial unique index `idx_clt1_client_mandate_one_active_per_client` enforces at most one
 * active mandate per client at the DB level — mirrors CFG-01 Phase 3B's own
 * `cfg1_kill_switch_one_active_per_feature` partial-unique-index precedent exactly. "Activate" is
 * consolidated into "create" — since the row never exists in a pre-active state, there is no
 * separate activation step; the brief's own "create/update/activate" workflow collapses to two
 * actions, the same simplification `client_profile` already made against a literal blueprint
 * state diagram.
 *
 * ---------------------------------------------------------------------------------------
 * Decision-request tables — one table per entity, `decision_type` variant within it (mirrors
 * `cfg1.feature_state_change`'s own `to_state` variant, not two separate tables).
 * ---------------------------------------------------------------------------------------
 * `authorised_user_decision_request.decision_type IN ('add','remove')`;
 * `client_mandate_decision_request.decision_type IN ('create','update')`. Both add/remove are
 * maker-checker per blueprint Maker-Checker Required item 5 verbatim ("Authorised user
 * addition/removal") — followed literally, not the capability-increasing/-reducing
 * proportionality rule that would have put `remove` single-step, because the blueprint's own
 * reasoning here is that BOTH directions of signing-authority change are abuse-prone. Suspend/
 * reactivate never write a row here — single-step, permission-gated only (approved Phase 3
 * design decision).
 */

const APPLY_STATUS_ENUM = `('requested','applied','cancelled','failed')`;

exports.up = (pgm) => {
  pgm.sql(`
    -- Phase 2 carry-forward L2: structural duplicate-profile backstop.
    ALTER TABLE clt1.client_profile
      ADD CONSTRAINT client_profile_application_id_key UNIQUE (application_id);

    CREATE TABLE clt1.authorised_user (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      authorised_user_id  varchar(64) NOT NULL UNIQUE,
      client_id           varchar(64) NOT NULL REFERENCES clt1.client_profile (client_id),
      user_reference       varchar(256) NOT NULL,
      role                 varchar(32) NOT NULL
                              CHECK (role IN ('client_admin','client_maker','client_approver','viewer')),
      status               varchar(16) NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','inactive','suspended','revoked')),
      approval_id          varchar(64),
      requested_by         varchar(64) NOT NULL,
      version              int NOT NULL DEFAULT 1,
      created_at_utc       timestamptz NOT NULL DEFAULT now(),
      updated_at_utc       timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_clt1_authorised_user_client_id_status ON clt1.authorised_user (client_id, status);

    CREATE TABLE clt1.client_mandate (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      mandate_id               varchar(64) NOT NULL UNIQUE,
      client_id                varchar(64) NOT NULL REFERENCES clt1.client_profile (client_id),
      mandate_type             varchar(32) NOT NULL
                                  CHECK (mandate_type IN ('standard','custom','institutional')),
      rules                    jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'object'),
      mandate_schema_version   varchar(16) NOT NULL DEFAULT 'v1',
      iam2_dual_auth_policy_ref varchar(64),
      status                   varchar(16) NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active','inactive','expired','revoked')),
      effective_from_utc      timestamptz,
      expires_at_utc           timestamptz,
      approval_id              varchar(64),
      requested_by             varchar(64) NOT NULL,
      version                  int NOT NULL DEFAULT 1,
      created_at_utc           timestamptz NOT NULL DEFAULT now(),
      updated_at_utc           timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_clt1_client_mandate_client_id_status ON clt1.client_mandate (client_id, status);
    CREATE UNIQUE INDEX idx_clt1_client_mandate_one_active_per_client
      ON clt1.client_mandate (client_id) WHERE (status = 'active');

    CREATE TABLE clt1.authorised_user_decision_request (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      decision_id                varchar(64) NOT NULL UNIQUE,
      client_id                  varchar(64) NOT NULL REFERENCES clt1.client_profile (client_id),
      decision_type               varchar(16) NOT NULL CHECK (decision_type IN ('add','remove')),
      target_authorised_user_id   varchar(64) REFERENCES clt1.authorised_user (authorised_user_id),
      user_reference               varchar(256),
      role                         varchar(32),
      reason                       varchar(128),
      requested_by                 varchar(64) NOT NULL,
      approval_id                  varchar(64),
      decision_token_hash          varchar(128),
      status                       varchar(16) NOT NULL DEFAULT 'requested' CHECK (status IN ${APPLY_STATUS_ENUM}),
      payload_hash                 varchar(128) NOT NULL,
      request_id                   varchar(128),
      correlation_id               varchar(128),
      created_at_utc                timestamptz NOT NULL DEFAULT now(),
      applied_at_utc                timestamptz
    );

    CREATE INDEX idx_clt1_authorised_user_decision_request_client_id_status
      ON clt1.authorised_user_decision_request (client_id, status);

    CREATE TABLE clt1.client_mandate_decision_request (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      decision_id               varchar(64) NOT NULL UNIQUE,
      client_id                  varchar(64) NOT NULL REFERENCES clt1.client_profile (client_id),
      decision_type                varchar(16) NOT NULL CHECK (decision_type IN ('create','update')),
      target_mandate_id            varchar(64) REFERENCES clt1.client_mandate (mandate_id),
      mandate_type                 varchar(32),
      rules                         jsonb CHECK (rules IS NULL OR jsonb_typeof(rules) = 'object'),
      mandate_schema_version        varchar(16) NOT NULL DEFAULT 'v1',
      reason                        varchar(128),
      requested_by                  varchar(64) NOT NULL,
      approval_id                   varchar(64),
      decision_token_hash           varchar(128),
      status                        varchar(16) NOT NULL DEFAULT 'requested' CHECK (status IN ${APPLY_STATUS_ENUM}),
      payload_hash                  varchar(128) NOT NULL,
      request_id                    varchar(128),
      correlation_id                varchar(128),
      created_at_utc                 timestamptz NOT NULL DEFAULT now(),
      applied_at_utc                 timestamptz
    );

    CREATE INDEX idx_clt1_client_mandate_decision_request_client_id_status
      ON clt1.client_mandate_decision_request (client_id, status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS clt1.client_mandate_decision_request;
    DROP TABLE IF EXISTS clt1.authorised_user_decision_request;
    DROP TABLE IF EXISTS clt1.client_mandate;
    DROP TABLE IF EXISTS clt1.authorised_user;
    ALTER TABLE clt1.client_profile DROP CONSTRAINT IF EXISTS client_profile_application_id_key;
  `);
};
