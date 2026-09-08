/* eslint-disable camelcase */

/**
 * 054_wlt1_proof_of_control_tron_scheme — WLT-01 Phase 3B. Widens EXACTLY ONE CHECK constraint on
 * the existing `wlt1.proof_of_control` table (created by migration 053, Phase 3A-1) to additionally
 * permit `verification_scheme = 'tron_personal_sign'` — TronWeb `signMessageV2`/`verifyMessageV2`-
 * compatible dynamic-length Proof-of-Control, never the legacy fixed `"\x19TRON Signed
 * Message:\n32"` scheme. `proof_method` remains exactly `'signed_message'` for both chains — this
 * migration does not touch that CHECK, and does not touch any other column, index, table, or grant.
 *
 * CONSTRAINT IDENTITY: `verification_scheme varchar(32) NOT NULL CHECK (verification_scheme IN
 * ('eip191_personal_sign'))` in 053 is an INLINE (unnamed) column constraint — Postgres therefore
 * auto-generated the name `proof_of_control_verification_scheme_check` (the standard
 * `<table>_<column>_check` convention for an unnamed CHECK). Confirmed by live inspection
 * (`SELECT conname FROM pg_constraint WHERE conrelid = 'wlt1.proof_of_control'::regclass AND
 * contype = 'c'`) against a freshly migrated database — never guessed.
 *
 * NO NEW COLUMNS, NO NEW INDEXES, NO NEW TABLES, NO NEW GRANTS, NO NEW STATUS VALUE, NO NEW
 * PROOF_METHOD VALUE, NO TRON-SPECIFIC EVIDENCE COLUMN. `infra/grants/wlt1_runtime_grants.sql` is
 * entirely unchanged by this migration — the existing `role_wlt1_runtime` grants on
 * `wlt1.proof_of_control` (SELECT/INSERT plus the column-scoped UPDATE) already cover every column
 * a TRON challenge/verify attempt writes, identically to an EVM one; a CHECK constraint widening
 * needs no new grant.
 *
 * EVIDENCE-PRESERVING DOWN: refuses (throws, whole migration rolls back) if ANY row currently has
 * `verification_scheme = 'tron_personal_sign'` — TRON Proof-of-Control evidence must never be
 * silently discarded by a schema rollback, mirroring migration 053's own down-refusal discipline
 * (and 050/051/052 before it). If no TRON-scheme row exists, DOWN restores the ORIGINAL 053 CHECK
 * body exactly (`verification_scheme IN ('eip191_personal_sign')`), under the SAME constraint name,
 * leaving every other column/index/constraint on this table untouched.
 */

const CONSTRAINT_NAME = "proof_of_control_verification_scheme_check";

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE wlt1.proof_of_control
      DROP CONSTRAINT ${CONSTRAINT_NAME};

    ALTER TABLE wlt1.proof_of_control
      ADD CONSTRAINT ${CONSTRAINT_NAME}
      CHECK (verification_scheme IN ('eip191_personal_sign', 'tron_personal_sign'));
  `);
};

exports.down = async (pgm) => {
  // ===========================================================================================
  // EVIDENCE-PRESERVING DOWN — refuse loudly rather than silently discard TRON Proof-of-Control
  // evidence. A genuinely untouched Phase 3B schema (no TRON verify has ever run to completion, so
  // no row has ever reached `verification_scheme = 'tron_personal_sign'`) rolls back cleanly; a
  // schema that already holds such a row does NOT.
  // ===========================================================================================
  const tronRows = await pgm.db.query(`SELECT count(*)::int AS n FROM wlt1.proof_of_control WHERE verification_scheme = 'tron_personal_sign'`);
  if (Number(tronRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "054_wlt1_proof_of_control_tron_scheme down migration refused: wlt1.proof_of_control contains at least one tron_personal_sign row. TRON Proof-of-Control evidence must never be silently discarded by a schema rollback.",
    );
  }

  pgm.sql(`
    ALTER TABLE wlt1.proof_of_control
      DROP CONSTRAINT ${CONSTRAINT_NAME};

    ALTER TABLE wlt1.proof_of_control
      ADD CONSTRAINT ${CONSTRAINT_NAME}
      CHECK (verification_scheme IN ('eip191_personal_sign'));
  `);
};
