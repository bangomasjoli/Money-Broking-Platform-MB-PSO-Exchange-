-- IAM-02 §05.1 Database Design Database-Level Isolation Baseline.
--
-- Applied by a PRIVILEGED role, separately from the table migration (migration role and
-- runtime role differ, mirroring infra/grants/fnd_runtime_grants.sql / iam_runtime_grants.sql
-- convention). This role reaches only the `iam2` schema plus the narrow approved `foundation`
-- interface; it is granted NOTHING in `iam` or any other module schema (F3 module-boundary
-- isolation, extended one level per the IAM-02 implementation plan — proven by
-- tests/integration/iam2-db.test.ts).
--
-- Idempotent: safe to re-run.
--
-- PER-TABLE GRANT RATIONALE (C1 lesson applied from day one: grant exactly what THIS STAGE's
-- Phase 2 guard code (services/iam2/src/lib/guard.ts, routes/internal.ts) actually does, not
-- a blanket SELECT/INSERT/UPDATE on every table in the schema):
--   - iam2.role, iam2.permission, iam2.role_permission — SELECT only. The guard reads the
--     role/permission catalogue and the role-permission linkage; it never writes them this
--     stage (role/permission CRUD endpoints are Phase 3+ admin workflow, not built yet).
--   - iam2.user_role, iam2.user_permission_override — SELECT only, same reasoning (the guard
--     reads existing assignments/overrides; user-role/override assignment endpoints are
--     Phase 3+). RLS (ENABLE+FORCE, ownership by user_id) still applies on top of this grant
--     exactly like iam.session's grant does for role_iam_runtime.
--   - iam2.permission_decision_log — INSERT only. Append-only audit/evidence table (mirrors
--     the C1-tightened foundation.outbox_event pattern): the guard writes one row per
--     decision and never reads it back.
--   - iam2.permission_cache_version — SELECT only. Phase 2 only reads a subject's current
--     cache version if a row exists (absence is treated as version 0 / not-yet-initialised,
--     not a failure — see guard.ts); bumping the version on role/permission mutation is
--     Phase 5, not built this stage.
--   - iam2.approval_policy, iam2.approval_request, iam2.approval_decision, iam2.sod_rule,
--     iam2.sod_check, iam2.permission_decision_token — NO GRANT in Phase 0-2 (nothing in that
--     stage's code queried or wrote these tables). STAGE 2 (Phases 3-5) now extends this file
--     with exactly the grants its own code needs — see the dedicated "STAGE 2 additions"
--     block below, applying the same C1 discipline: grant exactly what THIS stage's code
--     does, nothing "just in case".

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_iam2_runtime') THEN
    CREATE ROLE role_iam2_runtime NOLOGIN;
  END IF;
END
$$;

-- Least privilege: usage on the iam2 schema only.
GRANT USAGE ON SCHEMA iam2 TO role_iam2_runtime;

GRANT SELECT ON iam2.role TO role_iam2_runtime;
GRANT SELECT ON iam2.permission TO role_iam2_runtime;
GRANT SELECT ON iam2.role_permission TO role_iam2_runtime;
-- Stage 2 (Phases 3-5) extends user_role from SELECT-only to SELECT+INSERT: role assignment
-- (routes/roles.ts) and the one-time bootstrap transition (routes/bootstrap.ts) both INSERT a
-- row; neither ever UPDATEs/DELETEs a user_role row this stage (no revoke-role endpoint is
-- built — see the task brief's judgment call on that being out of scope), so INSERT is exactly
-- what's needed, nothing more. RLS (ENABLE+FORCE, ownership by user_id) still governs which
-- rows an INSERT may even land as, on top of this grant.
GRANT SELECT, INSERT ON iam2.user_role TO role_iam2_runtime;
GRANT SELECT ON iam2.user_permission_override TO role_iam2_runtime;
GRANT INSERT ON iam2.permission_decision_log TO role_iam2_runtime;
-- Stage 2: bumpCacheVersion (lib/cache-version.ts) does a single INSERT ... ON CONFLICT ...
-- DO UPDATE upsert keyed on the subject_id UNIQUE constraint — needs both INSERT and UPDATE
-- alongside the existing SELECT (guard.ts's lookupCacheVersion / decision-token verification
-- still only ever SELECT).
GRANT SELECT, INSERT, UPDATE ON iam2.permission_cache_version TO role_iam2_runtime;

-- ---------------------------------------------------------------------------------------
-- STAGE 2 (Phases 3-5) additions — approval-to-execution binding, maker-checker/SoD, decision
-- tokens. Same C1 discipline as stage 1: grant exactly what THIS stage's code
-- (lib/decision-token.ts, lib/sod.ts, routes/approvals.ts, routes/roles.ts,
-- routes/bootstrap.ts) actually does.
-- ---------------------------------------------------------------------------------------
-- approval_policy — read-only lookup by (action, resource) when creating an approval request.
GRANT SELECT ON iam2.approval_policy TO role_iam2_runtime;
-- approval_request — created once (INSERT), read back by approval_id on approve/reject
-- (SELECT), and its approved_count/status/completed_at_utc mutated in place (UPDATE) — never
-- deleted.
GRANT SELECT, INSERT, UPDATE ON iam2.approval_request TO role_iam2_runtime;
-- approval_decision — append-only evidence row per approve/reject decision; never read back
-- (the running approved_count lives on approval_request, not derived by counting decisions)
-- or mutated.
GRANT INSERT ON iam2.approval_decision TO role_iam2_runtime;
-- sod_rule — global conflict-matrix catalogue, read-only (lib/sod.ts queries active rules).
GRANT SELECT ON iam2.sod_rule TO role_iam2_runtime;
-- sod_check — append-only evidence row per SoD evaluation; never read back this stage.
GRANT INSERT ON iam2.sod_check TO role_iam2_runtime;
-- permission_decision_token — issued once (INSERT), resolved by token_hash on execute-verify
-- (SELECT), and marked consumed/revoked in place (UPDATE) — single-use, never deleted.
-- Deliberately NO ownership-RLS-style restriction here (see 006's header comment — this table
-- has no RLS at all, by design); the grant alone is the only DB-level control surface.
GRANT SELECT, INSERT, UPDATE ON iam2.permission_decision_token TO role_iam2_runtime;

-- Explicit: NO blanket grant into `iam`, `foundation`-beyond-the-approved-interface, or any
-- other module schema. role_iam2_runtime must never be able to read/write iam.* or
-- foundation.module_registry generically — IAM-02 reaches IAM-01 only over IAM-01's HTTP
-- surface (verify-assertion, later phases), never via direct cross-schema SQL. This is
-- asserted by the F3(a)-equivalent test: `SET ROLE role_iam2_runtime` then a query against
-- iam.user_identity / foundation.module_registry must be permission-denied.
--
-- NARROW EXCEPTION (same C1/C2-informed pattern IAM-01 uses): `@aix/foundation`'s
-- `publishAudit`/`enqueueOutbox` and `beginIdempotent`/`completeIdempotent` write to
-- `foundation.outbox_event` and `foundation.idempotency_record` respectively, ON THE
-- CALLER'S OWN CONNECTION/ROLE. `enqueueOutbox`/`publishAudit` only ever INSERT (C1 lesson
-- applied immediately, not retrofitted later — this is IAM-02's first grant file, so there
-- is no "already-provisioned DB" to strip an old SELECT/UPDATE from, unlike
-- iam_runtime_grants.sql's C1 patch). `foundation.idempotency_record` keeps the full
-- SELECT/INSERT/UPDATE cycle (its cross-module isolation is `source_module` + RLS from the
-- C2 patch — infra/migrations/005_fnd_idempotency_module_scope.cjs — not the grant); Phase 2
-- code in this stage does not itself call beginIdempotent/completeIdempotent (the guard's
-- only route, POST /internal/iam2/permission/check, is a read-mostly decision report with no
-- Idempotency-Key in its documented request shape — see routes/internal.ts header comment —
-- so there is no mutating-replay risk to dedupe this stage), but the grant is added now,
-- scoped identically to IAM-01's, so a later phase that DOES need it (e.g. approval
-- creation) does not need a further grants-file patch just to reach this shared table.
GRANT USAGE ON SCHEMA foundation TO role_iam2_runtime;
GRANT INSERT ON foundation.outbox_event TO role_iam2_runtime;
GRANT SELECT, INSERT, UPDATE ON foundation.idempotency_record TO role_iam2_runtime;
