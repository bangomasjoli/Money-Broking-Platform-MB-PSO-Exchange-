/* eslint-disable camelcase */

/**
 * 042_kyc1_core — KYC-01 Phase 1 (deterministic KYC/KYB evidence baseline, approved Phase 1
 * scope). Creates the `kyc1` schema and four tables: `kyc_case` (case anchor, PII-free — no raw
 * name/DOB/registration number; the underlying identity fields live in CLT-01's own
 * `client_application`/`authorised_party` tables, referenced here only by opaque
 * `application_id`/`client_id`/`party_id`), `document_checklist_item` (required-document tracking,
 * evidence stored as an OPAQUE reference + hash only — never raw content), `verification_result`
 * (append-only manual/registry verification findings), and `cdd_outcome` (append-VERSIONED —
 * never updated in place — deterministic CDD outcome computed from the other three tables). No
 * seed data. No role is created here — `role_kyc1_runtime` is created by
 * `infra/grants/kyc1_runtime_grants.sql`, applied by a privileged role AFTER this migration.
 *
 * ---------------------------------------------------------------------------------------
 * CHECK constraints are NARROWED to exactly what Phase 1 code can reach — same "add a constraint
 * value only when a reachable code path exists" discipline AML-01's own migrations established
 * (e.g. migration 039's `trigger_reason` deferring `kyc_profile_changed`/etc.), applied here from
 * the very first migration rather than discovered by a later review pass:
 *   - kyc_case.case_type: 'individual'/'entity'/'authorised_party' only. 'ubo'/'controller'/
 *     'trust_nominee' are reserved for the phase that lands the ownership/UBO look-through engine
 *     (KYC-01 Phase 4+) — deliberately excluded, not an oversight.
 *   - kyc_case.status: 'pending_documents'/'completed'/'remediation' only — a genuinely
 *     THREE-STATE reachable machine this phase (set 'pending_documents' at creation, transitioned
 *     to 'completed' or 'remediation' by `compute-outcome`). The blueprint's own richer state
 *     machine (`manual_review`/`edd`/`closed`/`stale`) has no reachable Phase 1 code path — no
 *     manual review, no EDD routing, no periodic review/closure exists until later phases.
 *   - verification_result.source_type: 'manual'/'registry' only. 'vendor' is reserved for the
 *     phase that lands the vendor-reliance/vendor-inbox framework (KYC-01 Phase 7) — Phase 1 has
 *     no vendor adaptor of any kind.
 *   - verification_result.result_type: 'document'/'identity'/'entity' only — the three result
 *     shapes Phase 1's own routes actually emit events for (`kyc1.document_verified`/`_rejected`,
 *     `kyc1.identity_verified`/`_failed`, `kyc1.entity_verified`/`_failed`). 'authority'/'ubo' are
 *     reserved for the authorised-party/ownership phases.
 *   - verification_result.result_status: 'pass'/'fail' only — a human manual/registry entry is a
 *     definite judgement this phase, never 'inconclusive' (that concept belongs to vendor-result
 *     handling, Phase 7).
 *   - cdd_outcome.outcome_status: 'pending'/'pass'/'fail'/'remediation_required' — the full
 *     blueprint-named set is carried here (unlike the narrower columns above) because this is the
 *     value CLT-01's own `cdd_outcome.outcome_status`/`handoff_status.outcome_status` columns will
 *     eventually read verbatim once Phase 2 delivery lands (migration `021_clt1_cdd_final_
 *     approval.cjs`) — keeping the enum aligned now avoids a later cross-module mismatch. 'pending'
 *     itself is schema-present but UNREACHABLE this phase: `compute-outcome` is fully synchronous
 *     and deterministic and always resolves directly to 'pass'/'fail'/'remediation_required' in the
 *     same call — no code path this phase ever writes a persisted 'pending' row (mirrors AML-01
 *     Phase 1's own `screening_result.overall_status` carrying `'confirmed_hit'`/`'error'` schema-
 *     present-but-unreachable until later phases).
 *   - `sec_audit_ref` columns from the blueprint's own table design are DELIBERATELY OMITTED
 *     throughout — this codebase's real audit-linkage mechanism is `foundation.outbox_event`,
 *     transaction-coupled and keyed by `entity_type`/`entity_id` (see `lib/kyc-case.ts` /
 *     `lib/outcome-engine.ts`'s own `publishAudit` call sites), not a denormalized stored
 *     reference column — mirrors every prior module's own table design (AML-01/CLT-01/CFG-01/
 *     SEC-01 tables carry no `sec_audit_ref`-shaped column either). The actual requirement (an
 *     audit trail exists) is met via the platform's real mechanism, not a blueprint-literal column.
 *
 * `application_id`/`client_id`/`party_id` are OPAQUE, UNVERIFIED caller-supplied references this
 * phase — KYC-01 does not call out to CLT-01 to confirm they exist (no CLT-01 HTTP client yet;
 * approved Phase 1 design decision, mirrors AML-01 Phase 1's own `subject_ref` posture exactly).
 * Not a real FK to `clt1.*` — KYC-01 has no grant into the `clt1` schema, same posture every
 * module maintains toward every other module's schema.
 *
 * Duplicate-case prevention: a partial unique index enforces AT MOST ONE ACTIVE (non-'completed')
 * case per (application_id, case_type, party_id) anchor — the race-safe backstop
 * `lib/kyc-case.ts`'s own proactive check maps to `KYC1_CASE_ALREADY_EXISTS` on a `23505` violation
 * (mirrors AML-01's `idx_aml1_screening_request_one_inflight_per_subject` / migration 039's own
 * header-comment discipline). `party_id` is nullable for individual/entity cases, so the index
 * expression uses `COALESCE(party_id, '')` — otherwise Postgres's own NULL-is-distinct-from-NULL
 * unique-index semantics would silently fail to catch two individual/entity duplicates sharing the
 * same `application_id`.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE SCHEMA IF NOT EXISTS kyc1;

    -- kyc_case — the case anchor. PII-FREE: no raw name/DOB/registration number lives here or
    -- anywhere else in this schema this phase — application_id/client_id/party_id are opaque
    -- pointers back to CLT-01's own identity-bearing tables.
    CREATE TABLE kyc1.kyc_case (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id                   varchar(64) NOT NULL UNIQUE,
      application_id            varchar(64) NOT NULL,
      client_id                 varchar(64),
      party_id                  varchar(64),
      case_type                 varchar(24) NOT NULL
                                   CHECK (case_type IN ('individual','entity','authorised_party')),
      status                    varchar(24) NOT NULL DEFAULT 'pending_documents'
                                   CHECK (status IN ('pending_documents','completed','remediation')),
      current_outcome_status    varchar(24)
                                   CHECK (current_outcome_status IN ('pending','pass','fail','remediation_required')),
      current_outcome_id        varchar(64),
      created_from_handoff_id   varchar(64),
      request_id                varchar(128),
      correlation_id             varchar(128),
      created_at_utc            timestamptz NOT NULL DEFAULT now(),
      updated_at_utc             timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_kyc1_kyc_case_case_id ON kyc1.kyc_case (case_id);
    CREATE INDEX idx_kyc1_kyc_case_application_id_type ON kyc1.kyc_case (application_id, case_type);
    CREATE INDEX idx_kyc1_kyc_case_client_id_status ON kyc1.kyc_case (client_id, status);

    -- At most one ACTIVE (non-'completed') case per (application_id, case_type, party_id) anchor —
    -- see header comment for the COALESCE rationale.
    CREATE UNIQUE INDEX idx_kyc1_kyc_case_one_active_per_anchor
      ON kyc1.kyc_case (application_id, case_type, COALESCE(party_id, ''))
      WHERE status <> 'completed';

    -- document_checklist_item — required-document tracking. evidence_ref is an OPAQUE reference
    -- string only (e.g. an external document-store key/token) — never raw content, never base64,
    -- never an uploaded file. document_type stays an unconstrained varchar — the blueprint's own
    -- final checklist-by-client-type/jurisdiction is an explicit Open Item (§13 #2), not decided;
    -- Phase 1 seeds a documented, clearly-labelled deterministic placeholder set per case_type
    -- (lib/kyc-case.ts) rather than pretending a taxonomy has been finalised.
    CREATE TABLE kyc1.document_checklist_item (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      checklist_item_id         varchar(64) NOT NULL UNIQUE,
      case_id                   varchar(64) NOT NULL REFERENCES kyc1.kyc_case (case_id),
      document_type             varchar(64) NOT NULL,
      required                  boolean NOT NULL DEFAULT true,
      status                    varchar(16) NOT NULL DEFAULT 'missing'
                                   CHECK (status IN ('missing','received','verified','rejected','expired')),
      evidence_ref              varchar(256),
      evidence_hash             varchar(128),
      expiry_date               date,
      verification_result_id    varchar(64),
      created_at_utc            timestamptz NOT NULL DEFAULT now(),
      updated_at_utc            timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_kyc1_checklist_item_checklist_item_id ON kyc1.document_checklist_item (checklist_item_id);
    CREATE INDEX idx_kyc1_checklist_item_case_id_status ON kyc1.document_checklist_item (case_id, status);
    -- At most one checklist row per (case_id, document_type) — the evidence route's own
    -- update-or-insert logic (lib/kyc-case.ts) relies on this to decide which branch to take.
    CREATE UNIQUE INDEX idx_kyc1_checklist_item_case_document_type ON kyc1.document_checklist_item (case_id, document_type);

    -- verification_result — append-only manual/registry verification findings. payload_hash is
    -- computed server-side (fingerprint of the structured, non-free-text result payload) — never a
    -- caller-supplied value, so it is genuine tamper-evidence, not a decorative column.
    CREATE TABLE kyc1.verification_result (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      verification_result_id    varchar(64) NOT NULL UNIQUE,
      case_id                   varchar(64) NOT NULL REFERENCES kyc1.kyc_case (case_id),
      checklist_item_id         varchar(64),
      source_type               varchar(16) NOT NULL
                                   CHECK (source_type IN ('manual','registry')),
      source_id                 varchar(64) NOT NULL,
      result_type               varchar(24) NOT NULL
                                   CHECK (result_type IN ('document','identity','entity')),
      result_status              varchar(16) NOT NULL
                                   CHECK (result_status IN ('pass','fail')),
      payload_hash               varchar(128) NOT NULL,
      received_at_utc            timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_kyc1_verification_result_id ON kyc1.verification_result (verification_result_id);
    CREATE INDEX idx_kyc1_verification_result_case_type_status ON kyc1.verification_result (case_id, result_type, result_status);

    -- cdd_outcome — APPEND-VERSIONED, never updated in place (blueprint Database Design §1 rule 2
    -- "CDD outcome is append-versioned"; mirrors AML-01's own screening_result immutability
    -- posture). outcome_reason is a bounded, ENGINE-GENERATED reason CODE (e.g.
    -- 'all_required_checks_passed'), never operator-typed free text — this structurally guarantees
    -- "no free text in audit payloads" rather than relying on redaction discipline alone.
    -- verification_scope/evidence_refs are jsonb but hold ONLY booleans/IDs — no name, no PII, no
    -- free text — enforced by lib/outcome-engine.ts's own pure construction, swept by the audit/PII
    -- integration tests.
    CREATE TABLE kyc1.cdd_outcome (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      outcome_id                varchar(64) NOT NULL UNIQUE,
      case_id                   varchar(64) NOT NULL REFERENCES kyc1.kyc_case (case_id),
      outcome_status             varchar(24) NOT NULL
                                   CHECK (outcome_status IN ('pending','pass','fail','remediation_required')),
      outcome_reason             varchar(64) NOT NULL,
      verification_scope        jsonb NOT NULL,
      evidence_refs               jsonb NOT NULL,
      outcome_version            int NOT NULL DEFAULT 1,
      payload_hash                varchar(128) NOT NULL,
      created_at_utc              timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_kyc1_cdd_outcome_outcome_id ON kyc1.cdd_outcome (outcome_id);
    CREATE INDEX idx_kyc1_cdd_outcome_case_status_version ON kyc1.cdd_outcome (case_id, outcome_status, outcome_version);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS kyc1.cdd_outcome;
    DROP TABLE IF EXISTS kyc1.verification_result;
    DROP TABLE IF EXISTS kyc1.document_checklist_item;
    DROP TABLE IF EXISTS kyc1.kyc_case;
    DROP SCHEMA IF EXISTS kyc1;
  `);
};
