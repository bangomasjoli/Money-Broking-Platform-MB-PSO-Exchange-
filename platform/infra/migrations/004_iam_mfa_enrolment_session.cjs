/* eslint-disable camelcase */

/**
 * 004_iam_mfa_enrolment_session — S2 gap-closing patch (IAM-01 Security Review Opus v0.1).
 *
 * PROBLEM: a user created with `mfa_required = true` but no active MFA factor (the
 * break-glass bootstrap admin, decision #3) had no way to complete login — `POST /auth/login`
 * refused to issue any session at all (not even a limited one) when `mfa_required` is set and
 * no active factor exists, and `POST /auth/mfa/enrol` requires an already-authenticated
 * session. Dead end.
 *
 * FIX: an out-of-band, purpose-scoped "enrolment session" — an opaque, hash-only-at-rest
 * bearer credential returned by `POST /auth/login` in place of a full session when this state
 * is hit. It grants ONLY the ability to start+verify TOTP enrolment for the SAME user_id it
 * was minted for (`POST /auth/mfa/enrol/start`, `POST /auth/mfa/enrol/verify`) — never a
 * general-purpose session. Single-use (rejected once `status != 'active'`), short-lived, and
 * verify attempts are rate-limited via the existing `iam.account_lockout` (action 'mfa').
 *
 * Deliberately NO RLS on this table — same precedent as `iam.mfa_challenge` /
 * `iam.step_up_assertion` / `iam.service_account`: it is looked up by a pre-auth opaque
 * secret hash, before any user_id scope can be established (the exact shape of problem S1
 * fixes for `iam.session`/`iam.refresh_token`). Ownership is enforced by the hash lookup +
 * app-level checks (status/expiry/user_id match), not by a DB-level ownership policy — adding
 * FORCE RLS here would reintroduce the S1 class of bug for a brand-new table.
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- enrolment_id is a NON-secret internal handle (audit entity_id only, never returned to
    -- the client alone as a usable credential). The value returned to the client -- and named
    -- enrolment_session_id in the API response, per the task's literal field name -- is the
    -- raw bearer secret; only its sha256 (session_token_hash) is ever persisted, mirroring
    -- iam.step_up_assertion.assertion_id (non-secret) vs. assertion_hash (secret hash).
    CREATE TABLE iam.mfa_enrolment_session (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      enrolment_id             varchar(64) NOT NULL UNIQUE,
      session_token_hash       varchar(128) NOT NULL UNIQUE,
      user_id                  varchar(64) NOT NULL REFERENCES iam.user_identity (user_id),
      factor_id                varchar(64),
      status                   varchar(16) NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active','used','expired','revoked')),
      expires_at_utc           timestamptz NOT NULL,
      created_at_utc           timestamptz NOT NULL DEFAULT now(),
      used_at_utc               timestamptz,
      correlation_id             varchar(128)
    );

    CREATE INDEX idx_iam_mfa_enrolment_session_user_status
      ON iam.mfa_enrolment_session (user_id, status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS iam.mfa_enrolment_session;`);
};
