/* eslint-disable camelcase */

/**
 * 070_fnd_rate_limit_policy_privilege_hardening — closes NEW-1 (independent Opus post-
 * acceptance review of the Shared Rate-Limit Engine, `068_fnd_rate_limit_engine.cjs` /
 * `069_fnd_rate_limit_policy_seed.cjs`).
 *
 * PROBLEM PROVEN BY THAT REVIEW: `foundation.rate_limit_policy`'s runtime immutability
 * (`role_fnd_runtime` must never INSERT/UPDATE/DELETE it — governance-owned, changes only
 * through an approved migration) previously depended ENTIRELY on `infra/grants/
 * fnd_runtime_grants.sql`'s own guarded `REVOKE` running AFTER migration 068 creates the
 * table. Under the equally realistic opposite deployment order —
 *
 *   1. migrate through 067 (no rate_limit_* tables yet)
 *   2. apply grants (role_fnd_runtime created; ALTER DEFAULT PRIVILEGES set for FUTURE
 *      foundation tables; the grants file's own guarded REVOKE no-ops via `to_regclass`
 *      because the table does not exist yet)
 *   3. migrate through 068/069/070 (rate_limit_policy is created; Postgres's own default-
 *      privilege mechanism from step 2 grants SELECT/INSERT/UPDATE to role_fnd_runtime
 *      automatically)
 *   4. grants are NOT re-applied
 *
 * — the guarded REVOKE in the grants file never runs, and role_fnd_runtime is left able to
 * INSERT/UPDATE the governance-owned policy table. Proven live against a real restricted
 * LOGIN role during independent acceptance.
 *
 * FIX: perform the SAME guarded REVOKE at MIGRATION TIME, so it unconditionally executes as
 * part of `migrate:up` to head regardless of whether (or when) the grants file is re-applied.
 * This makes policy immutability ORDERING-INDEPENDENT:
 *
 *   - migrations-then-grants: this migration no-ops (role_fnd_runtime does not exist yet on
 *     a fresh deployment); the grants file's own guarded REVOKE (unchanged, still necessary
 *     for that ordering) closes it once the role and table both exist.
 *   - grants-then-migrations: role_fnd_runtime already exists when this migration runs, so
 *     THIS migration's REVOKE closes it immediately — no dependency on ever re-running grants.
 *
 * Neither `068_fnd_rate_limit_engine.cjs` nor `069_fnd_rate_limit_policy_seed.cjs` is
 * modified — migration history is immutable. This is purely a privilege-hardening migration:
 * no schema change, no data change, no new architectural decision (DEC-009 policy values are
 * untouched).
 *
 * Safe whether `role_fnd_runtime` already exists or not (guarded with `pg_roles`), and safe
 * to run before OR after `infra/grants/fnd_runtime_grants.sql` (both are idempotent —
 * REVOKEing a privilege never granted, or already revoked, is a no-op in PostgreSQL, not an
 * error). No dependency is introduced requiring the role to exist before migrations run.
 */

const POLICY_TABLE = "foundation.rate_limit_policy";
const RUNTIME_ROLE = "role_fnd_runtime";

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE}') THEN
        REVOKE INSERT, UPDATE, DELETE ON ${POLICY_TABLE} FROM ${RUNTIME_ROLE};
      END IF;
    END
    $$;
  `);
};

exports.down = (pgm) => {
  // Purely a privilege change — no schema/data to preserve, so a plain reversal (not an
  // evidence-preserving refusal) is correct here, unlike 068/069's own down migrations.
  // Restores exactly the pre-070 grant shape (SELECT/INSERT/UPDATE only, via the blanket
  // grant's original intent) — DELETE is deliberately NOT re-granted, since role_fnd_runtime
  // was never granted DELETE on any foundation table by any accepted grants file.
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE}')
         AND to_regclass('${POLICY_TABLE}') IS NOT NULL THEN
        GRANT INSERT, UPDATE ON ${POLICY_TABLE} TO ${RUNTIME_ROLE};
      END IF;
    END
    $$;
  `);
};
