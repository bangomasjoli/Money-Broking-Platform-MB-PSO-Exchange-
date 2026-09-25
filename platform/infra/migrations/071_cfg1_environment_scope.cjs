/* eslint-disable camelcase */

/**
 * 071_cfg1_environment_scope — MIG-004 (Doc 00 v1.5 §25.3; `docs/03_implementation/tasks/
 * MIG-004/01-plan.md` §3, §4, §9, §12). Adds `ENVIRONMENT_AVAILABILITY` (Doc 00 §1.D state 2)
 * to `cfg1.feature` as `environment_scope`, so CFG-01 decision-chain step 4 can become live.
 *
 * SHAPE: a JSON object with EXACTLY the five canonical environment keys (`DEVELOPMENT`, `TEST`,
 * `UAT`, `DEMO`, `PRODUCTION`) — never deployment identifiers, so a `staging`/`STAGING` entry
 * cannot exist (`staging` reaches the `PRODUCTION` entry only through the foundation's
 * `canonicalEnvironment()`). Each value is exactly `ENABLED`, `DISABLED` or `NOT_APPLICABLE`.
 * No wildcard, no default key, no inheritance, no boolean shorthand, no nesting.
 *
 * FAIL-CLOSED DEFAULT AND BACKFILL: `NOT NULL DEFAULT` all-`DISABLED`. Every existing row is
 * backfilled all-`DISABLED`, and every future row created by the feature-changes workflow gets
 * the same default — no feature becomes more available in any environment because of this
 * migration. Nothing is seeded `ENABLED`.
 *
 * RUNTIME GRANT (ordering-independent, mirroring `070_fnd_rate_limit_policy_privilege_
 * hardening.cjs`): `role_cfg1_runtime` previously held TABLE-level `INSERT` on `cfg1.feature`,
 * which Postgres extends to every column, including one added later. If grants were applied
 * BEFORE this migration and are not re-applied, that table-level privilege would let the
 * runtime role INSERT `environment_scope`. This migration therefore performs the same guarded
 * `REVOKE INSERT` + column-scoped `GRANT INSERT` as `infra/grants/cfg1_runtime_grants.sql`
 * whenever the role already exists; on a fresh deployment (role not yet created) it no-ops and
 * the grants file closes it. The `UPDATE` grant is already column-scoped (`current_state,
 * version, updated_at_utc`) and is not touched. The runtime role can therefore neither INSERT
 * nor UPDATE `environment_scope` under either ordering: no environment-scope write path exists.
 *
 * No historical migration (001, 014, 053 or any other) is modified. No index: lookup stays by
 * the unique `feature_code`.
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE cfg1.feature
      ADD COLUMN environment_scope jsonb NOT NULL
        DEFAULT '{"DEVELOPMENT":"DISABLED","TEST":"DISABLED","UAT":"DISABLED","DEMO":"DISABLED","PRODUCTION":"DISABLED"}'::jsonb;

    ALTER TABLE cfg1.feature
      ADD CONSTRAINT cfg1_feature_environment_scope_valid CHECK (
        jsonb_typeof(environment_scope) = 'object'
        AND environment_scope ?& ARRAY['DEVELOPMENT','TEST','UAT','DEMO','PRODUCTION']
        AND (environment_scope - ARRAY['DEVELOPMENT','TEST','UAT','DEMO','PRODUCTION']) = '{}'::jsonb
        AND jsonb_typeof(environment_scope->'DEVELOPMENT') = 'string'
        AND environment_scope->>'DEVELOPMENT' IN ('ENABLED','DISABLED','NOT_APPLICABLE')
        AND jsonb_typeof(environment_scope->'TEST') = 'string'
        AND environment_scope->>'TEST' IN ('ENABLED','DISABLED','NOT_APPLICABLE')
        AND jsonb_typeof(environment_scope->'UAT') = 'string'
        AND environment_scope->>'UAT' IN ('ENABLED','DISABLED','NOT_APPLICABLE')
        AND jsonb_typeof(environment_scope->'DEMO') = 'string'
        AND environment_scope->>'DEMO' IN ('ENABLED','DISABLED','NOT_APPLICABLE')
        AND jsonb_typeof(environment_scope->'PRODUCTION') = 'string'
        AND environment_scope->>'PRODUCTION' IN ('ENABLED','DISABLED','NOT_APPLICABLE')
      );

    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_cfg1_runtime') THEN
        REVOKE INSERT ON cfg1.feature FROM role_cfg1_runtime;
        GRANT INSERT (feature_id, feature_code, feature_name, current_state, licence_profile_id, version, created_at_utc, updated_at_utc)
          ON cfg1.feature TO role_cfg1_runtime;
      END IF;
    END
    $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE cfg1.feature DROP CONSTRAINT IF EXISTS cfg1_feature_environment_scope_valid;
    ALTER TABLE cfg1.feature DROP COLUMN IF EXISTS environment_scope;
  `);
};
