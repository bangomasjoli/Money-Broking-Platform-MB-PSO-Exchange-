/* eslint-disable camelcase */

/**
 * 067_clt1_authorised_user_iam_binding — Authenticated Principal -> Client Membership Authority.
 * Implements the FROZEN architecture exactly (Final Implementation-Exactness Micro-Clarification >
 * Final Clarification Architecture > original addendum). No new architectural decisions are made
 * in this file.
 *
 * SCOPE (frozen): a single OPTIONAL binding column, `iam_user_id varchar(64) NULL`, added to BOTH
 * `clt1.authorised_user` and `clt1.authorised_user_decision_request` — NOT a new table. This is
 * the sole additive seam that lets a future authenticated IAM principal resolve to a CLT client
 * membership it governs. `iam_user_id` is deliberately NOT a foreign key: this platform has ZERO
 * cross-schema foreign keys anywhere (verified by repository inspection during architecture) — no
 * table outside `iam.*` ever references `iam.*`, and no table outside `clt1.*` ever references
 * `clt1.*`. A dangling/typo `iam_user_id` is therefore permitted as governed CLT evidence but can
 * NEVER grant authority on its own: authority only exists when an ALREADY-authenticated IAM
 * session (already proven live by IAM-01's own session/user-status checks) presents the exact same
 * live `user_id` to the resolution seam this phase adds in a later file.
 *
 * OPTIONAL, NOT MANDATORY (frozen, load-bearing): `clt1.authorised_user` legitimately holds
 * declared signatories with NO platform IAM account (migration 023's own accepted semantics for
 * `user_reference` — "a DECLARED string (name/email/external reference)"). Making `iam_user_id`
 * mandatory would silently change that accepted semantics. Historical rows and every future
 * UNBOUND (`iam_user_id IS NULL`) row remain valid governed evidence; they simply never resolve
 * through the authenticated-principal membership route.
 *
 * PARTIAL UNIQUE INDEX (frozen, load-bearing): `idx_clt1_authorised_user_one_active_per_iam_client`
 * guarantees AT MOST ONE active membership per `(iam_user_id, client_id)` — the exact concurrency
 * backstop the resolution seam and the add/apply route both depend on. NULL `iam_user_id` rows are
 * completely unaffected (a client may have many unbound authorised users). Suspended/inactive/
 * revoked historical rows for the SAME `(iam_user_id, client_id)` may coexist alongside the one
 * active row — this is INTENTIONAL: the invariant is "at most one ACTIVE membership", never "one
 * historical lineage forever".
 *
 * EVIDENCE-PRESERVING DOWN (frozen): refuses if ANY row in EITHER table has `iam_user_id IS NOT
 * NULL` — independently for each table, mirroring migration 066's own precedent. Only a genuinely
 * untouched binding schema rolls back.
 */

const AUTHORISED_USER_TABLE = "clt1.authorised_user";
const DECISION_REQUEST_TABLE = "clt1.authorised_user_decision_request";
const ACTIVE_IAM_CLIENT_INDEX = "idx_clt1_authorised_user_one_active_per_iam_client";

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE ${AUTHORISED_USER_TABLE}
      ADD COLUMN iam_user_id varchar(64) NULL;

    ALTER TABLE ${DECISION_REQUEST_TABLE}
      ADD COLUMN iam_user_id varchar(64) NULL;

    CREATE UNIQUE INDEX ${ACTIVE_IAM_CLIENT_INDEX}
      ON ${AUTHORISED_USER_TABLE} (iam_user_id, client_id)
      WHERE iam_user_id IS NOT NULL AND status = 'active';
  `);
};

exports.down = async (pgm) => {
  // ===========================================================================================
  // EVIDENCE-PRESERVING DOWN — refuses independently on either table's bound rows.
  // ===========================================================================================
  const boundAuthorisedUserRows = await pgm.db.query(`SELECT count(*)::int AS n FROM ${AUTHORISED_USER_TABLE} WHERE iam_user_id IS NOT NULL`);
  if (Number(boundAuthorisedUserRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "067_clt1_authorised_user_iam_binding down migration refused: clt1.authorised_user contains an IAM-bound membership (iam_user_id IS NOT NULL). Membership-binding evidence must never be silently discarded by a schema rollback.",
    );
  }

  const boundDecisionRequestRows = await pgm.db.query(`SELECT count(*)::int AS n FROM ${DECISION_REQUEST_TABLE} WHERE iam_user_id IS NOT NULL`);
  if (Number(boundDecisionRequestRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "067_clt1_authorised_user_iam_binding down migration refused: clt1.authorised_user_decision_request contains an IAM-bound decision request (iam_user_id IS NOT NULL). Membership-binding evidence must never be silently discarded by a schema rollback.",
    );
  }

  await pgm.db.query(`
    DROP INDEX clt1.${ACTIVE_IAM_CLIENT_INDEX};

    ALTER TABLE ${AUTHORISED_USER_TABLE}
      DROP COLUMN iam_user_id;

    ALTER TABLE ${DECISION_REQUEST_TABLE}
      DROP COLUMN iam_user_id;
  `);
};
