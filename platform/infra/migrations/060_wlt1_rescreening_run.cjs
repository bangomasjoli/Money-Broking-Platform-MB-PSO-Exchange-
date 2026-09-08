/* eslint-disable camelcase */

/**
 * 060_wlt1_rescreening_run — WLT-01 Ongoing Rescreening. Implements the FROZEN architecture
 * (WLT-01 Ongoing Rescreening Addendum, CLOSED + Run-Lifecycle Micro-Addendum, CLOSED) exactly —
 * no new architectural decisions are made in this migration.
 *
 * Creates `wlt1.rescreening_run` — one row per rescreening batch (periodic or single-destination
 * manual), mirroring AML-01's own accepted `aml1.monitoring_run` shape (migration 039), own copy,
 * F3(c). Both source-coherence CHECKs (scope <-> target_destination_id, and status <->
 * completed_at_utc) are structural, not merely NOT NULL — a `destination`-scope row with no target,
 * or a `running` row with a completion timestamp, is never representable.
 *
 * Widens `wlt1.destination_revocation` (migration 059) in the SAME migration:
 *   - `source` CHECK: adds `'rescreening'` — WLT-01 itself, not AML-01, decided this containment
 *     from provider evidence it evaluated directly; `source='aml'` would fabricate AML provenance
 *     that was never asserted.
 *   - `reason_code` CHECK: adds `'rescreen_adverse'`.
 *   - source-coherence CHECK: adds a third branch — `source='rescreening'` requires `actor_id
 *     NULL`, `signal_ref NOT NULL` (the screening_result_id that produced the adverse evidence —
 *     never a fabricated `aml1sig_*` identity), `signal_type NULL` (AML's signal_type enum
 *     describes AML determinations; WLT has no honest value for it). The existing `operator`/`aml`
 *     branches are byte-unchanged.
 *   - The global partial UNIQUE index on `signal_ref` is untouched — a rescreening-originated
 *     `signal_ref` is a real `screening_result_id`, minted fresh per destination attempt, so it can
 *     never collide across destinations (see the accepted revocation review's L-1 finding, which
 *     this phase cannot reproduce for exactly this reason).
 *
 * EVIDENCE-PRESERVING DOWN (mirrors migrations 055/058/059): refuses if ANY `rescreening_run` row
 * exists, OR if any `destination_revocation` row has `source='rescreening'` — both are durable
 * evidence a schema rollback must never silently discard or rewrite. Only proceeds once both
 * guards return zero.
 */

const RUN_TABLE = "wlt1.rescreening_run";
const SCOPE_COHERENCE_CHECK_NAME = "chk_wlt1_rescreening_run_scope_coherent";
const TERMINAL_COHERENCE_CHECK_NAME = "chk_wlt1_rescreening_run_terminal_coherent";
const RUN_STATUS_INDEX_NAME = "idx_wlt1_rescreening_run_status_started";

const REVOCATION_SOURCE_CHECK_NAME = "destination_revocation_source_check";
const REVOCATION_REASON_CHECK_NAME = "destination_revocation_reason_code_check";
const REVOCATION_COHERENCE_CHECK_NAME = "chk_wlt1_destination_revocation_source_coherent";

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE ${RUN_TABLE} (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id                 varchar(64) NOT NULL UNIQUE,
      scope                  varchar(16) NOT NULL CHECK (scope IN ('periodic_due', 'destination')),
      status                 varchar(24) NOT NULL DEFAULT 'running'
                                CHECK (status IN ('running', 'completed', 'completed_with_errors', 'failed')),
      requested_by           varchar(64) NOT NULL,
      target_destination_id  varchar(64) REFERENCES wlt1.destination (destination_id),
      candidates_selected    integer NOT NULL DEFAULT 0,
      rescreened_clear       integer NOT NULL DEFAULT 0,
      rescreened_adverse     integer NOT NULL DEFAULT 0,
      revocations_triggered  integer NOT NULL DEFAULT 0,
      skipped                integer NOT NULL DEFAULT 0,
      failures               integer NOT NULL DEFAULT 0,
      request_id             varchar(128),
      correlation_id         varchar(128),
      started_at_utc         timestamptz NOT NULL DEFAULT now(),
      completed_at_utc       timestamptz,
      CONSTRAINT ${SCOPE_COHERENCE_CHECK_NAME} CHECK (
            (scope = 'destination'  AND target_destination_id IS NOT NULL)
         OR (scope = 'periodic_due' AND target_destination_id IS NULL)
      ),
      CONSTRAINT ${TERMINAL_COHERENCE_CHECK_NAME} CHECK (
            (status = 'running' AND completed_at_utc IS NULL)
         OR (status <> 'running' AND completed_at_utc IS NOT NULL)
      )
    );

    CREATE INDEX ${RUN_STATUS_INDEX_NAME}
      ON ${RUN_TABLE} (status, started_at_utc DESC);

    ALTER TABLE wlt1.destination_revocation
      DROP CONSTRAINT ${REVOCATION_SOURCE_CHECK_NAME},
      ADD CONSTRAINT ${REVOCATION_SOURCE_CHECK_NAME} CHECK (source IN ('operator', 'aml', 'rescreening')),
      DROP CONSTRAINT ${REVOCATION_REASON_CHECK_NAME},
      ADD CONSTRAINT ${REVOCATION_REASON_CHECK_NAME} CHECK (reason_code IN (
        'compromise',
        'client_request',
        'beneficiary_change',
        'operator_security_action',
        'administrative',
        'aml_risk_signal',
        'rescreen_adverse'
      )),
      DROP CONSTRAINT ${REVOCATION_COHERENCE_CHECK_NAME},
      ADD CONSTRAINT ${REVOCATION_COHERENCE_CHECK_NAME} CHECK (
            (source = 'operator'    AND actor_id IS NOT NULL AND signal_ref IS NULL     AND signal_type IS NULL)
         OR (source = 'aml'         AND actor_id IS NULL     AND signal_ref IS NOT NULL AND signal_type IS NOT NULL)
         OR (source = 'rescreening' AND actor_id IS NULL     AND signal_ref IS NOT NULL AND signal_type IS NULL)
      );
  `);
};

exports.down = async (pgm) => {
  // ===========================================================================================
  // EVIDENCE-PRESERVING DOWN — refuse loudly rather than silently discard rescreening run history
  // or rescreening-originated revocation evidence.
  // ===========================================================================================
  const runRows = await pgm.db.query(`SELECT count(*)::int AS n FROM ${RUN_TABLE}`);
  if (Number(runRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "060_wlt1_rescreening_run down migration refused: wlt1.rescreening_run contains rows. Durable rescreening run history must never be silently discarded by a schema rollback.",
    );
  }
  const rescreeningRevocationRows = await pgm.db.query(`SELECT count(*)::int AS n FROM wlt1.destination_revocation WHERE source = 'rescreening'`);
  if (Number(rescreeningRevocationRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "060_wlt1_rescreening_run down migration refused: wlt1.destination_revocation contains rows with source='rescreening'. Durable rescreening-originated revocation evidence must never be silently discarded or rewritten by a schema rollback.",
    );
  }

  await pgm.db.query(`
    ALTER TABLE wlt1.destination_revocation
      DROP CONSTRAINT ${REVOCATION_COHERENCE_CHECK_NAME},
      ADD CONSTRAINT ${REVOCATION_COHERENCE_CHECK_NAME} CHECK (
            (source = 'operator' AND actor_id IS NOT NULL AND signal_ref IS NULL     AND signal_type IS NULL)
         OR (source = 'aml'      AND actor_id IS NULL     AND signal_ref IS NOT NULL AND signal_type IS NOT NULL)
      ),
      DROP CONSTRAINT ${REVOCATION_REASON_CHECK_NAME},
      ADD CONSTRAINT ${REVOCATION_REASON_CHECK_NAME} CHECK (reason_code IN (
        'compromise',
        'client_request',
        'beneficiary_change',
        'operator_security_action',
        'administrative',
        'aml_risk_signal'
      )),
      DROP CONSTRAINT ${REVOCATION_SOURCE_CHECK_NAME},
      ADD CONSTRAINT ${REVOCATION_SOURCE_CHECK_NAME} CHECK (source IN ('operator', 'aml'));
  `);

  await pgm.db.query(`DROP INDEX wlt1.${RUN_STATUS_INDEX_NAME}`);
  await pgm.db.query(`DROP TABLE ${RUN_TABLE}`);
};
