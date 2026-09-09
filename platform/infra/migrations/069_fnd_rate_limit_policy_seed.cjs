/* eslint-disable camelcase */

/**
 * 069_fnd_rate_limit_policy_seed — WLT-01 v1 rate-limit numeric policy.
 *
 * Governance-approved policy values — see `docs/DECISION_LOG.md` DEC-009 ("Shared Rate-Limit
 * Engine: architecture + approved v1 numeric policy (WLT-01 BLOCKER-2 prerequisite)") for the
 * full rationale, calibration evidence, and change-governance rule. No numeric value in this
 * migration is invented here — every value below is copied verbatim from that governance
 * record. This migration seeds structure created by `068_fnd_rate_limit_engine` only; no schema
 * change of any kind.
 *
 * Exactly FOUR rows, one per WLT-01 v1 public bucket. Deliberately NO `AUTH_FAILURE` row and NO
 * per-IP row — both were evaluated and rejected in the accepted architecture (no safe
 * bounded-cardinality pre-authentication subject exists in this platform; see
 * `docs/OPEN_FINDINGS.md` FND-FIND-001, which this migration does NOT close).
 *
 * Subject scope (client vs user) is NOT a column in this table and is not encoded by this
 * migration — it is a per-request field the future WLT-01 consumer supplies
 * (`subject_type`/`subject_id`), per DEC-009's own binding obligation:
 *   READ_LIST -> client_id · READ_ITEM -> client_id · MUTATE_REGISTER -> client_id ·
 *   MUTATE_POC -> iam_user_id.
 *
 * `role_fnd_runtime` cannot INSERT/UPDATE `foundation.rate_limit_policy` (REVOKEd by
 * `infra/grants/fnd_runtime_grants.sql`'s own migration-068-companion change) — this seed runs
 * under the privileged migration role, exactly as every other governed-registry seed in this
 * platform does (e.g. `wlt1.fiat_rail_coverage`, migration 061).
 */

const POLICY_TABLE = "foundation.rate_limit_policy";

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO ${POLICY_TABLE}
      (policy_id, module, bucket, burst_limit, burst_window_seconds, sustained_limit, sustained_window_seconds, status, version)
    VALUES
      ('frl_wlt1_read_list',       'WLT-01', 'READ_LIST',       100, 60, 1200, 3600, 'active', 1),
      ('frl_wlt1_read_item',       'WLT-01', 'READ_ITEM',       200, 60, 2400, 3600, 'active', 1),
      ('frl_wlt1_mutate_register', 'WLT-01', 'MUTATE_REGISTER', 10,  60, 60,   3600, 'active', 1),
      ('frl_wlt1_mutate_poc',      'WLT-01', 'MUTATE_POC',      10,  60, 60,   3600, 'active', 1);
  `);
};

exports.down = async (pgm) => {
  // EVIDENCE-PRESERVING DOWN: refuses if any row's policy_id does not match one of the four
  // seeded here — i.e. if a LATER governance migration has already added/changed rows on top
  // of this seed, this down must not silently discard that later evidence. A clean down is
  // only permitted when exactly this seed's own four rows (untouched) are present.
  const rows = await pgm.db.query(`SELECT policy_id, version FROM ${POLICY_TABLE} ORDER BY policy_id`);
  const expected = [
    { policy_id: "frl_wlt1_mutate_poc", version: 1 },
    { policy_id: "frl_wlt1_mutate_register", version: 1 },
    { policy_id: "frl_wlt1_read_item", version: 1 },
    { policy_id: "frl_wlt1_read_list", version: 1 },
  ];
  const actual = rows.rows.map((r) => ({ policy_id: r.policy_id, version: Number(r.version) }));
  const matches = actual.length === expected.length && expected.every((e, i) => actual[i]?.policy_id === e.policy_id && actual[i]?.version === e.version);
  if (!matches) {
    throw new Error(
      "069_fnd_rate_limit_policy_seed down migration refused: foundation.rate_limit_policy does not contain exactly this seed's original four rows unmodified (a later governance change may have landed on top). Down any later policy migration first.",
    );
  }

  await pgm.db.query(`
    DELETE FROM ${POLICY_TABLE}
     WHERE policy_id IN ('frl_wlt1_read_list', 'frl_wlt1_read_item', 'frl_wlt1_mutate_register', 'frl_wlt1_mutate_poc');
  `);
};
