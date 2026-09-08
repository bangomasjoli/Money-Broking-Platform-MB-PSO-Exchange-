/* eslint-disable camelcase */

/**
 * 066_wlt1_limits — WLT-01 Limits / Velocity / Concentration / First-Use. Implements the FROZEN
 * architecture exactly, in precedence order: the Mandatory-Control / Policy-Provisioning Final
 * Closure > the Schema / Policy-History / Denial-Evidence Final Micro-Correction > the Final
 * Implementation-Exactness Correction > the Implementation-Contract Architecture Addendum. No new
 * architectural decisions are made in this file.
 *
 * SCOPE (frozen): per-destination + per-client single-transaction limit, daily + rolling value
 * velocity, and a strictly-lower first-use cap for a destination's current whitelist-activation
 * lineage. CONCENTRATION IS DEFERRED — `concentration_limit` is schema-present (blueprint 2.12
 * fidelity) but CHECK-forced NULL; no denominator, no threshold, no evaluation exists anywhere in
 * this control. `stepup_required_above` is likewise schema-present and CHECK-forced NULL — WLT
 * does not own step-up in v1.
 *
 * TWO NEW TABLES, NO COUNTER TABLE (frozen): `wlt1.destination_limit_profile` is IMMUTABLE
 * VERSIONED POLICY — every version is its own row, `(limit_profile_id, version)` uniquely
 * identifies one historical row FOREVER, and only `status`/`updated_at_utc` may ever be mutated on
 * an existing row (controlled schema-owner provisioning only — the runtime role receives SELECT
 * only; there is no policy-mutation route in this phase). `wlt1.limit_evaluation` is an
 * APPEND-ONLY evidence journal that is simultaneously the accounting source — velocity is
 * `SUM(amount) WHERE result_status='pass'` within a window, never a separate counter row.
 *
 * DUAL-SCOPE, BOTH MANDATORY-CLIENT / OPTIONAL-DESTINATION (frozen, load-bearing): a client-default
 * profile (`destination_id IS NULL`) is REQUIRED before ANY authorization and MUST define all five
 * controls (`chk_wlt1_limit_profile_scope_required_controls`) — otherwise the mandatory daily/
 * rolling/first-use controls could be silently disabled by an all-NULL client-default row. A
 * destination-specific profile is OPTIONAL and may omit daily/rolling/first-use (its
 * `per_transaction_limit` remains mandatory via the column's own NOT NULL). Every control defined
 * at either resolved scope must independently pass (logical AND) — destination policy never
 * replaces or shadows client policy.
 *
 * EXPLICIT DIMENSION COLUMNS, NOT A UNIFIED `rail_or_chain` (frozen): a unified column was proven
 * unsound — `rail varchar(32)` cannot hold a `chain:network` composite (up to 33 chars). Wallet
 * dimension = `(client_id, destination_type='wallet', asset_or_currency, chain, network)`; fiat
 * dimension = `(client_id, destination_type='fiat_payout', asset_or_currency, rail)`. Usage is
 * strictly isolated within the full dimension tuple — no cross-network/cross-rail aggregation, no
 * FX, no cross-asset aggregation (no valuation authority exists anywhere in this platform).
 *
 * `destination_decision` GAINS EXACTLY SEVEN NULLABLE COLUMNS (frozen): `amount`,
 * `asset_or_currency`, `limits_version`, `client_limit_profile_id`,
 * `client_limit_profile_version`, `destination_limit_profile_id`,
 * `destination_limit_profile_version`. NOT `first_use` — first-use is intentionally ADVISORY ONLY
 * at issuance and is never persisted on the decision; it is recomputed authoritatively, under the
 * per-client advisory lock, at consume. A legacy decision with `amount IS NULL` fails closed at
 * consume with `limits_not_bound`.
 *
 * NO MONETARY POLICY SEEDED (frozen): this migration creates schema only. Zero threshold rows are
 * inserted. Until an authorized schema-owner provisioning transaction inserts a client-default
 * profile for a given client, evaluate-use fails closed with `limit_policy_unavailable` — absence
 * of policy never silently means unlimited.
 *
 * EVIDENCE-PRESERVING DOWN (frozen, self-contained — does not rely on provisioning invariants
 * alone): refuses if ANY row exists in `wlt1.limit_evaluation` (usage/denial evidence), OR ANY row
 * exists in `wlt1.destination_limit_profile` (provisioned policy history), OR ANY
 * `wlt1.destination_decision` row has `amount IS NOT NULL` (a limits-bound decision, consumed or
 * not). Only a genuinely untouched limits schema rolls back cleanly.
 */

const PROFILE_TABLE = "wlt1.destination_limit_profile";
const EVALUATION_TABLE = "wlt1.limit_evaluation";
const DECISION_TABLE = "wlt1.destination_decision";

const DECISION_LIMITS_COHERENT_CHECK = "chk_wlt1_destination_decision_limits_coherent";
const DECISION_CLIENT_PROFILE_PAIR_CHECK = "chk_wlt1_destination_decision_client_profile_pair";
const DECISION_DESTINATION_PROFILE_PAIR_CHECK = "chk_wlt1_destination_decision_destination_profile_pair";

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE ${PROFILE_TABLE} (
      id                                 uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
      limit_profile_id                   varchar(64)    NOT NULL,
      version                            integer        NOT NULL CHECK (version > 0),
      client_id                          varchar(64)    NOT NULL,
      destination_id                     varchar(64)               NULL,
      destination_type                   varchar(16)    NOT NULL CHECK (destination_type IN ('wallet', 'fiat_payout')),
      asset_or_currency                  varchar(16)    NOT NULL,
      chain                              varchar(16)               NULL,
      network                            varchar(16)               NULL,
      rail                               varchar(32)               NULL,
      per_transaction_limit              numeric(38,18) NOT NULL CHECK (per_transaction_limit > 0),
      daily_velocity_limit               numeric(38,18)            NULL CHECK (daily_velocity_limit   IS NULL OR daily_velocity_limit   > 0),
      rolling_velocity_limit             numeric(38,18)            NULL CHECK (rolling_velocity_limit IS NULL OR rolling_velocity_limit > 0),
      rolling_window_hours               integer                   NULL CHECK (rolling_window_hours   IS NULL OR rolling_window_hours   > 0),
      first_use_limit                    numeric(38,18)            NULL CHECK (first_use_limit        IS NULL OR first_use_limit        > 0),
      concentration_limit                numeric(38,18)            NULL,
      stepup_required_above              numeric(38,18)            NULL,
      status                             varchar(16)    NOT NULL CHECK (status IN ('active', 'inactive')),
      approved_ref                       varchar(64)               NULL,
      created_at_utc                     timestamptz    NOT NULL DEFAULT now(),
      updated_at_utc                     timestamptz    NOT NULL DEFAULT now(),
      CONSTRAINT chk_wlt1_limit_profile_dimension_coherent CHECK (
           (destination_type = 'wallet'      AND chain IS NOT NULL AND network IS NOT NULL AND rail IS NULL)
        OR (destination_type = 'fiat_payout' AND chain IS NULL     AND network IS NULL     AND rail IS NOT NULL)
      ),
      CONSTRAINT chk_wlt1_limit_profile_rolling_coherent CHECK (
        (rolling_velocity_limit IS NULL) = (rolling_window_hours IS NULL)
      ),
      CONSTRAINT chk_wlt1_limit_profile_scope_required_controls CHECK (
        destination_id IS NOT NULL
        OR (    daily_velocity_limit   IS NOT NULL
            AND rolling_velocity_limit IS NOT NULL
            AND rolling_window_hours   IS NOT NULL
            AND first_use_limit        IS NOT NULL)
      ),
      CONSTRAINT chk_wlt1_limit_profile_first_use_lower CHECK (
        first_use_limit IS NULL OR first_use_limit < per_transaction_limit
      ),
      CONSTRAINT chk_wlt1_limit_profile_concentration_deferred CHECK (concentration_limit IS NULL),
      CONSTRAINT chk_wlt1_limit_profile_stepup_deferred CHECK (stepup_required_above IS NULL)
    );

    CREATE UNIQUE INDEX uq_wlt1_limit_profile_identity_version
      ON ${PROFILE_TABLE} (limit_profile_id, version);

    CREATE UNIQUE INDEX uq_wlt1_limit_profile_client_default_active
      ON ${PROFILE_TABLE} (client_id, destination_type, asset_or_currency, chain, network, rail) NULLS NOT DISTINCT
      WHERE destination_id IS NULL AND status = 'active';

    CREATE UNIQUE INDEX uq_wlt1_limit_profile_destination_active
      ON ${PROFILE_TABLE} (client_id, destination_id, destination_type, asset_or_currency, chain, network, rail) NULLS NOT DISTINCT
      WHERE destination_id IS NOT NULL AND status = 'active';

    CREATE TABLE ${EVALUATION_TABLE} (
      id                                 uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
      limit_evaluation_id                varchar(64)    NOT NULL UNIQUE,
      decision_id                        varchar(64)               NULL,
      consumption_id                     varchar(64)               NULL,
      execution_ref                      varchar(64)               NULL,
      client_id                          varchar(64)    NOT NULL,
      destination_id                     varchar(64)    NOT NULL,
      destination_type                   varchar(16)    NOT NULL CHECK (destination_type IN ('wallet', 'fiat_payout')),
      whitelist_version                  integer        NOT NULL,
      limits_version                     integer        NOT NULL,
      amount                             numeric(38,18) NOT NULL CHECK (amount > 0),
      asset_or_currency                  varchar(16)    NOT NULL,
      chain                              varchar(16)               NULL,
      network                            varchar(16)               NULL,
      rail                               varchar(32)               NULL,
      result_status                      varchar(8)     NOT NULL CHECK (result_status IN ('pass', 'deny')),
      breach_type                        varchar(24)               NULL CHECK (breach_type IN ('per_txn', 'daily', 'rolling', 'first_use', 'policy_unavailable')),
      breach_scope                       varchar(12)               NULL CHECK (breach_scope IN ('client', 'destination')),
      first_use                          boolean        NOT NULL,
      client_limit_profile_id            varchar(64)               NULL,
      client_limit_profile_version       integer                   NULL,
      destination_limit_profile_id       varchar(64)               NULL,
      destination_limit_profile_version  integer                   NULL,
      evaluated_at_utc                   timestamptz    NOT NULL DEFAULT now(),
      CONSTRAINT chk_wlt1_limit_evaluation_dimension_coherent CHECK (
           (destination_type = 'wallet'      AND chain IS NOT NULL AND network IS NOT NULL AND rail IS NULL)
        OR (destination_type = 'fiat_payout' AND chain IS NULL     AND network IS NULL     AND rail IS NOT NULL)
      ),
      CONSTRAINT chk_wlt1_limit_evaluation_result_coherent CHECK (
           (result_status = 'pass'
              AND breach_type IS NULL AND breach_scope IS NULL
              AND decision_id IS NOT NULL AND consumption_id IS NOT NULL AND execution_ref IS NOT NULL
              AND client_limit_profile_id IS NOT NULL AND client_limit_profile_version IS NOT NULL)
        OR (result_status = 'deny' AND breach_type IS NOT NULL AND breach_scope IS NOT NULL)
      ),
      CONSTRAINT chk_wlt1_limit_evaluation_client_profile_pair CHECK (
        (client_limit_profile_id IS NULL) = (client_limit_profile_version IS NULL)
      ),
      CONSTRAINT chk_wlt1_limit_evaluation_destination_profile_pair CHECK (
        (destination_limit_profile_id IS NULL) = (destination_limit_profile_version IS NULL)
      )
    );

    CREATE INDEX idx_wlt1_limit_evaluation_client_usage
      ON ${EVALUATION_TABLE} (client_id, destination_type, asset_or_currency, chain, network, rail, evaluated_at_utc DESC)
      WHERE result_status = 'pass';

    CREATE INDEX idx_wlt1_limit_evaluation_destination_usage
      ON ${EVALUATION_TABLE} (destination_id, destination_type, asset_or_currency, chain, network, rail, evaluated_at_utc DESC)
      WHERE result_status = 'pass';

    CREATE INDEX idx_wlt1_limit_evaluation_first_use
      ON ${EVALUATION_TABLE} (destination_id, whitelist_version)
      WHERE result_status = 'pass';

    CREATE INDEX idx_wlt1_limit_evaluation_decision
      ON ${EVALUATION_TABLE} (decision_id);

    CREATE UNIQUE INDEX uq_wlt1_limit_evaluation_decision_pass
      ON ${EVALUATION_TABLE} (decision_id)
      WHERE result_status = 'pass';

    ALTER TABLE ${DECISION_TABLE}
      ADD COLUMN amount                             numeric(38,18) NULL,
      ADD COLUMN asset_or_currency                  varchar(16)    NULL,
      ADD COLUMN limits_version                     integer        NULL,
      ADD COLUMN client_limit_profile_id            varchar(64)    NULL,
      ADD COLUMN client_limit_profile_version       integer        NULL,
      ADD COLUMN destination_limit_profile_id       varchar(64)    NULL,
      ADD COLUMN destination_limit_profile_version  integer        NULL;

    ALTER TABLE ${DECISION_TABLE}
      ADD CONSTRAINT ${DECISION_LIMITS_COHERENT_CHECK} CHECK (
        amount IS NULL OR (
              asset_or_currency IS NOT NULL AND limits_version IS NOT NULL
          AND client_limit_profile_id IS NOT NULL AND client_limit_profile_version IS NOT NULL)
      ),
      ADD CONSTRAINT ${DECISION_CLIENT_PROFILE_PAIR_CHECK} CHECK (
        (client_limit_profile_id IS NULL) = (client_limit_profile_version IS NULL)
      ),
      ADD CONSTRAINT ${DECISION_DESTINATION_PROFILE_PAIR_CHECK} CHECK (
        (destination_limit_profile_id IS NULL) = (destination_limit_profile_version IS NULL)
      );
  `);
};

exports.down = async (pgm) => {
  // ===========================================================================================
  // EVIDENCE-PRESERVING DOWN — self-contained: refuses on usage evidence, on provisioned policy
  // history, and on any limits-bound decision, independently of one another.
  // ===========================================================================================
  const evaluationRows = await pgm.db.query(`SELECT count(*)::int AS n FROM ${EVALUATION_TABLE}`);
  if (Number(evaluationRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "066_wlt1_limits down migration refused: wlt1.limit_evaluation contains rows. Durable limit usage/denial evidence must never be silently discarded by a schema rollback.",
    );
  }

  const profileRows = await pgm.db.query(`SELECT count(*)::int AS n FROM ${PROFILE_TABLE}`);
  if (Number(profileRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "066_wlt1_limits down migration refused: wlt1.destination_limit_profile contains rows. Provisioned policy history must never be silently discarded by a schema rollback.",
    );
  }

  const boundDecisionRows = await pgm.db.query(`SELECT count(*)::int AS n FROM ${DECISION_TABLE} WHERE amount IS NOT NULL`);
  if (Number(boundDecisionRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "066_wlt1_limits down migration refused: wlt1.destination_decision contains a limits-bound decision (amount IS NOT NULL). Decision limit-binding evidence must never be silently discarded by a schema rollback.",
    );
  }

  await pgm.db.query(`
    ALTER TABLE ${DECISION_TABLE}
      DROP CONSTRAINT ${DECISION_LIMITS_COHERENT_CHECK},
      DROP CONSTRAINT ${DECISION_CLIENT_PROFILE_PAIR_CHECK},
      DROP CONSTRAINT ${DECISION_DESTINATION_PROFILE_PAIR_CHECK},
      DROP COLUMN amount,
      DROP COLUMN asset_or_currency,
      DROP COLUMN limits_version,
      DROP COLUMN client_limit_profile_id,
      DROP COLUMN client_limit_profile_version,
      DROP COLUMN destination_limit_profile_id,
      DROP COLUMN destination_limit_profile_version;

    DROP TABLE ${EVALUATION_TABLE};
    DROP TABLE ${PROFILE_TABLE};
  `);
};
