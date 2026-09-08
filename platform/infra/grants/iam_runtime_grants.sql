-- IAM-01 §05.1 / §05.5 Database-Level Isolation Baseline.
--
-- Applied by a PRIVILEGED role, separately from the table migration (migration role and
-- runtime role differ, mirroring infra/grants/fnd_runtime_grants.sql's convention). This
-- role reaches only the `iam` schema; it is granted NOTHING in `foundation` or any other
-- module schema (F3 module-boundary isolation — proven by tests/integration/iam-db.test.ts).
--
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_iam_runtime') THEN
    CREATE ROLE role_iam_runtime NOLOGIN;
  END IF;
END
$$;

-- Least privilege: usage on the iam schema only.
GRANT USAGE ON SCHEMA iam TO role_iam_runtime;

-- Runtime DML on iam tables (no DDL, no ownership).
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA iam TO role_iam_runtime;

-- Future tables created in this schema inherit the same runtime grant.
ALTER DEFAULT PRIVILEGES IN SCHEMA iam
  GRANT SELECT, INSERT, UPDATE ON TABLES TO role_iam_runtime;

-- Explicit: NO blanket grant into `foundation` or any other module schema. role_iam_runtime
-- must never be able to read/write foundation.* generically — IAM reaches foundation
-- functionality only through @aix/foundation's exported helpers (which run on IAM's own DB
-- connection/role), never via direct cross-schema SQL. This is asserted by the F3(a) test:
-- `SET ROLE role_iam_runtime` then a query against foundation.module_registry (and other
-- foundation-internal tables) must be permission-denied.
--
-- NARROW EXCEPTION (S1 gap-closing patch): `@aix/foundation`'s `publishAudit` / `enqueueOutbox`
-- and `beginIdempotent` / `completeIdempotent` write to `foundation.outbox_event` and
-- `foundation.idempotency_record` respectively, ON THE CALLER'S OWN CONNECTION/ROLE — that is
-- the whole point of the transaction-coupled audit/idempotency contract (§5.5/§3.7). Every
-- module that uses these two shared helpers therefore needs DML on exactly these two tables;
-- this is the "approved foundation interface" the isolation baseline doc (fnd_runtime_grants.sql)
-- anticipates, NOT a broad foundation grant. Neither table carries RLS or module-owned data
-- (they are cross-module infrastructure tables), and F3(a) continues to prove
-- foundation.module_registry (a genuinely foundation-internal table) stays denied.
--
-- Per-table privilege is scoped to each helper's actual access pattern (independent review
-- finding C1): `enqueueOutbox`/`publishAudit` only ever INSERT into `foundation.outbox_event`
-- (append-only audit/outbox contract — IAM must never read or mutate other modules' outbox
-- rows), so that table is INSERT-only. `beginIdempotent`/`completeIdempotent` need the full
-- begin/complete read-modify-write cycle on `foundation.idempotency_record`, so it keeps
-- SELECT, INSERT, UPDATE.
--
-- C2 gap-closing patch (IAM-02_Implementation_Plan_v1.0 §7): unlike `foundation.outbox_event`,
-- this table's access pattern genuinely needs SELECT/INSERT/UPDATE, so the grant itself
-- cannot be the isolation boundary the way C1's INSERT-only narrowing was. The table-level
-- grant below is intentionally UNCHANGED by this patch — isolation between modules' rows is
-- enforced at the ROW level instead, via `source_module` + ENABLE/FORCE ROW LEVEL SECURITY +
-- an `aix.module`-scoped policy (infra/migrations/005_fnd_idempotency_module_scope.cjs), the
-- same pattern this file's `iam.session`/`iam.refresh_token` RLS already uses for per-user
-- scoping (S1, `aix.user_id`). `beginIdempotent`/`completeIdempotent`
-- (packages/foundation/src/idempotency.ts) set `aix.module` to the caller's own module
-- identity before every access, on the caller's own already-open transaction. Do not treat
-- this GRANT line as the isolation mechanism for this table — a reader auditing cross-module
-- access must also check the RLS policy on `foundation.idempotency_record`.
GRANT USAGE ON SCHEMA foundation TO role_iam_runtime;
-- Explicit REVOKE first so re-running this idempotent script also strips the old
-- SELECT/UPDATE grant from an already-provisioned database, not just a fresh one.
REVOKE SELECT, UPDATE ON foundation.outbox_event FROM role_iam_runtime;
GRANT INSERT ON foundation.outbox_event TO role_iam_runtime;
GRANT SELECT, INSERT, UPDATE ON foundation.idempotency_record TO role_iam_runtime;

-- S1 gap-closing patch: EXECUTE on the SECURITY DEFINER pre-auth token-hash resolve/touch
-- functions (infra/migrations/003_iam_rls_token_lookup.cjs). These are the ONLY sanctioned
-- way role_iam_runtime may resolve an iam.session/iam.refresh_token row by its secret hash
-- before the owning user_id — and therefore the RLS scope — is known. No broader SELECT on
-- iam.session/iam.refresh_token is granted for this pre-auth path beyond what the table-level
-- grant above already provides (which RLS still gates on aix.user_id for direct queries).
GRANT EXECUTE ON FUNCTION iam.fn_resolve_session_by_token_hash(text) TO role_iam_runtime;
GRANT EXECUTE ON FUNCTION iam.fn_resolve_refresh_by_token_hash(text) TO role_iam_runtime;
GRANT EXECUTE ON FUNCTION iam.fn_touch_session_last_seen(text) TO role_iam_runtime;
