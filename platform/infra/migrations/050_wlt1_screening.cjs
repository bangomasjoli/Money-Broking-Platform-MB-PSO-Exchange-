/* eslint-disable camelcase */

/**
 * 050_wlt1_screening — WLT-01 Phase 2B (chain-coverage provider binding, wallet-screening
 * persistence/receipt foundation, approved Phase 2B scope). Establishes the persistence layer a
 * future Phase 2C screening/receipt route will write to — this migration creates NO reachable
 * route, NO screening lifecycle, NO IAM-02 permission, NO audit event. `wlt1.destination.status`
 * is DELIBERATELY NOT widened here (see the dedicated note below) — `pending_screening`/
 * `pending_review` remain unreachable until Phase 2C's own migration introduces them alongside the
 * route/guard that can actually reach them.
 *
 * ---------------------------------------------------------------------------------------
 * EXPLICIT WLT IMPLEMENTATION EXTENSIONS (not literal WLT v1.2 blueprint §2.3/§2.9 columns —
 * approved additions, documented here rather than silently introduced):
 *   `wallet_screening_result.screening_result_version` — the blueprint's own table has no
 *     per-destination screening version; WLT-01 needs one to support a destination being
 *     rescreened over time while keeping every prior result as immutable history (`(destination_id,
 *     screening_result_version)` UNIQUE below). Phase 2C is expected to allocate the next version
 *     via `MAX(version)+1` under the existing `wlt1.destination:<destination_id>` advisory-lock
 *     idiom (`lib/destinations.ts`'s own `takeRegistrationLock` pattern) — not implemented here.
 *   `wallet_screening_result.provider_adaptor_version` — WLT-01's own adaptor implementation
 *     version (distinct from any future provider-reported list/data version), mirrors AML-01's own
 *     `screening_provider_attempt.provider_adaptor_version` precedent
 *     (`services/aml1/src/lib/providers/stub-provider.ts`'s `STUB_ADAPTOR_VERSION`). Bound at
 *     initiation, immutable — see the runtime grant's column-scoping below.
 *   `wallet_screening_result.provider_result_id` — the provider's own opaque result identifier;
 *     required as evidence AND as half of `vendor_result_inbox`'s replay key.
 *   `wallet_screening_result.issued_at_utc` — when the provider itself issued the result (distinct
 *     from `created_at_utc`, when WLT-01's own row was created) — needed to compute a future
 *     effective-staleness projection without conflating "when we received this" with "when the
 *     provider says this was true".
 *   `vendor_result_inbox.provider_result_id` — required as the other half of the inbox's own replay
 *     key (`(provider_id, provider_result_id)` UNIQUE below).
 *   `vendor_result_inbox.screening_result_id` — correlates a receipt back to the
 *     `wallet_screening_result` row it applies to (nullable/no-FK — see below).
 *   `vendor_result_inbox.rejection_reason_code` — bounded evidence for WHY a receipt was rejected,
 *     without which `processing_status = 'rejected'` alone is undebuggable evidence.
 * None of these are a Labuan FSA prescribed requirement or a regulatory taxonomy — they are
 * implementation necessities for version binding, provider replay, adaptor evidence, screening
 * freshness computation, and bounded receipt-rejection evidence. Frozen by Opus Phase 2B planning
 * review, Locked Decision 2.
 *
 * ---------------------------------------------------------------------------------------
 * `signature_valid` -> `source_authenticated` (both tables use the latter; `wallet_screening_
 * result` already had this exact name in the blueprint's own §2.3 — `vendor_result_inbox` is
 * RENAMED from the blueprint's `signature_valid` to the same term for consistency and honesty:
 * Phase 2's actual receipt-authentication mechanism, when it lands in Phase 2C, is a shared-secret
 * bearer token (mirrors every other module's own internal-identity guard), never a cryptographic
 * signature — a column literally named `signature_valid` would durably assert verification of
 * something that was never computed. If a real vendor callback with genuine cryptographic
 * signature verification is introduced in a later phase, that evidence must be added as an
 * honestly-named, separate column then — never retrofitted onto this one.
 *
 * ---------------------------------------------------------------------------------------
 * DESTINATION.STATUS IS NOT WIDENED IN THIS MIGRATION (architecture amendment overriding the
 * provisional Phase 2B planning recommendation): `pending_screening`/`pending_review` remain
 * database-UNREACHABLE after Phase 2B. `role_wlt1_runtime` already holds a column-scoped UPDATE
 * grant on `destination.status` (infra/grants/wlt1_runtime_grants.sql, since Phase 1B) — widening
 * the CHECK now would make these blueprint lifecycle states writable before Phase 2C's own
 * screening route/guard exists to govern the transition into them. Reachable-state discipline: a
 * CHECK value is added in the SAME migration as the route/guard that can actually reach it, never
 * ahead of it. Phase 2C will introduce migration 051 to widen this CHECK at the same time the
 * screening-initiation route lands. `destination.status` after this migration remains EXACTLY
 * `('draft','revoked')`, unchanged from migration 049.
 *
 * ---------------------------------------------------------------------------------------
 * `chain_coverage.provider_id` deterministic backfill: this migration NEVER reads `process.env`,
 * NEVER generates a UUID/timestamp/hostname-derived value. Both existing seed rows (`ethereum/
 * mainnet`, `tron/mainnet`) are bound to the single frozen literal `STUB_PROVIDER_ID` below —
 * the SAME identifier `services/wlt1/src/lib/providers/stub-provider.ts` exports at the
 * application layer, so migration-time and runtime-code identify the deterministic stub with one
 * unmistakable string, never two independently-typed literals that could drift.
 *
 * `wallet_screening_result`/`vendor_result_inbox` carry no cross-schema foreign key (same posture
 * every WLT-01 table has maintained since migration 049 — WLT-01 holds no grant into any other
 * module's schema). `vendor_result_inbox.destination_id`/`screening_result_id` are DELIBERATELY
 * NOT foreign-keyed even within `wlt1` — the inbox's purpose is to durably preserve an externally-
 * supplied receipt AS EVIDENCE even when it references an invalid/unknown destination or screening
 * result (e.g. a malformed or fraudulent callback); a hard FK would make exactly the receipts most
 * worth keeping physically unrecordable. `wallet_screening_result.destination_id` DOES carry a real
 * FK — every row here is created internally by WLT-01's own (Phase 2C) code, always against a real
 * destination.
 *
 * No `sec_audit_ref`-shaped column on either table — same migration-049 precedent (this codebase's
 * real audit linkage is `foundation.outbox_event`, not a denormalized reference column). No raw
 * provider payload column anywhere on either table — the normalized result only; see
 * `services/wlt1/src/lib/providers/types.ts`'s own header for the platform-wide rule this
 * migration's schema enforces structurally (there is no column to put a raw body in).
 */

/** The ONE frozen, deterministic, environment-independent stub provider identifier — MUST match
 * `services/wlt1/src/lib/providers/stub-provider.ts`'s own `STUB_PROVIDER_ID` export exactly. Not
 * derived from `process.env`, a generated UUID, a timestamp, or a hostname. */
const STUB_PROVIDER_ID = "stub-wallet-analytics-v1";

if (STUB_PROVIDER_ID !== "stub-wallet-analytics-v1") {
  throw new Error("050_wlt1_screening migration invariant violated: STUB_PROVIDER_ID literal changed unexpectedly.");
}

exports.up = async (pgm) => {
  // NOTE: `pgm.sql(...)` queues its SQL onto node-pg-migrate's own action list rather than
  // executing inline — a subsequent `pgm.db.query(...)` in the SAME up() would run BEFORE a
  // preceding `pgm.sql(...)` actually reaches the database. Every statement in this migration that
  // participates in the read-your-own-write backfill-verification sequence below therefore uses
  // `await pgm.db.query(...)` directly (executes immediately, in strict call order, inside the
  // same migration transaction), not `pgm.sql(...)`.

  // ---------------------------------------------------------------------------------------------
  // chain_coverage.provider_id — added nullable, backfilled deterministically, then locked NOT
  // NULL. No runtime environment read anywhere in this sequence.
  // ---------------------------------------------------------------------------------------------
  await pgm.db.query(`ALTER TABLE wlt1.chain_coverage ADD COLUMN provider_id varchar(64)`);
  await pgm.db.query(`UPDATE wlt1.chain_coverage SET provider_id = '${STUB_PROVIDER_ID}'`);

  // ===========================================================================================
  // Deterministic-backfill verification — a real query against the live database, not an
  // assumption. Fails the migration (and its own transaction) closed if either seed row is
  // missing or was bound to anything other than the frozen stub identifier.
  // ===========================================================================================
  const backfillResult = await pgm.db.query(`SELECT chain, network, provider_id FROM wlt1.chain_coverage ORDER BY chain`);
  const backfillRows = backfillResult.rows;
  if (backfillRows.length !== 2) {
    throw new Error(`050_wlt1_screening migration invariant violated: expected exactly 2 chain_coverage rows to backfill, found ${backfillRows.length}.`);
  }
  for (const row of backfillRows) {
    if (row.provider_id !== STUB_PROVIDER_ID) {
      throw new Error(
        `050_wlt1_screening migration invariant violated: chain_coverage row ${row.chain}/${row.network} has provider_id '${row.provider_id}', expected the frozen stub id '${STUB_PROVIDER_ID}'.`,
      );
    }
  }

  await pgm.db.query(`ALTER TABLE wlt1.chain_coverage ALTER COLUMN provider_id SET NOT NULL`);

  pgm.sql(`
    -- -----------------------------------------------------------------------------------------
    -- wallet_screening_result — normalized, immutable-identity-then-pending-to-terminal-fill
    -- screening evidence. Every identity/correlation column is bound at INSERT and never updated
    -- (see the runtime grant's column-scoped UPDATE list); risk_status starts 'pending' and
    -- transitions exactly once to a terminal value, filling the evidence columns alongside it.
    -- -----------------------------------------------------------------------------------------
    CREATE TABLE wlt1.wallet_screening_result (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      screening_result_id         varchar(64) NOT NULL,
      destination_id              varchar(64) NOT NULL REFERENCES wlt1.destination (destination_id),
      screening_result_version    int NOT NULL CHECK (screening_result_version > 0),
      provider_id                 varchar(64) NOT NULL,
      provider_adaptor_version    varchar(32) NOT NULL,
      provider_result_id          varchar(128),
      chain                       varchar(16) NOT NULL,
      network                     varchar(16) NOT NULL,
      address_hash                varchar(64) NOT NULL,
      risk_status                 varchar(16) NOT NULL DEFAULT 'pending'
                                     CHECK (risk_status IN ('pending','clear','review_required','high_risk','hit')),
      risk_score                  numeric(5,2)
                                     CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100)),
      risk_categories              jsonb,
      direct_exposure              jsonb,
      indirect_exposure            jsonb,
      sanctions_exposure           boolean,
      cluster_ref                  varchar(128),
      payload_hash                 varchar(64),
      source_authenticated         boolean,
      issued_at_utc                 timestamptz,
      valid_until_utc               timestamptz,
      created_at_utc                 timestamptz NOT NULL DEFAULT now(),
      updated_at_utc                  timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_wlt1_wallet_screening_result_id
      ON wlt1.wallet_screening_result (screening_result_id);
    CREATE UNIQUE INDEX idx_wlt1_wallet_screening_result_destination_version
      ON wlt1.wallet_screening_result (destination_id, screening_result_version);
    -- At most one PENDING screening attempt per destination — destination_id ONLY (not
    -- provider_id): chain_coverage carries exactly one provider_id per (chain, network), and a
    -- destination has exactly one chain/network, so concurrent multi-provider screening of the
    -- same destination is structurally impossible today — deliberately not designed for.
    CREATE UNIQUE INDEX idx_wlt1_wallet_screening_result_one_pending
      ON wlt1.wallet_screening_result (destination_id)
      WHERE risk_status = 'pending';
    CREATE INDEX idx_wlt1_wallet_screening_result_destination_status
      ON wlt1.wallet_screening_result (destination_id, risk_status, valid_until_utc);

    -- -----------------------------------------------------------------------------------------
    -- vendor_result_inbox — externally-received provider-result receipt evidence + replay/dedupe
    -- control. NOT populated by a synchronous in-process provider result (Phase 2B ships no
    -- fabricated "callback" for the stub) — this table starts receiving rows only once a real
    -- receipt route exists (Phase 2C). destination_id/screening_result_id are deliberately NOT
    -- foreign-keyed (see header comment) so an invalid/malicious receipt remains recordable.
    -- -----------------------------------------------------------------------------------------
    CREATE TABLE wlt1.vendor_result_inbox (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      inbox_id                    varchar(64) NOT NULL,
      provider_id                 varchar(64) NOT NULL,
      provider_result_id          varchar(128) NOT NULL,
      destination_id              varchar(64),
      screening_result_id         varchar(64),
      result_type                 varchar(32) NOT NULL
                                     CHECK (result_type IN ('wallet_screening')),
      payload_hash                 varchar(64) NOT NULL,
      source_authenticated         boolean NOT NULL,
      processing_status            varchar(16) NOT NULL DEFAULT 'received'
                                     CHECK (processing_status IN ('received','processed','rejected')),
      rejection_reason_code        varchar(64),
      received_at_utc               timestamptz NOT NULL,
      created_at_utc                 timestamptz NOT NULL DEFAULT now(),
      updated_at_utc                  timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_wlt1_vendor_result_inbox_id
      ON wlt1.vendor_result_inbox (inbox_id);
    -- Replay/dedupe key — the SAME provider result delivered twice (retry, duplicate webhook) must
    -- be recognizable at the database level, not merely by application discipline.
    CREATE UNIQUE INDEX idx_wlt1_vendor_result_inbox_replay
      ON wlt1.vendor_result_inbox (provider_id, provider_result_id);
    CREATE INDEX idx_wlt1_vendor_result_inbox_provider_status
      ON wlt1.vendor_result_inbox (provider_id, processing_status);
  `);
};

exports.down = async (pgm) => {
  // ===========================================================================================
  // EVIDENCE-PRESERVING DOWN — refuse loudly rather than silently discard screening evidence. A
  // genuinely untouched Phase 2B schema (no Phase 2C route has ever run, so neither table has any
  // row) rolls back cleanly; a schema that already holds real evidence rows does NOT.
  // ===========================================================================================
  const screeningRows = await pgm.db.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result`);
  if (Number(screeningRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "050_wlt1_screening down migration refused: wlt1.wallet_screening_result contains evidence rows. Screening evidence must never be silently dropped by a schema rollback.",
    );
  }
  const inboxRows = await pgm.db.query(`SELECT count(*)::int AS n FROM wlt1.vendor_result_inbox`);
  if (Number(inboxRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "050_wlt1_screening down migration refused: wlt1.vendor_result_inbox contains evidence rows. Receipt evidence must never be silently dropped by a schema rollback.",
    );
  }

  pgm.sql(`
    DROP TABLE IF EXISTS wlt1.vendor_result_inbox;
    DROP TABLE IF EXISTS wlt1.wallet_screening_result;
    ALTER TABLE wlt1.chain_coverage DROP COLUMN IF EXISTS provider_id;
  `);
};
