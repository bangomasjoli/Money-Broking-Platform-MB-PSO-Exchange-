/* eslint-disable camelcase */

/**
 * 059_wlt1_destination_revocation — WLT-01 Destination Revocation + AML Revocation Signal
 * Ingestion. Implements the FROZEN architecture (WLT-01 Destination Revocation + AML Revocation
 * Addendum, CLOSED + Response/Revocation-ID Micro-Addendum, CLOSED) exactly — no new architectural
 * decisions are made in this migration.
 *
 * Creates `wlt1.destination_revocation` — a durable, append-only evidence table recording every
 * destination revocation, from EITHER source (`operator` immediate containment, or `aml` risk
 * signal ingestion). This is NOT a new destination-lifecycle state machine table: `wlt1.destination`
 * itself still owns `status`/`revocation_epoch`/`destination_status_version` (unchanged columns,
 * no new migration on that table this phase) — this table exists ONLY to answer "why/when/by whom
 * was this destination revoked", and to provide the durable AML-signal idempotency backstop the
 * runtime role's own INSERT-only `foundation.outbox_event` grant cannot (WLT-01 cannot read its own
 * audit trail at runtime).
 *
 * SOURCE-COHERENCE CHECK (frozen, load-bearing): `source = 'operator'` requires `actor_id NOT NULL`
 * and `signal_ref`/`signal_type` BOTH NULL; `source = 'aml'` requires the exact opposite. Mirrors
 * migration 058's own "structural coherence, not merely NOT NULL" discipline — a row claiming to be
 * AML-sourced with no `signal_ref`, or operator-sourced with a `signal_ref`, is never a
 * representable state.
 *
 * PARTIAL UNIQUE INDEX on `signal_ref` (WHERE NOT NULL): the durable AML-signal idempotency
 * backstop — an AML risk signal's own `signal_id` (persisted verbatim as `signal_ref`, reused from
 * AML-01's own canonical `aml1.risk_signal.signal_id`, never a new WLT-side identifier) can appear
 * in this table at most once, GLOBALLY (not scoped per destination) — see
 * `lib/destination-revocation.ts`'s own header comment on misbound-signal_ref handling for why this
 * is deliberately global, not composite.
 *
 * EVIDENCE-PRESERVING DOWN (mirrors migration 055's/058's own established precedent): refuses if
 * ANY row exists in this table — durable revocation provenance must never be silently discarded by
 * a schema rollback. A genuinely untouched schema (no revocation has ever succeeded) rolls back
 * cleanly.
 */

const TABLE = "wlt1.destination_revocation";
const SOURCE_COHERENCE_CHECK_NAME = "chk_wlt1_destination_revocation_source_coherent";
const SIGNAL_REF_INDEX_NAME = "idx_wlt1_destination_revocation_signal_ref";
const DESTINATION_INDEX_NAME = "idx_wlt1_destination_revocation_destination";

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE ${TABLE} (
      id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      revocation_id                     varchar(64) NOT NULL UNIQUE,
      destination_id                    varchar(64) NOT NULL REFERENCES wlt1.destination (destination_id),
      client_id                         varchar(64) NOT NULL,
      source                            varchar(16) NOT NULL CHECK (source IN ('operator', 'aml')),
      reason_code                       varchar(32) NOT NULL CHECK (reason_code IN (
                                           'compromise',
                                           'client_request',
                                           'beneficiary_change',
                                           'operator_security_action',
                                           'administrative',
                                           'aml_risk_signal'
                                         )),
      reason_detail                     varchar(280),
      actor_id                          varchar(64),
      signal_ref                        varchar(64),
      signal_type                       varchar(48),
      destination_status_version_after  integer NOT NULL,
      revocation_epoch_after            integer NOT NULL,
      revoked_at_utc                    timestamptz NOT NULL DEFAULT now(),
      created_at_utc                    timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ${SOURCE_COHERENCE_CHECK_NAME} CHECK (
            (source = 'operator' AND actor_id IS NOT NULL AND signal_ref IS NULL     AND signal_type IS NULL)
         OR (source = 'aml'      AND actor_id IS NULL     AND signal_ref IS NOT NULL AND signal_type IS NOT NULL)
      )
    );

    CREATE UNIQUE INDEX ${SIGNAL_REF_INDEX_NAME}
      ON ${TABLE} (signal_ref)
      WHERE signal_ref IS NOT NULL;

    CREATE INDEX ${DESTINATION_INDEX_NAME}
      ON ${TABLE} (destination_id, revoked_at_utc DESC);
  `);
};

exports.down = async (pgm) => {
  // ===========================================================================================
  // EVIDENCE-PRESERVING DOWN — refuse loudly rather than silently discard revocation provenance.
  // ===========================================================================================
  const rows = await pgm.db.query(`SELECT count(*)::int AS n FROM ${TABLE}`);
  if (Number(rows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "059_wlt1_destination_revocation down migration refused: wlt1.destination_revocation contains evidence rows. Durable revocation provenance must never be silently discarded or rewritten by a schema rollback.",
    );
  }

  await pgm.db.query(`DROP TABLE ${TABLE}`);
};
