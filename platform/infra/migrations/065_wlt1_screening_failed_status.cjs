/* eslint-disable camelcase */

/**
 * 065_wlt1_screening_failed_status — WLT-01 Named Vendor-Result Ingestion / Async Path —
 * Stuck-Screening Operational Closure. Implements the FROZEN architecture (WLT-01 Named
 * Vendor-Result Ingestion / Async Path Implementation-Contract Architecture Addendum +
 * Stuck-Screening Recovery Final Micro-Clarification) exactly — no new architectural decisions
 * are made in this migration.
 *
 * PURE CHECK WIDENING, mirroring migration 060's own established `DROP CONSTRAINT` /
 * `ADD CONSTRAINT` widening precedent exactly (destination_revocation's source-coherence
 * widening for `rescreening`). NO new table, NO new column, NO change to
 * `wlt1.vendor_result_inbox`, NO change to `wlt1.inbound_source_screening_result`.
 *
 * Adds exactly ONE new terminal value, `'failed'`, to `wlt1.wallet_screening_result.risk_status`
 * — the operational-recovery outcome for a `pending` screening whose provider never delivered a
 * usable terminal result and whose caller never resumed the flow (`lib/stuck-screening.ts`'s own
 * recovery mutation, `services/wlt1/src/routes/stuck-screening.ts`). `failed` is TERMINAL and
 * IMMUTABLE under every existing runtime path — `ScreeningApplicationService`'s own P2B-LOW-1
 * one-way gate (`lib/screening-application.ts`) and the C3 retry-claim predicate
 * (`routes/wallet-screening.ts`) both require `risk_status = 'pending'` before any terminal
 * mutation, so `failed -> clear/review_required/high_risk/hit` is structurally unreachable — no
 * modification to either file was necessary or made.
 *
 * EVIDENCE-PRESERVING DOWN (mirrors migration 060's own identical widening-down precedent): if
 * ANY row has `risk_status = 'failed'`, the CHECK can never be safely narrowed back — that row
 * would then violate the original constraint and evidence must never be silently invalidated or
 * discarded by a schema rollback. A schema with no `failed` row rolls back cleanly.
 */

const TABLE = "wlt1.wallet_screening_result";
const RISK_STATUS_CHECK_NAME = "wallet_screening_result_risk_status_check";

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE ${TABLE}
      DROP CONSTRAINT ${RISK_STATUS_CHECK_NAME},
      ADD CONSTRAINT ${RISK_STATUS_CHECK_NAME}
        CHECK (risk_status IN ('pending', 'clear', 'review_required', 'high_risk', 'hit', 'failed'));
  `);
};

exports.down = async (pgm) => {
  // ===========================================================================================
  // EVIDENCE-PRESERVING DOWN — refuse loudly rather than silently invalidate durable
  // stuck-screening recovery evidence.
  // ===========================================================================================
  const failedRows = await pgm.db.query(`SELECT count(*)::int AS n FROM ${TABLE} WHERE risk_status = 'failed'`);
  if (Number(failedRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "065_wlt1_screening_failed_status down migration refused: wlt1.wallet_screening_result contains rows with risk_status = 'failed'. Durable stuck-screening recovery evidence must never be silently invalidated or discarded by a schema rollback.",
    );
  }

  await pgm.db.query(`
    ALTER TABLE ${TABLE}
      DROP CONSTRAINT ${RISK_STATUS_CHECK_NAME},
      ADD CONSTRAINT ${RISK_STATUS_CHECK_NAME}
        CHECK (risk_status IN ('pending', 'clear', 'review_required', 'high_risk', 'hit'));
  `);
};
