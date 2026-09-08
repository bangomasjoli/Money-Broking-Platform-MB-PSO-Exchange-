/* eslint-disable camelcase */

/**
 * 009_sec1_integrity_verification — SEC-01 Phase 3 slice (blueprint `05_Database_Design.md`
 * §2.11; approved plan `docs/implementation/SEC-01_Phase3_Implementation_Plan_v1.0.md`).
 *
 * Adds ONLY:
 *   1. `sec1.integrity_verification_run` — persists the result of an on-demand integrity-
 *      verification run over a stream range (ad-hoc, sealed or not — a separate, related
 *      mechanism from seal verification; see `sec1.audit_seal_batch.verification_status`).
 *   2. `sec1.audit_event.canonical_format_version` — the L1 hash-versioning column (see
 *      `services/sec1/src/lib/canonical.ts`'s header comment for the full model). Every row
 *      that existed before this migration is backfilled to `1` (the pre-Phase-3 formula,
 *      which never bound `classification`/`retention_class` into the hash) via a plain
 *      `ADD COLUMN ... NOT NULL DEFAULT 1` — Postgres populates every existing row with that
 *      constant at ALTER time. The column default is then bumped to `2` so any FUTURE
 *      direct-SQL insert (bypassing the application, which always sets this column
 *      explicitly) defaults to the CURRENT formula rather than silently reverting to the old
 *      one.
 *
 * Deliberately does NOT create any other later-phase table (`interim_audit_handoff`,
 * `audit_correction`, `expected_event_reconciliation`, `recovery_integrity_run`,
 * `security_monitoring_rule`, `monitoring_dead_letter`, `security_alert`,
 * `alert_triage_note`, `evidence_export`, `sensitive_read_log`) — all remain out of scope for
 * this phase, mirroring 008's own phasing discipline.
 *
 * GRANTS: see infra/grants/sec1_runtime_grants.sql (separate file, applied by a privileged
 * role, same convention as migration 008).
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- §2.11 integrity_verification_run — persists one row per on-demand verification run
    -- (services/sec1/src/lib/integrity.ts's runIntegrityVerification). Read-only against
    -- sec1.audit_event; never mutates it.
    CREATE TABLE sec1.integrity_verification_run (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      verification_id    varchar(64) NOT NULL UNIQUE,
      stream_id          varchar(160) NOT NULL,
      from_sequence_no   bigint NOT NULL,
      to_sequence_no     bigint NOT NULL,
      result             varchar(16) NOT NULL CHECK (result IN ('pass','fail')),
      gap_count          int NOT NULL DEFAULT 0,
      mismatch_count     int NOT NULL DEFAULT 0,
      findings           jsonb NOT NULL DEFAULT '{}'::jsonb,
      run_at_utc         timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_sec1_integrity_verification_run_stream_run_at
      ON sec1.integrity_verification_run (stream_id, run_at_utc);

    -- L1 hash-format versioning (canonical.ts's CANONICAL_FORMAT_VERSION_V1/V2). Adding with
    -- NOT NULL DEFAULT 1 backfills every existing row to the pre-Phase-3 formula (Postgres
    -- populates existing rows with the constant DEFAULT at ALTER time, no separate UPDATE
    -- needed) BEFORE the default is bumped to 2 for future rows.
    ALTER TABLE sec1.audit_event ADD COLUMN canonical_format_version smallint NOT NULL DEFAULT 1;
    ALTER TABLE sec1.audit_event ALTER COLUMN canonical_format_version SET DEFAULT 2;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE sec1.audit_event DROP COLUMN IF EXISTS canonical_format_version;
    DROP TABLE IF EXISTS sec1.integrity_verification_run;
  `);
};
