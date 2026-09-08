/* eslint-disable camelcase */

/**
 * 002_iam_auth_session — IAM-01 Authentication / MFA / Session schema.
 * Creates schema `iam` and its baseline tables (blueprint §05). Mirrors the conventions
 * established in 001_fnd_core.cjs: raw SQL, uuid gen_random_uuid() PKs, timestamptz UTC,
 * CHECK constraints on status enums, hash-only storage for tokens/secrets.
 *
 * This migration creates the FULL table set from blueprint §05.2 even though Phase 1
 * (this pass) only exercises a subset of them (user_identity, credential_password,
 * session, refresh_token, account_lockout, device_registry, session_policy, auth_event,
 * mfa_challenge). The remainder (mfa_factor, password_reset_token, service_account,
 * step_up_assertion, session_anomaly, mfa_reset_request, password_history) are DEFERRED —
 * see IAM-01_IMPLEMENTATION_NOTES.md — but the schema is landed now per the F3 module-
 * boundary work so the second schema exists in full for isolation testing.
 *
 * `iam.auth_event` is explicitly NON-authoritative: SEC-01's central audit store is the
 * store of record (blueprint §05.8). This table carries only safe index metadata plus
 * `audit_event_ref` and must never become a second source of truth.
 *
 * RLS (§05.6 rule 3, F3(b) DB backstop): ENABLE + FORCE ROW LEVEL SECURITY with a
 * user_id-ownership policy on the four client/user-owned tables named in scope: session,
 * refresh_token, device_registry, mfa_factor. The runtime role (role_iam_runtime, granted
 * in infra/grants/iam_runtime_grants.sql) is not the table owner, so RLS applies to it.
 * The app sets `aix.user_id` via `SELECT set_config('aix.user_id', $1, true)` per request
 * for owner-scoped reads; if it is never set, `current_setting(..., true)` is NULL and the
 * ownership predicate never matches — i.e. it fails closed, not open.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE SCHEMA IF NOT EXISTS iam;

    -- §2.1 user_identity
    CREATE TABLE iam.user_identity (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                  varchar(64) NOT NULL UNIQUE,
      user_type                varchar(16) NOT NULL CHECK (user_type IN ('client','staff','admin','service')),
      identifier_normalised    varchar(256) NOT NULL,
      identifier_hash          varchar(128) NOT NULL UNIQUE,
      status                   varchar(16) NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active','locked','suspended','deactivated')),
      mfa_required             boolean NOT NULL DEFAULT false,
      privileged_mfa_required  boolean NOT NULL DEFAULT false,
      user_class               varchar(24) NOT NULL
                                 CHECK (user_class IN ('admin','staff','client','client_approver','service')),
      -- Not in blueprint §05.2 verbatim; added as a sensible default (task-noted) to carry
      -- decision #3 (break-glass bootstrap admin) without building IAM-02's role model.
      is_interim_admin         boolean NOT NULL DEFAULT false,
      created_at_utc           timestamptz NOT NULL DEFAULT now(),
      updated_at_utc           timestamptz NOT NULL DEFAULT now()
    );

    -- §2.2 credential_password
    CREATE TABLE iam.credential_password (
      id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                       varchar(64) NOT NULL UNIQUE
                                      REFERENCES iam.user_identity (user_id),
      password_hash                 varchar(256) NOT NULL,
      hash_algorithm                varchar(32) NOT NULL DEFAULT 'argon2id',
      hash_params                   jsonb NOT NULL DEFAULT '{}'::jsonb,
      password_changed_at_utc       timestamptz NOT NULL DEFAULT now(),
      password_history_hashes_ref   varchar(128),
      must_change_password          boolean NOT NULL DEFAULT false,
      failed_attempt_count          int NOT NULL DEFAULT 0,
      locked_until_utc              timestamptz,
      created_at_utc                timestamptz NOT NULL DEFAULT now(),
      updated_at_utc                timestamptz NOT NULL DEFAULT now()
    );

    -- §2.3 mfa_factor — DEFERRED (no enrolment/verify endpoints this pass); table created now.
    -- RLS applies (F3(b) scope list).
    CREATE TABLE iam.mfa_factor (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      factor_id              varchar(64) NOT NULL UNIQUE,
      user_id                varchar(64) NOT NULL REFERENCES iam.user_identity (user_id),
      factor_type            varchar(24) NOT NULL CHECK (factor_type IN ('totp','webauthn','security_key','recovery')),
      factor_status          varchar(16) NOT NULL DEFAULT 'pending'
                               CHECK (factor_status IN ('pending','active','revoked')),
      secret_encrypted       text,
      public_key             text,
      credential_id_hash     varchar(128),
      phishing_resistant     boolean NOT NULL DEFAULT false,
      enrolled_at_utc        timestamptz,
      revoked_at_utc         timestamptz
    );

    -- §2.4 mfa_challenge — login MFA gate (blueprint §04.2.1) AND step-up challenges
    -- (challenge_type = 'step_up'; §04.2.12) share this table, matching its CHECK
    -- constraint which already allowed 'step_up'. purpose/action_scope are step-up-only
    -- fields (NULL for plain login/MFA challenges).
    CREATE TABLE iam.mfa_challenge (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      challenge_id         varchar(64) NOT NULL UNIQUE,
      user_id               varchar(64) NOT NULL REFERENCES iam.user_identity (user_id),
      factor_id             varchar(64),
      challenge_type        varchar(16) NOT NULL DEFAULT 'totp' CHECK (challenge_type IN ('totp','webauthn','step_up')),
      status                varchar(16) NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','passed','failed','expired')),
      expires_at_utc        timestamptz NOT NULL,
      idle_expires_at_utc   timestamptz,
      attempt_count         int NOT NULL DEFAULT 0,
      correlation_id        varchar(128),
      -- step_up-only (§04.2.12/2.13); NULL for login/MFA-enrolment challenges. No FK to
      -- iam.session: that table is created later in this same migration (§2.5), and a
      -- forward reference would fail at CREATE TABLE time — this column is a plain
      -- reference, consistent with correlation_id/factor_id above.
      purpose                varchar(64),
      action_scope            varchar(128),
      session_id                varchar(64),
      created_at_utc        timestamptz NOT NULL DEFAULT now(),
      completed_at_utc      timestamptz
    );

    -- §2.5 session (opaque access-token lookup by hash — decision #2). RLS applies.
    CREATE TABLE iam.session (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id               varchar(64) NOT NULL UNIQUE,
      -- Not named explicitly in blueprint §05.2's column list, but required by decision #2
      -- ("store ONLY sha256(token) ... validate by hashing + DB lookup"); session_id above
      -- is a non-secret handle (used for listing/revoke-by-id), session_token_hash is the
      -- secret-derived lookup key for the raw bearer access token.
      session_token_hash       varchar(128) NOT NULL UNIQUE,
      user_id                  varchar(64) NOT NULL REFERENCES iam.user_identity (user_id),
      session_status           varchar(16) NOT NULL DEFAULT 'active'
                                 CHECK (session_status IN ('active','expired','revoked')),
      issued_at_utc             timestamptz NOT NULL DEFAULT now(),
      expires_at_utc            timestamptz NOT NULL,
      revoked_at_utc            timestamptz,
      revoke_reason             varchar(64),
      user_class                varchar(24) NOT NULL,
      auth_level                varchar(16) NOT NULL DEFAULT 'password'
                                 CHECK (auth_level IN ('password','mfa','webauthn','step_up')),
      reauth_required_at_utc    timestamptz,
      bound_device_id           varchar(64),
      risk_status                varchar(24) NOT NULL DEFAULT 'normal'
                                 CHECK (risk_status IN ('normal','step_up_required','revoked')),
      device_id                  varchar(64),
      source_ip_hash             varchar(128),
      user_agent_hash             varchar(128),
      last_seen_at_utc            timestamptz,
      correlation_id              varchar(128)
    );

    -- §2.6 refresh_token (rotation + reuse detection — decision #2). RLS applies.
    CREATE TABLE iam.refresh_token (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      token_id                varchar(64) NOT NULL UNIQUE,
      token_hash              varchar(128) NOT NULL UNIQUE,
      token_family_id         varchar(64) NOT NULL,
      session_id               varchar(64) NOT NULL REFERENCES iam.session (session_id),
      user_id                  varchar(64) NOT NULL REFERENCES iam.user_identity (user_id),
      status                   varchar(16) NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','used','revoked','reused','expired')),
      issued_at_utc             timestamptz NOT NULL DEFAULT now(),
      expires_at_utc            timestamptz NOT NULL,
      used_at_utc                timestamptz,
      replaced_by_token_id        varchar(64)
    );

    -- §2.7 password_reset_token — DEFERRED (no reset endpoints this pass); table created now.
    CREATE TABLE iam.password_reset_token (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reset_id                varchar(64) NOT NULL UNIQUE,
      user_id                  varchar(64) REFERENCES iam.user_identity (user_id),
      token_hash                varchar(128) NOT NULL UNIQUE,
      status                    varchar(16) NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','used','expired','revoked')),
      expires_at_utc             timestamptz NOT NULL,
      requested_at_utc            timestamptz NOT NULL DEFAULT now(),
      used_at_utc                  timestamptz,
      request_context_ref          varchar(128)
    );

    -- §2.8 device_registry — basic token-binding capture only this pass (login records
    -- first/last seen); anomaly scoring beyond that is DEFERRED. RLS applies.
    CREATE TABLE iam.device_registry (
      id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      device_id                   varchar(64) NOT NULL,
      user_id                      varchar(64) NOT NULL REFERENCES iam.user_identity (user_id),
      device_fingerprint_hash      varchar(128),
      device_label                  varchar(128),
      first_seen_at_utc              timestamptz NOT NULL DEFAULT now(),
      last_seen_at_utc                timestamptz NOT NULL DEFAULT now(),
      trusted_status                  varchar(16) NOT NULL DEFAULT 'unknown'
                                     CHECK (trusted_status IN ('unknown','trusted','revoked')),
      risk_status                      varchar(16) NOT NULL DEFAULT 'normal'
                                     CHECK (risk_status IN ('normal','suspicious')),
      UNIQUE (user_id, device_id)
    );

    -- §2.9 account_lockout — IAM-side rate-limit/lockout state (decision #5). Written by the
    -- IAM runtime only; never in the foundation schema.
    CREATE TABLE iam.account_lockout (
      id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      scope_hash                       varchar(128) NOT NULL,
      user_id                           varchar(64),
      action                             varchar(16) NOT NULL CHECK (action IN ('login','mfa','reset','refresh')),
      failed_count                       int NOT NULL DEFAULT 0,
      locked_until_utc                    timestamptz,
      progressive_delay_until_utc           timestamptz,
      last_failure_at_utc                    timestamptz,
      UNIQUE (scope_hash, action)
    );

    -- §2.10 service_account — DEFERRED (no validate endpoint this pass); table created now.
    CREATE TABLE iam.service_account (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      service_account_id        varchar(64) NOT NULL UNIQUE,
      service_name                varchar(128) NOT NULL,
      status                        varchar(16) NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active','disabled','rotating')),
      credential_ref                 varchar(256),
      scope                            jsonb NOT NULL DEFAULT '[]'::jsonb,
      last_rotated_at_utc                timestamptz,
      expires_at_utc                       timestamptz
    );

    -- §2.11 step_up_assertion — DEFERRED (no step-up endpoints this pass); table created now.
    CREATE TABLE iam.step_up_assertion (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assertion_id           varchar(64) NOT NULL UNIQUE,
      assertion_hash          varchar(128) NOT NULL UNIQUE,
      user_id                  varchar(64) NOT NULL REFERENCES iam.user_identity (user_id),
      session_id                varchar(64) REFERENCES iam.session (session_id),
      device_id                  varchar(64),
      purpose                     varchar(64) NOT NULL,
      action_scope                 varchar(128),
      auth_level                    varchar(16) NOT NULL CHECK (auth_level IN ('password','mfa','webauthn')),
      issued_at_utc                  timestamptz NOT NULL DEFAULT now(),
      expires_at_utc                   timestamptz NOT NULL,
      status                            varchar(16) NOT NULL DEFAULT 'active'
                                      CHECK (status IN ('active','used','revoked','expired')),
      correlation_id                     varchar(128)
    );

    -- §2.12 session_policy — TTL/idle/reauth/concurrency by user class (§5.8). Seeded below
    -- with sensible interim defaults (blueprint §13 open item #17/#18 — final values TBD).
    CREATE TABLE iam.session_policy (
      id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_class                       varchar(24) NOT NULL
                                       CHECK (user_class IN ('admin','staff','client','client_approver','service')),
      access_token_ttl_seconds          int NOT NULL,
      refresh_token_ttl_seconds          int NOT NULL,
      -- Nullable: not every user class uses idle-timeout / periodic-reauth dimensions
      -- (e.g. service accounts have no interactive idle concept).
      idle_timeout_seconds                 int,
      max_session_lifetime_seconds           int NOT NULL,
      reauth_interval_seconds                  int,
      max_concurrent_sessions                    int NOT NULL,
      token_binding_level                          varchar(16) NOT NULL DEFAULT 'medium'
                                                  CHECK (token_binding_level IN ('strict','medium','low')),
      status                                        varchar(16) NOT NULL DEFAULT 'active'
                                                  CHECK (status IN ('active','inactive')),
      approved_ref                                   varchar(128),
      UNIQUE (user_class, status)
    );

    -- §2.13 session_anomaly — DEFERRED beyond basic token-binding capture; table created now.
    CREATE TABLE iam.session_anomaly (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      anomaly_id             varchar(64) NOT NULL UNIQUE,
      session_id               varchar(64) NOT NULL REFERENCES iam.session (session_id),
      user_id                    varchar(64) NOT NULL REFERENCES iam.user_identity (user_id),
      anomaly_type                 varchar(24) NOT NULL
                                  CHECK (anomaly_type IN ('ip_change','ua_change','device_change','risk_signal')),
      severity                       varchar(16) NOT NULL CHECK (severity IN ('low','medium','high')),
      action_taken                     varchar(16) NOT NULL CHECK (action_taken IN ('allow','step_up','revoke')),
      detected_at_utc                    timestamptz NOT NULL DEFAULT now(),
      correlation_id                       varchar(128)
    );

    -- §2.14 mfa_reset_request — DEFERRED (admin/staff MFA reset is disabled this pass, per
    -- blueprint §5.6 option 1, because no endpoint exists to trigger it); table created now.
    CREATE TABLE iam.mfa_reset_request (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reset_request_id         varchar(64) NOT NULL UNIQUE,
      user_id                    varchar(64) NOT NULL REFERENCES iam.user_identity (user_id),
      requested_by                 varchar(64) NOT NULL,
      request_type                   varchar(24) NOT NULL CHECK (request_type IN ('self_service','admin_initiated')),
      status                           varchar(24) NOT NULL DEFAULT 'pending'
                                      CHECK (status IN ('pending','approved','rejected','completed','disabled_until_iam02')),
      approval_mode                     varchar(32) NOT NULL DEFAULT 'disabled'
                                      CHECK (approval_mode IN
                                        ('iam01_dual_security_admin','iam02_maker_checker','manual_approved','disabled')),
      approval_ref                        varchar(128),
      requested_at_utc                      timestamptz NOT NULL DEFAULT now(),
      completed_at_utc                        timestamptz
    );

    -- §2.15 password_history — DEFERRED (reuse/breach checks not built this pass); table
    -- created now.
    CREATE TABLE iam.password_history (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                      varchar(64) NOT NULL REFERENCES iam.user_identity (user_id),
      password_hash_fingerprint      varchar(256) NOT NULL,
      algorithm                        varchar(32) NOT NULL,
      created_at_utc                     timestamptz NOT NULL DEFAULT now()
    );

    -- §2.16 auth_event — NON-authoritative read model. SEC-01 central audit store is the
    -- authoritative record (§05.8); this table carries only safe metadata + audit_event_ref.
    CREATE TABLE iam.auth_event (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type            varchar(64) NOT NULL,
      user_id                 varchar(64),
      result                    varchar(16) NOT NULL CHECK (result IN ('success','failure','blocked')),
      correlation_id              varchar(128) NOT NULL,
      occurred_at_utc                timestamptz NOT NULL DEFAULT now(),
      -- Reference into the FND outbox-published audit envelope (topic 'audit.event'); SEC-01
      -- is the eventual store of record. Interim reference format: "corr:<correlation_id>"
      -- (see IAM-01_IMPLEMENTATION_NOTES.md) since publishAudit() does not return an outbox
      -- row id to the caller.
      audit_event_ref                  varchar(256) NOT NULL
    );

    -- §3 indexes
    CREATE INDEX idx_iam_user_identity_hash ON iam.user_identity (identifier_hash);
    CREATE INDEX idx_iam_user_identity_user ON iam.user_identity (user_id);
    CREATE INDEX idx_iam_credential_password_user ON iam.credential_password (user_id);
    CREATE INDEX idx_iam_mfa_factor_user_status ON iam.mfa_factor (user_id, factor_status);
    CREATE INDEX idx_iam_mfa_challenge_id_status ON iam.mfa_challenge (challenge_id, status);
    CREATE INDEX idx_iam_session_id_status ON iam.session (session_id, session_status);
    CREATE INDEX idx_iam_session_user_status ON iam.session (user_id, session_status);
    CREATE INDEX idx_iam_refresh_token_hash ON iam.refresh_token (token_hash);
    CREATE INDEX idx_iam_refresh_token_family ON iam.refresh_token (token_family_id);
    CREATE INDEX idx_iam_password_reset_hash_status ON iam.password_reset_token (token_hash, status);
    CREATE INDEX idx_iam_device_registry_user_fp ON iam.device_registry (user_id, device_fingerprint_hash);
    CREATE INDEX idx_iam_account_lockout_scope_action ON iam.account_lockout (scope_hash, action);
    CREATE INDEX idx_iam_service_account_id_status ON iam.service_account (service_account_id, status);
    CREATE INDEX idx_iam_step_up_assertion_hash_status ON iam.step_up_assertion (assertion_hash, status);
    CREATE INDEX idx_iam_session_policy_class_status ON iam.session_policy (user_class, status);
    CREATE INDEX idx_iam_session_anomaly_session_sev ON iam.session_anomaly (session_id, severity);
    CREATE INDEX idx_iam_mfa_reset_request_user_status ON iam.mfa_reset_request (user_id, status);
    CREATE INDEX idx_iam_password_history_user_created ON iam.password_history (user_id, created_at_utc);

    -- §05.6 rule 3 / F3(b) DB backstop: RLS on client/user-owned tables. The runtime role
    -- (role_iam_runtime) is not the table owner, so these policies apply to it. The app sets
    -- aix.user_id via set_config(..., true) per request for owner-scoped queries; when unset,
    -- current_setting(..., true) is NULL and the predicate never matches (fail closed).
    ALTER TABLE iam.session ENABLE ROW LEVEL SECURITY;
    ALTER TABLE iam.session FORCE ROW LEVEL SECURITY;
    CREATE POLICY session_owner_isolation ON iam.session
      USING (user_id = current_setting('aix.user_id', true));

    ALTER TABLE iam.refresh_token ENABLE ROW LEVEL SECURITY;
    ALTER TABLE iam.refresh_token FORCE ROW LEVEL SECURITY;
    CREATE POLICY refresh_token_owner_isolation ON iam.refresh_token
      USING (user_id = current_setting('aix.user_id', true));

    ALTER TABLE iam.device_registry ENABLE ROW LEVEL SECURITY;
    ALTER TABLE iam.device_registry FORCE ROW LEVEL SECURITY;
    CREATE POLICY device_registry_owner_isolation ON iam.device_registry
      USING (user_id = current_setting('aix.user_id', true));

    ALTER TABLE iam.mfa_factor ENABLE ROW LEVEL SECURITY;
    ALTER TABLE iam.mfa_factor FORCE ROW LEVEL SECURITY;
    CREATE POLICY mfa_factor_owner_isolation ON iam.mfa_factor
      USING (user_id = current_setting('aix.user_id', true));

    -- §5.8 session_policy seed — sensible interim defaults (final values are blueprint §13
    -- open items #17/#18). Privileged (admin/staff) TTL is shorter than client per §5.8.
    INSERT INTO iam.session_policy
      (user_class, access_token_ttl_seconds, refresh_token_ttl_seconds, idle_timeout_seconds,
       max_session_lifetime_seconds, reauth_interval_seconds, max_concurrent_sessions,
       token_binding_level, status, approved_ref)
    VALUES
      ('admin',            600,  28800,   900,  28800,  3600, 3, 'strict', 'active', 'interim_default'),
      ('staff',            900,  57600,  1800,  57600,  7200, 5, 'strict', 'active', 'interim_default'),
      ('client',          1800, 1209600,  3600, 1209600, NULL, 10, 'medium', 'active', 'interim_default'),
      ('client_approver',  900,  604800,  1800,  604800, 10800, 5, 'medium', 'active', 'interim_default'),
      ('service',          900,  2592000, NULL, 2592000, NULL, 20, 'low',   'active', 'interim_default');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP SCHEMA IF EXISTS iam CASCADE;`);
};
