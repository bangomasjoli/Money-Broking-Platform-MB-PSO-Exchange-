/* eslint-disable camelcase */

/**
 * 053_wlt1_proof_of_control — WLT-01 Phase 3A-1 (approved Phase 3A-1 foundation slice). Creates
 * exactly ONE table, `wlt1.proof_of_control`, per the FROZEN Phase 3 architecture (freeze +
 * addendum, Ratifications A-E). Proof-of-Control ONLY — never ownership/beneficial-ownership/
 * custody, never whitelist approval, never any `active`/`restricted`/`approved_pending_cooling`
 * destination state. Does NOT add a `proof_of_control_status` column to `wlt1.wallet_destination`
 * (that table remains structurally immutable, unchanged since migration 049) — a destination's
 * current PoC status is read from THIS table, never denormalized onto the immutable one.
 *
 * BOOKKEEPING CORRECTION (not an architecture change): the architecture addendum's own prose
 * labelled this "23 columns"; the addendum's own ENUMERATED schema is authoritative and physically
 * contains 24 columns, because `created_at_utc` and `updated_at_utc` are separate physical columns
 * (a plain arithmetic undercount in that prose, not a design decision) — this migration implements
 * the enumerated 24-column schema.
 *
 * No route/challenge-lifecycle code exists yet (Phase 3A-2/3A-3) — this migration creates a table
 * with no reachable runtime writer this phase; `role_wlt1_runtime`'s own least-privilege grants
 * (infra/grants/wlt1_runtime_grants.sql) are added in the same slice so a later phase needs no
 * further grants-file patch, mirroring every prior module's own "grant ahead of the phase that
 * first uses it" precedent (e.g. this file's own `destination` UPDATE grant history).
 *
 * COLUMN NOTES:
 *   - `challenge_id` — the durable external identifier for one challenge/proof attempt; UNIQUE.
 *   - `destination_id` — FK into `wlt1.destination`, never cascading (mirrors every other WLT-01
 *     FK's own no-cascade posture; a destination row is never deleted by this codebase).
 *   - `client_id`/`chain`/`network`/`canonical_address`/`address_hash` — a point-in-time SNAPSHOT
 *     of the destination's own identity at challenge-issuance time, immutable after INSERT (never
 *     re-read from `wallet_destination` later) — the exact same "snapshot, not live re-derivation"
 *     posture `wallet_screening_result`'s own chain/network/address_hash columns already use.
 *   - `proof_method`/`verification_scheme` — Phase 3A supports exactly `signed_message` /
 *     `eip191_personal_sign`. TRON's own (different) verification scheme is deliberately NOT added
 *     to either CHECK here — see this file's own "NO TRON" note below.
 *   - `message_format_version` — frozen at exactly `1` this phase (`smallint`, matches
 *     `lib/proof-of-control/types.ts`'s own `POC_MESSAGE_FORMAT_VERSION_1`).
 *   - `domain_environment` — a snapshot of `Wlt1Config.environment` at issuance time, the existing
 *     five-value vocabulary (`dev`/`qa`/`uat`/`staging`/`prod`) — no new `WLT1_POC_DOMAIN` config.
 *   - `verification_status` — `issued` (default) -> exactly one of `verified`/`failed`/`expired`/
 *     `superseded`. No runtime code reaches any transition this phase (Phase 3A-2/3A-3's job).
 *   - `signature_hash`/`recovered_address`/`last_failure_reason_code`/`verified_at_utc` — all NULL
 *     until a (not-yet-implemented) verification attempt fills them.
 *   - The table-level CHECK `chk_wlt1_proof_of_control_verified_integrity` enforces that a
 *     `verified` row can NEVER exist without `signature_hash`/`recovered_address`/`verified_at_utc`
 *     all present and `last_failure_reason_code` absent — a structural guarantee, not merely an
 *     application-level convention, that "verified" always carries its own proof evidence.
 *
 * NO TRON THIS MIGRATION: `verification_scheme` CHECK contains exactly `eip191_personal_sign`.
 * TRON's own scheme (a DIFFERENT byte layout, Phase 3B) requires widening this CHECK in a FUTURE
 * migration 054 — not created here, not forecast by name beyond that. `lib/proof-of-control/
 * message.ts`'s own `resolvePocVerificationScheme(chain, network)` already resolves `tron/mainnet`
 * (and everything else) to `{ supported: false }` — this migration's CHECK is the DB-level mirror
 * of that same fail-closed boundary.
 *
 * INDEXES: `challenge_id` UNIQUE is a plain column constraint (no separate named index needed); a
 * PARTIAL UNIQUE index on `destination_id` WHERE `verification_status = 'issued'` enforces AT MOST
 * ONE currently-open challenge per destination; a SEPARATE partial UNIQUE index on `destination_id`
 * WHERE `verification_status = 'verified'` enforces AT MOST ONE verified proof per destination
 * (Phase 3 architecture's own "Model A" — exactly one verified proof, no re-verification path this
 * phase); a plain index on `(destination_id, verification_status)` supports the not-yet-implemented
 * lookup pattern the later challenge/verify routes will use.
 *
 * NO route/audit/error code is registered by this migration — WLT-01's error/audit inventories
 * (14 errors, 8 audits) are UNCHANGED by this slice; those belong to the Phase 3A-2/3A-3 API slice.
 *
 * EVIDENCE-PRESERVING DOWN: refuses (raises, whole migration rolls back) if ANY row is currently
 * `verification_status = 'verified'` — verified Proof-of-Control evidence must never be silently
 * discarded by a schema rollback, mirroring every prior WLT-01 migration's own down-refusal
 * discipline (050/051/052).
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE wlt1.proof_of_control (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      challenge_id                varchar(64) NOT NULL UNIQUE,
      destination_id               varchar(64) NOT NULL REFERENCES wlt1.destination (destination_id),
      client_id                    varchar(64) NOT NULL,
      chain                        varchar(16) NOT NULL,
      network                      varchar(16) NOT NULL,
      canonical_address            varchar(128) NOT NULL,
      address_hash                 varchar(128) NOT NULL,
      proof_method                 varchar(32) NOT NULL
                                      CHECK (proof_method IN ('signed_message')),
      verification_scheme          varchar(32) NOT NULL
                                      CHECK (verification_scheme IN ('eip191_personal_sign')),
      message_format_version       smallint NOT NULL
                                      CHECK (message_format_version = 1),
      domain_environment           varchar(16) NOT NULL
                                      CHECK (domain_environment IN ('dev','qa','uat','staging','prod')),
      nonce                        varchar(64) NOT NULL,
      message_hash                 varchar(64) NOT NULL,
      verification_status          varchar(16) NOT NULL DEFAULT 'issued'
                                      CHECK (verification_status IN ('issued','verified','failed','expired','superseded')),
      attempt_count                integer NOT NULL DEFAULT 0,
      signature_hash                varchar(64),
      recovered_address             varchar(128),
      last_failure_reason_code      varchar(64),
      issued_at_utc                 timestamptz NOT NULL,
      expires_at_utc                 timestamptz NOT NULL,
      verified_at_utc                 timestamptz,
      created_at_utc                   timestamptz NOT NULL DEFAULT now(),
      updated_at_utc                     timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_wlt1_proof_of_control_verified_integrity CHECK (
        verification_status <> 'verified'
        OR (
          signature_hash IS NOT NULL
          AND recovered_address IS NOT NULL
          AND verified_at_utc IS NOT NULL
          AND last_failure_reason_code IS NULL
        )
      )
    );

    -- At most one currently-OPEN (issued) challenge per destination.
    CREATE UNIQUE INDEX idx_wlt1_proof_of_control_one_issued
      ON wlt1.proof_of_control (destination_id)
      WHERE verification_status = 'issued';

    -- At most one VERIFIED proof per destination (Phase 3 "Model A" — no re-verification path
    -- this phase; a verified destination is never given a second verified row).
    CREATE UNIQUE INDEX idx_wlt1_proof_of_control_one_verified
      ON wlt1.proof_of_control (destination_id)
      WHERE verification_status = 'verified';

    CREATE INDEX idx_wlt1_proof_of_control_destination_status
      ON wlt1.proof_of_control (destination_id, verification_status);
  `);
};

exports.down = async (pgm) => {
  // ===========================================================================================
  // EVIDENCE-PRESERVING DOWN — refuse loudly rather than silently discard verified Proof-of-
  // Control evidence. A genuinely untouched Phase 3A-1 schema (no Phase 3A-2/3A-3 verify route has
  // ever run, so no row has ever reached 'verified') rolls back cleanly; a schema that already
  // holds a verified proof does NOT.
  // ===========================================================================================
  const verifiedRows = await pgm.db.query(`SELECT count(*)::int AS n FROM wlt1.proof_of_control WHERE verification_status = 'verified'`);
  if (Number(verifiedRows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "053_wlt1_proof_of_control down migration refused: wlt1.proof_of_control contains at least one verified proof. Verified Proof-of-Control evidence must never be silently discarded by a schema rollback.",
    );
  }

  pgm.sql(`DROP TABLE IF EXISTS wlt1.proof_of_control;`);
};
