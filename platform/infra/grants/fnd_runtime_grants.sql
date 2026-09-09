-- FND-01 §5.4 / §05.5 Database-Level Isolation Baseline.
--
-- Applied by a PRIVILEGED role, separately from the table migration (migration role and
-- runtime role must differ, §05.5.1 rule 5). This file establishes the *convention* every
-- module inherits: each runtime role reaches only its own schema + approved foundation
-- interfaces; no broad cross-schema grants. Run manually / via a privileged deploy step.
--
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_fnd_runtime') THEN
    CREATE ROLE role_fnd_runtime NOLOGIN;
  END IF;
END
$$;

-- Least privilege: usage on the foundation schema only.
GRANT USAGE ON SCHEMA foundation TO role_fnd_runtime;

-- Runtime DML on foundation tables (no DDL, no ownership).
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA foundation TO role_fnd_runtime;

-- Future tables created in this schema inherit the same runtime grant.
ALTER DEFAULT PRIVILEGES IN SCHEMA foundation
  GRANT SELECT, INSERT, UPDATE ON TABLES TO role_fnd_runtime;

-- Explicitly NO grants to any other module schema. Cross-schema runtime access is
-- prohibited by default (§5.4 param cross_schema_runtime_grants = prohibited_by_default);
-- controlled read-models/service interfaces are the only approved cross-module path.

-- Shared Rate-Limit Engine (WLT-01 BLOCKER-2 prerequisite, DEC-009): foundation.rate_limit_
-- policy is governance-owned — role_fnd_runtime may SELECT it (inherited from the blanket
-- grant above) but must NEVER be able to write it; a limit changes only through a new
-- governance-approved migration, never at runtime. Guarded with to_regclass so this file stays
-- safe to re-run against a database migrated to any point BEFORE OR AFTER migration 068 (this
-- table may not exist yet) — mirrors this file's own "idempotent, safe to re-run" contract.
DO $$
BEGIN
  IF to_regclass('foundation.rate_limit_policy') IS NOT NULL THEN
    REVOKE INSERT, UPDATE ON foundation.rate_limit_policy FROM role_fnd_runtime;
  END IF;
END
$$;

-- RLS baseline convention (§05.5.2): client-owned tables in *business* modules must add a
-- client/tenant ownership key + ENABLE ROW LEVEL SECURITY + a policy scoping rows to the
-- request client_id, plus a test proving cross-client access is denied. The `foundation`
-- schema holds no client-owned tables, so this is documented here as the pattern later
-- modules (CLT-01 onward) must follow. Example shape:
--
--   ALTER TABLE <schema>.<client_table> ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY client_isolation ON <schema>.<client_table>
--     USING (client_id = current_setting('aix.client_id', true));
--
-- Deployment tests (§05.5.3) assert: runtime role cannot read/write another schema, and a
-- missing client scope fails closed.
