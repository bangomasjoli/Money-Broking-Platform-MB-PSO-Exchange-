/* eslint-disable camelcase */

/**
 * 061_wlt1_fiat_payout_destination — WLT-01 Fiat Payout Destinations (APAC). Implements the
 * FROZEN architecture (Fiat Payout Destinations Implementation-Exact Architecture Addendum,
 * CLOSED + Provider/Decision-Artifact/Coverage/File-Plan Micro-Addendum, CLOSED + APAC-First
 * Local-Account Architecture Pivot, CLOSED / IMPLEMENTATION REMAINS BLOCKED ONLY ON OPERATIONAL
 * ACTIVATION) exactly — no new architectural decisions are made in this migration.
 *
 * v1 technical scope is exactly four APAC local-account corridors — MY/MYR, SG/SGD, HK/HKD,
 * ID/IDR — shipped as `coverage_status='supported'` (technically supported) but
 * `activation_status='inactive'` (not operationally live). ALL FOUR CORRIDORS SHIP DORMANT. This
 * migration does not, and must never, seed an `activation_status='active'` row — live corridor
 * activation is a separate, future, business/compliance-authorised migration.
 *
 * `wlt1.fiat_rail_coverage`'s two status CHECKs are DELIBERATELY two-valued
 * (`supported|unsupported`, `active|inactive`) — this is NOT a copy of `wlt1.chain_coverage`'s own
 * single-valued CHECKs (migration 049), which cannot represent "supported but inactive" at all.
 * Copying that shape here would make the dormant-technical-support model structurally
 * unrepresentable.
 *
 * `account_identifier_type` supports exactly `'local_account'` this phase — no `'iban'` value
 * (withdrawn by the APAC pivot; deferred to a future migration if ever needed).
 * `bank_identifier_type` supports exactly `'bic'` — no national clearing-code registry this
 * phase.
 *
 * `wlt1.destination.destination_type` CHECK is widened from `('wallet')` to
 * `('wallet','fiat_payout')` — the only change to that table's own constraint; no other column,
 * index, or grant on `wlt1.destination` changes. Runtime UPDATE grant on `destination_type` was
 * never granted (migration 049) and remains ungranted — the existing immutability test
 * (`tests/integration/wlt1-db.test.ts`) must keep passing unchanged.
 *
 * `wlt1.destination_decision` gains a `destination_type` discriminant column (backfilled
 * `'wallet'` for every pre-existing row, then `SET NOT NULL`) because the table has exactly ONE
 * foreign key (`destination_id`) and no way to express wallet-vs-fiat type coherence without an
 * explicit discriminant. `chain`/`network` become nullable (fiat decisions carry neither); `rail`/
 * `currency`/`beneficiary_verification_id` are added (wallet decisions carry none of the three).
 * The coherence CHECK is a strict two-branch XOR — a fiat decision additionally requires
 * `poc_challenge_id IS NULL` (fiat has no Proof-of-Control; beneficiary verification is its
 * evidentiary substitute). No UPDATE grant is added for any of the four new/widened columns —
 * `infra/grants/wlt1_runtime_grants.sql` is not touched by this migration; issuance remains
 * INSERT-time immutable.
 *
 * `wlt1.destination_revocation` (migration 059/060) is NOT touched by this migration — no
 * automatic revocation exists for adverse INITIAL fiat screening (a never-approved destination
 * holds no authority to revoke), so no new revocation `source`/`reason_code` value is needed.
 *
 * EVIDENCE-PRESERVING DOWN (mirrors migrations 055/058/059/060): refuses independently if ANY of
 * — a `destination_type='fiat_payout'` row exists in `wlt1.destination`; any
 * `wlt1.beneficiary_verification` row exists; any `wlt1.fiat_screening_result` row exists; any
 * `wlt1.destination_decision` row has `destination_type='fiat_payout'`. The four dormant coverage
 * seed rows alone are reference data, not evidence, and never block a clean down.
 */

const DESTINATION_TYPE_CHECK_NAME = "destination_destination_type_check";
const DECISION_TYPE_CHECK_NAME = "destination_decision_destination_type_check";
const DECISION_COHERENCE_CHECK_NAME = "chk_wlt1_destination_decision_type_coherent";

exports.up = async (pgm) => {
  pgm.sql(`
    -- ---------------------------------------------------------------------------------------
    -- 1. destination_type CHECK widening — the only change to wlt1.destination this migration
    --    makes. No new column, no grant change.
    -- ---------------------------------------------------------------------------------------
    ALTER TABLE wlt1.destination
      DROP CONSTRAINT ${DESTINATION_TYPE_CHECK_NAME},
      ADD CONSTRAINT ${DESTINATION_TYPE_CHECK_NAME} CHECK (destination_type IN ('wallet', 'fiat_payout'));

    -- ---------------------------------------------------------------------------------------
    -- 2. fiat_payout_destination — immutable beneficiary/account identity. Every column here is
    --    set ONCE at INSERT time except verification_status/updated_at_utc (mutable — see
    --    infra/grants/wlt1_runtime_grants.sql's own Phase Fiat-APAC column-scoped UPDATE grant).
    -- ---------------------------------------------------------------------------------------
    CREATE TABLE wlt1.fiat_payout_destination (
      id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      destination_id                varchar(64) NOT NULL UNIQUE REFERENCES wlt1.destination (destination_id),
      beneficiary_name              varchar(140) NOT NULL,
      beneficiary_name_normalized   varchar(140) NOT NULL,
      beneficiary_type              varchar(16) NOT NULL
                                       CHECK (beneficiary_type IN ('individual', 'corporate')),
      bank_country                  varchar(2) NOT NULL,
      bank_identifier                varchar(11) NOT NULL,
      bank_identifier_type           varchar(16) NOT NULL
                                       CHECK (bank_identifier_type IN ('bic')),
      branch_identifier               varchar(8),
      account_identifier_type          varchar(16) NOT NULL
                                       CHECK (account_identifier_type IN ('local_account')),
      account_identifier_masked         varchar(32) NOT NULL,
      account_identifier_hash            varchar(128) NOT NULL,
      account_identifier_encrypted        text NOT NULL,
      currency                             varchar(3) NOT NULL,
      rail                                  varchar(32) NOT NULL,
      verification_status                    varchar(24) NOT NULL DEFAULT 'pending'
                                       CHECK (verification_status IN ('pending', 'verified', 'name_mismatch', 'not_supported')),
      created_at_utc                          timestamptz NOT NULL DEFAULT now(),
      updated_at_utc                           timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_wlt1_fiat_payout_destination_branch_coherent CHECK (
            (bank_country = 'HK' AND branch_identifier IS NOT NULL)
         OR (bank_country <> 'HK' AND branch_identifier IS NULL)
      )
    );

    CREATE UNIQUE INDEX idx_wlt1_fiat_payout_destination_destination_id
      ON wlt1.fiat_payout_destination (destination_id);
    CREATE INDEX idx_wlt1_fiat_payout_destination_account_hash
      ON wlt1.fiat_payout_destination (account_identifier_hash);

    -- ---------------------------------------------------------------------------------------
    -- 3. fiat_rail_coverage — deny-by-default technical-support + operational-activation
    --    registry. BOTH status CHECKs are TWO-valued (load-bearing — see header comment).
    -- ---------------------------------------------------------------------------------------
    CREATE TABLE wlt1.fiat_rail_coverage (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      coverage_id               varchar(64) NOT NULL UNIQUE,
      rail                      varchar(32) NOT NULL,
      bank_country              varchar(2) NOT NULL,
      currency                  varchar(3) NOT NULL,
      account_identifier_type   varchar(16) NOT NULL
                                   CHECK (account_identifier_type IN ('local_account')),
      bank_identifier_type      varchar(16) NOT NULL
                                   CHECK (bank_identifier_type IN ('bic')),
      coverage_status           varchar(16) NOT NULL
                                   CHECK (coverage_status IN ('supported', 'unsupported')),
      activation_status         varchar(16) NOT NULL
                                   CHECK (activation_status IN ('active', 'inactive')),
      policy_version            integer NOT NULL DEFAULT 1,
      effective_at_utc          timestamptz NOT NULL DEFAULT now(),
      updated_at_utc            timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_wlt1_fiat_rail_coverage_rail_country_currency
      ON wlt1.fiat_rail_coverage (rail, bank_country, currency);

    -- Exactly four seed rows, all supported+inactive. No fifth row, no active row, ever, in this
    -- migration.
    INSERT INTO wlt1.fiat_rail_coverage
      (coverage_id, rail, bank_country, currency, account_identifier_type, bank_identifier_type, coverage_status, activation_status, policy_version)
    VALUES
      ('wlt1cov_fiat_my_myr', 'apac_local_my', 'MY', 'MYR', 'local_account', 'bic', 'supported', 'inactive', 1),
      ('wlt1cov_fiat_sg_sgd', 'apac_local_sg', 'SG', 'SGD', 'local_account', 'bic', 'supported', 'inactive', 1),
      ('wlt1cov_fiat_hk_hkd', 'apac_local_hk', 'HK', 'HKD', 'local_account', 'bic', 'supported', 'inactive', 1),
      ('wlt1cov_fiat_id_idr', 'apac_local_id', 'ID', 'IDR', 'local_account', 'bic', 'supported', 'inactive', 1);

    -- ---------------------------------------------------------------------------------------
    -- 4. beneficiary_verification — append-only, versioned evidence. Bound to
    --    (beneficiary_name_hash, account_identifier_hash) per the frozen architecture.
    -- ---------------------------------------------------------------------------------------
    CREATE TABLE wlt1.beneficiary_verification (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      verification_id           varchar(64) NOT NULL UNIQUE,
      destination_id            varchar(64) NOT NULL REFERENCES wlt1.destination (destination_id),
      verification_version      integer NOT NULL,
      provider_id                varchar(64) NOT NULL,
      provider_adaptor_version   varchar(32) NOT NULL,
      result                      varchar(24) NOT NULL
                                    CHECK (result IN ('verified', 'name_mismatch', 'not_supported')),
      match_score                  numeric(5,2),
      beneficiary_name_hash          varchar(128) NOT NULL,
      account_identifier_hash          varchar(128) NOT NULL,
      issued_at_utc                     timestamptz NOT NULL,
      valid_until_utc                    timestamptz NOT NULL,
      verified_at_utc                     timestamptz NOT NULL DEFAULT now(),
      created_at_utc                       timestamptz NOT NULL DEFAULT now(),
      UNIQUE (destination_id, verification_version)
    );

    CREATE INDEX idx_wlt1_beneficiary_verification_destination_version
      ON wlt1.beneficiary_verification (destination_id, verification_version DESC);

    -- ---------------------------------------------------------------------------------------
    -- 5. fiat_screening_result — append-only, versioned evidence. risk_status has NO DEFAULT and
    --    its CHECK excludes 'pending' — no pending screening row can ever exist (load-bearing).
    --    Bound to (beneficiary_name_hash, bank_country, beneficiary_type), never the account.
    -- ---------------------------------------------------------------------------------------
    CREATE TABLE wlt1.fiat_screening_result (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      screening_result_id         varchar(64) NOT NULL UNIQUE,
      destination_id               varchar(64) NOT NULL REFERENCES wlt1.destination (destination_id),
      screening_result_version      integer NOT NULL,
      provider_id                    varchar(64) NOT NULL,
      provider_adaptor_version        varchar(32) NOT NULL,
      provider_result_id               varchar(128),
      beneficiary_name_hash              varchar(128) NOT NULL,
      bank_country                        varchar(2) NOT NULL,
      beneficiary_type                     varchar(16) NOT NULL,
      risk_status                           varchar(16) NOT NULL
                                    CHECK (risk_status IN ('clear', 'review_required', 'high_risk', 'hit')),
      risk_score                    numeric(5,2),
      risk_categories                jsonb,
      sanctions_exposure               boolean,
      matched_name_normalized           varchar(140),
      issued_at_utc                      timestamptz NOT NULL,
      valid_until_utc                     timestamptz NOT NULL,
      screened_at_utc                      timestamptz NOT NULL DEFAULT now(),
      created_at_utc                        timestamptz NOT NULL DEFAULT now(),
      UNIQUE (destination_id, screening_result_version)
    );

    CREATE INDEX idx_wlt1_fiat_screening_result_destination_version
      ON wlt1.fiat_screening_result (destination_id, screening_result_version DESC);

    -- ---------------------------------------------------------------------------------------
    -- 6. destination_decision type-discrimination. Backfill BEFORE SET NOT NULL.
    -- ---------------------------------------------------------------------------------------
    ALTER TABLE wlt1.destination_decision
      ADD COLUMN destination_type varchar(16),
      ADD COLUMN rail varchar(32),
      ADD COLUMN currency varchar(3),
      ADD COLUMN beneficiary_verification_id varchar(64);

    UPDATE wlt1.destination_decision SET destination_type = 'wallet' WHERE destination_type IS NULL;

    ALTER TABLE wlt1.destination_decision
      ALTER COLUMN destination_type SET NOT NULL,
      ALTER COLUMN chain DROP NOT NULL,
      ALTER COLUMN network DROP NOT NULL;

    ALTER TABLE wlt1.destination_decision
      ADD CONSTRAINT ${DECISION_TYPE_CHECK_NAME} CHECK (destination_type IN ('wallet', 'fiat_payout'));

    ALTER TABLE wlt1.destination_decision
      ADD CONSTRAINT ${DECISION_COHERENCE_CHECK_NAME} CHECK (
            (destination_type = 'wallet'
             AND chain IS NOT NULL AND network IS NOT NULL
             AND rail IS NULL AND currency IS NULL AND beneficiary_verification_id IS NULL)
         OR (destination_type = 'fiat_payout'
             AND chain IS NULL AND network IS NULL
             AND rail IS NOT NULL AND currency IS NOT NULL AND beneficiary_verification_id IS NOT NULL
             AND poc_challenge_id IS NULL)
      );
  `);
};

exports.down = async (pgm) => {
  // ===========================================================================================
  // EVIDENCE-PRESERVING DOWN — refuse loudly rather than silently discard fiat evidence.
  // ===========================================================================================
  const fiatDestinationRows = await pgm.db.query(`SELECT count(*)::int AS n FROM wlt1.destination WHERE destination_type = 'fiat_payout'`);
  if (Number(fiatDestinationRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "061_wlt1_fiat_payout_destination down migration refused: wlt1.destination contains destination_type='fiat_payout' rows. Durable fiat destination evidence must never be silently discarded by a schema rollback.",
    );
  }
  const verificationRows = await pgm.db.query(`SELECT count(*)::int AS n FROM wlt1.beneficiary_verification`);
  if (Number(verificationRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "061_wlt1_fiat_payout_destination down migration refused: wlt1.beneficiary_verification contains rows. Durable verification evidence must never be silently discarded by a schema rollback.",
    );
  }
  const screeningRows = await pgm.db.query(`SELECT count(*)::int AS n FROM wlt1.fiat_screening_result`);
  if (Number(screeningRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "061_wlt1_fiat_payout_destination down migration refused: wlt1.fiat_screening_result contains rows. Durable screening evidence must never be silently discarded by a schema rollback.",
    );
  }
  const fiatDecisionRows = await pgm.db.query(`SELECT count(*)::int AS n FROM wlt1.destination_decision WHERE destination_type = 'fiat_payout'`);
  if (Number(fiatDecisionRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "061_wlt1_fiat_payout_destination down migration refused: wlt1.destination_decision contains destination_type='fiat_payout' rows. Durable fiat decision evidence must never be silently discarded by a schema rollback.",
    );
  }

  await pgm.db.query(`
    ALTER TABLE wlt1.destination_decision
      DROP CONSTRAINT ${DECISION_COHERENCE_CHECK_NAME},
      DROP CONSTRAINT ${DECISION_TYPE_CHECK_NAME};

    ALTER TABLE wlt1.destination_decision
      ALTER COLUMN chain SET NOT NULL,
      ALTER COLUMN network SET NOT NULL;

    ALTER TABLE wlt1.destination_decision
      DROP COLUMN destination_type,
      DROP COLUMN rail,
      DROP COLUMN currency,
      DROP COLUMN beneficiary_verification_id;

    DROP TABLE wlt1.fiat_screening_result;
    DROP TABLE wlt1.beneficiary_verification;
    DROP TABLE wlt1.fiat_rail_coverage;
    DROP TABLE wlt1.fiat_payout_destination;

    ALTER TABLE wlt1.destination
      DROP CONSTRAINT ${DESTINATION_TYPE_CHECK_NAME},
      ADD CONSTRAINT ${DESTINATION_TYPE_CHECK_NAME} CHECK (destination_type IN ('wallet'));
  `);
};
