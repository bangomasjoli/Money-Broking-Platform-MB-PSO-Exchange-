/* eslint-disable camelcase */

/**
 * 052_wlt1_screening_address_hash_width — WLT-01 Phase 2C-C1 approved schema compatibility
 * correction. Performs exactly ONE change: widens `wlt1.wallet_screening_result.address_hash`
 * from `varchar(64)` to `varchar(128)`, matching `wlt1.wallet_destination.address_hash`'s own
 * width (migration 049).
 *
 * DISCOVERED EMPIRICALLY, NOT ASSUMED (same discipline migration 051's own COLUMN-WIDTH FIX
 * established): the accepted `computeAddressHash(...)` value (`lib/destinations.ts`) is the
 * foundation `fingerprint()` representation — `"sha256:" + <64 hex chars>` — 71 characters total.
 * `wallet_screening_result.address_hash` was sized `varchar(64)` in migration 050, before any code
 * path that must copy a REAL address_hash into this table existed — every Phase 2B/2C-A/2C-B test
 * inserted only short synthetic literals (e.g. `"addrhash_" + randomUUID()`), the exact same blind
 * spot that produced migration 051's own `destination.status varchar(16)` bug. Phase 2C-C's
 * screening-initiation route will copy the real value from `wallet_destination.address_hash` —
 * this migration removes that blocker before the route exists.
 *
 * Does NOT touch `wallet_destination.address_hash` (already `varchar(128)`, migration 049). Does
 * NOT touch `wallet_screening_result.payload_hash` or `vendor_result_inbox.payload_hash` (both
 * `varchar(64)`) — those carry the SAME 71-vs-64 gap for the foundation fingerprint
 * representation, but Phase 2C-C1 has no reachable payload_hash-writing code path; that decision
 * belongs to P2CB-MED-2 / Phase 2C-D planning, not this migration (reachable-state discipline,
 * same posture migration 051's own header comment established). No new table, column, index, FK,
 * or CHECK. No lifecycle/status change. Migrations 049, 050, and 051 are unchanged.
 *
 * BASELINE VERIFICATION, NOT ASSUMPTION: `up` queries `information_schema.columns` directly for
 * the exact accepted pre-052 type/width before touching anything, failing the whole migration
 * closed if the schema does not match the accepted Phase 2C-B baseline.
 *
 * EVIDENCE-PRESERVING DOWN: `down` refuses (raises, whole migration rolls back) if ANY existing
 * `wallet_screening_result.address_hash` value is longer than 64 characters — never truncates,
 * re-hashes, deletes, or otherwise discards real evidence merely to allow a schema rollback to
 * succeed. This is a deliberate application-level guard, checked BEFORE the narrowing `ALTER
 * COLUMN` runs — not a reliance on PostgreSQL's own `value too long` error as a backstop.
 */

const TABLE = "wlt1.wallet_screening_result";
const COLUMN = "address_hash";

exports.up = async (pgm) => {
  // ===========================================================================================
  // BASELINE VERIFICATION — a real query against the live database, not an assumption. Fails the
  // migration (and its own transaction) closed if the accepted Phase 2C-B column shape is
  // missing or already widened — never silently proceeds against an unexpected schema.
  // ===========================================================================================
  const existing = await pgm.db.query(
    `SELECT data_type, character_maximum_length
       FROM information_schema.columns
      WHERE table_schema = 'wlt1' AND table_name = 'wallet_screening_result' AND column_name = 'address_hash'`,
  );
  if (existing.rows.length !== 1) {
    throw new Error(
      `052_wlt1_screening_address_hash_width migration invariant violated: expected exactly one column 'wlt1.wallet_screening_result.address_hash', found ${existing.rows.length}.`,
    );
  }
  const row = existing.rows[0];
  if (row.data_type !== "character varying" || Number(row.character_maximum_length) !== 64) {
    throw new Error(
      `052_wlt1_screening_address_hash_width migration invariant violated: expected 'wallet_screening_result.address_hash' to be varchar(64), found ${row.data_type}(${row.character_maximum_length}).`,
    );
  }

  await pgm.db.query(`ALTER TABLE ${TABLE} ALTER COLUMN ${COLUMN} TYPE varchar(128)`);
};

exports.down = async (pgm) => {
  // ===========================================================================================
  // EVIDENCE-PRESERVING DOWN — refuse loudly, checked BEFORE narrowing, rather than relying on
  // PostgreSQL's own `value too long` error or silently truncating/discarding real evidence.
  // ===========================================================================================
  const overLength = await pgm.db.query(`SELECT count(*)::int AS n FROM ${TABLE} WHERE ${COLUMN} IS NOT NULL AND length(${COLUMN}) > 64`);
  if (Number(overLength.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "052_wlt1_screening_address_hash_width down migration refused: wlt1.wallet_screening_result contains at least one address_hash value longer than 64 characters. Real address-hash evidence must never be truncated, re-hashed, or discarded by a schema rollback.",
    );
  }

  await pgm.db.query(`ALTER TABLE ${TABLE} ALTER COLUMN ${COLUMN} TYPE varchar(64)`);
};
