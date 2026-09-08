/* eslint-disable camelcase */

/**
 * 005_fnd_idempotency_module_scope — C2 gap-closing patch (IAM-02_Implementation_Plan_v1.0
 * §7 "C2 idempotency isolation", option (a); flagged by IAM-01's final review as a
 * carry-forward item and re-raised by IAM-02 planning since it would become the third
 * consumer of the shared table).
 *
 * PROBLEM: `foundation.idempotency_record` is shared cross-module infrastructure — every
 * module using `beginIdempotent`/`completeIdempotent` (packages/foundation/src/idempotency.ts)
 * needs the full SELECT/INSERT/UPDATE cycle on it (unlike `foundation.outbox_event`, which is
 * INSERT-only for other modules per the C1 patch — see infra/grants/iam_runtime_grants.sql).
 * A table-level grant alone cannot narrow a module to its OWN rows; today `role_iam_runtime`
 * and `role_fnd_runtime` can each read/mutate the other's idempotency rows.
 *
 * FIX: add a `source_module` column, enforce shape (not an enum -- new modules land without a
 * migration to edit) via a CHECK constraint, fold it into the uniqueness key so cross-module
 * key collisions are structurally impossible (not just RLS-hidden), then ENABLE + FORCE ROW
 * LEVEL SECURITY with a policy scoped to `current_setting('aix.module', true)` — the exact
 * `aix.user_id` / `withUserScope` pattern IAM-01's S1 patch proved for per-user isolation
 * (docs/implementation/IAM-01_IMPLEMENTATION_NOTES.md §11), applied here per-module instead.
 * `@aix/foundation`'s `beginIdempotent`/`completeIdempotent` now set `aix.module` on the
 * caller's own (already-open) transaction before touching the table — see
 * packages/foundation/src/idempotency.ts.
 *
 * No grant changes: `infra/grants/fnd_runtime_grants.sql` and
 * infra/grants/iam_runtime_grants.sql` keep their existing SELECT/INSERT/UPDATE grants on
 * this table unchanged. RLS is the isolation mechanism here, not the grant (mirroring how
 * `iam.session`/`iam.refresh_token` keep their table-level grant and rely on RLS, per S1).
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- Nullable first so the backfill below can run before NOT NULL is enforced.
    ALTER TABLE foundation.idempotency_record ADD COLUMN source_module varchar(16);

    -- Backfill (greenfield dev/test system, no real production data to reconcile): derive
    -- source_module from the existing namespaced action prefix. Every action already in this
    -- table was written by either FND-01 (namespace "foundation.*", e.g.
    -- "foundation.jobs.enqueue") or IAM-01 (namespace "iam.*", e.g. "iam.auth.login") — the
    -- only two modules that have ever called beginIdempotent so far. Fallback: anything that
    -- matches neither prefix defaults to 'FND-01', since foundation is the owning schema of
    -- this shared table and this is a deliberately simple, non-overengineered backfill for a
    -- table with no real data at stake.
    UPDATE foundation.idempotency_record
       SET source_module = CASE
                              WHEN action LIKE 'foundation.%' THEN 'FND-01'
                              WHEN action LIKE 'iam.%'        THEN 'IAM-01'
                              ELSE 'FND-01'
                            END;

    ALTER TABLE foundation.idempotency_record ALTER COLUMN source_module SET NOT NULL;

    -- Shape check, not an enum: accepts FND-01 / IAM-01 / IAM-02 / SEC-01 / etc. without a
    -- migration every time a new module lands.
    ALTER TABLE foundation.idempotency_record
      ADD CONSTRAINT idempotency_record_source_module_check
      CHECK (source_module ~ '^[A-Z]{2,4}-[0-9]{2}$');

    -- Cross-module key collision must be structurally impossible, not just RLS-hidden.
    ALTER TABLE foundation.idempotency_record
      DROP CONSTRAINT idempotency_record_actor_id_action_idempotency_key_key;
    ALTER TABLE foundation.idempotency_record
      ADD CONSTRAINT idempotency_record_source_module_actor_id_action_idempotency_key_key
      UNIQUE (source_module, actor_id, action, idempotency_key);
    -- No extra explicit index: the UNIQUE constraint above auto-creates its own backing
    -- btree index on (source_module, actor_id, action, idempotency_key), which already
    -- serves the duplicate-lookup SELECT/UPDATE in packages/foundation/src/idempotency.ts.

    -- Fail-closed by construction: current_setting('aix.module', true) returns NULL when
    -- unset, and source_module = NULL is never true in SQL, so an unset/empty aix.module
    -- denies all rows rather than silently exposing them. FORCE RLS makes this apply even to
    -- the table owner. Both USING and WITH CHECK are given explicitly (this table is read AND
    -- written by runtime roles, mirroring the iam.session-family policy shape from S1 -- FORCE
    -- RLS gates writes too, not just reads).
    ALTER TABLE foundation.idempotency_record ENABLE ROW LEVEL SECURITY;
    ALTER TABLE foundation.idempotency_record FORCE ROW LEVEL SECURITY;
    CREATE POLICY idempotency_module_isolation ON foundation.idempotency_record
      USING (source_module = current_setting('aix.module', true))
      WITH CHECK (source_module = current_setting('aix.module', true));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS idempotency_module_isolation ON foundation.idempotency_record;
    ALTER TABLE foundation.idempotency_record NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE foundation.idempotency_record DISABLE ROW LEVEL SECURITY;

    ALTER TABLE foundation.idempotency_record
      DROP CONSTRAINT IF EXISTS idempotency_record_source_module_actor_id_action_idempotency_key_key;
    ALTER TABLE foundation.idempotency_record
      ADD CONSTRAINT idempotency_record_actor_id_action_idempotency_key_key
      UNIQUE (actor_id, action, idempotency_key);

    ALTER TABLE foundation.idempotency_record
      DROP CONSTRAINT IF EXISTS idempotency_record_source_module_check;

    ALTER TABLE foundation.idempotency_record DROP COLUMN IF EXISTS source_module;
  `);
};
