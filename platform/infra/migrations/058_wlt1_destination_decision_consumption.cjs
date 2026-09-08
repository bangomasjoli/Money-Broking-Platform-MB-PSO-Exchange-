/* eslint-disable camelcase */

/**
 * 058_wlt1_destination_decision_consumption — WLT-01 Phase 4B (verify-and-consume: single-use
 * consumption of an already-issued destination-use decision). Implements the FROZEN architecture
 * (WLT-01 Phase 4B Architecture Addendum, CLOSED + Micro-Addendum, CLOSED) exactly — no new
 * architectural decisions are made in this file.
 *
 * Widens `wlt1.destination_decision.status`'s single-value CHECK (`'issued'` only, frozen at
 * migration 057) to `'issued'`/`'consumed'` — exactly the bounded CHECK-widening pattern migration
 * 054 already established for `verification_scheme`, and the pattern migration 057's own header
 * comment explicitly reserved for this migration.
 *
 * Adds exactly THREE nullable columns, each with a concrete Phase 4B consumer:
 *   - `consumed_at_utc`  — the PostgreSQL-authoritative instant of first consumption (response +
 *     replay receipt).
 *   - `consumption_id`   — `wlt1con_` + a UUID, the durable evidence-of-consumption identifier a
 *     future WDR-01/TRD-01/LED-01 caller records (WLT-01 Blueprint Pack v1.2 §01 line 566,
 *     "WLT-01 destination usage evidence").
 *   - `execution_ref`    — the caller-generated domain idempotency/execution-correlation key
 *     (WLT-01 Blueprint Pack v1.2 rule 6: "one-time or idempotently bound to the same execution
 *     reference"). This is NOT part of the authority scope issued at Phase 4A-2 — it identifies
 *     WHICH consumption event this is, never WHAT was authorized. See `routes/decision-consume.ts`'s
 *     own header comment for the full binding-scope rationale.
 *
 * Deliberately NOT added: `amount`, `asset`, `currency`, `rail`, `limits_version`,
 * `mandate_version`, `risk_result_version`, any AML decision-hash/revocation-epoch column,
 * `decision_status`, `sec_audit_ref`, `consumed_by_module` — none has a concrete Phase 4B consumer
 * (see the Architecture Addendum's own binding-scope ruling; `caller_module` is audit metadata
 * only, never persisted, per the Micro-Addendum).
 *
 * COHERENCE CHECK (frozen, load-bearing): `status = 'issued'` requires all three new columns NULL;
 * `status = 'consumed'` requires all three NOT NULL. This is the same "structural coherence, not
 * merely NOT NULL" discipline this codebase already applies elsewhere — a partially-consumed row
 * (e.g. `consumed_at_utc` set but `status` still `'issued'`) is never a representable state.
 *
 * EVIDENCE-PRESERVING DOWN (mirrors migration 055's own established precedent): refuses if ANY row
 * has `status = 'consumed'` — durable consumption evidence must never be silently discarded by a
 * schema rollback. A genuinely untouched Phase 4B schema (no verify-and-consume call has ever
 * succeeded) rolls back cleanly.
 */

const STATUS_CHECK_NAME = "destination_decision_status_check";
const COHERENCE_CHECK_NAME = "chk_wlt1_destination_decision_consumption_coherent";
const CONSUMPTION_ID_INDEX_NAME = "idx_wlt1_destination_decision_consumption_id";

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE wlt1.destination_decision
      DROP CONSTRAINT ${STATUS_CHECK_NAME},
      ADD CONSTRAINT ${STATUS_CHECK_NAME} CHECK (status IN ('issued', 'consumed')),
      ADD COLUMN consumed_at_utc timestamptz,
      ADD COLUMN consumption_id varchar(64),
      ADD COLUMN execution_ref varchar(64),
      ADD CONSTRAINT ${COHERENCE_CHECK_NAME} CHECK (
            (status = 'issued'   AND consumed_at_utc IS NULL     AND consumption_id IS NULL     AND execution_ref IS NULL)
         OR (status = 'consumed' AND consumed_at_utc IS NOT NULL AND consumption_id IS NOT NULL AND execution_ref IS NOT NULL)
      );

    CREATE UNIQUE INDEX ${CONSUMPTION_ID_INDEX_NAME}
      ON wlt1.destination_decision (consumption_id)
      WHERE consumption_id IS NOT NULL;
  `);
};

exports.down = async (pgm) => {
  // ===========================================================================================
  // EVIDENCE-PRESERVING DOWN — refuse loudly rather than silently discard consumption evidence.
  // ===========================================================================================
  const consumedRows = await pgm.db.query(`SELECT count(*)::int AS n FROM wlt1.destination_decision WHERE status = 'consumed'`);
  if (Number(consumedRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "058_wlt1_destination_decision_consumption down migration refused: wlt1.destination_decision contains rows with status='consumed'. Durable consumption evidence must never be silently discarded or rewritten by a schema rollback.",
    );
  }

  await pgm.db.query(`DROP INDEX wlt1.${CONSUMPTION_ID_INDEX_NAME}`);
  await pgm.db.query(`ALTER TABLE wlt1.destination_decision DROP CONSTRAINT ${COHERENCE_CHECK_NAME}`);
  await pgm.db.query(`ALTER TABLE wlt1.destination_decision DROP COLUMN execution_ref`);
  await pgm.db.query(`ALTER TABLE wlt1.destination_decision DROP COLUMN consumption_id`);
  await pgm.db.query(`ALTER TABLE wlt1.destination_decision DROP COLUMN consumed_at_utc`);

  // Safe to narrow — the refusal guard above already proved every remaining row is 'issued'.
  await pgm.db.query(`ALTER TABLE wlt1.destination_decision DROP CONSTRAINT ${STATUS_CHECK_NAME}`);
  await pgm.db.query(`ALTER TABLE wlt1.destination_decision ADD CONSTRAINT ${STATUS_CHECK_NAME} CHECK (status IN ('issued'))`);
};
