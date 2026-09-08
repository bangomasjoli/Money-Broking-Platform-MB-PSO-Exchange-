/* eslint-disable camelcase */

/**
 * 055_wlt1_destination_activation — WLT-01 Phase 4A-1 (destination whitelist lifecycle prerequisite
 * to evaluate-use). Widens `wlt1.destination.status`'s CHECK constraint from the accepted Phase
 * 2C-B four-state set (`draft`/`pending_screening`/`pending_review`/`revoked`) to the frozen Phase
 * 4A six-state set, adding `approved_pending_cooling` and `active`. Phase 4A-1 itself never writes
 * `active` — that promotion is lazily performed by the future Phase 4A-2 evaluate-use route; the
 * value is added to the CHECK now only because it is part of one frozen, single lifecycle enum
 * (mirrors this file's own "add the whole frozen enum, not just this phase's own reachable subset"
 * decision — the Phase 4A architecture freeze names both states as one unit).
 *
 * Also adds exactly two new nullable columns Phase 4A-1's own approve/apply route needs
 * (`cooling_off_until_utc`, `whitelist_approval_ref`) and one partial index supporting the future
 * lazy active-promotion lookup. No other table, no other column, no foreign key, no modification to
 * any prior migration.
 *
 * CONSTRAINT DISCOVERY, NOT ASSUMPTION: migration 051 already moved this constraint off Postgres's
 * own auto-name onto an EXPLICIT stable name (`chk_wlt1_destination_status`) specifically so no
 * later migration would ever again need to guess or rediscover an auto-generated name. This
 * migration verifies that exact name and definition against the live database before touching
 * anything, and re-adds the widened CHECK under the SAME explicit name (051's naming convention
 * does not need to change a second time).
 *
 * COLUMN WIDTH: `status` is already `varchar(32)` (widened by migration 051). The longest new value
 * is `approved_pending_cooling` (24 characters) — well within the existing width. No column-width
 * change is needed or made here.
 *
 * EVIDENCE-PRESERVING DOWN: refuses (throws, whole migration rolls back) if ANY destination row is
 * currently `approved_pending_cooling` or `active` — never silently discards or rewrites whitelist
 * lifecycle state to force a schema rollback to succeed. Mirrors migration 051's own identical
 * down-refusal discipline for `pending_screening`/`pending_review`.
 */

const PRE_055_CONSTRAINT_NAME = "chk_wlt1_destination_status";
const POST_055_CONSTRAINT_NAME = "chk_wlt1_destination_status";

exports.up = async (pgm) => {
  // ===========================================================================================
  // BASELINE VERIFICATION — a real query against the live database, not an assumption. Fails the
  // migration (and its own transaction) closed if the accepted Phase 2C-B constraint is missing,
  // misnamed, or already widened — never silently proceeds against an unexpected schema state.
  // ===========================================================================================
  const existing = await pgm.db.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conrelid = 'wlt1.destination'::regclass AND contype = 'c' AND conname = $1`,
    [PRE_055_CONSTRAINT_NAME],
  );
  if (existing.rows.length !== 1) {
    throw new Error(
      `055_wlt1_destination_activation migration invariant violated: expected exactly one CHECK constraint named '${PRE_055_CONSTRAINT_NAME}' on wlt1.destination, found ${existing.rows.length}.`,
    );
  }
  const def = existing.rows[0].def;
  for (const expected of ["draft", "pending_screening", "pending_review", "revoked"]) {
    if (!def.includes(expected)) {
      throw new Error(`055_wlt1_destination_activation migration invariant violated: '${PRE_055_CONSTRAINT_NAME}' does not permit the expected '${expected}' value: ${def}`);
    }
  }
  if (def.includes("approved_pending_cooling") || def.includes("'active'")) {
    throw new Error(`055_wlt1_destination_activation migration invariant violated: '${PRE_055_CONSTRAINT_NAME}' already contains a Phase 4A lifecycle value: ${def}`);
  }

  await pgm.db.query(`ALTER TABLE wlt1.destination DROP CONSTRAINT ${PRE_055_CONSTRAINT_NAME}`);
  await pgm.db.query(
    `ALTER TABLE wlt1.destination
       ADD CONSTRAINT ${POST_055_CONSTRAINT_NAME}
       CHECK (status IN ('draft','pending_screening','pending_review','approved_pending_cooling','active','revoked'))`,
  );

  await pgm.db.query(`ALTER TABLE wlt1.destination ADD COLUMN cooling_off_until_utc timestamptz NULL`);
  await pgm.db.query(`ALTER TABLE wlt1.destination ADD COLUMN whitelist_approval_ref varchar(64) NULL`);

  await pgm.db.query(
    `CREATE INDEX idx_wlt1_destination_status_cooling
       ON wlt1.destination (status, cooling_off_until_utc)
       WHERE status = 'approved_pending_cooling'`,
  );
};

exports.down = async (pgm) => {
  // ===========================================================================================
  // EVIDENCE-PRESERVING DOWN — refuse loudly rather than silently discard whitelist lifecycle
  // state. A genuinely untouched Phase 4A-1 schema (no approve/apply route has ever run, so no
  // destination has ever entered approved_pending_cooling/active) rolls back cleanly; a schema
  // that already holds destinations in either lifecycle state does NOT.
  // ===========================================================================================
  const lifecycleRows = await pgm.db.query(`SELECT count(*)::int AS n FROM wlt1.destination WHERE status IN ('approved_pending_cooling', 'active')`);
  if (Number(lifecycleRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "055_wlt1_destination_activation down migration refused: wlt1.destination contains rows in approved_pending_cooling/active. Destination whitelist lifecycle state must never be silently discarded or rewritten by a schema rollback.",
    );
  }

  await pgm.db.query(`DROP INDEX wlt1.idx_wlt1_destination_status_cooling`);
  await pgm.db.query(`ALTER TABLE wlt1.destination DROP COLUMN whitelist_approval_ref`);
  await pgm.db.query(`ALTER TABLE wlt1.destination DROP COLUMN cooling_off_until_utc`);

  await pgm.db.query(`ALTER TABLE wlt1.destination DROP CONSTRAINT ${POST_055_CONSTRAINT_NAME}`);
  // Safe to narrow — the refusal guard above already proved every remaining row is one of the
  // four Phase 2C-B states, all still permitted by the restored constraint.
  await pgm.db.query(
    `ALTER TABLE wlt1.destination
       ADD CONSTRAINT ${PRE_055_CONSTRAINT_NAME}
       CHECK (status IN ('draft','pending_screening','pending_review','revoked'))`,
  );
};
