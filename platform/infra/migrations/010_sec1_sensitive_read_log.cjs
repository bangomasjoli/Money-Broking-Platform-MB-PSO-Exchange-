/* eslint-disable camelcase */

/**
 * 010_sec1_sensitive_read_log — SEC-01 Phase 4 slice (blueprint `05_Database_Design.md` §2.10;
 * approved plan `docs/implementation/SEC-01_Phase4_Implementation_Plan_v1.0.md` §4/§6).
 *
 * Adds ONLY `sec1.sensitive_read_log` — the append-only record of every request that actually
 * DISCLOSED at least one sensitive-tier audit row (services/sec1/src/lib/sensitive-read-log.ts).
 *
 * ---------------------------------------------------------------------------------------
 * ANTI-RECURSION DESIGN (deliberate, matches the blueprint's own table shape) — this table has
 * NO hash-chain columns (no stream_id/sequence_no/previous_hash/event_hash). It is written by a
 * plain, direct SQL INSERT from the read route's own transaction, never by calling SEC-01's own
 * `POST /internal/sec1/audit-events` ingestion endpoint. This is what avoids the self-referential
 * trap of "auditing a read of the audit store back into the audit store being read" — see
 * SEC-01_Phase4_Implementation_Plan_v1.0.md §6 for the full reasoning.
 * ---------------------------------------------------------------------------------------
 *
 * JUDGMENT CALL — one column added beyond the blueprint's literal `05_Database_Design.md` §2.10
 * list, load-bearing, not decoration:
 *   - `sec1.sensitive_read_log.metadata` (jsonb) — safe, non-sensitive context about the read
 *     (e.g. result_count for a search) for a compliance reviewer, without storing any of the
 *     actual disclosed data. Always `{}` if the caller supplies nothing.
 *
 * Deliberately does NOT create `security_monitoring_rule`, `monitoring_dead_letter`,
 * `security_alert`, `alert_triage_note`, `evidence_export`, `interim_audit_handoff`,
 * `audit_correction`, `expected_event_reconciliation`, or `recovery_integrity_run` — all remain
 * out of scope for Phase 4 (evidence export / monitoring / alerts / handoff / correction /
 * reconciliation / recovery are explicitly deferred), mirroring 008's and 009's own phasing
 * discipline.
 *
 * GRANTS: see infra/grants/sec1_runtime_grants.sql (separate file, applied by a privileged
 * role, same convention as migrations 008/009). Append-only — SELECT, INSERT only, no
 * UPDATE/DELETE ever, same posture as `sec1.audit_event`.
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- §2.10 sensitive_read_log — one row per request that disclosed at least one sensitive-tier
    -- audit row (services/sec1/src/routes/read.ts). Never one row per disclosed event; the
    -- blueprint's own column set (action/audit_event_ref/search_scope_hash) is request-scoped,
    -- matching the existing sec1.integrity_verification_run precedent of "one row per
    -- invocation," not one row per underlying audit_event touched.
    CREATE TABLE sec1.sensitive_read_log (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      read_id               varchar(64) NOT NULL UNIQUE,
      user_id               varchar(64) NOT NULL,
      action                varchar(16) NOT NULL CHECK (action IN ('search','read','export','download')),
      audit_event_ref       varchar(64),
      export_id             varchar(64),
      search_scope_hash     varchar(128),
      reason                text,
      request_id            varchar(128) NOT NULL,
      correlation_id        varchar(128) NOT NULL,
      occurred_at_utc       timestamptz NOT NULL DEFAULT now(),
      -- Load-bearing addition beyond the blueprint literal column list — see migration header.
      metadata               jsonb NOT NULL DEFAULT '{}'::jsonb
    );

    -- §3 index list, item 11: sensitive_read_log(user_id, occurred_at_utc).
    CREATE INDEX idx_sec1_sensitive_read_log_user_occurred
      ON sec1.sensitive_read_log (user_id, occurred_at_utc);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS sec1.sensitive_read_log;`);
};
