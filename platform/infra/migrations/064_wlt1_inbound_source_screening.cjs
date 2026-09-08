/* eslint-disable camelcase */

/**
 * 064_wlt1_inbound_source_screening — WLT-01 Inbound-Source Screening. Implements the FROZEN
 * architecture (WLT-01 Inbound-Source Screening Implementation-Contract Architecture Addendum +
 * Transfer-Replay/Idempotency Final Micro-Correction) exactly — no new architectural decisions are
 * made in this migration.
 *
 * Creates `wlt1.inbound_source_screening_result` — a durable, append-only, one-row-per-terminal-
 * screening evidence table. Screening SUBJECT identity is `(chain, network, canonical_address)`,
 * hashed via the SAME `computeAddressHash` primitive `lib/destinations.ts` already uses (no
 * duplicated canonicalisation/hashing logic). `client_id` scopes evidence but is NOT part of
 * `address_hash`. `transaction_ref`/`transaction_hash`/`asset` are TRANSACTION correlation
 * metadata only — never part of the screening-subject identity, never part of `address_hash`.
 *
 * NO FK to `wlt1.destination` — an inbound source is deliberately NOT an outbound destination,
 * even when the same canonical address happens to also be one of the client's registered
 * destinations (frozen addendum §17/§18: identities stay separate; no beneficial-ownership
 * inference).
 *
 * NO raw provider payload column exists — there is nowhere to put one, mirroring
 * `wallet_screening_result`'s own existing discipline.
 *
 * `uq_wlt1_inbound_source_transfer` (`client_id, chain, network, transaction_ref`) is the
 * concurrency backstop for "one screening per genuinely new inbound transfer" — the frozen
 * Transfer-Replay/Idempotency Final Micro-Correction's own TX-C recovery path depends on this
 * EXACT constraint name; a bare `23505` must never be treated as transfer-replay (see this
 * migration's sibling production files' own `isDuplicateInboundTransferViolation` helper).
 *
 * `uq_wlt1_inbound_source_result_id` and `uq_wlt1_inbound_source_version` exist for the SAME
 * reason `wallet_screening_result` carries equivalent uniqueness — they must NEVER be
 * misclassified as transfer-replay by the route's own constraint-name-matching discipline.
 *
 * EVIDENCE-PRESERVING DOWN (mirrors migration 059/060/061/062's own established precedent):
 * refuses if ANY row exists — a durable, versioned screening evidence row must never be silently
 * discarded by a schema rollback. A genuinely untouched schema (no screening has ever been
 * generated) rolls back cleanly.
 */

const TABLE = "wlt1.inbound_source_screening_result";
const RESULT_ID_UNIQUE_CONSTRAINT = "uq_wlt1_inbound_source_result_id";
const TRANSFER_UNIQUE_CONSTRAINT = "uq_wlt1_inbound_source_transfer";
const VERSION_UNIQUE_CONSTRAINT = "uq_wlt1_inbound_source_version";
const ELIGIBILITY_COHERENT_CHECK = "chk_wlt1_inbound_source_eligibility_coherent";
const CLIENT_TIME_INDEX_NAME = "idx_wlt1_inbound_source_client_time";
const ADDRESS_INDEX_NAME = "idx_wlt1_inbound_source_address";

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE ${TABLE} (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      screening_result_id       varchar(64)  NOT NULL,
      client_id                 varchar(64)  NOT NULL,
      chain                     varchar(16)  NOT NULL,
      network                   varchar(16)  NOT NULL,
      canonical_address         varchar(128) NOT NULL,
      address_hash              varchar(128) NOT NULL,
      canonicalisation_version  varchar(32)  NOT NULL,
      screening_result_version  integer      NOT NULL CHECK (screening_result_version > 0),
      transaction_ref           varchar(128) NOT NULL,
      transaction_hash          varchar(128),
      asset                     varchar(16),
      provider_id               varchar(64)  NOT NULL,
      provider_adaptor_version  varchar(32)  NOT NULL,
      provider_result_id        varchar(128),
      risk_status                varchar(16)  NOT NULL
                                    CHECK (risk_status IN ('clear','review_required','high_risk','hit')),
      risk_score                 numeric(5,2) CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100)),
      risk_categories             jsonb        NOT NULL,
      direct_exposure             jsonb        NOT NULL,
      indirect_exposure           jsonb        NOT NULL,
      sanctions_exposure          boolean,
      cluster_ref                 varchar(128),
      source_eligibility          varchar(16)  NOT NULL
                                     CHECK (source_eligibility IN ('eligible','not_eligible')),
      reason_code                 varchar(64)  NOT NULL,
      issued_at_utc                timestamptz  NOT NULL,
      valid_until_utc               timestamptz,
      request_id                    varchar(128) NOT NULL,
      correlation_id                 varchar(128) NOT NULL,
      created_at_utc                  timestamptz  NOT NULL DEFAULT now(),
      CONSTRAINT ${RESULT_ID_UNIQUE_CONSTRAINT} UNIQUE (screening_result_id),
      CONSTRAINT ${TRANSFER_UNIQUE_CONSTRAINT} UNIQUE (client_id, chain, network, transaction_ref),
      CONSTRAINT ${VERSION_UNIQUE_CONSTRAINT} UNIQUE (client_id, address_hash, screening_result_version),
      CONSTRAINT ${ELIGIBILITY_COHERENT_CHECK} CHECK ((source_eligibility = 'eligible') = (risk_status = 'clear'))
    );

    CREATE INDEX ${CLIENT_TIME_INDEX_NAME}
      ON ${TABLE} (client_id, issued_at_utc DESC);

    CREATE INDEX ${ADDRESS_INDEX_NAME}
      ON ${TABLE} (client_id, address_hash);
  `);
};

exports.down = async (pgm) => {
  // ===========================================================================================
  // EVIDENCE-PRESERVING DOWN — refuse loudly rather than silently discard a durable, versioned
  // screening evidence row.
  // ===========================================================================================
  const rows = await pgm.db.query(`SELECT count(*)::int AS n FROM ${TABLE}`);
  if (Number(rows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "064_wlt1_inbound_source_screening down migration refused: wlt1.inbound_source_screening_result contains evidence rows. Durable inbound-source screening evidence must never be silently discarded or rewritten by a schema rollback.",
    );
  }

  await pgm.db.query(`DROP TABLE ${TABLE}`);
};
