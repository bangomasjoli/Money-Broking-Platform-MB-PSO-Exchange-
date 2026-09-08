/* eslint-disable camelcase */

/**
 * 006_iam2_core — IAM-02 RBAC / Permission Guard / SoD schema (Phase 0-2 slice per
 * IAM-02_Implementation_Plan_v1.0; blueprint `05_Database_Design.md`).
 *
 * Creates schema `iam2` and the Phase 1-5 table set the plan identifies as the minimum for a
 * working guard: `role`, `permission`, `role_permission`, `user_role`,
 * `user_permission_override`, `approval_policy`, `approval_request`, `approval_decision`,
 * `sod_rule`, `sod_check`, `permission_decision_log`, `permission_decision_token`,
 * `permission_cache_version` (13 tables). Deliberately does NOT create the Phase 6/7 tables
 * (`delegation`, `temporary_permission`, `break_glass_request`, `protected_action_registry`,
 * `sod_risk_acceptance`, `break_glass_permission_whitelist`) — those are out of scope for
 * this build stage and land in a later additive migration, mirroring how 002/003/004 phased
 * IAM-01's own schema.
 *
 * ---------------------------------------------------------------------------------------
 * JUDGMENT CALL — no cross-schema FK from iam2 to iam.user_identity.
 * ---------------------------------------------------------------------------------------
 * Every `user_id`/`actor_user_id`/`maker_user_id`/`approver_user_id` column below is a plain
 * `varchar`, NOT a foreign key into `iam.user_identity`. IAM-02 is a separate service that
 * must reach IAM-01 only over HTTP (per F3(c) and the implementation plan's service-identity
 * section) — a DB-level cross-schema FK would be a structural coupling that bypasses that
 * boundary (and would additionally require reasoning about which role validates it). This
 * mirrors the fact that no other module's schema holds a literal FK into `iam.*` either.
 *
 * ---------------------------------------------------------------------------------------
 * JUDGMENT CALL — no DB-level cross-table CHECK constraints for `05_Database_Design.md`
 * §2.3/§2.5's business rules ("licence-locked/prohibited permissions cannot be active",
 * "deny override wins over allow", etc.).
 * ---------------------------------------------------------------------------------------
 * Postgres CHECK constraints cannot reference another table without a trigger, and adding
 * triggers to enforce cross-table business rules is exactly the kind of enforcement logic
 * this stage's brief reserves for `lib/guard.ts` (Phase 2) and later admin-mutation
 * endpoints (Phase 3+), not the schema layer. These rules are enforced in application code;
 * the schema only carries the structural shape (columns, FKs within `iam2`, status enums).
 *
 * ---------------------------------------------------------------------------------------
 * RLS DESIGN (per the task brief / IAM-02_Implementation_Plan_v1.0 §3, mirroring IAM-01's
 * S1-proven `aix.user_id` pattern and the C2 `aix.module` pattern):
 * ---------------------------------------------------------------------------------------
 *   - `role`, `permission`, `role_permission`, `sod_rule` — NO RLS. Global catalogues; there
 *     is no single "owner" of a role/permission/SoD-rule definition. (`sod_rule` is a
 *     conflict-matrix catalogue, same shape as `role`/`permission` — not user-owned.)
 *   - `user_role`, `user_permission_override` — actor-scoped by `user_id`. ENABLE + FORCE ROW
 *     LEVEL SECURITY with an ownership policy `USING (user_id = current_setting('aix.user_id',
 *     true))`, identical in shape to `iam.session`-family (IAM-01 §05.6/S1). Ready for a
 *     future "read my own roles" endpoint even though this stage doesn't build one.
 *   - `permission_decision_token` — Deliberately NO RLS. This table is looked up by
 *     `token_hash` BEFORE the owning actor is known — the exact pre-auth-shaped lookup that
 *     bit IAM-01 as S1 (docs/implementation/IAM-01_IMPLEMENTATION_NOTES.md §11) and that
 *     IAM-01 solved for its own token-hash tables (`iam.session`, `iam.refresh_token`) via
 *     SECURITY DEFINER functions, and separately solved for `iam.step_up_assertion`/
 *     `iam.mfa_challenge`/`iam.mfa_enrolment_session` by never putting RLS on them at all in
 *     the first place. This table follows the SECOND precedent (no RLS at all), matching
 *     `iam.step_up_assertion`'s shape most closely (issued to an actor, later resolved by
 *     hash without a caller-supplied actor scope). Stage 2 builds the actual decision-token
 *     issuance/verification code (Phase 3) — DO NOT add ownership RLS to this table then
 *     without re-deriving a SECURITY DEFINER lookup function first, or S1 recurs here.
 *   - `approval_request`, `approval_decision`, `sod_check`, `permission_decision_log` — NO
 *     RLS. These are evidence/logged tables, not simple per-user-owned resources (an approval
 *     involves a maker AND a checker; a SoD check is about the platform, not one user; a
 *     decision log is an audit trail). Access control is enforced at the application layer via
 *     the permission guard itself — exactly how `iam.auth_event` (IAM-01) has no RLS because
 *     it is an audit trail, not a user-owned resource.
 *   - `approval_policy`, `permission_cache_version` — NO RLS. Small config/state tables.
 *
 * GRANTS: see infra/grants/iam2_runtime_grants.sql (separate file, applied by a privileged
 * role, same convention as fnd/iam).
 *
 * SEED DATA: see the bottom of this migration — canonical prohibited-Exchange permissions
 * (07_Permission_Rules.md §3), IAM-02 administrative permissions (§2), and a provisional
 * bootstrap role catalogue. Full derivation rationale is documented inline at each INSERT.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE SCHEMA IF NOT EXISTS iam2;

    -- §2.1 role — global catalogue, no RLS.
    CREATE TABLE iam2.role (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      role_id          varchar(64) NOT NULL UNIQUE,
      role_code        varchar(64) NOT NULL UNIQUE,
      role_name        varchar(128) NOT NULL,
      role_type        varchar(16) NOT NULL CHECK (role_type IN ('client','staff','admin','system','service')),
      sensitivity      varchar(16) NOT NULL DEFAULT 'normal'
                          CHECK (sensitivity IN ('normal','sensitive','privileged')),
      status           varchar(16) NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','inactive','retired')),
      owner_team       varchar(64),
      description      text,
      created_at_utc   timestamptz NOT NULL DEFAULT now(),
      updated_at_utc   timestamptz NOT NULL DEFAULT now()
    );

    -- §2.2 permission — global catalogue, no RLS. licence_locked is a cached/index flag
    -- only (§5.14 interim contract) — the config-sealed list matching Document 00 v1.3 is
    -- the source of truth until CFG-01 exists; this column is what lib/guard.ts checks THIS
    -- stage, per the brief's explicit interim-contract instruction.
    CREATE TABLE iam2.permission (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      permission_id       varchar(64) NOT NULL UNIQUE,
      permission_code     varchar(128) NOT NULL UNIQUE,
      resource            varchar(64) NOT NULL,
      action              varchar(64) NOT NULL,
      sensitivity         varchar(24) NOT NULL DEFAULT 'normal'
                             CHECK (sensitivity IN ('normal','sensitive','privileged','financial_critical')),
      licence_locked      boolean NOT NULL DEFAULT false,
      prohibited          boolean NOT NULL DEFAULT false,
      requires_step_up    boolean NOT NULL DEFAULT false,
      requires_approval   boolean NOT NULL DEFAULT false,
      status              varchar(16) NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','inactive','retired')),
      owner_module         varchar(16) NOT NULL
    );

    -- §2.3 role_permission — global catalogue (role-permission linkage, not user-owned), no RLS.
    CREATE TABLE iam2.role_permission (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      role_id               varchar(64) NOT NULL REFERENCES iam2.role (role_id),
      permission_id         varchar(64) NOT NULL REFERENCES iam2.permission (permission_id),
      status                varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
      assigned_by           varchar(64),
      approval_id           varchar(64),
      effective_from_utc    timestamptz NOT NULL DEFAULT now(),
      revoked_at_utc        timestamptz
    );

    -- §2.4 user_role — actor-scoped by user_id. RLS applies (F3(b)-equivalent, ready for a
    -- future "read my own roles" endpoint).
    CREATE TABLE iam2.user_role (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id               varchar(64) NOT NULL,
      role_id               varchar(64) NOT NULL REFERENCES iam2.role (role_id),
      client_id             varchar(64),
      status                varchar(16) NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active','revoked','expired')),
      assigned_by           varchar(64),
      approval_id           varchar(64),
      effective_from_utc    timestamptz NOT NULL DEFAULT now(),
      expires_at_utc        timestamptz,
      revoked_at_utc        timestamptz
    );

    -- §2.5 user_permission_override — actor-scoped by user_id. RLS applies.
    CREATE TABLE iam2.user_permission_override (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id            varchar(64) NOT NULL,
      permission_id      varchar(64) NOT NULL REFERENCES iam2.permission (permission_id),
      effect             varchar(8) NOT NULL CHECK (effect IN ('allow','deny')),
      scope              jsonb NOT NULL DEFAULT '{}'::jsonb,
      status             varchar(16) NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','revoked','expired')),
      approval_id        varchar(64),
      expires_at_utc     timestamptz
    );

    -- §2.6 approval_policy — small config table, no RLS. Tables/endpoints that USE this
    -- (approval creation, Phase 3/4) are out of scope this stage; created now per the plan.
    CREATE TABLE iam2.approval_policy (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      policy_id                   varchar(64) NOT NULL UNIQUE,
      action                      varchar(128) NOT NULL,
      resource                    varchar(64) NOT NULL,
      threshold_type              varchar(16) NOT NULL CHECK (threshold_type IN ('value','count','risk','action')),
      required_approver_roles     jsonb NOT NULL DEFAULT '[]'::jsonb,
      required_approval_count     int NOT NULL DEFAULT 1,
      requires_step_up            boolean NOT NULL DEFAULT false,
      expiry_minutes              int NOT NULL DEFAULT 1440,
      status                      varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'))
    );

    -- §2.7 approval_request — evidence/logged table (maker + checker involved), no RLS.
    CREATE TABLE iam2.approval_request (
      id                                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      approval_id                           varchar(64) NOT NULL UNIQUE,
      policy_id                             varchar(64) REFERENCES iam2.approval_policy (policy_id),
      maker_user_id                         varchar(64) NOT NULL,
      action                                varchar(128) NOT NULL,
      resource                              varchar(64) NOT NULL,
      entity_id                             varchar(64),
      client_id                             varchar(64),
      payload_ref                           varchar(128),
      payload_hash                          varchar(128),
      payload_canonicalisation_version      varchar(16),
      status                                varchar(16) NOT NULL DEFAULT 'pending'
                                                CHECK (status IN ('pending','approved','rejected','expired','cancelled','blocked')),
      required_count                        int NOT NULL DEFAULT 1,
      approved_count                        int NOT NULL DEFAULT 0,
      expires_at_utc                        timestamptz NOT NULL,
      created_at_utc                        timestamptz NOT NULL DEFAULT now(),
      completed_at_utc                      timestamptz,
      correlation_id                        varchar(128)
    );

    -- §2.8 approval_decision — evidence/logged table, no RLS.
    CREATE TABLE iam2.approval_decision (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      decision_id               varchar(64) NOT NULL UNIQUE,
      approval_id               varchar(64) NOT NULL REFERENCES iam2.approval_request (approval_id),
      approver_user_id          varchar(64) NOT NULL,
      decision                  varchar(8) NOT NULL CHECK (decision IN ('approve','reject')),
      decision_reason           text,
      step_up_assertion_ref     varchar(128),
      sod_check_id              varchar(64),
      decided_at_utc            timestamptz NOT NULL DEFAULT now(),
      correlation_id            varchar(128),
      -- §2.8 constraint 4: unique on (approval_id, approver_user_id). Constraint 1
      -- (approver_user_id != maker_user_id) requires reading approval_request and is
      -- enforced in application code (lib/guard.ts / Phase 3-4 approval endpoints), not here.
      UNIQUE (approval_id, approver_user_id)
    );

    -- §2.9 sod_rule — global catalogue (conflict-matrix definitions), no RLS.
    CREATE TABLE iam2.sod_rule (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sod_rule_id               varchar(64) NOT NULL UNIQUE,
      conflict_type             varchar(24) NOT NULL
                                   CHECK (conflict_type IN ('role_role','permission_permission','action_action')),
      left_ref                  varchar(128) NOT NULL,
      right_ref                 varchar(128) NOT NULL,
      severity                  varchar(16) NOT NULL CHECK (severity IN ('critical','high','medium')),
      enforcement               varchar(16) NOT NULL CHECK (enforcement IN ('block','risk_acceptance')),
      status                    varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
      owner                     varchar(64),
      matrix_version            int NOT NULL DEFAULT 1,
      rule_hash                 varchar(128),
      risk_acceptance_allowed   boolean NOT NULL DEFAULT false,
      -- §5.6A rule 1 / §09 rule "Critical must be block": Critical severity can never be
      -- risk-accepted — enforce this shape invariant at the schema level, not just in code.
      CHECK (NOT (severity = 'critical' AND risk_acceptance_allowed)),
      CHECK (NOT (severity = 'critical' AND enforcement <> 'block'))
    );

    -- §2.10 sod_check — evidence/logged table, no RLS.
    CREATE TABLE iam2.sod_check (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sod_check_id       varchar(64) NOT NULL UNIQUE,
      user_id            varchar(64) NOT NULL,
      proposed_ref       varchar(128) NOT NULL,
      result             varchar(24) NOT NULL CHECK (result IN ('pass','block','risk_acceptance_required')),
      matched_rules      jsonb NOT NULL DEFAULT '[]'::jsonb,
      checked_at_utc     timestamptz NOT NULL DEFAULT now(),
      correlation_id     varchar(128)
    );

    -- §2.14 permission_decision_log — evidence/audit trail, no RLS. Restricted / Security
    -- Critical per §1 rule 5 — application-layer access control only (mirrors iam.auth_event).
    CREATE TABLE iam2.permission_decision_log (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      decision_id               varchar(64) NOT NULL UNIQUE,
      actor_user_id             varchar(64) NOT NULL,
      action                    varchar(128) NOT NULL,
      resource                  varchar(64) NOT NULL,
      entity_id                 varchar(64),
      client_id                 varchar(64),
      decision                  varchar(24) NOT NULL
                                   CHECK (decision IN ('allow','deny','approval_required','step_up_required','sod_blocked','licence_locked')),
      reason_code               varchar(64) NOT NULL,
      permission_sources        jsonb NOT NULL DEFAULT '[]'::jsonb,
      sod_check_id              varchar(64),
      approval_id               varchar(64),
      step_up_assertion_ref     varchar(128),
      decision_token_hash       varchar(128),
      payload_hash              varchar(128),
      cache_version             int,
      session_id                varchar(64),
      auth_level                varchar(16),
      occurred_at_utc           timestamptz NOT NULL DEFAULT now(),
      correlation_id            varchar(128)
    );

    -- §2.16 permission_decision_token — DELIBERATELY NO RLS. See the migration header
    -- comment: this is a pre-auth-shaped hash lookup (S1 precedent), same class as
    -- iam.step_up_assertion. Schema created now (Phase 1) so Phase 3 can build issuance/
    -- verification on top of it; no code in this stage writes or reads this table.
    CREATE TABLE iam2.permission_decision_token (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      decision_token_id         varchar(64) NOT NULL UNIQUE,
      token_hash                varchar(128) NOT NULL UNIQUE,
      actor_user_id             varchar(64) NOT NULL,
      session_id                varchar(64),
      auth_level                varchar(16),
      action                    varchar(128) NOT NULL,
      resource                  varchar(64) NOT NULL,
      entity_id                 varchar(64),
      client_id                 varchar(64),
      payload_hash              varchar(128),
      approval_id               varchar(64),
      step_up_assertion_ref     varchar(128),
      cache_version             int,
      status                    varchar(16) NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active','consumed','expired','revoked')),
      issued_at_utc             timestamptz NOT NULL DEFAULT now(),
      expires_at_utc            timestamptz NOT NULL
    );

    -- §2.19 permission_cache_version — small state table, no RLS.
    CREATE TABLE iam2.permission_cache_version (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      subject_id            varchar(64) NOT NULL UNIQUE,
      cache_version         int NOT NULL DEFAULT 0,
      invalidated_at_utc    timestamptz,
      reason                varchar(64)
    );

    -- §3 indexes (only for tables created this migration).
    CREATE INDEX idx_iam2_role_code_status ON iam2.role (role_code, status);
    CREATE INDEX idx_iam2_permission_code_status ON iam2.permission (permission_code, status);
    CREATE INDEX idx_iam2_role_permission_role_perm_status ON iam2.role_permission (role_id, permission_id, status);
    CREATE INDEX idx_iam2_user_role_user_status ON iam2.user_role (user_id, status);
    CREATE INDEX idx_iam2_user_permission_override_user_status ON iam2.user_permission_override (user_id, status);
    CREATE INDEX idx_iam2_approval_request_maker_status ON iam2.approval_request (maker_user_id, status);
    CREATE INDEX idx_iam2_approval_decision_approval_approver ON iam2.approval_decision (approval_id, approver_user_id);
    CREATE INDEX idx_iam2_sod_rule_refs_status ON iam2.sod_rule (left_ref, right_ref, status);
    CREATE INDEX idx_iam2_sod_check_user_status ON iam2.sod_check (user_id, result);
    CREATE INDEX idx_iam2_permission_decision_log_actor_time ON iam2.permission_decision_log (actor_user_id, occurred_at_utc);
    CREATE INDEX idx_iam2_permission_decision_token_hash_status ON iam2.permission_decision_token (token_hash, status);
    CREATE INDEX idx_iam2_permission_cache_version_subject ON iam2.permission_cache_version (subject_id);

    -- RLS: actor-scoped tables only (see migration header comment for the full rationale
    -- table). Mirrors iam.session-family / C2's aix.module pattern (aix.user_id here).
    ALTER TABLE iam2.user_role ENABLE ROW LEVEL SECURITY;
    ALTER TABLE iam2.user_role FORCE ROW LEVEL SECURITY;
    CREATE POLICY user_role_owner_isolation ON iam2.user_role
      USING (user_id = current_setting('aix.user_id', true));

    ALTER TABLE iam2.user_permission_override ENABLE ROW LEVEL SECURITY;
    ALTER TABLE iam2.user_permission_override FORCE ROW LEVEL SECURITY;
    CREATE POLICY user_permission_override_owner_isolation ON iam2.user_permission_override
      USING (user_id = current_setting('aix.user_id', true));

    -- =====================================================================================
    -- SEED DATA (catalogue data, not business data — appropriate to seed in a migration).
    -- =====================================================================================

    -- Prohibited Exchange permission set (07_Permission_Rules.md §3 / blueprint §5.12).
    -- prohibited = true AND licence_locked = true on every row: these permissions must never
    -- be grantable while Exchange is pending, and per §5.14 the config-sealed source is
    -- authoritative until CFG-01 exists — this local flag is the cached/index copy of that
    -- sealed list, matching Document 00 v1.3's ENABLE_* list literally. sensitivity is
    -- 'financial_critical' (market/exchange-integrity impact); owner_module is 'EXCHANGE'
    -- (namespace prefix per §1's <module>.<resource>.<action> convention) even though the
    -- Exchange module itself does not exist yet — these are catalogue DATA rows (permission
    -- CODES), not an Exchange runtime surface (no route is registered for them; the
    -- assertNoExchangeRuntime boot guard checks registered ROUTES, not catalogue rows).
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_exchange_orderbook_enable',              'exchange.orderbook.enable',                'orderbook',                'enable', 'financial_critical', true, true, false, false, 'active', 'EXCHANGE'),
      ('perm_exchange_matching_engine_enable',        'exchange.matching_engine.enable',          'matching_engine',          'enable', 'financial_critical', true, true, false, false, 'active', 'EXCHANGE'),
      ('perm_exchange_client_to_client_matching_enable','exchange.client_to_client_matching.enable','client_to_client_matching','enable', 'financial_critical', true, true, false, false, 'active', 'EXCHANGE'),
      ('perm_exchange_public_trading_enable',         'exchange.public_trading.enable',           'public_trading',           'enable', 'financial_critical', true, true, false, false, 'active', 'EXCHANGE'),
      ('perm_exchange_market_maker_enable',           'exchange.market_maker.enable',              'market_maker',             'enable', 'financial_critical', true, true, false, false, 'active', 'EXCHANGE'),
      ('perm_exchange_principal_dealing_enable',      'exchange.principal_dealing.enable',        'principal_dealing',        'enable', 'financial_critical', true, true, false, false, 'active', 'EXCHANGE'),
      ('perm_exchange_aix_spread_markup_enable',      'exchange.aix_spread_markup.enable',        'aix_spread_markup',        'enable', 'financial_critical', true, true, false, false, 'active', 'EXCHANGE');

    -- IAM-02 administrative permissions (07_Permission_Rules.md §2 — all 24 rows, verbatim
    -- codes). Judgment calls on sensitivity/requires_step_up/requires_approval derived from
    -- §4 "Maker-Checker Required Actions", §5.6A.6 (SoD matrix change requires step-up), and
    -- §6 "Step-Up Required Permissions" — cross-referenced explicitly below. Read-only
    -- actions (.read) are 'normal' sensitivity with no gates. iam2.sensitive_read does not
    -- fit the <module>.<resource>.<action> 3-segment pattern (it is 2 segments in the
    -- blueprint's own table) — resource/action are set to 'sensitive_read'/'read' as the
    -- closest honest mapping, noted here rather than silently invented as something else.
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_iam2_role_read',                   'iam2.role.read',                   'role',                'read',         'normal',    false, false, false, false, 'active', 'IAM-02'),
      -- §4 rule 1: role creation/update/retirement require maker-checker approval.
      ('perm_iam2_role_create',                 'iam2.role.create',                 'role',                'create',       'sensitive', false, false, false, true,  'active', 'IAM-02'),
      ('perm_iam2_role_update',                 'iam2.role.update',                 'role',                'update',       'sensitive', false, false, false, true,  'active', 'IAM-02'),
      ('perm_iam2_role_retire',                 'iam2.role.retire',                 'role',                'retire',       'sensitive', false, false, false, true,  'active', 'IAM-02'),
      -- §4 rule 2 + §6 rule 1: privileged role assignment requires approval AND step-up.
      ('perm_iam2_role_assign_user',            'iam2.role.assign_user',            'role',                'assign_user',  'privileged',false, false, true,  true,  'active', 'IAM-02'),
      -- Revocation of access is deliberately NOT gated behind approval/step-up (removing
      -- privilege is the safe direction) — judgment call, not stated explicitly either way
      -- in the blueprint.
      ('perm_iam2_role_revoke_user',            'iam2.role.revoke_user',            'role',                'revoke_user',  'sensitive', false, false, false, false, 'active', 'IAM-02'),
      ('perm_iam2_permission_read',              'iam2.permission.read',             'permission',          'read',         'normal',    false, false, false, false, 'active', 'IAM-02'),
      -- §4 rule 3 + §6 rule 2: permission assignment to role requires approval AND step-up.
      ('perm_iam2_permission_assign_role',       'iam2.permission.assign_role',      'permission',          'assign_role',  'privileged',false, false, true,  true,  'active', 'IAM-02'),
      ('perm_iam2_permission_revoke_role',       'iam2.permission.revoke_role',      'permission',          'revoke_role',  'sensitive', false, false, false, false, 'active', 'IAM-02'),
      ('perm_iam2_approval_create',              'iam2.approval.create',             'approval',            'create',       'normal',    false, false, false, false, 'active', 'IAM-02'),
      -- §6 rule 3: approval of a high-risk action requires step-up.
      ('perm_iam2_approval_approve',             'iam2.approval.approve',            'approval',            'approve',      'sensitive', false, false, true,  false, 'active', 'IAM-02'),
      ('perm_iam2_approval_reject',              'iam2.approval.reject',             'approval',            'reject',       'normal',    false, false, false, false, 'active', 'IAM-02'),
      ('perm_iam2_sod_read',                     'iam2.sod.read',                    'sod',                 'read',         'normal',    false, false, false, false, 'active', 'IAM-02'),
      -- §4 rule 4 + §5.6A.6: SoD matrix change requires Security+Compliance dual approval AND step-up.
      ('perm_iam2_sod_manage',                   'iam2.sod.manage',                  'sod',                 'manage',       'privileged',false, false, true,  true,  'active', 'IAM-02'),
      -- §4 rule 7: delegation of sensitive approval requires approval.
      ('perm_iam2_delegation_create',            'iam2.delegation.create',           'delegation',          'create',       'sensitive', false, false, false, true,  'active', 'IAM-02'),
      ('perm_iam2_delegation_revoke',            'iam2.delegation.revoke',           'delegation',          'revoke',       'normal',    false, false, false, false, 'active', 'IAM-02'),
      -- §4 rule 6: temporary sensitive permission grant requires approval.
      ('perm_iam2_temporary_permission_grant',   'iam2.temporary_permission.grant',  'temporary_permission','grant',        'sensitive', false, false, false, true,  'active', 'IAM-02'),
      ('perm_iam2_temporary_permission_revoke',  'iam2.temporary_permission.revoke', 'temporary_permission','revoke',       'normal',    false, false, false, false, 'active', 'IAM-02'),
      -- §4 rule 8: break-glass request requires approval.
      ('perm_iam2_break_glass_request',          'iam2.break_glass.request',         'break_glass',         'request',      'sensitive', false, false, false, true,  'active', 'IAM-02'),
      -- §6 rule 5: break-glass approval requires step-up.
      ('perm_iam2_break_glass_approve',          'iam2.break_glass.approve',         'break_glass',         'approve',      'privileged',false, false, true,  false, 'active', 'IAM-02'),
      ('perm_iam2_break_glass_revoke',           'iam2.break_glass.revoke',          'break_glass',         'revoke',       'sensitive', false, false, false, false, 'active', 'IAM-02'),
      ('perm_iam2_break_glass_review',           'iam2.break_glass.review',          'break_glass',         'review',       'normal',    false, false, false, false, 'active', 'IAM-02'),
      ('perm_iam2_evidence_read',                'iam2.evidence.read',               'evidence',            'read',         'sensitive', false, false, false, false, 'active', 'IAM-02'),
      ('perm_iam2_sensitive_read',                'iam2.sensitive_read',              'sensitive_read',      'read',         'sensitive', false, false, false, false, 'active', 'IAM-02');

    -- Provisional/bootstrap role catalogue — NOT the final canonical role list (blueprint
    -- §13 open item #1 explicitly says this is still open; per the task brief this is
    -- derived, not decided, and must be treated as provisional). Derived from
    -- 01_Module_Blueprint.md §6 "Actors" table: rows that clearly map to a distinct IAM-02
    -- administrative/security posture (Security Admin, Tech Admin, Compliance Officer /
    -- MLRO, Auditor). Other actors (Client User, Client Approver, Staff User, Finance User,
    -- Operations Manager, Super Admin, System Job, Service Account) are NOT seeded here —
    -- inventing their role_code/permission set without the final canonical matrix would be
    -- exactly the "invented during coding" outcome the implementation plan's risk #4 warns
    -- against. No iam2.role_permission rows are seeded alongside these roles: FR-003 requires
    -- role-permission assignment to happen "only through approved workflow", so wiring these
    -- roles to permissions via a raw seed INSERT here would itself violate that rule — that
    -- wiring is stage 2 / Phase 3+'s job once the approval workflow exists.
    INSERT INTO iam2.role (role_id, role_code, role_name, role_type, sensitivity, status, owner_team, description)
    VALUES
      ('role_security_admin',     'security_admin',     'Security Admin',            'admin', 'privileged', 'active', 'security',   'Provisional bootstrap role — permission security control (blueprint §6 Actors). Final canonical role list is an open item (blueprint §13).'),
      ('role_tech_admin',         'tech_admin',          'Tech Admin',                'admin', 'privileged', 'active', 'technology', 'Provisional bootstrap role — technical/admin permission control (blueprint §6 Actors). Final canonical role list is an open item (blueprint §13).'),
      ('role_compliance_officer', 'compliance_officer',  'Compliance Officer / MLRO', 'staff', 'sensitive',  'active', 'compliance', 'Provisional bootstrap role — compliance approvals and sensitive reads (blueprint §6 Actors). Final canonical role list is an open item (blueprint §13).'),
      ('role_auditor',            'auditor',             'Auditor',                   'staff', 'sensitive',  'active', 'audit',      'Provisional bootstrap role — read-only evidence review (blueprint §6 Actors). Final canonical role list is an open item (blueprint §13).');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP SCHEMA IF EXISTS iam2 CASCADE;`);
};
