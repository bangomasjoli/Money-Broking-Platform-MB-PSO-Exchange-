/* eslint-disable camelcase */

/**
 * 016_cfg1_mutation_workflow — CFG-01 Phase 3A governed write-path tables (blueprint
 * `05_Database_Design.md` §2.4, extended per approved Phase 3A decision #4).
 *
 * Creates `cfg1.feature_state_change` (blueprint §2.4, as-designed) and
 * `cfg1.licence_profile_change` (NOT in the blueprint's own table list — a documented
 * extension, approved decision #4: the blueprint defines a change-request table for features
 * but none for licence profiles, even though `07_Permission_Rules.md` §4/§5 and the approved
 * Phase 3A scope both require a licence-profile change workflow with its own maker/approval/
 * version trail. `licence_profile_change` mirrors `feature_state_change`'s own shape field-
 * for-field wherever the concepts line up (a licence profile has a `status`, not a `state`, per
 * `cfg1.licence_profile.licence_status`'s own column naming — see migration 014 — so
 * `from_status`/`to_status` are used here instead of `from_state`/`to_state`).
 *
 * No maker-checker/approval tables are created here (approved decision #2: CFG-01 does not
 * build its own approval workflow). `approval_id`/`decision_token_hash` are references into
 * IAM-02's OWN `iam2.approval_request`/`iam2.permission_decision_token` tables (opaque strings
 * from CFG-01's point of view) — CFG-01 never queries those tables directly (no `iam2.*` grant,
 * F3(c) import boundary); it only stores IAM-02's `approval_id` as an audit trail reference and
 * the SHA-256 hash of the raw decision token it was presented with (never the raw token itself
 * — approved decision #1's "no raw tokens stored" carries forward from Phase 2's
 * `feature_decision_token.token_hash` convention to this table too, even though here the token
 * is minted by IAM-02, not CFG-01 itself).
 *
 * Status values follow the approved Phase 3A task brief's enum exactly, but only TWO are actually
 * reachable by any Phase 3A code path: `requested` (row created, nothing else has happened —
 * also the state a row is LEFT in if a later apply attempt fails for any reason, including after
 * IAM-02's decision token has already been consumed; see `routes/feature-changes.ts`/
 * `routes/licence-changes.ts` header comments for why no separate "mark as failed" write is
 * attempted — a `requested` row is always safely retriable with a fresh IAM-02 approval) and
 * `applied` (terminal success). `approved` (CFG-01 never separately learns "IAM-02 approved but
 * not yet applied"; apply verifies-and-applies atomically in one step, mirroring SEC-01 Phase 5's
 * alert-close route), `rejected`/`cancelled` (no distinct reject/cancel route exists this phase),
 * `failed` (no code path forces this terminal state this phase — see above), and `rolled_back`
 * (no rollback mechanism exists this phase) are all defined-but-not-yet-reachable, same
 * "catalogued, not yet reachable" discipline as Phase 2's `CFG1_FEATURE_DENIED`.
 *
 * `payload_hash` is the immutable `fingerprint()` (canonical-JSON sha256, `@aix/foundation`) of
 * the exact payload an operator must bind their IAM-02 approval to — recomputed at apply time
 * from the CHANGE ROW itself (not the caller's re-submitted body) and passed to IAM-02's
 * `execute-verify` as `current_payload_hash`; any mismatch fails closed and never applies.
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- §2.4 feature_state_change — governed feature-registry write path. requested_by/approval_id
    -- are references to IAM-02 human-actor/approval identifiers, not FKs (F3(c) — CFG-01 has no
    -- grant into iam2.*).
    CREATE TABLE cfg1.feature_state_change (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      change_id               varchar(64) NOT NULL UNIQUE,
      feature_code            varchar(128) NOT NULL,
      from_state               varchar(16),
      to_state                 varchar(16) NOT NULL
                                  CHECK (to_state IN ('enabled','disabled','locked')),
      feature_name             varchar(256),
      licence_code              varchar(16)
                                   CHECK (licence_code IS NULL OR licence_code IN ('MB','PSO','EXCHANGE')),
      change_reason             text NOT NULL,
      requested_by              varchar(64) NOT NULL,
      approval_id                varchar(64),
      decision_token_hash        varchar(128),
      licence_profile_id          varchar(64),
      effective_at_utc             timestamptz,
      status                       varchar(16) NOT NULL DEFAULT 'requested'
                                      CHECK (status IN ('requested','approved','applied','rejected','cancelled','failed','rolled_back')),
      previous_version              int,
      new_version                    int,
      payload_hash                    varchar(128) NOT NULL,
      sec_audit_ref                    varchar(128),
      request_id                        varchar(128),
      correlation_id                     varchar(128),
      created_at_utc                      timestamptz NOT NULL DEFAULT now(),
      applied_at_utc                       timestamptz
    );

    CREATE INDEX idx_cfg1_feature_state_change_feature_code ON cfg1.feature_state_change (feature_code);
    CREATE INDEX idx_cfg1_feature_state_change_status ON cfg1.feature_state_change (status);
    CREATE INDEX idx_cfg1_feature_state_change_approval_id ON cfg1.feature_state_change (approval_id);
    CREATE INDEX idx_cfg1_feature_state_change_created_at ON cfg1.feature_state_change (created_at_utc);
    CREATE INDEX idx_cfg1_feature_state_change_payload_hash ON cfg1.feature_state_change (payload_hash);

    -- cfg1.licence_profile_change — documented blueprint extension (approved decision #4; see
    -- this migration's header comment). Mirrors feature_state_change's shape, substituting
    -- from_status/to_status for from_state/to_state to match cfg1.licence_profile's own
    -- licence_status column naming.
    CREATE TABLE cfg1.licence_profile_change (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      change_id               varchar(64) NOT NULL UNIQUE,
      licence_profile_id      varchar(64) NOT NULL,
      licence_code             varchar(16) NOT NULL
                                  CHECK (licence_code IN ('MB','PSO','EXCHANGE')),
      from_status               varchar(16),
      to_status                 varchar(16) NOT NULL
                                   CHECK (to_status IN ('approved','suspended','revoked')),
      change_reason              text NOT NULL,
      requested_by                varchar(64) NOT NULL,
      approval_id                  varchar(64),
      decision_token_hash          varchar(128),
      effective_at_utc               timestamptz,
      status                         varchar(16) NOT NULL DEFAULT 'requested'
                                        CHECK (status IN ('requested','approved','applied','rejected','cancelled','failed','rolled_back')),
      previous_version                int,
      new_version                      int,
      payload_hash                      varchar(128) NOT NULL,
      sec_audit_ref                      varchar(128),
      request_id                          varchar(128),
      correlation_id                       varchar(128),
      created_at_utc                        timestamptz NOT NULL DEFAULT now(),
      applied_at_utc                         timestamptz
    );

    CREATE INDEX idx_cfg1_licence_profile_change_licence_code ON cfg1.licence_profile_change (licence_code);
    CREATE INDEX idx_cfg1_licence_profile_change_status ON cfg1.licence_profile_change (status);
    CREATE INDEX idx_cfg1_licence_profile_change_approval_id ON cfg1.licence_profile_change (approval_id);
    CREATE INDEX idx_cfg1_licence_profile_change_created_at ON cfg1.licence_profile_change (created_at_utc);
    CREATE INDEX idx_cfg1_licence_profile_change_payload_hash ON cfg1.licence_profile_change (payload_hash);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS cfg1.licence_profile_change;
    DROP TABLE IF EXISTS cfg1.feature_state_change;
  `);
};
