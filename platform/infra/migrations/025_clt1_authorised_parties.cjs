/* eslint-disable camelcase */

/**
 * 025_clt1_authorised_parties — CLT-01 Phase 4 (blueprint v1.1 `05_Database_Design.md` §2.12,
 * adapted to the approved Phase 4 scope). Creates `clt1.authorised_party` — a legal/compliance
 * party record (director/UBO/controller/authorised signatory), structurally distinct from
 * `clt1.authorised_user` (Phase 3, operational actor) — plus its own request/apply binding table
 * (`clt1.authorised_party_decision_request`, mirroring `clt1.authorised_user_decision_request`'s
 * exact shape from migration 023).
 *
 * ---------------------------------------------------------------------------------------
 * `clt1.authorised_party` — application-scoped, NOT client-scoped (deviates from the blueprint's
 * own literal §2.12 column list, which lists both `client_id` and `application_id`).
 * ---------------------------------------------------------------------------------------
 * Parties (directors/UBOs/controllers/signatories) are compliance data naturally captured during
 * CDD, alongside `client_classification_evidence`/`consent_record` (both Phase 1, application-
 * scoped, no `client_id` column) — not alongside `authorised_user`/`client_mandate` (both Phase 3,
 * exclusively `client_id`-scoped, since those only make sense for an already-approved client). No
 * `client_id` column is stored here: for an approved client, the party list is derived at
 * read-time via `client_profile.application_id -> client_application.application_id` (the FK
 * Phase 2 already established), not stored redundantly. This avoids a nullable-then-backfilled
 * `client_id` column and avoids any write path into the already-twice-accepted `decisions.ts`
 * approve/apply transaction. Routes are `client_id`-scoped at the HTTP layer (matching the
 * blueprint's public route shape and Phase 3's own routing convention) — the stored FK stays
 * `application_id`; `services/clt1/src/routes/authorised-parties.ts` resolves `client_id ->
 * client_profile.application_id` before ever touching this table.
 *
 * `party_type` is narrowed to `signatory/director/controller/ubo` — the blueprint's own §2.12
 * enum also lists `client_admin`/`client_approver`, which are IDENTICAL to `authorised_user.role`
 * values (the same brief/blueprint conflation already documented in Phase 3's implementation
 * notes, recurring here from the blueprint's own text rather than a task-brief paraphrase).
 * Excluding them keeps `authorised_party` (compliance/legal party) and `authorised_user`
 * (operational actor) genuinely separate, rather than allowing the same role name to exist
 * unlinked in both tables. `linked_user_id` (blueprint column, "Optional IAM user") is omitted
 * entirely — no real client-user account-creation flow exists yet to link to (same reasoning
 * Phase 3 used for `authorised_user.user_reference` never being an FK to `iam.user_identity`).
 *
 * `party_reference` (declared name/reference, PII-adjacent) is NOT a blueprint-named column — the
 * blueprint's own §2.12 column list conspicuously has no declared-identity field at all. Added as
 * a necessary, documented extension (approved Phase 4 design decision), mirroring
 * `authorised_user.user_reference` exactly: stored, never returned by the default list route,
 * redacted from request logs.
 *
 * `identity_verification_status` (`pending/pass/fail/stale`) and `sanctions_pep_status`
 * (`pending/clear/hit/review_required`) are the blueprint's own exact §2.12 enums — these ARE the
 * screening-linkage columns (receipt-only; no actual screening engine, no external vendor call
 * anywhere in this codebase). `authority_status` reconciles a genuine inconsistency between the
 * blueprint's own two documents: `05_Database_Design.md` §2.12 lists `pending/active/restricted/
 * revoked` (no `rejected`, no `suspended`), while `06_State_Machine.md`'s state diagram draws
 * `pending_screening -> rejected` and `active_authority -> suspended` transitions that the
 * DB-Design enum cannot represent. The union of both (`pending/active/restricted/rejected/
 * revoked/suspended`) is used here so every diagrammed transition is representable. No
 * reactivation path exists in Phase 4 (approved design decision) — the blueprint's own diagram
 * draws no arrow back to `active`/`pending` from any of `restricted`/`rejected`/`revoked`/
 * `suspended`, so none is built; a corrected party requires a fresh `remove`+`add`, not a
 * transition.
 *
 * The row does not exist in a state that predates `add/apply` — mirrors every prior phase's own
 * precedent (`client_profile`, `client_mandate`, `authorised_user` all insert directly at their
 * real starting state): `add/apply` inserts directly at `authority_status='pending'` with both
 * screening columns also `'pending'`; the "declared but not yet screened" state IS the row's
 * initial state, not a separate pre-insert phase.
 *
 * `ownership_percentage` is a plain optional numeric with zero automatic UBO-threshold behaviour
 * this phase — the blueprint's own `ubo_identification_threshold` parameter is explicitly
 * `to_be_defined` (`01_Module_Blueprint.md` §5.15), so no CHECK constraint or route logic
 * enforces any threshold. `sec_audit_ref` is the blueprint's own exact column — a free-text
 * reference, no SEC-01 integration built around it. `last_screened_at_utc`/
 * `screening_source_module` are not blueprint-named but mirror `cdd_outcome.valid_until_utc`/
 * `.source_module`'s own receipt-tracking precedent exactly.
 *
 * ---------------------------------------------------------------------------------------
 * Decision-request table — mirrors `authorised_user_decision_request`'s exact shape (migration
 * 023), one table, `decision_type` variant (`add/update/remove/activate`) rather than four
 * separate tables. `restrict`/`reject`/`suspend` never write a row here — single-step,
 * permission-gated only (approved Phase 4 design decision, same reasoning Phase 3 applied to
 * `authorised_user.suspend`/`.reactivate`).
 * ---------------------------------------------------------------------------------------
 */

const APPLY_STATUS_ENUM = `('requested','applied','cancelled','failed')`;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE clt1.authorised_party (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      authorised_party_id       varchar(64) NOT NULL UNIQUE,
      application_id            varchar(64) NOT NULL REFERENCES clt1.client_application (application_id),
      party_type                varchar(32) NOT NULL
                                   CHECK (party_type IN ('signatory','director','controller','ubo')),
      party_reference            varchar(256) NOT NULL,
      ownership_percentage       numeric,
      identity_verification_status varchar(16) NOT NULL DEFAULT 'pending'
                                   CHECK (identity_verification_status IN ('pending','pass','fail','stale')),
      sanctions_pep_status        varchar(24) NOT NULL DEFAULT 'pending'
                                   CHECK (sanctions_pep_status IN ('pending','clear','hit','review_required')),
      authority_status            varchar(16) NOT NULL DEFAULT 'pending'
                                   CHECK (authority_status IN ('pending','active','restricted','rejected','revoked','suspended')),
      sec_audit_ref                varchar(256),
      last_screened_at_utc         timestamptz,
      screening_source_module      varchar(32),
      approval_id                  varchar(64),
      requested_by                 varchar(64) NOT NULL,
      version                      int NOT NULL DEFAULT 1,
      created_at_utc                timestamptz NOT NULL DEFAULT now(),
      updated_at_utc                timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_clt1_authorised_party_application_id_authority_status
      ON clt1.authorised_party (application_id, authority_status);

    CREATE TABLE clt1.authorised_party_decision_request (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      decision_id                varchar(64) NOT NULL UNIQUE,
      application_id              varchar(64) NOT NULL REFERENCES clt1.client_application (application_id),
      decision_type                varchar(16) NOT NULL CHECK (decision_type IN ('add','update','remove','activate')),
      target_authorised_party_id   varchar(64) REFERENCES clt1.authorised_party (authorised_party_id),
      party_type                   varchar(32),
      party_reference               varchar(256),
      ownership_percentage          numeric,
      sec_audit_ref                 varchar(256),
      reason                        varchar(128),
      requested_by                  varchar(64) NOT NULL,
      approval_id                   varchar(64),
      decision_token_hash           varchar(128),
      status                        varchar(16) NOT NULL DEFAULT 'requested' CHECK (status IN ${APPLY_STATUS_ENUM}),
      payload_hash                  varchar(128) NOT NULL,
      request_id                    varchar(128),
      correlation_id                varchar(128),
      created_at_utc                 timestamptz NOT NULL DEFAULT now(),
      applied_at_utc                 timestamptz
    );

    CREATE INDEX idx_clt1_authorised_party_decision_request_application_id_status
      ON clt1.authorised_party_decision_request (application_id, status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS clt1.authorised_party_decision_request;
    DROP TABLE IF EXISTS clt1.authorised_party;
  `);
};
