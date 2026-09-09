/* eslint-disable camelcase */

/**
 * 068_fnd_rate_limit_engine — Shared Rate-Limit Engine (WLT-01 BLOCKER-2 prerequisite).
 * Implements the FROZEN architecture exactly (Shared Rate-Limit Engine Architecture / Security
 * Contract, ACCEPTED FOR IMPLEMENTATION; numeric policy governance record DEC-009,
 * `docs/DECISION_LOG.md`). No new architectural decisions are made in this file.
 *
 * STRUCTURE ONLY — this migration seeds ZERO policy rows. Numeric policy is a SEPARATE,
 * governance-approved seed migration (`069_fnd_rate_limit_policy_seed`), citing DEC-009.
 *
 * Two tables, both owned by the `foundation` schema (FND-01):
 *
 *   `foundation.rate_limit_counter` — one row per `(module, bucket, subject_hash)`, REUSED
 *   forever across windows (never one row per window, never one per request). Both the burst
 *   and sustained window live in the SAME row so a single atomic upsert can roll over/increment
 *   both dimensions in one statement. `role_fnd_runtime` already holds SELECT/INSERT/UPDATE on
 *   every table in this schema via the existing blanket grant + `ALTER DEFAULT PRIVILEGES`
 *   (`infra/grants/fnd_runtime_grants.sql`) — no grant change needed for this table.
 *
 *   `foundation.rate_limit_policy` — governance-owned numeric limits, one row per
 *   `(module, bucket)`. `role_fnd_runtime` gains SELECT via the same blanket default-privilege
 *   grant, but this migration's own grants-file companion change
 *   (`infra/grants/fnd_runtime_grants.sql`) REVOKEs INSERT/UPDATE from the runtime role
 *   immediately after this table exists — policy changes only through a governance-approved
 *   migration, never at runtime. See that file's own comment for the guarded (pre-068-safe)
 *   REVOKE.
 *
 * Deliberately NO RLS on either table (unlike `foundation.idempotency_record`, migration 005):
 * that table needs RLS because MULTIPLE module runtime roles hold grants on it. Only
 * `role_fnd_runtime` will ever hold a grant on these two tables — no other module's runtime
 * role is granted access, and every consumer reaches the engine over HTTP only (WLT DATABASE
 * GRANT DELTA: NONE). Namespace isolation between modules/buckets is structural (the composite
 * PRIMARY KEY / UNIQUE constraint), not RLS-enforced.
 *
 * `module`/`bucket` CHECK patterns mirror the exact shape convention already established by
 * migration 005 (`source_module ~ '^[A-Z]{2,4}-[0-9]{2}$'`) — a shape check, not an enum, so a
 * new consumer module lands without a migration to edit this constraint.
 *
 * The pre-existing `foundation.rate_limit_decision_log` table (migration 001, §3.12) is reused
 * unchanged for denial evidence — no third logging table is created here.
 */

const COUNTER_TABLE = "foundation.rate_limit_counter";
const POLICY_TABLE = "foundation.rate_limit_policy";
const MODULE_BUCKET_CHECK_PATTERN = "'^[A-Z]{2,4}-[0-9]{2}$'";
const BUCKET_CHECK_PATTERN = "'^[A-Z][A-Z0-9_]*$'";

exports.up = (pgm) => {
  pgm.sql(`
    -- ---------------------------------------------------------------------------------------
    -- foundation.rate_limit_counter — one row per (module, bucket, subject_hash), reused
    -- across every window rollover. Both burst and sustained state live in the same row.
    -- ---------------------------------------------------------------------------------------
    CREATE TABLE ${COUNTER_TABLE} (
      module                      varchar(16) NOT NULL
                                     CHECK (module ~ ${MODULE_BUCKET_CHECK_PATTERN}),
      bucket                      varchar(64) NOT NULL
                                     CHECK (bucket ~ ${BUCKET_CHECK_PATTERN}),
      subject_hash                varchar(128) NOT NULL,
      burst_window_start_utc      timestamptz NOT NULL,
      burst_count                 integer NOT NULL CHECK (burst_count >= 0),
      sustained_window_start_utc  timestamptz NOT NULL,
      sustained_count             integer NOT NULL CHECK (sustained_count >= 0),
      updated_at_utc               timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (module, bucket, subject_hash)
    );

    -- ---------------------------------------------------------------------------------------
    -- foundation.rate_limit_policy — governance-owned numeric limits, one row per
    -- (module, bucket). Coherence CHECKs mirror the accepted architecture's own dual-window
    -- semantics: a burst window can never exceed its own sustained window, and a burst limit
    -- can never exceed the sustained limit it is a sub-window of.
    -- ---------------------------------------------------------------------------------------
    CREATE TABLE ${POLICY_TABLE} (
      policy_id                   varchar(64) NOT NULL UNIQUE,
      module                      varchar(16) NOT NULL
                                     CHECK (module ~ ${MODULE_BUCKET_CHECK_PATTERN}),
      bucket                      varchar(64) NOT NULL
                                     CHECK (bucket ~ ${BUCKET_CHECK_PATTERN}),
      burst_limit                 integer NOT NULL CHECK (burst_limit > 0),
      burst_window_seconds        integer NOT NULL CHECK (burst_window_seconds > 0),
      sustained_limit             integer NOT NULL CHECK (sustained_limit > 0),
      sustained_window_seconds    integer NOT NULL CHECK (sustained_window_seconds > 0),
      status                      varchar(16) NOT NULL DEFAULT 'active'
                                     CHECK (status IN ('active', 'inactive')),
      version                     integer NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at_utc               timestamptz NOT NULL DEFAULT now(),
      updated_at_utc                timestamptz NOT NULL DEFAULT now(),
      UNIQUE (module, bucket),
      CONSTRAINT chk_fnd_rate_limit_policy_window_coherent
        CHECK (burst_window_seconds <= sustained_window_seconds),
      CONSTRAINT chk_fnd_rate_limit_policy_limit_coherent
        CHECK (burst_limit <= sustained_limit)
    );
  `);
};

exports.down = async (pgm) => {
  // EVIDENCE-PRESERVING DOWN (mirrors the established platform convention, e.g. migration 067):
  // refuses if either table holds any row — a populated counter table means real enforcement
  // state exists, and a populated policy table means a governance-approved seed has landed.
  // Neither should ever be silently discarded by a schema rollback.
  const counterRows = await pgm.db.query(`SELECT count(*)::int AS n FROM ${COUNTER_TABLE}`);
  if (Number(counterRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "068_fnd_rate_limit_engine down migration refused: foundation.rate_limit_counter contains rows. Rate-limit enforcement state must never be silently discarded by a schema rollback.",
    );
  }

  const policyRows = await pgm.db.query(`SELECT count(*)::int AS n FROM ${POLICY_TABLE}`);
  if (Number(policyRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "068_fnd_rate_limit_engine down migration refused: foundation.rate_limit_policy contains rows (governance-approved policy, e.g. migration 069). Down 069 first.",
    );
  }

  await pgm.db.query(`
    DROP TABLE ${POLICY_TABLE};
    DROP TABLE ${COUNTER_TABLE};
  `);
};
