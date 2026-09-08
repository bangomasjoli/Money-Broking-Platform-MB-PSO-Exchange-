/* eslint-disable camelcase */

/**
 * 003_iam_rls_token_lookup — S1 gap-closing patch (IAM-01 Security Review Opus v0.1).
 *
 * PROBLEM: `iam.session` / `iam.refresh_token` carry ENABLE + FORCE ROW LEVEL SECURITY with
 * an ownership-only policy `USING (user_id = current_setting('aix.user_id', true))`. But
 * `validateAccessToken()` / `rotateRefreshToken()` (services/iam/src/lib/session.ts) resolve
 * the row BY TOKEN HASH before the owning user_id is known, on a connection that has not
 * (and cannot yet) set `aix.user_id`. Under `role_iam_runtime` (non-superuser, no BYPASSRLS)
 * that pre-auth lookup returns zero rows — authentication fails closed to "not found" on
 * every request, i.e. the module does not work at all under the intended least-privilege
 * runtime role. The existing test suite never caught this because it connects as the
 * `postgres` superuser, which bypasses RLS unconditionally.
 *
 * FIX (Option A, per task brief): schema-qualified SECURITY DEFINER functions that resolve
 * the row by hash, returning ONLY the minimal columns the caller needs. `SET search_path =
 * iam, pg_temp` prevents search-path hijacking. `role_iam_runtime` gets EXECUTE on these
 * functions (granted in infra/grants/iam_runtime_grants.sql) but NOT blanket unscoped SELECT
 * capability for the pre-auth path — the functions are the only sanctioned way to resolve a
 * session/refresh row by its secret hash before the owner is known.
 *
 * A SECURITY DEFINER function runs with the privileges of its OWNER (the role that executes
 * this migration — `postgres` per this repo's documented VERIFY flow, a superuser). Because
 * FORCE ROW LEVEL SECURITY explicitly makes RLS apply even to a table's owner, this trick
 * only bypasses RLS when the function owner is a superuser or carries BYPASSRLS (which
 * `postgres` does) — that matches how migrations are actually run in this repo (a single
 * privileged migration identity, distinct from the unprivileged `role_iam_runtime` used at
 * request time). If a future deploy introduces a non-superuser migration role, these
 * functions would need `ALTER FUNCTION ... OWNER TO <a BYPASSRLS role>` to keep working —
 * noted here rather than silently assumed.
 *
 * A THIRD function, `fn_touch_session_last_seen`, exists for the same reason: the
 * `last_seen_at_utc` touch in `validateAccessToken` runs on a bare (non-transactional) pooled
 * connection that never has `aix.user_id` set (see plugins/user-session.ts), so it needs the
 * same RLS bypass as the initial resolve. (S3, deferred: throttling this write is a separate,
 * non-blocking follow-up — see IAM-01_IMPLEMENTATION_NOTES.md.)
 *
 * Everywhere else in the codebase (session creation, refresh rotation past the initial
 * resolve, logout, MFA/step-up factor reads, internal freeze/revoke-all), the fix is NOT a
 * SECURITY DEFINER function — it is setting `aix.user_id` via `set_config(..., true)` on the
 * SAME transaction once the owning user_id is legitimately known (mirroring the existing
 * `withUserScope` pattern for `GET /auth/sessions`). That keeps RLS as a real, narrowly
 * satisfied ownership check rather than something broadly bypassed.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION iam.fn_resolve_session_by_token_hash(p_token_hash text)
    RETURNS TABLE (
      session_id       varchar(64),
      user_id          varchar(64),
      session_status   varchar(16),
      expires_at_utc   timestamptz,
      user_class       varchar(24)
    )
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = iam, pg_temp
    AS $fn$
      SELECT session_id, user_id, session_status, expires_at_utc, user_class
        FROM iam.session
       WHERE session_token_hash = p_token_hash;
    $fn$;

    CREATE OR REPLACE FUNCTION iam.fn_resolve_refresh_by_token_hash(p_token_hash text)
    RETURNS TABLE (
      token_id          varchar(64),
      token_family_id   varchar(64),
      session_id        varchar(64),
      user_id           varchar(64),
      status            varchar(16),
      expires_at_utc    timestamptz
    )
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = iam, pg_temp
    AS $fn$
      SELECT token_id, token_family_id, session_id, user_id, status, expires_at_utc
        FROM iam.refresh_token
       WHERE token_hash = p_token_hash;
    $fn$;

    CREATE OR REPLACE FUNCTION iam.fn_touch_session_last_seen(p_session_id text)
    RETURNS void
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = iam, pg_temp
    AS $fn$
      UPDATE iam.session SET last_seen_at_utc = now() WHERE session_id = p_session_id;
    $fn$;

    -- Lock down: no PUBLIC access; EXECUTE is granted explicitly to role_iam_runtime in
    -- infra/grants/iam_runtime_grants.sql (kept alongside the table grants, per convention).
    REVOKE ALL ON FUNCTION iam.fn_resolve_session_by_token_hash(text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION iam.fn_resolve_refresh_by_token_hash(text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION iam.fn_touch_session_last_seen(text) FROM PUBLIC;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP FUNCTION IF EXISTS iam.fn_resolve_session_by_token_hash(text);
    DROP FUNCTION IF EXISTS iam.fn_resolve_refresh_by_token_hash(text);
    DROP FUNCTION IF EXISTS iam.fn_touch_session_last_seen(text);
  `);
};
