/* eslint-disable camelcase */

/**
 * 018_cfg1_kill_switch — CFG-01 Phase 3B kill-switch workflow (blueprint
 * `05_Database_Design.md` §2.7 `cfg1.kill_switch`, extended per approved Phase 3B decisions).
 *
 * Three tables, feature-scoped only (approved decisions #1/#2): `cfg1.kill_switch` (current
 * state, one row per feature_code ever kill-switched), `cfg1.kill_switch_deactivation_request`
 * (a documented extension beyond the blueprint's own single-table design — see below), and
 * `cfg1.kill_switch_event` (append-only audit trail).
 *
 * ---------------------------------------------------------------------------------------
 * `cfg1.kill_switch_deactivation_request` — documented extension, same class as Phase 3A's
 * `cfg1.licence_profile_change` (approved decision from that phase's own migration 016).
 * ---------------------------------------------------------------------------------------
 * The blueprint's own `cfg1.kill_switch` table has a single `approval_id` column and no
 * separate request-tracking table. Deactivation, per approved decision #5, needs the SAME
 * request-then-apply, IAM-02-approval-bound pattern Phase 3A already proved for feature/licence
 * mutations (`feature_state_change`/`licence_profile_change`) — a MUTABLE row with a
 * `FOR UPDATE`-lockable `status` column that transitions `requested` -> `applied`. Overloading
 * the append-only `kill_switch_event` log to also serve this role (searching for "the latest
 * unresolved event") would either break its append-only invariant or require a fragile
 * "no later terminal event exists" query — a real race-condition risk avoided entirely by
 * reusing the proven `feature_state_change`-shaped table pattern instead.
 *
 * ---------------------------------------------------------------------------------------
 * Approved decisions #3/#12 — deliberately NOT included this phase:
 * ---------------------------------------------------------------------------------------
 * No `scope` jsonb column (feature-scoped only — `feature_code` is the only targeting
 * dimension; environment/client-class scoping remains STRUCTURALLY N/A here exactly as it
 * already is on `cfg1.feature` itself per `lib/decision.ts`'s own precedence-chain comments).
 * No global/platform-wide kill-switch. No participation in `cfg1.config_integrity_seal` /
 * `resealScope` / the Doc00-baseline system — kill-switch is live operational/emergency state
 * with no Doc00 regulatory anchor, unlike licence_profile/prohibited_registry; it is read
 * directly and freshly on every decision, the same way `cfg1.feature.current_state` itself is
 * trusted once the AGGREGATE licence/prohibited scopes have already passed integrity, not
 * because `feature`/`kill_switch` rows are individually sealed.
 *
 * No maker-checker/approval tables are created here (mirrors approved decision #2 from Phase
 * 3A) — `approval_id`/`decision_token_hash` are references into IAM-02's OWN tables (opaque
 * strings from CFG-01's point of view; no `iam2.*` grant, F3(c)). No raw decision token is ever
 * stored — only its sha256 hash, same convention as `feature_state_change`/
 * `licence_profile_change`.
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- §2.7 kill_switch — current state, one row per feature_code ever kill-switched. Reactivating
    -- a previously-deactivated switch reuses the SAME row (version incremented), rather than
    -- creating a new row each cycle — cfg1.kill_switch_event is the full history; this table is
    -- only ever "what is true right now".
    CREATE TABLE cfg1.kill_switch (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kill_switch_id        varchar(64) NOT NULL UNIQUE,
      feature_code          varchar(128) NOT NULL,
      reason                text NOT NULL,
      evidence_ref          varchar(128),
      activated_by          varchar(64) NOT NULL,
      activation_request_id varchar(128),
      status                varchar(16) NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active','inactive')),
      activated_at_utc      timestamptz NOT NULL,
      deactivated_at_utc    timestamptz,
      version               int NOT NULL DEFAULT 1,
      created_at_utc        timestamptz NOT NULL DEFAULT now(),
      updated_at_utc        timestamptz NOT NULL DEFAULT now()
    );

    -- Structural, DB-enforced "at most one ACTIVE kill-switch per feature_code" invariant —
    -- directly reuses the exact proven pattern from migration 014's
    -- cfg1_config_integrity_seal_one_active_per_scope partial unique index. A concurrent
    -- double-activation attempt for the SAME feature_code fails at the database level, not
    -- merely an application-level race that could be lost.
    CREATE UNIQUE INDEX cfg1_kill_switch_one_active_per_feature
      ON cfg1.kill_switch (feature_code) WHERE status = 'active';

    CREATE INDEX idx_cfg1_kill_switch_feature_code ON cfg1.kill_switch (feature_code);
    CREATE INDEX idx_cfg1_kill_switch_status ON cfg1.kill_switch (status);

    -- cfg1.kill_switch_deactivation_request — mutable request/apply row, mirrors
    -- cfg1.feature_state_change's own shape field-for-field (migration 016). See this
    -- migration's header comment for why this table exists beyond the blueprint's own design.
    CREATE TABLE cfg1.kill_switch_deactivation_request (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      change_id            varchar(64) NOT NULL UNIQUE,
      kill_switch_id       varchar(64) NOT NULL,
      feature_code         varchar(128) NOT NULL,
      change_reason        text NOT NULL,
      requested_by         varchar(64) NOT NULL,
      approval_id          varchar(64),
      decision_token_hash  varchar(128),
      status               varchar(16) NOT NULL DEFAULT 'requested'
                              CHECK (status IN ('requested','applied','rejected','cancelled','failed')),
      payload_hash         varchar(128) NOT NULL,
      request_id           varchar(128),
      correlation_id       varchar(128),
      created_at_utc       timestamptz NOT NULL DEFAULT now(),
      applied_at_utc       timestamptz
    );

    CREATE INDEX idx_cfg1_ks_deactivation_request_kill_switch_id ON cfg1.kill_switch_deactivation_request (kill_switch_id);
    CREATE INDEX idx_cfg1_ks_deactivation_request_feature_code ON cfg1.kill_switch_deactivation_request (feature_code);
    CREATE INDEX idx_cfg1_ks_deactivation_request_status ON cfg1.kill_switch_deactivation_request (status);
    CREATE INDEX idx_cfg1_ks_deactivation_request_approval_id ON cfg1.kill_switch_deactivation_request (approval_id);

    -- cfg1.kill_switch_event — pure append-only audit trail. Never UPDATEd, only INSERTed —
    -- same posture as cfg1.feature_decision_log / cfg1.feature_version.
    CREATE TABLE cfg1.kill_switch_event (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id         varchar(64) NOT NULL UNIQUE,
      kill_switch_id   varchar(64) NOT NULL,
      feature_code     varchar(128) NOT NULL,
      event_type       varchar(32) NOT NULL
                          CHECK (event_type IN ('activated','deactivation_requested','deactivated','deactivation_rejected','failed')),
      actor_id         varchar(64) NOT NULL,
      reason           text,
      evidence_ref     varchar(128),
      approval_id      varchar(64),
      payload_hash     varchar(128) NOT NULL,
      audit_event_ref  varchar(128),
      created_at_utc   timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_cfg1_kill_switch_event_kill_switch_id ON cfg1.kill_switch_event (kill_switch_id);
    CREATE INDEX idx_cfg1_kill_switch_event_feature_code ON cfg1.kill_switch_event (feature_code);
    CREATE INDEX idx_cfg1_kill_switch_event_type ON cfg1.kill_switch_event (event_type);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS cfg1.kill_switch_event;
    DROP TABLE IF EXISTS cfg1.kill_switch_deactivation_request;
    DROP TABLE IF EXISTS cfg1.kill_switch;
  `);
};
