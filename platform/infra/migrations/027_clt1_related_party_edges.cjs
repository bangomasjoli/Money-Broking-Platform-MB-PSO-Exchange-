/* eslint-disable camelcase */

/**
 * 027_clt1_related_party_edges — CLT-01 Phase 5 (blueprint v1.1 `05_Database_Design.md` §2.14,
 * adapted to the approved Phase 5 scope). Creates `clt1.related_party_edge` — a manually-declared,
 * polymorphic relationship record linking `client`/`application`/`party` entities — plus its own
 * request/apply binding table (`clt1.related_party_edge_decision_request`, mirroring the shape
 * every prior Phase 3/4 decision-request table already established).
 *
 * ---------------------------------------------------------------------------------------
 * `clt1.related_party_edge` — the first CLT-01 table with NO single owning scope.
 * ---------------------------------------------------------------------------------------
 * Every table Phase 1-4 built is owned by exactly one `application_id` or `client_id`. An edge
 * inherently spans two potentially-different entities — that is the entire point of a
 * relationship graph — so there is deliberately no `owning_application_id`/`owning_client_id`
 * column (approved Phase 5 design decision; the blueprint's own §2.14 table has no such column
 * either). `from_entity_type`/`from_entity_id` and `to_entity_type`/`to_entity_id` are the
 * blueprint's own literal column names, adopted verbatim. No real Postgres FK is possible on
 * these columns — Postgres has no conditional/type-dependent foreign key — so node existence is
 * validated entirely at the application layer (`routes/related-party-edges.ts`), not backstopped
 * here; the self-reference CHECK below is the only DB-level structural guard this table can offer.
 *
 * `from_entity_type`/`to_entity_type` are the blueprint's own exact enum: `client`/`application`/
 * `party` ("party" = `clt1.authorised_party`). `authorised_user` and `client_mandate` are
 * deliberately NOT node types (approved Phase 5 design decision) — the blueprint's own enum
 * doesn't include them either; the related-party graph is a compliance/legal-entity concept,
 * `authorised_user` is operational authority and `client_mandate` is a rules object, neither of
 * which belongs in a relationship graph.
 *
 * `relationship_type` is the blueprint's own exact enum: `ubo`/`director`/`signatory`/
 * `shared_identity`/`shared_address`/`associated_account` — adopted verbatim even though it mixes
 * two different concepts (role-echoing labels that overlap with `authorised_party.party_type`,
 * and matching-signal labels that read like duplicate-detection output). The label does not imply
 * provenance: every edge in Phase 5 is human-declared via a maker-checker route regardless of
 * which of the 6 values is chosen — no automated matching ever produces one.
 *
 * `status` is the blueprint's own exact 2-value enum: `active`/`inactive` — no state-machine
 * diagram exists for this table (confirmed absent from `06_State_Machine.md`), and the blueprint's
 * own DB design is genuinely this simple; no invented intermediate states. `add/apply` inserts
 * directly at `status='active'` (mirrors every prior phase's own "no pre-insert pending state"
 * precedent); `remove/apply` sets `status='inactive'` (reuses the blueprint's own second value,
 * not an invented `removed` state). `update/apply` touches only `evidence_ref` — node references
 * and `relationship_type` are immutable after creation, mirroring `authorised_party.party_type`/
 * `.party_reference`'s own immutability.
 *
 * The partial unique index enforces EXACT-TUPLE uniqueness only (approved Phase 5 design
 * decision) — no direction-canonicalization for the naturally-symmetric relationship types
 * (`shared_identity`/`shared_address`/`associated_account`). A symmetric relationship could in
 * principle be declared twice in reverse order without this index catching it as a duplicate;
 * canonicalization is graph-adjacent complexity deliberately deferred out of this baseline phase.
 * `add/apply`'s own 23505-violation-on-this-index handling maps to a real 409
 * `CLT1_RELATED_PARTY_EDGE_DUPLICATE` (see routes/related-party-edges.ts) — applying the lesson
 * from Phase 4's own carried-forward F1 finding (a near-identical unique-violation was left
 * collapsed into a misleading 503 there) rather than repeating it in new code.
 *
 * ---------------------------------------------------------------------------------------
 * Decision-request table — mirrors the established shape, but ALSO has no owning-scope column
 * (structural first for CLT-01): `target_related_party_edge_id` (nullable, for update/remove)
 * plus the edge-defining fields for `add`. `decision_type IN ('add','update','remove')`.
 * ---------------------------------------------------------------------------------------
 */

const APPLY_STATUS_ENUM = `('requested','applied','cancelled','failed')`;
const ENTITY_TYPE_ENUM = `('client','application','party')`;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE clt1.related_party_edge (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      related_party_edge_id     varchar(64) NOT NULL UNIQUE,
      from_entity_type          varchar(16) NOT NULL CHECK (from_entity_type IN ${ENTITY_TYPE_ENUM}),
      from_entity_id            varchar(64) NOT NULL,
      to_entity_type            varchar(16) NOT NULL CHECK (to_entity_type IN ${ENTITY_TYPE_ENUM}),
      to_entity_id              varchar(64) NOT NULL,
      relationship_type         varchar(32) NOT NULL
                                   CHECK (relationship_type IN ('ubo','director','signatory','shared_identity','shared_address','associated_account')),
      status                    varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
      evidence_ref               varchar(256),
      approval_id                 varchar(64),
      requested_by                varchar(64) NOT NULL,
      version                     int NOT NULL DEFAULT 1,
      created_at_utc               timestamptz NOT NULL DEFAULT now(),
      updated_at_utc               timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT clt1_related_party_edge_no_self_reference
        CHECK (NOT (from_entity_type = to_entity_type AND from_entity_id = to_entity_id))
    );

    CREATE INDEX idx_clt1_related_party_edge_from ON clt1.related_party_edge (from_entity_type, from_entity_id, status);
    CREATE INDEX idx_clt1_related_party_edge_to ON clt1.related_party_edge (to_entity_type, to_entity_id, status);

    -- Exact-tuple uniqueness only — see header comment: no direction-canonicalization for
    -- symmetric relationship types this phase.
    CREATE UNIQUE INDEX idx_clt1_related_party_edge_one_active_per_tuple
      ON clt1.related_party_edge (from_entity_type, from_entity_id, to_entity_type, to_entity_id, relationship_type)
      WHERE (status = 'active');

    CREATE TABLE clt1.related_party_edge_decision_request (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      decision_id                varchar(64) NOT NULL UNIQUE,
      decision_type                varchar(16) NOT NULL CHECK (decision_type IN ('add','update','remove')),
      target_related_party_edge_id varchar(64) REFERENCES clt1.related_party_edge (related_party_edge_id),
      from_entity_type              varchar(16),
      from_entity_id                varchar(64),
      to_entity_type                 varchar(16),
      to_entity_id                   varchar(64),
      relationship_type               varchar(32),
      evidence_ref                    varchar(256),
      reason                           varchar(128),
      requested_by                     varchar(64) NOT NULL,
      approval_id                      varchar(64),
      decision_token_hash              varchar(128),
      status                           varchar(16) NOT NULL DEFAULT 'requested' CHECK (status IN ${APPLY_STATUS_ENUM}),
      payload_hash                     varchar(128) NOT NULL,
      request_id                       varchar(128),
      correlation_id                    varchar(128),
      created_at_utc                     timestamptz NOT NULL DEFAULT now(),
      applied_at_utc                     timestamptz
    );

    CREATE INDEX idx_clt1_related_party_edge_decision_request_status
      ON clt1.related_party_edge_decision_request (status);
    CREATE INDEX idx_clt1_related_party_edge_decision_request_target_status
      ON clt1.related_party_edge_decision_request (target_related_party_edge_id, status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS clt1.related_party_edge_decision_request;
    DROP TABLE IF EXISTS clt1.related_party_edge;
  `);
};
