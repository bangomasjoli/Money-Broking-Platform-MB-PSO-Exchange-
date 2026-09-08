/* eslint-disable camelcase */

/**
 * 051_wlt1_screening_lifecycle — WLT-01 Phase 2C-B (destination lifecycle schema-state
 * activation, approved Phase 2C-B scope). Performs exactly ONE change: widens
 * `wlt1.destination.status`'s CHECK constraint from the accepted Phase 1B two-state set
 * (`draft`/`revoked`) to the four accepted Phase 2C states (`draft`/`pending_screening`/
 * `pending_review`/`revoked`). No `active`/`restricted`/`approved_pending_cooling` — those have
 * no reachable Phase 2C-B (or even Phase 2C overall) code path; Phase 3 whitelist approval owns
 * introducing them, in the migration that first makes them reachable (reachable-state discipline,
 * same "add a CHECK value only when a reachable code path exists" posture migration 049's own
 * header comment established).
 *
 * No new table, no new column, no new index, no foreign key, no modification to migration 049 or
 * 050. `role_wlt1_runtime` already holds a column-scoped UPDATE grant on `destination.status`
 * (`infra/grants/wlt1_runtime_grants.sql`, since Phase 1B) — this migration widens the CHECK the
 * grant's already-existing privilege can now legally target; no grant file change is required or
 * made here.
 *
 * COLUMN-WIDTH FIX (discovered empirically, not assumed): migration 049's `status varchar(16)` was
 * sized for the two Phase 1B values (`draft`, `revoked`); `'pending_screening'` is 17 characters —
 * one over the limit — so this migration also widens the column to `varchar(32)` (matching this
 * table's own `client_status_ref`/other lifecycle-column widths) BEFORE adding the new CHECK.
 * Proven necessary by actually attempting the insert against the narrower column and observing a
 * real `value too long for type character varying(16)` error, not by inspection alone.
 *
 * ---------------------------------------------------------------------------------------
 * CONSTRAINT DISCOVERY, NOT ASSUMPTION: the accepted pre-051 constraint name
 * (`destination_status_check`) is PostgreSQL's own deterministic `<table>_<column>_check`
 * auto-name for an inline CHECK with no explicit name — confirmed by direct `pg_constraint` query
 * against a freshly-migrated database, never guessed. `up` verifies this exact name, and its exact
 * current definition (must permit `draft`/`revoked`, must NOT already contain
 * `pending_screening`/`pending_review`), before touching anything — a real query against the live
 * database, failing the whole migration closed if the schema does not match the accepted Phase 2B
 * baseline. The widened constraint is then re-added under an EXPLICIT stable name
 * (`chk_wlt1_destination_status`, mirroring migration 035's own `chk_aml1_*` explicit-naming
 * precedent) so no future migration ever again depends on PostgreSQL's own auto-naming.
 *
 * EVIDENCE-PRESERVING DOWN: `down` refuses (raises, whole migration rolls back) if ANY destination
 * row is currently `pending_screening` or `pending_review` — never silently rewrites regulated
 * lifecycle state to `draft`/`revoked` merely to allow a schema rollback to succeed. `down` does
 * NOT inspect `wlt1.wallet_screening_result`/`wlt1.vendor_result_inbox` — migration 050 remains
 * the sole authority for those two tables' own evidence-preserving down safety; this migration
 * owns destination-lifecycle-state narrowing only, a deliberately narrow, single-responsibility
 * down guard.
 */

const PRE_051_CONSTRAINT_NAME = "destination_status_check";
const POST_051_CONSTRAINT_NAME = "chk_wlt1_destination_status";

exports.up = async (pgm) => {
  // ===========================================================================================
  // BASELINE VERIFICATION — a real query against the live database, not an assumption. Fails the
  // migration (and its own transaction) closed if the accepted Phase 2B constraint is missing,
  // misnamed, or already widened — never silently proceeds against an unexpected schema state.
  // ===========================================================================================
  const existing = await pgm.db.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conrelid = 'wlt1.destination'::regclass AND contype = 'c' AND conname = $1`,
    [PRE_051_CONSTRAINT_NAME],
  );
  if (existing.rows.length !== 1) {
    throw new Error(
      `051_wlt1_screening_lifecycle migration invariant violated: expected exactly one CHECK constraint named '${PRE_051_CONSTRAINT_NAME}' on wlt1.destination, found ${existing.rows.length}.`,
    );
  }
  const def = existing.rows[0].def;
  if (!def.includes("draft") || !def.includes("revoked")) {
    throw new Error(`051_wlt1_screening_lifecycle migration invariant violated: '${PRE_051_CONSTRAINT_NAME}' does not permit the expected draft/revoked values: ${def}`);
  }
  if (def.includes("pending_screening") || def.includes("pending_review")) {
    throw new Error(`051_wlt1_screening_lifecycle migration invariant violated: '${PRE_051_CONSTRAINT_NAME}' already contains a Phase 2C lifecycle value: ${def}`);
  }

  await pgm.db.query(`ALTER TABLE wlt1.destination DROP CONSTRAINT ${PRE_051_CONSTRAINT_NAME}`);
  await pgm.db.query(`ALTER TABLE wlt1.destination ALTER COLUMN status TYPE varchar(32)`);
  await pgm.db.query(
    `ALTER TABLE wlt1.destination
       ADD CONSTRAINT ${POST_051_CONSTRAINT_NAME}
       CHECK (status IN ('draft','pending_screening','pending_review','revoked'))`,
  );
};

exports.down = async (pgm) => {
  // ===========================================================================================
  // EVIDENCE-PRESERVING DOWN — refuse loudly rather than silently discard destination lifecycle
  // state. A genuinely untouched Phase 2C-B schema (no Phase 2C-C screening-initiation route has
  // ever run, so no destination has ever entered pending_screening/pending_review) rolls back
  // cleanly; a schema that already holds destinations in either lifecycle state does NOT.
  // ===========================================================================================
  const lifecycleRows = await pgm.db.query(`SELECT count(*)::int AS n FROM wlt1.destination WHERE status IN ('pending_screening', 'pending_review')`);
  if (Number(lifecycleRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "051_wlt1_screening_lifecycle down migration refused: wlt1.destination contains rows in pending_screening/pending_review. Destination lifecycle state must never be silently discarded or rewritten by a schema rollback.",
    );
  }

  await pgm.db.query(`ALTER TABLE wlt1.destination DROP CONSTRAINT ${POST_051_CONSTRAINT_NAME}`);
  // Safe to narrow — the refusal guard above already proved every remaining row is 'draft' or
  // 'revoked' (both well under 16 characters), fully restoring the accepted pre-051 column width.
  await pgm.db.query(`ALTER TABLE wlt1.destination ALTER COLUMN status TYPE varchar(16)`);
  await pgm.db.query(`ALTER TABLE wlt1.destination ADD CONSTRAINT ${PRE_051_CONSTRAINT_NAME} CHECK (status IN ('draft','revoked'))`);
};
