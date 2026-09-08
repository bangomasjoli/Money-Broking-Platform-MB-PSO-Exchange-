/* eslint-disable camelcase */

/**
 * 029_clt1_duplicate_candidates — CLT-01 Phase 6 (blueprint v1.1 `05_Database_Design.md` §2.8
 * `clt1.duplicate_candidate`, generalized to the approved Phase 6 scope). The blueprint's own
 * literal table has exactly two node-reference columns — `application_id` (subject) and
 * `matched_client_id` (matched) — because its own use case is "a new application might duplicate
 * an existing client." Phase 6 generalizes both sides into a polymorphic `subject_type/subject_ref`
 * + `matched_type/matched_ref` pair, reusing the exact `from_entity_type/to_entity_type` idiom
 * `clt1.related_party_edge` (migration 027) just established, rather than inventing a new shape —
 * needed to satisfy the approved scope's explicit `party`-scoped requirement (a blueprint-silent
 * extension; the blueprint's own duplicate concept never mentions `authorised_party`).
 *
 * `subject_type`/`matched_type` are limited to `application`/`client`/`party` — deliberately
 * EXCLUDING `authorised_user`/`client_mandate` (approved Phase 6 design decision; the blueprint's
 * own duplicate concept doesn't reference either). `match_type` adopts the blueprint's own exact
 * 5-value enum verbatim (`name`/`id`/`email`/`phone`/`corporate_ref`). `status` adopts the
 * blueprint's own exact 4-value enum verbatim (`open`/`duplicate`/`not_duplicate`/
 * `needs_more_info`) — `06_State_Machine.md` §4 draws a real diagram for this exact table, so this
 * is blueprint-literal, not an invented taxonomy. `needs_more_info` is schema-present but has NO
 * reachable transition/permission/route in Phase 6 (approved design decision) — same
 * present-but-defensive posture as `client_mandate.status`'s forward-compat values (Phase 3) and
 * `CLT1_UBO_THRESHOLD_REQUIRED` (Phase 4).
 *
 * `match_score` (blueprint column, `numeric`) is kept for schema fidelity but is NEVER written by
 * any Phase 6 code path — no scoring engine exists. `source_type`/`source_ref` are blueprint-silent
 * additions supporting the approved scope's "future detector reference, no detector" requirement:
 * `source_type` CHECK'd to `manual`/`future_detector`, but only `'manual'` is ever written this
 * phase; `source_ref` stays NULL always this phase.
 *
 * No real Postgres FK is possible on the polymorphic `subject_type/subject_ref` (or `matched_`)
 * columns — node existence is validated entirely at the application layer
 * (`routes/duplicate-candidates.ts`), mirroring `related_party_edge`'s own posture exactly. The
 * self-reference CHECK below is the only DB-level structural guard available.
 *
 * Unlike `related_party_edge`'s exact-tuple-uniqueness-always index, this table's partial unique
 * index is scoped to `WHERE status = 'open'` only (approved Phase 6 design decision, LOCKED DESIGN
 * DECISIONS 19-23): pair DIRECTION matters (subject = "the one under review", matched = "the one
 * it might duplicate" — these are not interchangeable roles, so no canonicalization), and a
 * resolved candidate (`duplicate`/`not_duplicate`) may be legitimately re-declared later (e.g. new
 * evidence surfaces) without the index blocking it — only simultaneously-open redundant
 * declarations of the exact same tuple are rejected. `add/apply`'s own 23505-violation-on-this-index
 * handling maps to a real 409 `CLT1_DUPLICATE_CANDIDATE_ALREADY_OPEN` (see
 * routes/duplicate-candidates.ts) — applying the lesson from Phase 4's own carried-forward F1
 * finding and Phase 5's own `related_party_edge` duplicate mapping, rather than collapsing it into
 * the generic 503 `CLT1_AUDIT_REQUIRED`.
 *
 * Residual, documented gap (mirrors Phase 5's own non-canonicalization carry-forward exactly): a
 * `party`-vs-`party` (or `client`-vs-`client`) pair declared as `(A,B)` and separately as `(B,A)` is
 * NOT caught as the same open candidate — direction is preserved deliberately, not accidentally.
 *
 * ---------------------------------------------------------------------------------------
 * Decision-request table — mirrors the established shape (`related_party_edge_decision_request`,
 * `authorised_party_decision_request`), also with no owning-scope column:
 * `target_duplicate_candidate_id` (nullable, for update/confirm/dismiss) plus the
 * candidate-defining fields for `create`. `decision_type IN ('create','update','confirm',
 * 'dismiss')`.
 * ---------------------------------------------------------------------------------------
 */

const APPLY_STATUS_ENUM = `('requested','applied','cancelled','failed')`;
const NODE_TYPE_ENUM = `('application','client','party')`;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE clt1.duplicate_candidate (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      duplicate_candidate_id    varchar(64) NOT NULL UNIQUE,
      subject_type              varchar(16) NOT NULL CHECK (subject_type IN ${NODE_TYPE_ENUM}),
      subject_ref               varchar(64) NOT NULL,
      matched_type              varchar(16) NOT NULL CHECK (matched_type IN ${NODE_TYPE_ENUM}),
      matched_ref               varchar(64) NOT NULL,
      match_type                varchar(16) NOT NULL
                                   CHECK (match_type IN ('name','id','email','phone','corporate_ref')),
      match_score                numeric,
      status                      varchar(24) NOT NULL DEFAULT 'open'
                                   CHECK (status IN ('open','duplicate','not_duplicate','needs_more_info')),
      source_type                  varchar(24) NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','future_detector')),
      source_ref                    varchar(64),
      evidence_ref                   varchar(256),
      reviewed_by                     varchar(64),
      reviewed_at_utc                  timestamptz,
      approval_id                       varchar(64),
      requested_by                       varchar(64) NOT NULL,
      sec_audit_ref                       varchar(64),
      version                              int NOT NULL DEFAULT 1,
      created_at_utc                        timestamptz NOT NULL DEFAULT now(),
      updated_at_utc                         timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT clt1_duplicate_candidate_no_self_reference
        CHECK (NOT (subject_type = matched_type AND subject_ref = matched_ref))
    );

    CREATE INDEX idx_clt1_duplicate_candidate_subject ON clt1.duplicate_candidate (subject_type, subject_ref, status);
    CREATE INDEX idx_clt1_duplicate_candidate_matched ON clt1.duplicate_candidate (matched_type, matched_ref, status);

    -- Directional, status='open'-scoped uniqueness only — see header comment: pair direction
    -- matters (no canonicalization), and a resolved candidate may be legitimately re-declared.
    CREATE UNIQUE INDEX idx_clt1_duplicate_candidate_one_open_per_tuple
      ON clt1.duplicate_candidate (subject_type, subject_ref, matched_type, matched_ref, match_type)
      WHERE (status = 'open');

    CREATE TABLE clt1.duplicate_candidate_decision_request (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      decision_id                varchar(64) NOT NULL UNIQUE,
      decision_type                varchar(16) NOT NULL CHECK (decision_type IN ('create','update','confirm','dismiss')),
      target_duplicate_candidate_id varchar(64) REFERENCES clt1.duplicate_candidate (duplicate_candidate_id),
      subject_type                   varchar(16),
      subject_ref                     varchar(64),
      matched_type                     varchar(16),
      matched_ref                       varchar(64),
      match_type                         varchar(16),
      evidence_ref                        varchar(256),
      reason                                varchar(128),
      requested_by                          varchar(64) NOT NULL,
      approval_id                            varchar(64),
      decision_token_hash                     varchar(128),
      status                                   varchar(16) NOT NULL DEFAULT 'requested' CHECK (status IN ${APPLY_STATUS_ENUM}),
      payload_hash                              varchar(128) NOT NULL,
      request_id                                 varchar(128),
      correlation_id                              varchar(128),
      created_at_utc                               timestamptz NOT NULL DEFAULT now(),
      applied_at_utc                                timestamptz
    );

    CREATE INDEX idx_clt1_duplicate_candidate_decision_request_status
      ON clt1.duplicate_candidate_decision_request (status);
    CREATE INDEX idx_clt1_duplicate_candidate_decision_request_target_status
      ON clt1.duplicate_candidate_decision_request (target_duplicate_candidate_id, status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS clt1.duplicate_candidate_decision_request;
    DROP TABLE IF EXISTS clt1.duplicate_candidate;
  `);
};
