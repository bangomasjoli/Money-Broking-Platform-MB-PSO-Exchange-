/* eslint-disable camelcase */

/**
 * 057_wlt1_destination_decision — WLT-01 Phase 4A-2 (evaluate-use + opaque decision-token
 * issuance). Creates exactly one new table, `wlt1.destination_decision`, per the frozen Phase 4A
 * architecture + Phase 4A-2 scope. No other table, no other schema change, no modification to any
 * prior migration.
 *
 * Token security model (frozen): opaque random token + persisted SHA-256 hash — the raw token is
 * NEVER persisted; only `token_hash` (64 lowercase hex chars) is stored. `status` carries a
 * single-value CHECK (`'issued'` only) so a FUTURE Phase 4B migration can widen it to add
 * `'consumed'` as a bounded CHECK-widening migration (the same pattern migration 054 already
 * established for `verification_scheme`) — `consumed_at_utc`/`execution_ref`/any other
 * consumption-lifecycle column is DELIBERATELY NOT added here; Phase 4A-2 has no consumer for
 * them.
 *
 * `decision`'s own CHECK is likewise single-valued (`'allow'` only) — this table only ever
 * persists AFFIRMATIVE decisions (a `review`/`deny` outcome from evaluate-use is a business
 * response, never a persisted row here).
 *
 * Every identity/evidence-snapshot column is set ONCE at INSERT time — see
 * `infra/grants/wlt1_runtime_grants.sql`'s own Phase 4A-2 addition (SELECT+INSERT only, explicitly
 * NO UPDATE) for the grant-level enforcement of this immutability. Phase 4A-3's future read-only
 * verify route is supportable by SELECT alone; Phase 4B will later own the UPDATE grant this table
 * still lacks.
 *
 * POC EVIDENCE ADDENDUM (WLT-01 Phase 4A-2 PoC Evidence-ID Addendum — CLOSED): `poc_challenge_id`
 * is NULLABLE, not NOT NULL. `hosted` is an accepted `wallet_type` for which Proof-of-Control is
 * structurally unsupported (`routes/proof-of-control.ts` refuses a hosted destination's challenge
 * request with `WLT1_POC_UNSUPPORTED`) — a hosted destination can legitimately reach evaluate-use
 * eligibility with ZERO `wlt1.proof_of_control` rows ever existing. `poc_challenge_id IS NULL`
 * therefore means "Proof-of-Control was NOT APPLICABLE to this destination's immutable wallet
 * type" — it NEVER means "a required Proof-of-Control was missing." For `unhosted`/`unknown`
 * wallets (where `isPocSupportedWalletType()` is true), a verified PoC remains MANDATORY at
 * issuance; its absence is a business deny (`proof_of_control_missing`) BEFORE any row is ever
 * inserted here, never a NULL persisted in this column. No synthetic/placeholder challenge id
 * (`"not_applicable"`, `"hosted"`, a zero UUID, or a fabricated `proof_of_control` row) is ever
 * used to satisfy this column — an evidence identifier refers to genuine evidence or is NULL.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE wlt1.destination_decision (
      id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      decision_id                   varchar(64) NOT NULL UNIQUE,
      token_hash                    char(64) NOT NULL UNIQUE,
      destination_id                varchar(64) NOT NULL REFERENCES wlt1.destination (destination_id),
      client_id                     varchar(64) NOT NULL,
      requested_action              varchar(32) NOT NULL
                                       CHECK (requested_action IN ('destination_use')),
      decision                      varchar(8) NOT NULL
                                       CHECK (decision IN ('allow')),
      status                        varchar(16) NOT NULL DEFAULT 'issued'
                                       CHECK (status IN ('issued')),
      aml_decision_id                varchar(64) NOT NULL,
      aml_valid_until_utc            timestamptz NOT NULL,
      screening_result_id            varchar(64) NOT NULL,
      poc_challenge_id               varchar(64),
      destination_status_version     integer NOT NULL,
      whitelist_version               integer NOT NULL,
      revocation_epoch                 integer NOT NULL,
      chain                             varchar(16) NOT NULL,
      network                           varchar(16) NOT NULL,
      issued_at_utc                     timestamptz NOT NULL DEFAULT now(),
      expires_at_utc                     timestamptz NOT NULL,
      created_at_utc                       timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_wlt1_destination_decision_expiry CHECK (expires_at_utc > issued_at_utc)
    );

    CREATE INDEX idx_wlt1_destination_decision_destination_issued
      ON wlt1.destination_decision (destination_id, issued_at_utc DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE wlt1.destination_decision;`);
};
