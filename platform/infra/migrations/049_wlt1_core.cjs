/* eslint-disable camelcase */

/**
 * 049_wlt1_core — WLT-01 Phase 1B (wallet-destination registration baseline, approved Phase 1B
 * scope). Creates the `wlt1` schema and four tables: `destination` (type-agnostic anchor —
 * `destination_type` CHECK narrowed to `'wallet'` only this phase, `'fiat_payout'` deferred until
 * a real tokenisation seam exists — see `WLT-01_IMPLEMENTATION_NOTES.md` §2's fiat-deferral
 * carry-forward), `wallet_destination` (immutable wallet-specific detail — chain/network/canonical
 * address/hash/canonicalisation version/wallet type/beneficiary relationship), `address_
 * integrity_check` (append-only deterministic integrity evidence — including REFUSED
 * registrations, `destination_id` nullable for exactly that case), and `chain_coverage`
 * (deny-by-default chain/network format registry, seeded with exactly the two approved Phase 1B
 * pairs). No role is created here — `role_wlt1_runtime` is created by
 * `infra/grants/wlt1_runtime_grants.sql`, applied by a privileged role AFTER this migration.
 *
 * ---------------------------------------------------------------------------------------
 * CHECK constraints are NARROWED to exactly what Phase 1B code can reach — same "add a constraint
 * value only when a reachable code path exists" discipline every prior module's own migrations
 * established (migration 042's own header comment; AML-01's migration 039):
 *   - destination.destination_type: `'wallet'` only. `'fiat_payout'` is deferred — see above.
 *   - destination.status: `'draft'`/`'revoked'` only — a genuinely TWO-STATE reachable machine
 *     this phase (every successful registration creates `'draft'`; `'revoked'` is present ONLY so
 *     the partial unique index's own `WHERE status <> 'revoked'` predicate is well-formed against
 *     a real CHECK-constrained value — no Phase 1B code path ever writes `'revoked'`). The
 *     blueprint's own richer state machine (`pending_screening`/`pending_review`/
 *     `approved_pending_cooling`/`active`/`restricted`/`expired`) has no reachable Phase 1B code
 *     path — no screening, no whitelist maker-checker, no activation exists until later phases.
 *   - wallet_destination.wallet_type: `'hosted'`/`'unhosted'`/`'unknown'` — the full blueprint set,
 *     all three genuinely settable by the registration route's own request body this phase.
 *   - wallet_destination.beneficiary_relationship: `'self'`/`'related_party'`/`'third_party'` —
 *     the full blueprint set, all three genuinely settable this phase (beneficiary VERIFICATION
 *     is a later-phase workflow; the relationship CATEGORY is captured now as declared input).
 *   - address_integrity_check.result_status: `'pass'`/`'fail'` only — deterministic integrity
 *     evaluation is a definite outcome this phase, never `'review_required'` (that concept
 *     requires vendor-backed poisoning/lookalike screening, Phase 2+).
 *   - address_integrity_check.poisoning_screen_status: `'not_screened'` only — Phase 1B performs
 *     no vendor-backed poisoning/lookalike screening at all; the column exists (per the blueprint's
 *     own `address_integrity_check` design) so Phase 2's vendor-backed screening needs no new
 *     column, only a widened CHECK.
 *   - chain_coverage.coverage_status: `'supported'` only. Deny-by-default means an unsupported
 *     pair is the ABSENCE of a row, never a row carrying `'unsupported'`/`'degraded'` — those
 *     values are schema-present-but-unreachable-by-design until a Phase 2+ coverage-management
 *     workflow needs to represent a downgrade explicitly.
 *   - chain_coverage.activation_status: `'active'` only, for the identical reason.
 *   - chain_coverage.memo_tag_requirement: `'not_permitted'` only — BOTH approved Phase 1B pairs
 *     (ethereum/mainnet, tron/mainnet) forbid a memo/tag; a future memo/tag-requiring chain widens
 *     this CHECK, not this migration.
 *
 * `client_id` is an OPAQUE, CLT-01-VALIDATED-AT-REGISTRATION-TIME-OVER-HTTP reference this phase —
 * WLT-01 does NOT hold a cross-schema foreign key into `clt1.client_profile` (no grant into `clt1`
 * exists, same posture every module maintains toward every other module's schema); the live
 * eligibility check happens via `lib/clt1-client.ts`'s HTTP call BEFORE the WLT-01 transaction
 * opens, and `destination.client_status_ref` stores only the returned status STRING as evidence,
 * never a raw CLT-01 response body.
 *
 * No `sec_audit_ref`-shaped column anywhere — this codebase's real audit-linkage mechanism is
 * `foundation.outbox_event`, transaction-coupled and keyed by `entity_type`/`entity_id`, not a
 * denormalized stored reference column (mirrors every prior module's own table design).
 *
 * Duplicate-destination prevention: a partial unique index enforces AT MOST ONE NON-REVOKED
 * destination per `natural_key_hash` — `WHERE status <> 'revoked'` — the race-safe backstop
 * `lib/destinations.ts`'s own proactive `fetchWalletDestinationByNaturalKey` check maps to
 * `WLT1_DESTINATION_DUPLICATE` on a `23505` violation (mirrors KYC-01's own
 * `idx_kyc1_kyc_case_one_active_per_anchor` / AML-01's own `idx_aml1_screening_request_one_
 * inflight_per_subject` header-comment discipline). `natural_key_hash` already folds `client_id`
 * into its own hash input (`lib/destinations.ts`'s `computeNaturalKeyHash`), so the index does not
 * need a separate `client_id` column to scope uniqueness correctly.
 */

const CHAIN_COVERAGE_SEED = [
  {
    coverage_id: "wlt1cov_ethereum_mainnet",
    chain: "ethereum",
    network: "mainnet",
    address_format: "eip55",
    canonicalisation_version: "ethereum-eip55-v1",
  },
  {
    coverage_id: "wlt1cov_tron_mainnet",
    chain: "tron",
    network: "mainnet",
    address_format: "base58check",
    canonicalisation_version: "tron-base58check-v1",
  },
];

if (CHAIN_COVERAGE_SEED.length !== 2) {
  throw new Error(
    `049_wlt1_core migration invariant violated: expected exactly 2 approved Phase 1B chain-coverage pairs (ethereum/mainnet, tron/mainnet), found ${CHAIN_COVERAGE_SEED.length}. Fail closed rather than seed an incomplete registry.`,
  );
}

exports.up = (pgm) => {
  pgm.sql(`
    CREATE SCHEMA IF NOT EXISTS wlt1;

    -- destination — the type-agnostic destination anchor. Identity columns (destination_id,
    -- client_id, destination_type, natural_key_hash, created_at_utc) are immutable after INSERT;
    -- only lifecycle/version/status columns are ever updated.
    CREATE TABLE wlt1.destination (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      destination_id              varchar(64) NOT NULL UNIQUE,
      client_id                   varchar(64) NOT NULL,
      destination_type            varchar(16) NOT NULL
                                     CHECK (destination_type IN ('wallet')),
      natural_key_hash            varchar(128) NOT NULL,
      status                      varchar(16) NOT NULL DEFAULT 'draft'
                                     CHECK (status IN ('draft','revoked')),
      destination_status_version  int NOT NULL DEFAULT 1,
      whitelist_version           int NOT NULL DEFAULT 0,
      revocation_epoch            int NOT NULL DEFAULT 0,
      limits_version              int NOT NULL DEFAULT 0,
      client_status_ref           varchar(128),
      created_at_utc               timestamptz NOT NULL DEFAULT now(),
      updated_at_utc                timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_wlt1_destination_destination_id ON wlt1.destination (destination_id);
    CREATE INDEX idx_wlt1_destination_client_id_status ON wlt1.destination (client_id, status);

    -- At most one NON-REVOKED destination per natural_key_hash — see header comment.
    CREATE UNIQUE INDEX idx_wlt1_destination_natural_key
      ON wlt1.destination (natural_key_hash)
      WHERE status <> 'revoked';

    -- wallet_destination — immutable wallet-specific detail. Every column here is set ONCE at
    -- INSERT time; no Phase 1B code path ever updates a row in this table (no UPDATE grant either
    -- — see infra/grants/wlt1_runtime_grants.sql).
    CREATE TABLE wlt1.wallet_destination (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      destination_id              varchar(64) NOT NULL UNIQUE REFERENCES wlt1.destination (destination_id),
      chain                       varchar(16) NOT NULL,
      network                     varchar(16) NOT NULL,
      canonical_address           varchar(128) NOT NULL,
      address_hash                varchar(128) NOT NULL,
      memo_tag_identity           varchar(128) NOT NULL DEFAULT '',
      canonicalisation_version    varchar(32) NOT NULL,
      wallet_type                 varchar(16) NOT NULL
                                     CHECK (wallet_type IN ('hosted','unhosted','unknown')),
      beneficiary_relationship    varchar(16) NOT NULL
                                     CHECK (beneficiary_relationship IN ('self','related_party','third_party')),
      created_at_utc               timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_wlt1_wallet_destination_destination_id ON wlt1.wallet_destination (destination_id);
    CREATE INDEX idx_wlt1_wallet_destination_chain_network_hash ON wlt1.wallet_destination (chain, network, address_hash);

    -- address_integrity_check — APPEND-ONLY deterministic integrity evidence, including refused
    -- registrations (destination_id NULL in that case — no destination was ever created).
    -- raw_address_hash/canonical_address_hash are hashes only — never the raw address itself.
    CREATE TABLE wlt1.address_integrity_check (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      address_check_id            varchar(64) NOT NULL UNIQUE,
      destination_id              varchar(64) REFERENCES wlt1.destination (destination_id),
      client_id                   varchar(64) NOT NULL,
      chain                       varchar(16) NOT NULL,
      network                     varchar(16) NOT NULL,
      raw_address_hash            varchar(128) NOT NULL,
      canonical_address_hash      varchar(128),
      canonicalisation_version    varchar(32),
      checksum_valid              boolean NOT NULL,
      poisoning_screen_status     varchar(24) NOT NULL DEFAULT 'not_screened'
                                     CHECK (poisoning_screen_status IN ('not_screened')),
      result_status                varchar(16) NOT NULL
                                     CHECK (result_status IN ('pass','fail')),
      reason_code                  varchar(64) NOT NULL,
      created_at_utc                timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_wlt1_address_integrity_check_id ON wlt1.address_integrity_check (address_check_id);
    CREATE INDEX idx_wlt1_address_integrity_check_destination_id ON wlt1.address_integrity_check (destination_id);
    CREATE INDEX idx_wlt1_address_integrity_check_client_created ON wlt1.address_integrity_check (client_id, created_at_utc);

    -- chain_coverage — deny-by-default chain/network format registry. Runtime is READ-ONLY
    -- (SELECT-only grant); rows are written exclusively by this migration.
    CREATE TABLE wlt1.chain_coverage (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      coverage_id                 varchar(64) NOT NULL UNIQUE,
      chain                       varchar(16) NOT NULL,
      network                     varchar(16) NOT NULL,
      address_format               varchar(32) NOT NULL,
      canonicalisation_version    varchar(32) NOT NULL,
      memo_tag_requirement        varchar(16) NOT NULL DEFAULT 'not_permitted'
                                     CHECK (memo_tag_requirement IN ('not_permitted')),
      coverage_status              varchar(16) NOT NULL DEFAULT 'supported'
                                     CHECK (coverage_status IN ('supported')),
      activation_status            varchar(16) NOT NULL DEFAULT 'active'
                                     CHECK (activation_status IN ('active')),
      policy_version                int NOT NULL DEFAULT 1,
      effective_at_utc              timestamptz NOT NULL DEFAULT now(),
      updated_at_utc                 timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_wlt1_chain_coverage_id ON wlt1.chain_coverage (coverage_id);
    CREATE UNIQUE INDEX idx_wlt1_chain_coverage_chain_network ON wlt1.chain_coverage (chain, network);

    INSERT INTO wlt1.chain_coverage (coverage_id, chain, network, address_format, canonicalisation_version)
    VALUES
      ('${CHAIN_COVERAGE_SEED[0].coverage_id}', '${CHAIN_COVERAGE_SEED[0].chain}', '${CHAIN_COVERAGE_SEED[0].network}', '${CHAIN_COVERAGE_SEED[0].address_format}', '${CHAIN_COVERAGE_SEED[0].canonicalisation_version}'),
      ('${CHAIN_COVERAGE_SEED[1].coverage_id}', '${CHAIN_COVERAGE_SEED[1].chain}', '${CHAIN_COVERAGE_SEED[1].network}', '${CHAIN_COVERAGE_SEED[1].address_format}', '${CHAIN_COVERAGE_SEED[1].canonicalisation_version}');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS wlt1.chain_coverage;
    DROP TABLE IF EXISTS wlt1.address_integrity_check;
    DROP TABLE IF EXISTS wlt1.wallet_destination;
    DROP TABLE IF EXISTS wlt1.destination;
    DROP SCHEMA IF EXISTS wlt1;
  `);
};
