/* eslint-disable camelcase */

/**
 * 062_wlt1_evidence_export — WLT-01 Evidence Export. Implements the FROZEN architecture (WLT-01
 * Evidence Export Implementation-Contract Architecture Addendum + Final Micro-Clarification +
 * IAM/Idempotency + Manifest Final Correction) exactly — no new architectural decisions are made
 * in this migration.
 *
 * Creates `wlt1.evidence_export` — a durable, append-only, one-row-per-generated-package table.
 * Row-exists <=> ready: there is deliberately NO status column (the addendum's own frozen "row
 * exists ⇔ ready" lifecycle rule) and deliberately NO `approved_by` column (the addendum's own
 * corrected ruling: WLT-01 cannot truthfully know the IAM-02 checker's identity — see
 * `verifyDecisionToken`'s own contract, `actorId` is bound to the ORIGINAL maker, never the
 * approver — so checker identity is resolvable only inside IAM-02, via `approval_ref`).
 *
 * `content` stores the exact `JSON.stringify(body)` bytes served verbatim by the download route
 * — `text`, never `jsonb` (jsonb would silently reorder object keys on storage, breaking the
 * byte-exact `fingerprint(JSON.parse(content)) === content_hash` round-trip invariant the
 * architecture requires).
 *
 * SCHEMA COMPLETENESS NOTE (disclosed, not silently decided): the frozen manifest requires a
 * `record_counts` per-evidence-type breakdown, and the frozen "single content route" rule
 * requires the status route and the apply-completed-replay branch to reconstruct that exact
 * manifest WITHOUT ever selecting `content` (content may be returned by the download route
 * only). Neither is possible from the originally-frozen column list, which persisted only the
 * SUMMED `record_count`. `scope_record_counts jsonb NOT NULL` is added below to close this gap —
 * a small, NON-SENSITIVE, per-type integer breakdown (never evidentiary content, never a
 * Restricted value, carries nothing the "single content route" rule protects), flagged here for
 * the independent reviewer rather than silently added.
 *
 * `UNIQUE (approval_ref)` (`uq_wlt1_evidence_export_approval_ref`) is the WLT-side defensive
 * backstop against the SEPARATELY-TRACKED, NOT-fixed-here IAM-02 decision-token double-consume
 * race (`verifyAndConsumeDecisionToken`'s own `SELECT` takes no `FOR UPDATE`) — even if two
 * concurrent execute-verify calls against the SAME token both report success, at most one
 * `wlt1.evidence_export` row can ever be inserted for that one IAM-02 approval; the second INSERT
 * raises `23505` on this exact constraint, mapped by the route to `403 WLT1_APPROVAL_REQUIRED`
 * (`lib/destinations.ts`'s own established constraint-name-matching precedent, never a bare
 * `23505` catch-all).
 *
 * EVIDENCE-PRESERVING DOWN (mirrors migration 059's/060's/061's own established precedent):
 * refuses if ANY row exists — a durable, integrity-hashed evidentiary export must never be
 * silently discarded by a schema rollback. A genuinely untouched schema (no export has ever been
 * generated) rolls back cleanly.
 */

const TABLE = "wlt1.evidence_export";
const APPROVAL_REF_UNIQUE_CONSTRAINT = "uq_wlt1_evidence_export_approval_ref";
const CLIENT_INDEX_NAME = "idx_wlt1_evidence_export_client";

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE ${TABLE} (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      export_id                varchar(64)  NOT NULL UNIQUE,
      client_id                varchar(64)  NOT NULL,
      scope_destination_id     varchar(64),
      scope_evidence_types     jsonb        NOT NULL,
      scope_from_utc           timestamptz,
      scope_to_utc             timestamptz,
      scope_hash               varchar(128) NOT NULL,
      requested_by             varchar(64)  NOT NULL,
      approval_ref             varchar(64)  NOT NULL,
      reason                   varchar(256),
      schema_version           varchar(32)  NOT NULL,
      record_count             integer      NOT NULL CHECK (record_count >= 0),
      scope_record_counts      jsonb        NOT NULL,
      content_hash             varchar(128) NOT NULL,
      content                  text         NOT NULL,
      request_id               varchar(128) NOT NULL,
      correlation_id           varchar(128) NOT NULL,
      generated_at_utc         timestamptz  NOT NULL,
      created_at_utc           timestamptz  NOT NULL DEFAULT now(),
      CONSTRAINT ${APPROVAL_REF_UNIQUE_CONSTRAINT} UNIQUE (approval_ref)
    );

    CREATE INDEX ${CLIENT_INDEX_NAME}
      ON ${TABLE} (client_id, generated_at_utc DESC);
  `);
};

exports.down = async (pgm) => {
  // ===========================================================================================
  // EVIDENCE-PRESERVING DOWN — refuse loudly rather than silently discard an integrity-hashed
  // evidentiary export package.
  // ===========================================================================================
  const rows = await pgm.db.query(`SELECT count(*)::int AS n FROM ${TABLE}`);
  if (Number(rows.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "062_wlt1_evidence_export down migration refused: wlt1.evidence_export contains evidence rows. Durable, integrity-hashed evidentiary export packages must never be silently discarded or rewritten by a schema rollback.",
    );
  }

  await pgm.db.query(`DROP TABLE ${TABLE}`);
};
